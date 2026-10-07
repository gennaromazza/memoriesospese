import { useState, useRef, useCallback } from 'react';
import { imageCache } from '@/lib/imageCache';

export type PreloadStatus = 'idle' | 'loading' | 'done' | 'cancelled';

export interface GalleryPreloadState {
  status: PreloadStatus;
  loaded: number;
  total: number;
  estimatedMB: number;
  startPreload: (urls: string[]) => void;
  cancelPreload: () => void;
  resetPreload: () => void;
}

export function useGalleryPreload(): GalleryPreloadState {
  const [status, setStatus] = useState<PreloadStatus>('idle');
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [estimatedMB, setEstimatedMB] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const startPreload = useCallback((urls: string[]) => {
    if (urls.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const alreadyCached = urls.filter(u => imageCache.isImageCached(u)).length;
    setStatus('loading');
    setLoaded(alreadyCached);
    setTotal(urls.length);
    // Stima ~300KB per foto
    setEstimatedMB(Math.round((urls.length * 300) / 1024 * 10) / 10);

    imageCache.preloadAllWithProgress(
      urls,
      (done, tot) => {
        setLoaded(done);
        setTotal(tot);
      },
      controller.signal,
      8
    ).then(() => {
      if (!controller.signal.aborted) {
        setStatus('done');
        setLoaded(urls.length);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setStatus('done');
    });
  }, []);

  const cancelPreload = useCallback(() => {
    abortRef.current?.abort();
    setStatus('cancelled');
  }, []);

  const resetPreload = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
    setLoaded(0);
    setTotal(0);
  }, []);

  return { status, loaded, total, estimatedMB, startPreload, cancelPreload, resetPreload };
}
