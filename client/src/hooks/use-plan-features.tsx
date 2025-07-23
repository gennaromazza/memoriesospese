import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { SUBSCRIPTION_PLANS, type PlanType, type PlanFeatures, type UserSubscription } from '@shared/subscription-schema';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';

export function usePlanFeatures() {
  const { user } = useFirebaseAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [features, setFeatures] = useState<PlanFeatures>(SUBSCRIPTION_PLANS.free.features);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setFeatures(SUBSCRIPTION_PLANS.free.features);
      setLoading(false);
      return;
    }

    // Listen to subscription changes in real-time
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'subscription', 'current'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as UserSubscription;
          setSubscription(data);
          
          // Get features based on active subscription
          if (data.active && data.plan) {
            const plan = SUBSCRIPTION_PLANS[data.plan];
            setFeatures(plan.features);
          } else {
            // Default to free plan if no active subscription
            setFeatures(SUBSCRIPTION_PLANS.free.features);
          }
        } else {
          // No subscription document, default to free
          setSubscription({
            plan: 'free',
            active: true,
            expiresAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          setFeatures(SUBSCRIPTION_PLANS.free.features);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Errore caricamento subscription:', error);
        setFeatures(SUBSCRIPTION_PLANS.free.features);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  return {
    subscription,
    features,
    loading,
    planType: subscription?.plan || 'free' as PlanType,
    isActive: subscription?.active ?? true,
  };
}

// Hook to check if a specific feature is available
export function useFeatureAccess(feature: keyof PlanFeatures) {
  const { features } = usePlanFeatures();
  return features[feature];
}

// Hook to check gallery count against limit
export function useGalleryLimit() {
  const { features } = usePlanFeatures();
  const { user } = useFirebaseAuth();
  const [galleryCount, setGalleryCount] = useState(0);
  const [canCreateGallery, setCanCreateGallery] = useState(true);

  useEffect(() => {
    if (!user) {
      setCanCreateGallery(false);
      return;
    }

    // Count galleries for this user
    const loadGalleryCount = async () => {
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const q = query(collection(db, 'galleries'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      const count = snapshot.size;
      setGalleryCount(count);

      // Check if can create more galleries
      if (features.galleryLimit === 'unlimited') {
        setCanCreateGallery(true);
      } else {
        setCanCreateGallery(count < features.galleryLimit);
      }
    };

    loadGalleryCount();
  }, [user, features.galleryLimit]);

  return {
    galleryCount,
    galleryLimit: features.galleryLimit,
    canCreateGallery,
    remainingGalleries: features.galleryLimit === 'unlimited' 
      ? 'unlimited' 
      : Math.max(0, features.galleryLimit - galleryCount),
  };
}

// Hook to check photo count against limit
export function usePhotoLimit(galleryId?: string) {
  const { features } = usePlanFeatures();
  const { user } = useFirebaseAuth();
  const [photoCount, setPhotoCount] = useState(0);
  const [canUploadPhotos, setCanUploadPhotos] = useState(true);

  useEffect(() => {
    if (!user) {
      setCanUploadPhotos(false);
      return;
    }

    // Count all photos for this user (dual-collection support)
    const loadPhotoCount = async () => {
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      
      try {
        // Count photos from main 'photos' collection (new system)
        const photosQuery = query(collection(db, 'photos'), where('userId', '==', user.uid));
        const photosSnapshot = await getDocs(photosQuery);
        let totalCount = photosSnapshot.size;

        // Get all user galleries for legacy photo counting
        const galleriesQuery = query(collection(db, 'galleries'), where('userId', '==', user.uid));
        const galleriesSnapshot = await getDocs(galleriesQuery);
        
        // Count legacy photos in each gallery subcollection
        for (const galleryDoc of galleriesSnapshot.docs) {
          const legacyPhotosQuery = query(
            collection(db, `galleries/${galleryDoc.id}/photos`),
            where('uploadedBy', '==', 'admin') // Count only admin photos
          );
          const legacyPhotosSnapshot = await getDocs(legacyPhotosQuery);
          totalCount += legacyPhotosSnapshot.size;
        }

        console.log(`📊 Photo count for user ${user.uid}: ${totalCount} (new: ${photosSnapshot.size}, legacy: ${totalCount - photosSnapshot.size})`);
        
        setPhotoCount(totalCount);

        // Check if can upload more photos
        if (features.maxPhotos === 'unlimited') {
          setCanUploadPhotos(true);
        } else {
          setCanUploadPhotos(totalCount < features.maxPhotos);
        }
      } catch (error) {
        console.error('Error loading photo count:', error);
        // Fallback: use only new collection count
        const photosQuery = query(collection(db, 'photos'), where('userId', '==', user.uid));
        const photosSnapshot = await getDocs(photosQuery);
        const fallbackCount = photosSnapshot.size;
        
        setPhotoCount(fallbackCount);
        setCanUploadPhotos(features.maxPhotos === 'unlimited' || fallbackCount < features.maxPhotos);
      }
    };

    loadPhotoCount();
  }, [user, features.maxPhotos, galleryId]);

  return {
    photoCount,
    photoLimit: features.maxPhotos,
    canUploadPhotos,
    remainingPhotos: features.maxPhotos === 'unlimited' 
      ? 'unlimited' 
      : Math.max(0, features.maxPhotos - photoCount),
  };
}