
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
 * Stati montaggio video (traccia operativa videomaker, NON stato commerciale del job)
 */
export type MontaggioStatus =
  | 'non_richiesto'   // montaggio non ancora richiesto
  | 'richiesto'       // montaggio richiesto al videomaker
  | 'in_lavorazione'  // videomaker sta montando
  | 'consegnato';     // montaggio consegnato

/**
 * Aggiornamento di stato del montaggio (storico con data auto-registrata)
 */
export interface MontaggioStatusUpdate {
  status: MontaggioStatus;
  data: Timestamp;
  note?: string;
}

export const MONTAGGIO_STATUS_LABELS: Record<MontaggioStatus, string> = {
  non_richiesto: 'Non richiesto',
  richiesto: 'Montaggio richiesto',
  in_lavorazione: 'In lavorazione',
  consegnato: 'Consegnato',
};

/**
 * Tipo pagamento collaboratore
 */
export type CollaboratorPaymentType = 'acconto' | 'saldo';

/**
 * Metodo pagamento
 */
export type PaymentMethod = 'contante' | 'carta' | 'bonifico' | 'paypal' | 'altro';

/**
 * Singolo pagamento a collaboratore
 */
export interface CollaboratorPayment {
  id: string;
  tipo: CollaboratorPaymentType;
  importo: number;
  data: Timestamp;
  metodo: PaymentMethod;
  note?: string;
  cashMovementId?: string;  // ID del movimento cassa collegato
}

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
  dashboardToken?: string;      // Token univoco per accesso dashboard via link magico
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Prodotto assegnato a collaboratore
 */
export interface AssignedProduct {
  orderItemId: string;    // ID del prodotto nell'ordine
  label: string;          // Nome prodotto (es. "Drone", "Trailer")
  qty?: number;           // Quantità (opzionale)
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
  
  // Prodotti e mansioni assegnate
  prodottiAssegnati?: AssignedProduct[];  // Prodotti specifici da gestire
  mansioniAssegnate?: string[];           // Lista mansioni (testo libero)
  
  // Stato accettazione
  status: JobAcceptanceStatus;
  dataRichiesta: Timestamp;
  dataRisposta?: Timestamp;
  noteRifiuto?: string;         // Se declined
  
  // Pagamento
  isPagato: boolean;
  dataPagamento?: Timestamp;
  pagamenti: CollaboratorPayment[];  // Array pagamenti ricevuti
  saldoResiduo: number;              // Compenso - somma pagamenti
  
  // Note
  noteAdmin?: string;
  noteCollaboratore?: string;

  // Traccia montaggio video (operativa, valorizzata tipicamente per ruolo videomaker)
  montaggioStatus?: MontaggioStatus;
  montaggioRichiestoAt?: Timestamp;
  montaggioConsegnatoAt?: Timestamp;
  montaggioUpdates?: MontaggioStatusUpdate[];

  // Reminder
  reminderSent?: boolean;        // Deprecato - usare lastReminderSentAt
  reminderSentAt?: Timestamp;    // Deprecato - usare lastReminderSentAt
  lastReminderSentAt?: Timestamp; // Data ultimo invio reminder (per evitare duplicati)
  
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
  prodottiAssegnati?: AssignedProduct[];
  mansioniAssegnate?: string[];
}

/**
 * UPDATE Assegnazione (prodotti e mansioni)
 */
export interface UpdateJobCollaboratoreAssignment {
  prodottiAssegnati?: AssignedProduct[];
  mansioniAssegnate?: string[];
  noteAdmin?: string;
}
