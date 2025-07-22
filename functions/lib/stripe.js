"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = exports.createPortalSession = exports.createCheckoutSession = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe_1 = require("stripe");
// Initialize Stripe with environment-based key
const stripeSecretKey = process.env.NODE_ENV === 'production'
    ? 'sk_live_51QcOtGJwWfVcaHJgqqx8CJk44rmq7VSPPInYXXQph6jhk21LEOb00LiJMkrpT' // TUA CHIAVE LIVE
    : 'sk_test_51OODKjEfHcSzngQqGiPqHsQGHSKWJTPxAJFp7PKB9Xt2hgCo1YQJiqjPXUHo9hGGLRzKzpG9pRoVWLi0VxDQSRTL00ABCD1234'; // Chiave test
const stripe = new stripe_1.default(stripeSecretKey, {
    apiVersion: '2025-06-30.basil'
});
// Price ID mapping - using production IDs but test Stripe keys for development
const PRICE_ID_MAPPING = {
    starter: 'price_1QQqKjEfHcSzngQqB4kFGXvH',
    pro: 'price_1QQqLMEfHcSzngQqnzQHXN5w',
    premium: 'price_1QQqLlEfHcSzngQqIhKT9Wvs'
};
// Helper function to get correct Price ID for environment
function getPriceId(planType) {
    const priceId = PRICE_ID_MAPPING[planType];
    console.log(`Getting Price ID for plan ${planType}:`, priceId);
    if (!priceId) {
        throw new functions.https.HttpsError('invalid-argument', `Price ID non trovato per il piano: ${planType}`);
    }
    return priceId;
}
const db = admin.firestore();
// Create checkout session
exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Devi essere autenticato per creare una sessione di pagamento');
    }
    const { successUrl, cancelUrl, planType, userEmail } = data;
    const userId = context.auth.uid;
    console.log('Creating checkout session for:', { planType, userId, userEmail });
    // Get correct Price ID for current environment
    const priceId = getPriceId(planType);
    console.log('Using Price ID:', priceId);
    try {
        // Check if customer exists
        let customerId;
        const userDoc = await db.doc(`users/${userId}`).get();
        if (userDoc.exists && ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.stripeCustomerId)) {
            customerId = (_b = userDoc.data()) === null || _b === void 0 ? void 0 : _b.stripeCustomerId;
        }
        else {
            // Create new customer
            const customer = await stripe.customers.create({
                email: userEmail || context.auth.token.email,
                metadata: {
                    firebaseUID: userId,
                },
            });
            customerId = customer.id;
            // Save customer ID
            await db.doc(`users/${userId}`).set({ stripeCustomerId: customerId }, { merge: true });
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
        console.log('Checkout session created successfully:', session.id);
        return { sessionId: session.id };
    }
    catch (error) {
        console.error('Errore creazione checkout session:', error);
        console.error('Error details:', {
            message: error.message,
            type: error.type,
            code: error.code,
            priceId,
            planType
        });
        throw new functions.https.HttpsError('internal', `Errore creazione sessione: ${error.message}`);
    }
});
// Create customer portal session
exports.createPortalSession = functions.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Devi essere autenticato per accedere al portale');
    }
    const { returnUrl } = data;
    const userId = context.auth.uid;
    try {
        // Get customer ID
        const userDoc = await db.doc(`users/${userId}`).get();
        const customerId = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.stripeCustomerId;
        if (!customerId) {
            throw new functions.https.HttpsError('not-found', 'Customer non trovato');
        }
        // Create portal session
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl,
        });
        return { url: session.url };
    }
    catch (error) {
        console.error('Errore creazione portal session:', error);
        throw new functions.https.HttpsError('internal', `Errore creazione portale: ${error.message}`);
    }
});
// Webhook handler for Stripe events
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    var _a;
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.NODE_ENV === 'production'
        ? (((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.webhook_secret) || process.env.STRIPE_WEBHOOK_SECRET)
        : 'whsec_test_1234567890abcdef'; // Webhook secret test
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    }
    catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    // Handle the event
    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutSessionCompleted(event.data.object);
                break;
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;
            case 'invoice.payment_succeeded':
                await handleInvoicePaymentSucceeded(event.data.object);
                break;
            case 'invoice.payment_failed':
                await handleInvoicePaymentFailed(event.data.object);
                break;
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
    }
    catch (error) {
        console.error('Error handling webhook event:', error);
        res.status(500).send('Webhook handler error');
        return;
    }
    res.json({ received: true });
});
// Handle successful checkout
async function handleCheckoutSessionCompleted(session) {
    var _a, _b;
    const userId = (_a = session.metadata) === null || _a === void 0 ? void 0 : _a.firebaseUID;
    const planType = (_b = session.metadata) === null || _b === void 0 ? void 0 : _b.planType;
    if (!userId || !planType) {
        console.error('Missing metadata in checkout session');
        return;
    }
    // Get subscription details
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    // Save subscription to Firestore
    await db.doc(`users/${userId}/subscription/current`).set({
        plan: planType,
        active: true,
        expiresAt: null,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Subscription created for user ${userId} - Plan: ${planType}`);
}
// Handle subscription updates
async function handleSubscriptionUpdated(subscription) {
    var _a;
    const userId = (_a = subscription.metadata) === null || _a === void 0 ? void 0 : _a.firebaseUID;
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
async function handleSubscriptionDeleted(subscription) {
    var _a;
    const userId = (_a = subscription.metadata) === null || _a === void 0 ? void 0 : _a.firebaseUID;
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
async function handleInvoicePaymentSucceeded(invoice) {
    var _a;
    const subscriptionId = invoice.subscription;
    if (!subscriptionId)
        return;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId = (_a = subscription.metadata) === null || _a === void 0 ? void 0 : _a.firebaseUID;
    if (!userId)
        return;
    await db.doc(`users/${userId}/subscription/current`).update({
        active: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Payment succeeded for user ${userId}`);
}
// Handle failed payment
async function handleInvoicePaymentFailed(invoice) {
    var _a;
    const subscriptionId = invoice.subscription;
    if (!subscriptionId)
        return;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId = (_a = subscription.metadata) === null || _a === void 0 ? void 0 : _a.firebaseUID;
    if (!userId)
        return;
    // Mark subscription as inactive after payment failure
    await db.doc(`users/${userId}/subscription/current`).update({
        active: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Payment failed for user ${userId}`);
}
//# sourceMappingURL=stripe.js.map