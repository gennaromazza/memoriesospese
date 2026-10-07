/**
 * Funzioni Firebase per gestione Categorie Prodotti
 */

import { db } from './firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import type { ProductCategory, InsertProductCategory } from '@shared/booking-types';

const COLLECTION = 'productCategories';

export async function getProductCategories(): Promise<ProductCategory[]> {
  const q = query(collection(db, COLLECTION), orderBy('displayOrder', 'asc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt || Timestamp.now(),
    updatedAt: doc.data().updatedAt || Timestamp.now()
  })) as ProductCategory[];
}

export async function getActiveProductCategories(): Promise<ProductCategory[]> {
  const q = query(
    collection(db, COLLECTION),
    where('attivo', '==', true),
    orderBy('displayOrder', 'asc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt || Timestamp.now(),
    updatedAt: doc.data().updatedAt || Timestamp.now()
  })) as ProductCategory[];
}

export async function getProductCategoryByValue(value: string): Promise<ProductCategory | null> {
  const q = query(collection(db, COLLECTION), where('value', '==', value));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return null;
  
  const docData = snapshot.docs[0];
  return {
    id: docData.id,
    ...docData.data(),
    createdAt: docData.data().createdAt || Timestamp.now(),
    updatedAt: docData.data().updatedAt || Timestamp.now()
  } as ProductCategory;
}

export async function createProductCategory(
  data: InsertProductCategory
): Promise<string> {
  // Verifica value univoco
  const existing = await getProductCategoryByValue(data.value);
  if (existing) {
    throw new Error(`Valore tecnico "${data.value}" già esistente`);
  }
  
  const docRef = doc(collection(db, COLLECTION));
  const now = Timestamp.now();
  
  await setDoc(docRef, {
    ...data,
    createdAt: now,
    updatedAt: now
  });
  
  return docRef.id;
}

export async function updateProductCategory(
  id: string,
  data: Partial<InsertProductCategory>
): Promise<void> {
  // Se cambia value, verifica che non esista già
  if (data.value) {
    const existing = await getProductCategoryByValue(data.value);
    if (existing && existing.id !== id) {
      throw new Error(`Valore tecnico "${data.value}" già esistente`);
    }
  }
  
  const docRef = doc(db, COLLECTION, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now()
  });
}

export async function deleteProductCategory(id: string): Promise<void> {
  // Ottieni il value della categoria da eliminare
  const docRef = doc(db, COLLECTION, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    throw new Error('Categoria prodotto non trovata');
  }
  
  const value = snapshot.data().value;
  
  // Verifica dipendenze - controlla se ci sono prodotti che usano questa categoria
  const productsSnapshot = await getDocs(
    query(collection(db, 'products'), where('categoria', '==', value))
  );
  
  if (!productsSnapshot.empty) {
    throw new Error(
      `Impossibile eliminare: ${productsSnapshot.size} prodotti usano questa categoria`
    );
  }
  
  // Elimina il documento
  await deleteDoc(docRef);
}

export async function reorderProductCategories(reorderedIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  const now = Timestamp.now();
  
  reorderedIds.forEach((id, index) => {
    const docRef = doc(db, COLLECTION, id);
    batch.update(docRef, {
      displayOrder: index + 1,
      updatedAt: now
    });
  });
  
  await batch.commit();
}

export async function toggleProductCategoryStatus(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    throw new Error('Categoria prodotto non trovata');
  }
  
  await updateDoc(docRef, {
    attivo: !snapshot.data().attivo,
    updatedAt: Timestamp.now()
  });
}
