/**
 * Chapter Service - Gestione capitoli galleria
 * I capitoli permettono di organizzare le foto in sezioni logiche
 */

import { 
  doc, 
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from './firebase';
import { nanoid } from 'nanoid';
import type { Gallery, Chapter } from './galleries';

export class ChapterService {
  /**
   * Crea un nuovo capitolo nella galleria
   */
  static async createChapter(
    galleryId: string, 
    titolo: string, 
    descrizione?: string
  ): Promise<Chapter> {
    const galleryRef = doc(db, 'galleries', galleryId);
    
    const newChapter: Chapter = {
      id: nanoid(10),
      titolo,
      descrizione: descrizione || '',
      ordine: Date.now(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await updateDoc(galleryRef, {
      chapters: arrayUnion(newChapter),
      chaptersEnabled: true,
      updatedAt: serverTimestamp()
    });
    
    return newChapter;
  }

  /**
   * Aggiorna un capitolo esistente
   */
  static async updateChapter(
    galleryId: string,
    gallery: Gallery,
    chapterId: string,
    updates: Partial<Pick<Chapter, 'titolo' | 'descrizione' | 'coverPhotoId' | 'coverPhotoUrl'>>
  ): Promise<void> {
    const galleryRef = doc(db, 'galleries', galleryId);
    
    const updatedChapters = (gallery.chapters || []).map(ch => {
      if (ch.id === chapterId) {
        return {
          ...ch,
          ...updates,
          updatedAt: new Date()
        };
      }
      return ch;
    });
    
    await updateDoc(galleryRef, {
      chapters: updatedChapters,
      updatedAt: serverTimestamp()
    });
  }

  /**
   * Elimina un capitolo (le foto tornano a "Non assegnate")
   */
  static async deleteChapter(
    galleryId: string,
    gallery: Gallery,
    chapterId: string
  ): Promise<void> {
    const galleryRef = doc(db, 'galleries', galleryId);
    
    const { collection, query, where, getDocs, writeBatch } = await import('firebase/firestore');
    const photosRef = collection(db, 'photos');
    const photosQuery = query(
      photosRef,
      where('galleryId', '==', galleryId),
      where('chapterId', '==', chapterId)
    );
    const photosSnapshot = await getDocs(photosQuery);
    
    if (!photosSnapshot.empty) {
      const BATCH_LIMIT = 450;
      const docs = photosSnapshot.docs;
      
      for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + BATCH_LIMIT);
        chunk.forEach(photoDoc => {
          batch.update(photoDoc.ref, { chapterId: null });
        });
        await batch.commit();
      }
    }
    
    const filteredChapters = (gallery.chapters || []).filter(ch => ch.id !== chapterId);
    
    await updateDoc(galleryRef, {
      chapters: filteredChapters,
      chaptersEnabled: filteredChapters.length > 0,
      updatedAt: serverTimestamp()
    });
  }

  /**
   * Riordina i capitoli (drag & drop)
   */
  static async reorderChapters(
    galleryId: string,
    reorderedChapters: Chapter[]
  ): Promise<void> {
    const galleryRef = doc(db, 'galleries', galleryId);
    
    const chaptersWithNewOrder = reorderedChapters.map((ch, index) => ({
      ...ch,
      ordine: index,
      updatedAt: new Date()
    }));
    
    await updateDoc(galleryRef, {
      chapters: chaptersWithNewOrder,
      updatedAt: serverTimestamp()
    });
  }

  /**
   * Imposta la foto di copertina per un capitolo
   */
  static async setChapterCover(
    galleryId: string,
    gallery: Gallery,
    chapterId: string,
    photoId: string | null
  ): Promise<void> {
    await ChapterService.updateChapter(galleryId, gallery, chapterId, {
      coverPhotoId: photoId || undefined
    });
  }

  /**
   * Ottiene i capitoli ordinati per una galleria
   */
  static getOrderedChapters(gallery: Gallery): Chapter[] {
    if (!gallery.chapters || gallery.chapters.length === 0) {
      return [];
    }
    
    return [...gallery.chapters].sort((a, b) => a.ordine - b.ordine);
  }

  /**
   * Abilita/disabilita il sistema capitoli
   */
  static async toggleChaptersEnabled(
    galleryId: string,
    enabled: boolean
  ): Promise<void> {
    const galleryRef = doc(db, 'galleries', galleryId);
    
    await updateDoc(galleryRef, {
      chaptersEnabled: enabled,
      updatedAt: serverTimestamp()
    });
  }
}
