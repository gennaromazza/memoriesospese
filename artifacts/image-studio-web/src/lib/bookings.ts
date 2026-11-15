/**
 * Bookings - Gestione prenotazioni Firestore
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
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
import { apiRequest } from '@/lib/queryClient';
import { requiresBookingCancellationPanel } from './booking-deletion';
import type { Booking } from '@shared/booking-types';
import type { BookingApprovalResult, AdminBookingPayment, GetAdminBookingPaymentCheckouts200,
  AdminBookingManagementLink, BookingManagementChangeInput, ChangeAdminBookingManagementLink200 } from '@workspace/api-client-react';
import { WorkflowState } from '@shared/schema';

const COLLECTION = 'bookings';

export interface BookingCreationResult {
  success: true;
  bookingId: string;
  stato: 'in_attesa' | 'confermata';
}

export class BookingRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'BookingRequestError';
  }
}

function bookingRequestError(error: unknown, preserveConflictMessage = false): BookingRequestError {
  const match = error instanceof Error ? /^(\d{3}):\s*([\s\S]*)$/.exec(error.message) : null;
  const status = match ? Number(match[1]) : undefined;
  if (status === 409 && !preserveConflictMessage) {
    return new BookingRequestError('Questo orario non è più disponibile. Scegli un altro slot: i dati inseriti sono conservati.', status);
  }
  if (match) {
    try {
      const body = JSON.parse(match[2]);
      const message = body.message || body.error;
      if (typeof message === 'string' && message.trim()) return new BookingRequestError(message, status);
    } catch { /* Non mostrare pagine HTML di errore o dettagli del proxy. */ }
  }
  return new BookingRequestError(
    'Non è stato possibile verificare l’esito. Controlla la tua email o contatta lo studio prima di riprovare.',
    status,
  );
}

/**
 * Crea nuova prenotazione via endpoint server V2 (usa Calendar Engine V2)
 * Non richiede più workingHours/durataMinuti - usa solo campaignId
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
  prodotti?: Array<{ prodottoId: string; prodottoNome: string; quantity: number }>;
  note: string;
  bookingConditionsVersion?: string;
  isManual?: boolean;
  createdByAdmin?: string;
  /** Gift card usata per pagare la prenotazione. */
  giftCardCode?: string;
}): Promise<BookingCreationResult> {
  let response: Response;
  try {
    response = await apiRequest('POST', '/api/booking/v2/create', {
      campaignId: data.campaignId,
      cliente: data.cliente,
      dataShootingInizio: data.dataShootingInizio.toISOString(),
      dataShootingFine: data.dataShootingFine.toISOString(),
      prodottoId: data.prodottoId,
      prodottoNome: data.prodottoNome,
      prodotti: data.prodotti,
      note: data.note,
      bookingConditionsVersion: data.bookingConditionsVersion,
      isManual: data.isManual,
      createdByAdmin: data.createdByAdmin,
      giftCardCode: data.giftCardCode,
    });
  } catch (error) {
    throw bookingRequestError(error);
  }

  let result: unknown;
  try { result = await response.json(); } catch {
    throw bookingRequestError(null);
  }
  if (!result || typeof result !== 'object'
    || !('success' in result) || result.success !== true
    || !('bookingId' in result) || typeof result.bookingId !== 'string' || !result.bookingId.trim()
    || !('stato' in result) || (result.stato !== 'in_attesa' && result.stato !== 'confermata')) {
    throw bookingRequestError(null);
  }
  return { success: true, bookingId: result.bookingId, stato: result.stato };
}

/**
 * Ottiene slot disponibili da API server V2 (usa Calendar Engine V2)
 * Non richiede più workingHours/durataMinuti - usa solo campaignId
 * @param isManualBooking - Se true, bypassa restrizioni giorni della campagna (per admin)
 */
export async function getAvailableSlots(
  date: string, // YYYY-MM-DD
  campaignId: string,
  isManualBooking: boolean = false
): Promise<Array<{
  start: string;
  end: string;
  startTime: string;
  endTime: string;
}>> {
  const response = await apiRequest('POST', '/api/booking/v2/available-slots', {
      date,
      campaignId,
      isManualBooking,
  });

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
 * Approva prenotazione (admin only) - chiama API server V2 con Calendar Engine V2
 */
export async function getBookingPaymentDetails(id: string): Promise<AdminBookingPayment> {
  try { return await (await apiRequest('GET', `/api/booking/${encodeURIComponent(id)}/payment`)).json(); }
  catch (error) { throw bookingRequestError(error, true); }
}
/** Authenticated transport preserves Firebase + admin-MFA headers for generated hooks. */
export async function getBookingManagementLinkDetails(id: string): Promise<AdminBookingManagementLink> {
  try { return await (await apiRequest('GET', `/api/booking/${encodeURIComponent(id)}/management-link`)).json(); }
  catch (error) { throw bookingRequestError(error, true); }
}
export async function changeBookingManagementLink(id: string, input: BookingManagementChangeInput): Promise<ChangeAdminBookingManagementLink200> {
  try { return await (await apiRequest('POST', `/api/booking/${encodeURIComponent(id)}/management-link`, input)).json(); }
  catch (error) { throw bookingRequestError(error, true); }
}
/** One initial read, then Firestore delivers changes; never poll the entire booking collection. */
export function subscribeBookings(onUpdate: (bookings: Booking[], fromCache: boolean) => void, onError: (error: Error) => void) {
  return onSnapshot(query(collection(db, 'bookings'), orderBy('dataShootingInizio', 'desc')), { includeMetadataChanges: true },
    snapshot => onUpdate(snapshot.docs.map(document => ({ ...document.data(), id: document.id } as Booking)), snapshot.metadata.fromCache),
    onError);
}
export async function getBookingPaymentCheckouts(): Promise<GetAdminBookingPaymentCheckouts200> {
  try { return await (await apiRequest('GET', '/api/booking/admin/payment-checkouts')).json(); }
  catch (error) { throw bookingRequestError(error, true); }
}
export async function verifyBookingDeposit(id: string): Promise<AdminBookingPayment> {
  try { return await (await apiRequest('POST', `/api/booking/${encodeURIComponent(id)}/payment/verify`, {})).json(); }
  catch (error) { throw bookingRequestError(error, true); }
}
export async function resendBookingDeposit(id: string, requestId: string): Promise<AdminBookingPayment> {
  try { return await (await apiRequest('POST', `/api/booking/${encodeURIComponent(id)}/payment/resend`, { requestId })).json(); }
  catch (error) { throw bookingRequestError(error, true); }
}
export async function approveBooking(bookingId: string): Promise<BookingApprovalResult> {
  try {
    const response = await apiRequest('PATCH', `/api/booking/v2/${bookingId}/approve`);
    const result = await response.json();
    if (result?.success !== true || result.paymentRequired === true && (
      !Number.isSafeInteger(result.amountCents) || result.amountCents <= 0 || !Number.isFinite(Date.parse(result.expiresAt))
      || !['pending', 'sending', 'sent', 'failed', 'unknown'].includes(result.emailStatus))) {
      throw new BookingRequestError('Esito dell’approvazione da verificare: aggiorna la lista prima di riprovare.');
    }
    return result;
  } catch (error) {
    if (error instanceof BookingRequestError) throw error;
    throw bookingRequestError(error, true);
  }
}

/**
 * Rifiuta prenotazione (admin only) - chiama API server e invia email con link nuova prenotazione
 */
export async function rejectBooking(bookingId: string): Promise<void> {
  await apiRequest('PATCH', `/api/booking/${bookingId}/reject`);
}

/**
 * Aggiorna stato prenotazione (admin only) - chiama API server per inviare email
 */
export async function updateBookingStatus(
  bookingId: string,
  stato: 'in_attesa' | 'confermata' | 'completata' | 'annullata'
): Promise<void> {
  await apiRequest('PATCH', `/api/booking/${bookingId}/status`, { stato });
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
    noteAdmin?: string;
  },
  oldEmail?: string
): Promise<void> {
  await apiRequest('PATCH', `/api/booking/${bookingId}/update`, {
      ...data,
      oldEmail // Inviato al server per gestire notifica cambio email
  });
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
 * Invia email al cliente se la prenotazione era confermata
 */
export async function deleteBooking(bookingId: string): Promise<void> {
  const docRef = doc(db, COLLECTION, bookingId);
  const bookingSnap = await getDoc(docRef);
  if (bookingSnap.exists() && requiresBookingCancellationPanel(bookingSnap.data())) {
    throw new Error('Usa Annullamento e acconto: la prenotazione pagata o in lavorazione non va eliminata.');
  }
  // The authoritative server must finish before any customer cancellation email.
  await apiRequest('DELETE', `/api/booking/${bookingId}/delete`);
  
  if (bookingSnap.exists()) {
    const bookingData = bookingSnap.data();
    const statoBooking = bookingData.stato;

    if (statoBooking === 'confermata' && bookingData.cliente?.email && bookingData.campaignId) {
      try {
        const campaignRef = doc(db, 'booking_campaigns', bookingData.campaignId);
        const campaignSnap = await getDoc(campaignRef);
        const campaignNome = campaignSnap.exists() ? campaignSnap.data().nome : 'Shooting';

        const dataShootingInizio = bookingData.dataShootingInizio?.toDate?.() || new Date(bookingData.dataShootingInizio);
        const bookingDate = dataShootingInizio.toLocaleDateString('it-IT', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });

        const response = await fetch('/api/email/send-booking-cancelled', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientEmail: bookingData.cliente.email,
            clienteNome: bookingData.cliente.nome,
            clienteCognome: bookingData.cliente.cognome,
            campaignNome,
            bookingDate
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(`Errore HTTP ${response.status}: ${errorData.error || response.statusText}`);
        }

        console.log('✅ Email cancellazione inviata al cliente');
      } catch (emailError) {
        console.error('❌ Errore invio email cancellazione (non bloccante):', emailError);
      }
    }
  }
  
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
 * Cancella prenotazione con cascata completa su ordini, gallerie, foto, commenti e voice memo (admin only)
 * ATTENZIONE: Operazione irreversibile! Cancella anche i file da Firebase Storage
 * @param params.bookingId - ID della prenotazione da cancellare
 * @param params.cancelReason - Motivo opzionale della cancellazione (verrà inviato al cliente via email)
 */
export async function deleteBookingCascade(params: { bookingId: string; cancelReason?: string }): Promise<void> {
  const { bookingId, cancelReason } = params;
  const snapshot = await getDoc(doc(db, 'bookings', bookingId)), source = snapshot.data();
  if (source && requiresBookingCancellationPanel(source)) {
    throw new Error('Questa prenotazione conserva un acconto o un’operazione in corso. Usa Annullamento e acconto: nessun file collegato è stato eliminato.');
  }
  console.log(`🗑️ Inizio cancellazione a cascata per booking ${bookingId}${cancelReason ? ` - Motivo: ${cancelReason}` : ''}`);

  // 1. Conta e trova tutti gli elementi correlati
  const { orderIds, galleryIds } = await countRelatedEntities(bookingId);

  // Colleziona errori per report finale
  const errors: Array<{ type: string; id: string; error: any }> = [];

  // 2. Per ogni galleria, cancella TUTTI i contenuti associati
  for (const galleryId of galleryIds) {
    try {
      console.log(`🗑️ Cancellazione contenuti per galleria ${galleryId}...`);
      
      // 2a. Cancella tutte le foto dalla subcollection 'photos' + file Storage
      try {
        const photosQuery = query(collection(db, 'galleries', galleryId, 'photos'));
        const photosSnapshot = await getDocs(photosQuery);
        
        for (const photoDoc of photosSnapshot.docs) {
          try {
            const photoData = photoDoc.data();
            
            // Cancella file da Firebase Storage se esiste URL
            if (photoData.url) {
              try {
                const { ref, deleteObject } = await import('firebase/storage');
                const { storage } = await import('./firebase');
                
                // Estrai path dall'URL Firebase Storage
                const url = new URL(photoData.url);
                const pathMatch = url.pathname.match(/\/o\/(.+?)(\?|$)/);
                
                if (pathMatch) {
                  const fullPath = decodeURIComponent(pathMatch[1]);
                  const storageRef = ref(storage, fullPath);
                  await deleteObject(storageRef);
                  console.log(`✅ File Storage cancellato: ${fullPath}`);
                } else {
                  console.warn(`⚠️ Impossibile estrarre path da URL: ${photoData.url}`);
                  errors.push({ type: 'photo-storage', id: photoDoc.id, error: 'Invalid URL format' });
                }
              } catch (storageError) {
                console.error(`⚠️ Errore cancellazione file Storage:`, storageError);
                errors.push({ type: 'photo-storage', id: photoDoc.id, error: storageError });
              }
            }
            
            // Cancella documento Firestore
            await deleteDoc(doc(db, 'galleries', galleryId, 'photos', photoDoc.id));
          } catch (photoError) {
            console.error(`⚠️ Errore cancellazione foto ${photoDoc.id}:`, photoError);
            errors.push({ type: 'photo', id: photoDoc.id, error: photoError });
          }
        }
        
        console.log(`✅ ${photosSnapshot.docs.length} foto cancellate per galleria ${galleryId}`);
      } catch (photosError) {
        console.error(`❌ Errore cancellazione foto per galleria ${galleryId}:`, photosError);
      }
      
      // 2b. Cancella tutti i commenti associati
      try {
        const commentsQuery = query(
          collection(db, 'comments'),
          where('galleryId', '==', galleryId)
        );
        const commentsSnapshot = await getDocs(commentsQuery);
        
        for (const commentDoc of commentsSnapshot.docs) {
          await deleteDoc(doc(db, 'comments', commentDoc.id));
        }
        
        console.log(`✅ ${commentsSnapshot.docs.length} commenti cancellati per galleria ${galleryId}`);
      } catch (commentsError) {
        console.error(`❌ Errore cancellazione commenti per galleria ${galleryId}:`, commentsError);
      }
      
      // 2c. Cancella tutti i voice memo associati + file Storage
      try {
        const voiceMemosQuery = query(
          collection(db, 'voiceMemos'),
          where('galleryId', '==', galleryId)
        );
        const voiceMemosSnapshot = await getDocs(voiceMemosQuery);
        
        for (const memoDoc of voiceMemosSnapshot.docs) {
          try {
            const memoData = memoDoc.data();
            
            // Cancella file audio da Storage
            if (memoData.audioUrl) {
              try {
                const { ref, deleteObject } = await import('firebase/storage');
                const { storage } = await import('./firebase');
                
                // Estrai path dall'URL Firebase Storage
                const url = new URL(memoData.audioUrl);
                const pathMatch = url.pathname.match(/\/o\/(.+?)(\?|$)/);
                
                if (pathMatch) {
                  const fullPath = decodeURIComponent(pathMatch[1]);
                  const storageRef = ref(storage, fullPath);
                  await deleteObject(storageRef);
                  console.log(`✅ File audio cancellato: ${fullPath}`);
                } else {
                  console.warn(`⚠️ Impossibile estrarre path da URL: ${memoData.audioUrl}`);
                  errors.push({ type: 'memo-storage', id: memoDoc.id, error: 'Invalid URL format' });
                }
              } catch (storageError) {
                console.error(`⚠️ Errore cancellazione file audio:`, storageError);
                errors.push({ type: 'memo-storage', id: memoDoc.id, error: storageError });
              }
            }
            
            // Cancella documento Firestore
            await deleteDoc(doc(db, 'voiceMemos', memoDoc.id));
          } catch (memoError) {
            console.error(`⚠️ Errore cancellazione voice memo ${memoDoc.id}:`, memoError);
            errors.push({ type: 'memo', id: memoDoc.id, error: memoError });
          }
        }
        
        console.log(`✅ ${voiceMemosSnapshot.docs.length} voice memo cancellati per galleria ${galleryId}`);
      } catch (voiceMemosError) {
        console.error(`❌ Errore cancellazione voice memo per galleria ${galleryId}:`, voiceMemosError);
      }
      
      // 2d. Soft delete della galleria (setta active = false)
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

  // 4. Prima di cancellare, recupera dati booking per email e invia notifica se richiesto
  try {
    const bookingSnap = await getDoc(doc(db, COLLECTION, bookingId));
    if (bookingSnap.exists()) {
      const bookingData = bookingSnap.data();
      
      // Invia email di cancellazione al cliente se abbiamo email e c'è un motivo (opzionale)
      if (bookingData.cliente?.email) {
        try {
          await fetch('/api/email/booking-cancelled', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientEmail: bookingData.cliente.email,
              clientName: `${bookingData.cliente.nome || ''} ${bookingData.cliente.cognome || ''}`.trim(),
              prodottoNome: bookingData.prodottoNome || bookingData.prodotti?.[0]?.prodottoNome || 'Servizio fotografico',
              dataPrenotazione: bookingData.dataShootingInizio?.toDate?.()?.toISOString() || bookingData.dataShootingInizio,
              cancelReason: cancelReason || null,
            }),
          });
          console.log(`📧 Email cancellazione inviata a ${bookingData.cliente.email}`);
        } catch (emailError) {
          console.warn(`⚠️ Impossibile inviare email cancellazione:`, emailError);
          // Non blocchiamo la cancellazione se l'email fallisce
        }
      }
    }
  } catch (fetchError) {
    console.warn(`⚠️ Impossibile recuperare dati booking per email:`, fetchError);
  }

  // 5. Cancella la prenotazione (con Google Calendar event)
  try {
    await deleteBooking(bookingId);
  } catch (error) {
    console.error(`❌ Errore cancellazione booking ${bookingId}:`, error);
    errors.push({ type: 'booking', id: bookingId, error });
  }

  // 6. Se ci sono errori, lancia eccezione con dettagli
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

  console.log(`✅ Cancellazione a cascata completata: ${orderIds.length} ordini, ${galleryIds.length} gallerie con tutti i contenuti associati`);
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

/** Creating the first order marks only an upcoming shooting as completed; later workflow stages never move backwards. */
export function getWorkflowStateAfterOrderCreation(currentState?: WorkflowState): WorkflowState | null {
  if (!currentState || currentState === WorkflowState.SHOOTING_DA_SVOLGERE) {
    return WorkflowState.SHOOTING_COMPLETATO;
  }
  return null;
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
      case 'shooting_completato':
        endpoint = '/api/email/shooting-completed';
        payload.campaignName = dati.campaignName || 'Shooting';
        payload.bookingDate = dati.bookingDate || new Date().toLocaleDateString('it-IT');
        break;

      case 'in_lavorazione':
        endpoint = '/api/email/order-processing';
        payload.prodottoNome = dati.prodottoNome || 'Il tuo ordine';
        break;

      case 'pronto_ritiro':
        endpoint = '/api/email/order-ready';
        payload.prodottoNome = dati.prodottoNome || 'Il tuo ordine';
        break;

      case 'consegnato':
        endpoint = '/api/email/order-delivered';
        payload.prodottoNome = dati.prodottoNome || 'Il tuo ordine';
        // Invia anche l'email di richiesta recensione (fire-and-forget, non blocca)
        fetch('/api/email/review-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientEmail: dati.clienteEmail,
            clienteName: dati.clienteNome,
          }),
        }).catch((err) => console.warn('⚠️ Review request email non inviata:', err));
        break;

      default:
        // shooting_da_svolgere, in_attesa_selezione: no email automatica
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
