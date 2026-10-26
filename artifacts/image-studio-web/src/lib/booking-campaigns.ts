/**
 * Booking Campaigns - Gestione campagne prenotazione Firestore
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  runTransaction,
  deleteField,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { createUrl } from './config';
import type { BookingCampaignFE } from '@shared/booking-types';

const COLLECTION = 'booking_campaigns';

export type BookingCampaignImageKind = 'slider' | 'booking';

export async function uploadCampaignImage(
  campaignId: string,
  imageKind: BookingCampaignImageKind,
  file: File,
): Promise<{ downloadUrl: string; storagePath: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sessione amministratore non disponibile. Ricarica la pagina e accedi di nuovo.');
  }

  const idToken = await user.getIdToken();
  const response = await fetch(
    createUrl(`/api/admin/campaigns/${encodeURIComponent(campaignId)}/images/${imageKind}`),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': file.type,
      },
      body: file,
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage = typeof payload?.error === 'string'
      ? payload.error
      : typeof payload?.error?.message === 'string'
        ? payload.error.message
        : null;
    throw new Error(errorMessage || 'Errore durante il caricamento dell’immagine');
  }
  if (typeof payload?.downloadUrl !== 'string' || typeof payload?.storagePath !== 'string') {
    throw new Error('Il server non ha restituito il collegamento all’immagine');
  }

  return { downloadUrl: payload.downloadUrl, storagePath: payload.storagePath };
}

/**
 * Converte i formati data usati da Firestore e dal frontend.
 * Restituisce null per i valori mancanti o non interpretabili.
 */
function safeDate(value: unknown): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (
    typeof value === 'object' &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

// Campagne con date obbligatorie corrotte non devono arrivare alla UI come Invalid Date.
function toBookingCampaignFE(id: string, data: any): BookingCampaignFE | null {
  const dataInizio = safeDate(data.dataInizio);
  const dataFine = safeDate(data.dataFine);
  if (!dataInizio || !dataFine) {
    console.warn(`[booking-campaigns] Campagna ${id} ignorata: date non valide.`);
    return null;
  }

  return {
    id,
    ...data,
    temaStagionale: data.temaStagionale ?? null,
    dataInizio,
    dataFine,
    // Fallback deterministico: una campagna legacy senza createdAt non deve
    // sembrare appena creata a ogni lettura.
    createdAt: safeDate(data.createdAt) ?? new Date(0),
  };
}

/**
 * Ottiene tutte le campagne booking
 */
export async function getAllCampaigns(): Promise<BookingCampaignFE[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy('dataInizio', 'desc')
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs
    .map(doc => toBookingCampaignFE(doc.id, doc.data()))
    .filter((campaign): campaign is BookingCampaignFE => campaign !== null);
}

/**
 * Ottiene campagna singola per ID
 */
export async function getCampaignById(id: string): Promise<BookingCampaignFE | null> {
  const docRef = doc(db, COLLECTION, id);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return null;
  }
  
  const campaign = toBookingCampaignFE(docSnap.id, docSnap.data());
  if (!campaign) {
    throw new Error(`La campagna ${id} contiene date non valide e non può essere caricata.`);
  }
  return campaign;
}

/**
 * Ottiene campagna per code (URL pubblico). Supporta sia i documenti nuovi,
 * con il code come ID, sia quelli legacy con ID casuale e campo `code`.
 */
export async function getCampaignByCode(code: string): Promise<BookingCampaignFE | null> {
  const directSnap = await getDoc(doc(db, COLLECTION, code));
  if (directSnap.exists()) {
    const campaign = toBookingCampaignFE(directSnap.id, directSnap.data());
    if (!campaign) {
      throw new Error(`La campagna con codice ${code} contiene date non valide.`);
    }
    return campaign;
  }

  const q = query(
    collection(db, COLLECTION),
    where('code', '==', code)
  );
  
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }

  if (snapshot.size > 1) {
    console.warn(`[booking-campaigns] Trovate ${snapshot.size} campagne con code=${code}.`);
  }

  const docSnap = snapshot.docs[0];
  const campaign = toBookingCampaignFE(docSnap.id, docSnap.data());
  if (!campaign) {
    throw new Error(`La campagna con codice ${code} contiene date non valide.`);
  }
  return campaign;
}

/**
 * Ottiene campagne attive (dataInizio <= oggi <= dataFine)
 * Considera giorniAnticipoSlider per mostrare lo slider in homepage prima dell'apertura prenotazioni
 */
export async function getActiveCampaigns(): Promise<BookingCampaignFE[]> {
  const now = new Date();
  
  // Rimuovo orderBy per evitare "failed-precondition" (manca indice composito)
  // Ordino client-side invece
  const q = query(
    collection(db, COLLECTION),
    where('attiva', '==', true)
  );
  
  const snapshot = await getDocs(q);
  
  const campaigns = snapshot.docs
    .map(doc => toBookingCampaignFE(doc.id, doc.data()))
    .filter((campaign): campaign is BookingCampaignFE => campaign !== null);
  
  // Filtra campagne considerando anticipo slider e ordina per dataInizio (desc)
  return campaigns
    .filter(c => {
      // Calcola data inizio slider (considera anticipo se presente)
      // FIX: Usa math per calcolo date (evita setDate())
      const giorniAnticipo = Math.max(0, c.giorniAnticipoSlider || 0);
      const dataInizioSlider = new Date(c.dataInizio.getTime() - giorniAnticipo * 86400000);
      
      // Slider visibile da: (dataInizio - anticipo) fino a dataFine
      return dataInizioSlider <= now && c.dataFine >= now;
    })
    .sort((a, b) => b.dataInizio.getTime() - a.dataInizio.getTime());
}

/**
 * Rimuove campi undefined da un oggetto (Firestore non li accetta)
 */
function removeUndefinedFields<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: any = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  });
  return result;
}

/**
 * Crea nuova campagna
 * @param data - Dati campagna con Date (non Timestamp)
 */
export async function createCampaign(
  data: Omit<BookingCampaignFE, 'id' | 'createdAt'>
): Promise<string> {
  const code = typeof data.code === 'string' ? data.code.trim() : '';
  if (!code) {
    throw new Error('Il codice campagna è obbligatorio.');
  }

  const dataInizio = safeDate(data.dataInizio);
  const dataFine = safeDate(data.dataFine);
  if (!dataInizio || !dataFine) {
    throw new Error('Inserisci date valide per la campagna.');
  }
  if (dataFine < dataInizio) {
    throw new Error('La data di fine deve essere successiva alla data di inizio.');
  }

  // Questa query intercetta anche i documenti legacy con ID casuale.
  // Il controllo transazionale sul docId sotto gestisce le creazioni concorrenti
  // tra client aggiornati; le vecchie versioni dell'app non usano quel docId.
  const existingByCode = await getDocs(
    query(collection(db, COLLECTION), where('code', '==', code)),
  );
  if (!existingByCode.empty) {
    throw new Error('Il codice campagna è già in uso. Generane uno nuovo.');
  }

  const cleanData = removeUndefinedFields({
    ...data,
    code,
    dataInizio: Timestamp.fromDate(dataInizio),
    dataFine: Timestamp.fromDate(dataFine),
    createdAt: serverTimestamp(),
  });

  const docRef = doc(db, COLLECTION, code);
  await runTransaction(db, async transaction => {
    const existing = await transaction.get(docRef);
    if (existing.exists()) {
      throw new Error('Il codice campagna è già in uso. Generane uno nuovo.');
    }
    transaction.set(docRef, cleanData);
  });

  return code;
}

/**
 * Aggiorna campagna esistente
 * @param data - Dati campagna con Date (non Timestamp)
 */
export async function updateCampaign(
  id: string,
  data: Partial<Omit<BookingCampaignFE, 'id' | 'createdAt'>>
): Promise<void> {
  const docRef = doc(db, COLLECTION, id);

  const updateData: Record<string, any> = { ...data };
  delete updateData.id;
  delete updateData.createdAt;

  if (data.dataInizio !== undefined) {
    const dataInizio = safeDate(data.dataInizio);
    if (!dataInizio) throw new Error('La data di inizio non è valida.');
    updateData.dataInizio = Timestamp.fromDate(dataInizio);
  }
  if (data.dataFine !== undefined) {
    const dataFine = safeDate(data.dataFine);
    if (!dataFine) throw new Error('La data di fine non è valida.');
    updateData.dataFine = Timestamp.fromDate(dataFine);
  }

  const cleanData: Record<string, any> = {};
  for (const [key, value] of Object.entries(updateData)) {
    if (value === undefined) continue;
    cleanData[key] = value === null ? deleteField() : value;
  }
  if (Object.keys(cleanData).length === 0) return;

  // Legge le date attuali nella stessa transazione: anche un update parziale
  // deve rispettare dataFine >= dataInizio.
  await runTransaction(db, async transaction => {
    const currentSnapshot = await transaction.get(docRef);
    if (!currentSnapshot.exists()) {
      throw new Error('La campagna da aggiornare non esiste più.');
    }

    const currentData = currentSnapshot.data();
    const dataInizio = data.dataInizio === undefined
      ? safeDate(currentData.dataInizio)
      : safeDate(data.dataInizio);
    const dataFine = data.dataFine === undefined
      ? safeDate(currentData.dataFine)
      : safeDate(data.dataFine);

    if (!dataInizio || !dataFine) {
      throw new Error('La campagna deve avere date di inizio e fine valide.');
    }
    if (dataFine < dataInizio) {
      throw new Error('La data di fine deve essere successiva alla data di inizio.');
    }

    transaction.update(docRef, cleanData);
  });
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
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(bytes[i] % chars.length);
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
