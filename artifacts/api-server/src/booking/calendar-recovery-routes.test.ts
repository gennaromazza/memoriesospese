import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
const h = vi.hoisted(() => ({ inspect: vi.fn(), recover: vi.fn() }));
vi.mock('./calendar-recovery.js', () => ({
  inspectBookingCalendar: h.inspect, recoverBookingCalendar: h.recover,
  CalendarRecoveryError: class extends Error { constructor(readonly status: number, message: string) { super(message); } },
}));
import { calendarRecoveryRouter } from './calendar-recovery-routes.js';
const app = express(); app.use(express.json());
app.use('/api/booking', calendarRecoveryRouter({} as any,
  (req, res, next) => { if (!req.headers.authorization) { res.sendStatus(401); return; } (req as any).user = { uid: 'verified-admin' }; next(); },
  (req, res, next) => { if (req.headers.authorization !== 'Bearer admin') { res.sendStatus(403); return; } next(); }));
const server = app.listen(0), base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/booking/one/calendar-recovery`;
afterAll(() => { server.closeAllConnections(); server.close(); });
beforeEach(() => {
  h.inspect.mockReset().mockResolvedValue({ action: 'create', canRecover: true, inspectionKey: 'a'.repeat(64) });
  h.recover.mockReset().mockResolvedValue({ action: 'already_linked', canRecover: false });
});
it.each(['GET', 'POST'])('protegge %s da accessi non autenticati o non admin', async method => {
  expect((await fetch(base, { method })).status).toBe(401);
  expect((await fetch(base, { method, headers: { Authorization: 'Bearer customer' } })).status).toBe(403);
  expect(h.inspect).not.toHaveBeenCalled(); expect(h.recover).not.toHaveBeenCalled();
});
it('GET ispeziona senza avviare il recupero', async () => {
  expect((await fetch(base, { headers: { Authorization: 'Bearer admin' } })).status).toBe(200);
  expect(h.inspect).toHaveBeenCalledOnce(); expect(h.recover).not.toHaveBeenCalled();
});
it('richiede una verifica prima del POST e ricava l’admin dal token', async () => {
  const headers = { Authorization: 'Bearer admin', 'Content-Type': 'application/json' };
  expect((await fetch(base, { method: 'POST', headers, body: '{}' })).status).toBe(400);
  expect(h.recover).not.toHaveBeenCalled();
  expect((await fetch(base, { method: 'POST', headers, body: JSON.stringify({ inspectionKey: 'a'.repeat(64), actor: 'forged' }) })).status).toBe(200);
  expect(h.recover).toHaveBeenCalledWith({}, 'one', 'a'.repeat(64), 'verified-admin');
});
it('se Google fallisce non mostra successo e redige eventuali token nel messaggio', async () => {
  h.inspect.mockRejectedValue(new Error('Google unavailable Bearer secret-value'));
  const response = await fetch(base, { headers: { Authorization: 'Bearer admin' } });
  expect(response.status).toBe(503);
  const message = await response.text();
  expect(message).toContain('[REDACTED]'); expect(message).not.toContain('secret-value');
});
