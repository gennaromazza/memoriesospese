import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const h = vi.hoisted(() => ({ discover: vi.fn(), verify: vi.fn(), current: vi.fn(), save: vi.fn(), clear: vi.fn() }));
vi.mock('./google-calendar.js', () => ({ discoverStudioCalendars: h.discover, getCalendarConnectionStatus: h.verify }));
vi.mock('./calendar-destination.js', async importOriginal => ({
  ...await importOriginal<typeof import('./calendar-destination.js')>(),
  getStudioCalendarId: h.current, confirmStudioCalendarId: h.save,
}));
vi.mock('./services/calendar-event-cache.js', () => ({ clearCalendarEventCache: h.clear }));
import { calendarSetupRouter } from './calendar-setup-routes.js';
const app = express();
app.use(express.json(), (req: any, _res, next) => { req.user = { email: 'admin@test' }; next(); });
app.use('/setup', calendarSetupRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/setup`;
afterAll(() => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
beforeEach(() => {
  vi.clearAllMocks();
  h.current.mockResolvedValue(null);
  h.verify.mockResolvedValue({ connected: true, calendarId: 'studio@example.test', accountEmail: 'service@test' });
  h.save.mockResolvedValue(undefined);
});
const post = (path: string, body: any) => fetch(`${base}/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
describe('procedura guidata calendario', () => {
  it('la scoperta non seleziona né salva', async () => {
    h.discover.mockResolvedValue({ currentCalendarId: null, accountEmail: 'service@test', calendars: [] });
    expect(await (await fetch(base)).json()).toMatchObject({ currentCalendarId: null });
    expect(h.save).not.toHaveBeenCalled();
  });
  it.each(['', 'primary', 'https://calendar.google.com/calendar/abc'])('rifiuta ID non esplicito: %s', async calendarId => {
    expect((await post('verify', { calendarId })).status).toBe(400);
    expect(h.verify).not.toHaveBeenCalled();
  });
  it('verifica senza scrivere e richiede conferma esplicita', async () => {
    expect((await post('verify', { calendarId: 'studio@example.test' })).status).toBe(200);
    expect((await post('confirm', { calendarId: 'studio@example.test' })).status).toBe(400);
    expect(h.save).not.toHaveBeenCalled();
  });
  it.each(['ACCESS_DENIED', 'NOT_FOUND', 'READ_ONLY'])('blocca conferma con %s', async errorCode => {
    h.verify.mockResolvedValue({ connected: false, errorCode, error: 'Permessi da verificare' });
    expect((await post('confirm', { calendarId: 'studio@example.test', confirmed: true })).status).toBe(422);
    expect(h.save).not.toHaveBeenCalled();
  });
  it('ricontrolla i permessi al salvataggio e collega solo la scelta confermata', async () => {
    expect((await post('confirm', { calendarId: 'studio@example.test', confirmed: true })).status).toBe(200);
    expect(h.verify).toHaveBeenCalledWith('studio@example.test');
    expect(h.save).toHaveBeenCalledWith('studio@example.test', 'admin@test');
    expect(h.clear).toHaveBeenCalledOnce();
  });
  it('non sostituisce il calendario dei lavori già configurato', async () => {
    h.current.mockResolvedValue('original@example.test');
    expect((await post('confirm', { calendarId: 'studio@example.test', confirmed: true })).status).toBe(409);
    expect(h.save).not.toHaveBeenCalled();
  });
  it('non espone dettagli delle credenziali negli errori', async () => {
    h.discover.mockRejectedValue(new Error('private credential detail'));
    const response = await fetch(base);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private credential');
  });
});
