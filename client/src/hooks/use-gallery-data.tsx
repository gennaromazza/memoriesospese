/**
 * useGalleryData - Hook per gestione galleria (REFACTORED)
 * 
 * REFACTOR CHANGES:
 * - ✅ Rimossa TUTTA la logica caricamento foto (delegata a useGalleryPhotos)
 * - ✅ Mantiene SOLO caricamento metadati galleria
 * - ✅ Stessa interfaccia pubblica (retrocompatibilità totale)
 * - ✅ Performance migliorate (no query duplicate)
 * - ✅ Tutti fallback legacy preservati
 */

import { useState, useEffect, useCallback } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { trackGalleryView } from "@/lib/analytics";
import { imageCache } from "@/lib/imageCache";
import { useGalleryPhotos } from "./useGalleryPhotos";

// Tipi dati 
export interface GalleryData {
  id: string;
  name: string;
  date: string;
  location: string;
  description?: string;
  coverImageUrl?: string;
  coverImageMobile?: string;
  coverImageDesktop?: string;
  youtubeUrl?: string;
  youtubeUrls?: string[];
  photoCount?: number;
  code?: string;
  active?: boolean;
  specialTheme?: string;
  specialPin?: string;
  
  // Photo Selection Mode
  selectionEnabled?: boolean;
  requiredPhotoCount?: number;
  selectionStatus?: 'pending' | 'completed';
  selectedPhotoIds?: string[];
  selectionDeadline?: any;
  selectionDeadlineEnforced?: boolean;
  bookingId?: string;
}

export interface PhotoData {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: any;
  galleryId?: string;
  uploadedBy?: string;
  uploaderName?: string;
  uploaderRole?: string;
  uploaderEmail?: string;
  uploaderUid?: string;
}

/**
 * Hook principale per gestione galleria
 * Carica metadati + delega foto a useGalleryPhotos
 */
export function useGalleryData(galleryCode: string) {
  const [gallery, setGallery] = useState<GalleryData | null>(null);
  const [isLoadingGallery, setIsLoadingGallery] = useState(true);
  const { toast } = useToast();

  // Carica metadati galleria
  useEffect(() => {
    setIsLoadingGallery(true);

    async function fetchGallery() {
      if (!galleryCode) {
        setIsLoadingGallery(false);
        return;
      }

      try {
        const galleriesRef = collection(db, "galleries");
        
        // Cerca prima per "code" (gallerie nuove)
        let q = query(galleriesRef, where("code", "==", galleryCode));
        let querySnapshot = await getDocs(q);
        
        let galleryDoc;
        let galleryData;
        
        // Se non trova per code, cerca per ID Firestore (gallerie vecchie)
        if (querySnapshot.empty) {
          const docRef = doc(db, "galleries", galleryCode);
          const docSnapshot = await getDoc(docRef);
          
          if (!docSnapshot.exists()) {
            toast({
              title: "Galleria non trovata",
              description: "La galleria richiesta non esiste o è stata rimossa.",
              variant: "destructive",
            });
            setIsLoadingGallery(false);
            return;
          }
          
          galleryDoc = docSnapshot;
          galleryData = docSnapshot.data();
        } else {
          galleryDoc = querySnapshot.docs[0];
          galleryData = galleryDoc.data();
        }
        
        // Check if gallery is active (default to true for backward compatibility)
        const isActive = galleryData.active !== undefined ? galleryData.active : true;
        
        // Check if user is admin
        const isAdmin = localStorage.getItem('isAdmin') === 'true';
        
        if (!isActive && !isAdmin) {
          toast({
            title: "Galleria non disponibile",
            description: "Questa galleria è temporaneamente non disponibile.",
            variant: "destructive",
          });
          setIsLoadingGallery(false);
          return;
        }
        
        setGallery({
          id: galleryDoc.id,
          name: galleryData.name,
          date: galleryData.date,
          location: galleryData.location,
          description: galleryData.description || "",
          coverImageUrl: galleryData.coverImageUrl || "",
          coverImageMobile: galleryData.coverImageMobile || "",
          coverImageDesktop: galleryData.coverImageDesktop || "",
          youtubeUrl: galleryData.youtubeUrl || "",
          youtubeUrls: galleryData.youtubeUrls || [],
          code: galleryData.code || galleryCode,
          active: isActive,
          specialTheme: galleryData.specialTheme || undefined,
          specialPin: galleryData.specialPin || undefined,
          photoCount: galleryData.photoCount || undefined,
          
          // Photo Selection Mode fields
          selectionEnabled: galleryData.selectionEnabled || false,
          requiredPhotoCount: galleryData.requiredPhotoCount || undefined,
          selectionStatus: galleryData.selectionStatus || 'pending',
          selectedPhotoIds: galleryData.selectedPhotoIds || [],
          selectionDeadline: galleryData.selectionDeadline || undefined,
          selectionDeadlineEnforced: galleryData.selectionDeadlineEnforced !== false,
          bookingId: galleryData.bookingId || undefined
        });
        
      } catch (error) {
        console.error('❌ Error loading gallery:', error);
        toast({
          title: "Errore",
          description: "Si è verificato un errore nel caricamento della galleria.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingGallery(false);
      }
    }

    fetchGallery();
  }, [galleryCode, toast]);

  // ✅ NUOVO: Delega caricamento foto a useGalleryPhotos
  const photoData = useGalleryPhotos(
    gallery?.id,
    gallery?.code || galleryCode,
    {
      pageSize: 200,
      autoLoadStorage: true,
      enablePagination: true
    }
  );

  // Traccia la visita alla galleria
  useEffect(() => {
    if (gallery) {
      trackGalleryView(gallery.id, gallery.name);
    }
  }, [gallery]);

  // Listener per eventi di refresh (compatibilità)
  useEffect(() => {
    const handleGalleryRefresh = async (event: CustomEvent) => {
      const { galleryId, type } = event.detail;
      
      if (!gallery || gallery.id !== galleryId) return;

      if (type === 'photos' || type === 'all') {
        // Delega refresh a useGalleryPhotos
        await photoData.refetch();
      }
    };

    window.addEventListener('galleryRefresh', handleGalleryRefresh as EventListener);
    
    return () => {
      window.removeEventListener('galleryRefresh', handleGalleryRefresh as EventListener);
    };
  }, [gallery, photoData]);

  // Listener per eventi di refresh automatico (compatibilità)
  useEffect(() => {
    const handleGalleryPhotosUpdated = () => {
      if (gallery) {
        photoData.refetch();
      }
    };

    window.addEventListener('galleryPhotosUpdated', handleGalleryPhotosUpdated);
    
    return () => {
      window.removeEventListener('galleryPhotosUpdated', handleGalleryPhotosUpdated);
    };
  }, [gallery, photoData]);

  // Wrapper loadMorePhotos per compatibilità interfaccia
  const loadMorePhotos = useCallback(async () => {
    if (!photoData.hasMore || photoData.isLoadingMore) return;
    
    await photoData.loadMorePhotos();
    
    // Preload solo delle prime 3 immagini per ottimizzare performance
    if (photoData.photos.length > 0) {
      const preloadUrls = photoData.photos.slice(0, 3).map(photo => photo.url);
      imageCache.preloadImages(preloadUrls);
    }
  }, [photoData]);

  // Funzione di refresh esplicita per l'uso esterno (compatibilità)
  const refreshPhotos = useCallback(async () => {
    if (!gallery) return;
    await photoData.refetch();
  }, [gallery, photoData]);

  // ✅ INTERFACCIA PUBBLICA: Stessa di prima (retrocompatibilità totale)
  return { 
    gallery, 
    
    // Foto delegate a useGalleryPhotos
    photos: photoData.photos,
    guestPhotos: photoData.guestPhotos,
    
    // Loading states
    isLoading: isLoadingGallery || photoData.isLoading,
    
    // Paginazione (compatibilità)
    hasMorePhotos: photoData.hasMore,
    loadingMorePhotos: photoData.isLoadingMore,
    loadMorePhotos,
    
    // Utility
    refreshPhotos,
    
    // Progress (compatibilità)
    totalPhotoCount: photoData.progress.total,
    loadedPhotoCount: photoData.progress.loaded,
    loadingProgress: photoData.progress.percentage
  };
}
