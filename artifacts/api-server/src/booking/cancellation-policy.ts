import type { DocumentData } from 'firebase-admin/firestore';
import { bookingPaymentMillis } from '@shared/booking-payment-state';
import { BOOKING_CONDITIONS_VERSION, BOOKING_CONDITIONS_TEXT } from '../../shared/booking-conditions.js';
export const CANCELLATION_JOBS = 'bookingCancellationJobs';
export function bookingDepositCents(root: DocumentData) {
  const payment = root.depositPayment;
  if (payment && payment.currency === 'EUR' && Number.isSafeInteger(payment.amountCents) && payment.amountCents > 0) return payment.amountCents;
  return Number.isFinite(root.acconto) && root.acconto > 0 ? Math.round(root.acconto * 100) : 0;
}
export function cancellationView(root: DocumentData, now = Date.now()) {
  const saved = root.bookingConditions;
  const known = saved?.version === BOOKING_CONDITIONS_VERSION && saved?.text === BOOKING_CONDITIONS_TEXT;
  const state = root.bookingCancellation?.status;
  let reason: string | null = null;
  if (state === 'complete' || root.stato === 'annullata') reason = 'La prenotazione è già annullata.';
  else if (['pending', 'working', 'blocked'].includes(state) || root.stato === 'cancellation_pending') reason = 'Annullamento in verifica: non effettuare una nuova prenotazione finché non ricevi l’esito.';
  else if (root.calendarSyncPending === true) reason = 'Il calendario è in aggiornamento. Riprova tra poco o contatta lo studio.';
  else if (!known) reason = 'Le condizioni originali non sono disponibili per l’annullamento online. Contatta lo studio.';
  else if (root.stato !== 'confermata' || root.paymentReviewRequired || root.automaticConfirmationError) reason = 'Contatta lo studio per gestire questa prenotazione.';
  else if (['pending', 'blocked'].includes(root.customerReschedule?.status)) reason = 'Attendi l’esito del cambio appuntamento prima di annullare.';
  else if ((bookingPaymentMillis(root.dataShootingInizio) ?? 0) <= now) reason = 'Lo shooting è già iniziato: contatta lo studio.';
  const status = state === 'complete' || root.stato === 'annullata' ? 'complete' as const
    : state === 'blocked' ? 'blocked' as const : ['pending', 'working'].includes(state) || root.stato === 'cancellation_pending'
      ? 'pending' as const : reason ? 'unavailable' as const : 'available' as const;
  return { canCancel: !reason, reason, conditions: known ? saved.text as string : null, status,
    refundStatus: String(root.bookingRefund?.status || (bookingDepositCents(root) > 0 && status === 'complete' ? 'review' : 'none')),
    notificationStatus: root.bookingCancellation?.emailStatus || null };
}
