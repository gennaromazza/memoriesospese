import { Timestamp } from 'firebase/firestore';

export type InvoiceTaxTreatment =
  | 'iva_ordinaria'
  | 'iva_10'
  | 'iva_5'
  | 'iva_4'
  | 'esente'
  | 'non_imponibile'
  | 'fuori_campo';

export interface InvoiceLineInput {
  taxableAmount: number;
  taxTreatment: InvoiceTaxTreatment;
  taxRate?: number;
  description: string;
}

export interface InvoiceDraftInput extends InvoiceLineInput {
  jobId: string;
  clienteId: string;
  issueDate: string;
}

export interface InvoiceTotals {
  imponibile: number;
  imposta: number;
  totale: number;
  aliquota: number;
  natura?: string;
}

export interface InvoiceValidationResult {
  valid: boolean;
  missing: string[];
  errors: string[];
  totals?: InvoiceTotals;
}

export interface InvoiceHistoryItem {
  id: string;
  jobId: string;
  clienteId: string;
  numero: string;
  year: number;
  issueDate: string;
  description: string;
  totals: InvoiceTotals;
  filename: string;
  createdAt: string | null;
}

export interface InvoiceRecord extends Omit<InvoiceHistoryItem, 'createdAt'> {
  senderSnapshot: Record<string, unknown>;
  recipientSnapshot: Record<string, unknown>;
  input: InvoiceLineInput;
  xml: string;
  createdBy: string;
  createdAt: Timestamp;
}