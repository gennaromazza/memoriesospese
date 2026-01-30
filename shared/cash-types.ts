/**
 * Types per gestione cassa e movimenti finanziari
 */

import { Timestamp } from "firebase/firestore";

// Tipo origine movimento cassa
export type CashMovementOrigine = 
  | "walk-in"      // Ordini walk-in (vendita diretta in studio)
  | "booking"      // Pagamenti da prenotazioni campagne
  | "job"          // Pagamenti da lavori/servizi fotografici
  | "manuale";     // Movimenti inseriti manualmente

// Firestore document structure
export interface CashMovement {
  id: string;
  tipo: "entrata" | "uscita";
  categoria: string;
  importo: number;
  descrizione: string;
  data: Timestamp;
  metodoPagamento: "contante" | "carta" | "bonifico" | "paypal" | "altro";
  note?: string;
  // Tracciamento origine
  origine?: CashMovementOrigine; // Fonte del movimento
  origineRef?: string; // ID riferimento (orderId, bookingId, jobId)
  origineTema?: string; // Tema/categoria della campagna (es. "natale", "carnevale")
  jobId?: string; // Riferimento opzionale al lavoro (legacy)
  orderId?: string; // Riferimento opzionale all'ordine (legacy)
  bookingId?: string; // Riferimento opzionale alla prenotazione
  allegati?: string[]; // URLs di eventuali ricevute/documenti
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Frontend representation - Date oggetti convertiti da Timestamp
export interface CashMovementFE extends Omit<CashMovement, 'data' | 'createdAt' | 'updatedAt'> {
  data: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertCashMovement {
  tipo: "entrata" | "uscita";
  categoria: string;
  importo: number;
  descrizione: string;
  data: Date;
  metodoPagamento: "contante" | "carta" | "bonifico" | "paypal" | "altro";
  note?: string;
  allegati?: string[];
  // Tracciamento origine
  origine?: CashMovementOrigine;
  origineRef?: string;
  origineTema?: string;
  jobId?: string;
  orderId?: string;
  bookingId?: string;
}

// Etichette per origini movimento
export const CASH_ORIGINE_LABELS: Record<CashMovementOrigine, string> = {
  "walk-in": "Ordini Walk-in",
  "booking": "Prenotazioni Campagne",
  "job": "Lavori/Servizi",
  "manuale": "Movimenti Manuali"
};

// Categorie predefinite per movimenti cassa (fallback se non ci sono categorie dinamiche)
export const CASH_CATEGORIES = {
  entrata: [
    "Vendita diretta",
    "Servizio fotografico",
    "Rimborso",
    "Altro entrata"
  ],
  uscita: [
    "Attrezzatura fotografica",
    "Marketing e pubblicità",
    "Viaggio e trasferta",
    "Affitto studio",
    "Materiale di consumo",
    "Formazione",
    "Tasse e imposte",
    "Altro uscita"
  ]
} as const;

// Categoria dinamica salvata in Firestore
export interface CashCategory {
  id: string;
  nome: string;
  tipo: "entrata" | "uscita" | "entrambi"; // Applicabile a entrate, uscite o entrambi
  ordine: number; // Ordine di visualizzazione
  attiva: boolean; // Se mostrare o nascondere
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CashCategoryFE extends Omit<CashCategory, 'createdAt' | 'updatedAt'> {
  createdAt: Date;
  updatedAt: Date;
}

// Riepilogo finanziario
export interface FinancialSummary {
  entrateOrdini: number; // Da transactions ordini
  usciteCassa: number; // Da movimenti cassa tipo "uscita"
  entrateAltre: number; // Da movimenti cassa tipo "entrata"
  totaleEntrate: number;
  totaleUscite: number;
  saldo: number;
  previstiIncasso: number; // Saldi ordini in sospeso
}

// Dato per grafico mensile
export interface MonthlyData {
  mese: string; // "Gen 2025"
  entrate: number;
  uscite: number;
  saldo: number;
}

// Forecast Types - Previsioni Incasso
export interface ForecastedIncome {
  data: Date;
  importo: number;
  ordini: {
    id: string;
    nomeSposi: string;
    importoResiduo: number;
  }[];
  jobs?: { // Payment schedules jobs con saldo residuo
    id: string;
    jobType: string;
    clienteNome: string;
    importoResiduo: number;
  }[];
  bookings?: { // Prenotazioni con saldo residuo (campagne)
    id: string;
    clienteNome: string;
    campaignNome: string;
    importoResiduo: number;
  }[];
}
