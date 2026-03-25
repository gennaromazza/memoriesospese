/**
 * QUOTES SYSTEM - Types & Interfaces
 * Sistema preventivi digitali con firma
 */

import { Timestamp } from 'firebase/firestore';
import { JobType } from './jobs-types';
import type { BenefitRule } from './quote-benefits';

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
  | 'scaduto'     // Link scaduto
  | 'annullato';  // Annullato dall'admin

/**
 * Prodotto nel preventivo
 */
/**
 * Bundle item nel preventivo (snapshot dal catalogo)
 */
export interface QuoteBundleItem {
  prodottoId?: string;
  prodottoNome: string;
  quantita: number;
  numeroFoto?: number;
}

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
  isBundle?: boolean;           // true = questo prodotto è un bundle
  bundleItems?: QuoteBundleItem[]; // Prodotti inclusi nel bundle
  isOmaggio?: boolean;          // true = prodotto in omaggio (prezzo = 0, visibile nel contratto)
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
  ordine?: number;              // Ordine di visualizzazione
}

/**
 * Firma digitale
 */
export interface QuoteSignature {
  imageUrl?: string;            // PNG firma su Firebase Storage (opzionale - solo legacy)
  signedAt: Timestamp;
  ipAddress: string;
  userAgent: string;
  clientName: string;           // Nome firmato
}

/**
 * Token revocato (per audit trail)
 */
export interface RevokedToken {
  token: string;                // Token revocato
  revokedAt: Timestamp;         // Data revoca
  revokedBy: string;            // Email admin che ha revocato
  reason: string;               // Motivo: "status_change", "manual_regeneration", etc.
}

/**
 * Evento audit log preventivo
 */
export interface QuoteAuditEvent {
  id: string;
  quoteId: string;
  timestamp: Timestamp;
  adminEmail: string;
  action: 'status_change' | 'signature_override' | 'token_regenerated' | 'quote_created' | 'quote_deleted';
  previousValue?: any;
  newValue?: any;
  reason?: string;
  metadata?: Record<string, any>;
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
  selectedBeforeDiscount?: number;      // Subtotale prodotti selezionati prima dello sconto (variabile firmato)
  
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
  revokedTokens?: RevokedToken[]; // Storico token revocati (audit)
  
  // Email tracking
  sentAt?: Timestamp;
  sentTo?: string;              // Email destinatario
  viewedAt?: Timestamp;         // Prima visualizzazione
  emailSentAt?: Timestamp;      // Quando email è stata inviata manualmente
  
  // Note interne
  noteInterne?: string;
  
  // Configurazione piano pagamenti
  paymentScheduleConfig?: PaymentScheduleConfig;
  
  // Payment schedules linkage (for atomic cascade deletes)
  paymentScheduleIds?: string[];    // IDs degli scadenzari pagamenti collegati

  // Regole benefit inclusi automatici (solo preventivi variabili)
  benefitRules?: BenefitRule[];
  
  // Dati job per portale pubblico
  jobInfo?: {
    nomeEvento: string;
    eventDate: Timestamp;
    rito: string;
    location: string;
  };
  
  // Dati clienti per portale pubblico (supporta multipli)
  clientiInfo?: Array<{
    id: string;
    nome: string;
    cognome: string;
    email: string;
    telefono: string;
    indirizzo: string;
    cap: string;
    citta: string;
  }>;
  
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
  jobInfo?: {
    nomeEvento: string;
    eventDate: Date;             // FE lavora con Date, backend converte in Timestamp
    rito: string;
    location: string;
  };
  clientiInfo?: Array<{
    id: string;
    nome: string;
    cognome: string;
    email: string;
    telefono: string;
    indirizzo: string;
    cap: string;
    citta: string;
  }>;
}

/**
 * QUOTE TEMPLATE - Template riutilizzabile
 */
export interface QuoteTemplate {
  id: string;
  nome: string;                 // Es. "Matrimonio Premium"
  jobType: string;              // Slug del tipo lavoro (es. "matrimonio")
  type: QuoteType;              // Fisso o variabile
  
  // Tema grafico
  theme: QuoteTheme;
  
  // Prodotti pre-impostati
  defaultProducts: QuoteProduct[];
  
  // Clausole pre-impostate
  defaultClauses: Omit<QuoteClause, 'id' | 'accepted' | 'acceptedAt'>[];
  
  // Sconto opzionale
  discountType?: 'amount' | 'percent';
  discountValue?: number;
  
  // Ordinamento drag&drop
  ordine?: number;
  
  // Preventivo Rapido - token condivisibile per link pubblico
  shareableToken?: string;

  // Regole benefit inclusi (solo template variabili)
  benefitRules?: BenefitRule[];
  
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
  jobType: string;              // Slug del tipo lavoro (es. "matrimonio")
  type: QuoteType;
  theme: QuoteTheme;
  defaultProducts: QuoteProduct[];
  defaultClauses: Omit<QuoteClause, 'id' | 'accepted' | 'acceptedAt'>[];
  discountType?: 'amount' | 'percent';
  discountValue?: number;
  ordine?: number;
  attivo?: boolean;
  benefitRules?: BenefitRule[];
}

/**
 * Dati accettazione preventivo (da cliente)
 */
export interface AcceptQuoteData {
  quoteId: string;
  signature: {
    imageDataUrl?: string;      // Data URL firma canvas (opzionale - solo legacy)
    clientName: string;
  };
  selectedProducts?: string[];  // IDs prodotti selezionati (solo variabile)
  clausesAccepted: string[];    // IDs clausole accettate
}
