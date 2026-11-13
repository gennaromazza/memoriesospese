import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { DateTime } from 'luxon';
import type { CalendarEvent } from '../../shared/calendar-types.js';
import { unpaidDepositRequestExpired } from './payment-deadlines.js';
import { RESCHEDULE_JOBS, rescheduleBlocksSlot } from './reschedule-policy.js';

export const CHECKOUT_HOLDS = 'bookingCheckoutHolds';
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
  return [...moving, ...snapshot.docs.flatMap(doc => {
    const data = doc.data();
    if (doc.id === excludeBookingId || !checkoutHoldBlocksSlot(data, now)) return [];
    const slotStart = data.dataShootingInizio.toDate();
    const slotEnd = data.dataShootingFine.toDate();
    return slotStart < end && slotEnd > start
      ? [{ start: slotStart, end: slotEnd, source: 'firestore_booking' as const, id: `checkout-${doc.id}`, allDay: false }]
      : [];
  })];
}

/**
 * All server reservations share day guards, including different campaigns.
 * A guard read protects an EMPTY query against concurrent phantom inserts.
 * Return the writes so callers can finish every transaction read first.
 */
export async function checkSlotReservation(
  transaction: Transaction, db: Firestore, start: Date, end: Date,
  excludeCheckoutHoldId?: string,
  excludeBookingId?: string,
  excludeRescheduleBookingId?: string,
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
  const snapshots = await Promise.all([
    transaction.get(query('bookings').where('stato', '==', 'in_attesa')),
    transaction.get(query('bookings').where('stato', '==', 'confermata')),
    transaction.get(query(CHECKOUT_HOLDS)),
    transaction.get(query(RESCHEDULE_JOBS)),
  ]);
  const now = Date.now();
  const occupied = snapshots.some((snapshot, index) => snapshot.docs.some(doc => {
    if (index === 2 && doc.id === excludeCheckoutHoldId) return false;
    if (index === 3 && doc.id === excludeRescheduleBookingId) return false;
    if (index < 2 && doc.id === excludeBookingId) return false;
    const data = doc.data();
    if (index === 2 && !checkoutHoldBlocksSlot(data, now)) return false;
    if (index === 3 && !rescheduleBlocksSlot(data)) return false;
    if (index < 2 && unpaidDepositRequestExpired(data, now)) return false;
    return start < data.dataShootingFine.toDate() && end > data.dataShootingInizio.toDate();
  }));
  if (occupied) throw new BookingSlotConflictError('Slot non più disponibile');
  return () => refs.forEach((ref, index) => {
    transaction.set(ref, { version: (guards[index].data()?.version ?? 0) + 1 });
  });
}
