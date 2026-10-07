/**
 * SEED JOB TYPES
 * Script per popolare i tipi di lavoro iniziali in Firestore
 * 
 * Utilizzo:
 * - Eseguire una sola volta durante la migrazione da enum hardcoded a jobTypes dinamici
 * - Verifica automaticamente se i dati esistono già prima di creare duplicati
 * - Usa batch write per efficienza
 */

import { db } from '../lib/firebase';
import { collection, getDocs, writeBatch, doc, Timestamp } from 'firebase/firestore';
import { DEFAULT_JOB_TYPES } from '@shared/job-types';

const COLLECTION = 'jobTypes';

export async function seedJobTypes(): Promise<{ created: number; skipped: number; error?: string }> {
  try {
    console.log('🌱 Inizio seed jobTypes...');

    // Verifica se esistono già jobTypes
    const existingSnapshot = await getDocs(collection(db, COLLECTION));
    
    if (!existingSnapshot.empty) {
      console.log(`⚠️ Trovati ${existingSnapshot.size} jobTypes esistenti. Seed annullato per evitare duplicati.`);
      return {
        created: 0,
        skipped: existingSnapshot.size
      };
    }

    // Crea batch
    const batch = writeBatch(db);
    const now = Timestamp.now();

    DEFAULT_JOB_TYPES.forEach(jobType => {
      const docRef = doc(collection(db, COLLECTION));
      batch.set(docRef, {
        ...jobType,
        createdAt: now,
        updatedAt: now
      });
    });

    // Commit batch
    await batch.commit();

    console.log(`✅ Seed completato: ${DEFAULT_JOB_TYPES.length} jobTypes creati`);
    return {
      created: DEFAULT_JOB_TYPES.length,
      skipped: 0
    };

  } catch (error: any) {
    console.error('❌ Errore durante seed jobTypes:', error);
    return {
      created: 0,
      skipped: 0,
      error: error.message
    };
  }
}

// Esponi la funzione globalmente per esecuzione da console
if (typeof window !== 'undefined') {
  (window as any).seedJobTypes = seedJobTypes;
  console.log('💡 Per eseguire il seed dei jobTypes, digita: window.seedJobTypes()');
}
