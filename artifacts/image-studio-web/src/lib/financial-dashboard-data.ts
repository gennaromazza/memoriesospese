import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { buildFinanceDashboard } from "./finance-model";
import type { FinanceDashboard, FinanceDocument, FinanceSnapshot } from "./finance-types";
import * as XLSX from "xlsx";

export async function loadFinanceDashboard(): Promise<FinanceDashboard> {
  const coreCollections: Record<Exclude<keyof FinanceSnapshot, "labStatements">, string> = {
    orders: "orders", jobs: "jobs", bookings: "bookings",
    campaigns: "booking_campaigns", movements: "cashMovements",
    schedules: "paymentSchedules", clients: "clienti",
  };
  const results = await Promise.all(Object.entries(coreCollections).map(async ([key, name]) => {
    // No orderBy: documents missing legacy date fields must remain inspectable.
    const result = await getDocs(collection(db, name));
    return [key, result.docs.map(doc => ({ ...doc.data(), id: doc.id }) as FinanceDocument)] as const;
  }));
  const coreSnapshot = Object.fromEntries(results) as unknown as Omit<FinanceSnapshot, "labStatements">;
  let labStatements: FinanceDocument[] = [];
  let labWarning: string | undefined;
  try {
    const result = await getDocs(collection(db, "labSupplierStatements"));
    labStatements = result.docs.map(doc => ({ ...doc.data(), id: doc.id }) as FinanceDocument);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    labWarning = code === "permission-denied"
      ? "Dati laboratorio non disponibili: Firestore ha negato la lettura. I totali della sezione Laboratori non sono inclusi."
      : "Dati laboratorio non caricati. Riprova ad aggiornare; i totali della sezione Laboratori non sono inclusi.";
  }
  const dashboard = buildFinanceDashboard({ ...coreSnapshot, labStatements });
  return labWarning
    ? { ...dashboard, warnings: [...dashboard.warnings, labWarning] }
    : dashboard;
}

/** Exports precisely the filtered read model displayed by the dashboard. */
export function exportFinanceDashboard(data: FinanceDashboard): void {
  const date = (value: Date | null) => value
    ? value.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "Data non disponibile";
  const workbook = XLSX.utils.book_new();
  const append = (name: string, rows: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Esito: "Nessun dato" }]), name);
  append("Criteri", [{
    "Dati aggiornati al": data.updatedAt.toLocaleString("it-IT", { timeZone: "Europe/Rome" }),
    "Periodo incassi": data.exportContext?.period || "Come nella vista esportata",
    "Orizzonte da riscuotere": data.exportContext?.receivables || "Come nella vista esportata",
    Ricerca: data.exportContext?.search || "",
    Nota: "Pattuito e residuo delle campagne sono storici; incassi e uscite seguono il periodo. Le date assenti non sono ricostruite.",
  }]);
  append("Movimenti", data.ledger.map(e => ({
    Data: date(e.date), Tipo: e.kind === "refund" ? "Rimborso / storno" : e.kind === "cost" ? "Costo lavoro" : e.direction === "income" ? "Entrata" : "Uscita",
    Importo: e.amount, Origine: e.source, Cliente: e.customer,
    Descrizione: e.description, Metodo: e.method, Campagna: e.campaignId || "",
    Prenotazione: e.bookingId || "", Lavoro: e.jobId || "", Ordine: e.orderId || "",
    Riferimenti: e.references.join("; "),
  })));
  append("Da riscuotere", data.receivables.map(e => ({
    Scadenza: date(e.date), Residuo: e.amount,
    Stato: e.status === "future" ? "Futuro" : e.status === "overdue" ? "Scaduto" : "Senza data",
    Natura: e.scheduled ? "Rata programmata" : "Stima / residuo",
    Cliente: e.customer, Descrizione: e.label, Campagna: e.campaignId || "",
    Lavoro: e.jobId || "", Prenotazione: e.bookingId || "",
  })));
  append("Campagne", data.campaigns.map(c => ({
    ID: c.id, Campagna: c.name, Prenotazioni: c.bookings,
    "Concordato storico": c.agreed, "Incassato nel periodo": c.income,
    "Uscite nel periodo": c.expenses, "Netto nel periodo": c.net,
    "Residuo storico": c.outstanding,
  })));
  append("Costi laboratorio", data.labCosts.map((cost) => ({
    Laboratorio: cost.labName, Job: cost.jobName, Descrizione: cost.description,
    Costo: cost.amount, Stato: cost.status === "stima" ? "Stima" : "Consuntivo",
    Data: date(cost.date), Conteggio: cost.statementName || "",
  })));
  append("Pagamenti laboratorio", data.labPayments.map((payment) => ({
    Data: date(payment.date), Laboratorio: payment.labName, Conteggio: payment.statementName,
    Pagamento: payment.amount, Metodo: payment.method, "Residuo dopo il pagamento": payment.balanceAfter,
    Job: payment.jobNames.join("; "),
  })));
  append("Residui laboratorio", data.labBalances.map((balance) => ({
    Laboratorio: balance.labName, Conteggio: balance.statementName,
    "Residuo attuale": balance.balance, "Job inclusi": balance.jobNames.join("; "),
  })));
  append("Verifiche", data.warnings.map(w => ({ Segnalazione: w })));
  XLSX.writeFile(workbook, "rendiconto-finanziario.xlsx");
}