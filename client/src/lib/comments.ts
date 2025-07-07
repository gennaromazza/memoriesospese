/**
 * Firebase Comments Service
 * Gestisce commenti alle foto con real-time updates
 */

import { 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc,
  doc,
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  onSnapshot,
  limit
} from 'firebase/firestore';
import { db } from './firebase';

export interface Comment {
  id: string;
  galleryId: string;
  photoId: string;
  userId: string;
  userEmail: string;
  userName: string;
  text: string;
  createdAt: any;
}

export interface CommentData {
  galleryId: string;
  photoId: string;
  userId: string;
  userEmail: string;
  userName: string;
  text: string;
}

export class CommentService {
  /**
   * Aggiungi nuovo commento
   */
  static async addComment(commentData: CommentData): Promise<string> {
    try {
      // Validazione input
      if (!commentData.text?.trim()) {
        throw new Error('Testo commento richiesto');
      }
      
      if (!commentData.userId || !commentData.photoId || !commentData.galleryId) {
        throw new Error('Dati commento incompleti');
      }

      const docRef = await addDoc(collection(db, 'comments'), {
        ...commentData,
        text: commentData.text.trim(),
        createdAt: serverTimestamp()
      });
      
      return docRef.id;
    } catch (error) {
      console.error('Errore aggiunta commento:', error);
      throw error;
    }
  }

  /**
   * Ottieni commenti per una foto specifica
   */
  static async getPhotoComments(photoId: string): Promise<Comment[]> {
    try {
      // Semplifichiamo la query per evitare errori di indici mancanti
      const commentsQuery = query(
        collection(db, 'comments'),
        where('photoId', '==', photoId)
      );
      
      const snapshot = await getDocs(commentsQuery);
      const comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
      
      // Ordiniamo manualmente per evitare problemi con gli indici Firebase
      return comments.sort((a, b) => {
        const timeA = a.createdAt?.toDate?.() || new Date(0);
        const timeB = b.createdAt?.toDate?.() || new Date(0);
        return timeA.getTime() - timeB.getTime();
      });
    } catch (error) {
      console.error('Errore recupero commenti foto:', error);
      return [];
    }
  }

  /**
   * Ottieni commenti per una galleria
   */
  static async getGalleryComments(galleryId: string, limitCount?: number): Promise<Comment[]> {
    try {
      // Semplifichiamo la query per evitare errori di indici mancanti
      const commentsQuery = query(
        collection(db, 'comments'),
        where('galleryId', '==', galleryId)
      );
      
      const snapshot = await getDocs(commentsQuery);
      let comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
      
      // Ordiniamo manualmente
      comments = comments.sort((a, b) => {
        const timeA = a.createdAt?.toDate?.() || new Date(0);
        const timeB = b.createdAt?.toDate?.() || new Date(0);
        return timeB.getTime() - timeA.getTime(); // desc order
      });

      if (limitCount) {
        comments = comments.slice(0, limitCount);
      }
      
      return comments;
    } catch (error) {
      console.error('Errore recupero commenti galleria:', error);
      return [];
    }
  }

  /**
   * Elimina commento (solo autore o admin)
   */
  static async deleteComment(commentId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'comments', commentId));
    } catch (error) {
      console.error('Errore eliminazione commento:', error);
      throw error;
    }
  }

  /**
   * Conta commenti per una foto
   */
  static async getPhotoCommentsCount(photoId: string): Promise<number> {
    try {
      const commentsQuery = query(
        collection(db, 'comments'),
        where('photoId', '==', photoId)
      );
      
      const snapshot = await getDocs(commentsQuery);
      return snapshot.docs.length;
    } catch (error) {
      console.error('Errore conteggio commenti foto:', error);
      return 0;
    }
  }

  /**
   * Conta commenti per una galleria
   */
  static async getGalleryCommentsCount(galleryId: string): Promise<number> {
    try {
      const commentsQuery = query(
        collection(db, 'comments'),
        where('galleryId', '==', galleryId)
      );
      
      const snapshot = await getDocs(commentsQuery);
      return snapshot.docs.length;
    } catch (error) {
      console.error('Errore conteggio commenti galleria:', error);
      return 0;
    }
  }

  /**
   * Real-time subscription ai commenti di una foto
   */
  static subscribeToPhotoComments(photoId: string, callback: (comments: Comment[]) => void) {
    const q = query(
      collection(db, 'comments'),
      where('photoId', '==', photoId),
      orderBy('createdAt', 'asc')
    );
    
    return onSnapshot(q, (snapshot) => {
      const comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
      callback(comments);
    }, (error) => {
      console.error('Errore subscription commenti foto:', error);
      callback([]);
    });
  }

  /**
   * Real-time subscription ai commenti di una galleria
   */
  static subscribeToGalleryComments(galleryId: string, callback: (comments: Comment[]) => void, limitCount?: number) {
    let q = query(
      collection(db, 'comments'),
      where('galleryId', '==', galleryId),
      orderBy('createdAt', 'desc')
    );

    if (limitCount) {
      q = query(q, limit(limitCount));
    }
    
    return onSnapshot(q, (snapshot) => {
      const comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
      callback(comments);
    }, (error) => {
      console.error('Errore subscription commenti galleria:', error);
      callback([]);
    });
  }

  /**
   * Ottieni commenti recenti per tutte le gallerie (admin dashboard)
   */
  static async getRecentComments(limitCount: number = 10): Promise<Comment[]> {
    try {
      const commentsQuery = query(
        collection(db, 'comments'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(commentsQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
    } catch (error) {
      console.error('Errore recupero commenti recenti:', error);
      return [];
    }
  }

  /**
   * Ottieni statistiche commenti per admin
   */
  static async getCommentsStats(): Promise<{
    total: number;
    today: number;
    thisWeek: number;
  }> {
    try {
      // Total comments
      const totalSnapshot = await getDocs(collection(db, 'comments'));
      const total = totalSnapshot.docs.length;

      // Comments today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayQuery = query(
        collection(db, 'comments'),
        where('createdAt', '>=', today)
      );
      const todaySnapshot = await getDocs(todayQuery);
      const todayCount = todaySnapshot.docs.length;

      // Comments this week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      const weekQuery = query(
        collection(db, 'comments'),
        where('createdAt', '>=', weekAgo)
      );
      const weekSnapshot = await getDocs(weekQuery);
      const weekCount = weekSnapshot.docs.length;

      return {
        total,
        today: todayCount,
        thisWeek: weekCount
      };
    } catch (error) {
      console.error('Errore recupero statistiche commenti:', error);
      return { total: 0, today: 0, thisWeek: 0 };
    }
  }
}

export default CommentService;