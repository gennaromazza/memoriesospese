
/**
 * Wedding Videos Service
 * Gestisce CRUD per i video matrimoni (stile Netflix)
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { db } from './firebase';
import type { WeddingVideo } from '@shared/schema';

export class WeddingVideoService {
  /**
   * Ottieni tutti i video attivi
   */
  static async getAllVideos(): Promise<WeddingVideo[]> {
    try {
      const videosQuery = query(
        collection(db, 'weddingVideos'),
        where('active', '==', true),
        orderBy('sortOrder', 'asc'),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(videosQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WeddingVideo));
    } catch (error) {
      console.error('Errore recupero video:', error);
      return [];
    }
  }

  /**
   * Ottieni video per categoria
   */
  static async getVideosByCategory(category: string): Promise<WeddingVideo[]> {
    try {
      const videosQuery = query(
        collection(db, 'weddingVideos'),
        where('active', '==', true),
        where('category', '==', category),
        orderBy('sortOrder', 'asc')
      );
      
      const snapshot = await getDocs(videosQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WeddingVideo));
    } catch (error) {
      console.error('Errore recupero video per categoria:', error);
      return [];
    }
  }

  /**
   * Ottieni video in evidenza
   */
  static async getFeaturedVideos(): Promise<WeddingVideo[]> {
    try {
      const videosQuery = query(
        collection(db, 'weddingVideos'),
        where('active', '==', true),
        where('featured', '==', true),
        orderBy('sortOrder', 'asc')
      );
      
      const snapshot = await getDocs(videosQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WeddingVideo));
    } catch (error) {
      console.error('Errore recupero video in evidenza:', error);
      return [];
    }
  }

  /**
   * Ottieni video per slug
   */
  static async getVideoBySlug(slug: string): Promise<WeddingVideo | null> {
    try {
      const videosQuery = query(
        collection(db, 'weddingVideos'),
        where('slug', '==', slug),
        where('active', '==', true)
      );
      
      const snapshot = await getDocs(videosQuery);
      return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as WeddingVideo;
    } catch (error) {
      console.error('Errore recupero video per slug:', error);
      return null;
    }
  }

  /**
   * Crea nuovo video
   */
  static async createVideo(videoData: Partial<WeddingVideo>): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'weddingVideos'), {
        ...videoData,
        active: true,
        views: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      console.error('Errore creazione video:', error);
      throw error;
    }
  }

  /**
   * Aggiorna video
   */
  static async updateVideo(id: string, updates: Partial<WeddingVideo>): Promise<void> {
    try {
      const { id: _, createdAt, ...allowedUpdates } = updates as any;
      
      await updateDoc(doc(db, 'weddingVideos', id), {
        ...allowedUpdates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Errore aggiornamento video:', error);
      throw error;
    }
  }

  /**
   * Elimina video (soft delete)
   */
  static async deleteVideo(id: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'weddingVideos', id), {
        active: false,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Errore eliminazione video:', error);
      throw error;
    }
  }

  /**
   * Incrementa contatore visualizzazioni
   */
  static async incrementViews(id: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'weddingVideos', id), {
        views: increment(1)
      });
    } catch (error) {
      console.error('Errore incremento visualizzazioni:', error);
      // Non lanciare errore - non è critico
    }
  }
}

export default WeddingVideoService;
