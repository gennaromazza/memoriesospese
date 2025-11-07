/**
 * JOBS SYSTEM - Types & Interfaces
 * Sistema gestione lavori fotografici (matrimoni, battesimi, eventi)
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Tipi di lavoro fotografico
 */
export type JobType = 
  | 'matrimonio' 
  | 'battesimo' 
  | 'famiglia' 
  | 'evento' 
  | 'comunione' 
  | 'compleanno'
  | 'altro';

/**
 * Stati pipeline lavoro
 */
export type JobStatus = 
  | 'lead'                  // Primo contatto, interesse
  | 'preventivo_inviato'    // Preventivo inviato al cliente
  | 'confermato'            // Preventivo firmato, lavoro confermato
  | 'shooting_fatto'        // Servizio fotografico completato
  | 'selezione_pending'     // In attesa selezione foto cliente
  | 'produzione'            // Album/stampe in produzione
  | 'consegnato'            // Prodotti consegnati
  | 'archiviato';           // Lavoro completato e archiviato

/**
 * Provenienze cliente
 */
export type JobProvenance = 
  | 'instagram' 
  | 'facebook' 
  | 'passaparola' 
  | 'fiera' 
  | 'google' 
  | 'sito_web'
  | 'altro';

/**
 * Sorgente creazione job
 */
export type JobSource = 
  | 'manual'              // Creato manualmente da admin
  | 'booking_campaign'    // Da campagna booking
  | 'legacy_import'       // Import da vecchio gestionale
  | 'public_form';        // Form pubblico richiesta preventivo

/**
 * PDF allegato a job
 */
export interface JobPDF {
  nome: string;
  tipo: 'modulo_prenotazione' | 'contratto' | 'privacy' | 'altro';
  url: string;                  // Firebase Storage URL
  uploadedAt: Timestamp;
  uploadedBy?: string;          // UID admin
}

/**
 * Snapshot economico job
 */
export interface JobFinancials {
  totalePreventivato: number;   // Da preventivo accettato
  totaleOrdini: number;         // Somma orders collegati
  totalePagato: number;         // Da payment schedules
  saldoResiduo: number;         // Differenza da incassare
}

/**
 * JOB - Lavoro fotografico completo
 */
export interface Job {
  id: string;
  
  // Riferimenti
  clienteId: string;            // Link a clienti collection (OBBLIGATORIO)
  bookingId?: string;           // Link opzionale a booking (se da campagna)
  orderIds: string[];           // Array ordini collegati
  galleryIds: string[];         // Array gallerie collegate
  quoteIds: string[];           // Array preventivi collegati
  
  // Dati lavoro
  jobType: JobType;
  eventDate: Timestamp;         // Data servizio fotografico
  eventLocation?: string;       // Luogo evento (es. "Casale dei Baroni")
  provenance: JobProvenance;    // Da dove è arrivato il cliente
  
  // Pipeline stato
  status: JobStatus;
  
  // Snapshot economico (calcolato da orders e payment schedules)
  financials: JobFinancials;
  
  // PDF moduli allegati
  pdfs: JobPDF[];
  
  // Note interne admin
  noteInterne?: string;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;            // UID admin che ha creato
  jobSource: JobSource;         // Come è stato creato il job
}

/**
 * INSERT JOB - Dati per creazione nuovo job
 */
export interface InsertJob {
  clienteId: string;
  jobType: JobType;
  eventDate: Date;
  eventLocation?: string;
  provenance: JobProvenance;
  noteInterne?: string;
}

/**
 * UPDATE JOB - Dati per aggiornamento job
 */
export interface UpdateJob {
  jobType?: JobType;
  eventDate?: Date;
  eventLocation?: string;
  provenance?: JobProvenance;
  noteInterne?: string;
  status?: JobStatus;
}

/**
 * Evento timeline job
 */
export interface JobTimelineEvent {
  id: string;
  jobId: string;
  tipo: 
    | 'creazione'
    | 'status_change'
    | 'preventivo_inviato'
    | 'preventivo_firmato'
    | 'ordine_creato'
    | 'pagamento_ricevuto'
    | 'galleria_creata'
    | 'pdf_caricato'
    | 'nota_aggiunta';
  descrizione: string;
  data: Timestamp;
  userId?: string;              // UID admin che ha eseguito l'azione
  metadata?: Record<string, any>; // Dati extra (es. importo pagamento, ID preventivo)
}

/**
 * Stats aggregate per dashboard
 */
export interface JobStats {
  totalJobs: number;
  byStatus: Record<JobStatus, number>;
  byType: Record<JobType, number>;
  fatturato: {
    totale: number;
    incassato: number;
    daIncassare: number;
  };
  conversionRate: {
    leadToConfirmato: number;     // Percentuale
    preventivoToFirmato: number;  // Percentuale
  };
}

/**
 * Filtri ricerca jobs
 */
export interface JobFilters {
  status?: JobStatus[];
  jobType?: JobType[];
  clienteId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  searchQuery?: string;         // Ricerca per nome cliente, location, ecc.
}
