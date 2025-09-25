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
   * 🔧 ROBUSTO: Ottieni storia della coppia con cache busting e retry
   */
  static async getStoryByGalleryId(galleryId: string): Promise<CoupleStory | null> {
    console.log('🔍 [GET] ROBUSTO: Caricamento storia per galleryId:', galleryId);
    
    try {
      // 🚀 STRATEGIA 1: Direct document fetch con force refresh
      const storyDocRef = doc(db, 'coupleStories', galleryId);
      const storyDoc = await getDoc(storyDocRef);
      
      if (storyDoc.exists()) {
        console.log('✅ [GET] Storia trovata - Direct fetch!');
        const storyData = { 
          id: storyDoc.id, 
          ...storyDoc.data(),
          galleryId // Forza sempre galleryId per coerenza
        } as CoupleStory;
        
        // Valida che sia una storia valida per CoupleStoryBook
        if (this.validateStoryStructure(storyData)) {
          console.log('📖 [GET] Storia valida:', { 
            titolo: storyData.metadata?.titolo,
            hasPrologo: !!storyData.prologo,
            hasChapters: Object.keys(storyData).filter(k => k.startsWith('capitolo_')).length
          });
          return storyData;
        } else {
          console.warn('⚠️ [GET] Storia trovata ma struttura non valida');
        }
      }
      
      // 🚀 STRATEGIA 2: Query fallback per inconsistenze ID
      console.log('🔎 [GET] Fallback: Query per galleryId field...');
      const querySnapshot = await getDocs(
        query(
          collection(db, 'coupleStories'),
          where('galleryId', '==', galleryId),
          limit(1)
        )
      );
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        console.log('🎯 [GET] Storia trovata via query!', {
          documentId: doc.id,
          galleryIdField: doc.data().galleryId
        });
        const storyData = { 
          id: doc.id, 
          ...doc.data(),
          galleryId
        } as CoupleStory;
        return storyData;
      }
      
      console.log('❌ [GET] Nessuna storia trovata');
      return null;
      
    } catch (error) {
      console.error('💥 [GET] Errore recupero storia:', error);
      return null;
    }
  }
  
  /**
   * 🔍 Valida che la storia abbia la struttura minima per CoupleStoryBook
   */
  private static validateStoryStructure(story: any): boolean {
    return !!(
      story &&
      story.galleryId &&
      (story.prologo || 
       story.capitolo_1_lattesa || 
       story.capitolo_2_incontro ||
       story.metadata?.titolo)
    );
  }

  /**
   * 🧹 PULIZIA: Rimuove ricorsivamente tutti i valori undefined (Firebase non li accetta)
   */
  private static cleanFirebaseData(obj: any): any {
    if (obj === null || obj === undefined) {
      return null; // Firebase accetta null ma non undefined
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanFirebaseData(item)).filter(item => item !== null);
    }
    
    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanedValue = this.cleanFirebaseData(value);
        if (cleanedValue !== null && cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
        }
      }
      return cleaned;
    }
    
    return obj;
  }
  
  /**
   * 🔧 ROBUSTO: Salva storia con pulizia undefined e verifica immediata
   */
  static async saveStory(
    galleryId: string, 
    storyData: Omit<InsertCoupleStory, 'galleryId'>,
    userEmail?: string
  ): Promise<void> {
    console.log('🚀 [SAVE] ROBUSTO: Inizio salvataggio storia:', { galleryId, userEmail });
    
    try {
      // 🧹 PULIZIA CRITICA: Rimuovi tutti i valori undefined
      console.log('🧹 [SAVE] PULIZIA: Rimozione valori undefined...');
      const cleanedStoryData = this.cleanFirebaseData(storyData);
      console.log('✅ [SAVE] PULIZIA: Dati puliti da undefined');
      
      // 🔧 Prepara documento con timestamp deterministico
      const now = Date.now();
      const storyDocument: any = {
        ...cleanedStoryData,
        galleryId, // Forza sempre galleryId
        id: galleryId, // Forza ID per coerenza
        updatedAt: now, // Usa timestamp deterministico
        updatedBy: userEmail || 'admin'
      };
      
      // Controlla se è nuova storia
      const existingStory = await this.getStoryByGalleryId(galleryId);
      if (!existingStory) {
        storyDocument.createdAt = now;
        storyDocument.createdBy = userEmail || 'admin';
        console.log('🆕 [SAVE] ROBUSTO: Nuova storia');
      } else {
        storyDocument.createdAt = existingStory.createdAt || now;
        storyDocument.createdBy = existingStory.createdBy || 'admin';
        console.log('🔄 [SAVE] ROBUSTO: Aggiornamento storia');
      }
      
      // 🧹 PULIZIA FINALE: Assicurati che non ci siano undefined nel documento finale
      const finalDocument = this.cleanFirebaseData(storyDocument);
      
      console.log('💾 [SAVE] ROBUSTO: Documento finale pulito:', {
        docId: galleryId,
        galleryIdField: finalDocument.galleryId,
        hasPrologo: !!finalDocument.prologo,
        hasChapters: Object.keys(finalDocument).filter(k => k.startsWith('capitolo_')).length,
        metadata: finalDocument.metadata?.titolo,
        hasUndefined: JSON.stringify(finalDocument).includes('undefined') // Debug check
      });
      
      // ⚠️ VERIFICA PRE-SAVE: Controlla che non ci siano undefined
      const jsonString = JSON.stringify(finalDocument);
      if (jsonString.includes('undefined')) {
        console.error('❌ [SAVE] ERRORE: Trovato undefined nel documento finale!');
        console.error('🔍 [SAVE] Documento problematico:', finalDocument);
        throw new Error('Documento contiene valori undefined non compatibili con Firebase');
      }
      
      // 🎯 SALVATAGGIO ATOMICO
      const docRef = doc(db, 'coupleStories', galleryId);
      await setDoc(docRef, finalDocument); // NO merge per evitare inconsistenze
      
      // ✅ VERIFICA IMMEDIATA del salvataggio
      console.log('🔍 [SAVE] ROBUSTO: Verifica immediata...');
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms per commit
      
      const verifyDoc = await getDoc(docRef);
      if (verifyDoc.exists()) {
        const verifyData = verifyDoc.data();
        console.log('✅ [SAVE] ROBUSTO: VERIFICATO! Storia salvata e leggibile:', {
          docId: verifyDoc.id,
          galleryIdField: verifyData.galleryId,
          timestamp: verifyData.updatedAt
        });
      } else {
        throw new Error('SAVE FALLITO: Documento non trovato dopo salvataggio');
      }
      
    } catch (error) {
      console.error('💥 [SAVE] ROBUSTO: Errore salvataggio:', error);
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

  /**
   * 📦 DEBUG: Funzione completa per ispezionare Firestore coupleStories
   */
  static async debugFirestoreStories(): Promise<void> {
    console.log('\n🔬 ===== DEBUG FIRESTORE COUPLE STORIES =====');
    
    try {
      const allStoriesSnapshot = await getDocs(collection(db, 'coupleStories'));
      
      console.log(`📊 TOTALE STORIE TROVATE: ${allStoriesSnapshot.docs.length}`);
      
      if (allStoriesSnapshot.empty) {
        console.log('❌ NESSUNA STORIA TROVATA nella collection coupleStories');
        return;
      }
      
      allStoriesSnapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`\n📚 [${index + 1}] STORIA ANALISI:`);
        console.log('   📄 Document ID:', doc.id);
        console.log('   🔗 Campo galleryId:', data.galleryId);
        console.log('   ✅ ID Match:', doc.id === data.galleryId ? 'SI' : 'NO');
        console.log('   📖 Titolo:', data.metadata?.titolo || 'N/A');
        console.log('   📝 Prologo:', !!data.prologo ? 'SI' : 'NO');
        console.log('   📑 Capitoli:', Object.keys(data).filter(k => k.startsWith('capitolo_')).length);
        console.log('   🕐 CreatedAt:', data.createdAt);
        console.log('   🕐 UpdatedAt:', data.updatedAt);
        console.log('   👤 CreatedBy:', data.createdBy || 'N/A');
        
        // Valida struttura per CoupleStoryBook
        const isValid = this.validateStoryStructure(data);
        console.log('   ✅ Struttura Valida:', isValid ? 'SI' : 'NO');
        
        if (!isValid) {
          console.log('   ⚠️ PROBLEMA: Struttura non valida per CoupleStoryBook');
        }
      });
      
      console.log('\n🔬 ===== FINE DEBUG =====\n');
      
    } catch (error) {
      console.error('💥 Errore durante debug Firestore:', error);
    }
  }
  
  /**
   * 🧪 TEST: Verifica lettura specifica galleryId con diagnostica completa
   */
  static async testStoryRetrieval(galleryId: string): Promise<boolean> {
    console.log(`\n🧪 ===== TEST RETRIEVAL: ${galleryId} =====`);
    
    try {
      // Test 1: Direct document fetch
      console.log('🔬 TEST 1: Direct getDoc...');
      const directDoc = await getDoc(doc(db, 'coupleStories', galleryId));
      console.log('   Risultato:', directDoc.exists() ? 'TROVATO' : 'NON TROVATO');
      
      if (directDoc.exists()) {
        console.log('   Data preview:', {
          galleryId: directDoc.data()?.galleryId,
          titolo: directDoc.data()?.metadata?.titolo
        });
      }
      
      // Test 2: Query where galleryId
      console.log('🔬 TEST 2: Query where galleryId...');
      const querySnapshot = await getDocs(
        query(
          collection(db, 'coupleStories'),
          where('galleryId', '==', galleryId)
        )
      );
      console.log('   Risultato:', querySnapshot.empty ? 'NON TROVATO' : `TROVATO ${querySnapshot.docs.length} docs`);
      
      // Test 3: Service method
      console.log('🔬 TEST 3: StoryService.getStoryByGalleryId...');
      const serviceResult = await this.getStoryByGalleryId(galleryId);
      console.log('   Risultato:', serviceResult ? 'TROVATO' : 'NON TROVATO');
      
      const success = directDoc.exists() || !querySnapshot.empty || !!serviceResult;
      console.log(`\n🧪 ===== RISULTATO TEST: ${success ? 'SUCCESSO' : 'FALLIMENTO'} =====\n`);
      
      return success;
      
    } catch (error) {
      console.error('💥 Errore durante test:', error);
      return false;
    }
  }

  /**
   * 🧹 PULIZIA: Rimuove documenti inconsistenti (ID mismatch)
   */
  static async cleanupInconsistentStories(): Promise<void> {
    console.log('\n🧹 ===== PULIZIA STORIE INCONSISTENTI =====');
    
    try {
      const allStoriesSnapshot = await getDocs(collection(db, 'coupleStories'));
      const inconsistentDocs: any[] = [];
      
      allStoriesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (doc.id !== data.galleryId) {
          inconsistentDocs.push({
            docId: doc.id,
            galleryIdField: data.galleryId,
            data: data
          });
        }
      });
      
      console.log(`🔍 Trovati ${inconsistentDocs.length} documenti inconsistenti`);
      
      if (inconsistentDocs.length === 0) {
        console.log('✅ Nessuna pulizia necessaria');
        return;
      }
      
      for (const inconsistent of inconsistentDocs) {
        console.log(`🧹 Pulizia documento: ${inconsistent.docId} -> ${inconsistent.galleryIdField}`);
        
        // Salva nella posizione corretta
        if (inconsistent.galleryIdField) {
          const correctDocRef = doc(db, 'coupleStories', inconsistent.galleryIdField);
          await setDoc(correctDocRef, {
            ...inconsistent.data,
            galleryId: inconsistent.galleryIdField,
            id: inconsistent.galleryIdField
          });
          console.log(`   ✅ Salvato in posizione corretta: ${inconsistent.galleryIdField}`);
        }
        
        // Rimuovi documento inconsistente
        await deleteDoc(doc(db, 'coupleStories', inconsistent.docId));
        console.log(`   🗑️ Rimosso documento inconsistente: ${inconsistent.docId}`);
      }
      
      console.log('\n🧹 ===== PULIZIA COMPLETATA =====\n');
      
    } catch (error) {
      console.error('💥 Errore durante pulizia:', error);
    }
  }
  
  /**
   * 🔁 SYNC: Garantisce coerenza tra documentId e galleryId per una storia
   */
  static async ensureStoryConsistency(galleryId: string): Promise<boolean> {
    console.log(`\n🔁 ===== SYNC COERENZA: ${galleryId} =====`);
    
    try {
      // Cerca la storia ovunque sia
      let storyData: any = null;
      let foundDocId: string | null = null;
      
      // 1. Prova direct fetch
      const directDoc = await getDoc(doc(db, 'coupleStories', galleryId));
      if (directDoc.exists()) {
        storyData = directDoc.data();
        foundDocId = directDoc.id;
        console.log('📍 Storia trovata: Direct fetch');
      } else {
        // 2. Prova query
        const querySnapshot = await getDocs(
          query(
            collection(db, 'coupleStories'),
            where('galleryId', '==', galleryId)
          )
        );
        
        if (!querySnapshot.empty) {
          const doc = querySnapshot.docs[0];
          storyData = doc.data();
          foundDocId = doc.id;
          console.log('📍 Storia trovata: Query search');
        }
      }
      
      if (!storyData) {
        console.log('❌ Nessuna storia trovata');
        return false;
      }
      
      // 3. Verifica coerenza
      if (foundDocId === galleryId && storyData.galleryId === galleryId) {
        console.log('✅ Storia già coerente');
        return true;
      }
      
      // 4. Correggi inconsistenza
      console.log('🔧 Correzione inconsistenza...');
      const correctedData = {
        ...storyData,
        galleryId: galleryId,
        id: galleryId
      };
      
      // Salva nella posizione corretta
      await setDoc(doc(db, 'coupleStories', galleryId), correctedData);
      console.log(`✅ Storia salvata in posizione corretta: ${galleryId}`);
      
      // Rimuovi eventuali duplicati
      if (foundDocId && foundDocId !== galleryId) {
        await deleteDoc(doc(db, 'coupleStories', foundDocId));
        console.log(`🗑️ Rimosso duplicato: ${foundDocId}`);
      }
      
      console.log(`\n🔁 ===== SYNC COMPLETATO =====\n`);
      return true;
      
    } catch (error) {
      console.error('💥 Errore durante sync:', error);
      return false;
    }
  }
}

// 🛠️ UTILITY GLOBALI PER DEBUG (disponibili in console browser)
if (typeof window !== 'undefined') {
  (window as any).debugStories = StoryService.debugFirestoreStories;
  (window as any).testStory = StoryService.testStoryRetrieval;
  (window as any).cleanupStories = StoryService.cleanupInconsistentStories;
  (window as any).syncStory = StoryService.ensureStoryConsistency;
}

export default StoryService;