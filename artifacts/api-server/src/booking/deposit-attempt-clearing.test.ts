import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { hashCheckoutToken } from './checkout-hold-state.js';
import { BOOKING_PAYPAL_ORDERS, bookingPayPalAccountKey } from './paypal-deposit-orders.js';
import { captureBookingDeposit, getBookingDepositStatus, getBookingDepositStatusForAdmin } from './deposit-payments.js';

// Un tentativo di cattura "incerto" (timeout) blocca l'incasso di persona e un nuovo pagamento. La verifica
// ADMIN lo conclude solo quando PayPal conferma che l'ordine non e' stato catturato e il tentativo e' vecchio.
const now = Date.parse('2030-12-10T08:00:00Z');
const bookingId = 'booking-test-1', orderId = 'ORDER-001', token = '1'.repeat(64);
const holdPath = `bookingCheckoutHolds/${bookingId}`;
const config = { environment: 'sandbox' as const, clientId: 'test-public-client', merchantId: 'MERCHANT-TEST' };
const MIN = 60_000;
let store: ReturnType<typeof reservationDb>;
let order: any;

const unit = (extra: Record<string, unknown> = {}) => ({ reference_id: `booking:${bookingId}`, custom_id: `booking:${bookingId}`,
  invoice_id: `BOOKING-${bookingId}`, payee: { merchant_id: config.merchantId }, amount: { value: '20.00', currency_code: 'EUR' }, ...extra });
const approved = () => ({ id: orderId, status: 'APPROVED', purchase_units: [unit()] });
const withCapture = (status: string) => ({ id: orderId, status: status === 'COMPLETED' ? 'COMPLETED' : 'APPROVED',
  purchase_units: [unit({ payments: { captures: [{ id: 'CAPTURE-001', status, amount: { value: '20.00', currency_code: 'EUR' } }] } })] });

function client() {
  return { config: { ...config }, assertCheckoutConfigured: vi.fn(), createOrder: vi.fn(),
    publicConfig: () => ({ checkoutEnabled: true }), verifyWebhook: vi.fn(),
    getOrder: vi.fn(async () => order), captureOrder: vi.fn(async () => { throw new Error('timeout'); }) } as any;
}
const attempt = (extra: Record<string, unknown> = {}) => ({ state: 'unknown', leaseUntil: Timestamp.fromMillis(0),
  startedAt: Timestamp.fromMillis(now - 11 * MIN), ...extra });
const seedAttempt = (value: Record<string, unknown> | undefined) =>
  store.seed(holdPath, { ...store.value(holdPath), ...(value ? { paypalCaptureAttempt: value } : {}) });

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  store = reservationDb(); order = approved();
  store.seed('booking_campaigns/camp', { nome: 'Campagna' });
  store.seed(holdPath, { bookingId, campaignId: 'camp', status: 'active', currency: 'EUR', depositAmountCents: 2000,
    tokenHash: hashCheckoutToken(token), createdAt: Timestamp.fromMillis(now - 20 * MIN), expiresAt: Timestamp.fromMillis(now + 30 * MIN),
    dataShootingInizio: Timestamp.fromMillis(now + 3_600_000), dataShootingFine: Timestamp.fromMillis(now + 5_400_000),
    paypal: { orderId, accountKey: bookingPayPalAccountKey(config) },
    draft: { cliente: { nome: 'Anna', cognome: 'Rossi', email: 'anna@example.test', whatsapp: '1' }, prodottoId: null, note: '' } });
  store.seed(`${BOOKING_PAYPAL_ORDERS}/${orderId}`, { bookingId, paypalOrderId: orderId, accountKey: bookingPayPalAccountKey(config),
    depositAmountCents: 2000, currency: 'EUR', state: 'created' });
});
afterEach(() => vi.restoreAllMocks());

const admin = () => getBookingDepositStatusForAdmin(store.db, client(), bookingId);

describe('verifica admin: conclusione di un tentativo di cattura rimasto incerto', () => {
  it('lo conclude se PayPal non ha nessuna cattura e il tentativo e\' vecchio (10+ minuti)', async () => {
    seedAttempt(attempt());
    const result = await admin();
    expect(result.status).toBe('unpaid');
    expect(store.value(holdPath).paypalCaptureAttempt).toMatchObject({ state: 'declined', clearedBy: 'admin_verify' });
    expect(store.value(holdPath).paypalCaptureAttempt.clearedAt).toBeDefined();
  });

  it.each([
    ['tentativo recente (5 minuti)', attempt({ startedAt: Timestamp.fromMillis(now - 5 * MIN) })],
    ['tentativo senza data di inizio (storico)', (() => { const { startedAt, ...rest } = attempt(); return rest; })()],
    ['cattura ancora in corso (lease attivo)', attempt({ state: 'capturing', leaseUntil: Timestamp.fromMillis(now + 30_000) })],
  ])('non lo conclude: %s', async (_label, value) => {
    seedAttempt(value as any);
    const result = await admin();
    expect(result.status).toBe('processing');
    expect(store.value(holdPath).paypalCaptureAttempt.state).toBe(value.state);
    expect(store.value(holdPath).paypalCaptureAttempt.clearedBy).toBeUndefined();
  });

  it('non lo conclude se PayPal ha una cattura in sospeso', async () => {
    seedAttempt(attempt()); order = withCapture('PENDING');
    expect((await admin()).status).toBe('processing');
    expect(store.value(holdPath).paypalCaptureAttempt.state).toBe('unknown');
  });

  it('con una cattura completata registra l\'incasso (comportamento invariato) e non conclude nulla', async () => {
    seedAttempt(attempt()); order = withCapture('COMPLETED');
    const result: any = await admin();
    expect(result.status).toBe('paid');
    expect(store.value(holdPath).paypalCaptureAttempt.clearedBy).toBeUndefined();
  });

  it('senza tentativo non scrive nulla', async () => {
    expect((await admin()).status).toBe('unpaid');
    expect(store.value(holdPath).paypalCaptureAttempt).toBeUndefined();
  });

  it('un tentativo gia\' concluso non viene riscritto', async () => {
    seedAttempt({ state: 'declined', leaseUntil: Timestamp.fromMillis(0), startedAt: Timestamp.fromMillis(now - 30 * MIN), declinedAt: Timestamp.fromMillis(now - 29 * MIN) });
    await admin();
    expect(store.value(holdPath).paypalCaptureAttempt.clearedBy).toBeUndefined();
  });

  it('la verifica del cliente (con token) non conclude mai il tentativo', async () => {
    seedAttempt(attempt());
    const result = await getBookingDepositStatus(store.db, client(), bookingId, token);
    expect(result.status).toBe('processing');
    expect(store.value(holdPath).paypalCaptureAttempt.state).toBe('unknown');
  });
});

describe('cattura PayPal: il tentativo registra quando e\' iniziato', () => {
  it('startedAt e\' scritto alla presa in carico e conservato dopo un esito incerto', async () => {
    order = approved();
    await expect(captureBookingDeposit(store.db, client(), bookingId, token)).rejects.toBeDefined();
    expect(store.value(holdPath).paypalCaptureAttempt).toMatchObject({ state: 'unknown' });
    expect(store.value(holdPath).paypalCaptureAttempt.startedAt.toMillis()).toBe(now);
  });
});
