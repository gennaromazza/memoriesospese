/**
 * API Layer che sostituisce le chiamate Express con Firebase diretto
 * Per hosting statico su Netsons senza backend Node.js
 */

import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  updateDoc, 
  deleteDoc,
  serverTimestamp,
  limit,
  increment,
  arrayUnion,
  arrayRemove,
  DocumentReference
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { logger } from '@shared/logger';

// Tipi per le operazioni API
export interface GalleryData {
  id: string;
  name: string;
  date: string;
  location: string;
  description?: string;
  password?: string;
  requiresSecurityQuestion?: boolean;
  securityQuestionType?: string;
  securityQuestionCustom?: string;
  coverImageUrl?: string;
  youtubeUrl?: string;
  hasChapters?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface PhotoData {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: any;
  chapterId?: string | null;
  chapterPosition?: number;
  likes?: number;
  comments?: number;
  likedBy?: string[];
}

export interface CommentData {
  id: string;
  text: string;
  userEmail: string;
  userName: string;
  photoId?: string;
  galleryId: string;
  createdAt: any;
}

export interface VoiceMemoData {
  id: string;
  userEmail: string;
  userName: string;
  duration: number;
  audioUrl: string;
  unlockTime: any;
  galleryId: string;
  createdAt: any;
}

// ==================== GALLERY API ====================

export async function getGalleryById(galleryId: string): Promise<GalleryData | null> {
  try {
    const galleryDoc = await getDoc(doc(db, 'galleries', galleryId));
    if (!galleryDoc.exists()) {
      return null;
    }
    
    return {
      id: galleryDoc.id,
      ...galleryDoc.data()
    } as GalleryData;
  } catch (error) {
    logger.error('Errore nel caricamento galleria', { error, galleryId });
    throw error;
  }
}

export async function verifyGalleryAccess(galleryId: string, password?: string, securityAnswer?: string): Promise<boolean> {
  try {
    const gallery = await getGalleryById(galleryId);
    if (!gallery) return false;
    
    // Controlla password se richiesta
    if (gallery.password && gallery.password !== password) {
      return false;
    }
    
    // Controlla security question se richiesta
    if (gallery.requiresSecurityQuestion && gallery.securityQuestionType) {
      if (!securityAnswer) return false;
      
      // Implementa logica di verifica per le domande di sicurezza
      // (semplificata per ora)
      if (securityAnswer.toLowerCase().trim() === '') {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    logger.error('Errore nella verifica accesso galleria', { error, galleryId });
    return false;
  }
}

// ==================== PHOTOS API ====================

export async function getGalleryPhotos(galleryId: string, chapterId?: string): Promise<PhotoData[]> {
  try {
    let photosQuery = query(
      collection(db, 'galleries', galleryId, 'photos'),
      orderBy('createdAt', 'desc')
    );
    
    if (chapterId) {
      photosQuery = query(
        collection(db, 'galleries', galleryId, 'photos'),
        where('chapterId', '==', chapterId),
        orderBy('chapterPosition', 'asc')
      );
    }
    
    const photosSnapshot = await getDocs(photosQuery);
    
    return photosSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as PhotoData[];
  } catch (error) {
    logger.error('Errore nel caricamento foto', { error, galleryId });
    throw error;
  }
}

export async function getTopLikedPhotos(galleryId: string, limitCount: number = 10): Promise<PhotoData[]> {
  try {
    // Prima ottieni tutte le foto della galleria
    const photosSnapshot = await getDocs(
      collection(db, 'galleries', galleryId, 'photos')
    );
    
    // Mappa le foto con i loro dati
    const photos = photosSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as PhotoData[];
    
    logger.info('Foto totali nella galleria', { galleryId, totalPhotos: photos.length });
    
    // Se non ci sono foto, restituisci array vuoto
    if (photos.length === 0) {
      logger.info('Nessuna foto trovata nella galleria', { galleryId });
      return [];
    }
    
    // Ora ottieni tutti i like per contare quanti like ha ogni foto
    const likesSnapshot = await getDocs(collection(db, 'likes'));
    const likesData = likesSnapshot.docs.map(doc => doc.data());
    
    // Conta i like per ogni foto
    const photoLikesCount: Record<string, number> = {};
    likesData.forEach(like => {
      if (like.photoId) {
        photoLikesCount[like.photoId] = (photoLikesCount[like.photoId] || 0) + 1;
      }
    });
    
    // Ora ottieni tutti i commenti per contare quanti commenti ha ogni foto
    const commentsSnapshot = await getDocs(collection(db, 'comments'));
    const commentsData = commentsSnapshot.docs.map(doc => doc.data());
    
    // Conta i commenti per ogni foto
    const photoCommentsCount: Record<string, number> = {};
    commentsData.forEach(comment => {
      if (comment.photoId) {
        photoCommentsCount[comment.photoId] = (photoCommentsCount[comment.photoId] || 0) + 1;
      }
    });
    
    // Aggiungi il conteggio dei like e commenti a ogni foto
    const photosWithLikes = photos.map(photo => ({
      ...photo,
      likes: photoLikesCount[photo.id] || 0,
      comments: photoCommentsCount[photo.id] || 0
    }));
    
    // Ordina le foto per numero di like e prendi le top
    const sortedPhotos = photosWithLikes
      .sort((a, b) => (b.likes || 0) - (a.likes || 0))
      .slice(0, limitCount);
    
    // Log per debug
    logger.info('Top foto per like', { 
      galleryId, 
      topPhotos: sortedPhotos.map(p => ({ id: p.id, likes: p.likes, comments: p.comments, name: p.name }))
    });
    
    return sortedPhotos;
  } catch (error) {
    logger.error('Errore nel caricamento foto più apprezzate', { error, galleryId });
    // In caso di errore, prova un approccio alternativo
    try {
      // Ottieni semplicemente le prime foto della galleria
      const fallbackQuery = query(
        collection(db, 'galleries', galleryId, 'photos'),
        limit(limitCount)
      );
      const fallbackSnapshot = await getDocs(fallbackQuery);
      return fallbackSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        likes: 0
      })) as PhotoData[];
    } catch (fallbackError) {
      logger.error('Errore anche nel fallback', { fallbackError, galleryId });
      return [];
    }
  }
}

// ==================== LIKES API ====================

export async function togglePhotoLike(galleryId: string, photoId: string, userEmail: string): Promise<boolean> {
  try {
    const photoRef = doc(db, 'galleries', galleryId, 'photos', photoId);
    const photoDoc = await getDoc(photoRef);
    
    if (!photoDoc.exists()) {
      throw new Error('Foto non trovata');
    }
    
    const photoData = photoDoc.data() as PhotoData;
    const likedBy = photoData.likedBy || [];
    const isLiked = likedBy.includes(userEmail);
    
    if (isLiked) {
      // Rimuovi like
      await updateDoc(photoRef, {
        likes: increment(-1),
        likedBy: arrayRemove(userEmail)
      });
      return false;
    } else {
      // Aggiungi like
      await updateDoc(photoRef, {
        likes: increment(1),
        likedBy: arrayUnion(userEmail)
      });
      return true;
    }
  } catch (error) {
    logger.error('Errore nel toggle like', { error, galleryId, photoId, userEmail });
    throw error;
  }
}

export async function getPhotoLikeStatus(galleryId: string, photoId: string, userEmail: string): Promise<{ isLiked: boolean; count: number }> {
  try {
    const photoRef = doc(db, 'galleries', galleryId, 'photos', photoId);
    const photoDoc = await getDoc(photoRef);
    
    if (!photoDoc.exists()) {
      return { isLiked: false, count: 0 };
    }
    
    const photoData = photoDoc.data() as PhotoData;
    const likedBy = photoData.likedBy || [];
    
    return {
      isLiked: likedBy.includes(userEmail),
      count: photoData.likes || 0
    };
  } catch (error) {
    logger.error('Errore nel caricamento stato like', { error, galleryId, photoId, userEmail });
    return { isLiked: false, count: 0 };
  }
}

// ==================== COMMENTS API ====================

export async function getPhotoComments(galleryId: string, photoId: string): Promise<CommentData[]> {
  try {
    const commentsQuery = query(
      collection(db, 'galleries', galleryId, 'comments'),
      where('photoId', '==', photoId),
      orderBy('createdAt', 'desc')
    );
    
    const commentsSnapshot = await getDocs(commentsQuery);
    
    return commentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as CommentData[];
  } catch (error) {
    logger.error('Errore nel caricamento commenti', { error, galleryId, photoId });
    throw error;
  }
}

export async function addPhotoComment(galleryId: string, photoId: string, text: string, userEmail: string, userName: string): Promise<CommentData> {
  try {
    const commentData = {
      text,
      userEmail,
      userName,
      photoId,
      galleryId,
      createdAt: serverTimestamp()
    };
    
    const commentRef = await addDoc(collection(db, 'galleries', galleryId, 'comments'), commentData);
    
    // Aggiorna il contatore dei commenti sulla foto
    const photoRef = doc(db, 'galleries', galleryId, 'photos', photoId);
    await updateDoc(photoRef, {
      comments: increment(1)
    });
    
    return {
      id: commentRef.id,
      ...commentData,
      createdAt: new Date()
    } as CommentData;
  } catch (error) {
    logger.error('Errore nell\'aggiunta commento', { error, galleryId, photoId, userEmail });
    throw error;
  }
}

export async function getRecentComments(galleryId: string, limitCount: number = 10): Promise<CommentData[]> {
  try {
    const commentsQuery = query(
      collection(db, 'galleries', galleryId, 'comments'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const commentsSnapshot = await getDocs(commentsQuery);
    
    return commentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as CommentData[];
  } catch (error) {
    logger.error('Errore nel caricamento commenti recenti', { error, galleryId });
    throw error;
  }
}

// ==================== VOICE MEMOS API ====================

export async function getRecentVoiceMemos(galleryId: string, limitCount: number = 10): Promise<VoiceMemoData[]> {
  try {
    const memosQuery = query(
      collection(db, 'galleries', galleryId, 'voice-memos'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const memosSnapshot = await getDocs(memosQuery);
    
    return memosSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as VoiceMemoData[];
  } catch (error) {
    logger.error('Errore nel caricamento voice memos', { error, galleryId });
    throw error;
  }
}

export async function addVoiceMemo(galleryId: string, userEmail: string, userName: string, duration: number, audioUrl: string, unlockTime: Date): Promise<VoiceMemoData> {
  try {
    const memoData = {
      userEmail,
      userName,
      duration,
      audioUrl,
      unlockTime,
      galleryId,
      createdAt: serverTimestamp()
    };
    
    const memoRef = await addDoc(collection(db, 'galleries', galleryId, 'voice-memos'), memoData);
    
    return {
      id: memoRef.id,
      ...memoData,
      createdAt: new Date()
    } as VoiceMemoData;
  } catch (error) {
    logger.error('Errore nell\'aggiunta voice memo', { error, galleryId, userEmail });
    throw error;
  }
}

// ==================== ADMIN API ====================

export async function getAllGalleries(): Promise<GalleryData[]> {
  try {
    const galleriesQuery = query(
      collection(db, 'galleries'),
      orderBy('createdAt', 'desc')
    );
    
    const galleriesSnapshot = await getDocs(galleriesQuery);
    
    return galleriesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as GalleryData[];
  } catch (error) {
    logger.error('Errore nel caricamento gallerie', { error });
    throw error;
  }
}

export async function createGallery(galleryData: Omit<GalleryData, 'id' | 'createdAt' | 'updatedAt'>): Promise<GalleryData> {
  try {
    const newGalleryData = {
      ...galleryData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const galleryRef = await addDoc(collection(db, 'galleries'), newGalleryData);
    
    return {
      id: galleryRef.id,
      ...newGalleryData,
      createdAt: new Date(),
      updatedAt: new Date()
    } as GalleryData;
  } catch (error) {
    logger.error('Errore nella creazione galleria', { error });
    throw error;
  }
}

export async function updateGallery(galleryId: string, updates: Partial<GalleryData>): Promise<void> {
  try {
    const galleryRef = doc(db, 'galleries', galleryId);
    await updateDoc(galleryRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    logger.error('Errore nell\'aggiornamento galleria', { error, galleryId });
    throw error;
  }
}

export async function deleteGallery(galleryId: string): Promise<void> {
  try {
    const galleryRef = doc(db, 'galleries', galleryId);
    await deleteDoc(galleryRef);
  } catch (error) {
    logger.error('Errore nell\'eliminazione galleria', { error, galleryId });
    throw error;
  }
}

// ==================== HELPER FUNCTIONS ====================

export function isAdmin(userEmail: string): boolean {
  const adminEmails = ['gennaro.mazzacane@gmail.com'];
  return adminEmails.includes(userEmail);
}

export function getCurrentUserEmail(): string | null {
  return auth.currentUser?.email || null;
}

export function getCurrentUserName(): string | null {
  return auth.currentUser?.displayName || auth.currentUser?.email || null;
}