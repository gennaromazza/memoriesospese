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
    // In development, if Firebase Functions are not available, simulate success
    if (import.meta.env.DEV) {
      console.log('Development mode: Simulating Stripe checkout for plan:', data.planType);
      
      // Simulate a brief loading time for realistic UX
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Create success URL with parameters
      const successUrl = new URL(data.successUrl);
      successUrl.searchParams.set('success', 'true');
      successUrl.searchParams.set('plan', data.planType);
      successUrl.searchParams.set('session_id', `sim_${Date.now()}`);
      
      // Redirect to success URL
      window.location.href = successUrl.toString();
      return;
    }

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
    
    // Fallback for development: simulate successful checkout
    if (import.meta.env.DEV) {
      console.log('Fallback: Simulating successful checkout for testing');
      
      // Create success URL with parameters
      const successUrl = new URL(data.successUrl);
      successUrl.searchParams.set('success', 'true');
      successUrl.searchParams.set('plan', data.planType);
      successUrl.searchParams.set('session_id', `fallback_${Date.now()}`);
      
      window.location.href = successUrl.toString();
      return;
    }
    
    throw error;
  }
}

// Create customer portal session for managing subscription
export async function createPortalSession(data: CreatePortalSessionData) {
  try {
    // In development, simulate portal redirect
    if (import.meta.env.DEV) {
      console.log('Development mode: Simulating Stripe Customer Portal');
      alert('Modalità sviluppo: Portal Stripe simulato. In produzione questo aprirebbe il portale di gestione abbonamento.');
      return;
    }

    const createPortalSessionFunc = httpsCallable<CreatePortalSessionData, { url: string }>(
      functions,
      'createPortalSession'
    );
    
    const result = await createPortalSessionFunc(data);
    
    // Redirect to Stripe Customer Portal
    window.location.href = result.data.url;
  } catch (error) {
    console.error('Errore creazione portal session:', error);
    
    // Fallback for development
    if (import.meta.env.DEV) {
      console.log('Fallback: Simulating customer portal for testing');
      alert('Modalità sviluppo: Simulazione portal cliente. Funzionalità disponibile in produzione.');
      return;
    }
    
    throw error;
  }
}

// Get Stripe instance for other operations
export { stripePromise };