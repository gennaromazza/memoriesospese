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
  ImportCSVRow,
  ImportValidationResult,
  ImportResult,
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
 * Aggrega clienti da tutte le fonti di interazione
 */
async function aggregateClientsFromAllSources(): Promise<Map<string, Partial<InsertCliente> & { sourceRefs: { bookingIds: string[], orderIds: string[], galleryIds: string[], passwordRequestIds: string[], userIds: string[] } }>> {
  const clientsMap = new Map<string, any>();

  // 1. Bookings
  const bookingsSnapshot = await getDocs(collection(db, "bookings"));
  bookingsSnapshot.docs.forEach(doc => {
    const booking = doc.data() as Booking;
    if (booking.cliente?.email) {
      const normalizedEmail = normalizeEmail(booking.cliente.email);
      if (!clientsMap.has(normalizedEmail)) {
        clientsMap.set(normalizedEmail, {
          nome: booking.cliente.nome || 'N/D',
          cognome: booking.cliente.cognome || 'N/D',
          email: normalizedEmail,
          cellulare1: booking.cliente.whatsapp || undefined,
          sourceRefs: { bookingIds: [], orderIds: [], galleryIds: [], passwordRequestIds: [], userIds: [] },
        });
      }
      const client = clientsMap.get(normalizedEmail);
      if (!client.sourceRefs.bookingIds.includes(doc.id)) {
        client.sourceRefs.bookingIds.push(doc.id);
      }
    }
  });

  // 2. Orders
  const ordersSnapshot = await getDocs(collection(db, "orders"));
  ordersSnapshot.docs.forEach(doc => {
    const order = doc.data() as Order;
    if (order.emailCliente) {
      const normalizedEmail = normalizeEmail(order.emailCliente);
      if (!clientsMap.has(normalizedEmail)) {
        const nomeCompleto = order.nomeCliente || 'N/D N/D';
        const [nome, ...cognomeParts] = nomeCompleto.split(' ');
        clientsMap.set(normalizedEmail, {
          nome: nome || 'N/D',
          cognome: cognomeParts.join(' ') || 'N/D',
          email: normalizedEmail,
          cellulare1: order.whatsappCliente || undefined,
          sourceRefs: { bookingIds: [], orderIds: [], galleryIds: [], passwordRequestIds: [], userIds: [] },
        });
      }
      const client = clientsMap.get(normalizedEmail);
      if (!client.sourceRefs.orderIds.includes(doc.id)) {
        client.sourceRefs.orderIds.push(doc.id);
      }
    }
  });

  // 3. Password Requests
  const passwordRequestsSnapshot = await getDocs(collection(db, "passwordRequests"));
  passwordRequestsSnapshot.docs.forEach(doc => {
    const request = doc.data();
    if (request.email) {
      const normalizedEmail = normalizeEmail(request.email);
      if (!clientsMap.has(normalizedEmail)) {
        clientsMap.set(normalizedEmail, {
          nome: request.firstName || 'N/D',
          cognome: request.lastName || 'N/D',
          email: normalizedEmail,
          sourceRefs: { bookingIds: [], orderIds: [], galleryIds: [], passwordRequestIds: [], userIds: [] },
        });
      }
      const client = clientsMap.get(normalizedEmail);
      if (!client.sourceRefs.passwordRequestIds) {
        client.sourceRefs.passwordRequestIds = [];
      }
      if (!client.sourceRefs.passwordRequestIds.includes(doc.id)) {
        client.sourceRefs.passwordRequestIds.push(doc.id);
      }
    }
  });

  // 4. Users (registrati Firebase Auth)
  const usersSnapshot = await getDocs(collection(db, "users"));
  usersSnapshot.docs.forEach(doc => {
    const user = doc.data();
    if (user.email) {
      const normalizedEmail = normalizeEmail(user.email);
      if (!clientsMap.has(normalizedEmail)) {
        const displayName = user.displayName || '';
        const [nome, ...cognomeParts] = displayName.split(' ');
        clientsMap.set(normalizedEmail, {
          nome: nome || 'N/D',
          cognome: cognomeParts.join(' ') || 'N/D',
          email: normalizedEmail,
          sourceRefs: { bookingIds: [], orderIds: [], galleryIds: [], passwordRequestIds: [], userIds: [] },
        });
      }
      const client = clientsMap.get(normalizedEmail);
      if (!client.sourceRefs.userIds) {
        client.sourceRefs.userIds = [];
      }
      if (!client.sourceRefs.userIds.includes(doc.id)) {
        client.sourceRefs.userIds.push(doc.id);
      }
    }
  });

  return clientsMap;
}

/**
 * Crea automaticamente clienti mancanti
 */
async function autoCreateMissingClients(aggregatedClients: Map<string, any>): Promise<void> {
  const batch = writeBatch(db);
  let createCount = 0;

  for (const [email, clientData] of aggregatedClients.entries()) {
    // Verifica se cliente esiste già
    const existing = await getClienteByEmail(email);
    
    if (!existing) {
      // Crea nuovo cliente
      const now = serverTimestamp();
      const newClienteData: Omit<Cliente, 'id'> = {
        nome: clientData.nome || 'N/D',
        cognome: clientData.cognome || 'N/D',
        email: email,
        cellulare1: clientData.cellulare1 || undefined,
        cellulare2: clientData.cellulare2 || undefined,
        whatsapp: clientData.whatsapp || undefined,
        via: clientData.via || undefined,
        citta: clientData.citta || undefined,
        cap: clientData.cap || undefined,
        provincia: clientData.provincia || undefined,
        note: clientData.note || undefined,
        tags: clientData.tags || [],
        sourceRefs: {
          bookingIds: clientData.sourceRefs.bookingIds || [],
          orderIds: clientData.sourceRefs.orderIds || [],
          galleryIds: clientData.sourceRefs.galleryIds || [],
          passwordRequestIds: clientData.sourceRefs.passwordRequestIds || [],
          userIds: clientData.sourceRefs.userIds || [],
        },
        lifecycle: {
          firstContactAt: now as Timestamp,
          lastInteractionAt: now as Timestamp,
          status: 'lead',
        },
        financials: {
          totalRevenue: 0,
          outstandingBalance: 0,
          totalOrders: 0,
        },
        createdAt: now as Timestamp,
        updatedAt: now as Timestamp,
      };
      
      const newDocRef = doc(collection(db, COLLECTION));
      batch.set(newDocRef, sanitizeData(newClienteData));
      createCount++;
    }
  }

  if (createCount > 0) {
    await batch.commit();
    console.log(`✅ Auto-creati ${createCount} nuovi clienti da fonti aggregate`);
  }
}

/**
 * Ottieni tutti i clienti con aggregazione automatica
 */
export async function getAllClienti(): Promise<Cliente[]> {
  // 1. Aggrega clienti da tutte le fonti
  const aggregatedClients = await aggregateClientsFromAllSources();
  
  // 2. Crea automaticamente clienti mancanti
  await autoCreateMissingClients(aggregatedClients);
  
  // 3. Carica tutti i clienti dalla collection
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

/**
 * DUPLICATE DETECTION AND MERGE
 */

export interface DuplicateGroup {
  email: string;
  clienti: Cliente[];
  count: number;
}

/**
 * Rileva duplicati per email (case-insensitive)
 */
export async function detectDuplicates(): Promise<DuplicateGroup[]> {
  const clienti = await getAllClienti();
  const emailMap = new Map<string, Cliente[]>();
  
  // Raggruppa per email normalizzata
  clienti.forEach(cliente => {
    const normalizedEmail = normalizeEmail(cliente.email);
    if (!emailMap.has(normalizedEmail)) {
      emailMap.set(normalizedEmail, []);
    }
    emailMap.get(normalizedEmail)!.push(cliente);
  });
  
  // Filtra solo i gruppi con duplicati (>1 record)
  const duplicates: DuplicateGroup[] = [];
  emailMap.forEach((clienti, email) => {
    if (clienti.length > 1) {
      duplicates.push({
        email,
        clienti,
        count: clienti.length,
      });
    }
  });
  
  return duplicates;
}

/**
 * Unisci clienti duplicati mantenendo il principale
 */
export async function mergeClientes(
  primaryId: string,
  duplicateIds: string[]
): Promise<void> {
  const batch = writeBatch(db);
  
  // Carica cliente principale
  const primaryCliente = await getClienteById(primaryId);
  if (!primaryCliente) {
    throw new Error('Cliente principale non trovato');
  }
  
  // Carica tutti i duplicati
  const duplicates: Cliente[] = [];
  for (const dupId of duplicateIds) {
    const dup = await getClienteById(dupId);
    if (dup) duplicates.push(dup);
  }
  
  // Consolida sourceRefs
  const consolidatedSourceRefs = {
    bookingIds: [...new Set([
      ...primaryCliente.sourceRefs.bookingIds,
      ...duplicates.flatMap(d => d.sourceRefs.bookingIds || [])
    ])],
    orderIds: [...new Set([
      ...primaryCliente.sourceRefs.orderIds,
      ...duplicates.flatMap(d => d.sourceRefs.orderIds || [])
    ])],
    galleryIds: [...new Set([
      ...primaryCliente.sourceRefs.galleryIds,
      ...duplicates.flatMap(d => d.sourceRefs.galleryIds || [])
    ])],
    passwordRequestIds: [...new Set([
      ...(primaryCliente.sourceRefs.passwordRequestIds || []),
      ...duplicates.flatMap(d => d.sourceRefs.passwordRequestIds || [])
    ])],
    userIds: [...new Set([
      ...(primaryCliente.sourceRefs.userIds || []),
      ...duplicates.flatMap(d => d.sourceRefs.userIds || [])
    ])],
  };
  
  // Consolida financials
  const consolidatedFinancials = {
    totalRevenue: duplicates.reduce(
      (sum, d) => sum + (d.financials.totalRevenue || 0),
      primaryCliente.financials.totalRevenue || 0
    ),
    outstandingBalance: duplicates.reduce(
      (sum, d) => sum + (d.financials.outstandingBalance || 0),
      primaryCliente.financials.outstandingBalance || 0
    ),
    totalOrders: consolidatedSourceRefs.orderIds.length,
  };
  
  // Merge dati anagrafici (prendi primo valore non vuoto)
  const mergedData: Partial<Cliente> = {
    cellulare1: primaryCliente.cellulare1 || duplicates.find(d => d.cellulare1)?.cellulare1,
    cellulare2: primaryCliente.cellulare2 || duplicates.find(d => d.cellulare2)?.cellulare2,
    whatsapp: primaryCliente.whatsapp || duplicates.find(d => d.whatsapp)?.whatsapp,
    via: primaryCliente.via || duplicates.find(d => d.via)?.via,
    citta: primaryCliente.citta || duplicates.find(d => d.citta)?.citta,
    cap: primaryCliente.cap || duplicates.find(d => d.cap)?.cap,
    provincia: primaryCliente.provincia || duplicates.find(d => d.provincia)?.provincia,
    note: [primaryCliente.note, ...duplicates.map(d => d.note)]
      .filter(Boolean)
      .join('\n--- MERGE ---\n') || undefined,
    tags: [...new Set([
      ...(primaryCliente.tags || []),
      ...duplicates.flatMap(d => d.tags || [])
    ])],
  };
  
  // Aggiorna cliente principale
  const primaryRef = doc(db, COLLECTION, primaryId);
  batch.update(primaryRef, {
    ...sanitizeData(mergedData),
    sourceRefs: consolidatedSourceRefs,
    financials: consolidatedFinancials,
    updatedAt: serverTimestamp(),
  });
  
  // Elimina duplicati
  duplicateIds.forEach(dupId => {
    batch.delete(doc(db, COLLECTION, dupId));
  });
  
  await batch.commit();
}

/**
 * IMPORT CSV - Validazione riga
 */
export function validateImportRow(
  row: ImportCSVRow,
  existingEmails: Set<string>
): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validazione campi obbligatori
  if (!row.Nome?.trim()) {
    errors.push('Nome mancante');
  }
  if (!row.Cognome?.trim()) {
    errors.push('Cognome mancante');
  }
  
  // Validazione email
  const isPlaceholderEmail = row.Email?.toLowerCase().includes('nomail@');
  if (!row.Email?.trim()) {
    errors.push('Email mancante');
  } else if (isPlaceholderEmail) {
    warnings.push('Email placeholder (nomail@) - verrà importato senza email');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(row.Email)) {
      errors.push('Email non valida');
    }
  }
  
  // Check duplicati
  const normalizedEmail = normalizeEmail(row.Email || '');
  if (!isPlaceholderEmail && existingEmails.has(normalizedEmail)) {
    warnings.push('Email già esistente - verrà aggiornato');
  }
  
  // Mapping dati
  let mappedData: InsertCliente | undefined;
  if (errors.length === 0) {
    mappedData = {
      nome: row.Nome.trim(),
      cognome: row.Cognome.trim(),
      email: isPlaceholderEmail ? `${row.Nome}.${row.Cognome}@noemail.local`.toLowerCase().replace(/\s+/g, '') : normalizeEmail(row.Email),
      cellulare1: row.Phone?.trim() || undefined,
      citta: row.Città?.trim() || undefined,
      cap: row['C.A.P']?.trim() || undefined,
      provincia: row.Provincia?.trim() || undefined,
      note: row['Note Cliente']?.trim() || undefined,
      tags: isPlaceholderEmail ? ['import_csv', 'no_email'] : ['import_csv'],
      status: 'lead',
    };
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    mappedData,
  };
}

/**
 * IMPORT CSV - Batch import clienti
 */
export async function importClienti(
  validatedRows: Array<{
    validation: ImportValidationResult;
    existingClienteId?: string;
  }>
): Promise<ImportResult> {
  const BATCH_SIZE = 200; // Firestore batch limit: 500, usiamo 200 per sicurezza
  const result: ImportResult = {
    success: true,
    imported: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };
  
  try {
    // Processa in chunks
    for (let i = 0; i < validatedRows.length; i += BATCH_SIZE) {
      const chunk = validatedRows.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      
      for (let j = 0; j < chunk.length; j++) {
        const { validation, existingClienteId } = chunk[j];
        const rowIndex = i + j + 1;
        
        if (!validation.valid || !validation.mappedData) {
          result.failed++;
          result.errors.push({
            row: rowIndex,
            error: validation.errors.join(', '),
          });
          continue;
        }
        
        try {
          const now = serverTimestamp();
          
          if (existingClienteId) {
            // Update esistente
            const docRef = doc(db, COLLECTION, existingClienteId);
            const updateData: any = {
              ...sanitizeData(validation.mappedData),
              updatedAt: now,
            };
            
            // Merge tags
            const existingDoc = await getDoc(docRef);
            if (existingDoc.exists()) {
              const existingTags = existingDoc.data().tags || [];
              updateData.tags = [...new Set([...existingTags, ...(validation.mappedData.tags || [])])];
            }
            
            batch.update(docRef, updateData);
            result.updated++;
          } else {
            // Nuovo cliente
            const newDocRef = doc(collection(db, COLLECTION));
            const clienteData: Omit<Cliente, 'id'> = {
              ...validation.mappedData,
              sourceRefs: {
                bookingIds: [],
                orderIds: [],
                galleryIds: [],
                passwordRequestIds: [],
                userIds: [],
              },
              lifecycle: {
                firstContactAt: now as Timestamp,
                lastInteractionAt: now as Timestamp,
                status: validation.mappedData.status || 'lead',
              },
              financials: {
                totalRevenue: 0,
                outstandingBalance: 0,
                totalOrders: 0,
              },
              createdAt: now as Timestamp,
              updatedAt: now as Timestamp,
            };
            
            batch.set(newDocRef, sanitizeData(clienteData));
            result.imported++;
          }
        } catch (error) {
          result.failed++;
          result.errors.push({
            row: rowIndex,
            error: error instanceof Error ? error.message : 'Errore sconosciuto',
          });
        }
      }
      
      // Commit batch
      await batch.commit();
    }
    
    result.success = result.failed === 0;
    return result;
  } catch (error) {
    throw new Error(
      `Errore durante l'import: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`
    );
  }
}

/**
 * AUTO-MERGE: Unisce automaticamente tutti i clienti con stessa email
 */
export interface AutoMergeResult {
  success: boolean;
  duplicatesFound: number;
  groupsMerged: number;
  clientiRemoved: number;
  errors: string[];
}

export async function autoMergeDuplicatesByEmail(): Promise<AutoMergeResult> {
  const result: AutoMergeResult = {
    success: true,
    duplicatesFound: 0,
    groupsMerged: 0,
    clientiRemoved: 0,
    errors: [],
  };

  try {
    // 1. Rileva tutti i duplicati
    const duplicateGroups = await detectDuplicates();
    result.duplicatesFound = duplicateGroups.length;

    if (duplicateGroups.length === 0) {
      return result;
    }

    // 2. Per ogni gruppo, esegui merge automatico
    for (const group of duplicateGroups) {
      try {
        // Seleziona primary: il cliente con più dati o il più recente
        const primary = group.clienti.reduce((best, current) => {
          // Priorità 1: più sourceRefs
          const bestRefs = (best.sourceRefs.bookingIds?.length || 0) + 
                          (best.sourceRefs.orderIds?.length || 0) + 
                          (best.sourceRefs.galleryIds?.length || 0);
          const currentRefs = (current.sourceRefs.bookingIds?.length || 0) + 
                             (current.sourceRefs.orderIds?.length || 0) + 
                             (current.sourceRefs.galleryIds?.length || 0);
          
          if (currentRefs > bestRefs) return current;
          if (currentRefs < bestRefs) return best;
          
          // Priorità 2: più dati anagrafici completi
          const bestData = [best.cellulare1, best.cellulare2, best.via, best.citta]
            .filter(Boolean).length;
          const currentData = [current.cellulare1, current.cellulare2, current.via, current.citta]
            .filter(Boolean).length;
          
          if (currentData > bestData) return current;
          if (currentData < bestData) return best;
          
          // Priorità 3: ultimo aggiornamento
          const bestTime = best.updatedAt?.toMillis?.() || 0;
          const currentTime = current.updatedAt?.toMillis?.() || 0;
          
          return currentTime > bestTime ? current : best;
        });

        // Merge tutti gli altri verso il primary
        const duplicateIds = group.clienti
          .filter(c => c.id !== primary.id)
          .map(c => c.id);

        if (duplicateIds.length > 0) {
          await mergeClientes(primary.id, duplicateIds);
          result.groupsMerged++;
          result.clientiRemoved += duplicateIds.length;
        }
      } catch (error) {
        result.success = false;
        result.errors.push(
          `Errore merge gruppo ${group.email}: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`
        );
      }
    }

    return result;
  } catch (error) {
    result.success = false;
    result.errors.push(
      `Errore durante auto-merge: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`
    );
    return result;
  }
}
