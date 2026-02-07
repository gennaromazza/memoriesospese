/**
 * STUDIO ASSISTANT - Types & Interfaces
 * Sistema suggerimenti intelligenti per gestione studio fotografico
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Tipi di suggerimento
 */
export type SuggestionType = 
  | 'unsigned_quote'      // Preventivo non firmato
  | 'pending_delivery'    // Lavoro da consegnare
  | 'consultation'        // Consulenza da prenotare
  | 'pending_order'       // Ordine non completato
  | 'pending_booking';    // Prenotazione non completata

/**
 * Stato follow-up preventivo
 */
export type QuoteFollowUpStatus = 
  | 'never_contacted'     // Mai contattato
  | 'contacted_once'      // Contattato 1 volta
  | 'contacted_twice'     // Contattato 2 volte
  | 'abandoned';          // Archiviato/abbandonato

/**
 * Variante messaggio WhatsApp
 */
export type MessageVariant = 'gentle' | 'direct' | 'final';

/**
 * Priorità suggerimento
 */
export type SuggestionPriority = 'high' | 'medium' | 'low';

/**
 * Azione eseguita su suggerimento
 */
export type SuggestionAction = 
  | 'contacted'           // Cliente contattato (WhatsApp)
  | 'booked'              // Consulenza prenotata
  | 'completed'           // Azione completata (consegnato, firmato, etc.)
  | 'archived'            // Archiviato/ignorato
  | 'snoozed';            // Posticipato

/**
 * Motivo lavoro in sospeso
 */
export type PendingReason = 'editing' | 'client_waiting' | 'printing' | 'other';

/**
 * Suggerimento singolo
 */
export interface StudioSuggestion {
  id: string;
  type: SuggestionType;
  
  // Riferimenti
  jobId?: string;
  quoteId?: string;
  
  // Contesto visualizzazione
  jobName?: string;
  clientName?: string;
  eventDate?: string;
  jobType?: string;
  
  // Stato e priorità
  priority: SuggestionPriority;
  createdAt: Timestamp;
  lastShownAt?: Timestamp;
  
  // Tracking azioni
  dismissedAt?: Timestamp;
  actionTaken?: SuggestionAction;
  actionTakenAt?: Timestamp;
  
  // Dati specifici per tipo
  // Per unsigned_quote
  followUpStatus?: QuoteFollowUpStatus;
  followUpCount?: number;
  daysSinceQuoteSent?: number;
  messageVariant?: MessageVariant;
  whatsappMessage?: string;
  clientPhone?: string;
  
  // Per pending_delivery
  monthsSinceEvent?: number;
  pendingReason?: PendingReason;
  
  // Per consultation
  consultationTemplateId?: string;
  consultationTemplateName?: string;
  suggestedDates?: {
    from: string;  // YYYY-MM-DD
    to: string;    // YYYY-MM-DD
  };
  
  // Per pending_order
  orderId?: string;
  orderTotal?: number;
  orderStatus?: string;
  isWalkIn?: boolean;
  daysSinceOrderCreated?: number;
  
  // Per pending_booking
  bookingId?: string;
  bookingStatus?: string;
  bookingDate?: string;
  daysSinceBooking?: number;
  
  // Motivo visualizzazione (per UI)
  reason?: string;
}

/**
 * Risposta API suggerimenti
 */
export interface StudioSuggestionsResponse {
  success: boolean;
  data: {
    unsignedQuotes: StudioSuggestion[];
    pendingDeliveries: StudioSuggestion[];
    consultations: StudioSuggestion[];
    needsWorkJobs: StudioSuggestion[];
    pendingOrders?: StudioSuggestion[];
    pendingBookings?: StudioSuggestion[];
  };
  stats: {
    totalActions: number;
    estimatedMinutes: number;
    highPriority: number;
    pendingApprovalCount?: number;
  };
}

/**
 * Parametri azione su suggerimento
 */
export interface SuggestionActionParams {
  suggestionId: string;
  action: SuggestionAction;
  pendingReason?: PendingReason;  // Se action = 'snoozed' e tipo = pending_delivery
  snoozeUntil?: string;           // Data fino a cui posticipare
  note?: string;
}

/**
 * Configurazione regole suggerimenti
 */
export interface SuggestionRulesConfig {
  // Preventivi non firmati
  unsignedQuote: {
    daysBeforeFirstReminder: number;   // Default: 7
    daysBeforeSecondReminder: number;  // Default: 14
    daysBeforeFinalReminder: number;   // Default: 21
  };
  
  // Lavori da consegnare
  pendingDelivery: {
    monthsAfterEventForReminder: number;  // Default: 3
  };
  
  // Consulenze
  consultation: {
    maxWeeklyLoad: number;                // Default: 8 (somma pesi)
    workingDays: number[];                // Default: [1,2,3,4,5] (Lun-Ven)
  };
}

/**
 * Carico settimanale consulenze
 */
export interface WeeklyLoad {
  weekStart: string;  // YYYY-MM-DD (lunedì)
  weekEnd: string;    // YYYY-MM-DD (domenica)
  totalWeight: number;
  consultationsCount: number;
  isFull: boolean;
}

/**
 * Messaggi WhatsApp precompilati
 */
export const WHATSAPP_MESSAGES = {
  unsignedQuote: {
    gentle: (clientName: string, eventName: string) => 
      `Ciao ${clientName}! Spero tutto bene.\nVolevo sapere se hai avuto modo di visionare il preventivo che ti ho inviato per ${eventName}.\nResto a disposizione per qualsiasi chiarimento!`,
    direct: (clientName: string, eventName: string) => 
      `Ciao ${clientName}!\nTi scrivo per un aggiornamento sul preventivo per ${eventName}.\nFammi sapere se hai domande o se possiamo procedere!`,
    final: (clientName: string, eventName: string) => 
      `Ciao ${clientName}!\nCapisco se nel frattempo avete fatto altre valutazioni per ${eventName}.\nResto comunque a disposizione se in futuro aveste bisogno. Un caro saluto!`
  },
  consultation: {
    visione: (clientName: string, eventType: string, dateFrom: string, dateTo: string) =>
      `Ciao ${clientName}!\nSono felice di comunicarti che le foto del tuo ${eventType} sono pronte per la visione!\nTi propongo di fissare un appuntamento per vederle insieme.\nSei disponibile tra il ${dateFrom} e il ${dateTo}?`,
    consegna: (clientName: string, eventType: string) =>
      `Ciao ${clientName}!\nVolevo aggiornarti sullo stato del tuo ${eventType}.\nQuando ti farebbe comodo passare per il ritiro?`
  }
};

/**
 * Helper: Calcola priorità suggerimento
 */
export function calculatePriority(
  type: SuggestionType,
  daysOrMonths: number,
  followUpCount?: number
): SuggestionPriority {
  if (type === 'unsigned_quote') {
    if (daysOrMonths >= 14 && (followUpCount ?? 0) === 0) return 'high';
    if (daysOrMonths >= 7) return 'medium';
    return 'low';
  }
  
  if (type === 'pending_delivery') {
    if (daysOrMonths >= 6) return 'high';
    if (daysOrMonths >= 3) return 'medium';
    return 'low';
  }
  
  return 'medium';
}

/**
 * Helper: Determina variante messaggio
 */
export function getMessageVariant(followUpCount: number): MessageVariant {
  if (followUpCount === 0) return 'gentle';
  if (followUpCount === 1) return 'direct';
  return 'final';
}
