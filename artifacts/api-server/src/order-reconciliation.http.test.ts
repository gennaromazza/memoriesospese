import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { orderDepositFixture } from './booking/test-helpers/order-deposit-fixture.js';

const boundary = vi.hoisted(() => ({
  db: undefined as any,
  verifyIdToken: vi.fn(),
  gate: vi.fn(),
  sendEmail: vi.fn(),
}));
// Mock before importing app.ts. Never import index.ts: it starts real workers.
vi.mock('./firebase-admin.js', () => ({
  db: new Proxy({}, { get: (_target, key) => boundary.db[key].bind(boundary.db) }),
  FieldValue: {}, Timestamp: {},
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: boundary.verifyIdToken }) }));
vi.mock('./admin-security/admin-guard.js', () => ({ adminPasskeyGate: boundary.gate }));
vi.mock('@replit/connectors-sdk', () => ({ ReplitConnectors: class {} }));
vi.mock('./email-routes.js', async importOriginal => ({
  ...await importOriginal<typeof import('./email-routes.js')>(),
  sendGmailEmail: boundary.sendEmail,
}));
vi.mock('./job-aggregates.js', () => ({ recomputeJobTransactionCount: vi.fn() }));
vi.mock('./lib/logger', async () => ({ logger: (await import('pino')).default({ level: 'silent' }) }));
// Unrelated routers are inert; the application mounts, order router,
// authentication middleware and reconciliation service remain real.
vi.mock('./routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./booking-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./job-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./payment-schedule-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./quote-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./import-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./consultation-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./calendar-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./receipt-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./invoice-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./places-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./collaboratori-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./lab-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./products-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./migration-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./admin-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./admin-security/admin-security-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./gallery-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./bulk-email-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./reminder-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./follow-up-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./backup-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./audit-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./gdpr-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./studio-assistant-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./info-form-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./photobook-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./blog-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./wedding-seo', async () => ({ default: (await import('express')).Router() }));
vi.mock('./print-shop/router', async () => ({ default: (await import('express')).Router() }));
vi.mock('./gift-cards', async () => ({ default: (await import('express')).Router() }));
vi.mock('./shop', async () => ({ default: (await import('express')).Router() }));
vi.mock('./desktop-gallery-routes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./sitemap-generator', () => ({ generateDynamicSitemap: vi.fn() }));

import app from './app';

let server: Server;
let origin: string;
let store: ReturnType<typeof orderDepositFixture>;
beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => {
  vi.clearAllMocks();
  store = orderDepositFixture();
  boundary.db = store.db;
  boundary.gate.mockResolvedValue(null);
  boundary.verifyIdToken.mockImplementation(async token => {
    if (token === 'invalid') throw new Error('Invalid fixture token');
    return { uid: 'fixture-staff', email: token === 'admin' ? 'gennaro.mazzacane@gmail.com' : 'customer@example.test' };
  });
});

function request(body: unknown = { orderIds: ['order'] }, token: string | null = 'admin', path = '/api/orders/reconcile-booking-deposits') {
  return fetch(`${origin}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe('POST reconciliation through the mounted application', () => {
  it('reaches the real mount rather than the API 404 fallback', async () => {
    const anonymous = await request(undefined, null);
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({ error: { code: 'unauthenticated' } });
    expect((await request({}, 'admin', '/api/orders/non-existent-route')).status).toBe(404);
    expect(boundary.verifyIdToken).not.toHaveBeenCalled();
  });
  it('rejects invalid tokens and non-admins before accessing orders', async () => {
    const transaction = vi.spyOn(store.db, 'runTransaction');
    expect((await request(undefined, 'invalid')).status).toBe(401);
    expect((await request(undefined, 'customer')).status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('preserves the central passkey gate', async () => {
    boundary.gate.mockResolvedValue({ status: 403, body: { code: 'admin_passkey_required' } });
    expect((await request()).status).toBe(403);
    expect(store.value('orders/order').acconto).toBe(0);
  });
  it.each([{}, { orderIds: 'order' }, { orderIds: [''] }, { orderIds: ['bad/id'] }, { orderIds: [42] },
    { orderIds: Array.from({ length: 51 }, (_, n) => `order-${n}`) }])('rejects invalid identifiers %j', async body => {
    expect((await request(body)).status).toBe(400);
    expect(store.value('orders/order').acconto).toBe(0);
  });
  it('credits 5 of 20 euros once across duplicate IDs, concurrent reloads and retry', async () => {
    const receiptBefore = [...store.rows].filter(([key]) => !key.startsWith('orders/'));
    const responses = await Promise.all([request({ orderIds: ['order', 'order'] }), request()]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const results = await Promise.all(responses.map(async r => await r.json() as { updated: number }));
    expect(results.reduce((sum, result) => sum + result.updated, 0)).toBe(1);
    expect(await (await request()).json()).toEqual({ updated: 0 });
    expect(store.value('orders/order')).toMatchObject({ totale: 20, acconto: 5, saldo: 15,
      transactions: [{ importo: 5, cashMovementId: 'cash', emailInviata: true, providerTransactionId: 'CAPTURE' }] });
    expect([...store.rows].filter(([key]) => !key.startsWith('orders/'))).toEqual(receiptBefore);
    expect(boundary.sendEmail).not.toHaveBeenCalled();
    expect([...store.rows.keys()]).toHaveLength(4);
  });
  it('fails explicitly for an unverifiable receipt, also on retry, without side effects', async () => {
    for (const key of store.rows.keys()) if (key.startsWith('bookingPaymentCaptures/')) store.rows.delete(key);
    const before = [...store.rows];
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request();
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: expect.stringContaining('Ricevuta dell’acconto non verificabile') });
    }
    expect([...store.rows]).toEqual(before);
    expect(boundary.sendEmail).not.toHaveBeenCalled();
  });
});
