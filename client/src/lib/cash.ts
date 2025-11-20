/**
 * Cash Management Service
 * Gestisce movimenti cassa e calcoli finanziari
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import * as XLSX from "xlsx";
import type { CashMovement, InsertCashMovement, FinancialSummary, MonthlyData, ForecastedIncome } from "@shared/cash-types";
import { getAllOrders } from "./orders";
import type { Order, Transaction } from "@shared/booking-types";
import { getAllJobs } from "./jobs";
import { getPaymentSchedulesForJob } from "./payment-schedules";
import type { Job } from "@shared/jobs-types";

const COLLECTION = "cashMovements";

/**
 * Helper: Rimuove campi undefined
 */
function sanitizeData<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined),
  ) as Partial<T>;
}

/**
 * Ottiene tutti i movimenti cassa
 */
export async function getAllCashMovements(): Promise<CashMovement[]> {
  const q = query(collection(db, COLLECTION), orderBy("data", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as CashMovement[];
}

/**
 * Crea un nuovo movimento cassa
 */
export async function createCashMovement(data: InsertCashMovement): Promise<string> {
  const finalData = {
    ...data,
    data: Timestamp.fromDate(data.data),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, COLLECTION), sanitizeData(finalData));
  return docRef.id;
}

/**
 * Aggiorna movimento cassa
 */
export async function updateCashMovement(
  id: string,
  data: Partial<InsertCashMovement>
): Promise<void> {
  const docRef = doc(db, COLLECTION, id);

  const updateData: any = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  if (data.data) {
    updateData.data = Timestamp.fromDate(data.data);
  }

  await updateDoc(docRef, sanitizeData(updateData));
}

/**
 * Elimina movimento cassa
 */
export async function deleteCashMovement(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION, id);
  await deleteDoc(docRef);
}

/**
 * Calcola riepilogo finanziario completo
 */
export async function getFinancialSummary(
  startDate?: Date,
  endDate?: Date
): Promise<FinancialSummary> {
  // 1. Ottieni tutti gli ordini
  const orders = await getAllOrders();

  // 2. Ottieni tutti i movimenti cassa
  const cashMovements = await getAllCashMovements();

  // 3. Filtra per date se specificate
  const filterByDate = (date: any): boolean => {
    if (!startDate && !endDate) return true;
    
    const d = date instanceof Timestamp ? date.toDate() : new Date(date);
    
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    
    return true;
  };

  // 4. Calcola entrate da ordini (somma di tutte le transactions)
  let entrateOrdini = 0;
  let previstiIncasso = 0;

  orders.forEach((order) => {
    const transactions: Transaction[] = order.transactions || [];
    
    // Somma pagamenti ricevuti (filtrati per data)
    transactions.forEach((t) => {
      if (filterByDate(t.data)) {
        entrateOrdini += t.importo;
      }
    });

    // Calcola saldo previsto (se ordine non completato E dataServizio nel range)
    const saldo = order.saldo || 0;
    if (saldo > 0 && order.dataServizio) {
      // Filtra previsioni per dataServizio nel range
      if (filterByDate(order.dataServizio)) {
        previstiIncasso += saldo;
      }
    }
  });

  // 5. Calcola entrate/uscite da movimenti cassa
  let entrateAltre = 0;
  let usciteCassa = 0;

  cashMovements.forEach((mov) => {
    if (!filterByDate(mov.data)) return;

    if (mov.tipo === "entrata") {
      entrateAltre += mov.importo;
    } else {
      usciteCassa += mov.importo;
    }
  });

  // 6. Calcola totali
  const totaleEntrate = entrateOrdini + entrateAltre;
  const totaleUscite = usciteCassa;
  const saldo = totaleEntrate - totaleUscite;

  return {
    entrateOrdini,
    entrateAltre,
    usciteCassa,
    totaleEntrate,
    totaleUscite,
    saldo,
    previstiIncasso,
  };
}

/**
 * Ottiene dati per grafico mensile (ultimi 12 mesi)
 */
export async function getMonthlyData(): Promise<MonthlyData[]> {
  const orders = await getAllOrders();
  const cashMovements = await getAllCashMovements();

  // Crea array ultimi 12 mesi
  const now = new Date();
  const months: MonthlyData[] = [];

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = date.toLocaleDateString("it-IT", { month: "short", year: "numeric" });

    months.push({
      mese: monthStr.charAt(0).toUpperCase() + monthStr.slice(1),
      entrate: 0,
      uscite: 0,
      saldo: 0,
    });
  }

  // Helper per determinare indice mese
  const getMonthIndex = (date: Date): number => {
    const diffMonths =
      (now.getFullYear() - date.getFullYear()) * 12 +
      (now.getMonth() - date.getMonth());

    return 11 - diffMonths;
  };

  // Aggiungi entrate da ordini
  orders.forEach((order) => {
    const transactions: Transaction[] = order.transactions || [];

    transactions.forEach((t) => {
      const d = t.data instanceof Timestamp ? t.data.toDate() : new Date(t.data);
      const idx = getMonthIndex(d);

      if (idx >= 0 && idx < 12) {
        months[idx].entrate += t.importo;
      }
    });
  });

  // Aggiungi movimenti cassa
  cashMovements.forEach((mov) => {
    const d = mov.data instanceof Timestamp ? mov.data.toDate() : new Date(mov.data);
    const idx = getMonthIndex(d);

    if (idx >= 0 && idx < 12) {
      if (mov.tipo === "entrata") {
        months[idx].entrate += mov.importo;
      } else {
        months[idx].uscite += mov.importo;
      }
    }
  });

  // Calcola saldi
  months.forEach((m) => {
    m.saldo = m.entrate - m.uscite;
  });

  return months;
}

/**
 * Calcola previsioni incasso da ordini E jobs in sospeso
 * Raggruppa per data servizio/evento ordini + jobs con saldo residuo > 0
 */
export async function getForecastedIncome(): Promise<ForecastedIncome[]> {
  const [orders, jobs] = await Promise.all([
    getAllOrders(),
    getAllJobs(),
  ]);

  // 1. Filtra ordini con importo residuo > 0 e data servizio valida
  const ordersWithBalance = orders
    .map((order) => {
      const totalePagato = (order.transactions || []).reduce(
        (sum, t) => sum + t.importo,
        0
      );
      const importoResiduo = order.totale - totalePagato;

      return {
        ...order,
        importoResiduo,
      };
    })
    .filter((order) => order.importoResiduo > 0 && order.dataServizio);

  // 2. Filtra jobs con eventDate e payment schedules con saldo > 0
  const jobsWithBalance: Array<Job & { importoResiduo: number; clienteNome: string }> = [];
  
  for (const job of jobs) {
    if (!job.eventDate) continue; // Skip jobs senza eventDate
    
    // Fetcha payment schedules per questo job
    const schedules = await getPaymentSchedulesForJob(job.id);
    if (schedules.length === 0) continue; // Skip se non ha payment schedules
    
    // Aggrega saldoResiduo da tutti gli schedules (gestisce duplicati)
    const saldoResiduoTotale = schedules.reduce((sum, s) => sum + s.saldoResiduo, 0);
    
    if (saldoResiduoTotale <= 0) continue; // Skip se già pagato
    
    // Fetcha cliente per nome (usa primo cliente del job)
    let clienteNome = "Cliente sconosciuto";
    if (job.clientiIds.length > 0) {
      try {
        const clienteDoc = await getDoc(doc(db, 'clienti', job.clientiIds[0]));
        if (clienteDoc.exists()) {
          const clienteData = clienteDoc.data();
          clienteNome = clienteData.nome || "Cliente sconosciuto";
        }
      } catch (error) {
        console.warn(`⚠️ Errore fetch cliente ${job.clientiIds[0]}:`, error);
      }
    }
    
    jobsWithBalance.push({
      ...job,
      importoResiduo: saldoResiduoTotale,
      clienteNome,
    });
  }

  // 3. Raggruppa per data servizio/evento
  const grouped = new Map<string, ForecastedIncome>();

  // Aggiungi Orders
  ordersWithBalance.forEach((order) => {
    if (!order.dataServizio) return;
    
    let dataServizio: Date;
    if (order.dataServizio instanceof Timestamp) {
      dataServizio = order.dataServizio.toDate();
    } else if (typeof order.dataServizio === 'string') {
      dataServizio = new Date(order.dataServizio);
    } else {
      dataServizio = order.dataServizio as Date;
    }

    const dateKey = dataServizio.toISOString().split("T")[0];

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, {
        data: dataServizio,
        importo: 0,
        ordini: [],
        jobs: [],
      });
    }

    const forecast = grouped.get(dateKey)!;
    forecast.importo += order.importoResiduo;
    forecast.ordini.push({
      id: order.id,
      nomeSposi: order.nomeCliente || "Cliente sconosciuto",
      importoResiduo: order.importoResiduo,
    });
  });

  // Aggiungi Jobs
  jobsWithBalance.forEach((job) => {
    if (!job.eventDate) return;
    
    let eventDate: Date;
    if (job.eventDate instanceof Timestamp) {
      eventDate = job.eventDate.toDate();
    } else if (typeof job.eventDate === 'string') {
      eventDate = new Date(job.eventDate);
    } else {
      eventDate = job.eventDate as Date;
    }

    const dateKey = eventDate.toISOString().split("T")[0];

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, {
        data: eventDate,
        importo: 0,
        ordini: [],
        jobs: [],
      });
    }

    const forecast = grouped.get(dateKey)!;
    forecast.importo += job.importoResiduo;
    forecast.jobs!.push({
      id: job.id,
      jobType: job.jobType,
      clienteNome: job.clienteNome,
      importoResiduo: job.importoResiduo,
    });
  });

  // 4. Converti in array e ordina per data
  return Array.from(grouped.values()).sort(
    (a, b) => a.data.getTime() - b.data.getTime()
  );
}

/**
 * Esporta dati finanziari in Excel
 * Include movimenti cassa e transazioni ordini
 */
export async function exportFinancialData(
  startDate?: Date,
  endDate?: Date
): Promise<void> {
  const toDate = (d: Date | Timestamp): Date => {
    return d instanceof Timestamp ? d.toDate() : d;
  };

  const formatDate = (d: Date | Timestamp): string => {
    return toDate(d).toLocaleDateString("it-IT");
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  // Recupera dati
  const movements = await getAllCashMovements();
  const orders = await getAllOrders();

  // Filtra per range date se specificato
  const filterByDate = (d: Date | Timestamp): boolean => {
    const date = toDate(d);
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    return true;
  };

  const filteredMovements = movements.filter((m) => filterByDate(m.data));

  // Estrai transazioni da ordini
  const transactions: any[] = [];
  orders.forEach((order) => {
    (order.transactions || []).forEach((t) => {
      if (filterByDate(t.data)) {
        transactions.push({
          data: formatDate(t.data),
          tipo: "Entrata Ordine",
          categoria: `Ordine ${order.nomeCliente || "N/A"}`,
          descrizione: `${t.tipo.toUpperCase()} - ${order.nomeCliente || "N/A"}`,
          importo: formatCurrency(t.importo),
          metodo: t.metodo,
          note: t.note || "",
        });
      }
    });
  });

  // Converti movimenti cassa in formato Excel
  const cashData = filteredMovements.map((m) => ({
    data: formatDate(m.data),
    tipo: m.tipo === "entrata" ? "Entrata Cassa" : "Uscita Cassa",
    categoria: m.categoria,
    descrizione: m.descrizione,
    importo: formatCurrency(m.importo),
    metodo: m.metodoPagamento,
    note: m.note || "",
  }));

  // Combina tutti i movimenti
  const allData = [...transactions, ...cashData].sort((a, b) => {
    const dateA = new Date(a.data.split("/").reverse().join("-"));
    const dateB = new Date(b.data.split("/").reverse().join("-"));
    return dateB.getTime() - dateA.getTime();
  });

  // Calcola totali
  const summary = await getFinancialSummary(startDate);
  const summaryData = [
    { campo: "Entrate da Ordini", valore: formatCurrency(summary.entrateOrdini) },
    { campo: "Altre Entrate", valore: formatCurrency(summary.entrateAltre) },
    { campo: "Totale Entrate", valore: formatCurrency(summary.totaleEntrate) },
    { campo: "Totale Uscite", valore: formatCurrency(summary.totaleUscite) },
    { campo: "Saldo Netto", valore: formatCurrency(summary.saldo) },
    { campo: "Incassi Previsti", valore: formatCurrency(summary.previstiIncasso) },
  ];

  // Crea workbook
  const wb = XLSX.utils.book_new();

  // Sheet 1: Tutti i movimenti
  const ws1 = XLSX.utils.json_to_sheet(allData);
  XLSX.utils.book_append_sheet(wb, ws1, "Movimenti");

  // Sheet 2: Riepilogo
  const ws2 = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, ws2, "Riepilogo");

  // Sheet 3: Solo movimenti cassa
  const ws3 = XLSX.utils.json_to_sheet(cashData);
  XLSX.utils.book_append_sheet(wb, ws3, "Registro Cassa");

  // Sheet 4: Solo transazioni ordini
  const ws4 = XLSX.utils.json_to_sheet(transactions);
  XLSX.utils.book_append_sheet(wb, ws4, "Pagamenti Ordini");

  // Genera nome file
  const dateStr = new Date().toISOString().split("T")[0];
  const fileName = `Report_Finanziario_${dateStr}.xlsx`;

  // Download
  XLSX.writeFile(wb, fileName);
}
