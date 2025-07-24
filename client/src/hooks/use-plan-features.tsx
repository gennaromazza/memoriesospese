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

    // Optimized photo counting for performance
    const loadPhotoCount = async () => {
      const { collection, query, where, getDocs, getCountFromServer } = await import('firebase/firestore');
      
      try {
        // Use count aggregations for better performance
        let totalCount = 0;

        // Count photos from main 'photos' collection (new system)
        const photosQuery = query(
          collection(db, 'photos'), 
          where('uploaderUid', '==', user.uid),
          where('uploadedBy', '==', 'admin') // Only admin photos count towards limit
        );
        const photosCountSnapshot = await getCountFromServer(photosQuery);
        totalCount += photosCountSnapshot.data().count;

        // Legacy support: Get user galleries and count admin photos
        // Use batched approach for better performance
        const galleriesQuery = query(collection(db, 'galleries'), where('userId', '==', user.uid));
        const galleriesSnapshot = await getDocs(galleriesQuery);
        
        if (galleriesSnapshot.size > 0) {
          // Batch count legacy photos from all galleries
          const galleryIds = galleriesSnapshot.docs.map(doc => doc.id);
          let legacyCount = 0;
          
          // Process galleries in chunks to avoid overwhelming Firebase
          const CHUNK_SIZE = 5;
          for (let i = 0; i < galleryIds.length; i += CHUNK_SIZE) {
            const chunk = galleryIds.slice(i, i + CHUNK_SIZE);
            const chunkCounts = await Promise.all(
              chunk.map(async (galleryId) => {
                try {
                  const legacyPhotosQuery = query(
                    collection(db, `galleries/${galleryId}/photos`),
                    where('uploadedBy', '==', 'admin')
                  );
                  const legacyCountSnapshot = await getCountFromServer(legacyPhotosQuery);
                  return legacyCountSnapshot.data().count;
                } catch (error) {
                  // Gallery subcollection might not exist
                  return 0;
                }
              })
            );
            legacyCount += chunkCounts.reduce((sum, count) => sum + count, 0);
          }
          
          totalCount += legacyCount;
        }

        console.log(`📊 Optimized photo count for user ${user.uid}: ${totalCount} photos`);
        
        setPhotoCount(totalCount);

        // Check if can upload more photos
        if (features.maxPhotos === 'unlimited') {
          setCanUploadPhotos(true);
        } else {
          setCanUploadPhotos(totalCount < features.maxPhotos);
        }
      } catch (error) {
        console.error('Error loading photo count:', error);
        // Fallback: simplified count from main collection only
        try {
          const photosQuery = query(collection(db, 'photos'), where('uploaderUid', '==', user.uid));
          const fallbackSnapshot = await getCountFromServer(photosQuery);
          const fallbackCount = fallbackSnapshot.data().count;
          
          setPhotoCount(fallbackCount);
          setCanUploadPhotos(features.maxPhotos === 'unlimited' || fallbackCount < features.maxPhotos);
        } catch (fallbackError) {
          console.error('Fallback photo count failed:', fallbackError);
          setPhotoCount(0);
          setCanUploadPhotos(true);
        }
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