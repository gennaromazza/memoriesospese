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
 * Nota con foto allegata
 */
export interface NoteFotoItem {
  id: string;
  imageUrl: string;
  nota: string;
  createdAt: Timestamp;
}

/**
 * Appuntamento cliente - Orario e note per ogni cliente del job
 */
export interface AppuntamentoCliente {
  clienteId: string;
  orarioAppuntamento: string;  // HH:mm format
  noteAppuntamento?: string;   // Note opzionali (es. indirizzo specifico, citofono)
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
  consultationId?: string;      // Link opzionale a consultation (se da consulenza) - Fix #1
  orderIds: string[];           // Array ordini collegati
  galleryIds: string[];         // Array gallerie collegate
  quoteIds: string[];           // Array preventivi collegati
  
  // Dati lavoro
  nomeEvento: string;           // Nome descrittivo lavoro (es. "Matrimonio Silva")
  jobType: string;              // Dynamic job type slug from Firestore jobTypes collection
  eventDate: Timestamp;         // Data servizio fotografico
  previousStatus?: JobStatus;   // Status precedente a 'consegnato' per ripristino toggle
  allDay: boolean;              // Evento tutto il giorno o orario specifico
  startTime?: string;           // Orario inizio (HH:mm) - opzionale se allDay = true
  endTime?: string;             // Orario fine (HH:mm) - opzionale
  eventLocation?: string;       // Luogo evento (es. "Casale dei Baroni")
  rituLocation?: string;        // Luogo rito/celebrazione (es. "Chiesa San Giuseppe")
  rituTime?: string;            // Orario rito/celebrazione (HH:mm)
  provenance: string;           // Dynamic provenance slug from Firestore jobProvenances collection
  
  // Pipeline stato
  status: JobStatus;
  
  // Snapshot economico (calcolato da orders e payment schedules)
  financials: JobFinancials;
  
  // PDF moduli allegati
  pdfs: JobPDF[];
  
  // Costi lavoro
  costi: CostoLavoro[];
  
  // Eventi workflow timeline (consulenze inviate, appuntamenti creati)
  workflowEvents: JobTimelineEvent[];
  
  // Note interne admin
  noteInterne?: string;
  note?: string;                // Nota generale (legacy/backward compatibility)
  notePerFoto?: NoteFotoItem[]; // Note con foto allegate
  
  // Appuntamenti clienti (orari per casa di ogni cliente)
  appuntamentiClienti?: AppuntamentoCliente[];
  
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
  rituLocation?: string;  // Luogo rito/celebrazione
  rituTime?: string;      // Orario rito/celebrazione (HH:mm)
  provenance: string;  // Dynamic provenance slug from Firestore jobProvenances collection
  noteInterne?: string;
  appuntamentiClienti?: AppuntamentoCliente[];  // Orari appuntamento per ogni cliente
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
  rituLocation?: string;
  rituTime?: string;
  locationCerimonia?: string;  // Alias per rituLocation
  oraCerimonia?: string;       // Alias per rituTime
  provenance?: string;  // Dynamic provenance slug from Firestore jobProvenances collection
  noteInterne?: string;
  status?: JobStatus;
  costi?: CostoLavoro[];  // Update costi array
  appuntamentiClienti?: AppuntamentoCliente[];  // Orari appuntamento per ogni cliente
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
    | 'nota_aggiunta'
    | 'consulenza_inviata'      // Richiesta consulenza visione file inviata
    | 'appuntamento_creato';     // Appuntamento calendario creato
  descrizione: string;
  data: Timestamp;
  userId?: string;              // UID admin che ha eseguito l'azione
  metadata?: Record<string, any>; // Dati extra (es. importo pagamento, ID preventivo, link consulenza, canale notifica)
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
