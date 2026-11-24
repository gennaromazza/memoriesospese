import { createHash } from 'node:crypto';
import { Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore';
import { DateTime } from 'luxon';
import type { BookingRescheduleInput, BookingRescheduleSlots } from '@workspace/api-zod';
import { bookingPaymentMillis } from '@shared/booking-payment-state';
import { authorizeBookingManagement, BookingManagementError, canIssueManagementLink, MANAGEMENT_ACCESS, managementAccessMatches } from './management-access.js';
import { RESCHEDULE_JOBS, rescheduleView, campaignDates } from './reschedule-policy.js';
import { validateCampaign, campaignToAvailabilityConfig, getAllExistingBookingEvents } from './calendar-adapter.js';
import { getAvailableSlotsForDate } from '../calendar-engine/index.js';
import { resolveCalendarId } from '../google-calendar.js';
import { checkSlotReservation, BookingSlotConflictError } from './slot-reservations.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function permitted(booking: DocumentData, campaign?: DocumentData) {
  const policy = rescheduleView(booking, campaign);
  if (!policy.canChange) throw new BookingManagementError(409, policy.reason || 'Cambio non disponibile.');
}
export async function slotsForManagedBooking(db: Firestore, id: string, token: string, date: string): Promise<BookingRescheduleSlots> {
  const { booking } = await authorizeBookingManagement(db, id, token);
  const campaign = (await db.collection('booking_campaigns').doc(booking.campaignId).get()).data();
  permitted(booking, campaign);
  return slotsForSnapshot(db, id, booking, campaign, date);
}
async function slotsForSnapshot(db: Firestore, id: string, booking: DocumentData, campaign: DocumentData | undefined, date: string): Promise<BookingRescheduleSlots> {
  if (!validateCampaign(campaign)) throw new BookingManagementError(503, 'Configurazione della campagna da verificare con lo studio.');
  const day = DateTime.fromISO(date, { zone: 'Europe/Rome' }), { first, last } = campaignDates(campaign);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day.isValid || !first || !last || day < first || day > last) {
    throw new BookingManagementError(400, 'Scegli una data nel periodo della campagna.');
  }
  const calendarId = await resolveCalendarId(booking.googleCalendarId || 'primary');
  const events = await getAllExistingBookingEvents(day.startOf('day').toJSDate(), day.endOf('day').toJSDate(), db, id,
    { strict: true, excludeEvent: booking.googleCalendarEventId ? { eventId: booking.googleCalendarEventId, calendarId } : undefined });
  const slots = await getAvailableSlotsForDate(day.toJSDate(), campaignToAvailabilityConfig({ ...campaign, id: booking.campaignId }), events);
  const original = bookingPaymentMillis(booking.dataShootingInizio);
  return { slots: slots.filter(slot => new Date(slot.start).getTime() > Date.now()
    && new Date(slot.start).getTime() !== original).map(slot => ({
      startsAt: new Date(slot.start), endsAt: new Date(slot.end),
      label: `${DateTime.fromJSDate(new Date(slot.start), { zone: 'Europe/Rome' }).toFormat('HH:mm')} – ${DateTime.fromJSDate(new Date(slot.end), { zone: 'Europe/Rome' }).toFormat('HH:mm')}`,
    })) };
}
/** Recheck other resources after reserving the target and immediately before contacting Google. */
export async function assertReservedRescheduleAvailable(db: Firestore, id: string, job: DocumentData, booking: DocumentData) {
  const campaign = (await db.collection('booking_campaigns').doc(booking.campaignId).get()).data();
  if (campaign?.attiva !== true) throw new BookingManagementError(409, 'La campagna non è più prenotabile.');
  const start = job.dataShootingInizio.toDate(), end = job.dataShootingFine.toDate();
  const date = DateTime.fromJSDate(start, { zone: 'Europe/Rome' }).toISODate()!;
  const available = await slotsForSnapshot(db, id, booking, campaign, date);
  if (!available.slots.some(slot => new Date(slot.startsAt).getTime() === start.getTime()
    && new Date(slot.endsAt).getTime() === end.getTime())) throw new BookingManagementError(409, 'Orario non più disponibile.');
}
function sameIntent(job: DocumentData, input: BookingRescheduleInput) {
  return bookingPaymentMillis(job.dataShootingInizio) === new Date(input.startsAt).getTime()
    && bookingPaymentMillis(job.dataShootingFine) === new Date(input.endsAt).getTime()
    && bookingPaymentMillis(job.originalStart) === new Date(input.expectedStartsAt).getTime();
}
/** Reserve the destination without releasing the original. Calendar work never runs in a transaction. */
export async function reserveManagedReschedule(db: Firestore, id: string, input: BookingRescheduleInput) {
  const { booking } = await authorizeBookingManagement(db, id, input.token);
  const ref = db.collection(RESCHEDULE_JOBS).doc(id), rootRef = db.collection('bookings').doc(id);
  const prior = (await ref.get()).data();
  if (prior?.requestId === input.requestId) {
    if (!sameIntent(prior, input)) throw new BookingManagementError(409, 'Richiesta di cambio già usata con un altro orario.');
    if (prior.status === 'failed') throw new BookingManagementError(409, 'Cambio non effettuato. L’orario originale è conservato: scegli nuovamente la data.');
    return;
  }
  const campaignRef = db.collection('booking_campaigns').doc(booking.campaignId), campaignDoc = await campaignRef.get();
  permitted(booking, campaignDoc.data());
  const start = new Date(input.startsAt), end = new Date(input.endsAt), expected = new Date(input.expectedStartsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start
    || expected.getTime() !== bookingPaymentMillis(booking.dataShootingInizio)) throw new BookingManagementError(409, 'La prenotazione è cambiata: aggiorna prima di riprovare.');
  const date = DateTime.fromJSDate(start, { zone: 'Europe/Rome' }).toISODate()!;
  let available: BookingRescheduleSlots;
  try { available = await slotsForManagedBooking(db, id, input.token, date); }
  catch (error) {
    const concurrent = (await ref.get()).data();
    if (concurrent?.requestId === input.requestId && sameIntent(concurrent, input) && concurrent.status !== 'failed') return;
    throw error;
  }
  if (!available.slots.some(slot => new Date(slot.startsAt).getTime() === start.getTime()
    && new Date(slot.endsAt).getTime() === end.getTime())) throw new BookingManagementError(409, 'Questo orario non è più disponibile. Scegline un altro.');
  try {
    await db.runTransaction(async tx => {
      const root = (await tx.get(rootRef)).data(), access = (await tx.get(db.collection(MANAGEMENT_ACCESS).doc(id))).data();
      const old = (await tx.get(ref)).data(), campaign = await tx.get(campaignRef);
      if (!root || !canIssueManagementLink(root) || !managementAccessMatches(access, root, hash(input.token))) {
        throw new BookingManagementError(404, 'Link non valido o revocato.');
      }
      if (old?.requestId === input.requestId) {
        if (!sameIntent(old, input)) throw new BookingManagementError(409, 'Richiesta già usata con un altro orario.');
        return;
      }
      permitted(root, campaign.data());
      if (root.campaignId !== booking.campaignId || bookingPaymentMillis(root.dataShootingInizio) !== expected.getTime()
        || bookingPaymentMillis(root.dataShootingFine) !== bookingPaymentMillis(booking.dataShootingFine)
        || root.googleCalendarEventId !== booking.googleCalendarEventId
        || campaign.updateTime?.toMillis() !== campaignDoc.updateTime?.toMillis() || start.getTime() <= Date.now()) {
        throw new BookingManagementError(409, 'La campagna o la prenotazione è cambiata: aggiorna prima di riprovare.');
      }
      const commitLocks = await checkSlotReservation(tx, db, start, end, id, id, id);
      const calendarId = await resolveCalendarId(root.googleCalendarId || 'primary');
      const eventId = root.googleCalendarEventId || hash(JSON.stringify(['booking-reschedule', id, root.managementAccessEpoch, input.requestId]));
      commitLocks();
      tx.set(ref, { requestId: input.requestId, status: 'pending', attempts: 0, emailStatus: 'pending',
        dataShootingInizio: Timestamp.fromDate(start), dataShootingFine: Timestamp.fromDate(end),
        originalStart: root.dataShootingInizio, originalEnd: root.dataShootingFine,
        epoch: root.managementAccessEpoch, email: String(root.cliente.email).trim().toLowerCase(),
        calendarId, eventId, existingEvent: !!root.googleCalendarEventId, createdAt: Timestamp.now() });
      tx.update(rootRef, { customerReschedule: { requestId: input.requestId, status: 'pending', emailStatus: 'pending',
        targetStart: Timestamp.fromDate(start), targetEnd: Timestamp.fromDate(end) }, updatedAt: Timestamp.now() });
    });
  } catch (error) {
    if (error instanceof BookingSlotConflictError) throw new BookingManagementError(409, 'Questo orario è stato appena occupato. Scegline un altro.');
    throw error;
  }
}
