/**
 * Firebase Couple Story Service
 * Gestisce operazioni CRUD per le storie della coppia
 */

import { 
  collection, 
  doc, 
  getDoc, 
  setDoc,
  deleteDoc, 
  query, 
  where, 
  onSnapshot,
  serverTimestamp,
  getDocs,
  limit
} from 'firebase/firestore';
import { db } from './firebase';
import { 
  CoupleStory, 
  InsertCoupleStory, 
  ImportStoryJson, 
  insertCoupleStorySchema,
  importStoryJsonSchema,
  normalizeImportedStory
} from '@shared/schema';

export class StoryService {
  /**
   * Ottieni storia della coppia per ID galleria
   */
  static async getStoryByGalleryId(galleryId: string): Promise<CoupleStory | null> {
    console.log('🔍 [GET] Caricamento storia per galleryId:', galleryId);
    console.log('🔍 [GET] Ricerca in collection: coupleStories, document ID:', galleryId);
    
    try {
      const storyDoc = await getDoc(doc(db, 'coupleStories', galleryId));
      
      if (storyDoc.exists()) {
        console.log('✅ [GET] Storia trovata in Firebase!');
        const storyData = { id: storyDoc.id, ...storyDoc.data() } as CoupleStory;
        console.log('📖 [GET] Dati storia:', { 
          titolo: storyData.metadata?.titolo,
          pagine: (storyData as any).contenuto?.length || 0,
          galleryId: storyData.galleryId,
          documentId: storyDoc.id
        });
        return storyData;
      } else {
        console.log('❌ [GET] Nessuna storia trovata per questo galleryId');
        
        // DEBUG: Controlliamo se esistono storie con galleryId diverso dal document ID
        console.log('🔎 [DEBUG] Controllo alternativo: cerco storie dove galleryId field = document ID...');
        const alternativeQuery = query(
          collection(db, 'coupleStories'),
          where('galleryId', '==', galleryId),
          limit(1)
        );
        
        try {
          const alternativeSnapshot = await getDocs(alternativeQuery);
          if (!alternativeSnapshot.empty) {
            const alternativeDoc = alternativeSnapshot.docs[0];
            console.log('🎯 [DEBUG] TROVATA STORIA ALTERNATIVA!', {
              documentId: alternativeDoc.id,
              galleryIdField: alternativeDoc.data().galleryId,
              searchedGalleryId: galleryId
            });
            const storyData = { id: alternativeDoc.id, ...alternativeDoc.data() } as CoupleStory;
            return storyData;
          } else {
            console.log('🚫 [DEBUG] Nessuna storia trovata anche con query alternativa');
          }
        } catch (alternativeError) {
          console.log('⚠️ [DEBUG] Errore nella query alternativa:', alternativeError);
        }
        
        // DEBUG: Mostriamo tutte le storie esistenti per debug
        console.log('🔎 [DEBUG] Lista di TUTTE le storie esistenti nella collection:');
        try {
          const allStoriesSnapshot = await getDocs(collection(db, 'coupleStories'));
          allStoriesSnapshot.docs.forEach((doc, index) => {
            console.log(`📚 [DEBUG] Storia ${index + 1}:`, {
              documentId: doc.id,
              galleryIdField: doc.data().galleryId,
              metadata: doc.data().metadata
            });
          });
        } catch (allStoriesError) {
          console.log('⚠️ [DEBUG] Errore nel caricamento di tutte le storie:', allStoriesError);
        }
        
        return null;
      }
    } catch (error) {
      console.error('💥 [GET] Errore recupero storia coppia:', error);
      return null;
    }
  }

  /**
   * Salva storia della coppia (crea o aggiorna)
   */
  static async saveStory(
    galleryId: string, 
    storyData: Omit<InsertCoupleStory, 'galleryId'>,
    userEmail?: string
  ): Promise<void> {
    console.log('🚀 [SAVE] Inizio salvataggio storia:', { galleryId, userEmail });
    
    try {
      // Valida i dati usando lo schema Zod
      console.log('📝 [SAVE] Validazione dati...');
      const validatedData = insertCoupleStorySchema.parse({
        ...storyData,
        galleryId
      });
      console.log('✅ [SAVE] Dati validati con successo');

      // Prepara il documento con timestamp
      const storyDocument: any = {
        ...validatedData,
        updatedAt: serverTimestamp(),
        updatedBy: userEmail || undefined
      };

      // Verifica se esiste già una storia
      console.log('🔍 [SAVE] Controllo storia esistente...');
      const existingStory = await StoryService.getStoryByGalleryId(galleryId);
      
      if (!existingStory) {
        console.log('🆕 [SAVE] Creazione nuova storia');
        storyDocument.createdAt = serverTimestamp();
        storyDocument.createdBy = userEmail || undefined;
      } else {
        console.log('🔄 [SAVE] Aggiornamento storia esistente');
      }

      console.log('💾 [SAVE] Salvataggio su Firebase Firestore...');
      console.log('💾 [SAVE] Collection: coupleStories, Document ID:', galleryId);
      console.log('💾 [SAVE] Story document preview:', {
        galleryId: storyDocument.galleryId,
        metadataTitolo: storyDocument.metadata?.titolo,
        hasPrologo: !!storyDocument.prologo,
        hasCapitoli: Object.keys(storyDocument).filter(key => key.startsWith('capitolo_')).length
      });
      
      await setDoc(doc(db, 'coupleStories', galleryId), storyDocument, { merge: true });
      console.log('✅ [SAVE] Storia salvata con successo!');
      console.log('✅ [SAVE] Document ID utilizzato:', galleryId);
    } catch (error) {
      console.error('Errore salvataggio storia coppia:', error);
      throw error;
    }
  }

  /**
   * Importa e salva storia da JSON raw (da ChatGPT)
   */
  static async importStoryFromJson(
    galleryId: string,
    rawJsonData: unknown,
    userEmail?: string
  ): Promise<void> {
    try {
      // Valida il JSON raw usando lo schema di import
      const validatedRawData = importStoryJsonSchema.parse(rawJsonData);
      
      // Normalizza i dati al formato interno
      const normalizedData = normalizeImportedStory(validatedRawData);
      
      // Salva usando il metodo standard
      await StoryService.saveStory(galleryId, normalizedData, userEmail);
    } catch (error) {
      console.error('Errore import storia da JSON:', error);
      throw error;
    }
  }

  /**
   * Valida JSON di import senza salvare
   */
  static validateImportJson(rawJsonData: unknown): {
    isValid: boolean;
    error?: string;
    normalizedData?: Partial<InsertCoupleStory>;
  } {
    try {
      // Valida il JSON raw
      const validatedRawData = importStoryJsonSchema.parse(rawJsonData);
      
      // Normalizza i dati
      const normalizedData = normalizeImportedStory(validatedRawData);
      
      return {
        isValid: true,
        normalizedData
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Errore di validazione sconosciuto'
      };
    }
  }

  /**
   * Elimina storia della coppia
   */
  static async deleteStory(galleryId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'coupleStories', galleryId));
    } catch (error) {
      console.error('Errore eliminazione storia coppia:', error);
      throw error;
    }
  }

  /**
   * Verifica se esiste una storia per la galleria
   */
  static async hasStory(galleryId: string): Promise<boolean> {
    try {
      const storyDoc = await getDoc(doc(db, 'coupleStories', galleryId));
      return storyDoc.exists();
    } catch (error) {
      console.error('Errore verifica esistenza storia:', error);
      return false;
    }
  }

  /**
   * Real-time subscription a storia della coppia
   */
  static subscribeToStory(galleryId: string, callback: (story: CoupleStory | null) => void) {
    return onSnapshot(doc(db, 'coupleStories', galleryId), (doc) => {
      const story = doc.exists() ? { id: doc.id, ...doc.data() } as CoupleStory : null;
      callback(story);
    }, (error) => {
      console.error('Errore subscription storia coppia:', error);
      callback(null);
    });
  }

  /**
   * Debug: Ispeziona collection coupleStories
   */
  static async debugCoupleStoriesCollection(): Promise<void> {
    console.log('🔍 [DEBUG] === ISPEZIONE COLLECTION COUPLE STORIES ===');
    try {
      const storiesQuery = query(collection(db, 'coupleStories'));
      const snapshot = await getDocs(storiesQuery);
      
      console.log(`📊 [DEBUG] Trovate ${snapshot.docs.length} storie nella collection`);
      
      snapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`📖 [DEBUG] Storia ${index + 1}:`, {
          documentId: doc.id,
          galleryId: data.galleryId,
          titolo: data.metadata?.titolo,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      
    } catch (error) {
      console.error('❌ [DEBUG] Errore nell\'ispezione della collection:', error);
    }
    console.log('🔍 [DEBUG] === FINE ISPEZIONE ===');
  }

  /**
   * Ottieni tutte le storie (admin only)
   */
  static async getAllStories(): Promise<CoupleStory[]> {
    try {
      const storiesQuery = query(collection(db, 'coupleStories'));
      const snapshot = await getDocs(storiesQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoupleStory));
    } catch (error) {
      console.error('Errore recupero tutte le storie:', error);
      return [];
    }
  }

  /**
   * Aggiorna metadata della storia
   */
  static async updateMetadata(
    galleryId: string,
    metadata: {
      titolo?: string;
      sottotitolo?: string;
      stile?: string;
      tema?: string;
      colore_principale?: string;
    },
    userEmail?: string
  ): Promise<void> {
    try {
      const updateData = {
        metadata,
        updatedAt: serverTimestamp(),
        updatedBy: userEmail || undefined
      };

      await setDoc(doc(db, 'coupleStories', galleryId), updateData, { merge: true });
    } catch (error) {
      console.error('Errore aggiornamento metadata storia:', error);
      throw error;
    }
  }

  /**
   * Ottieni statistiche storia (numero capitoli, citazioni, etc.)
   */
  static getStoryStats(story: CoupleStory): {
    totalChapters: number;
    totalQuotes: number;
    totalNotes: number;
    hasProlog: boolean;
    hasMetadata: boolean;
  } {
    const chapters = [
      story.capitolo_1_lattesa,
      story.capitolo_2_incontro,
      story.capitolo_3_festa,
      story.capitolo_4_promesse,
      story.capitolo_5_celebrazione,
      story.capitolo_6_eternita
    ].filter(chapter => chapter && chapter.length > 0);

    const quotes = [
      ...(story.citazioni_poetiche || []),
      ...(story.citazioni_religiose || []),
      ...(story.citazioni_moderne || [])
    ];

    return {
      totalChapters: chapters.length,
      totalQuotes: quotes.length,
      totalNotes: story.note_fotografo?.length || 0,
      hasProlog: !!story.prologo,
      hasMetadata: !!story.metadata
    };
  }

  /**
   * Formatta titolo capitolo per display
   */
  static getChapterTitle(chapterKey: string): string {
    const titles = {
      'capitolo_1_lattesa': "L'Attesa",
      'capitolo_2_incontro': "L'Incontro",
      'capitolo_3_festa': "La Festa",
      'capitolo_4_promesse': "Le Promesse",
      'capitolo_5_celebrazione': "La Celebrazione",
      'capitolo_6_eternita': "L'Eternità"
    };

    return titles[chapterKey as keyof typeof titles] || chapterKey;
  }

  /**
   * Ottieni tutti i capitoli disponibili ordinati
   */
  static getAvailableChapters(story: CoupleStory): Array<{
    key: string;
    title: string;
    content: any[];
    isEmpty: boolean;
  }> {
    const chapterKeys = [
      'capitolo_1_lattesa',
      'capitolo_2_incontro', 
      'capitolo_3_festa',
      'capitolo_4_promesse',
      'capitolo_5_celebrazione',
      'capitolo_6_eternita'
    ];

    return chapterKeys.map(key => ({
      key,
      title: StoryService.getChapterTitle(key),
      content: story[key as keyof CoupleStory] as any[] || [],
      isEmpty: !story[key as keyof CoupleStory] || (story[key as keyof CoupleStory] as any[]).length === 0
    })).filter(chapter => !chapter.isEmpty);
  }

  /**
   * Ottieni tutte le citazioni disponibili raggruppate per tipo
   */
  static getAvailableQuotes(story: CoupleStory): {
    poetiche: any[];
    religiose: any[];
    moderne: any[];
    total: number;
  } {
    const poetiche = story.citazioni_poetiche || [];
    const religiose = story.citazioni_religiose || [];
    const moderne = story.citazioni_moderne || [];

    return {
      poetiche,
      religiose,
      moderne,
      total: poetiche.length + religiose.length + moderne.length
    };
  }
}

export default StoryService;