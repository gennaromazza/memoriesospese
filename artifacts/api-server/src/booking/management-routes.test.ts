import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { reservationDb } from './test-helpers/reservation-db.js';
import { bookingManagementRouter } from './management-routes.js';
import { ensureBookingManagementLink } from './management-access.js';
import { ChangeAdminBookingManagementLinkResponse } from '@workspace/api-zod';
vi.mock('../email-routes.js', () => ({
  getStudioContactInfo: vi.fn(async () => ({ name: 'Studio test', email: 'studio@example.test', phone: '+390000000000', address: 'Via test' })),
}));

let store: ReturnType<typeof reservationDb>, server: Server, base: string;
beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', 'management-route-test-key-not-a-real-secret');
  store = reservationDb();
  store.seed('bookings/one', { stato: 'confermata', cliente: { email: 'customer@example.test' }, noteAdmin: 'never public' });
  const app = express(); app.use(express.json());
  app.use('/booking', bookingManagementRouter(store.db, (req, res, next) => {
    if (!req.header('x-test-role')) { res.status(401).end(); return; }
    (req as any).user = { uid: 'staff-test' }; next();
  }, (req, res, next) => {
    if (req.header('x-test-role') !== 'admin') { res.status(403).end(); return; } next();
  }));
  await new Promise<void>(resolve => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/booking`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); vi.unstubAllEnvs(); });
const request = (path: string, body?: unknown, role?: string) => fetch(base + path, {
  method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(role ? { 'x-test-role': role } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
describe('management link HTTP boundaries', () => {
  it.each(['GET', 'POST'])('protects admin %s from anonymous and non-admin users', async method => {
    const body = method === 'POST' ? { action: 'rotate', expectedVersion: 0, requestId: randomUUID() } : undefined;
    expect((await request('/one/management-link', body)).status).toBe(401);
    expect((await request('/one/management-link', body, 'customer')).status).toBe(403);
  });
  it('returns only metadata on admin reads, never a token, email or private nonce', async () => {
    await ensureBookingManagementLink(store.db, 'one');
    const response = await request('/one/management-link', undefined, 'admin'), data = await response.json();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(data).toEqual({ status: 'active', version: 1, canIssue: true, canRevoke: true, reason: null });
  });
  it('allows anonymous access with the bound token without serializing the trusted context', async () => {
    const url = await ensureBookingManagementLink(store.db, 'one');
    const response = await request('/one/management/access', { token: new URL(url).hash.slice(1) });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await response.json()).toEqual({ success: true, bookingId: 'one', status: 'confirmed', campaignName: null,
      startsAt: null, endsAt: null, customerName: null, productName: null, depositPaidCents: null,
      studio: { name: 'Studio test', email: 'studio@example.test', phone: '+390000000000', address: 'Via test' } });
  });
  it('returns the same safe denial for unknown IDs and wrong tokens', async () => {
    await ensureBookingManagementLink(store.db, 'one');
    const known = await request('/one/management/access', { token: 'a'.repeat(64) });
    const missing = await request('/missing/management/access', { token: 'a'.repeat(64) });
    expect(known.status).toBe(404); expect(missing.status).toBe(404);
    expect(await known.json()).toEqual(await missing.json());
  });
  it('validates bodies strictly and refuses stale or cross-action retries', async () => {
    const bad = await request('/one/management-link', { action: 'rotate', requestId: randomUUID(), expectedVersion: 0, token: 'injected' }, 'admin');
    expect(bad.status).toBe(400);
    expect((await request('/one/management/access', { token: 'a'.repeat(64), bookingId: 'two' })).status).toBe(400);
    const intent = { action: 'rotate', expectedVersion: 0, requestId: randomUUID() };
    const first = await request('/one/management-link', intent, 'admin'), data = ChangeAdminBookingManagementLinkResponse.parse(await first.json());
    expect(first.status).toBe(200); expect(data.url).toMatch(/#([a-f0-9]{64})$/);
    expect(await (await request('/one/management-link', intent, 'admin')).json()).toEqual(data);
    expect((await request('/one/management-link', { ...intent, action: 'revoke' }, 'admin')).status).toBe(409);
    expect((await request('/one/management-link', { ...intent, requestId: randomUUID() }, 'admin')).status).toBe(409);
  });
  it('revokes the public link immediately', async () => {
    const url = await ensureBookingManagementLink(store.db, 'one');
    const response = await request('/one/management-link', { action: 'revoke', expectedVersion: 1, requestId: randomUUID() }, 'admin');
    expect(response.status).toBe(200); expect(ChangeAdminBookingManagementLinkResponse.parse(await response.json()).url).toBeNull();
    expect((await request('/one/management/access', { token: new URL(url).hash.slice(1) })).status).toBe(404);
  });
});
