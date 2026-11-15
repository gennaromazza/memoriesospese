import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { buildAdminBookingPayment, getAdminBookingPaymentSnapshot, listAdminBookingCheckouts } from './admin-payments.js';
import { bookingAdminPaymentRouter } from './admin-payment-routes.js';

const now = Date.parse('2030-12-01T08:00:00Z'), id = 'test-booking';
let store: ReturnType<typeof reservationDb>, server: Server | undefined;
const resendBoundary = vi.fn(async () => { throw new Error('Mocked delivery unavailable'); });
const stamp = (offset: number) => Timestamp.fromMillis(now + offset);
const campaign = { nome: 'Natale test', attiva: true, richiedeApprovazione: true, richiedeAcconto: true, accontoImportoCentesimi: 9900 };
const booking = () => ({ campaignId: 'camp', stato: 'in_attesa', acconto: 0, cliente: { nome: 'Cliente', cognome: 'Test', email: 'cliente@example.test' },
  dataShootingInizio: stamp(7_200_000), dataShootingFine: stamp(9_000_000),
  depositPaymentRequest: { status: 'pending', amountCents: 2500, currency: 'EUR', requestedAt: stamp(-120_000), expiresAt: stamp(3_480_000), approvedBy: 'staff' } });
const hold = () => ({ bookingId: id, campaignId: 'camp', kind: 'approved_deposit', status: 'active', currency: 'EUR',
  createdAt: stamp(-120_000), expiresAt: stamp(3_480_000), dataShootingInizio: stamp(7_200_000), dataShootingFine: stamp(9_000_000),
  depositAmountCents: 2500, approvalNonce: '1'.repeat(64), tokenHash: '2'.repeat(64),
  draft: { cliente: booking().cliente }, paymentEmail: { status: 'sent', attempts: 1, sentAt: stamp(-61_000) } });
beforeEach(() => {
  resendBoundary.mockClear();
  vi.spyOn(Date, 'now').mockReturnValue(now);
  store = reservationDb();
  store.seed(`bookings/${id}`, booking()); store.seed(`bookingCheckoutHolds/${id}`, hold());
  store.seed('booking_campaigns/camp', campaign);
});
afterEach(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; }
  vi.restoreAllMocks();
});
const snapshot = () => getAdminBookingPaymentSnapshot(store.db, id, true);
describe('admin payment projection', () => {
  it('shows the frozen amount and deadline without leaking owner credentials', async () => {
    const view = await snapshot();
    expect(view).toMatchObject({ amountCents: 2500, stage: 'in_attesa_pagamento', method: 'paypal', canResend: true, emailStatus: 'sent' });
    expect(view.expiresAt?.getTime()).toBe(now + 3_480_000);
    expect(JSON.stringify(view)).not.toMatch(/tokenHash|approvalNonce|resendIds/);
  });
  it.each([
    [{ paymentEmail: { status: 'unknown', attempts: 1 } }, 'Esito email incerto'],
    [{ paymentEmail: { status: 'sending', attempts: 1, leaseUntil: stamp(30_000) } }, 'già in corso'],
    [{ paymentEmail: { status: 'sending', attempts: 1, leaseUntil: stamp(-1) } }, 'Esito email incerto'],
    [{ paymentEmail: { status: 'sent', attempts: 3 } }, 'tre tentativi'],
    [{ paymentEmail: { status: 'sent', attempts: 1, sentAt: stamp(-1) } }, 'un minuto'],
  ])('explains why a resend is unsafe %j', async (patch, reason) => {
    store.seed(`bookingCheckoutHolds/${id}`, { ...hold(), ...patch });
    expect(await snapshot()).toMatchObject({ canResend: false, resendReason: expect.stringContaining(reason) });
  });
  it('never revives expiry or requests another payment after a manual receipt', async () => {
    vi.mocked(Date.now).mockReturnValue(now + 3_480_000);
    expect(await snapshot()).toMatchObject({ stage: 'scaduta', canResend: false, payable: false });
    vi.mocked(Date.now).mockReturnValue(now);
    store.seed(`bookings/${id}`, { ...booking(), acconto: 25 });
    expect(await snapshot()).toMatchObject({ stage: 'pagamento_da_verificare', method: 'manual', paidAmountCents: 2500, canResend: false });
  });
  it('distinguishes actual zero fees from fees that are not known', () => {
    const payment = { provider: 'paypal', status: 'paid', amountCents: 2500, paypalCaptureId: 'CAPTURE', paypalOrderId: 'ORDER', paypalFeeCents: 0, netCents: 2500 };
    const view = buildAdminBookingPayment(id, { ...booking(), stato: 'confermata', depositPayment: payment }, hold(), campaign, true, now);
    expect(view).toMatchObject({ paymentStatus: 'paid', paidAmountCents: 2500, paypalFeeCents: 0, netCents: 2500, canResend: false, providerStatus: 'COMPLETED' });
    expect(buildAdminBookingPayment(id, booking(), hold(), campaign, true, now).paypalFeeCents).toBeNull();
  });
  it('explains disabled campaigns, mismatches and unavailable PayPal', () => {
    expect(buildAdminBookingPayment(id, booking(), hold(), { ...campaign, attiva: false }, true, now).payabilityReason).toContain('non è più attiva');
    expect(buildAdminBookingPayment(id, booking(), hold(), campaign, false, now).payabilityReason).toContain('PayPal non è disponibile');
    expect(buildAdminBookingPayment(id, { ...booking(), cliente: { email: 'changed@example.test' } }, hold(), campaign, true, now).canResend).toBe(false);
  });
  it('lists only unfinished or paid-review checkouts without a root booking', async () => {
    store.seed('bookingCheckoutHolds/immediate', { ...hold(), kind: 'immediate', createdAt: stamp(-1000), expiresAt: stamp(599_000) });
    store.seed('bookingCheckoutHolds/expired', { ...hold(), expiresAt: stamp(-1) });
    store.seed('bookingCheckoutHolds/review', { ...hold(), status: 'consumed',
      depositPayment: { status: 'paid_action_required', provider: 'paypal', amountCents: 2500, paypalCaptureId: 'LATE' } });
    const result = await listAdminBookingCheckouts(store.db, true);
    expect(result.items.map(item => item.bookingId).sort()).toEqual(['immediate', 'review']);
    expect(result.items.find(item => item.bookingId === 'review')?.stage).toBe('pagamento_da_verificare');
  });
});
async function request(path: string, token = 'admin', method = 'GET', body?: unknown) {
  if (!server) {
    const app = express(); app.use(express.json());
    const auth: express.RequestHandler = (req, res, next) => req.headers.authorization ? (Object.assign(req, { user: { uid: 'staff' } }), next()) : void res.sendStatus(401);
    const admin: express.RequestHandler = (req, res, next) => req.headers.authorization === 'Bearer admin' ? next() : void res.sendStatus(403);
    const client = { publicConfig: () => ({ checkoutEnabled: true }), captureOrder: vi.fn(), getOrder: vi.fn() } as any;
    app.use('/api/booking', bookingAdminPaymentRouter(store.db, auth, admin, () => client, resendBoundary));
    app.get('/api/booking/public', (_req, res) => res.json({ public: true }));
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server!.once('listening', resolve));
  }
  const port = (server.address() as any).port;
  return fetch(`http://127.0.0.1:${port}/api/booking${path}`, { method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
describe('admin payment routes', () => {
  it('replays a consumed intent without another email, even after expiry', async () => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    store.seed(`bookingCheckoutHolds/${id}`, { ...hold(), paymentEmail: { ...hold().paymentEmail, resendIds: [requestId] } });
    vi.mocked(Date.now).mockReturnValue(now + 3_600_000);
    const response = await request(`/${id}/payment/resend`, 'admin', 'POST', { requestId });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stage: 'scaduta', canResend: false });
    expect(resendBoundary).not.toHaveBeenCalled();
  });
  it('keeps the original deadline when the email boundary fails', async () => {
    const response = await request(`/${id}/payment/resend`, 'admin', 'POST', { requestId: '11111111-1111-4111-8111-111111111111' });
    expect(response.status).toBe(503);
    expect(resendBoundary).toHaveBeenCalledTimes(1);
    expect(store.value(`bookings/${id}`).depositPaymentRequest.expiresAt.toMillis()).toBe(now + 3_480_000);
    expect(await response.json()).toEqual({ error: 'Verifica pagamento non disponibile. Nessun nuovo addebito eseguito.' });
  });
  it.each([['/admin/payment-checkouts', 'GET'], [`/${id}/payment`, 'GET'], [`/${id}/payment/verify`, 'POST'], [`/${id}/payment/resend`, 'POST']])(
    'requires authentication and admin rights for %s', async (path, method) => {
      expect((await request(path, '', method, method === 'POST' ? {} : undefined)).status).toBe(401);
      expect((await request(path, 'customer', method, method === 'POST' ? {} : undefined)).status).toBe(403);
    });
  it('keeps unrelated public routes public and prevents caching customer data', async () => {
    expect((await request('/public', '')).status).toBe(200);
    const response = await request(`/${id}/payment`);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ stage: 'in_attesa_pagamento', amountCents: 2500 });
  });
  it('does not accept amounts, captures or new expiry through verify/resend', async () => {
    expect((await request(`/${id}/payment/verify`, 'admin', 'POST', { amountCents: 1 })).status).toBe(400);
    expect((await request(`/${id}/payment/resend`, 'admin', 'POST', { requestId: '11111111-1111-4111-8111-111111111111', amountCents: 1 })).status).toBe(400);
    expect((await request('/bad%2Fid/payment')).status).toBe(400);
  });
  it('blocks resend after expiry and safely verifies an unstarted checkout without a charge', async () => {
    const response = await request(`/${id}/payment/verify`, 'admin', 'POST', {});
    expect(response.status).toBe(200);
    expect(store.value(`bookings/${id}`).stato).toBe('in_attesa');
    vi.mocked(Date.now).mockReturnValue(now + 3_600_000);
    expect((await request(`/${id}/payment/resend`, 'admin', 'POST', { requestId: '11111111-1111-4111-8111-111111111111' })).status).toBe(410);
  });
});
