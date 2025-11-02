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
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Order, InsertOrder, Transaction } from '@shared/booking-types';

const COLLECTION = 'orders';

/**
 * Helper: Converti ordine legacy in nuovo schema (array prodotti + transactions)
 */
function ensureProdottiArray(orderData: any): any {
  let result = { ...orderData };
  
  // Backward compatibility: converti prodotto singolo in array
  if (!Array.isArray(result.prodotti)) {
    if (result.prodottoId || result.prodottoNome) {
      result.prodotti = [{
        prodottoId: result.prodottoId || 'legacy',
        prodottoNome: result.prodottoNome || 'Prodotto Legacy',
        prodottoPrezzo: result.totale || 0,
        prodottoNumeroFoto: result.prodottoNumeroFoto || 0,
        quantita: 1,
      }];
    } else {
      result.prodotti = [];
    }
  }
  
  // Backward compatibility: inizializza transactions array se mancante
  if (!Array.isArray(result.transactions)) {
    result.transactions = [];
    
    // Ricostruisci transactions da legacy fields se esistono
    if (result.acconto > 0 && result.dataAcconto) {
      result.transactions.push({
        tipo: 'acconto',
        importo: result.acconto,
        metodo: result.metodoPagamentoAcconto || 'contante',
        data: result.dataAcconto,
        note: 'Migrato da ordine legacy',
        emailInviata: false, // Unknown per ordini legacy
      });
    }
    
    if (result.dataSaldo) {
      result.transactions.push({
        tipo: 'saldo',
        importo: result.saldo || 0,
        metodo: result.metodoPagamentoSaldo || 'contante',
        data: result.dataSaldo,
        note: 'Migrato da ordine legacy',
        emailInviata: result.emailSaldoInviata || false,
      });
    }
  }
  
  return result;
}

/**
 * Ottiene tutti gli ordini (admin only)
 */
export async function getAllOrders(): Promise<Order[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
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
    where('galleryId', '==', galleryId),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
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
    where('bookingId', '==', bookingId),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...ensureProdottiArray(doc.data()),
  })) as Order[];
}

/**
 * Ottiene ordini per stato (admin only)
 */
export async function getOrdersByStatus(
  stato: 'bozza' | 'in_lavorazione' | 'completato' | 'annullato'
): Promise<Order[]> {
  const q = query(
    collection(db, COLLECTION),
    where('stato', '==', stato),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...ensureProdottiArray(doc.data()),
  })) as Order[];
}

/**
 * Helper: Calcola totale ordine dalla somma prodotti
 */
function calculateTotale(prodotti: InsertOrder['prodotti']): number {
  return prodotti.reduce((sum, item) => {
    return sum + (item.prodottoPrezzo * item.quantita);
  }, 0);
}

/**
 * Crea nuovo ordine (admin only)
 */
export async function createOrder(data: InsertOrder): Promise<string> {
  console.log('🔍 createOrder - dati ricevuti:', data);
  
  // Normalizza i prodotti per evitare NaN o undefined
  const normalizedProdotti = data.prodotti.map(item => ({
    prodottoId: item.prodottoId || '',
    prodottoNome: item.prodottoNome || '',
    prodottoPrezzo: typeof item.prodottoPrezzo === 'number' && !isNaN(item.prodottoPrezzo) ? item.prodottoPrezzo : 0,
    prodottoNumeroFoto: typeof item.prodottoNumeroFoto === 'number' && !isNaN(item.prodottoNumeroFoto) ? item.prodottoNumeroFoto : 0,
    quantita: typeof item.quantita === 'number' && !isNaN(item.quantita) && item.quantita > 0 ? item.quantita : 1,
  }));
  
  console.log('📦 Prodotti normalizzati:', normalizedProdotti);
  
  // Calcola totale dalla somma prodotti
  const totale = calculateTotale(normalizedProdotti);
  console.log('💰 Totale calcolato:', totale);
  
  // Valida e normalizza acconto (evita NaN)
  const acconto = typeof data.acconto === 'number' && !isNaN(data.acconto) && data.acconto >= 0 
    ? data.acconto 
    : 0;
  console.log('💵 Acconto validato:', acconto);
  
  // Calcola saldo automaticamente
  const saldo = totale - acconto;
  console.log('🧾 Saldo calcolato:', saldo);
  
  // Inizializza transactions array (vuoto per nuovi ordini)
  const transactions: Transaction[] = [];
  
  // Normalizza campi opzionali per evitare undefined in Firestore
  const normalizedData = {
    bookingId: data.bookingId || null,
    galleryId: data.galleryId || null,
    nomeCliente: data.nomeCliente || '',
    emailCliente: data.emailCliente || '',
    whatsappCliente: data.whatsappCliente || null,
    prodotti: normalizedProdotti,
    note: data.note || null,
    metodoPagamentoAcconto: data.metodoPagamentoAcconto || null,
  };
  
  const finalData = {
    ...normalizedData,
    acconto, // Usa valore validato
    totale,
    saldo,
    transactions, // Array vuoto per nuovi ordini
    stato: data.stato || 'bozza',
    emailSaldoInviata: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  console.log('📝 Dati finali per Firestore:', finalData);
  
  const docRef = await addDoc(collection(db, COLLECTION), finalData);
  
  console.log('✅ Ordine creato con successo, ID:', docRef.id);
  return docRef.id;
}

/**
 * Aggiorna ordine esistente (admin only)
 */
export async function updateOrder(
  orderId: string,
  data: Partial<InsertOrder & { 
    stato?: 'bozza' | 'in_lavorazione' | 'completato' | 'annullato';
    metodoPagamentoSaldo?: 'contante' | 'carta' | 'bonifico' | 'paypal';
    dataSaldo?: Date;
    emailSaldoInviata?: boolean;
  }>
): Promise<void> {
  const docRef = doc(db, COLLECTION, orderId);
  
  // Filtra i campi undefined per evitare errori Firestore
  const filteredData: any = {};
  Object.keys(data).forEach(key => {
    const value = (data as any)[key];
    if (value !== undefined) {
      filteredData[key] = value;
    }
  });
  
  const updateData: any = {
    ...filteredData,
    updatedAt: serverTimestamp(),
  };
  
  // Ricalcola totale e saldo se prodotti o acconto cambiano
  if (data.prodotti !== undefined || data.acconto !== undefined) {
    const currentDoc = await getDoc(docRef);
    if (currentDoc.exists()) {
      const currentData = currentDoc.data();
      
      // Calcola nuovo totale da prodotti (se cambiano) o usa quello esistente
      const totale = data.prodotti !== undefined 
        ? calculateTotale(data.prodotti)
        : currentData.totale;
      
      const acconto = data.acconto ?? currentData.acconto;
      
      updateData.totale = totale;
      updateData.saldo = totale - acconto;
    }
  }
  
  // Converti Date in Timestamp se presente
  if (data.dataSaldo) {
    updateData.dataSaldo = Timestamp.fromDate(data.dataSaldo);
  }
  
  await updateDoc(docRef, updateData);
}

/**
 * Elimina ordine (admin only)
 */
export async function deleteOrder(orderId: string): Promise<void> {
  const docRef = doc(db, COLLECTION, orderId);
  await deleteDoc(docRef);
}

/**
 * Registra pagamento acconto (admin only) - DEPRECATED
 * Usa addAccontoPayment() per supporto acconti multipli
 */
export async function recordAccontoPayment(
  orderId: string,
  metodo: 'contante' | 'carta' | 'bonifico' | 'paypal',
  data: Date = new Date()
): Promise<void> {
  const docRef = doc(db, COLLECTION, orderId);
  await updateDoc(docRef, {
    metodoPagamentoAcconto: metodo,
    dataAcconto: Timestamp.fromDate(data),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Registra pagamento saldo (admin only)
 */
export async function recordSaldoPayment(
  orderId: string,
  metodo: 'contante' | 'carta' | 'bonifico' | 'paypal',
  data: Date = new Date()
): Promise<void> {
  const docRef = doc(db, COLLECTION, orderId);
  await updateDoc(docRef, {
    metodoPagamentoSaldo: metodo,
    dataSaldo: Timestamp.fromDate(data),
    updatedAt: serverTimestamp(),
  });
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
  metodo: 'contante' | 'carta' | 'bonifico' | 'paypal',
  note?: string,
  data: Date = new Date()
): Promise<Transaction> {
  const docRef = doc(db, COLLECTION, orderId);
  
  // 1. Fetch ordine corrente per validation
  const orderSnap = await getDoc(docRef);
  if (!orderSnap.exists()) {
    throw new Error('Ordine non trovato');
  }
  
  const orderData = ensureProdottiArray(orderSnap.data());
  const totale = orderData.totale || 0;
  const accontoAttuale = orderData.acconto || 0;
  const transactions: Transaction[] = orderData.transactions || [];
  
  // 2. Validation: acconto totale non deve superare totale ordine
  const nuovoAccontoTotale = accontoAttuale + importo;
  if (nuovoAccontoTotale > totale) {
    throw new Error(
      `Acconto totale (€${nuovoAccontoTotale.toFixed(2)}) supera il totale ordine (€${totale.toFixed(2)}). ` +
      `Puoi aggiungere massimo €${(totale - accontoAttuale).toFixed(2)}.`
    );
  }
  
  // 3. Validation: importo deve essere positivo
  if (importo <= 0) {
    throw new Error('L\'importo dell\'acconto deve essere maggiore di zero');
  }
  
  // 4. Crea nuova transaction
  const newTransaction: Transaction = {
    tipo: 'acconto',
    importo,
    metodo,
    data: Timestamp.fromDate(data),
    note: note || undefined,
    emailInviata: false, // Sarà settato a true dopo invio email
  };
  
  // 5. Append transaction all'array
  const updatedTransactions = [...transactions, newTransaction];
  
  // 6. Ricalcola acconto (somma di tutte le transactions tipo acconto)
  const nuovoAcconto = updatedTransactions
    .filter(t => t.tipo === 'acconto')
    .reduce((sum, t) => sum + t.importo, 0);
  
  const nuovoSaldo = totale - nuovoAcconto;
  
  // 7. Update Firestore con nuovi valori
  await updateDoc(docRef, {
    transactions: updatedTransactions,
    acconto: nuovoAcconto,
    saldo: nuovoSaldo,
    // Legacy fields (backward compat): update con ultimo pagamento
    metodoPagamentoAcconto: metodo,
    dataAcconto: Timestamp.fromDate(data),
    updatedAt: serverTimestamp(),
  });
  
  // 8. Return transaction creata (per email notification)
  return newTransaction;
}
