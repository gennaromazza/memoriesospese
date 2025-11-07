/**
 * JOBS LIBRARY - CRUD Operations
 * Gestione lavori fotografici su Firestore
 */

import { db, storage } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  limit as firestoreLimit,
  QueryConstraint,
  arrayUnion
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type {
  Job,
  InsertJob,
  UpdateJob,
  JobStatus,
  JobTimelineEvent,
  JobFilters,
  JobPDF,
  JobFinancials
} from '@shared/jobs-types';

const JOBS_COLLECTION = 'jobs';
const TIMELINE_COLLECTION = 'jobTimeline';

/**
 * Crea nuovo job
 */
export async function createJob(
  data: InsertJob,
  userId: string
): Promise<string> {
  try {
    const jobData: Omit<Job, 'id'> = {
      clienteId: data.clienteId,
      jobType: data.jobType,
      eventDate: Timestamp.fromDate(data.eventDate),
      eventLocation: data.eventLocation,
      provenance: data.provenance,
      noteInterne: data.noteInterne,
      
      // Riferimenti vuoti inizialmente
      orderIds: [],
      galleryIds: [],
      quoteIds: [],
      
      // Status iniziale
      status: 'lead',
      
      // Financials iniziali
      financials: {
        totalePreventivato: 0,
        totaleOrdini: 0,
        totalePagato: 0,
        saldoResiduo: 0
      },
      
      // PDF vuoti
      pdfs: [],
      
      // Metadata
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: userId,
      jobSource: 'manual'
    };

    const docRef = await addDoc(collection(db, JOBS_COLLECTION), jobData);
    
    // Aggiungi evento timeline creazione
    await addTimelineEvent({
      jobId: docRef.id,
      tipo: 'creazione',
      descrizione: `Lavoro creato: ${data.jobType}`,
      userId
    });

    // Aggiorna cliente con sourceRefs (atomic arrayUnion per evitare race conditions)
    const clienteRef = doc(db, 'clienti', data.clienteId);
    const clienteSnap = await getDoc(clienteRef);
    if (clienteSnap.exists()) {
      // Usa arrayUnion per atomic update - previene race conditions durante import massivo
      await updateDoc(clienteRef, {
        'sourceRefs.jobIds': arrayUnion(docRef.id),
        updatedAt: Timestamp.now()
      });
    }

    console.log('✅ Job creato:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Errore creazione job:', error);
    throw error;
  }
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string): Promise<Job | null> {
  try {
    const jobDoc = await getDoc(doc(db, JOBS_COLLECTION, jobId));
    if (!jobDoc.exists()) return null;
    
    return {
      id: jobDoc.id,
      ...jobDoc.data()
    } as Job;
  } catch (error) {
    console.error('❌ Errore get job:', error);
    throw error;
  }
}

/**
 * Get all jobs con filtri
 */
export async function getAllJobs(filters?: JobFilters): Promise<Job[]> {
  try {
    const constraints: QueryConstraint[] = [];
    
    // Filtri status
    if (filters?.status && filters.status.length > 0) {
      constraints.push(where('status', 'in', filters.status));
    }
    
    // Filtro cliente
    if (filters?.clienteId) {
      constraints.push(where('clienteId', '==', filters.clienteId));
    }
    
    // Filtro tipo job
    if (filters?.jobType && filters.jobType.length > 0) {
      constraints.push(where('jobType', 'in', filters.jobType));
    }
    
    // Ordina per data evento decrescente
    constraints.push(orderBy('eventDate', 'desc'));
    
    const q = query(collection(db, JOBS_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);
    
    let jobs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Job[];
    
    // Filtro date (client-side perché Firestore non supporta range su campi timestamp facilmente)
    if (filters?.dateFrom) {
      const fromTimestamp = Timestamp.fromDate(filters.dateFrom);
      jobs = jobs.filter(job => job.eventDate >= fromTimestamp);
    }
    if (filters?.dateTo) {
      const toTimestamp = Timestamp.fromDate(filters.dateTo);
      jobs = jobs.filter(job => job.eventDate <= toTimestamp);
    }
    
    // Ricerca testuale (client-side)
    if (filters?.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      jobs = jobs.filter(job => 
        job.eventLocation?.toLowerCase().includes(query) ||
        job.noteInterne?.toLowerCase().includes(query)
      );
    }
    
    return jobs;
  } catch (error) {
    console.error('❌ Errore get all jobs:', error);
    throw error;
  }
}

/**
 * Update job
 */
export async function updateJob(
  jobId: string,
  data: UpdateJob,
  userId: string
): Promise<void> {
  try {
    const updateData: any = {
      ...data,
      updatedAt: Timestamp.now()
    };
    
    // Converti date
    if (data.eventDate) {
      updateData.eventDate = Timestamp.fromDate(data.eventDate);
    }
    
    await updateDoc(doc(db, JOBS_COLLECTION, jobId), updateData);
    
    // Timeline event se cambia status
    if (data.status) {
      await addTimelineEvent({
        jobId,
        tipo: 'status_change',
        descrizione: `Stato cambiato in: ${data.status}`,
        userId
      });
    }
    
    console.log('✅ Job aggiornato:', jobId);
  } catch (error) {
    console.error('❌ Errore update job:', error);
    throw error;
  }
}

/**
 * Update job status
 */
export async function updateJobStatus(
  jobId: string,
  newStatus: JobStatus,
  userId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, JOBS_COLLECTION, jobId), {
      status: newStatus,
      updatedAt: Timestamp.now()
    });
    
    await addTimelineEvent({
      jobId,
      tipo: 'status_change',
      descrizione: `Stato cambiato in: ${newStatus}`,
      userId
    });
    
    console.log('✅ Status aggiornato:', jobId, newStatus);
  } catch (error) {
    console.error('❌ Errore update status:', error);
    throw error;
  }
}

/**
 * Attach PDF to job
 */
export async function attachPDF(
  jobId: string,
  file: File,
  tipo: JobPDF['tipo'],
  userId: string
): Promise<string> {
  try {
    // Upload file to Storage
    const storageRef = ref(storage, `jobs/${jobId}/pdfs/${file.name}`);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    
    // Update job con nuovo PDF
    const jobDoc = await getDoc(doc(db, JOBS_COLLECTION, jobId));
    if (!jobDoc.exists()) throw new Error('Job non trovato');
    
    const currentPDFs = jobDoc.data().pdfs || [];
    const newPDF: JobPDF = {
      nome: file.name,
      tipo,
      url: downloadURL,
      uploadedAt: Timestamp.now(),
      uploadedBy: userId
    };
    
    await updateDoc(doc(db, JOBS_COLLECTION, jobId), {
      pdfs: [...currentPDFs, newPDF],
      updatedAt: Timestamp.now()
    });
    
    await addTimelineEvent({
      jobId,
      tipo: 'pdf_caricato',
      descrizione: `PDF caricato: ${file.name}`,
      userId
    });
    
    console.log('✅ PDF caricato:', downloadURL);
    return downloadURL;
  } catch (error) {
    console.error('❌ Errore upload PDF:', error);
    throw error;
  }
}

/**
 * Update financials snapshot
 */
export async function updateJobFinancials(
  jobId: string,
  financials: Partial<JobFinancials>
): Promise<void> {
  try {
    const jobDoc = await getDoc(doc(db, JOBS_COLLECTION, jobId));
    if (!jobDoc.exists()) throw new Error('Job non trovato');
    
    const currentFinancials = jobDoc.data().financials || {};
    const updatedFinancials = {
      ...currentFinancials,
      ...financials
    };
    
    // Calcola saldo residuo
    updatedFinancials.saldoResiduo = 
      (updatedFinancials.totaleOrdini || 0) - (updatedFinancials.totalePagato || 0);
    
    await updateDoc(doc(db, JOBS_COLLECTION, jobId), {
      financials: updatedFinancials,
      updatedAt: Timestamp.now()
    });
    
    console.log('✅ Financials aggiornati:', jobId);
  } catch (error) {
    console.error('❌ Errore update financials:', error);
    throw error;
  }
}

/**
 * Get job timeline
 */
export async function getJobTimeline(jobId: string): Promise<JobTimelineEvent[]> {
  try {
    const q = query(
      collection(db, TIMELINE_COLLECTION),
      where('jobId', '==', jobId),
      orderBy('data', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as JobTimelineEvent[];
  } catch (error) {
    console.error('❌ Errore get timeline:', error);
    throw error;
  }
}

/**
 * Add timeline event
 */
export async function addTimelineEvent(
  event: Omit<JobTimelineEvent, 'id' | 'data'> & { data?: Timestamp }
): Promise<void> {
  try {
    await addDoc(collection(db, TIMELINE_COLLECTION), {
      ...event,
      data: event.data || Timestamp.now()
    });
  } catch (error) {
    console.error('❌ Errore add timeline event:', error);
    throw error;
  }
}

/**
 * Link ordine a job
 */
export async function linkOrderToJob(
  jobId: string,
  orderId: string
): Promise<void> {
  try {
    const jobDoc = await getDoc(doc(db, JOBS_COLLECTION, jobId));
    if (!jobDoc.exists()) throw new Error('Job non trovato');
    
    const currentOrderIds = jobDoc.data().orderIds || [];
    if (currentOrderIds.includes(orderId)) return; // Già linkato
    
    await updateDoc(doc(db, JOBS_COLLECTION, jobId), {
      orderIds: [...currentOrderIds, orderId],
      updatedAt: Timestamp.now()
    });
    
    // Aggiorna anche ordine con jobId
    await updateDoc(doc(db, 'orders', orderId), {
      jobId,
      updatedAt: Timestamp.now()
    });
    
    console.log('✅ Ordine linkato a job:', orderId, jobId);
  } catch (error) {
    console.error('❌ Errore link order:', error);
    throw error;
  }
}

/**
 * Link galleria a job
 */
export async function linkGalleryToJob(
  jobId: string,
  galleryId: string
): Promise<void> {
  try {
    const jobDoc = await getDoc(doc(db, JOBS_COLLECTION, jobId));
    if (!jobDoc.exists()) throw new Error('Job non trovato');
    
    const currentGalleryIds = jobDoc.data().galleryIds || [];
    if (currentGalleryIds.includes(galleryId)) return;
    
    await updateDoc(doc(db, JOBS_COLLECTION, jobId), {
      galleryIds: [...currentGalleryIds, galleryId],
      updatedAt: Timestamp.now()
    });
    
    // Aggiorna galleria
    await updateDoc(doc(db, 'galleries', galleryId), {
      jobId,
      updatedAt: Timestamp.now()
    });
    
    console.log('✅ Galleria linkata a job:', galleryId, jobId);
  } catch (error) {
    console.error('❌ Errore link gallery:', error);
    throw error;
  }
}

/**
 * Delete job (soft delete - archiviazione)
 */
export async function archiveJob(
  jobId: string,
  userId: string
): Promise<void> {
  try {
    await updateJobStatus(jobId, 'archiviato', userId);
    console.log('✅ Job archiviato:', jobId);
  } catch (error) {
    console.error('❌ Errore archiviazione job:', error);
    throw error;
  }
}
