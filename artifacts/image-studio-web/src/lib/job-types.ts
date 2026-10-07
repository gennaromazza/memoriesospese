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
import type { JobType, JobTypeFE } from '@shared/job-types';

const COLLECTION = 'jobTypes';

/**
 * Helper: Converte documento Firestore in JobTypeFE
 */
function toJobTypeFE(id: string, data: any): JobTypeFE {
  return {
    id,
    ...data,
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
  };
}

export async function getJobTypes(): Promise<JobTypeFE[]> {
  const q = query(collection(db, COLLECTION), orderBy('ordine', 'asc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => toJobTypeFE(doc.id, doc.data()));
}

export async function getActiveJobTypes(): Promise<JobTypeFE[]> {
  const q = query(
    collection(db, COLLECTION),
    where('attivo', '==', true),
    orderBy('ordine', 'asc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => toJobTypeFE(doc.id, doc.data()));
}

export async function getJobTypeBySlug(slug: string): Promise<JobTypeFE | null> {
  const q = query(collection(db, COLLECTION), where('slug', '==', slug));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return null;
  
  const docSnap = snapshot.docs[0];
  return toJobTypeFE(docSnap.id, docSnap.data());
}

export async function createJobType(
  data: Omit<JobTypeFE, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  // Verifica slug unique
  const existing = await getJobTypeBySlug(data.slug);
  if (existing) {
    throw new Error(`Slug "${data.slug}" già esistente`);
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

export async function updateJobType(
  id: string,
  data: Partial<Omit<JobTypeFE, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  // Se cambia slug, verifica che non esista già
  if (data.slug) {
    const existing = await getJobTypeBySlug(data.slug);
    if (existing && existing.id !== id) {
      throw new Error(`Slug "${data.slug}" già esistente`);
    }
  }
  
  const docRef = doc(db, COLLECTION, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now()
  });
}

export async function deleteJobType(id: string): Promise<void> {
  // Ottieni lo slug del jobType da eliminare
  const docRef = doc(db, COLLECTION, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    throw new Error('Tipo lavoro non trovato');
  }
  
  const slug = snapshot.data().slug;
  
  // Verifica dipendenze usando lo SLUG (non document ID)
  const jobsSnapshot = await getDocs(
    query(collection(db, 'jobs'), where('jobType', '==', slug))
  );
  
  if (!jobsSnapshot.empty) {
    throw new Error(
      `Impossibile eliminare: ${jobsSnapshot.size} lavori usano questo tipo`
    );
  }
  
  const clausesSnapshot = await getDocs(
    query(collection(db, 'contractClauses'), where('jobType', '==', slug))
  );
  
  if (!clausesSnapshot.empty) {
    throw new Error(
      `Impossibile eliminare: ${clausesSnapshot.size} template clausole usano questo tipo`
    );
  }
  
  // Elimina il documento
  await deleteDoc(docRef);
}

export async function reorderJobTypes(reorderedIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  const now = Timestamp.now();
  
  reorderedIds.forEach((id, index) => {
    const docRef = doc(db, COLLECTION, id);
    batch.update(docRef, {
      ordine: index + 1,
      updatedAt: now
    });
  });
  
  await batch.commit();
}

export async function toggleJobTypeStatus(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    throw new Error('Tipo lavoro non trovato');
  }
  
  await updateDoc(docRef, {
    attivo: !snapshot.data().attivo,
    updatedAt: Timestamp.now()
  });
}
