import { db } from '../firebase-admin.js';
import { DateTime } from 'luxon';
import { campaignToAvailabilityConfig, getAllExistingBookingEvents } from './calendar-adapter.js';
import { getAvailableSlotsForDate } from '../calendar-engine/index.js';
import { checkFreeBusy } from '../google-calendar.js';
const id = 'cXjMQyCUMFUw1A8Td0QH', campaignId = 'QDjUJFzRpOwe7Rbc6i0b';
async function main() {
  const booking = (await db.collection('bookings').doc(id).get()).data();
  const campaign = (await db.collection('booking_campaigns').doc(campaignId).get()).data();
  if (!booking || `${booking.cliente?.nome} ${booking.cliente?.cognome}`.trim() !== 'Ester Orabona'
    || booking.campaignId !== campaignId || booking.stato !== 'annullata'
    || booking.depositPaymentRequest?.status !== 'expired' || booking.depositPayment
    || booking.paymentReviewRequired || booking.depositWaiver || booking.acconto || booking.transactions?.length)
    throw new Error('La prenotazione non è più eleggibile per conferma senza acconto.');
  const hold = (await db.collection('bookingCheckoutHolds').doc(id).get()).data();
  if (hold?.depositPayment || hold?.paymentReviewRequired
    || hold?.paypalCaptureAttempt && hold.paypalCaptureAttempt.state !== 'declined')
    throw new Error('Pagamento o esito PayPal da verificare.');
  const start = booking.dataShootingInizio.toDate(), end = booking.dataShootingFine.toDate();
  const day = DateTime.fromJSDate(start, { zone: 'Europe/Rome' });
  const busy = await checkFreeBusy('primary', start, end);
  const events = await getAllExistingBookingEvents(day.startOf('day').toJSDate(), day.endOf('day').toJSDate(), db, id);
  const available = await getAvailableSlotsForDate(day.startOf('day').toJSDate(), campaignToAvailabilityConfig(campaign), events);
  console.log(JSON.stringify({
    eligible: true, slotAvailable: available.some(s => Math.abs(new Date(s.start).getTime() - start.getTime()) < 1000
      && Math.abs(new Date(s.end).getTime() - end.getTime()) < 1000),
    calendarConflict: busy.some(p => start < new Date(p.end) && end > new Date(p.start)),
    start: start.toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
    actionExists: (await db.collection('bookingAdminActions').doc(`confirm_without_deposit_${id}`).get()).exists,
  }));
}
main().catch(e => { console.error('PREFLIGHT_STOP', e.code || e.name, e.message); process.exitCode = 1; })
  .finally(() => db.terminate());
