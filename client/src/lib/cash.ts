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
import type { CashMovement, CashMovementFE, InsertCashMovement, FinancialSummary, MonthlyData, ForecastedIncome, CashCategory, CashCategoryFE } from "@shared/cash-types";
import { CASH_CATEGORIES } from "@shared/cash-types";
import { getAllOrders } from "./orders";
import type { Order, Transaction, Booking } from "@shared/booking-types";
import { getAllJobs } from "./jobs";
import { getPaymentSchedulesForJob } from "./payment-schedules";
import type { Job } from "@shared/jobs-types";
import { getAllBookings } from "./bookings";
import { getCampaignById } from "./booking-campaigns";

const COLLECTION = "cashMovements";
const CATEGORIES_COLLECTION = "cashCategories";

/**
 * Helper: Rimuove campi undefined
 */
function sanitizeData<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined),
  ) as Partial<T>;
}

/**
 * Helper: Converte Timestamp/serialized Timestamp/Date in Date
 * Restituisce fallback se conversione fallisce
 */
function toSafeDate(value: any, fallback: Date = new Date()): Date {
  if (!value) return fallback;
  
  // Firestore Timestamp (ha metodo toDate)
  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }
  
  // Timestamp serializzato da Firestore REST API
  if (value && typeof value === 'object' && 'seconds' in value) {
    return new Date(value.seconds * 1000);
  }
  
  // Già un Date
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? fallback : value;
  }
  
  // String ISO o altro
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * Helper: Converte documento Firestore in CashMovementFE
 */
function toCashMovementFE(id: string, data: any): CashMovementFE {
  return {
    id,
    ...data,
    data: toSafeDate(data.data),
    createdAt: toSafeDate(data.createdAt),
    updatedAt: toSafeDate(data.updatedAt, data.createdAt?.toDate?.() || new Date()),
  };
}

/**
 * Ottiene tutti i movimenti cassa
 */
export async function getAllCashMovements(): Promise<CashMovementFE[]> {
  const q = query(collection(db, COLLECTION), orderBy("data", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => toCashMovementFE(doc.id, doc.data()));
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
  // 1-2. Ottieni ordini, movimenti cassa e lavori in parallelo
  const [orders, cashMovements, jobs] = await Promise.all([
    getAllOrders(),
    getAllCashMovements(),
    getAllJobs(),
  ]);

  // 3. Filtra per date se specificate
  const filterByDate = (date: any): boolean => {
    if (!startDate && !endDate) return true;
    if (!date) return false; // Data mancante = escludi
    
    // Gestisce tutti i formati possibili:
    // 1. Timestamp istanza (date.toDate())
    // 2. Timestamp serializzato ({seconds, nanoseconds})
    // 3. Date object
    // 4. String ISO date
    let d: Date;
    if (date instanceof Timestamp) {
      d = date.toDate();
    } else if (date && typeof date === 'object' && ('seconds' in date || '_seconds' in date)) {
      // Timestamp serializzato da Firestore (Web SDK: seconds, Admin SDK via API: _seconds)
      d = new Date(((date as any).seconds ?? (date as any)._seconds) * 1000);
    } else if (date instanceof Date) {
      d = date;
    } else {
      d = new Date(date);
    }
    
    // Verifica validità data
    if (isNaN(d.getTime())) return false;
    
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

  // 5b. Calcola uscite dai costi dei lavori (job.costi)
  let usciteCostiLavori = 0;
  jobs.forEach((job) => {
    const costi = job.costi || [];
    costi.forEach((costo) => {
      if (typeof costo?.importo !== "number") return;
      if (!filterByDate(costo.data)) return;
      usciteCostiLavori += costo.importo;
    });
  });

  // 6. Calcola totali
  const totaleEntrate = entrateOrdini + entrateAltre;
  const totaleUscite = usciteCassa + usciteCostiLavori;
  const saldo = totaleEntrate - totaleUscite;

  return {
    entrateOrdini,
    entrateAltre,
    usciteCassa,
    usciteCostiLavori,
    totaleEntrate,
    totaleUscite,
    saldo,
    previstiIncasso,
  };
}

/**
 * Helper: Converte qualsiasi formato data in Date
 * Gestisce Timestamp, Timestamp serializzato, Date, string
 */
function toDate(date: any): Date | null {
  if (!date) return null;
  
  if (date instanceof Timestamp) {
    return date.toDate();
  } else if (date && typeof date === 'object' && ('seconds' in date || '_seconds' in date)) {
    // Timestamp serializzato da Firestore (Web SDK: seconds, Admin SDK via API: _seconds)
    return new Date(((date as any).seconds ?? (date as any)._seconds) * 1000);
  } else if (date instanceof Date) {
    return date;
  } else {
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
  }
}

/**
 * Ottiene dati per grafico mensile (ultimi 12 mesi)
 */
export async function getMonthlyData(year?: number): Promise<MonthlyData[]> {
  const [orders, cashMovements, jobs] = await Promise.all([
    getAllOrders(),
    getAllCashMovements(),
    getAllJobs(),
  ]);

  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const months: MonthlyData[] = [];

  // Se anno specificato, mostra tutti i 12 mesi di quell'anno
  // Altrimenti, mostra ultimi 12 mesi dalla data corrente
  const isCurrentYear = targetYear === now.getFullYear();

  for (let i = 0; i < 12; i++) {
    const date = isCurrentYear
      ? new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      : new Date(targetYear, i, 1);
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
    if (isCurrentYear) {
      const diffMonths =
        (now.getFullYear() - date.getFullYear()) * 12 +
        (now.getMonth() - date.getMonth());
      return 11 - diffMonths;
    } else {
      // Per anno specifico, indice = mese (0-11)
      if (date.getFullYear() !== targetYear) return -1;
      return date.getMonth();
    }
  };

  // Aggiungi entrate da ordini
  orders.forEach((order) => {
    const transactions: Transaction[] = order.transactions || [];

    transactions.forEach((t) => {
      const d = toDate(t.data);
      if (!d) return;
      
      const idx = getMonthIndex(d);
      if (idx >= 0 && idx < 12) {
        months[idx].entrate += t.importo;
      }
    });
  });

  // Aggiungi movimenti cassa
  cashMovements.forEach((mov) => {
    const d = toDate(mov.data);
    if (!d) return;
    
    const idx = getMonthIndex(d);
    if (idx >= 0 && idx < 12) {
      if (mov.tipo === "entrata") {
        months[idx].entrate += mov.importo;
      } else {
        months[idx].uscite += mov.importo;
      }
    }
  });

  // Aggiungi costi dei lavori (job.costi) come uscite
  jobs.forEach((job) => {
    const costi = job.costi || [];
    costi.forEach((costo) => {
      if (typeof costo?.importo !== "number") return;
      const d = toDate(costo.data);
      if (!d) return;

      const idx = getMonthIndex(d);
      if (idx >= 0 && idx < 12) {
        months[idx].uscite += costo.importo;
      }
    });
  });

  // Calcola saldi
  months.forEach((m) => {
    m.saldo = m.entrate - m.uscite;
  });

  return months;
}

/**
 * Calcola previsioni incasso da ordini, jobs E bookings in sospeso
 * Raggruppa per data servizio/evento ordini + jobs + bookings con saldo residuo > 0
 */
export async function getForecastedIncome(): Promise<ForecastedIncome[]> {
  const [orders, jobs, bookings] = await Promise.all([
    getAllOrders(),
    getAllJobs(),
    getAllBookings(),
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

  // 2. Filtra jobs con eventDate e saldo > 0 (da payment schedules o saldoResiduo diretto)
  const jobsWithBalance: Array<Job & { importoResiduo: number; clienteNome: string }> = [];
  
  for (const job of jobs) {
    if (!job.eventDate) continue; // Skip jobs senza eventDate
    
    let saldoResiduoTotale = 0;
    
    // Prima prova payment schedules
    const schedules = await getPaymentSchedulesForJob(job.id);
    if (schedules.length > 0) {
      // Aggrega saldoResiduo da tutti gli schedules
      saldoResiduoTotale = schedules.reduce((sum, s) => sum + s.saldoResiduo, 0);
    } else {
      // Fallback: usa saldoResiduo diretto sul job (accesso type-safe)
      const jobAny = job as any;
      if (jobAny.saldoResiduo && typeof jobAny.saldoResiduo === 'number' && jobAny.saldoResiduo > 0) {
        saldoResiduoTotale = jobAny.saldoResiduo;
      }
    }
    
    if (saldoResiduoTotale <= 0) continue; // Skip se già pagato
    
    // Fetcha cliente per nome (usa primo cliente del job)
    let clienteNome = "Cliente sconosciuto";
    if (job.clientiIds && job.clientiIds.length > 0) {
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
        bookings: [],
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
        bookings: [],
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

  // 3b. Filtra bookings con saldo residuo > 0 e data shooting futura
  const bookingsWithBalance: Array<Booking & { importoResiduo: number; campaignNome: string }> = [];
  
  // Fetch prodotti per calcolare totale se non presente
  const { getActiveProducts } = await import('./products');
  const allProducts = await getActiveProducts();
  
  for (const booking of bookings) {
    // Solo prenotazioni confermate
    if (booking.stato !== 'confermata') continue;
    if (!booking.dataShootingInizio) continue;
    
    // Calcola totale: usa booking.totale se presente, altrimenti calcola dai prodotti
    let totaleBooking = booking.totale || 0;
    
    if (totaleBooking <= 0 && booking.prodotti && booking.prodotti.length > 0) {
      // Calcola totale dai prodotti selezionati
      totaleBooking = booking.prodotti.reduce((sum, item) => {
        const product = allProducts.find(p => p.id === item.prodottoId);
        if (product) {
          return sum + product.prezzoFinale * (item.quantita || 1);
        }
        return sum;
      }, 0);
    }
    
    if (totaleBooking <= 0) continue; // Nessun valore economico
    
    // Calcola saldo residuo
    const totalePagato = (booking.transactions || []).reduce((sum, t) => sum + t.importo, 0);
    const importoResiduo = totaleBooking - totalePagato;
    
    if (importoResiduo <= 0) continue; // Già pagato
    
    // Ottieni nome campagna
    let campaignNome = "Campagna sconosciuta";
    try {
      const campaign = await getCampaignById(booking.campaignId);
      if (campaign) {
        campaignNome = campaign.nome;
      }
    } catch (error) {
      console.warn(`⚠️ Errore fetch campagna ${booking.campaignId}:`, error);
    }
    
    bookingsWithBalance.push({
      ...booking,
      importoResiduo,
      campaignNome,
    });
  }

  // Aggiungi Bookings
  bookingsWithBalance.forEach((booking) => {
    if (!booking.dataShootingInizio) return;
    
    let dataShootingDate: Date;
    if (booking.dataShootingInizio instanceof Timestamp) {
      dataShootingDate = booking.dataShootingInizio.toDate();
    } else if (typeof booking.dataShootingInizio === 'string') {
      dataShootingDate = new Date(booking.dataShootingInizio);
    } else if ((booking.dataShootingInizio as any)?.seconds) {
      // Gestisce Timestamp serializzato
      dataShootingDate = new Date((booking.dataShootingInizio as any).seconds * 1000);
    } else {
      dataShootingDate = booking.dataShootingInizio as unknown as Date;
    }

    const dateKey = dataShootingDate.toISOString().split("T")[0];

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, {
        data: dataShootingDate,
        importo: 0,
        ordini: [],
        jobs: [],
        bookings: [],
      });
    }

    const forecast = grouped.get(dateKey)!;
    forecast.importo += booking.importoResiduo;
    if (!forecast.bookings) forecast.bookings = [];
    forecast.bookings.push({
      id: booking.id,
      clienteNome: `${booking.cliente.nome} ${booking.cliente.cognome}`,
      campaignNome: booking.campaignNome,
      importoResiduo: booking.importoResiduo,
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
  const toDateLocal = (d: any): Date => {
    if (!d) return new Date(0);
    if (d instanceof Timestamp) return d.toDate();
    if (d && typeof d === 'object' && ('seconds' in d || '_seconds' in d)) return new Date(((d as any).seconds ?? (d as any)._seconds) * 1000);
    if (d instanceof Date) return d;
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? new Date(0) : parsed;
  };

  const formatDate = (d: any): string => {
    return toDateLocal(d).toLocaleDateString("it-IT");
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
  const jobs = await getAllJobs();

  // Filtra per range date se specificato
  const filterByDate = (d: any): boolean => {
    const date = toDateLocal(d);
    if (date.getTime() === 0) return false; // Data non valida
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

  // Estrai costi dei lavori (uscite) in formato Excel
  const jobCostiData: any[] = [];
  jobs.forEach((job) => {
    const costi = job.costi || [];
    costi.forEach((costo) => {
      if (typeof costo?.importo !== "number") return;
      if (!filterByDate(costo.data)) return;
      jobCostiData.push({
        data: formatDate(costo.data),
        tipo: "Uscita Costo Lavoro",
        categoria: costo.tipo || "altro",
        descrizione: costo.descrizione || "",
        importo: formatCurrency(costo.importo),
        metodo: "",
        note: costo.note || "",
      });
    });
  });

  // Combina tutti i movimenti
  const allData = [...transactions, ...cashData, ...jobCostiData].sort((a, b) => {
    const dateA = new Date(a.data.split("/").reverse().join("-"));
    const dateB = new Date(b.data.split("/").reverse().join("-"));
    return dateB.getTime() - dateA.getTime();
  });

  // Calcola totali
  const summary = await getFinancialSummary(startDate, endDate);
  const summaryData = [
    { campo: "Entrate da Ordini", valore: formatCurrency(summary.entrateOrdini) },
    { campo: "Altre Entrate", valore: formatCurrency(summary.entrateAltre) },
    { campo: "Totale Entrate", valore: formatCurrency(summary.totaleEntrate) },
    { campo: "Uscite Cassa", valore: formatCurrency(summary.usciteCassa) },
    { campo: "Uscite Costi Lavori", valore: formatCurrency(summary.usciteCostiLavori) },
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

  // Sheet 5: Solo costi dei lavori
  const ws5 = XLSX.utils.json_to_sheet(jobCostiData);
  XLSX.utils.book_append_sheet(wb, ws5, "Costi Lavori");

  // Genera nome file
  const dateStr = new Date().toISOString().split("T")[0];
  const fileName = `Report_Finanziario_${dateStr}.xlsx`;

  // Download
  XLSX.writeFile(wb, fileName);
}

// =============================================
// GESTIONE CATEGORIE DINAMICHE
// =============================================

/**
 * Ottiene tutte le categorie dinamiche
 */
export async function getAllCashCategories(): Promise<CashCategoryFE[]> {
  const q = query(
    collection(db, CATEGORIES_COLLECTION),
    orderBy("ordine", "asc")
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      nome: data.nome,
      tipo: data.tipo,
      ordine: data.ordine || 0,
      attiva: data.attiva !== false,
      createdAt: toSafeDate(data.createdAt),
      updatedAt: toSafeDate(data.updatedAt),
    };
  });
}

/**
 * Ottiene categorie per tipo (entrata/uscita)
 * Combina categorie dinamiche con fallback hardcoded
 */
export async function getCategoriesByTipo(tipo: "entrata" | "uscita"): Promise<string[]> {
  const categories = await getAllCashCategories();
  const filtered = categories
    .filter(c => c.attiva && (c.tipo === tipo || c.tipo === "entrambi"))
    .map(c => c.nome);
  
  // Se non ci sono categorie dinamiche, usa quelle hardcoded
  if (filtered.length === 0) {
    return [...CASH_CATEGORIES[tipo]];
  }
  
  return filtered;
}

/**
 * Crea una nuova categoria
 */
export async function createCashCategory(data: {
  nome: string;
  tipo: "entrata" | "uscita" | "entrambi";
  ordine?: number;
}): Promise<string> {
  const categories = await getAllCashCategories();
  const maxOrdine = categories.reduce((max, c) => Math.max(max, c.ordine), 0);
  
  const docRef = await addDoc(collection(db, CATEGORIES_COLLECTION), {
    nome: data.nome,
    tipo: data.tipo,
    ordine: data.ordine ?? maxOrdine + 1,
    attiva: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  return docRef.id;
}

/**
 * Aggiorna una categoria
 */
export async function updateCashCategory(
  id: string,
  data: Partial<{ nome: string; tipo: string; ordine: number; attiva: boolean }>
): Promise<void> {
  const docRef = doc(db, CATEGORIES_COLLECTION, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Elimina una categoria
 */
export async function deleteCashCategory(id: string): Promise<void> {
  const docRef = doc(db, CATEGORIES_COLLECTION, id);
  await deleteDoc(docRef);
}

/**
 * Seed delle categorie predefinite
 * Crea le categorie dinamiche a partire dalle costanti hardcoded
 */
export async function seedCashCategories(): Promise<void> {
  const existing = await getAllCashCategories();
  if (existing.length > 0) {
    console.log("Categorie già presenti, skip seed");
    return;
  }
  
  let ordine = 1;
  
  // Crea categorie entrata
  for (const nome of CASH_CATEGORIES.entrata) {
    await createCashCategory({ nome, tipo: "entrata", ordine: ordine++ });
  }
  
  // Crea categorie uscita
  for (const nome of CASH_CATEGORIES.uscita) {
    await createCashCategory({ nome, tipo: "uscita", ordine: ordine++ });
  }
  
  console.log("✅ Seed categorie completato");
}

// Esponi funzione per seed manuale da console
if (typeof window !== 'undefined') {
  (window as any).seedCashCategories = seedCashCategories;
}

// =============================================
// SCRIPT MIGRAZIONE ORIGINE MOVIMENTI
// =============================================

/**
 * Analizza i movimenti esistenti e assegna automaticamente l'origine
 * basandosi sui riferimenti (jobId, orderId, bookingId) già presenti
 */
export async function migrateMovementsOrigin(): Promise<{ updated: number; skipped: number }> {
  const movements = await getAllCashMovements();
  let updated = 0;
  let skipped = 0;
  
  for (const movement of movements) {
    // Se ha già un'origine, skip
    if (movement.origine) {
      skipped++;
      continue;
    }
    
    let newOrigine: 'walk-in' | 'booking' | 'job' | 'manuale' = 'manuale';
    let newOrigineRef: string | undefined;
    
    // Determina origine basandosi sui riferimenti esistenti
    if (movement.jobId) {
      newOrigine = 'job';
      newOrigineRef = movement.jobId;
    } else if (movement.bookingId) {
      newOrigine = 'booking';
      newOrigineRef = movement.bookingId;
    } else if (movement.orderId) {
      // Se ha orderId ma non jobId o bookingId, probabilmente è walk-in
      newOrigine = 'walk-in';
      newOrigineRef = movement.orderId;
    } else if (movement.descrizione) {
      // Analizza la descrizione per capire l'origine
      const desc = movement.descrizione.toLowerCase();
      if (desc.includes('walk-in') || desc.includes('ordine walk')) {
        newOrigine = 'walk-in';
      } else if (desc.includes('prenotazione') || desc.includes('booking')) {
        newOrigine = 'booking';
      } else if (desc.includes('job') || desc.includes('servizio fotografico') || desc.includes('matrimonio')) {
        newOrigine = 'job';
      }
    }
    
    // Aggiorna il movimento
    await updateCashMovement(movement.id, {
      origine: newOrigine,
      origineRef: newOrigineRef,
    });
    
    console.log(`✅ Movimento ${movement.id}: ${newOrigine} (${movement.descrizione?.substring(0, 30)}...)`);
    updated++;
  }
  
  console.log(`🔄 Migrazione completata: ${updated} aggiornati, ${skipped} già con origine`);
  return { updated, skipped };
}

/**
 * Migrazione completa: assegna origine E origineTema a tutti i movimenti
 * Risolve bookingId → campagna, jobId → jobType, orderId → booking → campagna
 */
export async function migrateMovementsComplete(): Promise<{ updated: number; skipped: number; details: string[] }> {
  const movements = await getAllCashMovements();
  const details: string[] = [];
  let updated = 0;
  let skipped = 0;
  
  // Cache per evitare query ripetute
  const bookingCache: Record<string, any> = {};
  const campaignCache: Record<string, string> = {};
  const jobCache: Record<string, string> = {};
  const orderCache: Record<string, any> = {};
  
  // Precarica bookings
  const bookings = await getAllBookings();
  for (const b of bookings) {
    bookingCache[b.id] = b;
  }
  
  // Precarica jobs
  const jobs = await getAllJobs();
  for (const j of jobs) {
    jobCache[j.id] = j.jobType || '';
  }
  
  // Precarica orders
  const orders = await getAllOrders();
  for (const o of orders) {
    orderCache[o.id] = o;
  }
  
  for (const movement of movements) {
    let needsUpdate = false;
    const updates: Partial<CashMovementFE> = {};
    
    // 1. Determina origine se mancante
    if (!movement.origine) {
      if (movement.jobId) {
        updates.origine = 'job';
        updates.origineRef = movement.jobId;
      } else if (movement.bookingId) {
        updates.origine = 'booking';
        updates.origineRef = movement.bookingId;
      } else if (movement.orderId) {
        const order = orderCache[movement.orderId];
        if (order?.bookingId) {
          updates.origine = 'booking';
          updates.origineRef = order.bookingId;
        } else {
          updates.origine = 'walk-in';
          updates.origineRef = movement.orderId;
        }
      } else {
        // Analizza descrizione
        const desc = (movement.descrizione || '').toLowerCase();
        if (desc.includes('walk-in')) {
          updates.origine = 'walk-in';
        } else if (desc.includes('prenotazione') || desc.includes('booking')) {
          updates.origine = 'booking';
        } else if (desc.includes('job') || desc.includes('matrimonio')) {
          updates.origine = 'job';
        } else {
          updates.origine = 'manuale';
        }
      }
      needsUpdate = true;
    }
    
    // 2. Determina origineTema se mancante
    if (!movement.origineTema) {
      let tema: string | undefined;
      
      // Prova da bookingId diretto
      if (movement.bookingId && bookingCache[movement.bookingId]) {
        const booking = bookingCache[movement.bookingId];
        if (booking.campaignId) {
          if (!campaignCache[booking.campaignId]) {
            try {
              const campaign = await getCampaignById(booking.campaignId);
              if (campaign) campaignCache[booking.campaignId] = campaign.nome;
            } catch (e) {}
          }
          tema = campaignCache[booking.campaignId];
        }
      }
      
      // Prova da orderId → bookingId → campagna
      if (!tema && movement.orderId && orderCache[movement.orderId]) {
        const order = orderCache[movement.orderId];
        if (order.bookingId && bookingCache[order.bookingId]) {
          const booking = bookingCache[order.bookingId];
          if (booking.campaignId) {
            if (!campaignCache[booking.campaignId]) {
              try {
                const campaign = await getCampaignById(booking.campaignId);
                if (campaign) campaignCache[booking.campaignId] = campaign.nome;
              } catch (e) {}
            }
            tema = campaignCache[booking.campaignId];
          }
        }
      }
      
      // Prova da jobId → jobType
      if (!tema && movement.jobId && jobCache[movement.jobId]) {
        tema = jobCache[movement.jobId];
      }
      
      if (tema) {
        updates.origineTema = tema;
        needsUpdate = true;
      }
    }
    
    // 3. Aggiorna se necessario
    if (needsUpdate && Object.keys(updates).length > 0) {
      await updateCashMovement(movement.id, updates);
      const detail = `${movement.id}: origine=${updates.origine || movement.origine}, tema=${updates.origineTema || '-'}`;
      details.push(detail);
      console.log(`✅ ${detail}`);
      updated++;
    } else {
      skipped++;
    }
  }
  
  console.log(`🔄 Migrazione completa: ${updated} aggiornati, ${skipped} già ok`);
  return { updated, skipped, details };
}

// Esponi funzioni per migrazione manuale da console
if (typeof window !== 'undefined') {
  (window as any).migrateMovementsOrigin = migrateMovementsOrigin;
  (window as any).migrateMovementsComplete = migrateMovementsComplete;
}
