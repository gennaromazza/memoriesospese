import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
vi.mock('./calendar-adapter.js', () => ({
  validateCampaign: vi.fn(), campaignToAvailabilityConfig: vi.fn(), getAllExistingBookingEvents: vi.fn(),
}));
vi.mock('../calendar-engine/index.js', () => ({ getAvailableSlotsForDate: vi.fn() }));
import { createBookingDepositOrder, BOOKING_PAYPAL_ORDERS } from './paypal-deposit-orders.js';
import { CHECKOUT_HOLDS } from './slot-reservations.js';
import { checkoutHoldRouter } from './checkout-hold-routes.js';
import { PayPalOrdersClient, PayPalConfigurationError, paypalRequestId } from '../print-shop/paypal-orders.js';

const now = new Date('2030-12-10T08:00:00Z').getTime();
const bookingId = 'test-booking-1', orderId = 'ORDER-BOOKING-001', token = '1'.repeat(64);
const holdPath = `${CHECKOUT_HOLDS}/${bookingId}`, orderPath = `${BOOKING_PAYPAL_ORDERS}/${orderId}`;
const campaign = { attiva: true, richiedeApprovazione: false, richiedeAcconto: true, accontoImportoCentesimi: 2000 };
function remoteOrder() {
  return { id: orderId, status: 'CREATED', purchase_units: [{
    reference_id: `booking:${bookingId}`, custom_id: `booking:${bookingId}`, invoice_id: `BOOKING-${bookingId}`,
    amount: { currency_code: 'EUR', value: '20.00' },
  }] };
}
let store: ReturnType<typeof reservationDb>;
let client: ReturnType<typeof fakeClient>;
function fakeClient() {
  return {
    config: { environment: 'sandbox' as const, clientId: 'test-public-client' },
    assertCheckoutConfigured: vi.fn(),
    createOrder: vi.fn(async (_input: any, _key?: string) => ({ id: orderId, status: 'CREATED' })),
    getOrder: vi.fn(async (_id: string) => remoteOrder()),
  };
}
function seedHold(patch: any = {}) {
  store.seed(holdPath, {
    bookingId, campaignId: 'campaign-a', status: 'active', currency: 'EUR', depositAmountCents: 2000,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: Timestamp.fromMillis(now + 600_000), createdAt: Timestamp.fromMillis(now),
    dataShootingInizio: Timestamp.fromMillis(now + 3_600_000), dataShootingFine: Timestamp.fromMillis(now + 5_400_000),
    draft: { prodottoId: null }, ...patch,
  });
}
const create = () => createBookingDepositOrder(store.db, client, bookingId, token);
beforeEach(() => {
  store = reservationDb(); client = fakeClient();
  store.seed('booking_campaigns/campaign-a', campaign);
  seedHold();
  vi.spyOn(Date, 'now').mockReturnValue(now);
});
afterEach(() => vi.restoreAllMocks());

describe('ordini PayPal per acconti', () => {
  it('usa soltanto il prezzo server, verifica PayPal e salva l’associazione privata', async () => {
    const result = await create();
    expect(result).toMatchObject({ bookingId, paypalOrderId: orderId, depositAmountCents: 2000, currency: 'EUR' });
    expect(result.expiresAt.getTime()).toBe(now + 600_000);
    expect(client.createOrder).toHaveBeenCalledWith({
      internalOrderId: `booking:${bookingId}`, orderNumber: `BOOKING-${bookingId}`,
      invoiceId: `BOOKING-${bookingId}`, amountCents: 2000, currency: 'EUR',
    }, paypalRequestId('booking-deposit', 'create', bookingId));
    expect(client.getOrder).toHaveBeenCalledWith(orderId);
    expect(store.value(orderPath)).toMatchObject({
      bookingId, campaignId: 'campaign-a', depositAmountCents: 2000, currency: 'EUR', state: 'created', environment: 'sandbox',
    });
    expect(store.value(holdPath).paypal.orderId).toBe(orderId);
    expect(store.value(`bookings/${bookingId}`)).toBeUndefined();
    expect(result).not.toHaveProperty('tokenHash');
  });

  it('riutilizza lo stesso ordine e non prolunga il termine al secondo tentativo', async () => {
    const first = await create();
    vi.mocked(Date.now).mockReturnValue(now + 60_000);
    expect(await create()).toEqual(first);
    expect(client.createOrder).toHaveBeenCalledOnce();
    expect(client.getOrder).toHaveBeenCalledOnce();
  });

  it('due richieste concorrenti non aprono due creazioni PayPal', async () => {
    const results = await Promise.allSettled([create(), create()]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { checkoutCode: 'PAYPAL_ORDER_CREATING' } });
    expect(client.createOrder).toHaveBeenCalledOnce();
  });

  it.each([
    { attiva: false }, { richiedeAcconto: false }, { richiedeApprovazione: true },
    { accontoImportoCentesimi: undefined }, { accontoImportoCentesimi: 0 }, { accontoImportoCentesimi: 2.5 },
  ])('non avvia PayPal con campagna incompatibile: %j', async patch => {
    store.seed('booking_campaigns/campaign-a', { ...campaign, ...patch });
    await expect(create()).rejects.toMatchObject({ status: 400 });
    expect(client.createOrder).not.toHaveBeenCalled();
    expect(store.value(orderPath)).toBeUndefined();
  });
  it('non ricalcola tacitamente un prezzo cambiato e non apre checkout non configurati', async () => {
    store.seed('booking_campaigns/campaign-a', { ...campaign, accontoImportoCentesimi: 3000 });
    await expect(create()).rejects.toMatchObject({ status: 409, checkoutCode: 'DEPOSIT_CHANGED' });
    store.seed('booking_campaigns/campaign-a', campaign);
    client.assertCheckoutConfigured.mockImplementation(() => { throw new PayPalConfigurationError(); });
    await expect(create()).rejects.toBeInstanceOf(PayPalConfigurationError);
    expect(client.createOrder).not.toHaveBeenCalled();
    expect(store.value(holdPath)).not.toHaveProperty('paypal');
  });

  it('rifiuta token errati, checkout chiusi e scadenza esatta prima di chiamare PayPal', async () => {
    await expect(createBookingDepositOrder(store.db, client, bookingId, '2'.repeat(64))).rejects.toMatchObject({ status: 404 });
    seedHold({ status: 'cancelled' });
    await expect(create()).rejects.toMatchObject({ status: 409 });
    seedHold({ expiresAt: Timestamp.fromMillis(now) });
    await expect(create()).rejects.toMatchObject({ status: 410 });
    expect(client.createOrder).not.toHaveBeenCalled();
  });

  it.each(['amount', 'currency', 'custom', 'reference', 'invoice', 'id', 'status'])('non restituisce checkout con risposta PayPal alterata: %s', async field => {
    const remote = remoteOrder();
    if (field === 'amount') remote.purchase_units[0].amount.value = '0.01';
    if (field === 'currency') remote.purchase_units[0].amount.currency_code = 'USD';
    if (field === 'custom') remote.purchase_units[0].custom_id = 'different-booking';
    if (field === 'reference') remote.purchase_units[0].reference_id = 'different-booking';
    if (field === 'invoice') remote.purchase_units[0].invoice_id = 'different-invoice';
    if (field === 'id') remote.id = 'OTHER-ORDER-001';
    if (field === 'status') remote.status = 'COMPLETED';
    client.getOrder.mockResolvedValue(remote);
    await expect(create()).rejects.toMatchObject({ status: 503, checkoutCode: 'PAYPAL_ORDER_MISMATCH' });
    expect(store.value(orderPath)).toBeUndefined();
    expect(store.value(holdPath).status).toBe('active');
  });

  it('dopo timeout ambiguo riprova con la stessa chiave senza creare un altro pagamento', async () => {
    client.createOrder.mockRejectedValueOnce(new Error('timeout'));
    await expect(create()).rejects.toMatchObject({ status: 503, checkoutCode: 'PAYPAL_CREATE_FAILED' });
    expect(store.value(holdPath).status).toBe('active');
    expect(store.value(holdPath).expiresAt.toMillis()).toBe(now + 600_000);
    expect(await create()).toHaveProperty('paypalOrderId', orderId);
    expect(client.createOrder.mock.calls[0][1]).toBe(client.createOrder.mock.calls[1][1]);
  });

  it('registra un ordine remoto tardivo ma non lo presenta come checkout valido', async () => {
    client.createOrder.mockImplementation(async () => {
      vi.mocked(Date.now).mockReturnValue(now + 600_000);
      return { id: orderId, status: 'CREATED' };
    });
    await expect(create()).rejects.toMatchObject({ status: 410 });
    expect(store.value(orderPath)).toMatchObject({ bookingId, state: 'unusable', depositAmountCents: 2000 });
    expect(store.value(holdPath).expiresAt.toMillis()).toBe(now + 600_000);
  });

  it.each(['cancelled', 'campaign_changed'])('non restituisce un checkout se nel frattempo avviene %s', async change => {
    client.createOrder.mockImplementation(async () => {
      if (change === 'cancelled') store.seed(holdPath, { ...store.value(holdPath), status: 'cancelled' });
      else store.seed('booking_campaigns/campaign-a', { ...campaign, accontoImportoCentesimi: 3000 });
      return { id: orderId, status: 'CREATED' };
    });
    await expect(create()).rejects.toMatchObject({ status: 409 });
    expect(store.value(orderPath)).toMatchObject({ bookingId, state: 'unusable', depositAmountCents: 2000 });
  });

  it('una risposta lenta non sovrascrive un incasso già registrato da un altro processo', async () => {
    client.getOrder.mockImplementation(async () => {
      const hold = store.value(holdPath);
      store.seed(orderPath, { bookingId, state: 'captured', depositAmountCents: 2000, currency: 'EUR', accountKey: hold.paypal.accountKey });
      store.seed(holdPath, { ...hold, status: 'consumed', paypal: { ...hold.paypal, state: 'captured', orderId } });
      return remoteOrder();
    });
    await expect(create()).rejects.toMatchObject({ status: 409, checkoutCode: 'PAYPAL_ORDER_CLOSED' });
    expect(store.value(orderPath).state).toBe('captured');
    expect(store.value(holdPath).paypal.state).toBe('captured');
  });

  it('non assegna lo stesso ordine a un’altra prenotazione', async () => {
    store.seed(orderPath, { bookingId: 'other-booking', state: 'created' });
    await expect(create()).rejects.toMatchObject({ status: 409, checkoutCode: 'PAYPAL_ASSOCIATION_CONFLICT' });
    expect(store.value(orderPath).bookingId).toBe('other-booking');
  });

  it('non riapre un’associazione già elaborata e non cambia account PayPal al retry', async () => {
    await create();
    store.seed(orderPath, { ...store.value(orderPath), state: 'captured' });
    await expect(create()).rejects.toMatchObject({ status: 503, checkoutCode: 'PAYPAL_ASSOCIATION_INVALID' });
    expect(store.value(orderPath).state).toBe('captured');
    client.config.clientId = 'different-account';
    await expect(create()).rejects.toMatchObject({ status: 409, checkoutCode: 'PAYPAL_ACCOUNT_CHANGED' });
    expect(client.createOrder).toHaveBeenCalledOnce();
  });

  it('riusa il client PayPal esistente con rete simulata e metadati distinti dallo shop stampe', async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'test-token', expires_in: 3600 }))
      .mockResolvedValueOnce(json({ id: orderId, status: 'CREATED' }))
      .mockResolvedValueOnce(json(remoteOrder()));
    const adapter = new PayPalOrdersClient({
      environment: 'sandbox', clientId: 'test-public-client', clientSecret: 'test-only-secret', webhookId: '',
    }, fetchMock as typeof fetch);
    await createBookingDepositOrder(store.db, adapter, bookingId, token);
    const request = fetchMock.mock.calls[1];
    expect(request[1].headers['PayPal-Request-Id']).toBe(paypalRequestId('booking-deposit', 'create', bookingId));
    expect(JSON.parse(request[1].body).purchase_units[0]).toMatchObject({
      custom_id: `booking:${bookingId}`, amount: { currency_code: 'EUR', value: '20.00' },
    });
    expect(fetchMock.mock.calls[2][0]).toBe(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`);
    expect(fetchMock).toHaveBeenCalledTimes(3); // OAuth, create, get; never capture.
  });
});

const app = express();
app.use(express.json());
app.use('/holds', (req, res, next) => checkoutHoldRouter(store.db, () => client)(req, res, next));
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/holds/${bookingId}/paypal-order`;
afterAll(() => server.close());
const post = (body: any) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
describe('contratto HTTP ordine acconto', () => {
  it('espone soltanto i valori verificati e rifiuta importi o ID PayPal del browser', async () => {
    expect((await post({ token, depositAmountCents: 1, paypalOrderId: 'FORGED-ORDER' })).status).toBe(400);
    expect(client.createOrder).not.toHaveBeenCalled();
    const response = await post({ token });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ bookingId, paypalOrderId: orderId, depositAmountCents: 2000, currency: 'EUR' });
  });
  it('mostra un errore recuperabile se manca la configurazione senza chiamare il provider', async () => {
    client.assertCheckoutConfigured.mockImplementation(() => { throw new PayPalConfigurationError(); });
    expect((await post({ token })).status).toBe(503);
    expect(client.createOrder).not.toHaveBeenCalled();
  });
});
