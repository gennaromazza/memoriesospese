/**
 * PAYMENT SCHEDULES - Types & Interfaces
 * Sistema pagamenti programmati con integrazione cassa
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Tipo pagamento
 */
export type PaymentType = 
  | 'acconto'   // Acconto iniziale
  | 'saldo'     // Saldo finale
  | 'rata';     // Rata intermedia

/**
 * Stato pagamento
 */
export type PaymentStatus = 
  | 'atteso'    // Non ancora pagato, in scadenza
  | 'pagato'    // Pagamento completato
  | 'parziale'  // Pagamento parziale
  | 'scaduto';  // Scaduto e non pagato

/**
 * Metodo pagamento
 */
export type PaymentMethod = 
  | 'contante' 
  | 'carta' 
  | 'bonifico' 
  | 'paypal';

/**
 * Pagamento schedulato singolo
 */
export interface ScheduledPayment {
  id: string;
  tipo: PaymentType;
  importo: number;              // Importo atteso
  dataScadenza: Timestamp;
  
  // Stato
  stato: PaymentStatus;
  
  // Dati pagamento (quando pagato)
  importoPagato?: number;       // Importo effettivamente pagato
  dataPagamento?: Timestamp;
  metodoPagamento?: PaymentMethod;
  
  // Collegamenti
  cashMovementId?: string;      // Link a cashMovements collection
  orderTransactionId?: string;  // Link a transaction in order
  
  // Note
  note?: string;
  
  // Reminder inviati
  reminderSentAt?: Timestamp;
}

/**
 * PAYMENT SCHEDULE - Calendario pagamenti job
 */
export interface PaymentSchedule {
  id: string;
  jobId: string;
  orderId: string;              // Ordine di riferimento
  clienteId: string;
  
  // Pagamenti schedulati
  payments: ScheduledPayment[];
  
  // Totali calcolati
  totale: number;               // Somma importi attesi
  totalePagato: number;         // Somma importi pagati
  saldoResiduo: number;         // Differenza
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * INSERT PAYMENT SCHEDULE
 */
export interface InsertPaymentSchedule {
  jobId: string;
  orderId: string;
  clienteId: string;
  payments: Array<{
    tipo: PaymentType;
    importo: number;
    dataScadenza: Date;
    note?: string;
  }>;
}

/**
 * Registrazione pagamento
 */
export interface RegisterPaymentData {
  scheduleId: string;
  paymentId: string;            // ID pagamento nello schedule
  importoPagato: number;
  dataPagamento: Date;
  metodoPagamento: PaymentMethod;
  note?: string;
  
  // Opzioni integrazione
  createCashMovement?: boolean;  // Default: true
  updateOrder?: boolean;         // Default: true
}

/**
 * Pagamento in scadenza (per dashboard)
 */
export interface UpcomingPayment {
  scheduleId: string;
  paymentId: string;
  jobId: string;
  clienteId: string;
  clienteNome: string;
  jobType: string;
  tipo: PaymentType;
  importo: number;
  dataScadenza: Timestamp;
  giorniAllaScadenza: number;
  stato: PaymentStatus;
}

/**
 * Stats pagamenti
 */
export interface PaymentStats {
  totaleAtteso: number;         // Somma pagamenti attesi
  totalePagato: number;         // Somma pagamenti ricevuti
  totaleScaduto: number;        // Somma pagamenti scaduti
  prossimi7Giorni: number;      // Importo in scadenza prossimi 7gg
  prossimi30Giorni: number;     // Importo in scadenza prossimi 30gg
}
