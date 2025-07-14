import { useCallback } from 'react';

/**
 * Hook per il refresh intelligente dei dati della galleria Firebase
 * Sostituisce window.location.reload() con refresh React state
 */
export function useGalleryRefresh(galleryId?: string) {

  const refreshGallery = useCallback(async () => {
    if (!galleryId) return;

    // Trigger refresh tramite evento personalizzato
    window.dispatchEvent(new CustomEvent('galleryRefresh', { 
      detail: { galleryId, type: 'all' }
    }));
  }, [galleryId]);

  const refreshPhotos = useCallback(async () => {
    if (!galleryId) return;

    // Trigger refresh specifico per foto
    window.dispatchEvent(new CustomEvent('galleryRefresh', { 
      detail: { galleryId, type: 'photos' }
    }));
  }, [galleryId]);

  const refreshStats = useCallback(async () => {
    if (!galleryId) return;

    // Trigger refresh specifico per statistiche
    window.dispatchEvent(new CustomEvent('galleryRefresh', { 
      detail: { galleryId, type: 'stats' }
    }));
  }, [galleryId]);

  const refreshVoiceMemos = useCallback(async () => {
    if (!galleryId) return;

    // Trigger refresh specifico per voice memos
    window.dispatchEvent(new CustomEvent('galleryRefresh', { 
      detail: { galleryId, type: 'voice-memos' }
    }));
  }, [galleryId]);

  const refreshInteractions = useCallback(async () => {
    if (!galleryId) return;

    // Trigger refresh specifico per interazioni
    window.dispatchEvent(new CustomEvent('galleryRefresh', { 
      detail: { galleryId, type: 'interactions' }
    }));
  }, [galleryId]);

  return {
    refreshGallery,
    refreshPhotos,
    refreshStats,
    refreshVoiceMemos,
    refreshInteractions
  };
}