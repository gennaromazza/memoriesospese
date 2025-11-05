/**
 * Booking Campaigns - Gestione campagne prenotazione Firestore
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
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
import type { BookingCampaign } from '@shared/booking-types';

const COLLECTION = 'booking_campaigns';

/**
 * Ottiene tutte le campagne booking
 */
export async function getAllCampaigns(): Promise<BookingCampaign[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy('dataInizio', 'desc')
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    dataInizio: doc.data().dataInizio?.toDate?.() || new Date(doc.data().dataInizio),
    dataFine: doc.data().dataFine?.toDate?.() || new Date(doc.data().dataFine),
    createdAt: doc.data().createdAt?.toDate?.() || new Date(),
  })) as BookingCampaign[];
}

/**
 * Ottiene campagna singola per ID
 */
export async function getCampaignById(id: string): Promise<BookingCampaign | null> {
  const docRef = doc(db, COLLECTION, id);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return null;
  }
  
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    dataInizio: data.dataInizio?.toDate?.() || new Date(data.dataInizio),
    dataFine: data.dataFine?.toDate?.() || new Date(data.dataFine),
    createdAt: data.createdAt?.toDate?.() || new Date(),
  } as BookingCampaign;
}

/**
 * Ottiene campagna per code (URL pubblico)
 */
export async function getCampaignByCode(code: string): Promise<BookingCampaign | null> {
  const q = query(
    collection(db, COLLECTION),
    where('code', '==', code)
  );
  
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  const docSnap = snapshot.docs[0];
  const data = docSnap.data();
  
  return {
    id: docSnap.id,
    ...data,
    dataInizio: data.dataInizio?.toDate?.() || new Date(data.dataInizio),
    dataFine: data.dataFine?.toDate?.() || new Date(data.dataFine),
    createdAt: data.createdAt?.toDate?.() || new Date(),
  } as BookingCampaign;
}

/**
 * Ottiene campagne attive (dataInizio <= oggi <= dataFine)
 * Considera giorniAnticipoSlider per mostrare lo slider in homepage prima dell'apertura prenotazioni
 */
export async function getActiveCampaigns(): Promise<BookingCampaign[]> {
  const now = new Date();
  
  // Rimuovo orderBy per evitare "failed-precondition" (manca indice composito)
  // Ordino client-side invece
  const q = query(
    collection(db, COLLECTION),
    where('attiva', '==', true)
  );
  
  const snapshot = await getDocs(q);
  
  const campaigns = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    dataInizio: doc.data().dataInizio?.toDate?.() || new Date(doc.data().dataInizio),
    dataFine: doc.data().dataFine?.toDate?.() || new Date(doc.data().dataFine),
    createdAt: doc.data().createdAt?.toDate?.() || new Date(),
  })) as BookingCampaign[];
  
  // Filtra campagne considerando anticipo slider e ordina per dataInizio (desc)
  return campaigns
    .filter(c => {
      // Calcola data inizio slider (considera anticipo se presente)
      const giorniAnticipo = c.giorniAnticipoSlider || 0;
      const dataInizioSlider = new Date(c.dataInizio);
      dataInizioSlider.setDate(dataInizioSlider.getDate() - giorniAnticipo);
      
      // Slider visibile da: (dataInizio - anticipo) fino a dataFine
      return dataInizioSlider <= now && c.dataFine >= now;
    })
    .sort((a, b) => b.dataInizio.getTime() - a.dataInizio.getTime());
}

/**
 * Crea nuova campagna
 */
export async function createCampaign(
  data: Omit<BookingCampaign, 'id' | 'createdAt'>
): Promise<string> {
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...data,
    dataInizio: Timestamp.fromDate(data.dataInizio),
    dataFine: Timestamp.fromDate(data.dataFine),
    createdAt: serverTimestamp(),
  });
  
  return docRef.id;
}

/**
 * Aggiorna campagna esistente
 */
export async function updateCampaign(
  id: string,
  data: Partial<Omit<BookingCampaign, 'id' | 'createdAt'>>
): Promise<void> {
  const docRef = doc(db, COLLECTION, id);
  
  const updateData: any = { ...data };
  
  // Converti Date in Timestamp per Firestore
  if (data.dataInizio) {
    updateData.dataInizio = Timestamp.fromDate(data.dataInizio);
  }
  if (data.dataFine) {
    updateData.dataFine = Timestamp.fromDate(data.dataFine);
  }
  
  await updateDoc(docRef, updateData);
}

/**
 * Elimina campagna
 */
export async function deleteCampaign(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION, id);
  await deleteDoc(docRef);
}

/**
 * Genera codice univoco campagna (8 caratteri alfanumerici)
 */
export function generateCampaignCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Verifica se codice campagna è univoco
 */
export async function isCampaignCodeUnique(code: string): Promise<boolean> {
  const q = query(
    collection(db, COLLECTION),
    where('code', '==', code)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.empty;
}
