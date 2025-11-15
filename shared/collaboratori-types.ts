
/**
 * COLLABORATORI SYSTEM - Types & Interfaces
 * Sistema gestione collaboratori fotografici
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Ruoli collaboratore
 */
export type CollaboratoreRole = 
  | 'fotografo_secondario'
  | 'videomaker'
  | 'assistente'
  | 'photo_editor'
  | 'album_designer'
  | 'altro';

/**
 * Stati accettazione lavoro
 */
export type JobAcceptanceStatus = 
  | 'pending'      // In attesa risposta
  | 'accepted'     // Accettato
  | 'declined';    // Rifiutato

/**
 * Collaboratore
 */
export interface Collaboratore {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  cellulare?: string;
  ruolo: CollaboratoreRole;
  tariffaOraria?: number;      // Tariffa oraria base
  tariffaGiornaliera?: number;  // Tariffa giornaliera base
  note?: string;
  attivo: boolean;
  
  // Credenziali accesso dashboard
  hasAccess: boolean;           // Se può accedere alla dashboard
  userId?: string;              // UID Firebase Auth (se registrato)
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Assegnazione collaboratore a job
 */
export interface JobCollaboratoreAssignment {
  id: string;
  jobId: string;
  collaboratoreId: string;
  
  // Dettagli assegnazione
  ruoloInJob: CollaboratoreRole;
  compenso: number;             // Compenso totale per questo job
  tipoPagamento: 'orario' | 'giornaliero' | 'forfait';
  oreStimate?: number;          // Se pagamento orario
  giorniStimati?: number;       // Se pagamento giornaliero
  
  // Stato accettazione
  status: JobAcceptanceStatus;
  dataRichiesta: Timestamp;
  dataRisposta?: Timestamp;
  noteRifiuto?: string;         // Se declined
  
  // Pagamento
  isPagato: boolean;
  dataPagamento?: Timestamp;
  
  // Note
  noteAdmin?: string;
  noteCollaboratore?: string;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Stats collaboratore
 */
export interface CollaboratoreStats {
  totalJobs: number;
  jobsAccepted: number;
  jobsDeclined: number;
  jobsPending: number;
  totalEarnings: number;
  earningsPaid: number;
  earningsPending: number;
}

/**
 * INSERT Collaboratore
 */
export interface InsertCollaboratore {
  nome: string;
  cognome: string;
  email: string;
  cellulare?: string;
  ruolo: CollaboratoreRole;
  tariffaOraria?: number;
  tariffaGiornaliera?: number;
  note?: string;
  hasAccess?: boolean;
}

/**
 * UPDATE Collaboratore
 */
export interface UpdateCollaboratore {
  nome?: string;
  cognome?: string;
  email?: string;
  cellulare?: string;
  ruolo?: CollaboratoreRole;
  tariffaOraria?: number;
  tariffaGiornaliera?: number;
  note?: string;
  attivo?: boolean;
  hasAccess?: boolean;
}

/**
 * INSERT Assegnazione
 */
export interface InsertJobCollaboratoreAssignment {
  jobId: string;
  collaboratoreId: string;
  ruoloInJob: CollaboratoreRole;
  compenso: number;
  tipoPagamento: 'orario' | 'giornaliero' | 'forfait';
  oreStimate?: number;
  giorniStimati?: number;
  noteAdmin?: string;
}
