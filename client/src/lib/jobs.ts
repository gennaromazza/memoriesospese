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
  arrayUnion,
  arrayRemove,
  deleteField
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
import { removeUndefinedFields } from '@shared/firestore-utils';

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
    // Validazione: almeno un cliente è obbligatorio
    if (!data.clientiIds || data.clientiIds.length === 0) {
      throw new Error('Almeno un cliente è obbligatorio per creare un lavoro');
    }
    
    const jobData: Omit<Job, 'id'> = {
      nomeEvento: data.nomeEvento,
      clientiIds: data.clientiIds,
      jobType: data.jobType,
      // Se dataNonDefinita è true, non impostiamo eventDate
      ...(data.dataNonDefinita ? {} : { eventDate: Timestamp.fromDate(data.eventDate!) }),
      dataNonDefinita: data.dataNonDefinita || false,
      allDay: data.allDay,
      ...(data.startTime && { startTime: data.startTime }),
      ...(data.endTime && { endTime: data.endTime }),
      ...(data.eventLocation && { eventLocation: data.eventLocation }),
      ...(data.rituLocation && { rituLocation: data.rituLocation }),
      ...(data.rituTime && { rituTime: data.rituTime }),
      provenance: data.provenance,
      ...(data.noteInterne && { noteInterne: data.noteInterne }),
      ...(data.appuntamentiClienti && data.appuntamentiClienti.length > 0 && { appuntamentiClienti: data.appuntamentiClienti }),
      
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
      
      // Costi, PDF e workflow events vuoti
      costi: [],
      pdfs: [],
      workflowEvents: [],
      
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
      descrizione: `Lavoro creato: ${data.nomeEvento} (${data.jobType})`,
      userId
    });

    // Aggiorna TUTTI i clienti con sourceRefs (atomic arrayUnion per evitare race conditions)
    const updatePromises = data.clientiIds.map(async (clienteId) => {
      const clienteRef = doc(db, 'clienti', clienteId);
      const clienteSnap = await getDoc(clienteRef);
      if (clienteSnap.exists()) {
        // Usa arrayUnion per atomic update - previene race conditions durante import massivo
        await updateDoc(clienteRef, {
          'sourceRefs.jobIds': arrayUnion(docRef.id),
          updatedAt: Timestamp.now()
        });
      }
    });

    // Esegui update in parallelo per performance
    await Promise.all(updatePromises);

    console.log('✅ Job creato:', docRef.id, `(${data.clientiIds.length} clienti collegati)`);
    
    // Sincronizza automaticamente con Google Calendar (se ha una data definita)
    if (!data.dataNonDefinita && data.eventDate) {
      try {
        const calendarResponse = await fetch(`/api/jobs/${docRef.id}/calendar-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (calendarResponse.ok) {
          const calendarResult = await calendarResponse.json();
          console.log('📅 Evento Google Calendar creato:', calendarResult.eventId);
        } else {
          console.warn('⚠️ Impossibile creare evento Google Calendar:', await calendarResponse.text());
        }
      } catch (calendarError) {
        console.warn('⚠️ Errore sincronizzazione Google Calendar:', calendarError);
        // Non blocchiamo la creazione del job se Calendar fallisce
      }
    }
    
    return docRef.id;
  } catch (error) {
    console.error('❌ Errore creazione job:', error);
    throw error;
  }
}

/**
 * Get job by ID (via API per evitare problemi di permessi Firebase)
 */
export async function getJob(jobId: string): Promise<Job | null> {
  try {
    console.log('🔍 Fetching job via API with ID:', jobId);
    const response = await fetch(`/api/jobs/${jobId}`);
    
    if (response.status === 404) {
      console.warn('⚠️ Job not found:', jobId);
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Job fetched via API:', jobId);
    
    return data.job as Job;
  } catch (error) {
    console.error('❌ Errore get job:', error, 'for ID:', jobId);
    throw error;
  }
}

/**
 * Get all jobs con filtri
 */
export async function getAllJobs(filters?: JobFilters): Promise<Job[]> {
  try {
    const constraints: QueryConstraint[] = [];
    
    // Detect incompatible filters for array-contains (status/jobType arrays)
    const hasIncompatibleFilters = 
      (filters?.status && filters.status.length > 0) ||
      (filters?.jobType && filters.jobType.length > 0);
    
    // Filtri status
    if (filters?.status && filters.status.length > 0) {
      constraints.push(where('status', 'in', filters.status));
    }
    
    // Filtro cliente: hybrid approach
    // - Se no incompatible filters → use array-contains (server-side)
    // - Se incompatible filters → fetch all + client-side filtering
    const clientIdFilter = filters?.clienteId;
    if (clientIdFilter && !hasIncompatibleFilters) {
      // Server-side filtering con array-contains
      constraints.push(where('clientiIds', 'array-contains', clientIdFilter));
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
    
    // Client-side filtering per clienteId se incompatible filters
    if (clientIdFilter && hasIncompatibleFilters) {
      jobs = jobs.filter(job => 
        job.clientiIds && job.clientiIds.includes(clientIdFilter)
      );
    }
    
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
        job.nomeEvento?.toLowerCase().includes(query) ||
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
 * Se clientiIds viene modificato, sincronizza sourceRefs dei clienti
 */
export async function updateJob(
  jobId: string,
  data: UpdateJob,
  userId: string
): Promise<void> {
  try {
    // Se clientiIds è nell'update (anche se array vuoto), dobbiamo sincronizzare sourceRefs
    if (data.clientiIds !== undefined) {
      // Fetch job corrente per confronto
      const currentJobDoc = await getDoc(doc(db, JOBS_COLLECTION, jobId));
      if (currentJobDoc.exists()) {
        const currentClientiIds: string[] = currentJobDoc.data().clientiIds || [];
        const newClientiIds: string[] = data.clientiIds || [];
        
        // Trova clienti rimossi e aggiunti
        const removedClients = currentClientiIds.filter(id => !newClientiIds.includes(id));
        const addedClients = newClientiIds.filter(id => !currentClientiIds.includes(id));
        
        // Rimuovi jobId dai clienti rimossi (in parallelo)
        const removePromises = removedClients.map(async (clienteId) => {
          const clienteRef = doc(db, 'clienti', clienteId);
          const clienteSnap = await getDoc(clienteRef);
          if (clienteSnap.exists()) {
            await updateDoc(clienteRef, {
              'sourceRefs.jobIds': arrayRemove(jobId),
              updatedAt: Timestamp.now()
            });
          }
        });
        
        // Aggiungi jobId ai nuovi clienti (in parallelo)
        const addPromises = addedClients.map(async (clienteId) => {
          const clienteRef = doc(db, 'clienti', clienteId);
          const clienteSnap = await getDoc(clienteRef);
          if (clienteSnap.exists()) {
            await updateDoc(clienteRef, {
              'sourceRefs.jobIds': arrayUnion(jobId),
              updatedAt: Timestamp.now()
            });
          }
        });
        
        await Promise.all([...removePromises, ...addPromises]);
        
        if (removedClients.length > 0 || addedClients.length > 0) {
          console.log(`📝 sourceRefs sincronizzati: +${addedClients.length} -${removedClients.length} clienti`);
        }
      }
    }
    
    const updateData: any = {
      ...data,
      updatedAt: Timestamp.now()
    };
    
    // Mappa locationCerimonia -> rituLocation per compatibilità
    if (data.locationCerimonia !== undefined) {
      updateData.rituLocation = data.locationCerimonia;
      updateData.locationCerimonia = data.locationCerimonia; // Mantieni anche il nuovo nome
    }
    
    // Mappa oraCerimonia -> rituTime per compatibilità
    if (data.oraCerimonia !== undefined) {
      updateData.rituTime = data.oraCerimonia;
      updateData.oraCerimonia = data.oraCerimonia; // Mantieni anche il nuovo nome
    }
    
    // Gestione dataNonDefinita: quando attivo, rimuovi esplicitamente eventDate e campi correlati
    if (data.dataNonDefinita === true) {
      updateData.dataNonDefinita = true;
      updateData.eventDate = deleteField();
      updateData.startTime = deleteField();
      updateData.endTime = deleteField();
      updateData.googleCalendarEventId = deleteField();
      updateData.allDay = true; // Reset a true per sicurezza
    } else if (data.dataNonDefinita === false && data.eventDate) {
      // Se dataNonDefinita viene disattivato e c'è una eventDate, converti
      updateData.dataNonDefinita = false;
      updateData.eventDate = Timestamp.fromDate(data.eventDate);
    } else if (data.eventDate) {
      // Converti date normalmente
      updateData.eventDate = Timestamp.fromDate(data.eventDate);
    }
    
    // Pulisci campi undefined nested (es. costi con note undefined)
    const cleanedUpdateData = removeUndefinedFields(updateData);
    
    await updateDoc(doc(db, JOBS_COLLECTION, jobId), cleanedUpdateData);
    
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
 * Se newStatus = 'consegnato', salva automaticamente previousStatus per ripristino toggle
 * Se newStatus richiede blocco slot (confermato, shooting_fatto, etc.), crea Calendar event
 */
export async function updateJobStatus(
  jobId: string,
  newStatus: JobStatus,
  userId: string,
  currentJob?: Job // Pass current job to save previousStatus
): Promise<void> {
  try {
    const updateData: any = {
      status: newStatus,
      updatedAt: Timestamp.now()
    };
    
    // Se stiamo marcando come 'consegnato', salva lo status precedente per ripristino
    if (newStatus === 'consegnato' && currentJob && currentJob.status !== 'consegnato') {
      updateData.previousStatus = currentJob.status;
    }
    
    await updateDoc(doc(db, JOBS_COLLECTION, jobId), updateData);
    
    await addTimelineEvent({
      jobId,
      tipo: 'status_change',
      descrizione: `Stato cambiato in: ${newStatus}`,
      userId
    });
    
    console.log('✅ Status aggiornato:', jobId, newStatus);
    
    // Stati che richiedono blocco slot su Google Calendar
    const BLOCKING_STATUSES: JobStatus[] = [
      'confermato',
      'shooting_fatto',
      'selezione_pending',
      'produzione'
    ];
    
    // Se nuovo status richiede blocco, chiama SEMPRE backend (gestisce idempotenza)
    // IMPORTANTE: non skippiamo se googleCalendarEventId esiste, perché:
    // 1. Legacy jobs potrebbero non avere l'ID anche se evento esiste
    // 2. Se evento cancellato ma ID presente, backend lo ricrea
    if (BLOCKING_STATUSES.includes(newStatus)) {
      try {
        console.log(`📅 Status ${newStatus} richiede Calendar event - chiamo backend (idempotente)...`);
        const response = await fetch(`/api/jobs/${jobId}/calendar-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          const error = await response.json();
          console.error('❌ Errore creazione Calendar event:', error);
          // Non bloccare update status se Calendar fallisce - log warning only
        } else {
          const result = await response.json();
          if (result.alreadyExists) {
            console.log('ℹ️  Calendar event già esistente:', result.eventId);
          } else {
            console.log('✅ Calendar event creato:', result.eventId);
          }
        }
      } catch (error) {
        console.error('❌ Errore chiamata API Calendar event:', error);
        // Non bloccare update status se Calendar fallisce
      }
    }
    
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
 * 
 * LOGICA CALCOLO SALDO RESIDUO:
 * - saldoResiduo = totaleOrdini - totalePagato
 * - Il totalePreventivato NON entra nel calcolo perché è solo indicativo
 * - Il saldoResiduo rappresenta quanto resta da incassare sugli ordini effettivi
 * - Se totaleOrdini > totalePreventivato, significa ordini extra oltre il preventivo
 * - Se totalePagato > totaleOrdini, saldoResiduo sarà negativo (overpayment)
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
    
    // Calcola saldo residuo: differenza tra ordini effettivi e pagamenti ricevuti
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
 * Get job timeline (via API per evitare problemi di permessi Firebase)
 */
export async function getJobTimeline(jobId: string): Promise<JobTimelineEvent[]> {
  try {
    const response = await fetch(`/api/jobs/${jobId}/timeline`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.events as JobTimelineEvent[];
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

/**
 * Delete job (hard delete con cleanup cascata)
 * ATTENZIONE: Questa è un'operazione irreversibile
 * Elimina: orders, galleries, quotes, paymentSchedules, timeline events
 */
export async function deleteJob(
  jobId: string,
  userId: string
): Promise<{ deletedOrders: number; deletedGalleries: number; deletedQuotes: number }> {
  try {
    console.log('🗑️ Eliminazione job:', jobId);
    
    // 1. Fetch job per ottenere riferimenti
    const jobDoc = await getDoc(doc(db, JOBS_COLLECTION, jobId));
    if (!jobDoc.exists()) {
      throw new Error('Job non trovato');
    }
    const job = { id: jobDoc.id, ...jobDoc.data() } as Job;

    // 2. Elimina jobTimeline events
    const timelineSnapshot = await getDocs(
      query(
        collection(db, TIMELINE_COLLECTION),
        where('jobId', '==', jobId)
      )
    );
    console.log(`  ├─ Eliminazione ${timelineSnapshot.size} eventi timeline`);
    
    const batch = writeBatch(db);
    timelineSnapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    
    // 3. Elimina paymentSchedules collegati
    const schedulesSnapshot = await getDocs(
      query(
        collection(db, 'paymentSchedules'),
        where('jobId', '==', jobId)
      )
    );
    console.log(`  ├─ Eliminazione ${schedulesSnapshot.size} piani pagamento`);
    schedulesSnapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    // 4. Elimina TUTTI gli orders collegati al job
    const ordersSnapshot = await getDocs(
      query(
        collection(db, 'orders'),
        where('jobId', '==', jobId)
      )
    );
    console.log(`  ├─ Eliminazione ${ordersSnapshot.size} ordini`);
    ordersSnapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    // 5. Elimina TUTTE le galleries collegate al job
    const galleriesSnapshot = await getDocs(
      query(
        collection(db, 'galleries'),
        where('jobId', '==', jobId)
      )
    );
    console.log(`  ├─ Eliminazione ${galleriesSnapshot.size} gallerie`);
    galleriesSnapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    // 6. Elimina TUTTI i preventivi collegati al job
    const quotesSnapshot = await getDocs(
      query(
        collection(db, 'quotes'),
        where('jobId', '==', jobId)
      )
    );
    console.log(`  ├─ Eliminazione ${quotesSnapshot.size} preventivi`);
    quotesSnapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    // 7. Rimuovi jobId da clienti sourceRefs (atomico con arrayRemove + existence check)
    if (job.clientiIds && job.clientiIds.length > 0) {
      console.log(`  ├─ Update ${job.clientiIds.length} clienti (rimuovi da sourceRefs)`);
      
      for (const clienteId of job.clientiIds) {
        const clienteRef = doc(db, 'clienti', clienteId);
        // Verifica esistenza cliente prima di aggiornare (evita fallimento batch su client inesistenti)
        const clienteSnap = await getDoc(clienteRef);
        if (clienteSnap.exists()) {
          // Usa set con merge per tollerare clienti senza struttura sourceRefs inizializzata
          batch.set(clienteRef, {
            sourceRefs: { jobIds: arrayRemove(jobId) },
            updatedAt: Timestamp.now()
          }, { merge: true });
        } else {
          console.warn(`  ⚠️ Cliente ${clienteId} non trovato, skip update sourceRefs`);
        }
      }
    }

    // 8. Elimina il job document
    batch.delete(doc(db, JOBS_COLLECTION, jobId));
    
    // 9. Commit batch atomico
    await batch.commit();
    
    console.log('✅ Job eliminato completamente:', jobId);
    
    return {
      deletedOrders: ordersSnapshot.size,
      deletedGalleries: galleriesSnapshot.size,
      deletedQuotes: quotesSnapshot.size
    };
  } catch (error) {
    console.error('❌ Errore eliminazione job:', error);
    throw error;
  }
}

/**
 * Delete multiple jobs (batch delete con cascade)
 * ATTENZIONE: Questa è un'operazione irreversibile
 */
export async function deleteMultipleJobs(
  jobIds: string[],
  userId: string,
  onProgress?: (current: number, total: number, jobName?: string) => void
): Promise<{ 
  deletedJobs: number; 
  deletedOrders: number; 
  deletedGalleries: number; 
  deletedQuotes: number;
  errors: string[];
}> {
  const results = {
    deletedJobs: 0,
    deletedOrders: 0,
    deletedGalleries: 0,
    deletedQuotes: 0,
    errors: [] as string[]
  };

  for (let i = 0; i < jobIds.length; i++) {
    const jobId = jobIds[i];
    try {
      // Fetch job name for progress callback
      const jobDoc = await getDoc(doc(db, JOBS_COLLECTION, jobId));
      const jobName = jobDoc.exists() ? jobDoc.data().nomeEvento : jobId;
      
      onProgress?.(i + 1, jobIds.length, jobName);
      
      const result = await deleteJob(jobId, userId);
      results.deletedJobs++;
      results.deletedOrders += result.deletedOrders;
      results.deletedGalleries += result.deletedGalleries;
      results.deletedQuotes += result.deletedQuotes;
    } catch (error) {
      console.error(`❌ Errore eliminazione job ${jobId}:`, error);
      results.errors.push(jobId);
    }
  }

  console.log('📊 Risultato eliminazione multipla:', results);
  return results;
}
