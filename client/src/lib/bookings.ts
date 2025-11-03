/**
 * Bookings - Gestione prenotazioni Firestore
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
import type { Booking } from '@shared/booking-types';

const COLLECTION = 'bookings';

/**
 * Crea nuova prenotazione via endpoint server (atomico con Google Calendar)
 */
export async function createBooking(data: {
  campaignId: string;
  cliente: {
    nome: string;
    cognome: string;
    email: string;
    whatsapp: string;
  };
  dataShootingInizio: Date;
  dataShootingFine: Date;
  prodottoId?: string;
  prodottoNome?: string;
  note: string;
  workingHours: {
    apertura: string;
    pausaInizio: string;
    pausaFine: string;
    chiusura: string;
  };
  durataMinuti: number;
}): Promise<string> {
  const response = await fetch('/api/booking/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      campaignId: data.campaignId,
      cliente: data.cliente,
      dataShootingInizio: data.dataShootingInizio.toISOString(),
      dataShootingFine: data.dataShootingFine.toISOString(),
      prodottoId: data.prodottoId,
      prodottoNome: data.prodottoNome,
      note: data.note,
      workingHours: data.workingHours,
      durataMinuti: data.durataMinuti,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Errore creazione prenotazione');
  }

  const result = await response.json();
  return result.bookingId;
}

/**
 * Ottiene slot disponibili da API server
 */
export async function getAvailableSlots(
  date: string, // YYYY-MM-DD
  workingHours: {
    apertura: string;
    pausaInizio: string;
    pausaFine: string;
    chiusura: string;
  },
  durataMinuti: number,
  excludedDays?: number[] // Array di giorni esclusi (0=Domenica, 1=Lunedì, ..., 6=Sabato)
): Promise<Array<{
  start: string;
  end: string;
  startTime: string;
  endTime: string;
}>> {
  const response = await fetch('/api/booking/available-slots', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      date,
      workingHours,
      durataMinuti,
      excludedDays,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Errore caricamento slot disponibili');
  }

  const data = await response.json();
  return data.slots;
}

/**
 * Ottiene tutte le prenotazioni (admin only)
 */
export async function getAllBookings(): Promise<Booking[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy('dataShootingInizio', 'desc')
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    dataShootingInizio: doc.data().dataShootingInizio,
    dataShootingFine: doc.data().dataShootingFine,
    createdAt: doc.data().createdAt,
    updatedAt: doc.data().updatedAt,
    confermatail: doc.data().confermatail,
  })) as Booking[];
}

/**
 * Ottiene prenotazione singola per ID (admin only)
 */
export async function getBookingById(id: string): Promise<Booking | null> {
  const docRef = doc(db, COLLECTION, id);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return null;
  }
  
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
  } as Booking;
}

/**
 * Ottiene prenotazioni per campagna (admin only)
 */
export async function getBookingsByCampaign(campaignId: string): Promise<Booking[]> {
  const q = query(
    collection(db, COLLECTION),
    where('campaignId', '==', campaignId),
    orderBy('dataShootingInizio', 'desc')
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Booking[];
}

/**
 * Ottiene prenotazioni per stato (admin only)
 */
export async function getBookingsByStatus(
  stato: 'in_attesa' | 'confermata' | 'completata' | 'annullata'
): Promise<Booking[]> {
  const q = query(
    collection(db, COLLECTION),
    where('stato', '==', stato),
    orderBy('dataShootingInizio', 'desc')
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Booking[];
}

/**
 * Approva prenotazione (admin only) - chiama API server
 */
export async function approveBooking(bookingId: string, adminUid: string): Promise<void> {
  const response = await fetch(`/api/booking/${bookingId}/approve`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ adminUid }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Errore approvazione prenotazione');
  }
}

/**
 * Aggiorna stato prenotazione (admin only) - chiama API server per inviare email
 */
export async function updateBookingStatus(
  bookingId: string,
  stato: 'in_attesa' | 'confermata' | 'completata' | 'annullata'
): Promise<void> {
  const response = await fetch(`/api/booking/${bookingId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stato }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Errore aggiornamento stato prenotazione');
  }
}

/**
 * Aggiorna dati prenotazione (admin only) - supporta cambio email con notifica
 */
export async function updateBooking(
  bookingId: string,
  data: {
    cliente?: {
      nome?: string;
      cognome?: string;
      email?: string;
      whatsapp?: string;
    };
    note?: string;
  },
  oldEmail?: string // Per rilevare cambio email e inviare notifica
): Promise<void> {
  const response = await fetch(`/api/booking/${bookingId}/update`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      ...data,
      oldEmail // Inviato al server per gestire notifica cambio email
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Errore aggiornamento prenotazione');
  }
}

/**
 * Marca prenotazione come visualizzata dall'admin
 */
export async function markBookingAsViewed(bookingId: string): Promise<void> {
  const docRef = doc(db, COLLECTION, bookingId);
  await updateDoc(docRef, {
    dataVisualizzazione: serverTimestamp(),
  });
}

/**
 * Elimina prenotazione (admin only)
 * Cancella anche l'evento da Google Calendar se presente
 */
export async function deleteBooking(bookingId: string): Promise<void> {
  // Prima recupera la prenotazione per ottenere googleCalendarEventId
  const docRef = doc(db, COLLECTION, bookingId);
  const bookingSnap = await getDoc(docRef);
  
  if (bookingSnap.exists()) {
    const bookingData = bookingSnap.data();
    const googleCalendarEventId = bookingData.googleCalendarEventId;
    
    // Se esiste un evento Google Calendar, cancellalo prima
    if (googleCalendarEventId) {
      try {
        await fetch(`/api/booking/${bookingId}/calendar-event`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ googleCalendarEventId })
        });
        console.log('✅ Evento Google Calendar cancellato');
      } catch (error) {
        console.error('❌ Errore cancellazione evento Google Calendar:', error);
        // Continua comunque con la cancellazione della prenotazione
      }
    }
  }
  
  // Cancella la prenotazione da Firestore
  await deleteDoc(docRef);
}
