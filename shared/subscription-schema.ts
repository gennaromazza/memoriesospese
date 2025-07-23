// Subscription types and interfaces for Memorie Sospese

export type PlanType = 'free' | 'starter' | 'pro' | 'premium';

export interface SubscriptionPlan {
  id: PlanType;
  name: string;
  price: number;
  priceId?: string; // Stripe price ID
  features: PlanFeatures;
}

export interface PlanFeatures {
  galleryLimit: number | 'unlimited';
  maxPhotos: number | 'unlimited';
  voiceMemo: boolean;
  likes: boolean;
  comments: boolean;
  downloadZip: boolean;
  watermarkEnabled: boolean;
  domainCustom: boolean;
  leadsExport: boolean;
  storageLimitGB?: number | 'unlimited';
}

export interface UserSubscription {
  plan: PlanType;
  active: boolean;
  expiresAt: Date | null;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const SUBSCRIPTION_PLANS: Record<PlanType, SubscriptionPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    features: {
      galleryLimit: 2,
      maxPhotos: 10,
      voiceMemo: true,
      likes: false,
      comments: false,
      downloadZip: false,
      watermarkEnabled: false,
      domainCustom: false,
      leadsExport: false,
    }
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 10,
    priceId: 'price_1QQqKjEfHcSzngQqB4kFGXvH', // Produzione, test gestiti in functions
    features: {
      galleryLimit: 5,
      maxPhotos: 5000,
      voiceMemo: true,
      likes: true,
      comments: true,
      downloadZip: false,
      watermarkEnabled: true,
      domainCustom: false,
      leadsExport: true,
    }
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 20,
    priceId: 'price_1QQqLMEfHcSzngQqnzQHXN5w', // Produzione, test gestiti in functions
    features: {
      galleryLimit: 'unlimited',
      maxPhotos: 25000,
      voiceMemo: true,
      likes: true,
      comments: true,
      downloadZip: false,
      watermarkEnabled: true,
      domainCustom: true,
      leadsExport: true,
    }
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price: 40,
    priceId: 'price_1QQqLlEfHcSzngQqIhKT9Wvs', // Produzione, test gestiti in functions
    features: {
      galleryLimit: 'unlimited',
      maxPhotos: 'unlimited',
      voiceMemo: true,
      likes: true,
      comments: true,
      downloadZip: true,
      watermarkEnabled: true,
      domainCustom: true,
      leadsExport: true,
      storageLimitGB: 1000, // 1TB fair use
    }
  }
};

export interface StudioDomain {
  domain: string;
  userId: string;
  status: 'pending' | 'active' | 'error';
  createdAt: Date;
  updatedAt: Date;
  dnsInstructions?: string;
}