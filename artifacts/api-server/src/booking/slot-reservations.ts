import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { DateTime } from 'luxon';
import type { CalendarEvent } from '../../shared/calendar-types.js';
import { unpaidDepositRequestExpired } from './payment-deadlines.js';
import { RESCHEDULE_JOBS, rescheduleBlocksSlot } from './reschedule-policy.js';
import { CANCELLATION_JOBS } from './cancellation-policy.js';
import { createConsultationDateTime } from '../services/consultation-datetime.js';
const cancellationBlocksSlot = (data: FirebaseFirestore.DocumentData) => ['pending', 'working', 'blocked'].includes(data.status);

export const CHECKOUT_HOLDS = 'bookingCheckoutHolds';
const CONSULTATIONS = 'consultations';
export class BookingSlotConflictError extends Error {}

export function checkoutHoldBlocksSlot(hold: FirebaseFirestore.DocumentData, now = Date.now()): boolean {
  if (hold.status !== 'active') return false;
  const deadline = hold.expiresAt?.toMillis?.();
  // Corrupt active records must fail closed, not make a paid slot look free.
  return !Number.isFinite(deadline) || deadline > now;
}

function searchStart(start: Date): Date {
  return DateTime.fromJSDate(start, { zone: 'Europe/Rome' }).minus({ days: 1 }).startOf('day').toJSDate();
}

export async function loadCheckoutHoldEvents(
  db: Firestore, start: Date, end: Date, excludeBookingId?: string, now = Date.now(),
): Promise<CalendarEvent[]> {
  const snapshot = await db.collection(CHECKOUT_HOLDS)
    .where('dataShootingInizio', '>=', Timestamp.fromDate(searchStart(start)))
    .where('dataShootingInizio', '<=', Timestamp.fromDate(end)).get();
  const jobs = await db.collection(RESCHEDULE_JOBS)
    .where('dataShootingInizio', '>=', Timestamp.fromDate(searchStart(start)))
    .where('dataShootingInizio', '<=', Timestamp.fromDate(end)).get();
  const moving = jobs.docs.flatMap(doc => {
    const data = doc.data();
    if (doc.id === excludeBookingId || !rescheduleBlocksSlot(data)) return [];
    const slotStart = data.dataShootingInizio.toDate(), slotEnd = data.dataShootingFine.toDate();
    return slotStart < end && slotEnd > start
      ? [{ start: slotStart, end: slotEnd, source: 'firestore_booking' as const, id: `reschedule-${doc.id}`, allDay: false }] : [];
  });
  const cancelling = await db.collection(CANCELLATION_JOBS)
    .where('dataShootingInizio', '>=', Timestamp.fromDate(searchStart(start)))
    .where('dataShootingInizio', '<=', Timestamp.fromDate(end)).get();
  const pendingCancellation = cancelling.docs.flatMap(doc => {
    const data = doc.data();
    if (doc.id === excludeBookingId || !cancellationBlocksSlot(data)) return [];
    const slotStart = data.dataShootingInizio.toDate(), slotEnd = data.dataShootingFine.toDate();
    return slotStart < end && slotEnd > start
      ? [{ start: slotStart, end: slotEnd, source: 'firestore_booking' as const, id: `cancel-${doc.id}`, allDay: false }] : [];
  });
  return [...pendingCancellation, ...moving, ...snapshot.docs.flatMap(doc => {
    const data = doc.data();
    if (doc.id === excludeBookingId || !checkoutHoldBlocksSlot(data, now)) return [];
    const slotStart = data.dataShootingInizio.toDate();
    const slotEnd = data.dataShootingFine.toDate();
    return slotStart < end && slotEnd > start
      ? [{ start: slotStart, end: slotEnd, source: 'firestore_booking' as const, id: `checkout-${doc.id}`, allDay: false }]
      : [];
  })];
}

/** Intervallo orario di una consulenza (data + orari locali Europe/Rome); null se i dati non sono validi. */
function consultationInterval(data: FirebaseFirestore.DocumentData): { start: Date; end: Date } | null {
  const date: Date | undefined = data.dataConsulenza?.toDate?.();
  if (!date) return null;
  const dateStr = DateTime.fromJSDate(date, { zone: 'Europe/Rome' }).toFormat('yyyy-MM-dd');
  const from = createConsultationDateTime(dateStr, data.orarioInizio);
  const to = createConsultationDateTime(dateStr, data.orarioFine);
  return from.isValid && to.isValid ? { start: from.toJSDate(), end: to.toJSDate() } : null;
}

/**
 * All server reservations share day guards, including different campaigns.
 * A guard read protects an EMPTY query against concurrent phantom inserts.
 * Return the writes so callers can finish every transaction read first.
 *
 * Anche le consulenze CONFERMATE occupano lo slot (le approvazioni usano le stesse
 * guardie, vedi consultation-reservation.ts); `includeConsultations: false` le ignora.
 * `skipConflictCheck` (override esplicito dell'admin) non lancia mai ma aggiorna comunque le guardie.
 */
export async function checkSlotReservation(
  transaction: Transaction, db: Firestore, start: Date, end: Date,
  excludeCheckoutHoldId?: string,
  excludeBookingId?: string,
  excludeRescheduleBookingId?: string,
  options: { includeConsultations?: boolean; skipConflictCheck?: boolean } = {},
): Promise<() => void> {
  let day = DateTime.fromJSDate(start, { zone: 'Europe/Rome' }).startOf('day');
  const last = DateTime.fromJSDate(new Date(end.getTime() - 1), { zone: 'Europe/Rome' }).startOf('day');
  const refs: FirebaseFirestore.DocumentReference[] = [];
  while (day <= last) {
    refs.push(db.collection('bookingSlotLocks').doc(day.toISODate()!));
    day = day.plus({ days: 1 });
  }
  const guards = await Promise.all(refs.map(ref => transaction.get(ref)));
  const query = (collection: string) => db.collection(collection)
    .where('dataShootingInizio', '>=', Timestamp.fromDate(searchStart(start)))
    .where('dataShootingInizio', '<=', Timestamp.fromDate(end));
  const includeConsultations = options.includeConsultations ?? true;
  const consultations = includeConsultations
    ? await transaction.get(db.collection(CONSULTATIONS).where('stato', '==', 'confermata')
      .where('dataConsulenza', '>=', Timestamp.fromDate(searchStart(start)))
      .where('dataConsulenza', '<=', Timestamp.fromDate(end)))
    : null;
  const snapshots = await Promise.all([
    transaction.get(query('bookings').where('stato', '==', 'in_attesa')),
    transaction.get(query('bookings').where('stato', '==', 'confermata')),
    transaction.get(query(CHECKOUT_HOLDS)),
    transaction.get(query(RESCHEDULE_JOBS)),
    transaction.get(query(CANCELLATION_JOBS)),
  ]);
  const now = Date.now();
  const occupied = snapshots.some((snapshot, index) => snapshot.docs.some(doc => {
    if (index === 2 && doc.id === excludeCheckoutHoldId) return false;
    if (index === 3 && doc.id === excludeRescheduleBookingId) return false;
    if (index < 2 && doc.id === excludeBookingId) return false;
    const data = doc.data();
    if (index === 2 && !checkoutHoldBlocksSlot(data, now)) return false;
    if (index === 3 && !rescheduleBlocksSlot(data)) return false;
    if (index === 4 && !cancellationBlocksSlot(data)) return false;
    if (index < 2 && unpaidDepositRequestExpired(data, now)) return false;
    return start < data.dataShootingFine.toDate() && end > data.dataShootingInizio.toDate();
  }));
  const consultationOccupied = !!consultations?.docs.some(doc => {
    const interval = consultationInterval(doc.data());
    return !!interval && start < interval.end && end > interval.start;
  });
  if ((occupied || consultationOccupied) && !options.skipConflictCheck) throw new BookingSlotConflictError('Slot non più disponibile');
  return () => refs.forEach((ref, index) => {
    transaction.set(ref, { version: (guards[index].data()?.version ?? 0) + 1 });
  });
}
