import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

// Initialize Stripe
const stripe = new Stripe(
  functions.config().stripe?.secret_key || 
  process.env.STRIPE_SECRET_KEY || 
  '6vdDjDvHMDOxFH2CYaDWJwWfVcaHJgqqx8CJk44rmq7VSPPInYXXQph6jhk21LEOb00LiJMkrpT',
  { apiVersion: '2024-12-18.acacia' as any }
);

const db = admin.firestore();

// Create checkout session
export const createCheckoutSession = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Devi essere autenticato per creare una sessione di pagamento'
    );
  }

  const { priceId, successUrl, cancelUrl, planType, userEmail } = data;
  const userId = context.auth.uid;

  try {
    // Check if customer exists
    let customerId: string | undefined;
    const userDoc = await db.doc(`users/${userId}`).get();
    
    if (userDoc.exists && userDoc.data()?.stripeCustomerId) {
      customerId = userDoc.data()?.stripeCustomerId;
    } else {
      // Create new customer
      const customer = await stripe.customers.create({
        email: userEmail || context.auth.token.email,
        metadata: {
          firebaseUID: userId,
        },
      });
      customerId = customer.id;
      
      // Save customer ID
      await db.doc(`users/${userId}`).set(
        { stripeCustomerId: customerId },
        { merge: true }
      );
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer: customerId,
      metadata: {
        firebaseUID: userId,
        planType: planType,
      },
      subscription_data: {
        metadata: {
          firebaseUID: userId,
          planType: planType,
        },
      },
    });

    return { sessionId: session.id };
  } catch (error: any) {
    console.error('Errore creazione checkout session:', error);
    throw new functions.https.HttpsError(
      'internal',
      `Errore creazione sessione di pagamento: ${error.message}`
    );
  }
});

// Create customer portal session
export const createPortalSession = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Devi essere autenticato per accedere al portale'
    );
  }

  const { returnUrl } = data;
  const userId = context.auth.uid;

  try {
    // Get customer ID
    const userDoc = await db.doc(`users/${userId}`).get();
    const customerId = userDoc.data()?.stripeCustomerId;

    if (!customerId) {
      throw new functions.https.HttpsError(
        'not-found',
        'Customer non trovato'
      );
    }

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  } catch (error: any) {
    console.error('Errore creazione portal session:', error);
    throw new functions.https.HttpsError(
      'internal',
      `Errore creazione portale: ${error.message}`
    );
  }
});

// Webhook handler for Stripe events
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = functions.config().stripe?.webhook_secret || 
    process.env.STRIPE_WEBHOOK_SECRET ||
    'whsec_test_secret';

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
        
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
        
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
        
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  } catch (error) {
    console.error('Error handling webhook event:', error);
    res.status(500).send('Webhook handler error');
    return;
  }

  res.json({ received: true });
});

// Handle successful checkout
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.firebaseUID;
  const planType = session.metadata?.planType;
  
  if (!userId || !planType) {
    console.error('Missing metadata in checkout session');
    return;
  }

  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  
  // Save subscription to Firestore
  await db.doc(`users/${userId}/subscription/current`).set({
    plan: planType,
    active: true,
    expiresAt: null,
    stripeCustomerId: session.customer as string,
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Subscription created for user ${userId} - Plan: ${planType}`);
}

// Handle subscription updates
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.firebaseUID;
  
  if (!userId) {
    console.error('Missing userId in subscription metadata');
    return;
  }

  await db.doc(`users/${userId}/subscription/current`).update({
    active: subscription.status === 'active',
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Subscription updated for user ${userId}`);
}

// Handle subscription cancellation
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.firebaseUID;
  
  if (!userId) {
    console.error('Missing userId in subscription metadata');
    return;
  }

  await db.doc(`users/${userId}/subscription/current`).update({
    active: false,
    expiresAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Subscription cancelled for user ${userId}`);
}

// Handle successful payment
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;
  
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = subscription.metadata?.firebaseUID;
  
  if (!userId) return;

  await db.doc(`users/${userId}/subscription/current`).update({
    active: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Payment succeeded for user ${userId}`);
}

// Handle failed payment
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;
  
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = subscription.metadata?.firebaseUID;
  
  if (!userId) return;

  // Mark subscription as inactive after payment failure
  await db.doc(`users/${userId}/subscription/current`).update({
    active: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Payment failed for user ${userId}`);
}