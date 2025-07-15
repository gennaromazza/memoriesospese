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
  itemId: string;
  itemType: 'photo' | 'voice_memo';
  galleryId: string;
  userId?: string; // optional for backward compatibility
  photoId?: string; // optional for backward compatibility
  userEmail: string;
  userName: string;
  userProfileImageUrl?: string;
  content: string;
  text: string; // Alias for content for backward compatibility
  createdAt: any;
}

export interface CommentData {
  galleryId: string;
  photoId?: string; // optional for backward compatibility
  itemId: string;
  itemType: 'photo' | 'voice_memo';
  userId?: string; // optional for backward compatibility
  userEmail: string;
  userName: string;
  userProfileImageUrl?: string;
  text?: string; // optional for backward compatibility
  content?: string; // optional, fallback if text is not provided
}

export class CommentService {
  /**
   * Aggiungi nuovo commento
   */
  static async addComment(commentData: CommentData): Promise<string> {
    try {
      console.log('🔍 Dati commento ricevuti:', commentData);

      // Validazione input migliorata
      const text = commentData.text || commentData.content;
      if (!text?.trim()) {
        throw new Error('Testo commento richiesto');
      }
      
      if (!commentData.itemId || !commentData.galleryId) {
        console.error('❌ Dati mancanti:', { itemId: commentData.itemId, galleryId: commentData.galleryId });
        throw new Error('Dati commento incompleti: itemId e galleryId sono richiesti');
      }

      if (!commentData.userEmail || !commentData.userName) {
        console.error('❌ Dati utente mancanti:', { userEmail: commentData.userEmail, userName: commentData.userName });
        throw new Error('Dati utente richiesti per aggiungere commento');
      }

      // Prepara i dati per Firebase
      const firebaseData = {
        galleryId: commentData.galleryId,
        itemId: commentData.itemId,
        itemType: commentData.itemType || 'photo',
        photoId: commentData.photoId || commentData.itemId, // backward compatibility
        userId: commentData.userId || commentData.userEmail,
        userEmail: commentData.userEmail,
        userName: commentData.userName,
        userProfileImageUrl: commentData.userProfileImageUrl || null,
        text: text.trim(),
        content: text.trim(), // Store both for compatibility
        createdAt: serverTimestamp()
      };

      console.log('📤 Invio dati a Firebase:', firebaseData);

      // Test di connessione database
      if (!db) {
        throw new Error('Database Firebase non inizializzato');
      }

      const docRef = await addDoc(collection(db, 'comments'), firebaseData);
      
      console.log('✅ Commento aggiunto con ID:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('❌ Errore aggiunta commento:', error);
      console.error('📋 Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      
      // Rilancia l'errore con più informazioni
      if (error instanceof Error) {
        throw new Error(`Errore aggiunta commento: ${error.message}`);
      } else {
        throw new Error('Errore sconosciuto durante l\'aggiunta del commento');
      }
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
      const comments = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          itemId: data.itemId || data.photoId || photoId,
          itemType: data.itemType || 'photo',
          content: data.content || data.text || '',
          text: data.text || data.content || ''
        } as Comment;
      });
      
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
      let comments = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          itemId: data.itemId || data.photoId || '',
          itemType: data.itemType || 'photo',
          content: data.content || data.text || '',
          text: data.text || data.content || ''
        } as Comment;
      });
      
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

// Funzioni di convenienza per importazione diretta
export const getRecentComments = (galleryId: string, limitCount: number = 8) => 
  CommentService.getGalleryComments(galleryId, limitCount);

export default CommentService;