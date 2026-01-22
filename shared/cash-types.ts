/**
 * Types per gestione cassa e movimenti finanziari
 */

import { Timestamp } from "firebase/firestore";

export interface CashMovement {
  id: string;
  tipo: "entrata" | "uscita";
  categoria: string;
  importo: number;
  descrizione: string;
  data: Timestamp | Date;
  metodoPagamento: "contante" | "carta" | "bonifico" | "paypal" | "altro";
  note?: string;
  jobId?: string; // Riferimento opzionale al lavoro
  orderId?: string; // Riferimento opzionale all'ordine
  allegati?: string[]; // URLs di eventuali ricevute/documenti
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
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
}

// Categorie predefinite per movimenti cassa
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
}
