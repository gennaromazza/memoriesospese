import { FieldValue, type Firestore, type DocumentReference } from 'firebase-admin/firestore';
import { createEvent, deleteEvent } from '../google-calendar.js';
import { syncBookingWorkflowState } from '../../shared/workflow-helpers.js';
import { logger } from '../lib/logger.js';
import { checkSlotReservation } from './slot-reservations.js';
export { BookingSlotConflictError } from './slot-reservations.js';

/** Rechecks Firestore inside the write transaction, including other campaigns. */
export async function reservePublicBooking(
  db: Firestore,
  data: FirebaseFirestore.DocumentData,
  start: Date,
  end: Date,
): Promise<DocumentReference> {
  const ref = db.collection('bookings').doc();
  await db.runTransaction(async transaction => {
    const commitLocks = await checkSlotReservation(transaction, db, start, end);
    commitLocks();
    transaction.set(ref, data);
  });
  return ref;
}

export class AutomaticConfirmationError extends Error {
  constructor(readonly status: number, readonly bookingRetained: boolean) {
    super('Impossibile completare la conferma automatica. Contatta lo studio prima di riprovare.');
  }
}

/** Confirm only after Calendar succeeds; never send emails from this operation. */
export async function confirmPublicBooking(
  ref: DocumentReference,
  data: FirebaseFirestore.DocumentData,
  start: Date,
  end: Date,
): Promise<void> {
  let eventId: string | null = null;
  let calendarCreated = false;
  try {
    const event = await createEvent('primary', {
      summary: `Shooting: ${data.cliente.nome} ${data.cliente.cognome}`,
      description: `Prenotazione shooting CONFERMATA\n\nCliente: ${data.cliente.nome} ${data.cliente.cognome}\nEmail: ${data.cliente.email}\nWhatsApp: ${data.cliente.whatsapp}\n${data.prodottoNome ? `Prodotto: ${data.prodottoNome}\n` : ''}${data.note ? `Note: ${data.note}` : ''}`,
      start, end, location: 'Studio fotografico',
    });
    if (!event.id) throw new Error('Google Calendar non ha restituito un ID evento');
    eventId = event.id;
    calendarCreated = true;
    await ref.update({
      stato: 'confermata',
      ...syncBookingWorkflowState('confermata', data.statoWorkflow),
      googleCalendarEventId: eventId,
      confermataDa: 'sistema',
      confermatail: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch {
    logger.error({ bookingId: ref.id, calendarCreated }, 'Conferma automatica non completata');
    if (!eventId) {
      // A timeout may mean Google accepted the insert without returning its ID.
      // Keep the slot blocked for reconciliation rather than inviting a retry.
      await ref.update({ automaticConfirmationError: true }).catch(() => undefined);
      throw new AutomaticConfirmationError(503, true);
    }
    if (eventId) {
      try {
        await deleteEvent('primary', eventId);
      } catch {
        // Retain the reservation if Calendar cleanup is ambiguous: do not reopen
        // the slot on top of an event that may still exist.
        await ref.update({ googleCalendarEventId: eventId, automaticConfirmationError: true }).catch(() => undefined);
        logger.error({ bookingId: ref.id }, 'Evento da riconciliare: prenotazione mantenuta');
        throw new AutomaticConfirmationError(500, true);
      }
    }
    let retained = false;
    try { await ref.delete(); } catch {
      retained = true;
      logger.error({ bookingId: ref.id }, 'Riserva da riconciliare dopo errore di conferma');
    }
    throw new AutomaticConfirmationError(calendarCreated ? 500 : 503, retained);
  }
}
