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
import type { Booking, WorkflowState } from '@shared/booking-types';

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

/**
 * Conta ordini e gallerie associate a una prenotazione
 * Utile per mostrare conferma cancellazione a cascata
 */
export async function countRelatedEntities(bookingId: string): Promise<{
  ordersCount: number;
  galleriesCount: number;
  orderIds: string[];
  galleryIds: string[];
}> {
  // 1. Trova tutti gli ordini per questo booking
  const ordersQuery = query(
    collection(db, 'orders'),
    where('bookingId', '==', bookingId)
  );
  const ordersSnapshot = await getDocs(ordersQuery);
  const orderIds = ordersSnapshot.docs.map(doc => doc.id);

  // 2. Per ogni ordine, trova le gallerie associate
  const galleryIds: string[] = [];
  for (const orderId of orderIds) {
    const galleriesQuery = query(
      collection(db, 'galleries'),
      where('orderId', '==', orderId)
    );
    const galleriesSnapshot = await getDocs(galleriesQuery);
    galleryIds.push(...galleriesSnapshot.docs.map(doc => doc.id));
  }

  // 3. Trova anche gallerie collegate direttamente al booking (senza ordine)
  const directGalleriesQuery = query(
    collection(db, 'galleries'),
    where('bookingId', '==', bookingId)
  );
  const directGalleriesSnapshot = await getDocs(directGalleriesQuery);
  const directGalleryIds = directGalleriesSnapshot.docs.map(doc => doc.id);
  
  // Unisci e rimuovi duplicati
  const allGalleryIds = [...new Set([...galleryIds, ...directGalleryIds])];

  return {
    ordersCount: orderIds.length,
    galleriesCount: allGalleryIds.length,
    orderIds,
    galleryIds: allGalleryIds,
  };
}

/**
 * Cancella prenotazione con cascata su ordini e gallerie (admin only)
 * ATTENZIONE: Operazione irreversibile!
 */
export async function deleteBookingCascade(bookingId: string): Promise<void> {
  console.log(`🗑️ Inizio cancellazione a cascata per booking ${bookingId}`);

  // 1. Conta e trova tutti gli elementi correlati
  const { orderIds, galleryIds } = await countRelatedEntities(bookingId);

  // Colleziona errori per report finale
  const errors: Array<{ type: string; id: string; error: any }> = [];

  // 2. Cancella tutte le gallerie associate
  for (const galleryId of galleryIds) {
    try {
      // Soft delete (setta active = false)
      await updateDoc(doc(db, 'galleries', galleryId), {
        active: false,
        updatedAt: serverTimestamp(),
      });
      console.log(`✅ Galleria ${galleryId} disattivata`);
    } catch (error) {
      console.error(`❌ Errore disattivazione galleria ${galleryId}:`, error);
      errors.push({ type: 'gallery', id: galleryId, error });
    }
  }

  // 3. Cancella tutti gli ordini associati
  for (const orderId of orderIds) {
    try {
      await deleteDoc(doc(db, 'orders', orderId));
      console.log(`✅ Ordine ${orderId} cancellato`);
    } catch (error) {
      console.error(`❌ Errore cancellazione ordine ${orderId}:`, error);
      errors.push({ type: 'order', id: orderId, error });
    }
  }

  // 4. Cancella la prenotazione (con Google Calendar event)
  try {
    await deleteBooking(bookingId);
  } catch (error) {
    console.error(`❌ Errore cancellazione booking ${bookingId}:`, error);
    errors.push({ type: 'booking', id: bookingId, error });
  }

  // 5. Se ci sono errori, lancia eccezione con dettagli
  if (errors.length > 0) {
    const failedGalleries = errors.filter(e => e.type === 'gallery').map(e => e.id);
    const failedOrders = errors.filter(e => e.type === 'order').map(e => e.id);
    const failedBooking = errors.some(e => e.type === 'booking');

    const errorMessage = [
      'Cancellazione parzialmente fallita:',
      failedGalleries.length > 0 && `${failedGalleries.length} galleria/e non disattivata/e (${failedGalleries.join(', ')})`,
      failedOrders.length > 0 && `${failedOrders.length} ordine/i non cancellato/i (${failedOrders.join(', ')})`,
      failedBooking && `Prenotazione ${bookingId} non cancellata`,
    ].filter(Boolean).join('; ');

    throw new Error(errorMessage);
  }

  console.log(`✅ Cancellazione a cascata completata: ${orderIds.length} ordini, ${galleryIds.length} gallerie`);
}

/**
 * Aggiorna stato workflow per booking e order collegato + invia email automatica
 * @param id - ID booking o order
 * @param tipo - 'booking' o 'order' per determinare come cercare
 * @param nuovoStato - Nuovo stato workflow
 * @param datiEmail - Dati per email (clienteNome, clienteEmail, prodottoNome, campaignName, bookingDate)
 */
export async function updateWorkflowState(
  id: string,
  tipo: 'booking' | 'order',
  nuovoStato: WorkflowState,
  datiEmail?: {
    clienteNome: string;
    clienteEmail: string;
    prodottoNome?: string;
    campaignName?: string;
    bookingDate?: string;
  }
): Promise<void> {
  console.log(`🔄 Aggiornamento stato workflow per ${tipo} ${id} → ${nuovoStato}`);

  try {
    // 1. Trova booking e order collegati
    let booking: any = null;
    let order: any = null;

    if (tipo === 'booking') {
      // Recupera booking
      const bookingSnap = await getDoc(doc(db, 'bookings', id));
      if (bookingSnap.exists()) {
        booking = { id: bookingSnap.id, ...bookingSnap.data() };
      }

      // Cerca order collegato
      const ordersQuery = query(collection(db, 'orders'), where('bookingId', '==', id));
      const ordersSnap = await getDocs(ordersQuery);
      if (!ordersSnap.empty) {
        order = { id: ordersSnap.docs[0].id, ...ordersSnap.docs[0].data() };
      }
    } else {
      // Recupera order
      const orderSnap = await getDoc(doc(db, 'orders', id));
      if (orderSnap.exists()) {
        order = { id: orderSnap.id, ...orderSnap.data() };
        
        // Cerca booking collegato
        if (order.bookingId) {
          const bookingSnap = await getDoc(doc(db, 'bookings', order.bookingId));
          if (bookingSnap.exists()) {
            booking = { id: bookingSnap.id, ...bookingSnap.data() };
          }
        }
      }
    }

    // 2. Aggiorna stato in booking (se esiste)
    if (booking) {
      await updateDoc(doc(db, 'bookings', booking.id), {
        statoWorkflow: nuovoStato,
        updatedAt: serverTimestamp(),
      });
      console.log(`✅ Stato booking ${booking.id} aggiornato a ${nuovoStato}`);
    }

    // 3. Aggiorna stato in order (se esiste)
    if (order) {
      await updateDoc(doc(db, 'orders', order.id), {
        statoWorkflow: nuovoStato,
        updatedAt: serverTimestamp(),
      });
      console.log(`✅ Stato order ${order.id} aggiornato a ${nuovoStato}`);
    }

    // 4. Invia email automatica in base al nuovo stato
    if (datiEmail && datiEmail.clienteEmail) {
      await sendWorkflowStateEmail(nuovoStato, datiEmail);
    }

  } catch (error) {
    console.error('❌ Errore aggiornamento stato workflow:', error);
    throw error;
  }
}

/**
 * Invia email automatica in base al nuovo stato workflow
 */
async function sendWorkflowStateEmail(
  stato: WorkflowState,
  dati: {
    clienteNome: string;
    clienteEmail: string;
    prodottoNome?: string;
    campaignName?: string;
    bookingDate?: string;
  }
): Promise<void> {
  try {
    let endpoint = '';
    let payload: any = {
      recipientEmail: dati.clienteEmail,
      clienteName: dati.clienteNome,
    };

    switch (stato) {
      case 'shooting_svolto':
        endpoint = '/api/email/shooting-completed';
        payload.campaignName = dati.campaignName || 'Shooting';
        payload.bookingDate = dati.bookingDate || new Date().toLocaleDateString('it-IT');
        break;

      case 'inizio_lavorazione':
        endpoint = '/api/email/order-processing';
        payload.prodottoNome = dati.prodottoNome || 'Il tuo ordine';
        break;

      case 'pronto_consegna':
        endpoint = '/api/email/order-ready';
        payload.prodottoNome = dati.prodottoNome || 'Il tuo ordine';
        break;

      default:
        // shooting_da_svolgere non invia email (già gestita da booking-confirmed)
        console.log(`ℹ️ Stato ${stato} non richiede email automatica`);
        return;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Errore invio email: ${errorData.error || response.statusText}`);
    }

    console.log(`✅ Email workflow inviata per stato ${stato} a ${dati.clienteEmail}`);
  } catch (error: any) {
    console.error('⚠️ Errore invio email workflow (non bloccante):', error);
    // Non lanciamo l'errore per non bloccare il cambio stato
  }
}
