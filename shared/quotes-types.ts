/**
 * QUOTES SYSTEM - Types & Interfaces
 * Sistema preventivi digitali con firma
 */

import { Timestamp } from 'firebase/firestore';
import { JobType } from './jobs-types';

/**
 * Tipo preventivo
 */
export type QuoteType = 
  | 'fisso'       // Prezzo totale fisso, cliente vede solo e firma
  | 'variabile';  // Cliente può selezionare prodotti da lista

/**
 * Stato preventivo
 */
export type QuoteStatus = 
  | 'bozza'       // In preparazione admin
  | 'inviato'     // Inviato al cliente
  | 'visionato'   // Cliente ha aperto il link
  | 'firmato'     // Cliente ha firmato
  | 'rifiutato'   // Cliente ha rifiutato
  | 'scaduto';    // Link scaduto

/**
 * Prodotto nel preventivo
 */
export interface QuoteProduct {
  productId?: string;           // Link opzionale a products collection
  nome: string;
  descrizione: string;
  prezzo: number;
  selectable: boolean;          // true = cliente può selezionare (variabile)
  selected?: boolean;           // Scelta cliente (solo variabile)
  numeroFoto?: number;          // Numero foto incluse (es. 60 per album)
  categoria?: string;           // Es. "Album", "Video", "Stampe"
  immagini?: string[];          // URLs immagini prodotto (custom products)
}

/**
 * Clausola contrattuale
 */
export interface QuoteClause {
  id: string;
  text: string;                 // Testo clausola (può contenere HTML semplice)
  required: boolean;            // Obbligatoria per firma
  accepted?: boolean;           // Accettata dal cliente
  acceptedAt?: Timestamp;       // Quando accettata
}

/**
 * Firma digitale
 */
export interface QuoteSignature {
  imageUrl: string;             // PNG firma su Firebase Storage
  signedAt: Timestamp;
  ipAddress: string;
  userAgent: string;
  clientName: string;           // Nome firmato
}

/**
 * Tema grafico preventivo
 */
export interface QuoteTheme {
  primaryColor: string;         // Hex color (es. "#8B9A8B")
  secondaryColor: string;
  headerImage?: string;         // URL immagine header
  footerText?: string;          // Testo footer (es. contatti studio)
  fontFamily?: string;          // Font personalizzato
}

/**
 * Configurazione piano pagamenti
 */
export interface PaymentScheduleConfig {
  autoGenerate: boolean;                    // Genera automaticamente alla firma
  numberOfPayments?: number;                // Numero rate (1-10)
  
  // Dual-mode acconto: € o %
  accontoType: 'percentage' | 'amount';     // Tipo acconto
  accontoPercentage?: number;               // Percentuale acconto (0-100%)
  accontoAmount?: number;                   // Importo acconto fisso in €
  
  // Date scadenze relative alla data evento
  useEventDateReference: boolean;           // Usa data evento come riferimento
  accontoRelativeDays?: number;             // Giorni relativi a evento per acconto (es. -30 = 30gg prima)
  rateIntervalDays?: number;                // Intervallo giorni tra rate (default 30)
}

/**
 * QUOTE - Preventivo digitale
 */
export interface Quote {
  id: string;
  jobId: string;                // Link a job
  clienteId: string;            // Link a cliente
  
  // Tipo preventivo
  type: QuoteType;
  
  // Template usato (opzionale)
  templateId?: string;
  templateName?: string;
  
  // Tema grafico
  theme: QuoteTheme;
  
  // Prodotti
  products: QuoteProduct[];
  
  // Sconti
  discountType?: 'amount' | 'percent';  // Tipo sconto: fisso (€) o percentuale (%)
  discountValue?: number;               // Valore sconto
  
  // Totali
  totalBeforeDiscount: number;          // Totale prodotti (catalogo + custom)
  totalAfterDiscount: number;           // Totale finale con sconto applicato
  totaleSelezionato?: number;           // Totale calcolato da scelte cliente (variabile)
  
  // Legacy field (backward compatibility)
  totaleBase?: number;
  
  // Clausole contrattuali
  contractClauses: QuoteClause[];
  
  // Firma
  signature?: QuoteSignature;
  
  // Stato
  status: QuoteStatus;
  
  // Link pubblico
  publicToken: string;          // Token sicuro per URL pubblico
  expiresAt?: Timestamp;        // Scadenza link (opzionale)
  
  // Email tracking
  sentAt?: Timestamp;
  sentTo?: string;              // Email destinatario
  viewedAt?: Timestamp;         // Prima visualizzazione
  
  // Note interne
  noteInterne?: string;
  
  // Configurazione piano pagamenti
  paymentScheduleConfig?: PaymentScheduleConfig;
  
  // Payment schedules linkage (for atomic cascade deletes)
  paymentScheduleIds?: string[];    // IDs degli scadenzari pagamenti collegati
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;            // UID admin
}

/**
 * INSERT QUOTE - Dati creazione preventivo
 */
export interface InsertQuote {
  jobId: string;
  clienteId: string;
  type: QuoteType;
  templateId?: string;
  products: Omit<QuoteProduct, 'selected'>[];
  contractClauses: Omit<QuoteClause, 'accepted' | 'acceptedAt'>[];
  theme?: Partial<QuoteTheme>;
  discountType?: 'amount' | 'percent';
  discountValue?: number;
  totalBeforeDiscount: number;
  totalAfterDiscount: number;
  expiresAt?: Date;
  noteInterne?: string;
  paymentScheduleConfig?: PaymentScheduleConfig;
}

/**
 * QUOTE TEMPLATE - Template riutilizzabile
 */
export interface QuoteTemplate {
  id: string;
  nome: string;                 // Es. "Matrimonio Premium"
  jobType: JobType;             // Tipo lavoro associato
  type: QuoteType;              // Fisso o variabile
  
  // Tema grafico
  theme: QuoteTheme;
  
  // Prodotti pre-impostati
  defaultProducts: QuoteProduct[];
  
  // Clausole pre-impostate
  defaultClauses: Omit<QuoteClause, 'id' | 'accepted' | 'acceptedAt'>[];
  
  // Stato
  attivo: boolean;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * INSERT QUOTE TEMPLATE
 */
export interface InsertQuoteTemplate {
  nome: string;
  jobType: JobType;
  type: QuoteType;
  theme: QuoteTheme;
  defaultProducts: QuoteProduct[];
  defaultClauses: Omit<QuoteClause, 'id' | 'accepted' | 'acceptedAt'>[];
  attivo?: boolean;
}

/**
 * Dati accettazione preventivo (da cliente)
 */
export interface AcceptQuoteData {
  quoteId: string;
  signature: {
    imageDataUrl: string;       // Data URL firma canvas
    clientName: string;
  };
  selectedProducts?: string[];  // IDs prodotti selezionati (solo variabile)
  clausesAccepted: string[];    // IDs clausole accettate
}
