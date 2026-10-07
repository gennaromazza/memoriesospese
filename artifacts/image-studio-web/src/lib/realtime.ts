/**
 * Firebase Real-time Service
 * Gestisce sottoscrizioni e aggiornamenti real-time per l'applicazione
 */

import { onSnapshot, Unsubscribe } from 'firebase/firestore';
import { GalleryService, Gallery } from './galleries';
import { PhotoService, Photo } from './photos';
import { CommentService, Comment } from './comments';
import { LikeService, Like } from './likes';
import { VoiceMemoService, VoiceMemo } from './voiceMemos';

export interface RealtimeSubscriptions {
  galleries?: Unsubscribe;
  gallery?: Unsubscribe;
  photos?: Unsubscribe;
  comments?: Unsubscribe;
  likes?: Unsubscribe;
  voiceMemos?: Unsubscribe;
}

export interface RealtimeCallbacks {
  onGalleriesUpdate?: (galleries: Gallery[]) => void;
  onGalleryUpdate?: (gallery: Gallery | null) => void;
  onPhotosUpdate?: (photos: Photo[]) => void;
  onCommentsUpdate?: (comments: Comment[]) => void;
  onLikesUpdate?: (likes: Like[]) => void;
  onVoiceMemosUpdate?: (memos: VoiceMemo[]) => void;
}

export class RealtimeService {
  private static subscriptions: Map<string, RealtimeSubscriptions> = new Map();

  /**
   * Sottoscrivi agli aggiornamenti di una galleria completa
   */
  static subscribeToGallery(
    galleryId: string,
    callbacks: RealtimeCallbacks,
    sessionId: string = 'default'
  ): void {
    try {
      // Pulisci eventuali sottoscrizioni esistenti per questa sessione
      this.unsubscribeSession(sessionId);

      const subscriptions: RealtimeSubscriptions = {};

      // Sottoscrizione alla galleria
      if (callbacks.onGalleryUpdate) {
        subscriptions.gallery = GalleryService.subscribeToGallery(
          galleryId,
          callbacks.onGalleryUpdate
        );
      }

      // Sottoscrizione alle foto
      if (callbacks.onPhotosUpdate) {
        subscriptions.photos = PhotoService.subscribeToGalleryPhotos(
          galleryId,
          callbacks.onPhotosUpdate
        );
      }

      // Sottoscrizione ai commenti
      if (callbacks.onCommentsUpdate) {
        subscriptions.comments = CommentService.subscribeToGalleryComments(
          galleryId,
          callbacks.onCommentsUpdate
        );
      }

      // Sottoscrizione ai voice memos
      if (callbacks.onVoiceMemosUpdate) {
        subscriptions.voiceMemos = VoiceMemoService.subscribeToGalleryVoiceMemos(
          galleryId,
          callbacks.onVoiceMemosUpdate
        );
      }

      // Salva le sottoscrizioni per questa sessione
      this.subscriptions.set(sessionId, subscriptions);
    } catch (error) {
      console.error('Errore sottoscrizione galleria:', error);
    }
  }

  /**
   * Sottoscrivi agli aggiornamenti di una foto specifica
   */
  static subscribeToPhoto(
    photoId: string,
    callbacks: {
      onCommentsUpdate?: (comments: Comment[]) => void;
      onLikesUpdate?: (likes: Like[]) => void;
    },
    sessionId: string = 'photo'
  ): void {
    try {
      this.unsubscribeSession(sessionId);

      const subscriptions: RealtimeSubscriptions = {};

      // Sottoscrizione ai commenti della foto
      if (callbacks.onCommentsUpdate) {
        subscriptions.comments = CommentService.subscribeToPhotoComments(
          photoId,
          callbacks.onCommentsUpdate
        );
      }

      // Sottoscrizione ai likes della foto
      if (callbacks.onLikesUpdate) {
        subscriptions.likes = LikeService.subscribeToPhotoLikes(
          photoId,
          callbacks.onLikesUpdate
        );
      }

      this.subscriptions.set(sessionId, subscriptions);
    } catch (error) {
      console.error('Errore sottoscrizione foto:', error);
    }
  }

  /**
   * Sottoscrivi a tutte le gallerie (per admin dashboard)
   */
  static subscribeToAllGalleries(
    callback: (galleries: Gallery[]) => void,
    sessionId: string = 'admin'
  ): void {
    try {
      this.unsubscribeSession(sessionId);

      const subscriptions: RealtimeSubscriptions = {
        galleries: GalleryService.subscribeToGalleries(callback)
      };

      this.subscriptions.set(sessionId, subscriptions);
    } catch (error) {
      console.error('Errore sottoscrizione tutte le gallerie:', error);
    }
  }

  /**
   * Cancella sottoscrizioni per una sessione specifica
   */
  static unsubscribeSession(sessionId: string): void {
    try {
      const sessionSubscriptions = this.subscriptions.get(sessionId);
      
      if (sessionSubscriptions) {
        // Cancella tutte le sottoscrizioni attive
        Object.values(sessionSubscriptions).forEach(unsubscribe => {
          if (unsubscribe) {
            unsubscribe();
          }
        });

        // Rimuovi dalla mappa
        this.subscriptions.delete(sessionId);
      }
    } catch (error) {
      console.error('Errore cancellazione sottoscrizioni sessione:', error);
    }
  }

  /**
   * Cancella tutte le sottoscrizioni attive
   */
  static unsubscribeAll(): void {
    try {
      this.subscriptions.forEach((_, sessionId) => {
        this.unsubscribeSession(sessionId);
      });
    } catch (error) {
      console.error('Errore cancellazione tutte le sottoscrizioni:', error);
    }
  }

  /**
   * Ottieni stato delle sottoscrizioni attive
   */
  static getActiveSubscriptions(): Record<string, string[]> {
    const status: Record<string, string[]> = {};
    
    this.subscriptions.forEach((subscriptions, sessionId) => {
      status[sessionId] = Object.keys(subscriptions);
    });
    
    return status;
  }

  /**
   * Sottoscrizione smart che gestisce automaticamente la disconnessione
   */
  static createSmartSubscription<T>(
    subscribeFunction: (callback: (data: T) => void) => Unsubscribe,
    callback: (data: T) => void,
    sessionId: string,
    subscriptionKey: keyof RealtimeSubscriptions
  ): void {
    try {
      // Ottieni o crea le sottoscrizioni per questa sessione
      let sessionSubscriptions = this.subscriptions.get(sessionId);
      if (!sessionSubscriptions) {
        sessionSubscriptions = {};
        this.subscriptions.set(sessionId, sessionSubscriptions);
      }

      // Cancella eventuale sottoscrizione precedente per questa chiave
      if (sessionSubscriptions[subscriptionKey]) {
        sessionSubscriptions[subscriptionKey]!();
      }

      // Crea nuova sottoscrizione
      sessionSubscriptions[subscriptionKey] = subscribeFunction(callback);
    } catch (error) {
      console.error(`Errore creazione smart subscription ${subscriptionKey}:`, error);
    }
  }

  /**
   * Auto-cleanup quando la pagina viene chiusa/ricaricata
   */
  static setupAutoCleanup(): void {
    if (typeof window !== 'undefined') {
      const cleanup = () => {
        this.unsubscribeAll();
      };

      window.addEventListener('beforeunload', cleanup);
      window.addEventListener('pagehide', cleanup);
      
      // Cleanup per SPA routing
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      history.pushState = function(...args) {
        cleanup();
        return originalPushState.apply(history, args);
      };
      
      history.replaceState = function(...args) {
        cleanup();
        return originalReplaceState.apply(history, args);
      };
    }
  }

  /**
   * Ottieni metriche delle sottoscrizioni per debugging
   */
  static getSubscriptionMetrics(): {
    totalSessions: number;
    totalSubscriptions: number;
    sessionDetails: Record<string, { subscriptions: string[]; timestamp: number }>;
  } {
    const totalSessions = this.subscriptions.size;
    let totalSubscriptions = 0;
    const sessionDetails: Record<string, { subscriptions: string[]; timestamp: number }> = {};
    
    this.subscriptions.forEach((subscriptions, sessionId) => {
      const subscriptionKeys = Object.keys(subscriptions).filter(key => subscriptions[key as keyof RealtimeSubscriptions]);
      totalSubscriptions += subscriptionKeys.length;
      
      sessionDetails[sessionId] = {
        subscriptions: subscriptionKeys,
        timestamp: Date.now()
      };
    });
    
    return {
      totalSessions,
      totalSubscriptions,
      sessionDetails
    };
  }
}

// Setup auto-cleanup quando il modulo viene caricato
if (typeof window !== 'undefined') {
  RealtimeService.setupAutoCleanup();
}

export default RealtimeService;