/**
 * Firebase Likes Service
 * Gestisce likes alle foto con sistema transazionale
 */

import { 
  collection, 
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
  runTransaction,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';

export interface Like {
  id: string;
  photoId: string;
  userId: string;
  userEmail: string;
  userName: string;
  createdAt: any;
}

export interface LikeData {
  photoId: string;
  userId: string;
  userEmail: string;
  userName: string;
}

export class LikeService {
  /**
   * Toggle like per una foto (transazionale)
   */
  static async toggleLike(photoId: string, userId: string, userEmail: string, userName: string): Promise<boolean> {
    try {
      // Validazione input
      if (!photoId || !userId || !userEmail || !userName) {
        throw new Error('Parametri mancanti per toggle like');
      }

      const likeId = `${photoId}_${userId}`;
      
      return await runTransaction(db, async (transaction) => {
        const likeRef = doc(db, 'likes', likeId);
        const likeDoc = await transaction.get(likeRef);
        
        const isLiked = likeDoc.exists();

        if (isLiked) {
          // Remove like
          transaction.delete(likeRef);
          return false;
        } else {
          // Add like
          transaction.set(likeRef, {
            photoId,
            userId,
            userEmail,
            userName,
            createdAt: serverTimestamp()
          });
          return true;
        }
      });
    } catch (error) {
      console.error('Errore toggle like:', error);
      throw error;
    }
  }

  /**
   * Controlla se una foto è stata messa "mi piace" da un utente
   */
  static async isPhotoLikedByUser(photoId: string, userId: string): Promise<boolean> {
    try {
      const likeId = `${photoId}_${userId}`;
      const likeDoc = await getDoc(doc(db, 'likes', likeId));
      return likeDoc.exists();
    } catch (error) {
      console.error('Errore controllo like utente:', error);
      return false;
    }
  }

  /**
   * Ottieni tutti i likes per una foto
   */
  static async getPhotoLikes(photoId: string): Promise<Like[]> {
    try {
      const likesQuery = query(
        collection(db, 'likes'),
        where('photoId', '==', photoId)
      );
      const snapshot = await getDocs(likesQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Like));
    } catch (error) {
      console.error('Errore recupero likes foto:', error);
      return [];
    }
  }

  /**
   * Conta i likes per una foto
   */
  static async getPhotoLikesCount(photoId: string): Promise<number> {
    try {
      const likesQuery = query(
        collection(db, 'likes'),
        where('photoId', '==', photoId)
      );
      const snapshot = await getDocs(likesQuery);
      return snapshot.docs.length;
    } catch (error) {
      console.error('Errore conteggio likes foto:', error);
      return 0;
    }
  }

  /**
   * Ottieni le foto più piaciute di una galleria
   */
  static async getMostLikedPhotos(galleryId: string, limitCount: number = 10): Promise<any[]> {
    try {
      const photosSnapshot = await getDocs(
        query(collection(db, 'galleries', galleryId, 'photos'))
      );
      const globalPhotosSnapshot = await getDocs(
        query(collection(db, 'photos'), where('galleryId', '==', galleryId))
      );

      const photoIds = new Set<string>();
      photosSnapshot.docs.forEach(d => photoIds.add(d.id));
      globalPhotosSnapshot.docs.forEach(d => photoIds.add(d.id));

      if (photoIds.size === 0) return [];

      const likesSnapshot = await getDocs(collection(db, 'likes'));
      const photosLikeCount: Record<string, number> = {};

      likesSnapshot.docs.forEach(d => {
        const data = d.data();
        const pid = data.photoId;
        if (pid && photoIds.has(pid)) {
          photosLikeCount[pid] = (photosLikeCount[pid] || 0) + 1;
        }
      });

      const sortedPhotos = Object.entries(photosLikeCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, limitCount);

      return sortedPhotos.map(([photoId, likeCount]) => ({
        photoId,
        likeCount
      }));
    } catch (error) {
      console.error('Errore recupero foto più piaciute:', error);
      return [];
    }
  }

  /**
   * Real-time subscription ai likes di una foto
   */
  static subscribeToPhotoLikes(photoId: string, callback: (likes: Like[]) => void) {
    const q = query(
      collection(db, 'likes'),
      where('photoId', '==', photoId)
    );
    
    return onSnapshot(q, (snapshot) => {
      const likes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Like));
      callback(likes);
    }, (error) => {
      console.error('Errore subscription likes foto:', error);
      callback([]);
    });
  }

  /**
   * Ottieni statistiche likes per admin
   */
  static async getLikesStats(): Promise<{
    total: number;
    today: number;
    thisWeek: number;
    topPhotos: Array<{photoId: string; likeCount: number}>;
  }> {
    try {
      // Total likes
      const totalSnapshot = await getDocs(collection(db, 'likes'));
      const total = totalSnapshot.docs.length;

      // Likes today
      // FIX: Usa constructor per reset ore (evita setHours())
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayQuery = query(
        collection(db, 'likes'),
        where('createdAt', '>=', today)
      );
      const todaySnapshot = await getDocs(todayQuery);
      const todayCount = todaySnapshot.docs.length;

      // Likes this week
      // FIX: Usa math per calcolo date (evita setDate() e setHours())
      const date = new Date(new Date().getTime() - 7 * 86400000);
      const weekAgo = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const weekQuery = query(
        collection(db, 'likes'),
        where('createdAt', '>=', weekAgo)
      );
      const weekSnapshot = await getDocs(weekQuery);
      const weekCount = weekSnapshot.docs.length;

      // Top photos (simplified version)
      const allLikes = totalSnapshot.docs.map(doc => doc.data());
      const photosLikeCount = allLikes.reduce((acc, like) => {
        acc[like.photoId] = (acc[like.photoId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const topPhotos = Object.entries(photosLikeCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([photoId, likeCount]) => ({ photoId, likeCount }));

      return {
        total,
        today: todayCount,
        thisWeek: weekCount,
        topPhotos
      };
    } catch (error) {
      console.error('Errore recupero statistiche likes:', error);
      return { total: 0, today: 0, thisWeek: 0, topPhotos: [] };
    }
  }

  /**
   * Elimina tutti i likes per una foto (admin only)
   */
  static async deletePhotoLikes(photoId: string): Promise<void> {
    try {
      const likesQuery = query(
        collection(db, 'likes'),
        where('photoId', '==', photoId)
      );
      
      const snapshot = await getDocs(likesQuery);
      const batch = writeBatch(db);
      
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Errore eliminazione likes foto:', error);
      throw error;
    }
  }
}

export default LikeService;