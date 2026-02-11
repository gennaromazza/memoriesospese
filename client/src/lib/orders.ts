/**
 * Orders - Gestione ordini Firestore
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
  arrayRemove,
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { apiRequest } from "@/lib/queryClient";
import type { Order, InsertOrder, Transaction } from "@shared/booking-types";

const COLLECTION = "orders";

/**
 * Helper: Rimuove campi undefined da un oggetto
 * Firestore non accetta valori undefined
 */
function sanitizeData<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined),
  ) as Partial<T>;
}

/**
 * Helper: Converti ordine legacy in nuovo schema (array prodotti + transactions)
 */
function ensureProdottiArray(orderData: any): any {
  let result = { ...orderData };

  // Backward compatibility: converti prodotto singolo in array
  if (!Array.isArray(result.prodotti)) {
    if (result.prodottoId || result.prodottoNome) {
      result.prodotti = [
        {
          prodottoId: result.prodottoId || "legacy",
          prodottoNome: result.prodottoNome || "Prodotto Legacy",
          prodottoPrezzo: result.totale || 0,
          prodottoNumeroFoto: result.prodottoNumeroFoto || 0,
          quantita: 1,
        },
      ];
    } else {
      result.prodotti = [];
    }
  }

  // Backward compatibility: inizializza transactions array se mancante
  if (!Array.isArray(result.transactions)) {
    result.transactions = [];
  }
  
  // ============================================================================
  // IDEMPOTENT Migration: verifica coerenza tra campi legacy e transactions
  // Questo previene bug dove acconto/saldo sono impostati ma transactions è vuoto
  // 
  // APPROCCIO IDEMPOTENTE: Non usiamo flag in-memory (non persistiti).
  // Invece, la migration viene eseguita SOLO se:
  // 1. Ci sono pagamenti legacy (acconto > 0 o dataSaldo)
  // 2. transactions array è VUOTO
  // 
  // Una volta che transactions contiene almeno un elemento, la migration
  // non verrà più eseguita, garantendo idempotenza senza salvare flag.
  // ============================================================================
  const hasPagamentiLegacy = result.acconto > 0 || result.dataSaldo;
  const hasTransactions = result.transactions.length > 0;
  
  // GUARD: Se transactions ha già elementi, NON eseguire migration
  // Questo è naturalmente idempotente perché dopo la prima esecuzione
  // (o dopo qualsiasi pagamento registrato) transactions.length > 0
  if (hasPagamentiLegacy && !hasTransactions) {
    console.warn(`🔄 Migration ordine ${result.id || 'unknown'}: trovato acconto/saldo senza transactions, ricostruisco...`);
    
    // Ricostruisci transactions da legacy fields
    if (result.acconto > 0) {
      result.transactions.push({
        tipo: "acconto",
        importo: result.acconto,
        metodo: result.metodoPagamentoAcconto || "contante",
        data: result.dataAcconto || result.createdAt || Timestamp.now(),
        note: "Migrato automaticamente da ordine legacy",
        emailInviata: false,
      });
    }

    if (result.dataSaldo) {
      // ✅ CRITICO: result.saldo legacy è il RESIDUO, non l'importo pagato!
      // Calcola importo saldo pagato = totale - acconti già registrati
      const accontoGiaRegistrato = result.transactions
        .filter((t: any) => t.tipo === 'acconto')
        .reduce((sum: number, t: any) => sum + t.importo, 0);
      
      const importoSaldo = (result.totale || 0) - accontoGiaRegistrato;
      
      result.transactions.push({
        tipo: "saldo",
        importo: importoSaldo,
        metodo: result.metodoPagamentoSaldo || "contante",
        data: result.dataSaldo,
        note: "Migrato automaticamente da ordine legacy",
        emailInviata: result.emailSaldoInviata || false,
      });
    }
    
    console.log(`✅ Migration completata: ${result.transactions.length} transactions create`);
  }
  
  // ============================================================================
  // RICALCOLO: Sempre ricalcola acconto/saldo da transactions (fonte di verità)
  // IMPORTANTE: NON convertire più acconto → saldo automaticamente
  // Lo stato pagamento è determinato da getOrderPaymentStatus(), non dal tipo transaction
  // ============================================================================
  if (result.transactions.length > 0) {
    const accontoCalcolato = result.transactions
      .filter((t: any) => t.tipo === 'acconto')
      .reduce((sum: number, t: any) => sum + t.importo, 0);
    
    const saldoPagato = result.transactions
      .filter((t: any) => t.tipo === 'saldo')
      .reduce((sum: number, t: any) => sum + t.importo, 0);
    
    const totalePagato = accontoCalcolato + saldoPagato;
    
    // Ricalcola campi legacy per backward compatibility
    result.acconto = accontoCalcolato;
    result.saldo = Math.max(0, (result.totale || 0) - totalePagato);
  }

  return result;
}

/**
 * Ottiene tutti gli ordini (admin only)
 */
export async function getAllOrders(): Promise<Order[]> {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...ensureProdottiArray(doc.data()),
  })) as Order[];
}

/**
 * Ottiene ordine singolo per ID (admin only)
 */
export async function getOrderById(id: string): Promise<Order | null> {
  const docRef = doc(db, COLLECTION, id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return {
    id: docSnap.id,
    ...ensureProdottiArray(docSnap.data()),
  } as Order;
}

/**
 * Ottiene ordini per galleria (admin only)
 */
export async function getOrdersByGallery(galleryId: string): Promise<Order[]> {
  const q = query(
    collection(db, COLLECTION),
    where("galleryId", "==", galleryId),
    orderBy("createdAt", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...ensureProdottiArray(doc.data()),
  })) as Order[];
}

/**
 * Ottiene ordini per booking (admin only)
 */
export async function getOrdersByBooking(bookingId: string): Promise<Order[]> {
  const q = query(
    collection(db, COLLECTION),
    where("bookingId", "==", bookingId),
    orderBy("createdAt", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...ensureProdottiArray(doc.data()),
  })) as Order[];
}

/**
 * Ottiene ordini per job (admin only)
 */
export async function getOrdersByJobId(jobId: string): Promise<Order[]> {
  const q = query(
    collection(db, COLLECTION),
    where("jobId", "==", jobId),
    orderBy("createdAt", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...ensureProdottiArray(doc.data()),
  })) as Order[];
}

/**
 * Ottiene ordini per stato (admin only)
 */
export async function getOrdersByStatus(
  stato: "bozza" | "in_lavorazione" | "completato" | "annullato",
): Promise<Order[]> {
  const q = query(
    collection(db, COLLECTION),
    where("stato", "==", stato),
    orderBy("createdAt", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...ensureProdottiArray(doc.data()),
  })) as Order[];
}

/**
 * Helper: Calcola totale ordine dalla somma prodotti
 */
function calculateTotale(prodotti: InsertOrder["prodotti"]): number {
  return prodotti.reduce((sum, item) => {
    return sum + item.prodottoPrezzo * item.quantita;
  }, 0);
}

/**
 * Crea nuovo ordine (admin only)
 */
export async function createOrder(data: InsertOrder): Promise<string> {
  console.log("🔍 createOrder - dati ricevuti:", data);

  // 1. Validazione: Previeni ordini duplicati per stesso booking
  if (data.bookingId) {
    const existingOrdersQuery = query(
      collection(db, COLLECTION),
      where("bookingId", "==", data.bookingId)
    );
    const existingOrders = await getDocs(existingOrdersQuery);
    
    if (!existingOrders.empty) {
      throw new Error(
        `Esiste già un ordine per questa prenotazione (${existingOrders.docs.length} ordine/i trovato/i). ` +
        `Non è possibile creare ordini duplicati.`
      );
    }
    console.log("✅ Nessun ordine duplicato trovato per bookingId:", data.bookingId);
  }

  // 2. Recupera data servizio dal booking (se presente)
  let dataServizio: Timestamp | null = null;
  if (data.bookingId) {
    const bookingDoc = await getDoc(doc(db, "bookings", data.bookingId));
    if (bookingDoc.exists()) {
      const bookingData = bookingDoc.data();
      // Copia dataShootingInizio come dataServizio
      if (bookingData.dataShootingInizio) {
        dataServizio = bookingData.dataShootingInizio instanceof Timestamp 
          ? bookingData.dataShootingInizio 
          : Timestamp.fromDate(new Date(bookingData.dataShootingInizio));
        console.log("📅 Data servizio copiata da booking:", dataServizio.toDate());
      }
    }
  }

  // 3. Auto-Link Galleria: Se esiste già una galleria per il booking, collegala
  let autoLinkedGalleryId = data.galleryId || null;
  if (data.bookingId && !autoLinkedGalleryId) {
    const galleriesQuery = query(
      collection(db, "galleries"),
      where("bookingId", "==", data.bookingId)
    );
    const galleriesSnapshot = await getDocs(galleriesQuery);
    
    if (!galleriesSnapshot.empty) {
      autoLinkedGalleryId = galleriesSnapshot.docs[0].id;
      console.log("🔗 Auto-linked galleria esistente:", autoLinkedGalleryId);
    }
  }

  // 4. Normalizza i prodotti per evitare NaN o undefined
  const normalizedProdotti = data.prodotti.map((item) => ({
    prodottoId: item.prodottoId || "",
    prodottoNome: item.prodottoNome || "",
    prodottoPrezzo:
      typeof item.prodottoPrezzo === "number" && !isNaN(item.prodottoPrezzo)
        ? item.prodottoPrezzo
        : 0,
    prodottoNumeroFoto:
      typeof item.prodottoNumeroFoto === "number" &&
      !isNaN(item.prodottoNumeroFoto)
        ? item.prodottoNumeroFoto
        : 0,
    quantita:
      typeof item.quantita === "number" &&
      !isNaN(item.quantita) &&
      item.quantita > 0
        ? item.quantita
        : 1,
    ...(item.isCustom ? { isCustom: true } : {}),
    ...(item.isBundle && item.bundleItems ? { isBundle: true, bundleItems: item.bundleItems } : {}),
  }));

  console.log("📦 Prodotti normalizzati:", normalizedProdotti);

  // Calcola totale dalla somma prodotti e applica sconto
  const subtotaleProdotti = calculateTotale(normalizedProdotti);
  const sconto = typeof data.sconto === "number" && !isNaN(data.sconto) && data.sconto > 0 
    ? Math.min(data.sconto, subtotaleProdotti) 
    : 0;
  const totale = Math.max(0, subtotaleProdotti - sconto);
  console.log("💰 Subtotale prodotti:", subtotaleProdotti, "Sconto:", sconto, "Totale:", totale);

  // Valida e normalizza acconto (evita NaN)
  const acconto =
    typeof data.acconto === "number" &&
    !isNaN(data.acconto) &&
    data.acconto >= 0
      ? data.acconto
      : 0;
  console.log("💵 Acconto validato:", acconto);

  // Calcola saldo automaticamente
  const saldo = totale - acconto;
  console.log("🧾 Saldo calcolato:", saldo);

  // Inizializza transactions array
  // Se acconto > 0, crea transaction iniziale per tracciamento corretto
  // NOTA: Preserva sempre tipo "acconto" - il sistema determina lo stato pagamento
  // dal saldo residuo calcolato (totale - somma transactions), non dal tipo transaction
  const transactions: Transaction[] = [];
  
  if (acconto > 0) {
    // Sempre tipo "acconto" alla creazione - la classificazione come "saldato"
    // viene determinata dai calcoli in getOrderPaymentStatus() non dal tipo
    transactions.push({
      tipo: "acconto",
      importo: acconto,
      metodo: data.metodoPagamentoAcconto || "contante",
      data: Timestamp.now(),
      note: acconto >= totale 
        ? "Pagamento completo registrato alla creazione ordine" 
        : "Acconto iniziale registrato alla creazione ordine",
      emailInviata: false,
    });
    console.log(`💳 Transaction acconto iniziale creata (importo: €${acconto}):`, transactions[0]);
  }

  // Normalizza campi opzionali per evitare undefined in Firestore
  const normalizedData = {
    bookingId: data.bookingId || null,
    galleryId: autoLinkedGalleryId, // Usa galleryId auto-linked se trovato
    dataServizio: dataServizio, // Data servizio copiata da booking (null se non presente)
    nomeCliente: data.nomeCliente || "",
    emailCliente: data.emailCliente || "",
    whatsappCliente: data.whatsappCliente || null,
    prodotti: normalizedProdotti,
    note: data.note || null,
    metodoPagamentoAcconto: data.metodoPagamentoAcconto || null,
  };

  const finalData = {
    ...normalizedData,
    sconto: sconto > 0 ? sconto : null, // Sconto in euro (null se non applicato)
    acconto, // Usa valore validato
    totale,
    saldo,
    transactions, // Array vuoto per nuovi ordini
    stato: data.stato || "bozza",
    emailSaldoInviata: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  console.log("📝 Dati finali per Firestore:", finalData);

  const docRef = await addDoc(collection(db, COLLECTION), finalData);
  const orderId = docRef.id;

  // Auto-link: Se l'ordine ha un jobId, aggiungi orderId all'array orderIds del job
  if (data.jobId) {
    try {
      const jobRef = doc(db, "jobs", data.jobId);
      const jobSnap = await getDoc(jobRef);
      if (jobSnap.exists()) {
        await updateDoc(jobRef, {
          orderIds: arrayUnion(orderId),
          updatedAt: serverTimestamp(),
        });
        // Aggiorna anche ordine con jobId
        await updateDoc(docRef, { jobId: data.jobId });
        console.log(`🔗 Auto-linked ordine ${orderId} a job ${data.jobId}`);
      }
    } catch (error) {
      console.error("⚠️ Errore auto-link ordine a job:", error);
      // Non bloccare creazione ordine se link fallisce
    }
  }

  console.log("✅ Ordine creato con successo, ID:", orderId);
  return orderId;
}

/**
 * Aggiorna ordine esistente (admin only)
 */
export async function updateOrder(
  orderId: string,
  data: Partial<
    InsertOrder & {
      stato?: "bozza" | "in_lavorazione" | "completato" | "annullato";
      metodoPagamentoSaldo?: "contante" | "carta" | "bonifico" | "paypal";
      dataSaldo?: Date;
      emailSaldoInviata?: boolean;
    }
  >,
): Promise<void> {
  const docRef = doc(db, COLLECTION, orderId);

  // Fetch ordine corrente per calcoli e gestione cambio jobId
  const currentDoc = await getDoc(docRef);
  if (!currentDoc.exists()) {
    throw new Error(`Ordine ${orderId} non trovato`);
  }
  const currentData = currentDoc.data();

  const updateData: any = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  // Ricalcola totale e saldo se prodotti o acconto cambiano
  if (data.prodotti !== undefined || data.acconto !== undefined) {
    // Calcola nuovo totale da prodotti (se cambiano) o usa quello esistente
    const totale =
      data.prodotti !== undefined
        ? calculateTotale(data.prodotti)
        : currentData.totale;

    const acconto = data.acconto ?? currentData.acconto;

    updateData.totale = totale;
    updateData.saldo = totale - acconto;
  }

  // Converti Date in Timestamp se presente
  if (data.dataSaldo) {
    updateData.dataSaldo = Timestamp.fromDate(data.dataSaldo);
  }

  // Gestione cambio jobId: sincronizza orderIds tra vecchio e nuovo job
  const oldJobId = currentData.jobId;
  const newJobId = data.jobId;
  
  if (newJobId !== undefined && newJobId !== oldJobId) {
    // Valida che il nuovo job esista prima di procedere (evita riferimenti orfani)
    if (newJobId) {
      const newJobRef = doc(db, "jobs", newJobId);
      const newJobSnap = await getDoc(newJobRef);
      if (!newJobSnap.exists()) {
        throw new Error(`Job ${newJobId} non esiste. Impossibile spostare ordine.`);
      }
    }
    
    const jobUpdatePromises: Promise<void>[] = [];
    
    // Rimuovi orderId dal vecchio job (se esisteva)
    if (oldJobId) {
      const oldJobRef = doc(db, "jobs", oldJobId);
      jobUpdatePromises.push(
        getDoc(oldJobRef).then(snap => {
          if (snap.exists()) {
            return updateDoc(oldJobRef, {
              orderIds: arrayRemove(orderId),
              updatedAt: serverTimestamp()
            });
          }
        })
      );
      console.log(`🔗 Rimozione orderId ${orderId} da vecchio job ${oldJobId}`);
    }
    
    // Aggiungi orderId al nuovo job
    if (newJobId) {
      const newJobRef = doc(db, "jobs", newJobId);
      jobUpdatePromises.push(
        updateDoc(newJobRef, {
          orderIds: arrayUnion(orderId),
          updatedAt: serverTimestamp()
        })
      );
      console.log(`🔗 Aggiunta orderId ${orderId} a nuovo job ${newJobId}`);
    }
    
    // Esegui update in parallelo
    await Promise.all(jobUpdatePromises);
  }

  // Sanitizza dati (rimuovi undefined) prima di salvare
  await updateDoc(docRef, sanitizeData(updateData));
}

/**
 * Elimina ordine (admin only)
 * Include cascade cleanup per rimuovere riferimenti orfani dal job
 */
export async function deleteOrder(orderId: string): Promise<void> {
  const docRef = doc(db, COLLECTION, orderId);
  
  // 1. Cerca job che contiene questo orderId nell'array orderIds
  const jobsQuery = query(
    collection(db, "jobs"),
    where("orderIds", "array-contains", orderId)
  );
  const jobsSnapshot = await getDocs(jobsQuery);
  
  // 2. Rimuovi orderId dall'array orderIds di ogni job trovato
  for (const jobDoc of jobsSnapshot.docs) {
    await updateDoc(doc(db, "jobs", jobDoc.id), {
      orderIds: arrayRemove(orderId),
    });
    console.log(`✅ Rimosso orderId ${orderId} da job ${jobDoc.id}`);
  }
  
  // 3. Elimina i movimenti cassa associati a questo ordine
  const cashMovementsQuery = query(
    collection(db, "cashMovements"),
    where("orderId", "==", orderId)
  );
  const cashSnapshot = await getDocs(cashMovementsQuery);
  for (const cashDoc of cashSnapshot.docs) {
    await deleteDoc(doc(db, "cashMovements", cashDoc.id));
    console.log(`✅ Eliminato movimento cassa ${cashDoc.id} associato all'ordine ${orderId}`);
  }
  
  // 4. Elimina l'ordine
  await deleteDoc(docRef);
}

/**
 * Registra pagamento acconto (admin only) - DEPRECATED
 * Usa addAccontoPayment() per supporto acconti multipli
 */
export async function recordAccontoPayment(
  orderId: string,
  metodo: "contante" | "carta" | "bonifico" | "paypal",
  data: Date = new Date(),
): Promise<void> {
  const docRef = doc(db, COLLECTION, orderId);
  await updateDoc(
    docRef,
    sanitizeData({
      metodoPagamentoAcconto: metodo,
      dataAcconto: Timestamp.fromDate(data),
      updatedAt: serverTimestamp(),
    }),
  );
}

/**
 * Registra pagamento saldo (admin only)
 * Usa l'endpoint backend che crea atomicamente transaction + movimento cassa
 */
export async function recordSaldoPayment(
  orderId: string,
  metodo: "contante" | "carta" | "bonifico" | "paypal",
  note?: string,
  data: Date = new Date(),
): Promise<{ transaction: Transaction; index: number }> {
  const response = await apiRequest('POST', `/api/orders/${orderId}/register-payment`, {
    tipo: 'saldo',
    metodoPagamento: metodo,
    note,
    data: data.toISOString(),
  });

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'Errore registrazione saldo');
  }

  console.log(`✅ Saldo registrato: €${result.paymentAmount} - CashMovement: ${result.cashMovementId}`);

  try {
    await apiRequest('POST', '/api/orders/payment-received-notification', {
      orderId,
      paymentType: 'saldo',
      paymentAmount: result.paymentAmount,
      paymentMethod: metodo,
      paymentDate: data.toISOString(),
      notes: note
    });
    console.log('✅ Email pagamento saldo inviata con successo');
    
    await markTransactionEmailSent(orderId, result.transactionIndex);
  } catch (emailError) {
    console.error('❌ Errore invio email pagamento saldo:', emailError);
  }

  return {
    transaction: {
      tipo: 'saldo',
      importo: result.paymentAmount,
      metodo,
      data: Timestamp.fromDate(data),
      emailInviata: false,
      ...(note?.trim() && { note: note.trim() }),
    },
    index: result.transactionIndex,
  };
}

/**
 * Marca una transaction come "email inviata" (admin only)
 * Utile per tracking dopo invio email notifica cliente
 */
export async function markTransactionEmailSent(
  orderId: string,
  transactionIndex: number,
): Promise<void> {
  const docRef = doc(db, COLLECTION, orderId);

  // 1. Fetch ordine corrente
  const orderSnap = await getDoc(docRef);
  if (!orderSnap.exists()) {
    throw new Error("Ordine non trovato");
  }

  const orderData = ensureProdottiArray(orderSnap.data());
  const transactions: Transaction[] = orderData.transactions || [];

  // 2. Validation: index valido
  if (transactionIndex < 0 || transactionIndex >= transactions.length) {
    throw new Error(`Transaction index ${transactionIndex} non valido`);
  }

  // 3. Update emailInviata flag
  const updatedTransactions = [...transactions];
  updatedTransactions[transactionIndex] = {
    ...updatedTransactions[transactionIndex],
    emailInviata: true,
  };

  // 4. Update Firestore
  await updateDoc(
    docRef,
    sanitizeData({
      transactions: updatedTransactions,
      updatedAt: serverTimestamp(),
    }),
  );
}

/**
 * Aggiunge acconto con supporto acconti multipli (admin only)
 * Sostituisce recordAccontoPayment() con supporto per:
 * - Acconti multipli con storico
 * - Validation acconto totale <= totale ordine
 * - Ricalcolo automatico acconto/saldo
 * - Tracking email notification per cliente
 *
 * @returns Transaction creata (utile per email notification)
 */
export async function addAccontoPayment(
  orderId: string,
  importo: number,
  metodo: "contante" | "carta" | "bonifico" | "paypal",
  note?: string,
  data: Date = new Date(),
): Promise<{ transaction: Transaction; index: number }> {
  const response = await apiRequest('POST', `/api/orders/${orderId}/register-payment`, {
    tipo: 'acconto',
    importo,
    metodoPagamento: metodo,
    note,
    data: data.toISOString(),
  });

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'Errore registrazione acconto');
  }

  console.log(`✅ Acconto registrato: €${importo} - CashMovement: ${result.cashMovementId}`);

  try {
    await apiRequest('POST', '/api/orders/payment-received-notification', {
      orderId,
      paymentType: 'acconto',
      paymentAmount: importo,
      paymentMethod: metodo,
      paymentDate: data.toISOString(),
      notes: note
    });
    console.log('✅ Email pagamento acconto inviata con successo');
    
    await markTransactionEmailSent(orderId, result.transactionIndex);
  } catch (emailError) {
    console.error('❌ Errore invio email pagamento acconto:', emailError);
  }

  return {
    transaction: {
      tipo: 'acconto',
      importo,
      metodo,
      data: Timestamp.fromDate(data),
      emailInviata: false,
      ...(note?.trim() && { note: note.trim() }),
    },
    index: result.transactionIndex,
  };
}

// ============================================================================
// HELPER UNIFICATI - Stato Pagamento Ordini
// Usare questi helper ovunque per garantire coerenza tra UI e calcoli
// ============================================================================

export interface OrderPaymentStatus {
  stato: 'non_pagato' | 'acconto_pagato' | 'saldato';
  label: string;
  color: 'gray' | 'yellow' | 'green';
  totalePagato: number;
  saldoResiduo: number;
  percentualePagata: number;
}

/**
 * Calcola lo stato pagamento di un ordine basandosi sulle transactions
 * FONTE DI VERITÀ: transactions array + saldo calcolato
 */
export function getOrderPaymentStatus(order: Order): OrderPaymentStatus {
  const totale = order.totale || 0;
  const transactions = order.transactions || [];
  
  // Calcola totale pagato da transactions
  const totalePagato = transactions.reduce((sum, t) => sum + t.importo, 0);
  
  // Saldo residuo (usa il campo calcolato o ricalcola)
  const saldoResiduo = Math.max(0, totale - totalePagato);
  
  // Percentuale pagata
  const percentualePagata = totale > 0 ? Math.round((totalePagato / totale) * 100) : 0;
  
  // Determina stato
  if (saldoResiduo <= 0 || totalePagato >= totale) {
    return {
      stato: 'saldato',
      label: 'Saldato',
      color: 'green',
      totalePagato,
      saldoResiduo: 0,
      percentualePagata: 100,
    };
  } else if (totalePagato > 0) {
    return {
      stato: 'acconto_pagato',
      label: 'Saldo Pendente',
      color: 'yellow',
      totalePagato,
      saldoResiduo,
      percentualePagata,
    };
  } else {
    return {
      stato: 'non_pagato',
      label: 'Acconto Pendente',
      color: 'gray',
      totalePagato: 0,
      saldoResiduo: totale,
      percentualePagata: 0,
    };
  }
}

export interface OrderTotals {
  totale: number;
  totalePagato: number;
  totaleAcconti: number;
  totaleSaldi: number;
  saldoResiduo: number;
}

/**
 * Calcola i totali di un ordine basandosi sulle transactions
 */
export function getOrderTotals(order: Order): OrderTotals {
  const totale = order.totale || 0;
  const transactions = order.transactions || [];
  
  const totaleAcconti = transactions
    .filter(t => t.tipo === 'acconto')
    .reduce((sum, t) => sum + t.importo, 0);
    
  const totaleSaldi = transactions
    .filter(t => t.tipo === 'saldo')
    .reduce((sum, t) => sum + t.importo, 0);
    
  const totalePagato = totaleAcconti + totaleSaldi;
  const saldoResiduo = Math.max(0, totale - totalePagato);
  
  return {
    totale,
    totalePagato,
    totaleAcconti,
    totaleSaldi,
    saldoResiduo,
  };
}
