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
import type { Order, InsertOrder } from '@shared/booking-types';

const COLLECTION = 'orders';

/**
 * Helper: Converti ordine legacy (singolo prodotto) in nuovo schema (array prodotti)
 */
function ensureProdottiArray(orderData: any): any {
  // Se prodotti array già esiste, usa quello
  if (Array.isArray(orderData.prodotti)) {
    return orderData;
  }
  
  // Backward compatibility: converti schema vecchio (singolo prodotto) in array
  if (orderData.prodottoId || orderData.prodottoNome) {
    return {
      ...orderData,
      prodotti: [{
        prodottoId: orderData.prodottoId || 'legacy',
        prodottoNome: orderData.prodottoNome || 'Prodotto Legacy',
        prodottoPrezzo: orderData.totale || 0, // Fallback: usa totale come prezzo
        prodottoNumeroFoto: orderData.prodottoNumeroFoto || 0,
        quantita: 1,
      }],
    };
  }
  
  // Caso edge: nessun prodotto → array vuoto
  return {
    ...orderData,
    prodotti: [],
  };
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
  // Calcola totale dalla somma prodotti
  const totale = calculateTotale(data.prodotti);
  
  // Calcola saldo automaticamente
  const saldo = totale - data.acconto;
  
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...data,
    totale,
    saldo,
    stato: 'bozza',
    emailSaldoInviata: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
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
  
  const updateData: any = {
    ...data,
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
 * Registra pagamento acconto (admin only)
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
