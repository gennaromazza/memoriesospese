import { db } from '../firebase-admin.js';
import { Timestamp } from 'firebase-admin/firestore';
import { DateTime } from 'luxon';
import { campaignToAvailabilityConfig, getAllExistingBookingEvents } from './calendar-adapter.js';
import { getAvailableSlotsForDate } from '../calendar-engine/index.js';
import { checkFreeBusy } from '../google-calendar.js';
import { CHECKOUT_HOLDS } from './slot-reservations.js';

const campaignId = 'QDjUJFzRpOwe7Rbc6i0b';
const names = new Set(['assunta improda', 'simona rea']);
const normalized = (value: unknown) => String(value || '').trim().toLowerCase();
const stamp = (value: any) => value?.toDate?.().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }) || null;
async function main() {
  const campaignSnapshot = await db.collection('booking_campaigns').doc(campaignId).get();
  const campaign = campaignSnapshot.data();
  if (!campaignSnapshot.exists || campaign?.nome !== 'Natale 2026') throw new Error('Campagna inattesa');
  const bookings = await db.collection('bookings').where('campaignId', '==', campaignId).get();
  const selected = bookings.docs.filter(doc => {
    const booking = doc.data();
    return names.has(normalized(`${booking.cliente?.nome || ''} ${booking.cliente?.cognome || ''}`));
  });
  if (selected.length !== 2) throw new Error(`Attese esattamente 2 prenotazioni, trovate ${selected.length}`);
  for (const doc of selected) {
    const booking = doc.data();
    const start = booking.dataShootingInizio?.toDate?.(), end = booking.dataShootingFine?.toDate?.();
    if (!start || !end) throw new Error('Orario mancante');
    const day = DateTime.fromJSDate(start, { zone: 'Europe/Rome' });
    const [busy, events] = await Promise.all([
      checkFreeBusy('primary', start, end),
      getAllExistingBookingEvents(day.startOf('day').toJSDate(), day.endOf('day').toJSDate(), db, doc.id),
    ]);
    const available = await getAvailableSlotsForDate(day.startOf('day').toJSDate(),
      campaignToAvailabilityConfig(campaign), events);
    const slotAvailable = available.some(slot => Math.abs(new Date(slot.start).getTime() - start.getTime()) < 1000
      && Math.abs(new Date(slot.end).getTime() - end.getTime()) < 1000);
    const calendarBusy = busy.some(period => start < new Date(period.end) && end > new Date(period.start));
    const [holdDoc, recoveryLogs, recoveryJob] = await Promise.all([
      db.collection(CHECKOUT_HOLDS).doc(doc.id).get(),
      db.collection('emailLogs').where('relatedDocId', '==', doc.id).where('type', '==', 'booking_deposit_recovery').get(),
      db.collection('bookingRecoveryJobs').doc(doc.id).get(),
    ]);
    const hold = holdDoc.data();
    console.log(JSON.stringify({
      name: `${booking.cliente?.nome || ''} ${booking.cliente?.cognome || ''}`.trim(),
      id: doc.id, status: booking.stato, request: booking.depositPaymentRequest?.status,
      expired: booking.depositPaymentRequest?.expiresAt instanceof Timestamp,
      paid: !!booking.depositPayment, review: !!booking.paymentReviewRequired, waiver: !!booking.depositWaiver,
      existingEmail: booking.emailConfermataInviata === true, eventId: booking.googleCalendarEventId || null,
      appointment: stamp(booking.dataShootingInizio), end: stamp(booking.dataShootingFine),
      slotAvailable, calendarBusy, hold: hold ? { status: hold.status, capture: hold.paypalCaptureAttempt?.state || null,
        payment: hold.depositPayment?.status || null } : null,
      recoveryEmails: recoveryLogs.size, recoveryJobExists: recoveryJob.exists,
    }));
  }
  console.log('CAMPAIGN', JSON.stringify({ active: campaign.attiva, deposit: campaign.richiedeAcconto,
    recovery: campaign.emailRecuperoAcconto === true, recoveryActivation: stamp(campaign.recuperoAccontoAttivatoIl) }));
}
main().catch(error => { console.error(error.code || error.name, error.message); process.exitCode = 1; })
  .finally(() => db.terminate());
