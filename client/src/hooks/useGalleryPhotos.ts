/**
 * useGalleryPhotos - Hook centralizzato per gestione foto gallerie
 * 
 * RESPONSABILITÀ:
 * - Query primaria su photos collection (galleryId filter)
 * - Fallback su galleries/{id}/photos legacy subcollection
 * - Fallback Storage con cache (evita listAll ripetuti)
 * - Paginazione incrementale con startAfter
 * - Deduplicazione per filename
 * - Separazione admin/guest/legacy photos
 * - React Query per caching ottimizzato
 * 
 * GARANZIE:
 * - ✅ Retrocompatibilità totale
 * - ✅ Tutti i fallback legacy mantenuti
 * - ✅ Nessuna modifica struttura Firestore
 * - ✅ Nessuna cancellazione dati
 * - ✅ Storage paths invariati
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  limit,
  startAfter as firestoreStartAfter,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

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

interface UseGalleryPhotosOptions {
  pageSize?: number;
  autoLoadStorage?: boolean;
  enablePagination?: boolean;
}

interface UseGalleryPhotosReturn {
  // Foto separate per tipo
  photos: PhotoData[];
  guestPhotos: PhotoData[];
  legacyPhotos: PhotoData[];
  allPhotos: PhotoData[]; // Tutte le foto combinate
  
  // Paginazione
  loadMorePhotos: () => Promise<void>;
  hasMore: boolean;
  
  // Stati
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  
  // Progress
  progress: {
    loaded: number;
    total: number;
    percentage: number;
  };
  
  // Utility
  refetch: () => Promise<void>;
}

/**
 * Hook centralizzato per caricamento foto galleria
 */
export function useGalleryPhotos(
  galleryId: string | null | undefined,
  galleryCode?: string,
  options: UseGalleryPhotosOptions = {}
): UseGalleryPhotosReturn {
  const {
    pageSize = 200,
    autoLoadStorage = true,
    enablePagination = true
  } = options;

  const queryClient = useQueryClient();
  
  // Stati locali
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [guestPhotos, setGuestPhotos] = useState<PhotoData[]>([]);
  const [legacyPhotos, setLegacyPhotos] = useState<PhotoData[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  
  // Cache per evitare Storage listAll ripetuto
  const storageCheckedRef = useRef(false);
  const storagePhotosRef = useRef<PhotoData[]>([]);

  /**
   * FASE 1: Query primaria su photos collection
   */
  const { data: primaryPhotos, isLoading, error, refetch } = useQuery({
    queryKey: ['gallery-photos-primary', galleryId, pageSize],
    queryFn: async () => {
      if (!galleryId) return [];
      
      console.log(`📸 Loading primary photos for gallery: ${galleryId}`);
      
      const photosRef = collection(db, 'photos');
      const q = query(
        photosRef,
        where('galleryId', '==', galleryId),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );
      
      const snapshot = await getDocs(q);
      
      // Salva ultimo documento per paginazione
      if (snapshot.docs.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }
      
      setHasMore(snapshot.docs.length >= pageSize);
      
      const photosList: PhotoData[] = [];
      const seen = new Set<string>();
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const photoName = data.name || '';
        
        // Deduplicazione per filename
        if (!seen.has(photoName)) {
          seen.add(photoName);
          
          photosList.push({
            id: docSnap.id,
            name: photoName,
            url: data.url || '',
            contentType: data.contentType || 'image/jpeg',
            size: data.size || 0,
            createdAt: data.createdAt,
            galleryId: data.galleryId,
            uploadedBy: data.uploadedBy || 'admin',
            uploaderName: data.uploaderName,
            uploaderRole: data.uploaderRole,
            uploaderEmail: data.uploaderEmail,
            uploaderUid: data.uploaderUid
          });
        }
      });
      
      console.log(`✅ Loaded ${photosList.length} primary photos`);
      return photosList;
    },
    enabled: !!galleryId,
    staleTime: 1000 * 60 * 5, // Cache 5 minuti
    gcTime: 1000 * 60 * 30 // Keep in cache 30 minuti
  });

  /**
   * FASE 2: Fallback - Legacy galleries/{id}/photos subcollection
   */
  const { data: legacyGuestPhotos } = useQuery({
    queryKey: ['gallery-photos-legacy', galleryId],
    queryFn: async () => {
      if (!galleryId) return [];
      
      console.log(`🗂️ Checking legacy subcollection for gallery: ${galleryId}`);
      
      try {
        const legacyRef = collection(db, 'galleries', galleryId, 'photos');
        const snapshot = await getDocs(legacyRef);
        
        const legacyList: PhotoData[] = [];
        const seen = new Set<string>();
        
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const photoName = data.name || '';
          const photoUrl = data.url || '';
          
          if (!seen.has(photoName)) {
            seen.add(photoName);
            
            // Determina se è foto guest
            const isGuest = photoUrl.includes('/guests/') ||
                           photoUrl.includes('guest-') ||
                           data.uploadedBy === 'guest' ||
                           data.uploaderRole === 'guest';
            
            legacyList.push({
              id: `legacy-${docSnap.id}`,
              name: photoName,
              url: photoUrl,
              contentType: data.contentType || 'image/jpeg',
              size: data.size || 0,
              createdAt: data.createdAt || new Date(),
              galleryId,
              uploadedBy: isGuest ? 'guest' : 'legacy',
              uploaderName: data.uploaderName || (isGuest ? 'Ospite Legacy' : 'Admin Legacy'),
              uploaderEmail: data.uploaderEmail || (isGuest ? 'guest@legacy' : 'admin@legacy'),
              uploaderRole: isGuest ? 'guest' : 'admin'
            });
          }
        });
        
        console.log(`✅ Found ${legacyList.length} legacy photos`);
        return legacyList;
      } catch (error) {
        console.warn('⚠️ No legacy photos found (normal for new galleries):', error);
        return [];
      }
    },
    enabled: !!galleryId,
    staleTime: 1000 * 60 * 10 // Cache 10 minuti (legacy non cambia spesso)
  });

  /**
   * FASE 3: Fallback - Storage listAll (con cache)
   */
  const loadFromStorage = useCallback(async () => {
    if (!galleryId || !galleryCode || storageCheckedRef.current || !autoLoadStorage) {
      return [];
    }
    
    console.log(`☁️ Checking Storage for gallery: ${galleryId}`);
    storageCheckedRef.current = true;
    
    try {
      const { ref, listAll, getDownloadURL, getMetadata } = await import('firebase/storage');
      const { storage } = await import('@/lib/firebase');
      
      // Percorsi possibili (retrocompatibilità)
      const possiblePaths = [
        `gallery-photos/${galleryId}`,
        `gallery-photos/${String(galleryId).toLowerCase()}`,
        `gallery-photos/${String(galleryId).toUpperCase()}`,
        `gallery-photos/${galleryCode}`,
        `gallery-photos/${String(galleryCode).toLowerCase()}`
      ];
      
      let allItems: any[] = [];
      
      // Prova tutti i percorsi
      for (const path of possiblePaths) {
        if (allItems.length > 0) break;
        
        try {
          const pathRef = ref(storage, path);
          const result = await listAll(pathRef);
          
          if (result.items.length > 0) {
            console.log(`✅ Found Storage path: ${path}`);
            allItems = [...result.items];
            
            // Check sottocartelle
            for (const prefix of result.prefixes) {
              try {
                const subResult = await listAll(prefix);
                allItems = [...allItems, ...subResult.items];
              } catch (subErr) {
                console.warn('⚠️ Subdir error:', subErr);
              }
            }
            break;
          }
        } catch (e) {
          // Path non esiste, continua
        }
      }
      
      if (allItems.length === 0) {
        console.log('ℹ️ No Storage photos found');
        return [];
      }
      
      setTotalCount(allItems.length);
      
      // Carica metadata in batch
      const BATCH_SIZE = 10;
      const storagePhotos: PhotoData[] = [];
      
      for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
        const batch = allItems.slice(i, i + BATCH_SIZE);
        
        const batchData = await Promise.all(
          batch.map(async (itemRef) => {
            try {
              const url = await getDownloadURL(itemRef);
              const metadata = await getMetadata(itemRef);
              
              return {
                id: `storage-${itemRef.name}`,
                name: itemRef.name,
                url,
                contentType: metadata.contentType || 'image/jpeg',
                size: metadata.size || 0,
                createdAt: metadata.timeCreated ? new Date(metadata.timeCreated) : new Date(),
                galleryId
              };
            } catch (err) {
              console.warn(`⚠️ Failed to load: ${itemRef.name}`, err);
              return null;
            }
          })
        );
        
        storagePhotos.push(...batchData.filter(Boolean) as PhotoData[]);
      }
      
      // Ordina per data
      storagePhotos.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      // Salva in cache locale
      storagePhotosRef.current = storagePhotos;
      
      // Sincronizza con Firestore (inserisce solo foto mancanti)
      try {
        for (const photo of storagePhotos) {
          const existingQuery = query(
            collection(db, 'photos'),
            where('galleryId', '==', galleryId),
            where('url', '==', photo.url)
          );
          const existing = await getDocs(existingQuery);
          
          if (existing.empty) {
            await addDoc(collection(db, 'photos'), {
              ...photo,
              createdAt: serverTimestamp(),
              uploadedBy: 'admin',
              uploaderName: 'Fotografo',
              uploaderEmail: 'admin@legacy'
            });
          }
        }
        
        // Aggiorna photoCount
        await updateDoc(doc(db, 'galleries', galleryId), {
          photoCount: storagePhotos.length,
          updatedAt: serverTimestamp()
        });
        
        console.log(`✅ Synced ${storagePhotos.length} Storage photos to Firestore`);
      } catch (dbError) {
        console.warn('⚠️ Storage sync error:', dbError);
      }
      
      return storagePhotos;
    } catch (error) {
      console.error('❌ Storage fallback error:', error);
      return [];
    }
  }, [galleryId, galleryCode, autoLoadStorage]);

  /**
   * Paginazione - Carica più foto
   */
  const loadMorePhotos = useCallback(async () => {
    if (!galleryId || !hasMore || isLoadingMore || !enablePagination || !lastDoc) {
      return;
    }
    
    setIsLoadingMore(true);
    
    try {
      console.log('📄 Loading more photos...');
      
      const photosRef = collection(db, 'photos');
      const q = query(
        photosRef,
        where('galleryId', '==', galleryId),
        orderBy('createdAt', 'desc'),
        firestoreStartAfter(lastDoc),
        limit(pageSize)
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.docs.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        
        const newPhotos: PhotoData[] = [];
        const existingNames = new Set(photos.map(p => p.name));
        
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const photoName = data.name || '';
          
          // Evita duplicati
          if (!existingNames.has(photoName)) {
            newPhotos.push({
              id: docSnap.id,
              name: photoName,
              url: data.url || '',
              contentType: data.contentType || 'image/jpeg',
              size: data.size || 0,
              createdAt: data.createdAt,
              galleryId: data.galleryId,
              uploadedBy: data.uploadedBy || 'admin',
              uploaderName: data.uploaderName,
              uploaderRole: data.uploaderRole,
              uploaderEmail: data.uploaderEmail,
              uploaderUid: data.uploaderUid
            });
          }
        });
        
        setPhotos(prev => [...prev, ...newPhotos]);
        setHasMore(snapshot.docs.length >= pageSize);
        
        console.log(`✅ Loaded ${newPhotos.length} more photos`);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('❌ Load more error:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [galleryId, hasMore, isLoadingMore, enablePagination, lastDoc, pageSize, photos]);

  /**
   * Effect: Organizza foto per tipo quando i dati cambiano
   */
  useEffect(() => {
    if (!primaryPhotos) return;
    
    const adminPhotos: PhotoData[] = [];
    const guestsPhotos: PhotoData[] = [];
    const seen = new Set<string>();
    
    // Processa foto primarie
    primaryPhotos.forEach(photo => {
      if (!seen.has(photo.name)) {
        seen.add(photo.name);
        
        if (photo.uploadedBy === 'guest') {
          guestsPhotos.push(photo);
        } else {
          adminPhotos.push(photo);
        }
      }
    });
    
    // Aggiungi foto legacy (già deduplicate)
    const legacyList: PhotoData[] = [];
    (legacyGuestPhotos || []).forEach(photo => {
      if (!seen.has(photo.name)) {
        seen.add(photo.name);
        
        if (photo.uploadedBy === 'guest' || photo.uploaderRole === 'guest') {
          guestsPhotos.push(photo);
        } else {
          legacyList.push(photo);
        }
      }
    });
    
    setPhotos(adminPhotos);
    setGuestPhotos(guestsPhotos);
    setLegacyPhotos(legacyList);
    
  }, [primaryPhotos, legacyGuestPhotos]);

  /**
   * Effect: Carica da Storage se necessario
   */
  useEffect(() => {
    if (!galleryId || !autoLoadStorage) return;
    
    // Carica Storage solo se poche foto in Firestore
    if (primaryPhotos && primaryPhotos.length < 10) {
      loadFromStorage().then(storagePhotos => {
        if (storagePhotos.length > 0) {
          // Re-fetch primarie dopo sync
          refetch();
        }
      });
    }
  }, [galleryId, primaryPhotos, autoLoadStorage, loadFromStorage, refetch]);

  // Calcola totale e progress
  const allPhotos = [...photos, ...guestPhotos, ...legacyPhotos];
  const loaded = allPhotos.length;
  const total = totalCount || loaded;
  const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;

  return {
    photos,
    guestPhotos,
    legacyPhotos,
    allPhotos,
    
    loadMorePhotos,
    hasMore,
    
    isLoading,
    isLoadingMore,
    error: error as Error | null,
    
    progress: {
      loaded,
      total,
      percentage
    },
    
    refetch: async () => {
      await refetch();
      storageCheckedRef.current = false; // Reset cache Storage se necessario
    }
  };
}
