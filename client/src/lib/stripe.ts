import { loadStripe } from '@stripe/stripe-js';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { PlanType } from '@shared/subscription-schema';

// Initialize Stripe with publishable key
const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLIC_KEY || 
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 
  'pk_test_51OODKjEfHcSzngQqGiPqHsQGHSKWJTPxAJFp7PKB9Xt2hgCo1YQJiqjPXUHo9hGGLRzKzpG9pRoVWLi0VxDQSRTL009AzrNdBN'
);

export interface CreateCheckoutSessionData {
  successUrl: string;
  cancelUrl: string;
  userId: string;
  userEmail: string;
  planType: PlanType;
}

export interface CreatePortalSessionData {
  returnUrl: string;
}

// Create checkout session for subscription
export async function createCheckoutSession(data: CreateCheckoutSessionData) {
  try {
    const createCheckoutSessionFunc = httpsCallable<CreateCheckoutSessionData, { sessionId: string }>(
      functions, 
      'createCheckoutSession'
    );
    
    const result = await createCheckoutSessionFunc(data);
    const stripe = await stripePromise;
    
    if (!stripe) {
      throw new Error('Stripe non disponibile');
    }
    
    // Redirect to Stripe Checkout
    const { error } = await stripe.redirectToCheckout({
      sessionId: result.data.sessionId,
    });
    
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Errore creazione checkout session:', error);
    throw error;
  }
}

// Create customer portal session for managing subscription
export async function createPortalSession(data: CreatePortalSessionData) {
  try {
    const createPortalSessionFunc = httpsCallable<CreatePortalSessionData, { url: string }>(
      functions,
      'createPortalSession'
    );
    
    const result = await createPortalSessionFunc(data);
    
    // Redirect to Stripe Customer Portal
    window.location.href = result.data.url;
  } catch (error) {
    console.error('Errore creazione portal session:', error);
    throw error;
  }
}

// Get Stripe instance for other operations
export { stripePromise };