/**
 * TypeScript Types per Modulo Clienti
 * Collection Firestore: clienti
 * 
 * Sistema unificato di gestione clienti dello studio fotografico
 */

import { Timestamp } from 'firebase/firestore';

/**
 * CLIENTE - Record unificato cliente
 */
export interface Cliente {
  id: string;
  
  // Dati anagrafici
  nome: string;
  cognome: string;
  email: string; // OBBLIGATORIO - chiave univoca
  
  // Contatti
  cellulare1?: string; // Telefono principale
  cellulare2?: string; // Telefono secondario (opzionale)
  whatsapp?: string; // Numero WhatsApp (può coincidere con cellulare1)
  
  // Indirizzo
  via?: string;
  citta?: string;
  cap?: string;
  provincia?: string;
  
  // Collegamenti a entità esistenti
  sourceRefs: {
    bookingIds: string[]; // Array ID prenotazioni
    orderIds: string[]; // Array ID ordini
    galleryIds: string[]; // Array ID gallerie
    passwordRequestIds?: string[]; // Array ID richieste password
    userIds?: string[]; // Array ID utenti registrati (Firebase Auth)
    consultationIds?: string[]; // Array ID consulenze
    jobIds?: string[]; // Array ID lavori
  };
  
  // Analytics e lifecycle
  lifecycle: {
    firstContactAt: Timestamp; // Prima interazione (booking/order/gallery)
    lastInteractionAt: Timestamp; // Ultima modifica/interazione
    status: 'lead' | 'prospect' | 'cliente_attivo' | 'archiviato';
  };
  
  // Dati finanziari aggregati
  financials: {
    totalRevenue: number; // Somma totale pagato (da transactions ordini)
    outstandingBalance: number; // Saldo rimanente da pagare
    totalOrders: number; // Numero ordini totali
    lastPaymentAt?: Timestamp; // Data ultimo pagamento
  };
  
  // Note e tags
  note?: string; // Note interne admin
  tags?: string[]; // Tags per categorizzazione (es. "matrimonio", "famiglia", "VIP")
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy?: string; // UID admin che ha creato (se manuale)
}

/**
 * INSERT CLIENTE - Dati per creazione nuovo cliente
 */
export interface InsertCliente {
  nome: string;
  cognome: string;
  email: string; // OBBLIGATORIO
  
  // Contatti opzionali
  cellulare1?: string;
  cellulare2?: string;
  whatsapp?: string;
  
  // Indirizzo opzionale
  via?: string;
  citta?: string;
  cap?: string;
  provincia?: string;
  
  // Note e tags opzionali
  note?: string;
  tags?: string[];
  
  // Lifecycle status (default: 'lead')
  status?: 'lead' | 'prospect' | 'cliente_attivo' | 'archiviato';
}

/**
 * UPDATE CLIENTE - Dati per aggiornamento cliente esistente
 */
export interface UpdateCliente {
  nome?: string;
  cognome?: string;
  email?: string;
  
  cellulare1?: string;
  cellulare2?: string;
  whatsapp?: string;
  
  via?: string;
  citta?: string;
  cap?: string;
  provincia?: string;
  
  note?: string;
  tags?: string[];
  
  status?: 'lead' | 'prospect' | 'cliente_attivo' | 'archiviato';
}

/**
 * CLIENTE CON STORICO - Cliente + dati aggregati per visualizzazione
 */
export interface ClienteWithHistory extends Cliente {
  // Storico aggregato (caricato separatamente)
  bookings?: Array<{
    id: string;
    dataShootingInizio: Timestamp;
    stato: string;
    prodottoNome?: string;
  }>;
  orders?: Array<{
    id: string;
    totale: number;
    saldo: number;
    stato: string;
    createdAt: Timestamp;
  }>;
  galleries?: Array<{
    id: string;
    name: string;
    code: string;
    photoCount: number;
  }>;
}

/**
 * FILTRI CLIENTI - Per ricerca e filtraggio
 */
export interface ClientiFilters {
  searchQuery?: string; // Ricerca per nome/email/telefono
  status?: 'lead' | 'prospect' | 'cliente_attivo' | 'archiviato' | 'tutti';
  tags?: string[]; // Filtra per tag specifici
  citta?: string; // Filtra per città
  hasOutstandingBalance?: boolean; // Solo con saldo pendente
  dateFrom?: Date; // Data creazione da
  dateTo?: Date; // Data creazione a
}

/**
 * CLIENTE STATS - Statistiche aggregate per dashboard
 */
export interface ClienteStats {
  totalClienti: number;
  clientiAttivi: number;
  lead: number;
  archiviati: number;
  totalRevenue: number;
  outstandingTotal: number;
  avgRevenuePerCliente: number;
}

/**
 * IMPORT CSV - Types per importazione clienti da CSV
 */
export interface ImportCSVRow {
  'Nome Azienda'?: string;
  Nome: string;
  Cognome: string;
  Email: string;
  Phone?: string;
  'C.A.P'?: string;
  Stato?: string;
  Provincia?: string;
  'Codice Fiscale'?: string;
  Città?: string;
  'Prefisso Internazionale'?: string;
  'Note Cliente'?: string;
}

export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  mappedData?: InsertCliente;
}

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: Array<{
    index: number;
    original: ImportCSVRow;
    validation: ImportValidationResult;
    isDuplicate: boolean;
    existingClienteId?: string;
  }>;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  updated: number;
  failed: number;
  errors: Array<{
    row: number;
    error: string;
  }>;
}
