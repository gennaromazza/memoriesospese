import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Hook per il refresh intelligente dei dati della galleria
 * Sostituisce window.location.reload() con aggiornamenti React state
 */
export function useGalleryRefresh(galleryId?: string) {
  const queryClient = useQueryClient();

  const refreshGallery = useCallback(async () => {
    if (!galleryId) return;

    // Invalida tutte le query correlate alla galleria
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/galleries', galleryId] }),
      queryClient.invalidateQueries({ queryKey: ['/api/galleries', galleryId, 'photos'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/galleries', galleryId, 'stats'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/galleries', galleryId, 'voice-memos'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/galleries', galleryId, 'interactions'] })
    ]);
  }, [queryClient, galleryId]);

  const refreshPhotos = useCallback(async () => {
    if (!galleryId) return;

    await queryClient.invalidateQueries({ 
      queryKey: ['/api/galleries', galleryId, 'photos'] 
    });
  }, [queryClient, galleryId]);

  const refreshStats = useCallback(async () => {
    if (!galleryId) return;

    await queryClient.invalidateQueries({ 
      queryKey: ['/api/galleries', galleryId, 'stats'] 
    });
  }, [queryClient, galleryId]);

  const refreshVoiceMemos = useCallback(async () => {
    if (!galleryId) return;

    await queryClient.invalidateQueries({ 
      queryKey: ['/api/galleries', galleryId, 'voice-memos'] 
    });
  }, [queryClient, galleryId]);

  const refreshInteractions = useCallback(async () => {
    if (!galleryId) return;

    await queryClient.invalidateQueries({ 
      queryKey: ['/api/galleries', galleryId, 'interactions'] 
    });
  }, [queryClient, galleryId]);

  return {
    refreshGallery,
    refreshPhotos,
    refreshStats,
    refreshVoiceMemos,
    refreshInteractions
  };
}