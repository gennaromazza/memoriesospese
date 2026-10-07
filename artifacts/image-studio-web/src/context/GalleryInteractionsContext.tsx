import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';

export interface PhotoInteractionStats {
  likesCount: number;
  commentsCount: number;
  hasUserLiked: boolean;
}

interface GalleryInteractionsContextValue {
  isReady: boolean;
  isLoading: boolean;
  getStats: (photoId: string) => PhotoInteractionStats;
  applyLikeDelta: (photoId: string, isNowLiked: boolean) => void;
  applyCommentDelta: (photoId: string, delta: number) => void;
  refresh: () => Promise<void>;
}

const GalleryInteractionsContext = createContext<GalleryInteractionsContextValue | null>(null);

const EMPTY_STATS: PhotoInteractionStats = {
  likesCount: 0,
  commentsCount: 0,
  hasUserLiked: false,
};

interface ProviderProps {
  galleryId: string;
  photoIds: string[];
  children: ReactNode;
  enabled?: boolean;
}

/**
 * Pre-carica likes e commenti per TUTTE le foto di una galleria con poche query
 * batch invece di 3 query per ogni foto (vecchio approccio).
 *
 * Strategia:
 * - Commenti: 1 query `where('galleryId', '==', galleryId)` (il campo esiste).
 * - Likes: chunk di 30 photoIds con `where('photoId', 'in', chunk)` (limite Firestore).
 *
 * I componenti `InteractionPanel` figli leggono dalla mappa via `getStats()`.
 * Le mutazioni (like, commento) aggiornano la mappa via `applyLikeDelta` / `applyCommentDelta`,
 * mantenendo l'UI in sync senza re-fetch.
 */
export function GalleryInteractionsProvider({
  galleryId,
  photoIds,
  children,
  enabled = true,
}: ProviderProps) {
  const { user } = useFirebaseAuth();
  const userId = user?.uid;

  const [statsMap, setStatsMap] = useState<Map<string, PhotoInteractionStats>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  // Token incrementale per evitare che fetch più vecchi sovrascrivano risultati più recenti
  const requestTokenRef = useRef(0);

  // Stable key per evitare refetch inutili quando l'array è uguale per contenuto
  const photoIdsKey = useMemo(() => {
    if (!photoIds.length) return '';
    return [...photoIds].sort().join('|');
  }, [photoIds]);

  const fetchAll = useCallback(async () => {
    const myToken = ++requestTokenRef.current;
    if (!enabled || !galleryId || !photoIds.length) {
      setStatsMap(new Map());
      setIsLoading(false);
      setIsReady(true);
      return;
    }

    setIsLoading(true);
    try {
      const map = new Map<string, PhotoInteractionStats>();
      photoIds.forEach((pid) =>
        map.set(pid, { likesCount: 0, commentsCount: 0, hasUserLiked: false })
      );

      // 📨 Commenti: 1 sola query per galleryId
      const commentsPromise = (async () => {
        try {
          const cq = query(collection(db, 'comments'), where('galleryId', '==', galleryId));
          const snap = await getDocs(cq);
          snap.docs.forEach((d) => {
            const data = d.data() as any;
            const pid = data.itemId || data.photoId;
            if (pid && map.has(pid)) {
              const s = map.get(pid)!;
              s.commentsCount += 1;
            }
          });
        } catch (err) {
          console.error('[GalleryInteractions] errore prefetch commenti:', err);
        }
      })();

      // ❤️ Likes: chunk di 30 photoIds con `in` (limite Firestore)
      const likesPromise = (async () => {
        try {
          const chunks: string[][] = [];
          for (let i = 0; i < photoIds.length; i += 30) {
            chunks.push(photoIds.slice(i, i + 30));
          }
          await Promise.all(
            chunks.map(async (chunk) => {
              const lq = query(collection(db, 'likes'), where('photoId', 'in', chunk));
              const snap = await getDocs(lq);
              snap.docs.forEach((d) => {
                const data = d.data() as any;
                const pid = data.photoId;
                if (pid && map.has(pid)) {
                  const s = map.get(pid)!;
                  s.likesCount += 1;
                  if (userId && data.userId === userId) {
                    s.hasUserLiked = true;
                  }
                }
              });
            })
          );
        } catch (err) {
          console.error('[GalleryInteractions] errore prefetch likes:', err);
        }
      })();

      await Promise.all([commentsPromise, likesPromise]);
      // Ignora risultati obsoleti se nel frattempo è partito un fetch più recente
      if (myToken !== requestTokenRef.current) return;
      setStatsMap(new Map(map));
    } finally {
      if (myToken === requestTokenRef.current) {
        setIsLoading(false);
        setIsReady(true);
      }
    }
  }, [enabled, galleryId, photoIdsKey, userId]); // photoIdsKey come dep invece di photoIds

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const getStats = useCallback(
    (photoId: string): PhotoInteractionStats => {
      return statsMap.get(photoId) ?? EMPTY_STATS;
    },
    [statsMap]
  );

  const applyLikeDelta = useCallback((photoId: string, isNowLiked: boolean) => {
    setStatsMap((prev) => {
      const next = new Map(prev);
      const cur = next.get(photoId) ?? { ...EMPTY_STATS };
      next.set(photoId, {
        ...cur,
        hasUserLiked: isNowLiked,
        likesCount: isNowLiked ? cur.likesCount + 1 : Math.max(0, cur.likesCount - 1),
      });
      return next;
    });
  }, []);

  const applyCommentDelta = useCallback((photoId: string, delta: number) => {
    setStatsMap((prev) => {
      const next = new Map(prev);
      const cur = next.get(photoId) ?? { ...EMPTY_STATS };
      next.set(photoId, {
        ...cur,
        commentsCount: Math.max(0, cur.commentsCount + delta),
      });
      return next;
    });
  }, []);

  const value = useMemo<GalleryInteractionsContextValue>(
    () => ({
      isReady,
      isLoading,
      getStats,
      applyLikeDelta,
      applyCommentDelta,
      refresh: fetchAll,
    }),
    [isReady, isLoading, getStats, applyLikeDelta, applyCommentDelta, fetchAll]
  );

  return (
    <GalleryInteractionsContext.Provider value={value}>
      {children}
    </GalleryInteractionsContext.Provider>
  );
}

/** Restituisce il context se presente, altrimenti null (fallback al fetch per-foto). */
export function useGalleryInteractions(): GalleryInteractionsContextValue | null {
  return useContext(GalleryInteractionsContext);
}
