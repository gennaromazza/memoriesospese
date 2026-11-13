import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type { AdminBookingPayment } from '@workspace/api-zod';
import { bookingPaymentDeadline, bookingPaymentMillis, bookingPaymentStage } from '@shared/booking-payment-state';
import { approvedDepositMatchesBooking, isApprovedDepositHold } from './approved-deposit-state.js';
import { CHECKOUT_HOLDS } from './slot-reservations.js';
import { CheckoutHoldError } from './checkout-hold-state.js';

const iso = (value: unknown) => { const time = bookingPaymentMillis(value); return time === null ? null : new Date(time); };
const cents = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function buildAdminBookingPayment(id: string, booking: DocumentData | undefined, hold: DocumentData | undefined,
  campaign: DocumentData | undefined, paypalEnabled: boolean, now = Date.now()): AdminBookingPayment {
  const approved = !!hold && isApprovedDepositHold(hold);
  const payment = booking?.depositPayment || hold?.depositPayment;
  const virtual = { stato: 'in_attesa', depositPayment: payment, depositPaymentRequest: {
    status: hold?.status === 'expired' || hold?.status === 'cancelled' ? 'expired' : 'pending',
    amountCents: hold?.depositAmountCents, requestedAt: hold?.createdAt, expiresAt: hold?.expiresAt,
  } };
  const source = booking || virtual;
  const stage = bookingPaymentStage(source, now);
  const deadline = approved ? bookingPaymentDeadline(source) : bookingPaymentMillis(hold?.expiresAt);
  const email = hold?.paymentEmail;
  const emailStatus = email?.status === 'sending' && (bookingPaymentMillis(email.leaseUntil) ?? 0) <= now
    ? 'unknown' : email?.status || booking?.depositPaymentRequest?.emailStatus || null;
  const sent = bookingPaymentMillis(email?.sentAt), available = sent === null ? null : sent + 60_000;
  const amount = cents(booking?.depositPaymentRequest?.amountCents ?? hold?.depositAmountCents ?? payment?.amountCents);
  const manual = Number(booking?.acconto || 0);
  const paidAmount = cents(payment?.amountCents) ?? (Number.isFinite(manual) && manual > 0 ? cents(Math.round(manual * 100)) : null);
  let reason: string | null = null;
  if (stage === 'pagamento_da_verificare') reason = 'Incasso o dati della richiesta da riconciliare. Non chiedere un altro pagamento.';
  else if (payment?.paypalCaptureId) reason = 'L’acconto è già stato ricevuto.';
  else if (!hold) reason = 'Nessun checkout PayPal associato.';
  else if (stage === 'scaduta' || deadline !== null && deadline <= now) reason = 'La richiesta è scaduta. Occorre una nuova prenotazione.';
  else if (hold.status !== 'active') reason = 'Il checkout è stato chiuso.';
  else if (deadline === null) reason = 'Scadenza non valida: verifica la richiesta.';
  else if (approved && !approvedDepositMatchesBooking(hold, booking, now)) reason = 'I dati della richiesta sono cambiati. Verifica prima di pagare.';
  else if (!campaign?.attiva) reason = 'La campagna non è più attiva.';
  else if (!approved && (campaign.richiedeApprovazione !== false || campaign.richiedeAcconto !== true
    || campaign.accontoImportoCentesimi !== hold.depositAmountCents)) reason = 'Le condizioni del checkout immediato sono cambiate.';
  else if (!paypalEnabled) reason = 'PayPal non è disponibile: verifica la configurazione.';
  let resendReason = reason;
  if (!resendReason && !approved) resendReason = 'Il checkout immediato non prevede un’email di richiesta acconto.';
  if (!resendReason && !/^[a-f0-9]{64}$/.test(hold?.approvalNonce || '')) resendReason = 'Link non recuperabile: richiedi assistenza senza rinnovare la scadenza.';
  if (!resendReason && (!email || !['pending', 'sending', 'sent', 'failed', 'unknown'].includes(email.status)
    || !Number.isSafeInteger(email.attempts) || email.attempts < 0)) resendReason = 'Dati dell’invio da verificare. Nessun reinvio automatico.';
  if (!resendReason && emailStatus === 'unknown') resendReason = 'Esito email incerto: verifica prima la Posta inviata di Gmail. Nessun reinvio automatico.';
  if (!resendReason && emailStatus === 'sending') resendReason = 'Invio email già in corso.';
  if (!resendReason && (email?.attempts || 0) >= 3) resendReason = 'Raggiunto il limite di tre tentativi di invio.';
  if (!resendReason && email?.status === 'sent' && sent === null) resendReason = 'Data dell’ultimo invio da verificare.';
  if (!resendReason && available !== null && available > now) resendReason = 'Attendi almeno un minuto dall’ultimo invio.';
  const customer = booking?.cliente || hold?.draft?.cliente || {};
  return {
    bookingId: id, campaignId: booking?.campaignId || hold?.campaignId || '', campaignName: campaign?.nome || 'Campagna',
    stage, flow: hold ? approved ? 'approved' : 'immediate' : 'none', amountCents: amount, paidAmountCents: paidAmount,
    currency: 'EUR', expiresAt: deadline === null ? null : new Date(deadline), serverTime: new Date(now),
    paymentStatus: stage === 'pagamento_da_verificare' ? 'review' : payment?.status === 'paid' || paidAmount !== null ? 'paid'
      : hold?.paypalCaptureAttempt ? 'processing' : booking?.depositPaymentRequest || hold ? 'unpaid' : 'not_required',
    method: payment?.provider === 'paypal' && payment.paypalCaptureId ? 'paypal' : manual > 0 ? 'manual' : hold || booking?.depositPaymentRequest ? 'paypal' : null,
    paypalOrderId: payment?.paypalOrderId || hold?.paypal?.orderId || null, paypalCaptureId: payment?.paypalCaptureId || null,
    paypalFeeCents: cents(payment?.paypalFeeCents), netCents: cents(payment?.netCents),
    providerStatus: payment?.paypalCaptureId ? 'COMPLETED' : hold?.paypal?.lastVerifiedStatus || (hold?.paypal?.orderId ? 'ORDER_CREATED' : null),
    emailStatus, canResend: resendReason === null, resendReason,
    resendAvailableAt: available === null ? null : new Date(available),
    canVerify: !!hold?.paypal?.orderId, payable: reason === null, payabilityReason: reason,
    customerName: `${customer.nome || ''} ${customer.cognome || ''}`.trim(), customerEmail: customer.email || '',
    shootingStart: iso(booking?.dataShootingInizio || hold?.dataShootingInizio),
    shootingEnd: iso(booking?.dataShootingFine || hold?.dataShootingFine),
  };
}
export async function getAdminBookingPaymentSnapshot(db: Firestore, id: string, paypalEnabled: boolean) {
  const [book, checkout] = await Promise.all([db.collection('bookings').doc(id).get(), db.collection(CHECKOUT_HOLDS).doc(id).get()]);
  if (!book.exists && !checkout.exists) throw new CheckoutHoldError(404, 'Prenotazione o checkout non trovato.');
  const campaignId = book.data()?.campaignId || checkout.data()?.campaignId;
  const campaign = campaignId ? (await db.collection('booking_campaigns').doc(campaignId).get()).data() : undefined;
  return buildAdminBookingPayment(id, book.data(), checkout.data(), campaign, paypalEnabled);
}
export async function listAdminBookingCheckouts(db: Firestore, paypalEnabled: boolean) {
  const limit = 100;
  const [active, review] = await Promise.all([
    db.collection(CHECKOUT_HOLDS).where('status', '==', 'active').limit(limit).get(),
    db.collection(CHECKOUT_HOLDS).where('depositPayment.status', '==', 'paid_action_required').limit(limit).get(),
  ]);
  const holds = [...new Map([...active.docs, ...review.docs].map(doc => [doc.id, doc])).values()];
  if (!holds.length) return { items: [], truncated: false };
  const books = await db.getAll(...holds.map(doc => db.collection('bookings').doc(doc.id)));
  const unregistered = holds.filter((_, index) => !books[index].exists);
  const ids = [...new Set(unregistered.map(doc => doc.data().campaignId).filter(Boolean))];
  const campaigns = ids.length ? await db.getAll(...ids.map(id => db.collection('booking_campaigns').doc(id))) : [];
  const byId = new Map(campaigns.map(doc => [doc.id, doc.data()]));
  return { items: unregistered.map(doc => buildAdminBookingPayment(doc.id, undefined, doc.data(), byId.get(doc.data().campaignId), paypalEnabled))
    .filter(item => item.stage === 'pagamento_da_verificare' || item.expiresAt && item.expiresAt.getTime() > Date.now()),
  truncated: active.size >= limit || review.size >= limit };
}
