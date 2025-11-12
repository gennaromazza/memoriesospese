/**
 * JOB PRESETS SYSTEM - Types & Interfaces
 * Sistema preset per velocizzare creazione job/preventivi
 */

import { Timestamp } from 'firebase/firestore';
import { QuoteProduct, QuoteClause, QuoteTheme, PaymentScheduleConfig } from './quotes-types';

/**
 * JOB PRESET - Configurazione riutilizzabile per creazione job/preventivi
 */
export interface JobPreset {
  id: string;
  nome: string;                        // Es. "Servizio Base Matrimonio", "Premium con Album"
  descrizione?: string;                // Descrizione opzionale dettagliata
  
  // Prodotti pre-impostati (cuore del preset)
  products: QuoteProduct[];            // Array completo prodotti con prezzi, descrizioni, categorie
  
  // Sconto predefinito (opzionale)
  discountType?: 'amount' | 'percent';
  discountValue?: number;
  
  // Template clausole contrattuali (opzionale) - ID del template invece di clausole complete
  clauseTemplateId?: string;
  
  // Tema grafico predefinito (opzionale)
  theme?: Partial<QuoteTheme>;
  
  // Piano pagamenti predefinito (opzionale)
  paymentScheduleConfig?: PaymentScheduleConfig;
  
  // Ownership & condivisione (preparazione future)
  createdBy: string;                   // UID admin proprietario
  sharedWith?: string[];               // UIDs utenti con accesso (future feature)
  isPublic?: boolean;                  // Preset pubblico/privato (future feature)
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * INSERT JOB PRESET - Dati creazione nuovo preset
 */
export interface InsertJobPreset {
  nome: string;
  descrizione?: string;
  products: QuoteProduct[];
  discountType?: 'amount' | 'percent';
  discountValue?: number;
  clauseTemplateId?: string;
  theme?: Partial<QuoteTheme>;
  paymentScheduleConfig?: PaymentScheduleConfig;
  sharedWith?: string[];
  isPublic?: boolean;
}

/**
 * UPDATE JOB PRESET - Dati aggiornamento preset esistente
 */
export interface UpdateJobPreset {
  nome?: string;
  descrizione?: string;
  products?: QuoteProduct[];
  discountType?: 'amount' | 'percent' | null;  // null per rimuovere sconto
  discountValue?: number | null;
  clauseTemplateId?: string | null;
  theme?: Partial<QuoteTheme> | null;
  paymentScheduleConfig?: PaymentScheduleConfig | null;
  sharedWith?: string[];
  isPublic?: boolean;
}
