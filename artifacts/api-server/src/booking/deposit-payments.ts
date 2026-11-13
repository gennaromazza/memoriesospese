import { randomUUID } from 'node:crypto';
import { isApprovedDepositHold, assertApprovedDepositMatchesBooking } from './approved-deposit-state.js';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { captureFromWebhook, extractCompletedCapture } from '../commerce/paypal-capture.js';
import { paypalRequestId, type PayPalOrdersClient, type PayPalOrdersConfig, type PayPalOrderResponse } from '../print-shop/paypal-orders.js';
import { BOOKING_PAYPAL_ORDERS, assertBookingPayPalOrderIdentity, bookingPayPalAccountKey,
  BookingDepositOrderError, type BookingPayPalClient } from './paypal-deposit-orders.js';
import { authorizeCheckoutHold, activeCheckoutHoldView, CheckoutHoldError } from './checkout-hold-state.js';
import { CHECKOUT_HOLDS } from './slot-reservations.js';
import { recordBookingDeposit, depositCaptureResult } from './deposit-payment-ledger.js';

export type BookingCapturePayPalClient = BookingPayPalClient & Pick<PayPalOrdersClient, 'captureOrder' | 'verifyWebhook' | 'publicConfig'>;
type VerifiedWebhookClient = Pick<PayPalOrdersClient, 'getOrder'> & { config: Partial<PayPalOrdersConfig> };
const fail = (code: string, message: string, status = 409) => new BookingDepositOrderError(status, code, message);

function assertAccount(association: any, config: Partial<PayPalOrdersConfig>) {
  if (!config.environment || !config.clientId || association.accountKey !== bookingPayPalAccountKey({
    environment: config.environment, clientId: config.clientId,
  })) throw fail('PAYPAL_ACCOUNT_MISMATCH', 'Account PayPal da verificare con lo studio.', 503);
}
function verifiedCapture(remote: PayPalOrderResponse, association: any, merchantId?: string) {
  assertBookingPayPalOrderIdentity(remote, association.paypalOrderId, association.bookingId, association.depositAmountCents, merchantId);
  const completed = (remote.purchase_units?.[0]?.payments?.captures || []).filter((capture: any) => capture.status === 'COMPLETED');
  if (completed.length > 1) throw fail('PAYPAL_CAPTURE_MISMATCH', 'Sono presenti catture multiple da riconciliare.');
  const capture = extractCompletedCapture(remote);
  if (!capture) return null;
  if (remote.status !== 'COMPLETED' || capture.currency !== 'EUR' || capture.amountCents !== association.depositAmountCents
    || !/^[A-Z0-9-]{8,80}$/i.test(capture.captureId)) {
    throw fail('PAYPAL_CAPTURE_MISMATCH', 'Il pagamento non corrisponde all’acconto atteso.');
  }
  // The common extractor deliberately omits zero fees for legacy flows.
  // Here an explicitly supplied EUR 0.00 means known zero, not unknown.
  const fee = completed[0]?.seller_receivable_breakdown?.paypal_fee;
  if (capture.paypalFeeCents === undefined && fee?.value === '0.00' && fee.currency_code === 'EUR') capture.paypalFeeCents = 0;
  return capture;
}

/** A receipt check may reconcile money already received, but must NEVER POST a capture. */
export async function getBookingDepositStatus(db: Firestore, paypal: BookingCapturePayPalClient, bookingId: string, token: string) {
  const hold = authorizeCheckoutHold((await db.collection(CHECKOUT_HOLDS).doc(bookingId).get()).data(), token);
  return readBookingDepositStatus(db, paypal, bookingId, hold);
}
/** Call only behind authenticated admin middleware. Reads provider state; never captures. */
export async function getBookingDepositStatusForAdmin(db: Firestore, paypal: BookingCapturePayPalClient, bookingId: string) {
  const ref = db.collection(CHECKOUT_HOLDS).doc(bookingId);
  const hold = (await ref.get()).data();
  if (!hold) throw new CheckoutHoldError(404, 'Nessun checkout PayPal associato.');
  let providerStatus: string | null = null;
  const result = await readBookingDepositStatus(db, paypal, bookingId, hold, status => { providerStatus = status; });
  if (providerStatus) await ref.update({ 'paypal.lastVerifiedStatus': providerStatus, 'paypal.lastVerifiedAt': Timestamp.now() });
  return result;
}
async function readBookingDepositStatus(db: Firestore, paypal: BookingCapturePayPalClient, bookingId: string,
  hold: import('firebase-admin/firestore').DocumentData, observe?: (status: string) => void) {
  const summary = { bookingId, campaignId: hold.campaignId,
    flow: hold.kind === 'approved_deposit' ? 'approved' as const : 'immediate' as const,
    dataShootingInizio: hold.dataShootingInizio.toDate(), dataShootingFine: hold.dataShootingFine.toDate() };
  if (!hold.paypal?.orderId) return { ...summary, status: 'unpaid' as const };
  const association = (await db.collection(BOOKING_PAYPAL_ORDERS).doc(hold.paypal.orderId).get()).data();
  if (!association || association.bookingId !== bookingId) throw fail('PAYPAL_ORDER_UNKNOWN', 'Ordine PayPal non associato.');
  if (hold.depositPayment?.paypalCaptureId) {
    if (association.paypalOrderId !== hold.depositPayment.paypalOrderId
      || association.captureId !== hold.depositPayment.paypalCaptureId
      || association.depositAmountCents !== hold.depositPayment.amountCents) {
      throw fail('PAYPAL_CAPTURE_MISMATCH', 'Registrazione dell’acconto da verificare.');
    }
    const payment = depositCaptureResult(bookingId, hold.depositPayment, (await db.collection('bookings').doc(bookingId).get()).data(), true);
    observe?.('COMPLETED');
    return { ...summary, status: payment.status, payment };
  }
  assertAccount(association, paypal.config);
  const remote = await paypal.getOrder(association.paypalOrderId);
  observe?.(remote.status || 'UNKNOWN');
  const completed = verifiedCapture(remote, association, paypal.config.merchantId);
  if (completed) {
    const payment = await recordBookingDeposit(db, completed);
    return { ...summary, status: payment.status, payment };
  }
  const uncertain = !!hold.paypalCaptureAttempt
    || remote.purchase_units?.some(unit => unit.payments?.captures?.some((capture: any) => capture.status === 'PENDING'));
  return { ...summary, status: uncertain ? 'processing' as const : 'unpaid' as const };
}

export async function captureBookingDeposit(db: Firestore, paypal: BookingCapturePayPalClient, bookingId: string, token: string) {
  const ref = db.collection(CHECKOUT_HOLDS).doc(bookingId);
  const attemptId = randomUUID();
  let claimed = false;
  try {
    const hold = authorizeCheckoutHold((await ref.get()).data(), token);
    if (!hold.paypal?.orderId) throw fail('PAYPAL_ORDER_REQUIRED', 'Il pagamento non è stato inizializzato.');
    const orderRef = db.collection(BOOKING_PAYPAL_ORDERS).doc(hold.paypal.orderId);
    const association = (await orderRef.get()).data();
    if (!association || association.bookingId !== bookingId) throw fail('PAYPAL_ORDER_UNKNOWN', 'Ordine PayPal non associato.');
    if (hold.depositPayment?.paypalCaptureId) {
      if (association.paypalOrderId !== hold.depositPayment.paypalOrderId
        || association.captureId !== hold.depositPayment.paypalCaptureId
        || association.depositAmountCents !== hold.depositPayment.amountCents) {
        throw fail('PAYPAL_CAPTURE_MISMATCH', 'Registrazione dell’acconto da verificare.');
      }
      return depositCaptureResult(bookingId, hold.depositPayment, (await db.collection('bookings').doc(bookingId).get()).data(), true);
    }
    assertAccount(association, paypal.config);
    paypal.assertCheckoutConfigured();
    // Reconcile first, including retries after expiry: never ask for another
    // capture when the provider may already have received the money.
    const provider = await paypal.getOrder(association.paypalOrderId);
    const existing = verifiedCapture(provider, association, paypal.config.merchantId);
    if (existing) return await recordBookingDeposit(db, existing);
    activeCheckoutHoldView(bookingId, hold);
    if (provider.status !== 'APPROVED' || provider.purchase_units?.[0]?.payments?.captures?.length) {
      throw fail('PAYPAL_CAPTURE_PENDING', 'Completa l’autorizzazione su PayPal o attendi la verifica del pagamento.');
    }
    const cached = await db.runTransaction(async tx => {
      const fresh = authorizeCheckoutHold((await tx.get(ref)).data(), token);
      const currentOrder = (await tx.get(orderRef)).data();
      const booking = (await tx.get(db.collection('bookings').doc(bookingId))).data();
      if (!currentOrder || currentOrder.bookingId !== bookingId) throw fail('PAYPAL_ORDER_UNKNOWN', 'Ordine PayPal non associato.');
      assertAccount(currentOrder, paypal.config);
      if (fresh.depositPayment?.paypalCaptureId) return depositCaptureResult(bookingId, fresh.depositPayment, booking, true);
      activeCheckoutHoldView(bookingId, fresh);
      if (isApprovedDepositHold(fresh)) assertApprovedDepositMatchesBooking(fresh, booking);
      if (fresh.paypal?.orderId !== association.paypalOrderId || fresh.depositAmountCents !== association.depositAmountCents
        || currentOrder.depositAmountCents !== association.depositAmountCents || currentOrder.state !== 'created') {
        throw fail('PAYPAL_CAPTURE_MISMATCH', 'Ordine PayPal da verificare.');
      }
      if (fresh.paypalCaptureAttempt?.leaseUntil?.toMillis?.() > Date.now()) {
        throw fail('PAYPAL_CAPTURE_RUNNING', 'Verifica del pagamento già in corso. Attendi qualche secondo.');
      }
      tx.update(ref, { paypalCaptureAttempt: { state: 'capturing', attemptId,
        leaseUntil: Timestamp.fromMillis(Date.now() + 60_000) } });
      return null;
    });
    if (cached) return cached;
    claimed = true;
    let requestFailed = false;
    try {
      await paypal.captureOrder(association.paypalOrderId, paypalRequestId('booking-deposit', 'capture', bookingId, association.paypalOrderId));
    } catch { requestFailed = true; } // Timeout/ORDER_ALREADY_CAPTURED requires a canonical read, not a second charge.
    const completed = verifiedCapture(await paypal.getOrder(association.paypalOrderId), association, paypal.config.merchantId);
    if (!completed) throw fail('PAYPAL_CAPTURE_NOT_COMPLETED', 'Pagamento non ancora confermato. Riprova la verifica prima di prenotare di nuovo.', requestFailed ? 503 : 409);
    return await recordBookingDeposit(db, completed);
  } catch (error) {
    if (claimed) await db.runTransaction(async tx => {
      const fresh = (await tx.get(ref)).data();
      if (fresh?.paypalCaptureAttempt?.attemptId === attemptId && !fresh.depositPayment?.paypalCaptureId) {
        tx.update(ref, { paypalCaptureAttempt: { ...fresh.paypalCaptureAttempt, state: 'unknown', leaseUntil: Timestamp.fromMillis(0) } });
      }
    }).catch(() => undefined);
    if (error instanceof CheckoutHoldError) throw error;
    throw fail('PAYPAL_CAPTURE_UNAVAILABLE', 'Non possiamo verificare il pagamento. Riprova da questa prenotazione.', 503);
  }
}

/**
 * INTERNAL bridge: callers MUST verify the PayPal signature first.
 * Existing shop/gift/print endpoints already do so with their own webhook ID.
 */
export async function handleVerifiedBookingPayPalEvent(db: Firestore, paypal: VerifiedWebhookClient, event: any): Promise<Record<string, unknown> | null> {
  if (event?.event_type !== 'PAYMENT.CAPTURE.COMPLETED') return null;
  const capture = captureFromWebhook(event);
  if (!capture || !/^[A-Z0-9-]{8,80}$/i.test(capture.paypalOrderId)) return null;
  const association = (await db.collection(BOOKING_PAYPAL_ORDERS).doc(capture.paypalOrderId).get()).data();
  if (!association) {
    if (capture.customId?.startsWith('booking:')) throw fail('PAYPAL_ASSOCIATION_PENDING', 'Ordine prenotazione da riconciliare.', 503);
    return null; // Unrelated shop/gift/print capture, handled by its existing flow.
  }
  if (typeof event.id !== 'string' || !/^[A-Z0-9-]{1,160}$/i.test(event.id)) throw fail('PAYPAL_EVENT_INVALID', 'Evento PayPal non valido.', 400);
  assertAccount(association, paypal.config);
  const canonical = verifiedCapture(await paypal.getOrder(capture.paypalOrderId), association, paypal.config.merchantId);
  if (!canonical || capture.status !== 'COMPLETED' || canonical.captureId !== capture.captureId
    || canonical.amountCents !== capture.amountCents || canonical.currency !== capture.currency) {
    throw fail('PAYPAL_CAPTURE_MISMATCH', 'La notifica PayPal non corrisponde al pagamento verificato.');
  }
  const rawFee = event.resource?.seller_receivable_breakdown?.paypal_fee;
  const eventFee = capture.paypalFeeCents ?? (rawFee?.value === '0.00' && rawFee.currency_code === 'EUR' ? 0 : undefined);
  if (canonical.paypalFeeCents === undefined && eventFee !== undefined) canonical.paypalFeeCents = eventFee;
  const result = await recordBookingDeposit(db, canonical, event.id);
  return { ok: true, ...result };
}
