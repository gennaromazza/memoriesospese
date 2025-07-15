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
    logger.error('Errore nel caricamento galleria', { error: error as Error, galleryId });
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
    logger.error('Errore nella verifica accesso galleria', { error: error instanceof Error ? error : new Error(String(error)), galleryId });
    return false;
  }
}

// ==================== PHOTOS API ====================

export async function getGalleryPhotos(galleryId: string, chapterId?: string): Promise<PhotoData[]> {
  try {
    // DOPPIA LOGICA: Prima ottieni foto dalla nuova collection globale
    let newPhotosQuery = query(
      collection(db, 'photos'),
      where('galleryId', '==', galleryId),
      orderBy('createdAt', 'desc')
    );
    
    if (chapterId) {
      newPhotosQuery = query(
        collection(db, 'photos'),
        where('galleryId', '==', galleryId),
        where('chapterId', '==', chapterId),
        orderBy('chapterPosition', 'asc')
      );
    }
    
    let newPhotos: PhotoData[] = [];
    try {
      const newPhotosSnapshot = await getDocs(newPhotosQuery);
      newPhotos = newPhotosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PhotoData[];
    } catch (error) {
      console.warn('Errore nel caricamento foto dalla collection globale:', error);
    }
    
    // Poi ottieni foto dalla vecchia collection legacy
    let legacyPhotosQuery = query(
      collection(db, 'galleries', galleryId, 'photos'),
      orderBy('createdAt', 'desc')
    );
    
    if (chapterId) {
      legacyPhotosQuery = query(
        collection(db, 'galleries', galleryId, 'photos'),
        where('chapterId', '==', chapterId),
        orderBy('chapterPosition', 'asc')
      );
    }
    
    let legacyPhotos: PhotoData[] = [];
    try {
      const legacyPhotosSnapshot = await getDocs(legacyPhotosQuery);
      legacyPhotos = legacyPhotosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PhotoData[];
    } catch (error) {
      console.warn('Errore nel caricamento foto dalla collection legacy:', error);
    }
    
    // Combina foto da entrambe le collezioni
    const allPhotos = [...newPhotos, ...legacyPhotos];
    
    // Deduplica basandosi sul nome del file
    const uniquePhotos = allPhotos.filter((photo, index, self) => 
      index === self.findIndex(p => p.name === photo.name)
    );
    
    // Ordina per data di creazione se non è specificato un capitolo
    if (!chapterId) {
      uniquePhotos.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB.getTime() - dateA.getTime();
      });
    }
    
    return uniquePhotos;
  } catch (error) {
    logger.error('Errore nel caricamento foto', { error: error instanceof Error ? error : new Error(String(error)), galleryId });
    throw error;
  }
}

export async function getTopLikedPhotos(galleryId: string, limitCount: number = 10): Promise<PhotoData[]> {
  try {
    // DOPPIA LOGICA: Prima ottieni foto dalla nuova collection globale
    const newPhotosQuery = query(
      collection(db, 'photos'),
      where('galleryId', '==', galleryId)
    );
    const newPhotosSnapshot = await getDocs(newPhotosQuery);
    
    // Poi ottieni foto dalla vecchia collection legacy
    const legacyPhotosSnapshot = await getDocs(
      collection(db, 'galleries', galleryId, 'photos')
    );
    
    // Combina foto da entrambe le collezioni
    const newPhotos = newPhotosSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as PhotoData[];
    
    const legacyPhotos = legacyPhotosSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as PhotoData[];
    
    // Combina e deduplica foto (rimuovi duplicati basati su nome file)
    const allPhotos = [...newPhotos, ...legacyPhotos];
    const uniquePhotos = allPhotos.filter((photo, index, self) => 
      index === self.findIndex(p => p.name === photo.name)
    );
    
    logger.info('Foto totali nella galleria (new + legacy)', { 
      galleryId, 
      metadata: { 
        newPhotos: newPhotos.length,
        legacyPhotos: legacyPhotos.length,
        totalPhotos: uniquePhotos.length
      } 
    });
    
    // Se non ci sono foto, restituisci array vuoto
    if (uniquePhotos.length === 0) {
      logger.info('Nessuna foto trovata nella galleria', { galleryId });
      return [];
    }
    
    // Ora ottieni tutti i like per contare quanti like ha ogni foto
    const likesSnapshot = await getDocs(collection(db, 'likes'));
    const likesData = likesSnapshot.docs.map(doc => doc.data());
    
    // Conta i like per ogni foto (usa anche itemId per compatibilità)
    const photoLikesCount: Record<string, number> = {};
    likesData.forEach(like => {
      if (like.photoId) {
        photoLikesCount[like.photoId] = (photoLikesCount[like.photoId] || 0) + 1;
      }
      if (like.itemId) {
        photoLikesCount[like.itemId] = (photoLikesCount[like.itemId] || 0) + 1;
      }
    });
    
    // Ora ottieni tutti i commenti per contare quanti commenti ha ogni foto
    const commentsSnapshot = await getDocs(collection(db, 'comments'));
    const commentsData = commentsSnapshot.docs.map(doc => doc.data());
    
    // Conta i commenti per ogni foto (usa anche itemId per compatibilità)
    const photoCommentsCount: Record<string, number> = {};
    commentsData.forEach(comment => {
      if (comment.photoId) {
        photoCommentsCount[comment.photoId] = (photoCommentsCount[comment.photoId] || 0) + 1;
      }
      if (comment.itemId) {
        photoCommentsCount[comment.itemId] = (photoCommentsCount[comment.itemId] || 0) + 1;
      }
    });
    
    // Aggiungi il conteggio dei like e commenti a ogni foto (usa uniquePhotos invece di photos)
    const photosWithLikes = uniquePhotos.map(photo => ({
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
      metadata: { topPhotos: sortedPhotos.map(p => ({ id: p.id, likes: p.likes, comments: p.comments, name: p.name })) }
    });
    
    return sortedPhotos;
  } catch (error) {
    logger.error('Errore nel caricamento foto più apprezzate', { error: error instanceof Error ? error : new Error(String(error)), galleryId });
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
      logger.error('Errore anche nel fallback', { error: fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)), galleryId });
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
    logger.error('Errore nel toggle like', { error: error instanceof Error ? error : new Error(String(error)), galleryId, metadata: { photoId, userEmail } });
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
    logger.error('Errore nel caricamento stato like', { error: error instanceof Error ? error : new Error(String(error)), galleryId, metadata: { photoId, userEmail } });
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
    logger.error('Errore nel caricamento commenti', { error: error instanceof Error ? error : new Error(String(error)), galleryId, metadata: { photoId } });
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
    logger.error('Errore nell\'aggiunta commento', { error: error instanceof Error ? error : new Error(String(error)), galleryId, metadata: { photoId, userEmail } });
    throw error;
  }
}

export async function getRecentComments(galleryId: string, limitCount: number = 10): Promise<CommentData[]> {
  try {
    // DOPPIA LOGICA: Prima ottieni commenti dalla nuova collection globale
    const newCommentsQuery = query(
      collection(db, 'comments'),
      where('galleryId', '==', galleryId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    let newComments: CommentData[] = [];
    try {
      const newCommentsSnapshot = await getDocs(newCommentsQuery);
      newComments = newCommentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CommentData[];
    } catch (error) {
      console.warn('Errore nel caricamento commenti dalla collection globale:', error);
    }
    
    // Poi ottieni commenti dalla vecchia collection legacy
    let legacyComments: CommentData[] = [];
    try {
      const legacyCommentsQuery = query(
        collection(db, 'galleries', galleryId, 'comments'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      
      const legacyCommentsSnapshot = await getDocs(legacyCommentsQuery);
      legacyComments = legacyCommentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CommentData[];
    } catch (error) {
      console.warn('Errore nel caricamento commenti dalla collection legacy:', error);
    }
    
    // Combina commenti da entrambe le collezioni
    const allComments = [...newComments, ...legacyComments];
    
    // Ordina per data di creazione e prendi solo i più recenti
    const sortedComments = allComments
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, limitCount);
    
    return sortedComments;
  } catch (error) {
    logger.error('Errore nel caricamento commenti recenti', { error: error instanceof Error ? error : new Error(String(error)), galleryId });
    throw error;
  }
}

// ==================== VOICE MEMOS API ====================

export async function getRecentVoiceMemos(galleryId: string, limitCount: number = 10): Promise<VoiceMemoData[]> {
  try {
    // DOPPIA LOGICA: Prima ottieni voice memos dalla nuova collection globale
    const newMemosQuery = query(
      collection(db, 'voice-memos'),
      where('galleryId', '==', galleryId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    let newMemos: VoiceMemoData[] = [];
    try {
      const newMemosSnapshot = await getDocs(newMemosQuery);
      newMemos = newMemosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as VoiceMemoData[];
    } catch (error) {
      console.warn('Errore nel caricamento voice memos dalla collection globale:', error);
    }
    
    // Poi ottieni voice memos dalla vecchia collection legacy
    let legacyMemos: VoiceMemoData[] = [];
    try {
      const legacyMemosQuery = query(
        collection(db, 'galleries', galleryId, 'voice-memos'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      
      const legacyMemosSnapshot = await getDocs(legacyMemosQuery);
      legacyMemos = legacyMemosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as VoiceMemoData[];
    } catch (error) {
      console.warn('Errore nel caricamento voice memos dalla collection legacy:', error);
    }
    
    // Combina voice memos da entrambe le collezioni
    const allMemos = [...newMemos, ...legacyMemos];
    
    // Ordina per data di creazione e prendi solo i più recenti
    const sortedMemos = allMemos
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, limitCount);
    
    return sortedMemos;
  } catch (error) {
    logger.error('Errore nel caricamento voice memos', { error: error instanceof Error ? error : new Error(String(error)), galleryId });
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
    logger.error('Errore nell\'aggiunta voice memo', { error: error instanceof Error ? error : new Error(String(error)), galleryId, metadata: { userEmail } });
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
    logger.error('Errore nel caricamento gallerie', { error: error instanceof Error ? error : new Error(String(error)) });
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
    logger.error('Errore nella creazione galleria', { error: error instanceof Error ? error : new Error(String(error)) });
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
    logger.error('Errore nell\'aggiornamento galleria', { error: error instanceof Error ? error : new Error(String(error)), galleryId });
    throw error;
  }
}

export async function deleteGallery(galleryId: string): Promise<void> {
  try {
    const galleryRef = doc(db, 'galleries', galleryId);
    await deleteDoc(galleryRef);
  } catch (error) {
    logger.error('Errore nell\'eliminazione galleria', { error: error instanceof Error ? error : new Error(String(error)), galleryId });
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