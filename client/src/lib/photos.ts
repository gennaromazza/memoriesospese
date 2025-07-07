/**
 * Firebase Photos Service
 * Gestisce foto nelle gallerie con metadata e interazioni
 */

import { 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc,
  deleteDoc,
  doc,
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  onSnapshot,
  limit,
  getDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { StorageService } from './storage';

export interface Photo {
  id: string;
  galleryId: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  contentType: string;
  size: number;
  uploaderUid: string;
  uploaderEmail: string;
  uploaderName: string;
  likeCount: number;
  commentCount: number;
  position?: number;
  chapterId?: string | null;
  chapterPosition?: number;
  createdAt: any;
  updatedAt?: any;
}

export interface PhotoData {
  galleryId: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  contentType: string;
  size: number;
  uploaderUid: string;
  uploaderEmail: string;
  uploaderName: string;
}

export interface PhotoStats {
  totalPhotos: number;
  totalSize: number;
  averageSize: number;
  uploaders: number;
  mostLikedPhoto?: Photo;
  recentPhotos: Photo[];
}

export class PhotoService {
  /**
   * Aggiungi nuova foto alla galleria
   */
  static async addPhoto(photoData: PhotoData): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'photos'), {
        ...photoData,
        likeCount: 0,
        commentCount: 0,
        position: 0,
        createdAt: serverTimestamp()
      });
      
      return docRef.id;
    } catch (error) {
      console.error('Errore aggiunta foto:', error);
      throw error;
    }
  }

  /**
   * Carica multiple foto in una galleria
   */
  static async uploadPhotosToGallery(
    files: File[],
    galleryId: string,
    uploaderUid: string,
    uploaderEmail: string,
    uploaderName: string,
    onProgress?: (progress: any[]) => void
  ): Promise<Photo[]> {
    try {
      // Upload files to Storage
      const uploadResults = await StorageService.uploadGalleryPhotos(
        files, 
        galleryId, 
        onProgress
      );

      // Save metadata to Firestore
      const photoPromises = uploadResults.map(result => {
        const photoData: PhotoData = {
          galleryId,
          name: result.fileName,
          url: result.url,
          contentType: result.contentType,
          size: result.size,
          uploaderUid,
          uploaderEmail,
          uploaderName
        };
        return this.addPhoto(photoData);
      });

      const photoIds = await Promise.all(photoPromises);
      
      // Fetch and return created photos
      const photoPromises2 = photoIds.map(id => this.getPhotoById(id));
      const photos = await Promise.all(photoPromises2);
      
      return photos.filter(photo => photo !== null) as Photo[];
    } catch (error) {
      console.error('Errore upload foto galleria:', error);
      throw error;
    }
  }

  /**
   * Ottieni foto per ID
   */
  static async getPhotoById(photoId: string): Promise<Photo | null> {
    try {
      const photoDoc = await getDoc(doc(db, 'photos', photoId));
      return photoDoc.exists() ? { id: photoDoc.id, ...photoDoc.data() } as Photo : null;
    } catch (error) {
      console.error('Errore recupero foto per ID:', error);
      return null;
    }
  }

  /**
   * Ottieni tutte le foto di una galleria
   */
  static async getGalleryPhotos(galleryId: string, limitCount?: number): Promise<Photo[]> {
    try {
      let photosQuery = query(
        collection(db, 'photos'),
        where('galleryId', '==', galleryId),
        orderBy('createdAt', 'desc')
      );

      if (limitCount) {
        photosQuery = query(photosQuery, limit(limitCount));
      }
      
      const snapshot = await getDocs(photosQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Photo));
    } catch (error) {
      console.error('Errore recupero foto galleria:', error);
      return [];
    }
  }

  /**
   * Ottieni foto per capitolo (se supportato)
   */
  static async getChapterPhotos(galleryId: string, chapterId: string): Promise<Photo[]> {
    try {
      const photosQuery = query(
        collection(db, 'photos'),
        where('galleryId', '==', galleryId),
        where('chapterId', '==', chapterId),
        orderBy('chapterPosition', 'asc')
      );
      
      const snapshot = await getDocs(photosQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Photo));
    } catch (error) {
      console.error('Errore recupero foto capitolo:', error);
      return [];
    }
  }

  /**
   * Aggiorna metadata foto
   */
  static async updatePhoto(photoId: string, updates: Partial<Photo>): Promise<void> {
    try {
      // Rimuovi campi non aggiornabili
      const { id, createdAt, uploaderUid, galleryId, ...allowedUpdates } = updates;
      
      await updateDoc(doc(db, 'photos', photoId), {
        ...allowedUpdates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Errore aggiornamento foto:', error);
      throw error;
    }
  }

  /**
   * Elimina foto (Firestore + Storage)
   */
  static async deletePhoto(photoId: string): Promise<void> {
    try {
      // Ottieni info foto per eliminare file Storage
      const photo = await this.getPhotoById(photoId);
      
      if (photo) {
        // Estrai path del file dall'URL
        const url = new URL(photo.url);
        const pathMatch = url.pathname.match(/\/o\/(.+?)\?/);
        if (pathMatch) {
          const filePath = decodeURIComponent(pathMatch[1]);
          await StorageService.deleteFile(filePath);
        }
      }
      
      // Elimina documento Firestore
      await deleteDoc(doc(db, 'photos', photoId));
    } catch (error) {
      console.error('Errore eliminazione foto:', error);
      throw error;
    }
  }

  /**
   * Incrementa contatore like
   */
  static async incrementLikeCount(photoId: string, increment: number = 1): Promise<void> {
    try {
      const photoRef = doc(db, 'photos', photoId);
      const photoDoc = await getDoc(photoRef);
      
      if (photoDoc.exists()) {
        const currentCount = photoDoc.data().likeCount || 0;
        await updateDoc(photoRef, {
          likeCount: Math.max(0, currentCount + increment),
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Errore incremento contatore like:', error);
      // Non lanciare errore - gestito dalle transazioni in LikeService
    }
  }

  /**
   * Incrementa contatore commenti
   */
  static async incrementCommentCount(photoId: string, increment: number = 1): Promise<void> {
    try {
      const photoRef = doc(db, 'photos', photoId);
      const photoDoc = await getDoc(photoRef);
      
      if (photoDoc.exists()) {
        const currentCount = photoDoc.data().commentCount || 0;
        await updateDoc(photoRef, {
          commentCount: Math.max(0, currentCount + increment),
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Errore incremento contatore commenti:', error);
      // Non lanciare errore - non è critico
    }
  }

  /**
   * Ottieni foto più recenti di tutte le gallerie
   */
  static async getRecentPhotos(limitCount: number = 10): Promise<Photo[]> {
    try {
      const photosQuery = query(
        collection(db, 'photos'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(photosQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Photo));
    } catch (error) {
      console.error('Errore recupero foto recenti:', error);
      return [];
    }
  }

  /**
   * Ottieni foto più piaciute
   */
  static async getMostLikedPhotos(limitCount: number = 10): Promise<Photo[]> {
    try {
      const photosQuery = query(
        collection(db, 'photos'),
        orderBy('likeCount', 'desc'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(photosQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Photo));
    } catch (error) {
      console.error('Errore recupero foto più piaciute:', error);
      return [];
    }
  }

  /**
   * Cerca foto per nome/uploader
   */
  static async searchPhotos(galleryId: string, searchTerm: string): Promise<Photo[]> {
    try {
      // Firebase non supporta full-text search nativo
      // Implementiamo una ricerca semplificata
      const allPhotos = await this.getGalleryPhotos(galleryId);
      
      const term = searchTerm.toLowerCase();
      return allPhotos.filter(photo => 
        photo.name.toLowerCase().includes(term) ||
        photo.uploaderName.toLowerCase().includes(term) ||
        photo.uploaderEmail.toLowerCase().includes(term)
      );
    } catch (error) {
      console.error('Errore ricerca foto:', error);
      return [];
    }
  }

  /**
   * Real-time subscription alle foto di una galleria
   */
  static subscribeToGalleryPhotos(galleryId: string, callback: (photos: Photo[]) => void) {
    const q = query(
      collection(db, 'photos'),
      where('galleryId', '==', galleryId),
      orderBy('createdAt', 'desc')
    );
    
    return onSnapshot(q, (snapshot) => {
      const photos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Photo));
      callback(photos);
    }, (error) => {
      console.error('Errore subscription foto galleria:', error);
      callback([]);
    });
  }

  /**
   * Conta foto per galleria
   */
  static async getGalleryPhotosCount(galleryId: string): Promise<number> {
    try {
      const photosQuery = query(
        collection(db, 'photos'),
        where('galleryId', '==', galleryId)
      );
      
      const snapshot = await getDocs(photosQuery);
      return snapshot.docs.length;
    } catch (error) {
      console.error('Errore conteggio foto galleria:', error);
      return 0;
    }
  }

  /**
   * Ottieni statistiche foto per una galleria
   */
  static async getGalleryPhotosStats(galleryId: string): Promise<PhotoStats> {
    try {
      const photos = await this.getGalleryPhotos(galleryId);
      
      const totalPhotos = photos.length;
      const totalSize = photos.reduce((sum, photo) => sum + photo.size, 0);
      const averageSize = totalPhotos > 0 ? totalSize / totalPhotos : 0;
      
      // Conta uploader unici
      const uniqueUploaders = new Set(photos.map(photo => photo.uploaderUid));
      const uploaders = uniqueUploaders.size;
      
      // Foto più piaciuta
      const mostLikedPhoto = photos.reduce((max, photo) => 
        (photo.likeCount > (max?.likeCount || 0)) ? photo : max, 
        undefined as Photo | undefined
      );
      
      // Foto recenti
      const recentPhotos = photos.slice(0, 5);
      
      return {
        totalPhotos,
        totalSize,
        averageSize,
        uploaders,
        mostLikedPhoto,
        recentPhotos
      };
    } catch (error) {
      console.error('Errore recupero statistiche foto galleria:', error);
      return {
        totalPhotos: 0,
        totalSize: 0,
        averageSize: 0,
        uploaders: 0,
        recentPhotos: []
      };
    }
  }

  /**
   * Ottieni statistiche generali foto per admin
   */
  static async getGlobalPhotosStats(): Promise<{
    totalPhotos: number;
    totalSize: number;
    averageSize: number;
    totalUploaders: number;
    photosToday: number;
    photosThisWeek: number;
    mostActiveUploader: { name: string; count: number } | null;
  }> {
    try {
      // Tutte le foto
      const allPhotosSnapshot = await getDocs(collection(db, 'photos'));
      const allPhotos = allPhotosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Photo));
      
      const totalPhotos = allPhotos.length;
      const totalSize = allPhotos.reduce((sum, photo) => sum + photo.size, 0);
      const averageSize = totalPhotos > 0 ? totalSize / totalPhotos : 0;
      
      // Uploader unici
      const uniqueUploaders = new Set(allPhotos.map(photo => photo.uploaderUid));
      const totalUploaders = uniqueUploaders.size;
      
      // Foto oggi
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const photosToday = allPhotos.filter(photo => 
        photo.createdAt?.toDate() >= today
      ).length;
      
      // Foto questa settimana
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      const photosThisWeek = allPhotos.filter(photo => 
        photo.createdAt?.toDate() >= weekAgo
      ).length;
      
      // Uploader più attivo
      const uploaderCounts = allPhotos.reduce((acc, photo) => {
        acc[photo.uploaderUid] = (acc[photo.uploaderUid] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const mostActiveUploaderEntry = Object.entries(uploaderCounts)
        .sort(([,a], [,b]) => b - a)[0];
      
      const mostActiveUploader = mostActiveUploaderEntry ? {
        name: allPhotos.find(p => p.uploaderUid === mostActiveUploaderEntry[0])?.uploaderName || 'Utente sconosciuto',
        count: mostActiveUploaderEntry[1]
      } : null;
      
      return {
        totalPhotos,
        totalSize,
        averageSize,
        totalUploaders,
        photosToday,
        photosThisWeek,
        mostActiveUploader
      };
    } catch (error) {
      console.error('Errore recupero statistiche globali foto:', error);
      return {
        totalPhotos: 0,
        totalSize: 0,
        averageSize: 0,
        totalUploaders: 0,
        photosToday: 0,
        photosThisWeek: 0,
        mostActiveUploader: null
      };
    }
  }

  /**
   * Elimina tutte le foto di una galleria (admin only)
   */
  static async deleteAllGalleryPhotos(galleryId: string): Promise<void> {
    try {
      const photos = await this.getGalleryPhotos(galleryId);
      
      // Elimina in batch
      const deletePromises = photos.map(photo => this.deletePhoto(photo.id));
      await Promise.all(deletePromises);
    } catch (error) {
      console.error('Errore eliminazione tutte le foto galleria:', error);
      throw error;
    }
  }

  /**
   * Aggiorna posizione foto per riordinamento
   */
  static async updatePhotoPosition(photoId: string, position: number): Promise<void> {
    try {
      await updateDoc(doc(db, 'photos', photoId), {
        position,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Errore aggiornamento posizione foto:', error);
      throw error;
    }
  }

  /**
   * Assegna foto a un capitolo
   */
  static async assignPhotoToChapter(photoId: string, chapterId: string | null, chapterPosition?: number): Promise<void> {
    try {
      const updateData: any = {
        chapterId,
        updatedAt: serverTimestamp()
      };
      
      if (chapterPosition !== undefined) {
        updateData.chapterPosition = chapterPosition;
      }
      
      await updateDoc(doc(db, 'photos', photoId), updateData);
    } catch (error) {
      console.error('Errore assegnazione foto a capitolo:', error);
      throw error;
    }
  }
}

export default PhotoService;