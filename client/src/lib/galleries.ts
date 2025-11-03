/**
 * Firebase Gallery Service
 * Gestisce operazioni CRUD per le gallerie fotografiche
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
  onSnapshot,
  limit
} from 'firebase/firestore';
import { db } from './firebase';

export interface Gallery {
  id: string;
  name: string;
  code: string;
  password?: string;
  date: string;
  location: string;
  description?: string;
  coverImageUrl?: string;
  youtubeUrl?: string;
  photoCount: number;
  active: boolean;
  userId?: string;
  createdAt: any;
  updatedAt: any;
  
  // Security features (migrated from server)
  requiresSecurityQuestion?: boolean;
  securityQuestionType?: 'bride_name' | 'groom_name' | 'wedding_location' | 'wedding_date' | 'custom';
  securityQuestionCustom?: string;
  securityAnswer?: string;
  
  // Special Theme fields (seasonal galleries)
  specialTheme?: string;
  specialPin?: string;
  
  // Photo Selection Mode
  selectionEnabled?: boolean;
  requiredPhotoCount?: number;
  selectionStatus?: 'pending' | 'completed';
  selectedPhotoIds?: string[];
  selectionDeadline?: any;
  selectionDeadlineEnforced?: boolean;
  selectionNotes?: string; // Note cliente durante selezione foto
  
  // Booking Integration
  bookingId?: string;
}

export interface GalleryAccessInfo {
  requiresPassword: boolean;
  requiresSecurityQuestion: boolean;
  securityQuestion?: string;
}

export class GalleryService {
  /**
   * Ottieni tutte le gallerie attive
   */
  static async getAllGalleries(): Promise<Gallery[]> {
    try {
      // Rimuovo orderBy per evitare "failed-precondition" (manca indice composito)
      // Ordino client-side invece
      const galleriesQuery = query(
        collection(db, 'galleries'), 
        where('active', '==', true)
      );
      const snapshot = await getDocs(galleriesQuery);
      const galleries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Gallery));
      
      // Ordina per createdAt (desc) client-side
      return galleries.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
    } catch (error) {
      console.error('Errore recupero gallerie:', error);
      return [];
    }
  }

  /**
   * Ottieni TUTTE le gallerie (incluse disattivate) - Solo per admin
   */
  static async getAllGalleriesForAdmin(): Promise<Gallery[]> {
    try {
      // Admin vede TUTTE le gallerie (anche disattivate)
      const galleriesQuery = query(
        collection(db, 'galleries'),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(galleriesQuery);
      const galleries = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        // Assicura che active sia sempre boolean (default true)
        active: doc.data().active !== undefined ? doc.data().active : true
      } as Gallery));
      
      return galleries;
    } catch (error) {
      console.error('Errore recupero gallerie admin:', error);
      throw error; // Lancia errore per error handling React Query
    }
  }

  /**
   * Ottieni galleria per ID
   */
  static async getGalleryById(id: string): Promise<Gallery | null> {
    try {
      const galleryDoc = await getDoc(doc(db, 'galleries', id));
      return galleryDoc.exists() ? { id: galleryDoc.id, ...galleryDoc.data() } as Gallery : null;
    } catch (error) {
      console.error('Errore recupero galleria per ID:', error);
      return null;
    }
  }

  /**
   * Ottieni galleria per codice
   */
  static async getGalleryByCode(code: string): Promise<Gallery | null> {
    try {
      const galleriesQuery = query(
        collection(db, 'galleries'), 
        where('code', '==', code),
        where('active', '==', true),
        limit(1)
      );
      const snapshot = await getDocs(galleriesQuery);
      return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Gallery;
    } catch (error) {
      console.error('Errore recupero galleria per codice:', error);
      return null;
    }
  }

  /**
   * Ottieni informazioni di accesso alla galleria
   */
  static getGalleryAccessInfo(gallery: Gallery): GalleryAccessInfo {
    return {
      requiresPassword: !!gallery.password,
      requiresSecurityQuestion: !!gallery.requiresSecurityQuestion,
      securityQuestion: gallery.requiresSecurityQuestion && gallery.securityQuestionType 
        ? this.getSecurityQuestionText(gallery.securityQuestionType, gallery.securityQuestionCustom)
        : undefined
    };
  }

  /**
   * Verifica accesso alla galleria
   */
  static verifyGalleryAccess(
    gallery: Gallery, 
    password?: string, 
    securityAnswer?: string
  ): boolean {
    // Verifica password se richiesta
    if (gallery.password && gallery.password !== password) {
      return false;
    }

    // Verifica domanda di sicurezza se richiesta
    if (gallery.requiresSecurityQuestion && gallery.securityAnswer) {
      if (!securityAnswer || 
          gallery.securityAnswer.toLowerCase().trim() !== securityAnswer.toLowerCase().trim()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Crea nuova galleria (admin only)
   */
  static async createGallery(galleryData: Omit<Gallery, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'galleries'), {
        ...galleryData,
        active: true,
        photoCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      console.error('Errore creazione galleria:', error);
      throw error;
    }
  }

  /**
   * Aggiorna galleria (admin only)
   */
  static async updateGallery(id: string, updates: Partial<Gallery>): Promise<void> {
    try {
      // Rimuovi campi non aggiornabili
      const { id: _, createdAt, ...allowedUpdates } = updates;
      
      await updateDoc(doc(db, 'galleries', id), {
        ...allowedUpdates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Errore aggiornamento galleria:', error);
      throw error;
    }
  }

  /**
   * Aggiorna domanda di sicurezza (admin only)
   */
  static async updateSecurityQuestion(
    galleryId: string,
    requiresSecurityQuestion: boolean,
    securityQuestionType?: string,
    securityQuestionCustom?: string,
    securityAnswer?: string
  ): Promise<void> {
    try {
      const updateData: any = {
        requiresSecurityQuestion,
        updatedAt: serverTimestamp()
      };

      if (requiresSecurityQuestion) {
        if (!securityQuestionType || !securityAnswer) {
          throw new Error('Tipo domanda e risposta richiesti quando la sicurezza è abilitata');
        }

        updateData.securityQuestionType = securityQuestionType;
        updateData.securityAnswer = securityAnswer.trim();

        if (securityQuestionType === 'custom') {
          if (!securityQuestionCustom) {
            throw new Error('Domanda personalizzata richiesta per tipo custom');
          }
          updateData.securityQuestionCustom = securityQuestionCustom.trim();
        } else {
          updateData.securityQuestionCustom = null;
        }
      } else {
        // Se disabilitata, rimuovi tutti i campi
        updateData.securityQuestionType = null;
        updateData.securityQuestionCustom = null;
        updateData.securityAnswer = null;
      }

      await updateDoc(doc(db, 'galleries', galleryId), updateData);
    } catch (error) {
      console.error('Errore aggiornamento domanda sicurezza:', error);
      throw error;
    }
  }

  /**
   * Elimina galleria (soft delete - admin only)
   */
  static async deleteGallery(id: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'galleries', id), { 
        active: false, 
        updatedAt: serverTimestamp() 
      });
    } catch (error) {
      console.error('Errore eliminazione galleria:', error);
      throw error;
    }
  }

  /**
   * Incrementa contatore foto
   */
  static async incrementPhotoCount(galleryId: string, increment: number = 1): Promise<void> {
    try {
      const galleryRef = doc(db, 'galleries', galleryId);
      const galleryDoc = await getDoc(galleryRef);
      
      if (galleryDoc.exists()) {
        const currentCount = galleryDoc.data().photoCount || 0;
        await updateDoc(galleryRef, {
          photoCount: currentCount + increment,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Errore incremento contatore foto:', error);
      // Non lanciare errore - non è critico
    }
  }

  /**
   * Real-time subscription a singola galleria
   */
  static subscribeToGallery(id: string, callback: (gallery: Gallery | null) => void) {
    return onSnapshot(doc(db, 'galleries', id), (doc) => {
      const gallery = doc.exists() ? { id: doc.id, ...doc.data() } as Gallery : null;
      callback(gallery);
    }, (error) => {
      console.error('Errore subscription galleria:', error);
      callback(null);
    });
  }

  /**
   * Real-time subscription a tutte le gallerie
   */
  static subscribeToGalleries(callback: (galleries: Gallery[]) => void) {
    // Rimuovo orderBy per evitare "failed-precondition" (manca indice composito)
    const q = query(
      collection(db, 'galleries'), 
      where('active', '==', true)
    );
    
    return onSnapshot(q, (snapshot) => {
      const galleries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Gallery));
      
      // Ordina per createdAt (desc) client-side
      const sorted = galleries.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
      
      callback(sorted);
    }, (error) => {
      console.error('Errore subscription gallerie:', error);
      callback([]);
    });
  }

  /**
   * Genera testo domanda di sicurezza
   */
  private static getSecurityQuestionText(type: string, customQuestion?: string): string {
    switch (type) {
      case 'bride_name':
        return 'Qual è il nome della sposa?';
      case 'groom_name':
        return 'Qual è il nome dello sposo?';
      case 'wedding_location':
        return 'Dove si è svolto il matrimonio?';
      case 'wedding_date':
        return 'In che data si è svolto il matrimonio? (formato: GG/MM/AAAA)';
      case 'custom':
        return customQuestion || 'Domanda personalizzata';
      default:
        return 'Domanda di sicurezza';
    }
  }
}

export default GalleryService;