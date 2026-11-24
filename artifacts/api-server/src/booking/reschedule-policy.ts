import { DateTime } from 'luxon';
import type { DocumentData } from 'firebase-admin/firestore';
import type { BookingRescheduleView } from '@workspace/api-zod';
import { bookingPaymentMillis } from '@shared/booking-payment-state';
import { rescheduleNoticeFor } from '@shared/seasonal-vademecum';

export const RESCHEDULE_JOBS = 'bookingRescheduleJobs';
export const rescheduleBlocksSlot = (job: DocumentData) => ['pending', 'syncing', 'blocked'].includes(job.status);
export function campaignDates(campaign?: DocumentData) {
  const first = bookingPaymentMillis(campaign?.dataInizio), last = bookingPaymentMillis(campaign?.dataFine);
  return {
    first: first === null ? null : DateTime.fromMillis(first, { zone: 'Europe/Rome' }).startOf('day'),
    last: last === null ? null : DateTime.fromMillis(last, { zone: 'Europe/Rome' }).endOf('day'),
  };
}
export function rescheduleView(booking: DocumentData, campaign?: DocumentData, now = Date.now()): BookingRescheduleView {
  const { first, last } = campaignDates(campaign), start = bookingPaymentMillis(booking.dataShootingInizio);
  const count = booking.customerRescheduleCount ?? 0, notice = rescheduleNoticeFor(campaign);
  let status: BookingRescheduleView['status'] = 'unavailable', reason: string | null = null;
  if (booking.customerReschedule?.status === 'pending') {
    status = 'pending'; reason = 'Stiamo verificando il cambio con il calendario. Non effettuare un altro pagamento e aggiorna tra poco.';
  } else if (booking.customerReschedule?.status === 'blocked') {
    status = 'blocked'; reason = 'Il cambio è in verifica: contatta lo studio prima di prendere un altro appuntamento.';
  } else if (count === 1) {
    status = 'changed'; reason = 'Hai già utilizzato il cambio autonomo. Per altre modifiche contatta lo studio.';
  } else if (booking.stato !== 'confermata') reason = 'Il cambio autonomo è disponibile solo per una prenotazione confermata.';
  else if (booking.calendarSyncPending === true) reason = 'Il calendario è in aggiornamento. Riprova tra poco o contatta lo studio.';
  else if (booking.paymentReviewRequired || booking.automaticConfirmationError) reason = 'La prenotazione richiede una verifica dello studio.';
  else if (count !== 0) reason = 'Le modifiche precedenti richiedono una verifica dello studio.';
  else if (start === null) reason = 'L’orario richiede una verifica dello studio.';
  else if (start - now < notice.ms) reason = `Mancano meno di ${notice.label} allo shooting: per cambiare appuntamento contatta lo studio.`;
  else if (campaign?.attiva !== true || !first?.isValid || !last?.isValid || last.toMillis() <= now || first > last) {
    reason = 'La campagna non è più prenotabile: contatta lo studio.';
  } else { status = 'available'; }
  return { canChange: status === 'available', status, reason,
    firstDate: first?.toISODate() ?? null, lastDate: last?.toISODate() ?? null,
    targetStartsAt: bookingPaymentMillis(booking.customerReschedule?.targetStart) === null ? null : new Date(bookingPaymentMillis(booking.customerReschedule?.targetStart)!),
    targetEndsAt: bookingPaymentMillis(booking.customerReschedule?.targetEnd) === null ? null : new Date(bookingPaymentMillis(booking.customerReschedule?.targetEnd)!),
    notificationStatus: booking.customerReschedule?.emailStatus ?? null };
}
