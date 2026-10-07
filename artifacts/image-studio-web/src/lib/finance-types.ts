export type FinanceSource = "job" | "booking" | "walk-in" | "print_shop" | "manuale";
export type FinanceDate = unknown;
export type FinanceLabCostStatus = "stima" | "consuntivo";

export interface FinanceTransaction {
  id?: string;
  transactionId?: string;
  cashMovementId?: string;
  paymentId?: string;
  tipo?: string;
  importo: number;
  data?: FinanceDate;
  metodo?: string;
  metodoPagamento?: string;
  note?: string;
}

/** Read-only shape shared by historical Firestore documents and API responses. */
export interface FinanceDocument {
  id: string;
  jobId?: string;
  bookingId?: string;
  campaignId?: string;
  orderId?: string;
  orderIds?: string[];
  clienteId?: string;
  clientiIds?: string[];
  nome?: string;
  cognome?: string;
  nomeEvento?: string;
  nomeCliente?: string;
  cliente?: { nome?: string; cognome?: string };
  jobType?: string;
  stato?: string;
  totale?: number;
  saldoResiduo?: number;
  totalePagato?: number;
  transactions?: FinanceTransaction[];
  payments?: (FinanceTransaction & {
    stato?: string;
    importoPagato?: number;
    dataScadenza?: FinanceDate;
    dataPagamento?: FinanceDate;
    orderTransactionId?: string;
  })[];
  costi?: {
    id?: string;
    importo: number;
    data?: FinanceDate;
    descrizione?: string;
    cashMovementId?: string;
    labId?: string;
    labNome?: string;
    statoLab?: FinanceLabCostStatus;
    labStatementId?: string;
    labStatementNome?: string;
    costoId?: string;
    stato?: FinanceLabCostStatus;
    jobId?: string;
    jobNome?: string;
  }[];
  pagamentoLaboratorio?: {
    statementId: string;
    labId: string;
    labNome: string;
    statementNome: string;
    saldoDopo: number;
    jobIds: string[];
    jobNomi: string[];
  };
  labId?: string;
  labNome?: string;
  lavori?: Array<{ jobId?: string; jobNome?: string; costoId?: string; descrizione?: string; importo?: number; stato?: FinanceLabCostStatus; data?: FinanceDate }>;
  eventDate?: FinanceDate;
  dataServizio?: FinanceDate;
  dataShootingInizio?: FinanceDate;
  data?: FinanceDate;
  tipo?: string;
  importo?: number;
  descrizione?: string;
  categoria?: string;
  metodoPagamento?: string;
  origine?: FinanceSource;
  origineRef?: string;
  origineTema?: string;
  sourceType?: string;
  sourceId?: string;
  paymentId?: string;
  jobCostId?: string;
  orderType?: string;
  status?: string;
  clientNames?: string[];
  financials?: { saldoResiduo?: number };
}

export interface FinanceSnapshot {
  orders: FinanceDocument[];
  jobs: FinanceDocument[];
  bookings: FinanceDocument[];
  campaigns: FinanceDocument[];
  movements: FinanceDocument[];
  schedules: FinanceDocument[];
  clients: FinanceDocument[];
  labStatements: FinanceDocument[];
}

export interface FinanceLabCost {
  id: string;
  labId: string;
  labName: string;
  jobId?: string;
  jobName: string;
  description: string;
  amount: number;
  date: Date | null;
  status: FinanceLabCostStatus;
  statementId?: string;
  statementName?: string;
}

export interface FinanceLabPayment {
  id: string;
  labId: string;
  labName: string;
  statementId: string;
  statementName: string;
  date: Date | null;
  amount: number;
  method: string;
  balanceAfter: number;
  jobIds: string[];
  jobNames: string[];
}

export interface FinanceLabBalance {
  id: string;
  labId: string;
  labName: string;
  statementName: string;
  balance: number;
  jobIds: string[];
  jobNames: string[];
}

export interface FinanceLedgerEntry {
  id: string;
  date: Date | null;
  amount: number;
  direction: "income" | "expense";
  kind?: "receipt" | "refund" | "cost" | "expense";
  source: FinanceSource;
  description: string;
  customer: string;
  method: string;
  campaignId?: string;
  bookingId?: string;
  jobId?: string;
  orderId?: string;
  references: string[];
}

export interface FinanceReceivable {
  id: string;
  date: Date | null;
  amount: number;
  status: "future" | "overdue" | "undated";
  scheduled: boolean;
  source: FinanceSource;
  label: string;
  customer: string;
  paymentType?: string;
  jobId?: string;
  orderId?: string;
  bookingId?: string;
  campaignId?: string;
}

export interface FinanceCampaign {
  id: string;
  name: string;
  bookings: number;
  agreed: number;
  income: number;
  expenses: number;
  net: number;
  outstanding: number;
  entries: FinanceLedgerEntry[];
  receivables: FinanceReceivable[];
}

export interface FinanceDashboard {
  ledger: FinanceLedgerEntry[];
  receivables: FinanceReceivable[];
  campaigns: FinanceCampaign[];
  labCosts: FinanceLabCost[];
  labPayments: FinanceLabPayment[];
  labBalances: FinanceLabBalance[];
  warnings: string[];
  updatedAt: Date;
  exportContext?: { period: string; receivables: string; search?: string };
}

export interface FinanceFilter {
  from?: Date;
  to?: Date;
  campaignId?: string;
  source?: FinanceSource;
}