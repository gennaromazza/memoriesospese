/**
 * API Layer per gestione Clienti
 * Firestore collection: clienti
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
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  Cliente,
  InsertCliente,
  UpdateCliente,
  ClienteWithHistory,
  ClientiFilters,
  ClienteStats,
} from "@shared/clienti-types";
import type { Booking, Order } from "@shared/booking-types";
import type { Gallery } from "./galleries";

const COLLECTION = "clienti";

/**
 * Helper: Rimuove campi undefined per Firestore
 */
function sanitizeData<T extends Record<string, any>>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  ) as T;
}

/**
 * Helper: Normalizza email per matching
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Crea nuovo cliente
 */
export async function createCliente(data: InsertCliente): Promise<string> {
  const now = serverTimestamp();
  
  const clienteData: Omit<Cliente, 'id'> = {
    nome: data.nome,
    cognome: data.cognome,
    email: normalizeEmail(data.email),
    cellulare1: data.cellulare1,
    cellulare2: data.cellulare2,
    whatsapp: data.whatsapp,
    via: data.via,
    citta: data.citta,
    cap: data.cap,
    provincia: data.provincia,
    note: data.note,
    tags: data.tags || [],
    sourceRefs: {
      bookingIds: [],
      orderIds: [],
      galleryIds: [],
    },
    lifecycle: {
      firstContactAt: now as Timestamp,
      lastInteractionAt: now as Timestamp,
      status: data.status || 'lead',
    },
    financials: {
      totalRevenue: 0,
      outstandingBalance: 0,
      totalOrders: 0,
    },
    createdAt: now as Timestamp,
    updatedAt: now as Timestamp,
  };

  const docRef = await addDoc(collection(db, COLLECTION), sanitizeData(clienteData));
  return docRef.id;
}

/**
 * Aggiorna cliente esistente
 */
export async function updateCliente(
  id: string,
  data: UpdateCliente
): Promise<void> {
  const updateData = {
    ...sanitizeData(data),
    email: data.email ? normalizeEmail(data.email) : undefined,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, COLLECTION, id), sanitizeData(updateData));
}

/**
 * Ottieni cliente per ID
 */
export async function getClienteById(id: string): Promise<Cliente | null> {
  const docSnap = await getDoc(doc(db, COLLECTION, id));
  if (!docSnap.exists()) return null;
  
  return { id: docSnap.id, ...docSnap.data() } as Cliente;
}

/**
 * Ottieni cliente per email (lookup)
 */
export async function getClienteByEmail(email: string): Promise<Cliente | null> {
  const normalizedEmail = normalizeEmail(email);
  const q = query(
    collection(db, COLLECTION),
    where("email", "==", normalizedEmail)
  );
  
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Cliente;
}

/**
 * Ottieni tutti i clienti
 */
export async function getAllClienti(): Promise<Cliente[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy("lifecycle.lastInteractionAt", "desc")
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Cliente[];
}

/**
 * Filtra clienti
 */
export async function filterClienti(filters: ClientiFilters): Promise<Cliente[]> {
  let q = query(collection(db, COLLECTION));

  // Filtro per status
  if (filters.status && filters.status !== 'tutti') {
    q = query(q, where("lifecycle.status", "==", filters.status));
  }

  // Filtro per città
  if (filters.citta) {
    q = query(q, where("citta", "==", filters.citta));
  }

  // Filtro per saldo pendente
  if (filters.hasOutstandingBalance) {
    q = query(q, where("financials.outstandingBalance", ">", 0));
  }

  // Ordina per ultima interazione
  q = query(q, orderBy("lifecycle.lastInteractionAt", "desc"));

  const snapshot = await getDocs(q);
  let clienti = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Cliente[];

  // Filtri client-side (query complesse)
  if (filters.searchQuery) {
    const searchLower = filters.searchQuery.toLowerCase();
    clienti = clienti.filter(c => 
      c.nome.toLowerCase().includes(searchLower) ||
      c.cognome.toLowerCase().includes(searchLower) ||
      c.email.toLowerCase().includes(searchLower) ||
      c.cellulare1?.includes(searchLower) ||
      c.cellulare2?.includes(searchLower)
    );
  }

  if (filters.tags && filters.tags.length > 0) {
    clienti = clienti.filter(c => 
      c.tags?.some(tag => filters.tags!.includes(tag))
    );
  }

  return clienti;
}

/**
 * Elimina cliente
 */
export async function deleteCliente(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

/**
 * Collega booking a cliente
 */
export async function linkBookingToCliente(
  clienteId: string,
  bookingId: string
): Promise<void> {
  const clienteRef = doc(db, COLLECTION, clienteId);
  const clienteDoc = await getDoc(clienteRef);
  
  if (!clienteDoc.exists()) {
    throw new Error(`Cliente ${clienteId} non trovato`);
  }
  
  const cliente = clienteDoc.data() as Cliente;
  const bookingIds = cliente.sourceRefs.bookingIds || [];
  
  if (!bookingIds.includes(bookingId)) {
    bookingIds.push(bookingId);
    await updateDoc(clienteRef, {
      "sourceRefs.bookingIds": bookingIds,
      "lifecycle.lastInteractionAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Collega order a cliente e aggiorna financials
 */
export async function linkOrderToCliente(
  clienteId: string,
  order: Order
): Promise<void> {
  const clienteRef = doc(db, COLLECTION, clienteId);
  const clienteDoc = await getDoc(clienteRef);
  
  if (!clienteDoc.exists()) {
    throw new Error(`Cliente ${clienteId} non trovato`);
  }
  
  const cliente = clienteDoc.data() as Cliente;
  const orderIds = cliente.sourceRefs.orderIds || [];
  
  if (!orderIds.includes(order.id)) {
    orderIds.push(order.id);
  }
  
  // Ricalcola financials
  const totalRevenue = (cliente.financials.totalRevenue || 0) + order.acconto;
  const outstandingBalance = (cliente.financials.outstandingBalance || 0) + order.saldo;
  const totalOrders = (cliente.financials.totalOrders || 0) + 1;
  
  await updateDoc(clienteRef, {
    "sourceRefs.orderIds": orderIds,
    "financials.totalRevenue": totalRevenue,
    "financials.outstandingBalance": outstandingBalance,
    "financials.totalOrders": totalOrders,
    "lifecycle.lastInteractionAt": serverTimestamp(),
    "lifecycle.status": "cliente_attivo", // Upgrade automatico a cliente attivo
    updatedAt: serverTimestamp(),
  });
}

/**
 * Collega gallery a cliente
 */
export async function linkGalleryToCliente(
  clienteId: string,
  galleryId: string
): Promise<void> {
  const clienteRef = doc(db, COLLECTION, clienteId);
  const clienteDoc = await getDoc(clienteRef);
  
  if (!clienteDoc.exists()) {
    throw new Error(`Cliente ${clienteId} non trovato`);
  }
  
  const cliente = clienteDoc.data() as Cliente;
  const galleryIds = cliente.sourceRefs.galleryIds || [];
  
  if (!galleryIds.includes(galleryId)) {
    galleryIds.push(galleryId);
    await updateDoc(clienteRef, {
      "sourceRefs.galleryIds": galleryIds,
      "lifecycle.lastInteractionAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Ottieni cliente con storico completo (bookings, orders, galleries)
 */
export async function getClienteWithHistory(
  id: string
): Promise<ClienteWithHistory | null> {
  const cliente = await getClienteById(id);
  if (!cliente) return null;

  // TODO: Implementare caricamento storico da altre collection
  // Per ora ritorno solo il cliente base
  return cliente as ClienteWithHistory;
}

/**
 * Calcola statistiche aggregate clienti
 */
export async function getClienteStats(): Promise<ClienteStats> {
  const clienti = await getAllClienti();
  
  const stats: ClienteStats = {
    totalClienti: clienti.length,
    clientiAttivi: clienti.filter(c => c.lifecycle.status === 'cliente_attivo').length,
    lead: clienti.filter(c => c.lifecycle.status === 'lead').length,
    archiviati: clienti.filter(c => c.lifecycle.status === 'archiviato').length,
    totalRevenue: clienti.reduce((sum, c) => sum + (c.financials.totalRevenue || 0), 0),
    outstandingTotal: clienti.reduce((sum, c) => sum + (c.financials.outstandingBalance || 0), 0),
    avgRevenuePerCliente: 0,
  };
  
  stats.avgRevenuePerCliente = stats.totalClienti > 0 
    ? stats.totalRevenue / stats.totalClienti 
    : 0;
  
  return stats;
}

/**
 * Aggiorna financials di un cliente ricalcolando da orders
 */
export async function recalculateClienteFinancials(clienteId: string): Promise<void> {
  const cliente = await getClienteById(clienteId);
  if (!cliente) throw new Error(`Cliente ${clienteId} non trovato`);
  
  // Carica tutti gli ordini del cliente
  const orderIds = cliente.sourceRefs.orderIds || [];
  let totalRevenue = 0;
  let outstandingBalance = 0;
  let lastPaymentAt: Timestamp | undefined;
  
  for (const orderId of orderIds) {
    const orderDoc = await getDoc(doc(db, "orders", orderId));
    if (orderDoc.exists()) {
      const order = orderDoc.data() as Order;
      totalRevenue += order.acconto;
      outstandingBalance += order.saldo;
      
      // Trova ultimo pagamento da transactions
      if (order.transactions && order.transactions.length > 0) {
        const sortedTransactions = [...order.transactions].sort(
          (a, b) => b.data.toMillis() - a.data.toMillis()
        );
        const latestPayment = sortedTransactions[0].data;
        if (!lastPaymentAt || latestPayment.toMillis() > lastPaymentAt.toMillis()) {
          lastPaymentAt = latestPayment;
        }
      }
    }
  }
  
  await updateDoc(doc(db, COLLECTION, clienteId), {
    "financials.totalRevenue": totalRevenue,
    "financials.outstandingBalance": outstandingBalance,
    "financials.totalOrders": orderIds.length,
    "financials.lastPaymentAt": lastPaymentAt || null,
    updatedAt: serverTimestamp(),
  });
}
