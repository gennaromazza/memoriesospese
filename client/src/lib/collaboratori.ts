
/**
 * COLLABORATORI LIBRARY - CRUD Operations
 * Gestione collaboratori su Firestore
 */

import { db } from './firebase';
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
  serverTimestamp
} from 'firebase/firestore';
import { apiRequest } from './queryClient';
import type {
  Collaboratore,
  InsertCollaboratore,
  UpdateCollaboratore,
  JobCollaboratoreAssignment,
  InsertJobCollaboratoreAssignment,
  CollaboratoreStats,
  JobAcceptanceStatus,
  CollaboratorPaymentType,
  PaymentMethod
} from '@shared/collaboratori-types';

const COLLABORATORI_COLLECTION = 'collaboratori';
const ASSIGNMENTS_COLLECTION = 'jobCollaboratoreAssignments';

/**
 * Crea nuovo collaboratore
 */
export async function createCollaboratore(data: InsertCollaboratore): Promise<string> {
  try {
    const collaboratoreData: Omit<Collaboratore, 'id'> = {
      nome: data.nome,
      cognome: data.cognome,
      email: data.email.toLowerCase(),
      cellulare: data.cellulare,
      ruolo: data.ruolo,
      tariffaOraria: data.tariffaOraria,
      tariffaGiornaliera: data.tariffaGiornaliera,
      note: data.note,
      attivo: true,
      hasAccess: data.hasAccess || false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    const docRef = await addDoc(collection(db, COLLABORATORI_COLLECTION), collaboratoreData);
    console.log('✅ Collaboratore creato:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Errore creazione collaboratore:', error);
    throw error;
  }
}

/**
 * Get collaboratore by ID
 */
export async function getCollaboratore(id: string): Promise<Collaboratore | null> {
  try {
    const docSnap = await getDoc(doc(db, COLLABORATORI_COLLECTION, id));
    if (!docSnap.exists()) return null;
    
    return {
      id: docSnap.id,
      ...docSnap.data()
    } as Collaboratore;
  } catch (error) {
    console.error('❌ Errore get collaboratore:', error);
    throw error;
  }
}

/**
 * Get tutti i collaboratori
 */
export async function getAllCollaboratori(attiviOnly = false): Promise<Collaboratore[]> {
  try {
    let q = query(
      collection(db, COLLABORATORI_COLLECTION),
      orderBy('cognome', 'asc')
    );
    
    if (attiviOnly) {
      q = query(q, where('attivo', '==', true));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Collaboratore[];
  } catch (error) {
    console.error('❌ Errore get collaboratori:', error);
    throw error;
  }
}

/**
 * Update collaboratore
 */
export async function updateCollaboratore(
  id: string,
  data: UpdateCollaboratore
): Promise<void> {
  try {
    const updateData: any = {
      ...data,
      updatedAt: Timestamp.now()
    };
    
    if (data.email) {
      updateData.email = data.email.toLowerCase();
    }
    
    await updateDoc(doc(db, COLLABORATORI_COLLECTION, id), updateData);
    console.log('✅ Collaboratore aggiornato:', id);
  } catch (error) {
    console.error('❌ Errore update collaboratore:', error);
    throw error;
  }
}

/**
 * Assegna collaboratore a job
 */
export async function assignCollaboratoreToJob(
  data: InsertJobCollaboratoreAssignment
): Promise<string> {
  try {
    const assignmentData: Omit<JobCollaboratoreAssignment, 'id'> = {
      ...data,
      status: 'pending',
      dataRichiesta: Timestamp.now(),
      isPagato: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    const docRef = await addDoc(collection(db, ASSIGNMENTS_COLLECTION), assignmentData);
    console.log('✅ Collaboratore assegnato a job:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Errore assegnazione collaboratore:', error);
    throw error;
  }
}

/**
 * Get assegnazioni per job
 */
export async function getJobAssignments(jobId: string): Promise<JobCollaboratoreAssignment[]> {
  try {
    const q = query(
      collection(db, ASSIGNMENTS_COLLECTION),
      where('jobId', '==', jobId),
      orderBy('dataRichiesta', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as JobCollaboratoreAssignment[];
  } catch (error) {
    console.error('❌ Errore get job assignments:', error);
    throw error;
  }
}

/**
 * Get assegnazioni per collaboratore
 */
export async function getCollaboratoreAssignments(
  collaboratoreId: string
): Promise<JobCollaboratoreAssignment[]> {
  try {
    const q = query(
      collection(db, ASSIGNMENTS_COLLECTION),
      where('collaboratoreId', '==', collaboratoreId),
      orderBy('dataRichiesta', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as JobCollaboratoreAssignment[];
  } catch (error) {
    console.error('❌ Errore get collaboratore assignments:', error);
    throw error;
  }
}

/**
 * Rispondi a assegnazione (accetta/rifiuta)
 */
export async function respondToAssignment(
  assignmentId: string,
  status: 'accepted' | 'declined',
  noteRifiuto?: string
): Promise<void> {
  try {
    const updateData: any = {
      status,
      dataRisposta: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    if (noteRifiuto) {
      updateData.noteRifiuto = noteRifiuto;
    }
    
    await updateDoc(doc(db, ASSIGNMENTS_COLLECTION, assignmentId), updateData);
    console.log('✅ Risposta assegnazione registrata:', assignmentId, status);
  } catch (error) {
    console.error('❌ Errore risposta assegnazione:', error);
    throw error;
  }
}

/**
 * Segna assegnazione come pagata
 */
export async function markAssignmentAsPaid(assignmentId: string): Promise<void> {
  try {
    await updateDoc(doc(db, ASSIGNMENTS_COLLECTION, assignmentId), {
      isPagato: true,
      dataPagamento: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    console.log('✅ Assegnazione segnata come pagata:', assignmentId);
  } catch (error) {
    console.error('❌ Errore mark as paid:', error);
    throw error;
  }
}

/**
 * Get stats collaboratore
 */
export async function getCollaboratoreStats(collaboratoreId: string): Promise<CollaboratoreStats> {
  try {
    const assignments = await getCollaboratoreAssignments(collaboratoreId);
    
    const stats: CollaboratoreStats = {
      totalJobs: assignments.length,
      jobsAccepted: assignments.filter(a => a.status === 'accepted').length,
      jobsDeclined: assignments.filter(a => a.status === 'declined').length,
      jobsPending: assignments.filter(a => a.status === 'pending').length,
      totalEarnings: assignments
        .filter(a => a.status === 'accepted')
        .reduce((sum, a) => sum + a.compenso, 0),
      earningsPaid: assignments
        .filter(a => a.status === 'accepted' && a.isPagato)
        .reduce((sum, a) => sum + a.compenso, 0),
      earningsPending: assignments
        .filter(a => a.status === 'accepted' && !a.isPagato)
        .reduce((sum, a) => sum + a.compenso, 0)
    };
    
    return stats;
  } catch (error) {
    console.error('❌ Errore get stats:', error);
    throw error;
  }
}

/**
 * Aggiungi pagamento a assegnazione
 */
export async function addPaymentToAssignment(
  assignmentId: string,
  data: {
    importo: number;
    tipo: CollaboratorPaymentType;
    metodo: PaymentMethod;
    note?: string;
    data?: string;
  }
): Promise<void> {
  try {
    const response = await apiRequest(
      'POST',
      `/api/collaboratori/assignments/${assignmentId}/add-payment`,
      data
    );
    
    if (!response.ok) {
      throw new Error('Errore registrazione pagamento');
    }
    
    console.log('✅ Pagamento registrato per assegnazione:', assignmentId);
  } catch (error) {
    console.error('❌ Errore add payment:', error);
    throw error;
  }
}

/**
 * Get collaboratore by dashboard token
 */
export async function getCollaboratorByToken(token: string): Promise<{
  collaboratore: Collaboratore;
  assignments: JobCollaboratoreAssignment[];
} | null> {
  try {
    const response = await apiRequest('GET', `/api/collaboratori/dashboard/${token}`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('❌ Errore get collaborator by token:', error);
    return null;
  }
}

/**
 * Genera link dashboard collaboratore
 */
export function generateDashboardLink(collaboratore: Collaboratore): string {
  if (!collaboratore.dashboardToken) {
    return '';
  }
  const baseUrl = window.location.origin;
  return `${baseUrl}/collaboratori/dashboard/${collaboratore.dashboardToken}`;
}
