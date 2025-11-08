/**
 * JOBS SYSTEM - Types & Interfaces
 * Sistema gestione lavori fotografici (matrimoni, battesimi, eventi)
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Tipi di lavoro fotografico - Dynamic job type slugs from Firestore
 * Legacy values: matrimonio, battesimo, famiglia, evento, comunione, compleanno, altro
 * Now accepts any string slug configured in jobTypes collection
 */
export type JobType = string;

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
 * Provenienze cliente - Dynamic provenance slugs from Firestore
 * Legacy values: instagram, facebook, passaparola, fiera, google, sito_web, altro
 * Now accepts any string slug configured in jobProvenances collection
 */
export type JobProvenance = string;

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
 * Costo lavoro - Spese sostenute per il servizio
 */
export interface CostoLavoro {
  id: string;
  descrizione: string;
  importo: number;
  tipo: 'materiale' | 'fornitore' | 'collaboratore' | 'viaggio' | 'altro';
  data: Timestamp;
  note?: string;
  createdBy?: string;          // UID admin
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
  clientiIds: string[];         // Array clienti collegati (OBBLIGATORIO - almeno 1)
  bookingId?: string;           // Link opzionale a booking (se da campagna)
  orderIds: string[];           // Array ordini collegati
  galleryIds: string[];         // Array gallerie collegate
  quoteIds: string[];           // Array preventivi collegati
  
  // Dati lavoro
  nomeEvento: string;           // Nome descrittivo lavoro (es. "Matrimonio Silva")
  jobType: string;              // Dynamic job type slug from Firestore jobTypes collection
  eventDate: Timestamp;         // Data servizio fotografico
  allDay: boolean;              // Evento tutto il giorno o orario specifico
  startTime?: string;           // Orario inizio (HH:mm) - opzionale se allDay = true
  endTime?: string;             // Orario fine (HH:mm) - opzionale
  eventLocation?: string;       // Luogo evento (es. "Casale dei Baroni")
  provenance: string;           // Dynamic provenance slug from Firestore jobProvenances collection
  
  // Pipeline stato
  status: JobStatus;
  
  // Snapshot economico (calcolato da orders e payment schedules)
  financials: JobFinancials;
  
  // PDF moduli allegati
  pdfs: JobPDF[];
  
  // Costi lavoro
  costi: CostoLavoro[];
  
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
  nomeEvento: string;
  clientiIds: string[];  // Array clienti - almeno 1 obbligatorio
  jobType: string;  // Dynamic job type slug from Firestore jobTypes collection
  eventDate: Date;
  allDay: boolean;
  startTime?: string;  // HH:mm format
  endTime?: string;    // HH:mm format
  eventLocation?: string;
  provenance: string;  // Dynamic provenance slug from Firestore jobProvenances collection
  noteInterne?: string;
}

/**
 * UPDATE JOB - Dati per aggiornamento job
 */
export interface UpdateJob {
  nomeEvento?: string;
  clientiIds?: string[];
  jobType?: string;  // Dynamic job type slug from Firestore jobTypes collection
  eventDate?: Date;
  allDay?: boolean;
  startTime?: string;
  endTime?: string;
  eventLocation?: string;
  provenance?: string;  // Dynamic provenance slug from Firestore jobProvenances collection
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
  byType: Record<string, number>;  // Dynamic job type slugs from Firestore
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
  jobType?: string[];  // Dynamic job type slugs from Firestore
  clienteId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  searchQuery?: string;         // Ricerca per nome cliente, location, ecc.
}
