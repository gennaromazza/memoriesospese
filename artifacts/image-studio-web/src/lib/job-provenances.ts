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
import type { JobProvenance } from '@shared/job-provenances';

const COLLECTION = 'jobProvenances';

export async function getJobProvenances(): Promise<JobProvenance[]> {
  const q = query(collection(db, COLLECTION), orderBy('ordine', 'asc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date()
  })) as JobProvenance[];
}

export async function getActiveJobProvenances(): Promise<JobProvenance[]> {
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
  })) as JobProvenance[];
}

export async function getJobProvenanceBySlug(slug: string): Promise<JobProvenance | null> {
  const q = query(collection(db, COLLECTION), where('slug', '==', slug));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return null;
  
  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date()
  } as JobProvenance;
}

export async function createJobProvenance(
  data: Omit<JobProvenance, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const existing = await getJobProvenanceBySlug(data.slug);
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

export async function updateJobProvenance(
  id: string,
  data: Partial<Omit<JobProvenance, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  if (data.slug) {
    const existing = await getJobProvenanceBySlug(data.slug);
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

export async function deleteJobProvenance(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    throw new Error('Provenienza non trovata');
  }
  
  const slug = snapshot.data().slug;
  
  // Verifica dipendenze usando lo SLUG
  const jobsSnapshot = await getDocs(
    query(collection(db, 'jobs'), where('provenance', '==', slug))
  );
  
  if (!jobsSnapshot.empty) {
    throw new Error(
      `Impossibile eliminare: ${jobsSnapshot.size} lavori usano questa provenienza`
    );
  }
  
  await deleteDoc(docRef);
}

export async function reorderJobProvenances(reorderedIds: string[]): Promise<void> {
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

export async function toggleJobProvenanceStatus(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    throw new Error('Provenienza non trovata');
  }
  
  await updateDoc(docRef, {
    attivo: !snapshot.data().attivo,
    updatedAt: Timestamp.now()
  });
}
