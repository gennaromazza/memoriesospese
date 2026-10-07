/**
 * Photo Selections - Gestione selezioni foto Firestore
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
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PhotoSelection, InsertPhotoSelection } from '@shared/booking-types';

const COLLECTION = 'photo_selections';

/**
 * Ottiene tutte le selezioni (admin only)
 */
export async function getAllPhotoSelections(): Promise<PhotoSelection[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy('selectedAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as PhotoSelection[];
}

/**
 * Ottiene selezione singola per ID
 */
export async function getPhotoSelectionById(id: string): Promise<PhotoSelection | null> {
  const docRef = doc(db, COLLECTION, id);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return null;
  }
  
  return {
    id: docSnap.id,
    ...docSnap.data(),
  } as PhotoSelection;
}

/**
 * Ottiene selezioni per galleria
 */
export async function getPhotoSelectionsByGallery(galleryId: string): Promise<PhotoSelection[]> {
  const q = query(
    collection(db, COLLECTION),
    where('galleryId', '==', galleryId),
    orderBy('selectedAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as PhotoSelection[];
}

/**
 * Ottiene selezioni per ordine (admin only)
 */
export async function getPhotoSelectionsByOrder(orderId: string): Promise<PhotoSelection[]> {
  const q = query(
    collection(db, COLLECTION),
    where('orderId', '==', orderId),
    orderBy('selectedAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as PhotoSelection[];
}

/**
 * Crea nuova selezione foto
 */
export async function createPhotoSelection(data: InsertPhotoSelection): Promise<string> {
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...data,
    selectedAt: serverTimestamp(),
  });
  
  return docRef.id;
}

/**
 * Elimina selezione foto
 */
export async function deletePhotoSelection(selectionId: string): Promise<void> {
  const docRef = doc(db, COLLECTION, selectionId);
  await deleteDoc(docRef);
}

/**
 * Collega selezioni esistenti a un ordine (admin only)
 */
export async function linkSelectionsToOrder(
  galleryId: string,
  orderId: string
): Promise<number> {
  // Ottieni selezioni senza orderId
  const q = query(
    collection(db, COLLECTION),
    where('galleryId', '==', galleryId),
    where('orderId', '==', null)
  );
  
  const snapshot = await getDocs(q);
  
  // Aggiorna tutte le selezioni con il nuovo orderId
  const updatePromises = snapshot.docs.map(doc => 
    updateDoc(doc.ref, { orderId })
  );
  
  await Promise.all(updatePromises);
  
  return snapshot.docs.length;
}

/**
 * Conta selezioni per galleria
 */
export async function countPhotoSelectionsByGallery(galleryId: string): Promise<number> {
  const selections = await getPhotoSelectionsByGallery(galleryId);
  return selections.length;
}

/**
 * Conta selezioni per ordine
 */
export async function countPhotoSelectionsByOrder(orderId: string): Promise<number> {
  const selections = await getPhotoSelectionsByOrder(orderId);
  return selections.length;
}
