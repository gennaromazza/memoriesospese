import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { hashCheckoutToken } from './checkout-hold-state.js';
import { bookingPayPalAccountKey, BOOKING_PAYPAL_ORDERS } from './paypal-deposit-orders.js';
import { captureBookingDeposit, getBookingDepositStatus, getBookingDepositStatusForAdmin, handleVerifiedBookingPayPalEvent } from './deposit-payments.js';
import { BOOKING_PAYMENT_CAPTURES } from './deposit-payment-ledger.js';
import { bookingDepositPaymentRouter } from './deposit-payment-routes.js';
import { paypalRequestId, PayPalConfigurationError } from '../print-shop/paypal-orders.js';
import { ShopPaymentService } from '../shop/payments.js';
import { PrintShopService } from '../print-shop/service.js';
import { GiftCardOnlineService } from '../gift-cards/online.js';
import { expireBookingPayments } from './payment-expiry.js';
import { createBookingDepositOrder } from './paypal-deposit-orders.js';
import { releaseCheckoutHold } from './checkout-holds.js';

const now = Date.parse('2030-12-10T08:00:00Z');
const bookingId = 'booking-test-1', orderId = 'ORDER-BOOKING-001', captureId = 'CAPTURE-BOOKING-001', token = '1'.repeat(64);
const holdPath = `bookingCheckoutHolds/${bookingId}`, orderPath = `${BOOKING_PAYPAL_ORDERS}/${orderId}`;
let store: ReturnType<typeof reservationDb>;
let paid: boolean, fee: number | undefined;
let transform: (response: any) => any;
const config = { environment: 'sandbox' as const, clientId: 'test-public-client', merchantId: 'MERCHANT-TEST' };
function remote(completed = paid): any {
  const value = { value: '20.00', currency_code: 'EUR' };
  return transform({
    id: orderId, status: completed ? 'COMPLETED' : 'APPROVED',
    purchase_units: [{
      reference_id: `booking:${bookingId}`, custom_id: `booking:${bookingId}`, invoice_id: `BOOKING-${bookingId}`,
      payee: { merchant_id: config.merchantId }, amount: value,
      ...(completed ? { payments: { captures: [{
        id: captureId, status: 'COMPLETED', amount: value,
        ...(fee === undefined ? {} : { seller_receivable_breakdown: {
          paypal_fee: { value: (fee / 100).toFixed(2), currency_code: 'EUR' },
        } }),
      }] } } : {}),
    }],
  });
}
function event(): any {
  return { id: 'EVENT-BOOKING-001', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {
    ...remote(true).purchase_units[0].payments.captures[0], custom_id: `booking:${bookingId}`,
    supplementary_data: { related_ids: { order_id: orderId } },
  } };
}
function fakeClient() {
  return {
    config: { ...config }, assertCheckoutConfigured: vi.fn(), createOrder: vi.fn(),
    publicConfig: () => ({ checkoutEnabled: true, enabled: true, webhookReady: true, environment: config.environment, clientId: config.clientId }),
    verifyWebhook: vi.fn(async () => true), getOrder: vi.fn(async (_id: string) => remote()),
    captureOrder: vi.fn(async (_id: string, _key: string) => { paid = true; return remote(); }),
  };
}
let client: ReturnType<typeof fakeClient>;
const count = (name: string) => [...store.rows.keys()].filter(key => key.startsWith(`${name}/`)).length;
const capture = () => captureBookingDeposit(store.db, client, bookingId, token);
function approvedBooking() {
  const hold = store.value(holdPath);
  const expiresAt = Timestamp.fromMillis(now + 3_600_000);
  const dataShootingInizio = Timestamp.fromMillis(now + 7_200_000), dataShootingFine = Timestamp.fromMillis(now + 9_000_000);
  store.seed('booking_campaigns/campaign-a', { ...store.value('booking_campaigns/campaign-a'),
    attiva: true, richiedeAcconto: true, richiedeApprovazione: true, accontoImportoCentesimi: 9999 });
  store.seed(holdPath, { ...hold, kind: 'approved_deposit', expiresAt, dataShootingInizio, dataShootingFine });
  store.seed(`bookings/${bookingId}`, { campaignId: hold.campaignId, stato: 'in_attesa',
    cliente: { ...hold.draft.cliente, nome: 'Nome aggiornato' }, dataShootingInizio, dataShootingFine,
    acconto: 0, transactions: [], createdAt: Timestamp.fromMillis(now - 60_000), note: 'Nota amministrativa aggiornata',
    depositPaymentRequest: { status: 'pending', amountCents: hold.depositAmountCents, currency: 'EUR',
      requestedAt: hold.createdAt, expiresAt, approvedBy: 'test-admin' } });
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  store = reservationDb(); paid = false; fee = 95; transform = response => response; client = fakeClient();
  store.seed('booking_campaigns/campaign-a', { nome: 'Campagna test', temaStagionale: 'natale' });
  store.seed(holdPath, { bookingId, campaignId: 'campaign-a', status: 'active', currency: 'EUR',
    depositAmountCents: 2000, tokenHash: hashCheckoutToken(token), createdAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + 600_000), dataShootingInizio: Timestamp.fromMillis(now + 3_600_000),
    dataShootingFine: Timestamp.fromMillis(now + 5_400_000),
    draft: { cliente: { nome: 'Test', cognome: 'Cliente', email: 'test@example.com', whatsapp: '' }, prodottoId: null, note: '' },
    paypal: { orderId, accountKey: bookingPayPalAccountKey(config), state: 'created' },
  });
  store.seed(orderPath, { bookingId, campaignId: 'campaign-a', paypalOrderId: orderId, depositAmountCents: 2000,
    currency: 'EUR', state: 'created', accountKey: bookingPayPalAccountKey(config) });
});
it('lets an admin read PayPal without creating or capturing an order', async () => {
  expect(await getBookingDepositStatusForAdmin(store.db, client, bookingId)).toMatchObject({ status: 'unpaid' });
  expect(client.getOrder).toHaveBeenCalledTimes(1);
  expect(client.createOrder).not.toHaveBeenCalled();
  expect(client.captureOrder).not.toHaveBeenCalled();
  expect(store.value(holdPath).paypal.lastVerifiedStatus).toBe('APPROVED');
  expect(count('bookings')).toBe(0);
});
it('reconciles money already received for an admin without charging again, including repeated checks', async () => {
  paid = true;
  expect(await getBookingDepositStatusForAdmin(store.db, client, bookingId)).toMatchObject({ status: 'paid' });
  const movements = count('cashMovements');
  client.getOrder.mockRejectedValueOnce(new Error('Provider unavailable'));
  expect(await getBookingDepositStatusForAdmin(store.db, client, bookingId)).toMatchObject({ status: 'paid' });
  expect(client.getOrder).toHaveBeenCalledTimes(1);
  expect(client.captureOrder).not.toHaveBeenCalled();
  expect(client.createOrder).not.toHaveBeenCalled();
  expect(count('bookings')).toBe(1);
  expect(count('cashMovements')).toBe(movements);
});
it('confirms an owned approved booking at the frozen amount, preserving admin edits and idempotent accounting', async () => {
  approvedBooking();
  expect(await createBookingDepositOrder(store.db, client, bookingId, token)).toMatchObject({ paypalOrderId: orderId });
  expect(await capture()).toMatchObject({ status: 'paid', bookingConfirmed: true });
  const booking = store.value(`bookings/${bookingId}`);
  expect(booking).toMatchObject({ stato: 'confermata', acconto: 20, cliente: { nome: 'Nome aggiornato' },
    note: 'Nota amministrativa aggiornata', depositPaymentRequest: { status: 'paid', amountCents: 2000 } });
  expect(booking.createdAt.toMillis()).toBe(now - 60_000);
  expect(booking.transactions).toHaveLength(1);
  await capture();
  expect(store.value(`bookings/${bookingId}`).transactions).toHaveLength(1);
  expect(count(BOOKING_PAYMENT_CAPTURES)).toBe(1);
});
it.each(['amount', 'cash', 'receipt'] as const)('does not charge an approved request with conflicting server payment data: %s', async conflict => {
  approvedBooking();
  const booking = store.value(`bookings/${bookingId}`);
  store.seed(`bookings/${bookingId}`, { ...booking, ...(conflict === 'amount'
    ? { depositPaymentRequest: { ...booking.depositPaymentRequest, amountCents: 5000 } }
    : conflict === 'cash' ? { acconto: 20 }
      : { depositPayment: { status: 'paid', paypalCaptureId: 'ANOTHER-RECEIPT' } }) });
  await expect(capture()).rejects.toMatchObject({ status: 409 });
  expect(client.captureOrder).not.toHaveBeenCalled();
});
it('records a late approved capture without confirming or losing the existing booking money', async () => {
  approvedBooking(); paid = true;
  vi.mocked(Date.now).mockReturnValue(now + 3_600_000);
  expect(await capture()).toMatchObject({ status: 'paid_action_required', bookingConfirmed: false });
  expect(store.value(`bookings/${bookingId}`)).toMatchObject({ stato: 'annullata', acconto: 20,
    paymentReviewRequired: true, depositPaymentRequest: { status: 'paid' } });
  expect(store.value(`bookings/${bookingId}`).transactions).toHaveLength(1);
  await expireBookingPayments(store.db);
  expect(store.value(`bookings/${bookingId}`).acconto).toBe(20);
});
it('does not release an approved one-hour reservation when PayPal is cancelled', async () => {
  approvedBooking();
  await expect(releaseCheckoutHold(store.db, bookingId, token)).rejects.toMatchObject({ status: 409 });
  expect(store.value(holdPath).status).toBe('active');
  expect(store.value(`bookings/${bookingId}`).stato).toBe('in_attesa');
});
afterEach(() => vi.restoreAllMocks());

describe('cattura e cassa acconti', () => {
  it('la verifica non addebita un ordine approvato e riconcilia solo un incasso già completato', async () => {
    expect(await getBookingDepositStatus(store.db, client, bookingId, token)).toMatchObject({ status: 'unpaid' });
    expect(client.captureOrder).not.toHaveBeenCalled();
    paid = true;
    expect(await getBookingDepositStatus(store.db, client, bookingId, token)).toMatchObject({
      status: 'paid', payment: { bookingConfirmed: true },
    });
    expect(client.captureOrder).not.toHaveBeenCalled();
  });
  it('la verifica richiede il token proprietario e non chiama PayPal per token errati', async () => {
    await expect(getBookingDepositStatus(store.db, client, bookingId, '0'.repeat(64))).rejects.toMatchObject({ status: 404 });
    expect(client.getOrder).not.toHaveBeenCalled();
    expect(client.captureOrder).not.toHaveBeenCalled();
  });
  it('non tratta come sicuramente non pagata una cattura dall’esito ancora incerto', async () => {
    store.seed(holdPath, { ...store.value(holdPath), paypalCaptureAttempt: { state: 'unknown' } });
    expect(await getBookingDepositStatus(store.db, client, bookingId, token)).toMatchObject({ status: 'processing' });
    expect(client.captureOrder).not.toHaveBeenCalled();
  });
  it('riconcilia un incasso dopo la pulizia senza confermare neppure uno slot rimasto libero', async () => {
    vi.mocked(Date.now).mockReturnValue(now + 600_000);
    await expireBookingPayments(store.db);
    expect(store.value(holdPath).status).toBe('expired');
    paid = true;
    expect(await capture()).toMatchObject({ status: 'paid_action_required', bookingConfirmed: false });
    expect(await capture()).toMatchObject({ status: 'paid_action_required', duplicate: true });
    expect(store.value(holdPath).paymentReviewRequired).toBe(true);
    expect(store.value(`bookings/${bookingId}`)).toBeUndefined();
    expect(count('cashMovements')).toBe(2);
    expect(client.captureOrder).not.toHaveBeenCalled();
  });
  it('rifiuta un nuovo addebito dopo la pulizia mantenendo lo stesso errore di checkout scaduto', async () => {
    vi.mocked(Date.now).mockReturnValue(now + 600_000);
    await expireBookingPayments(store.db);
    await expect(capture()).rejects.toMatchObject({ status: 410 });
    expect(client.captureOrder).not.toHaveBeenCalled();
    expect(count('cashMovements')).toBe(0);
  });
  it('conferma lo slot, registra l’acconto lordo e distingue la commissione PayPal', async () => {
    expect(await capture()).toMatchObject({ bookingId, status: 'paid', amountCents: 2000, paypalFeeCents: 95, bookingConfirmed: true, duplicate: false });
    expect(client.captureOrder).toHaveBeenCalledWith(orderId, paypalRequestId('booking-deposit', 'capture', bookingId, orderId));
    const booking = store.value(`bookings/${bookingId}`);
    expect(booking).toMatchObject({ stato: 'confermata', acconto: 20, metodoPagamento: 'paypal',
      prodottoId: null, depositPayment: { paypalCaptureId: captureId, netCents: 1905 }, calendarSyncPending: true });
    expect(booking.transactions).toHaveLength(1);
    expect(store.value(`bookingConfirmationJobs/${bookingId}`)).toMatchObject({
      status: 'pending', attempts: 0, captureId, amountCents: 2000,
    });
    expect(booking).not.toHaveProperty('totale'); // Product may still be chosen in studio.
    expect(store.value(holdPath).status).toBe('consumed');
    const rows = [...store.rows].filter(([path]) => path.startsWith('cashMovements/')).map(([, row]) => row.value);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ tipo: 'entrata', importo: 20, origine: 'booking', bookingId }),
      expect.objectContaining({ tipo: 'uscita', importo: 0.95, movementRole: 'payment_fee' }),
    ]));
  });
  it('retry e webhook duplicati producono un solo incasso e una sola transazione', async () => {
    await capture();
    store.seed(`bookingConfirmationJobs/${bookingId}`, { ...store.value(`bookingConfirmationJobs/${bookingId}`), status: 'sent' });
    expect(await capture()).toMatchObject({ duplicate: true, bookingConfirmed: true });
    await Promise.all([
      handleVerifiedBookingPayPalEvent(store.db, client, event()),
      handleVerifiedBookingPayPalEvent(store.db, client, event()),
    ]);
    await handleVerifiedBookingPayPalEvent(store.db, client, { ...event(), id: 'EVENT-OTHER' });
    expect(client.captureOrder).toHaveBeenCalledOnce();
    expect(count(BOOKING_PAYMENT_CAPTURES)).toBe(1);
    expect(count('cashMovements')).toBe(2);
    expect(store.value(`bookings/${bookingId}`).transactions).toHaveLength(1);
    expect(store.value(`bookingConfirmationJobs/${bookingId}`).status).toBe('sent');
  });
  it('due catture concorrenti non addebitano due volte', async () => {
    const results = await Promise.allSettled([capture(), capture()]);
    expect(results.some(result => result.status === 'fulfilled')).toBe(true);
    expect(client.captureOrder).toHaveBeenCalledOnce();
    expect(count(BOOKING_PAYMENT_CAPTURES)).toBe(1);
    expect(count('cashMovements')).toBe(2);
  });
  it('mostra un pagamento già registrato anche se PayPal diventa non disponibile', async () => {
    await capture();
    client.assertCheckoutConfigured.mockImplementation(() => { throw new PayPalConfigurationError(); });
    client.config.clientId = 'rotated-public-client';
    expect(await capture()).toMatchObject({ duplicate: true, status: 'paid', bookingConfirmed: true });
    expect(client.captureOrder).toHaveBeenCalledOnce();
  });
  it('riconcilia un timeout dopo l’incasso senza fare un secondo addebito', async () => {
    client.captureOrder.mockImplementation(async () => { paid = true; throw new Error('lost response'); });
    expect(await capture()).toMatchObject({ status: 'paid' });
    expect(client.captureOrder).toHaveBeenCalledOnce();
    expect(count('cashMovements')).toBe(2);
  });
  it('se la rilettura fallisce riprende la verifica senza ripetere l’addebito', async () => {
    client.getOrder.mockResolvedValueOnce(remote(false)).mockRejectedValueOnce(new Error('network'));
    await expect(capture()).rejects.toMatchObject({ status: 503 });
    expect(count('cashMovements')).toBe(0);
    expect(await capture()).toMatchObject({ status: 'paid' });
    expect(client.captureOrder).toHaveBeenCalledOnce();
  });
  it('un retry dopo esito ambiguo mantiene la stessa chiave PayPal e la stessa scadenza', async () => {
    client.captureOrder.mockRejectedValueOnce(new Error('timeout'));
    await expect(capture()).rejects.toMatchObject({ status: 503 });
    expect(await capture()).toMatchObject({ status: 'paid' });
    expect(client.captureOrder.mock.calls[0][1]).toBe(client.captureOrder.mock.calls[1][1]);
    expect(store.value(holdPath).expiresAt.toMillis()).toBe(now + 600_000);
  });
  it.each(['amount', 'currency', 'status', 'custom', 'invoice', 'merchant', 'multiple'])('rifiuta cattura errata: %s', async field => {
    transform = response => {
      if (response.status !== 'COMPLETED') return response;
      const unit = response.purchase_units[0], cap = unit.payments.captures[0];
      if (field === 'amount') cap.amount = { value: '0.01', currency_code: 'EUR' };
      if (field === 'currency') cap.amount = { value: '20.00', currency_code: 'USD' };
      if (field === 'status') cap.status = 'DENIED';
      if (field === 'custom') unit.custom_id = 'another-booking';
      if (field === 'invoice') unit.invoice_id = 'another-invoice';
      if (field === 'merchant') unit.payee.merchant_id = 'another-merchant';
      if (field === 'multiple') unit.payments.captures.push({ ...cap, id: 'CAPTURE-SECOND' });
      return response;
    };
    await expect(capture()).rejects.toBeInstanceOf(Error);
    expect(count('bookings')).toBe(0);
    expect(count('cashMovements')).toBe(0);
  });
  it('non cattura senza token, senza associazione o con configurazione mancante', async () => {
    await expect(captureBookingDeposit(store.db, client, bookingId, '2'.repeat(64))).rejects.toMatchObject({ status: 404 });
    client.assertCheckoutConfigured.mockImplementationOnce(() => { throw new PayPalConfigurationError(); });
    await expect(capture()).rejects.toMatchObject({ status: 503 });
    store.seed(holdPath, { ...store.value(holdPath), paypal: { orderId: 'OTHER-ORDER-001' } });
    await expect(capture()).rejects.toMatchObject({ status: 409 });
    expect(client.captureOrder).not.toHaveBeenCalled();
    expect(count('cashMovements')).toBe(0);
  });
  it('non attribuisce zero a una commissione sconosciuta e la aggiunge una sola volta quando arriva', async () => {
    fee = undefined;
    expect(await capture()).not.toHaveProperty('paypalFeeCents');
    expect(count('cashMovements')).toBe(1);
    const feeEvent = event();
    feeEvent.resource.seller_receivable_breakdown = { paypal_fee: { value: '0.95', currency_code: 'EUR' } };
    await handleVerifiedBookingPayPalEvent(store.db, client, feeEvent);
    await handleVerifiedBookingPayPalEvent(store.db, client, feeEvent);
    expect(count('cashMovements')).toBe(2);
    expect(store.value(`bookings/${bookingId}`).depositPayment.paypalFeeCents).toBe(95);
    expect(store.value(`bookings/${bookingId}`).transactions).toHaveLength(1);
  });
  it('distingue una commissione esplicita di zero da un dato mancante', async () => {
    fee = 0;
    expect(await capture()).toMatchObject({ paypalFeeCents: 0 });
    expect(count('cashMovements')).toBe(1);
  });
  it('usa lo snapshot del pagamento, non il nuovo listino della campagna', async () => {
    store.seed('booking_campaigns/campaign-a', { attiva: false, accontoImportoCentesimi: 5000 });
    expect(await capture()).toMatchObject({ amountCents: 2000, status: 'paid' });
  });
  it('una cattura già avvenuta fuori tempo registra denaro ma non riassegna lo slot', async () => {
    paid = true;
    vi.mocked(Date.now).mockReturnValue(now + 600_000);
    store.seed('bookings/other-booking', { stato: 'confermata', dataShootingInizio: store.value(holdPath).dataShootingInizio,
      dataShootingFine: store.value(holdPath).dataShootingFine });
    expect(await capture()).toMatchObject({ status: 'paid_action_required', bookingConfirmed: false });
    expect(store.value(`bookings/${bookingId}`)).toBeUndefined();
    expect(count('cashMovements')).toBe(2);
    expect(client.captureOrder).not.toHaveBeenCalled();
  });
  it('non avvia una cattura per un checkout scaduto ancora non pagato', async () => {
    vi.mocked(Date.now).mockReturnValue(now + 600_000);
    await expect(capture()).rejects.toMatchObject({ status: 410 });
    expect(client.captureOrder).not.toHaveBeenCalled();
    expect(count('cashMovements')).toBe(0);
  });
  it('non conferma lo slot se la riserva scade durante la risposta PayPal', async () => {
    client.captureOrder.mockImplementation(async () => {
      paid = true; vi.mocked(Date.now).mockReturnValue(now + 600_000); return remote();
    });
    expect(await capture()).toMatchObject({ status: 'paid_action_required', bookingConfirmed: false });
    expect(count('cashMovements')).toBe(2);
    expect(count('bookings')).toBe(0);
  });
});

describe('webhook verificati e percorsi già configurati', () => {
  it.each(['stampe', 'shop', 'gift'])('il webhook %s inoltra gli acconti dopo la verifica della firma', async kind => {
    paid = true;
    const deps = { db: store.db, paypal: client };
    const result = kind === 'stampe' ? await new PrintShopService(deps as any).paypalWebhook({}, event())
      : kind === 'shop' ? await new ShopPaymentService(deps as any).paypalWebhook({}, event())
        : await new GiftCardOnlineService({ ...deps, webhook: client } as any).webhook({}, event());
    expect(result).toMatchObject({ bookingId, status: 'paid', ok: true });
    expect(client.verifyWebhook).toHaveBeenCalledOnce();
    expect(count('cashMovements')).toBe(2);
  });
  it('non conferma una notifica con importo diverso dal dato canonico', async () => {
    paid = true;
    const wrong = event(); wrong.resource.amount = { value: '0.01', currency_code: 'EUR' };
    await expect(handleVerifiedBookingPayPalEvent(store.db, client, wrong)).rejects.toMatchObject({ checkoutCode: 'PAYPAL_CAPTURE_MISMATCH' });
    expect(count('cashMovements')).toBe(0);
  });
});

const app = express();
app.use(express.json());
app.use('/booking', (req, res, next) => bookingDepositPaymentRouter(store.db, () => client)(req, res, next));
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/booking`;
afterAll(() => server.close());
const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
describe('contratto HTTP cattura', () => {
  it('espone solo la configurazione pubblica e una verifica che non addebita', async () => {
    const configResponse = await fetch(`${base}/paypal/config`);
    expect(configResponse.headers.get('Cache-Control')).toBe('no-store');
    expect(await configResponse.json()).toEqual({ enabled: true, clientId: config.clientId, environment: 'sandbox', currency: 'EUR' });
    const response = await post(`/v2/checkout-holds/${bookingId}/paypal-status`, { token });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ status: 'unpaid', dataShootingInizio: expect.any(String) });
    expect(client.captureOrder).not.toHaveBeenCalled();
  });
  it('non accetta importi o token errati nella verifica', async () => {
    const path = `/v2/checkout-holds/${bookingId}/paypal-status`;
    expect((await post(path, { token, amountCents: 1 })).status).toBe(400);
    expect((await post(path, { token: '0'.repeat(64) })).status).toBe(404);
    expect(client.getOrder).not.toHaveBeenCalled();
  });
  it('rifiuta valori finanziari dal browser e accetta solo il token', async () => {
    const path = `/v2/checkout-holds/${bookingId}/paypal-capture`;
    expect((await post(path, { token, amountCents: 1, paypalOrderId: 'FORGED-ORDER' })).status).toBe(400);
    expect(client.captureOrder).not.toHaveBeenCalled();
    expect((await post(path, { token })).status).toBe(200);
  });
  it('rifiuta firme webhook false senza registrare denaro', async () => {
    client.verifyWebhook.mockResolvedValue(false);
    expect((await post('/paypal/webhook', event())).status).toBe(401);
    expect(client.getOrder).not.toHaveBeenCalled();
    expect(count('cashMovements')).toBe(0);
  });
});
