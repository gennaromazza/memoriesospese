import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { bookingManualRecoveryRouter } from './recovery-manual-routes.js';

const providers = vi.hoisted(() => ({ send: vi.fn(), studio: vi.fn() }));
vi.mock('../email-routes.js', () => ({ getStudioContactInfo: providers.studio, sendGmailEmail: providers.send }));

const hour = 60 * 60 * 1000;
const now = Date.now();
const stamp = (time: number) => Timestamp.fromMillis(time);
const store = reservationDb();
store.seed('booking_campaigns/spring', {
  nome: 'Primavera', code: 'SPRING', attiva: true, richiedeAcconto: true, emailRecuperoAcconto: false,
  dataFine: stamp(now + hour * 48),
});
store.seed('bookings/eligible', {
  campaignId: 'spring', stato: 'annullata',
  cliente: { nome: 'Arianna', email: 'arianna@example.test', whatsapp: '+393331234567' },
  depositPaymentRequest: { status: 'expired', requestedAt: stamp(now - hour * 4), expiresAt: stamp(now - hour * 3) },
});
store.seed('bookings/uncertain', {
  campaignId: 'spring', stato: 'annullata',
  cliente: { nome: 'Bruno', email: 'bruno@example.test', whatsapp: '+393331234568' },
  depositPaymentRequest: { status: 'expired', requestedAt: stamp(now - hour * 4), expiresAt: stamp(now - hour * 3) },
  paymentReviewRequired: true,
});

const app = express();
app.use(express.json());
app.use('/api/booking', bookingManualRecoveryRouter(
  store.db,
  (req, res, next) => {
    if (!req.header('x-test-role')) { res.sendStatus(401); return; }
    (req as any).user = { uid: 'admin-user' }; next();
  },
  (req, res, next) => req.header('x-test-role') === 'admin' ? next() : res.sendStatus(403),
  {
    studio: providers.studio,
    send: providers.send,
  },
  true,
));
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/booking/admin/recovery`;
afterAll(() => { server.closeAllConnections(); server.close(); });
beforeEach(() => {
  providers.send.mockReset().mockResolvedValue(undefined);
  providers.studio.mockReset().mockResolvedValue({
    name: 'Studio test', email: 'studio@example.test', phone: '+390000000000',
  });
});
const post = (path: string, body: unknown, role?: string) => fetch(`${base}/${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(role ? { 'x-test-role': role } : {}) },
  body: JSON.stringify(body),
});

it('requires verified admin identity before exposing customer details', async () => {
  expect((await post('preview', { campaignId: 'spring' })).status).toBe(401);
  expect((await post('preview', { campaignId: 'spring' }, 'staff')).status).toBe(403);
  expect(providers.send).not.toHaveBeenCalled();
});

it('previews eligible and excluded records even when automatic recovery is disabled', async () => {
  const response = await post('preview', { campaignId: 'spring' }, 'admin');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    campaignId: 'spring',
    eligible: [{ bookingId: 'eligible', name: 'Arianna', email: 'arianna@example.test', eligible: true }],
    excluded: [{
      bookingId: 'uncertain', name: 'Bruno', email: 'bruno@example.test',
      eligible: false, reason: 'pagamento_o_modifica_da_verificare',
    }],
  });
  expect(providers.send).not.toHaveBeenCalled();
});

it('lists the same email only once and labels the duplicate as excluded', async () => {
  store.seed('bookings/zzz-duplicate', {
    campaignId: 'spring', stato: 'annullata',
    cliente: { nome: 'Arianna duplicata', email: 'ARIANNA@example.test', whatsapp: '+393331234567' },
    depositPaymentRequest: { status: 'expired', requestedAt: stamp(now - hour * 4), expiresAt: stamp(now - hour * 3) },
  });
  const response = await post('preview', { campaignId: 'spring' }, 'admin');
  const result = await response.json() as any;
  expect(result.eligible).toHaveLength(1);
  expect(result.excluded).toContainEqual(expect.objectContaining({
    bookingId: 'zzz-duplicate', eligible: false, reason: 'destinatario_duplicato_nella_selezione',
  }));
  expect(providers.send).not.toHaveBeenCalled();
});

it('rechecks selected rows before sending and records the final status', async () => {
  const badSelection = await post('send', { campaignId: 'spring', bookingIds: ['eligible', 'eligible'] }, 'admin');
  expect(badSelection.status).toBe(400);
  expect(providers.send).not.toHaveBeenCalled();

  const sent = await post('send', { campaignId: 'spring', bookingIds: ['eligible'] }, 'admin');
  expect(sent.status).toBe(200);
  expect(await sent.json()).toEqual({ outcomes: [{ bookingId: 'eligible', status: 'sent' }] });
  expect(providers.send).toHaveBeenCalledOnce();
  expect(store.value('bookingRecoveryJobs/eligible')).toMatchObject({
    status: 'sent', manual: true, manualRequestedBy: 'admin-user',
  });
});

it('rejects sends outside production even when an administrator confirms', async () => {
  const nonProduction = express();
  nonProduction.use(express.json());
  nonProduction.use('/api/booking', bookingManualRecoveryRouter(
    store.db,
    (_req, _res, next) => next(),
    (_req, _res, next) => next(),
    { studio: providers.studio, send: providers.send },
    false,
  ));
  const localServer = nonProduction.listen(0);
  try {
    const localBase = `http://127.0.0.1:${(localServer.address() as AddressInfo).port}/api/booking/admin/recovery/send`;
    const response = await fetch(localBase, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: 'spring', bookingIds: ['eligible'] }),
    });
    expect(response.status).toBe(403);
    expect(providers.send).not.toHaveBeenCalled();
  } finally {
    localServer.closeAllConnections();
    await new Promise<void>(resolve => localServer.close(() => resolve()));
  }
});
