/**
 * Bookings - Gestione prenotazioni Firestore
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
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
  durataMinuti: number
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
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Errore caricamento slot disponibili');
  }

  const data = await response.json();
  return data.slots;
}
