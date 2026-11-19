import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { BOOKING_PAYPAL_ORDERS, bookingPayPalAccountKey } from './paypal-deposit-orders.js';
import { captureBookingDeposit } from './deposit-payments.js';
import { hashCheckoutToken } from './checkout-hold-state.js';
import { recordBookingDeposit } from './deposit-payment-ledger.js';
import { recordInPersonDeposit } from './in-person-deposit.js';
import { CHECKOUT_HOLDS } from './slot-reservations.js';

// Se il cliente paga comunque col link PayPal dopo aver pagato di persona, il denaro entra in cassa
// e viene segnalato, ma l'acconto di persona resta la ricevuta della prenotazione e non c'e'
// una seconda conferma.
const now = Date.parse('2030-12-10T08:00:00Z');
const id = 'booking-1';
const start = Timestamp.fromMillis(now + 3 * 86_400_000), end = Timestamp.fromMillis(now + 3 * 86_400_000 + 1_800_000);
const TOKEN = '1'.repeat(64);
const PAYPAL_CONFIG = { environment: 'sandbox' as const, clientId: 'test-public-client', merchantId: 'MERCHANT-TEST' };
const ACCOUNT = bookingPayPalAccountKey(PAYPAL_CONFIG);
let store: ReturnType<typeof reservationDb>;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  store = reservationDb();
  const requestedAt = Timestamp.fromMillis(now - 600_000), expiresAt = Timestamp.fromMillis(now + 3_000_000);
  store.seed('booking_campaigns/camp', { nome: 'Campagna', attiva: true, richiedeAcconto: true, richiedeApprovazione: true, accontoImportoCentesimi: 5000 });
  store.seed(`bookings/${id}`, { campaignId: 'camp', stato: 'in_attesa', statoWorkflow: 'richiesta',
    cliente: { nome: 'Anna', cognome: 'Rossi', email: 'anna@example.test', whatsapp: '1' },
    dataShootingInizio: start, dataShootingFine: end, acconto: 0, transactions: [],
    depositPaymentRequest: { status: 'pending', amountCents: 5000, currency: 'EUR', requestedAt, expiresAt, approvedBy: 'admin' } });
  store.seed(`${CHECKOUT_HOLDS}/${id}`, { bookingId: id, campaignId: 'camp', kind: 'approved_deposit', status: 'active', currency: 'EUR',
    depositAmountCents: 5000, createdAt: requestedAt, expiresAt, dataShootingInizio: start, dataShootingFine: end,
    paypal: { orderId: 'ORD-1', accountKey: ACCOUNT }, tokenHash: hashCheckoutToken(TOKEN),
    draft: { cliente: { nome: 'Anna', cognome: 'Rossi', email: 'anna@example.test', whatsapp: '1' } } });
  store.seed(`${BOOKING_PAYPAL_ORDERS}/ORD-1`, { bookingId: id, paypalOrderId: 'ORD-1', accountKey: ACCOUNT, depositAmountCents: 5000, currency: 'EUR', state: 'created' });
});
afterEach(() => vi.restoreAllMocks());

const lateCapture = () => ({ captureId: 'CAPTURE-LATE-1', paypalOrderId: 'ORD-1', status: 'COMPLETED', currency: 'EUR',
  amountCents: 5000, customId: `booking:${id}`, invoiceId: `BOOKING-${id}`, paypalFeeCents: 200 }) as any;

describe('pagamento PayPal dopo un acconto incassato di persona', () => {
  it('registra il denaro ma non sovrascrive la ricevuta di persona e segnala il caso', async () => {
    const inPerson = await recordInPersonDeposit(store.db, id, { amountCents: 2000, method: 'contante', requestId: 'req-0001' }, 'admin');
    const result = await recordBookingDeposit(store.db, lateCapture());

    expect(result.bookingConfirmed).toBe(true); // era gia' confermata di persona, non una nuova conferma
    const booking = store.value(`bookings/${id}`);
    expect(booking.stato).toBe('confermata');
    expect(booking.depositPayment).toMatchObject({ provider: 'in_person', receiptId: inPerson.receiptId, amountCents: 2000 });
    expect(booking.paymentReviewRequired).toBe(true);
    expect(booking.duplicatePayPalPayment).toMatchObject({ provider: 'paypal', paypalCaptureId: 'CAPTURE-LATE-1', status: 'paid_action_required' });
    // il denaro realmente ricevuto resta tracciato: acconto totale e due righe distinte
    expect(booking.acconto).toBe(70);
    expect(booking.transactions.map((line: any) => line.metodo)).toEqual(['contante', 'paypal']);
  });

  it('in cassa restano due incassi distinti (contanti e PayPal) e la commissione, senza doppioni', async () => {
    await recordInPersonDeposit(store.db, id, { amountCents: 2000, method: 'contante', requestId: 'req-0001' }, 'admin');
    await recordBookingDeposit(store.db, lateCapture());
    await recordBookingDeposit(store.db, lateCapture()); // notifica ripetuta
    const cash = [...store.rows].filter(([key]) => key.startsWith('cashMovements/')).map(([, row]) => row.value);
    expect(cash.filter(row => row.tipo === 'entrata').map(row => row.metodoPagamento).sort()).toEqual(['contante', 'paypal']);
    expect(cash.filter(row => row.tipo === 'uscita')).toHaveLength(1);
    expect(store.value(`bookings/${id}`).transactions).toHaveLength(2);
  });

  it('una notifica PayPal ripetuta non sovrascrive la ricevuta di persona', async () => {
    const inPerson = await recordInPersonDeposit(store.db, id, { amountCents: 2000, method: 'contante', requestId: 'req-0001' }, 'admin');
    await recordBookingDeposit(store.db, lateCapture());
    await recordBookingDeposit(store.db, lateCapture());
    const booking = store.value(`bookings/${id}`);
    expect(booking.depositPayment).toMatchObject({ provider: 'in_person', receiptId: inPerson.receiptId, amountCents: 2000 });
    expect(booking.duplicatePayPalPayment).toMatchObject({ paypalCaptureId: 'CAPTURE-LATE-1' });
    expect(booking.paymentReviewRequired).toBe(true);
    expect(booking.acconto).toBe(70);
  });

  it('la conferma finale non viene accodata una seconda volta', async () => {
    await recordInPersonDeposit(store.db, id, { amountCents: 2000, method: 'contante', requestId: 'req-0001' }, 'admin');
    const job = store.value(`bookingConfirmationJobs/${id}`);
    await recordBookingDeposit(store.db, lateCapture());
    expect(store.value(`bookingConfirmationJobs/${id}`)).toEqual(job);
  });

  it("il link PayPal gia' inviato non puo' piu' catturare: il checkout e' chiuso e PayPal non viene chiamato", async () => {
    await recordInPersonDeposit(store.db, id, { amountCents: 2000, method: 'contante', requestId: 'req-0001' }, 'admin');
    const approvedOrder = { id: 'ORD-1', status: 'APPROVED', purchase_units: [{ reference_id: `booking:${id}`, custom_id: `booking:${id}`,
      invoice_id: `BOOKING-${id}`, payee: { merchant_id: PAYPAL_CONFIG.merchantId }, amount: { value: '50.00', currency_code: 'EUR' } }] };
    const client = { config: { ...PAYPAL_CONFIG }, assertCheckoutConfigured: vi.fn(), getOrder: vi.fn(async () => approvedOrder), captureOrder: vi.fn() } as any;
    await expect(captureBookingDeposit(store.db, client, id, TOKEN)).rejects.toMatchObject({ status: 409 });
    expect(client.captureOrder).not.toHaveBeenCalled();
    expect(store.value(`bookings/${id}`).depositPayment).toMatchObject({ provider: 'in_person' });
  });
});
