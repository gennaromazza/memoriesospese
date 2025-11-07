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
import type { JobType } from '@shared/job-types';

const COLLECTION = 'jobTypes';

export async function getJobTypes(): Promise<JobType[]> {
  const q = query(collection(db, COLLECTION), orderBy('ordine', 'asc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date()
  })) as JobType[];
}

export async function getActiveJobTypes(): Promise<JobType[]> {
  const q = query(
    collection(db, COLLECTION),
    where('attivo', '==', true),
    orderBy('ordine', 'asc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date()
  })) as JobType[];
}

export async function getJobTypeBySlug(slug: string): Promise<JobType | null> {
  const q = query(collection(db, COLLECTION), where('slug', '==', slug));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return null;
  
  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date()
  } as JobType;
}

export async function createJobType(
  data: Omit<JobType, 'id' | 'createdAt' | 'updatedAt'>
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
  data: Partial<Omit<JobType, 'id' | 'createdAt' | 'updatedAt'>>
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
