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
import type { CashMovement, InsertCashMovement, FinancialSummary, MonthlyData, ForecastedIncome } from "@shared/cash-types";
import { getAllOrders } from "./orders";
import type { Order, Transaction } from "@shared/booking-types";

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

    // Calcola saldo previsto (se ordine non completato)
    const saldo = order.saldo || 0;
    if (saldo > 0) {
      previstiIncasso += saldo;
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
 * Calcola previsioni incasso da ordini in sospeso
 * Raggruppa per data servizio gli ordini con saldo residuo > 0
 */
export async function getForecastedIncome(): Promise<ForecastedIncome[]> {
  const orders = await getAllOrders();

  // Filtra ordini con importo residuo > 0 e data servizio valida
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

  // Raggruppa per data servizio
  const grouped = new Map<string, ForecastedIncome>();

  ordersWithBalance.forEach((order) => {
    const dataServizio = order.dataServizio instanceof Timestamp
      ? order.dataServizio.toDate()
      : new Date(order.dataServizio!);

    const dateKey = dataServizio.toISOString().split("T")[0];

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, {
        data: dataServizio,
        importo: 0,
        ordini: [],
      });
    }

    const forecast = grouped.get(dateKey)!;
    forecast.importo += order.importoResiduo;
    forecast.ordini.push({
      id: order.id,
      nomeSposi: order.nomeCliente || order.nomeSposi || "Cliente sconosciuto",
      importoResiduo: order.importoResiduo,
    });
  });

  // Converti in array e ordina per data
  return Array.from(grouped.values()).sort(
    (a, b) => a.data.getTime() - b.data.getTime()
  );
}
