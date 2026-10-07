import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';

vi.mock('../firebase-admin.js', () => ({ db: {}, storage: {} }));
vi.mock('../email-routes.js', () => ({ getStudioContactInfo: vi.fn(), sendGmailEmail: vi.fn() }));
vi.mock('../google-drive.js', () => ({
  createShipmentFolder: vi.fn(), deleteDriveFile: vi.fn(), findShipmentFolderByShipmentId: vi.fn(),
  findOrCreateLabParentFolder: vi.fn(), revokeShipmentFolderPermission: vi.fn(),
  shareShipmentFolderWithUser: vi.fn(), uploadStreamToDriveFolder: vi.fn(),
}));
vi.mock('./auth.js', () => ({
  authenticatePrintShop: (_req: any, _res: any, next: any) => next(),
  requirePrintShopCustomer: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('./paypal-orders.js', async (actual) => ({
  ...await actual<any>(), loadPayPalOrdersConfig: () => ({ environment: 'sandbox' }),
}));
import { createPrintShopRouter } from './router.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve());
    server.closeAllConnections();
  })));
});

async function harness() {
  const service: any = {
    acceptDraftManually: vi.fn(async () => ({ fulfillment: { status: 'awaiting_payment' } })),
    authorizeDeferredPayment: vi.fn(async () => ({ payment: { status: 'deferred' } })),
    restoreDeferredCandidate: vi.fn(async () => ({ payment: { status: 'pending' } })),
    collectDeferredPayment: vi.fn(async () => ({ payment: { status: 'paid' } })),
    resendCustomerNotification: vi.fn(async () => ({ sent: true, skipped: false })),
  };
  const app = express();
  app.use(express.json());
  app.use('/api/print-shop', createPrintShopRouter({
    service, storage: {}, adminEmails: ['admin@example.test'],
    authenticate(req: any, res, next) {
      const role = req.get('x-test-role');
      if (!role) { res.sendStatus(401); return; }
      req.user = { uid: role, email: `${role}@example.test` };
      next();
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  return { service, post: (action: string, role: string | null, data: unknown) => fetch(
    `http://127.0.0.1:${port}/api/print-shop/admin/orders/test/${action}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(role ? { 'x-test-role': role } : {}) },
      body: JSON.stringify(data),
    },
  ) };
}

describe('Deferred payment route boundaries', () => {
  it.each(['accept-draft', 'deferred-payment', 'restore', 'collect'])('refuses anonymous and non-admin %s requests', async action => {
    const h = await harness();
    expect((await h.post(action, null, {})).status).toBe(401);
    expect((await h.post(action, 'customer', {})).status).toBe(403);
    expect(h.service.authorizeDeferredPayment).not.toHaveBeenCalled();
    expect(h.service.restoreDeferredCandidate).not.toHaveBeenCalled();
    expect(h.service.collectDeferredPayment).not.toHaveBeenCalled();
    expect(h.service.acceptDraftManually).not.toHaveBeenCalled();
  });
  it.each(['deferred-payment', 'restore'])('requires explicit note and confirmation for %s', async action => {
    const h = await harness();
    for (const body of [{}, { note: '   ', confirmed: true }, { note: 'Approval', confirmed: false },
      { note: 'Approval', confirmed: true, amountCents: 1 }]) {
      expect((await h.post(action, 'admin', body)).status).toBe(400);
    }
    expect((await h.post(action, 'admin', { note: '  Approval  ', confirmed: true })).status).toBe(200);
    const method = action === 'restore' ? h.service.restoreDeferredCandidate : h.service.authorizeDeferredPayment;
    expect(method).toHaveBeenCalledWith('test', 'admin@example.test', { note: 'Approval', confirmed: true });
  });
  it('requires the displayed quote snapshot and admin confirmation for manual acceptance', async () => {
    const h = await harness();
    const valid = { note: 'Phone request', confirmed: true, expectedQuoteFingerprint: 'quote',
      expectedSnapshotHash: 'snapshot', expectedTotalCents: 1000 };
    for (const data of [{}, { ...valid, confirmed: false }, { ...valid, expectedTotalCents: 0 },
      { ...valid, expectedSnapshotHash: '' }, { ...valid, termsAccepted: true }]) {
      expect((await h.post('accept-draft', 'admin', data)).status).toBe(400);
    }
    expect(h.service.acceptDraftManually).not.toHaveBeenCalled();
    expect((await h.post('accept-draft', 'admin', valid)).status).toBe(200);
    expect(h.service.acceptDraftManually).toHaveBeenCalledWith('test', 'admin@example.test', valid);
  });
  it('rejects fictitious PayPal, partial amounts and invalid receipt dates', async () => {
    const h = await harness();
    const valid = { note: 'Received', confirmed: true, method: 'cash', receivedAt: '2026-10-03T09:00:00Z' };
    for (const body of [{ ...valid, method: 'paypal' }, { ...valid, amountCents: 1 }, { ...valid, receivedAt: 'yesterday' }]) {
      expect((await h.post('collect', 'admin', body)).status).toBe(400);
    }
    expect(h.service.collectDeferredPayment).not.toHaveBeenCalled();
    expect((await h.post('collect', 'admin', valid)).status).toBe(200);
  });

  it('protects customer-email resends and requires an explicit confirmation', async () => {
    const h = await harness();
    const action = 'customer-notifications/manual_acceptance/resend';
    expect((await h.post(action, null, { confirmed: true })).status).toBe(401);
    expect((await h.post(action, 'customer', { confirmed: true })).status).toBe(403);
    expect((await h.post(action, 'admin', { confirmed: false })).status).toBe(400);
    expect((await h.post(action, 'admin', { confirmed: true, extra: true })).status).toBe(400);
    expect((await h.post('customer-notifications/not-a-kind/resend', 'admin', { confirmed: true })).status)
      .toBe(400);
    expect(h.service.resendCustomerNotification).not.toHaveBeenCalled();

    expect((await h.post(action, 'admin', { confirmed: true })).status).toBe(200);
    expect(h.service.resendCustomerNotification).toHaveBeenCalledWith(
      'test',
      'manual_acceptance',
      'admin@example.test',
    );
  });
});