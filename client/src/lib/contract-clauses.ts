/**
 * CONTRACT CLAUSES LIBRARY
 * CRUD operations per template clausole contrattuali
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
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { nanoid } from 'nanoid';
import type {
  ContractClauseTemplate,
  InsertContractClauseTemplate,
  Clause
} from '@shared/contract-clause-types';

const COLLECTION = 'contractClauseTemplates';

/**
 * Crea nuovo template clausole
 */
export async function createClauseTemplate(
  data: InsertContractClauseTemplate,
  userId: string
): Promise<string> {
  try {
    // Aggiungi ID alle clausole
    const clausesWithIds: Clause[] = data.clauses.map(c => ({
      ...c,
      id: nanoid()
    }));

    const templateData = {
      ...data,
      clauses: clausesWithIds,
      attivo: data.attivo ?? true,
      predefinito: data.predefinito ?? false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: userId
    };

    const docRef = await addDoc(collection(db, COLLECTION), templateData);
    return docRef.id;
  } catch (error) {
    console.error('Errore creazione template clausole:', error);
    throw new Error('Impossibile creare il template clausole');
  }
}

/**
 * Aggiorna template clausole
 */
export async function updateClauseTemplate(
  id: string,
  data: Partial<InsertContractClauseTemplate>
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION, id);
    
    // Se ci sono nuove clausole, aggiungi ID a quelle che non ce l'hanno
    let clausesToUpdate = data.clauses;
    if (clausesToUpdate) {
      clausesToUpdate = clausesToUpdate.map(c => {
        // Se la clausola ha già un id, mantienilo
        if ('id' in c && c.id) {
          return c as Clause;
        }
        // Altrimenti generane uno nuovo
        return {
          ...c,
          id: nanoid()
        } as Clause;
      });
    }

    const updateData = {
      ...data,
      ...(clausesToUpdate && { clauses: clausesToUpdate }),
      updatedAt: serverTimestamp()
    };

    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error('Errore aggiornamento template clausole:', error);
    throw new Error('Impossibile aggiornare il template clausole');
  }
}

/**
 * Elimina template clausole
 */
export async function deleteClauseTemplate(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch (error) {
    console.error('Errore eliminazione template clausole:', error);
    throw new Error('Impossibile eliminare il template clausole');
  }
}

/**
 * Ottieni template per ID
 */
export async function getClauseTemplate(id: string): Promise<ContractClauseTemplate | null> {
  try {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data()
    } as ContractClauseTemplate;
  } catch (error) {
    console.error('Errore recupero template clausole:', error);
    throw new Error('Impossibile recuperare il template clausole');
  }
}

/**
 * Ottieni tutti i template
 */
export async function getAllClauseTemplates(): Promise<ContractClauseTemplate[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      orderBy('jobType', 'asc'),
      orderBy('updatedAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ContractClauseTemplate));
  } catch (error) {
    console.error('Errore recupero template clausole:', error);
    throw new Error('Impossibile recuperare i template clausole');
  }
}

/**
 * Ottieni template per tipo lavoro
 */
export async function getClauseTemplatesByJobType(
  jobType: string
): Promise<ContractClauseTemplate[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where('jobType', '==', jobType),
      where('attivo', '==', true),
      orderBy('updatedAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ContractClauseTemplate));
  } catch (error) {
    console.error('Errore recupero template per tipo lavoro:', error);
    throw new Error('Impossibile recuperare i template');
  }
}

/**
 * Ottieni template predefinito per tipo lavoro
 */
export async function getDefaultClauseTemplate(
  jobType: string
): Promise<ContractClauseTemplate | null> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where('jobType', '==', jobType),
      where('predefinito', '==', true),
      where('attivo', '==', true)
    );

    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    } as ContractClauseTemplate;
  } catch (error) {
    console.error('Errore recupero template predefinito:', error);
    return null;
  }
}

/**
 * Imposta template come predefinito
 * (disattiva gli altri predefiniti per quel jobType)
 */
export async function setAsDefaultTemplate(
  id: string,
  jobType: string
): Promise<void> {
  try {
    // 1. Disattiva tutti i predefiniti per quel jobType
    const q = query(
      collection(db, COLLECTION),
      where('jobType', '==', jobType),
      where('predefinito', '==', true)
    );

    const snapshot = await getDocs(q);
    const updatePromises = snapshot.docs.map(doc =>
      updateDoc(doc.ref, { predefinito: false, updatedAt: serverTimestamp() })
    );

    await Promise.all(updatePromises);

    // 2. Imposta il nuovo come predefinito
    const docRef = doc(db, COLLECTION, id);
    await updateDoc(docRef, {
      predefinito: true,
      attivo: true,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Errore impostazione template predefinito:', error);
    throw new Error('Impossibile impostare il template come predefinito');
  }
}
