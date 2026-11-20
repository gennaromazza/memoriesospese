import { createHash } from 'node:crypto';
import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { bookingPaymentMillis } from '@shared/booking-payment-state';
import { depositReceiptReference } from '@shared/booking-deposit-receipt';
import { createEvent, getEventById, resolveCalendarId } from '../google-calendar.js';
import { canIssueManagementLink } from './management-access.js';

export interface InitialCalendarDependencies {
  read: typeof getEventById;
  create: typeof createEvent;
  calendarId(): string | Promise<string>;
}
const defaults: InitialCalendarDependencies = {
  read: getEventById, create: createEvent, calendarId: () => resolveCalendarId('primary'),
};
const fingerprint = (root: DocumentData) => JSON.stringify([
  depositReceiptReference(root.depositPayment), bookingPaymentMillis(root.dataShootingInizio),
  bookingPaymentMillis(root.dataShootingFine), String(root.cliente?.email || '').trim().toLowerCase(),
]);
const eligible = (root?: DocumentData) => canIssueManagementLink(root) && root?.stato === 'confermata'
  && root.depositPayment?.status === 'paid' && !root.paymentReviewRequired && !root.automaticConfirmationError
  && !['pending', 'working', 'blocked'].includes(root.bookingCancellation?.status)
  && !['pending', 'blocked'].includes(root.customerReschedule?.status);

/** Called by the paid-confirmation outbox before preparing its email.
 * Stable event IDs reconcile a successful insert whose response was lost.
 * Never release the pending flag or send confirmation after an uncertain result.
 */
export async function synchronizeInitialBookingCalendar(
  db: Firestore, bookingId: string, overrides: Partial<InitialCalendarDependencies> = {},
): Promise<DocumentData> {
  const deps = { ...defaults, ...overrides }, ref = db.collection('bookings').doc(bookingId);
  const source = (await ref.get()).data();
  if (!source) throw new Error('Prenotazione non trovata');
  if (source.calendarSyncPending !== true) return source;
  if (!eligible(source)) throw new Error('Prenotazione non sincronizzabile');
  const start = bookingPaymentMillis(source.dataShootingInizio), end = bookingPaymentMillis(source.dataShootingFine);
  if (start === null || end === null || end <= start) throw new Error('Orario della prenotazione non valido');
  const expected = fingerprint(source), marker = `[booking:${bookingId}]`;
  const eventId = source.googleCalendarEventId || source.initialCalendarEventId
    || `b${createHash('sha256').update(`${bookingId}:${depositReceiptReference(source.depositPayment)}`).digest('hex')}`;
  const calendarId = source.googleCalendarId || await deps.calendarId();
  await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!eligible(current) || fingerprint(current!) !== expected) throw new Error('Prenotazione modificata durante la sincronizzazione');
    if (current!.initialCalendarEventId && current!.initialCalendarEventId !== eventId) throw new Error('Evento da riconciliare');
    tx.update(ref, { initialCalendarEventId: eventId });
  });
  const verified = (event: Awaited<ReturnType<typeof getEventById>>) => !!event
    && event.status !== 'cancelled' && event.id === eventId
    && Date.parse(event.start?.dateTime || '') === start && Date.parse(event.end?.dateTime || '') === end
    && (source.googleCalendarEventId === eventId || event.description?.includes(marker));
  let event = await deps.read(calendarId, eventId);
  if (!event) {
    try {
      event = await deps.create(calendarId, { id: eventId, start: new Date(start), end: new Date(end),
        summary: `Shooting: ${source.cliente?.nome || ''} ${source.cliente?.cognome || ''}`.trim(),
        description: `Prenotazione confermata con acconto. ${marker}`, location: 'Studio fotografico' });
    } catch (error) {
      if (Number((error as any)?.code || (error as any)?.response?.status) !== 409) throw error;
      event = await deps.read(calendarId, eventId);
    }
  }
  if (!verified(event)) throw new Error('Evento del calendario da riconciliare');
  return db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!eligible(current) || fingerprint(current!) !== expected || current!.initialCalendarEventId !== eventId) {
      throw new Error('Prenotazione modificata durante la sincronizzazione');
    }
    const changes = { googleCalendarEventId: eventId, googleCalendarId: calendarId,
      calendarSyncPending: false, calendarSyncedAt: Timestamp.now() };
    tx.update(ref, changes);
    return { ...current, ...changes };
  });
}
