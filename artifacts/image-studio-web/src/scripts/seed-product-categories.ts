/**
 * SEED PRODUCT CATEGORIES
 * Script per popolare le categorie prodotti iniziali in Firestore
 * 
 * Utilizzo:
 * - Eseguire una sola volta durante la migrazione da enum hardcoded a categorie dinamiche
 * - Verifica automaticamente se i dati esistono già prima di creare duplicati
 * - Usa batch write per efficienza
 */

import { db } from '../lib/firebase';
import { collection, getDocs, writeBatch, doc, Timestamp } from 'firebase/firestore';
import { DEFAULT_PRODUCT_CATEGORIES } from '@shared/booking-types';

const COLLECTION = 'productCategories';

export async function seedProductCategories(): Promise<{ created: number; skipped: number; error?: string }> {
  try {
    console.log('🌱 Inizio seed productCategories...');

    // Verifica se esistono già categorie
    const existingSnapshot = await getDocs(collection(db, COLLECTION));
    
    if (!existingSnapshot.empty) {
      console.log(`⚠️ Trovate ${existingSnapshot.size} categorie esistenti. Seed annullato per evitare duplicati.`);
      return {
        created: 0,
        skipped: existingSnapshot.size
      };
    }

    // Crea batch
    const batch = writeBatch(db);
    const now = Timestamp.now();

    DEFAULT_PRODUCT_CATEGORIES.forEach(category => {
      const docRef = doc(collection(db, COLLECTION));
      batch.set(docRef, {
        ...category,
        createdAt: now,
        updatedAt: now
      });
    });

    // Commit batch
    await batch.commit();

    console.log(`✅ Seed completato: ${DEFAULT_PRODUCT_CATEGORIES.length} categorie create`);
    return {
      created: DEFAULT_PRODUCT_CATEGORIES.length,
      skipped: 0
    };

  } catch (error: any) {
    console.error('❌ Errore durante seed productCategories:', error);
    return {
      created: 0,
      skipped: 0,
      error: error.message
    };
  }
}

// Esponi la funzione globalmente per esecuzione da console
if (typeof window !== 'undefined') {
  (window as any).seedProductCategories = seedProductCategories;
  console.log('💡 Per eseguire il seed delle categorie prodotti, digita: window.seedProductCategories()');
}
