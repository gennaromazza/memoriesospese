import { afterAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const h = vi.hoisted(() => ({ email: 'gennaro.mazzacane@gmail.com' }));

vi.mock('./firebase-admin.js', () => ({
  db: new Proxy({}, { get: () => () => { throw new Error('Firestore non deve essere interrogato senza autorizzazione'); } }),
  FieldValue: { serverTimestamp: () => ({}) },
}));
vi.mock('firebase-admin/firestore', () => ({ Timestamp: { fromDate: (date: Date) => ({ date }), now: () => ({}) } }));
vi.mock('./google-calendar.js', () => ({ getAvailableSlots: vi.fn(), deleteEvent: vi.fn() }));
vi.mock('./email-routes.js', () => ({
  authenticateFirebase: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ error: 'Token mancante' });
    req.user = { uid: 'verified-admin', email: h.email };
    next();
  },
}));

const { default: router } = await import('./booking-routes.js');
const app = express();
app.use(express.json());
app.use('/api/booking', router);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => server.close());

describe('protezione delle route booking amministrative', () => {
  it('rifiuta l’approvazione priva di token prima di accedere ai dati', async () => {
    const response = await fetch(`${base}/api/booking/v2/booking-1/approve`, { method: 'PATCH' });
    expect(response.status).toBe(401);
  });

  it('rifiuta un utente autenticato ma non admin', async () => {
    h.email = 'cliente@example.com';
    const response = await fetch(`${base}/api/booking/booking-1/delete`, {
      method: 'DELETE', headers: { Authorization: 'Bearer customer' },
    });
    expect(response.status).toBe(403);
    h.email = 'gennaro.mazzacane@gmail.com';
  });

  it('non consente di attivare il bypass manuale senza token', async () => {
    const response = await fetch(`${base}/api/booking/v2/available-slots`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-09-17', campaignId: 'campaign-1', isManualBooking: true }),
    });
    expect(response.status).toBe(401);
  });
});
