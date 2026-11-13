import { createHash, randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { BookingDepositPayPalOrder } from '@workspace/api-zod';
import {
  PayPalOrdersClient, loadPayPalOrdersConfig, paypalRequestId, paypalValueToCents,
  type PayPalOrdersConfig, type PayPalOrderResponse,
} from '../print-shop/paypal-orders.js';
import { authorizeCheckoutHold, activeCheckoutHoldView, CheckoutHoldError } from './checkout-holds.js';
import { CHECKOUT_HOLDS, checkoutHoldBlocksSlot } from './slot-reservations.js';
import { logger } from '../lib/logger.js';

export const BOOKING_PAYPAL_ORDERS = 'bookingPayPalOrders';
const CREATE_LEASE_MS = 60_000;
export type BookingPayPalClient = Pick<PayPalOrdersClient, 'createOrder' | 'getOrder' | 'assertCheckoutConfigured'> & {
  config: Pick<PayPalOrdersConfig, 'environment' | 'clientId' | 'merchantId'>;
};
let defaultClient: PayPalOrdersClient | undefined;
export const bookingPayPalClient = (): BookingPayPalClient =>
  defaultClient ??= new PayPalOrdersClient(loadPayPalOrdersConfig());

export class BookingDepositOrderError extends CheckoutHoldError {
  constructor(status: number, readonly checkoutCode: string, message: string) { super(status, message); }
}
function validateDeposit(campaign: FirebaseFirestore.DocumentData | undefined, amount: number) {
  if (!campaign?.attiva || campaign.richiedeAcconto !== true || campaign.richiedeApprovazione !== false
    || !Number.isSafeInteger(campaign.accontoImportoCentesimi) || campaign.accontoImportoCentesimi <= 0) {
    throw new BookingDepositOrderError(400, 'DEPOSIT_NOT_AVAILABLE', 'La campagna non consente questo checkout con acconto.');
  }
  if (campaign.accontoImportoCentesimi !== amount) {
    throw new BookingDepositOrderError(409, 'DEPOSIT_CHANGED', 'L’acconto della campagna è cambiato. Scegli nuovamente lo slot.');
  }
}

function assertRemoteOrder(order: PayPalOrderResponse, orderId: string, bookingId: string, amount: number, merchantId?: string) {
  const unit = order.purchase_units?.[0];
  if (order.id !== orderId || !['CREATED', 'APPROVED', 'PAYER_ACTION_REQUIRED'].includes(order.status || '')
    || order.purchase_units?.length !== 1
    || unit?.reference_id !== `booking:${bookingId}` || unit?.custom_id !== `booking:${bookingId}`
    || unit?.invoice_id !== `BOOKING-${bookingId}`
    || unit?.amount?.currency_code !== 'EUR' || paypalValueToCents(unit?.amount?.value) !== amount
    || (merchantId && unit?.payee?.merchant_id !== merchantId)) {
    throw new BookingDepositOrderError(503, 'PAYPAL_ORDER_MISMATCH', 'L’ordine PayPal non è verificabile. Riprova da questa prenotazione.');
  }
}
function response(bookingId: string, hold: FirebaseFirestore.DocumentData): BookingDepositPayPalOrder {
  const view = activeCheckoutHoldView(bookingId, hold);
  return { bookingId, paypalOrderId: hold.paypal.orderId, depositAmountCents: view.depositAmountCents,
    currency: 'EUR', expiresAt: view.expiresAt };
}

/** No capture, booking confirmation, email or deadline renewal occurs here. */
export async function createBookingDepositOrder(
  db: Firestore, paypal: BookingPayPalClient, bookingId: string, token: string,
): Promise<BookingDepositPayPalOrder> {
  const ref = db.collection(CHECKOUT_HOLDS).doc(bookingId);
  const attemptId = randomUUID();
  const accountKey = createHash('sha256').update(`${paypal.config.environment}:${paypal.config.clientId}`).digest('hex');
  const requestId = paypalRequestId('booking-deposit', 'create', bookingId);
  const claim = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const data = authorizeCheckoutHold(snapshot.data(), token);
    const campaign = await transaction.get(db.collection('booking_campaigns').doc(data.campaignId));
    const view = activeCheckoutHoldView(bookingId, data);
    if (data.currency !== 'EUR') throw new BookingDepositOrderError(503, 'DEPOSIT_CURRENCY_INVALID', 'Acconto da verificare con lo studio.');
    validateDeposit(campaign.data(), view.depositAmountCents);
    paypal.assertCheckoutConfigured();
    if (data.paypal?.accountKey && data.paypal.accountKey !== accountKey) {
      throw new BookingDepositOrderError(409, 'PAYPAL_ACCOUNT_CHANGED', 'La configurazione PayPal è cambiata. Scegli nuovamente lo slot.');
    }
    if (data.paypal?.orderId) {
      const association = await transaction.get(db.collection(BOOKING_PAYPAL_ORDERS).doc(data.paypal.orderId));
      const saved = association.data();
      if (saved?.bookingId !== bookingId || saved?.depositAmountCents !== view.depositAmountCents
        || saved?.currency !== 'EUR' || saved?.accountKey !== accountKey || saved?.state !== 'created') {
        throw new BookingDepositOrderError(503, 'PAYPAL_ASSOCIATION_INVALID', 'Associazione PayPal da verificare con lo studio.');
      }
      return { cached: true as const, result: response(bookingId, data) };
    }
    if (data.paypal?.state === 'creating' && data.paypal.leaseUntil?.toMillis?.() > Date.now()) {
      throw new BookingDepositOrderError(409, 'PAYPAL_ORDER_CREATING', 'Stiamo preparando PayPal. Riprova tra pochi secondi.');
    }
    transaction.update(ref, { paypal: {
      state: 'creating', attemptId, requestId, accountKey, environment: paypal.config.environment,
      leaseUntil: Timestamp.fromMillis(Date.now() + CREATE_LEASE_MS),
    } });
    return { cached: false as const, amount: view.depositAmountCents };
  });
  if (claim.cached) return claim.result;

  try {
    const created = await paypal.createOrder({
      internalOrderId: `booking:${bookingId}`, orderNumber: `BOOKING-${bookingId}`,
      invoiceId: `BOOKING-${bookingId}`, amountCents: claim.amount, currency: 'EUR',
    }, requestId);
    if (typeof created?.id !== 'string' || !/^[A-Z0-9-]{8,80}$/i.test(created.id)) {
      throw new BookingDepositOrderError(503, 'PAYPAL_ORDER_MISMATCH', 'PayPal non ha restituito un ordine valido.');
    }
    // Create can return a minimal representation: verify the canonical order.
    const remote = await paypal.getOrder(created.id);
    assertRemoteOrder(remote, created.id, bookingId, claim.amount, paypal.config.merchantId);
    const saved = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const data = authorizeCheckoutHold(snapshot.data(), token);
      const campaign = await transaction.get(db.collection('booking_campaigns').doc(data.campaignId));
      const orderRef = db.collection(BOOKING_PAYPAL_ORDERS).doc(created.id);
      const previous = await transaction.get(orderRef);
      const previousData = previous.data();
      if ((previous.exists && (previousData?.bookingId !== bookingId || previousData?.depositAmountCents !== claim.amount
          || previousData?.currency !== 'EUR' || previousData?.accountKey !== accountKey))
        || (data.paypal?.orderId && data.paypal.orderId !== created.id)
        || data.paypal?.requestId !== requestId || data.paypal?.accountKey !== accountKey) {
        throw new BookingDepositOrderError(409, 'PAYPAL_ASSOCIATION_CONFLICT', 'Ordine PayPal da verificare con lo studio.');
      }
      if (previous.exists && previousData?.state !== 'created') {
        throw new BookingDepositOrderError(409, 'PAYPAL_ORDER_CLOSED', 'Ordine PayPal già elaborato o da riconciliare con lo studio.');
      }
      let campaignError: CheckoutHoldError | null = null;
      try { validateDeposit(campaign.data(), claim.amount); }
      catch (error) { if (error instanceof CheckoutHoldError) campaignError = error; else throw error; }
      const usable = checkoutHoldBlocksSlot(data) && !campaignError;
      const paypalData = { state: 'created', orderId: created.id, requestId, accountKey,
        environment: paypal.config.environment, verifiedAt: Timestamp.now() };
      // Persist even late/cancelled results so reconciliation never loses a remote order.
      if (!previous.exists) {
        transaction.set(orderRef, {
          bookingId, campaignId: data.campaignId, paypalOrderId: created.id, depositAmountCents: claim.amount,
          currency: 'EUR', environment: paypal.config.environment, accountKey, requestId,
          state: usable ? 'created' : 'unusable', providerStatus: remote.status!, verifiedAt: Timestamp.now(),
        });
      }
      // A slower duplicate response must not reset later payment/reconciliation states.
      if (!data.paypal?.orderId) transaction.update(ref, { paypal: paypalData });
      return { hold: data.paypal?.orderId ? data : { ...data, paypal: paypalData }, campaignError };
    });
    if (saved.campaignError) throw saved.campaignError;
    return response(bookingId, saved.hold); // Rechecks expiry/cancellation before returning a usable checkout.
  } catch (error) {
    // A timeout may conceal a successfully created remote order. Retrying uses
    // the SAME PayPal request ID; never release the slot or generate another ID.
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      if (data?.paypal?.attemptId === attemptId && !data.paypal.orderId) {
        transaction.update(ref, { paypal: { ...data.paypal, state: 'retryable_error',
          leaseUntil: Timestamp.fromMillis(0), failedAt: Timestamp.now() } });
      }
    }).catch(() => logger.error({ bookingId }, 'Stato creazione PayPal da riconciliare'));
    if (error instanceof CheckoutHoldError) throw error;
    logger.error({ bookingId }, 'Creazione ordine PayPal non completata');
    throw new BookingDepositOrderError(503, 'PAYPAL_CREATE_FAILED', 'Non è stato possibile avviare PayPal. Riprova da questa prenotazione.');
  }
}
