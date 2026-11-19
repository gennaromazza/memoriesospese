import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Audit 19/11/2026 punto 4: le scritture su Google Calendar non avevano timeout ne' retry e
// createEvent non era idempotente (un timeout dopo l'inserimento lasciava un evento orfano).
const h = vi.hoisted(() => ({ insert: vi.fn(), patch: vi.fn(), del: vi.fn(), get: vi.fn() }));
vi.mock('googleapis', () => ({
  google: {
    auth: { JWT: class { async authorize() { return {}; } } },
    calendar: () => ({
      events: { insert: h.insert, patch: h.patch, delete: h.del, get: h.get },
      calendarList: { get: vi.fn(), list: vi.fn() },
    }),
  },
}));

const apiError = (code: number | string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(`Google ${code}`), typeof code === 'number' ? { code, response: { status: code } } : { code }, extra);
const start = new Date('2027-02-10T09:00:00Z');
const end = new Date('2027-02-10T10:00:00Z');

async function load() {
  process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL = 'sa@p.iam.gserviceaccount.com';
  process.env.GOOGLE_CALENDAR_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----';
  delete process.env.GOOGLE_CALENDAR_ID;
  vi.resetModules();
  return import('./google-calendar.js');
}
async function settle<T>(p: Promise<T>) {
  const guarded = p.then(v => ({ ok: true as const, v }), e => ({ ok: false as const, e }));
  await vi.runAllTimersAsync();
  return guarded;
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const fn of Object.values(h)) fn.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('createEvent idempotente', () => {
  it('invia un id evento generato (hex valido per Google) e un timeout', async () => {
    const { createEvent } = await load();
    h.insert.mockResolvedValue({ data: { id: 'x' } });
    const r = await settle(createEvent('primary', { summary: 'S', start, end }));
    expect(r.ok).toBe(true);
    const [params, options] = h.insert.mock.calls[0];
    expect(params.requestBody.id).toMatch(/^[0-9a-f]{32}$/);
    expect(options).toMatchObject({ timeout: 15000 });
  });

  it('dopo un timeout ritenta con LO STESSO id e restituisce l\'evento', async () => {
    const { createEvent } = await load();
    h.insert.mockRejectedValueOnce(apiError('ETIMEDOUT')).mockResolvedValueOnce({ data: { id: 'ok' } });
    const r = await settle(createEvent('primary', { summary: 'S', start, end }));
    expect(r).toMatchObject({ ok: true, v: { id: 'ok' } });
    const ids = h.insert.mock.calls.map(([p]) => p.requestBody.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it('se il retry riceve 409 il primo tentativo era riuscito: restituisce l\'evento esistente, senza duplicati', async () => {
    const { createEvent } = await load();
    h.insert.mockRejectedValueOnce(apiError('ECONNRESET')).mockRejectedValueOnce(apiError(409));
    h.get.mockResolvedValue({ data: { id: 'existing' } });
    const r = await settle(createEvent('primary', { summary: 'S', start, end }));
    expect(r).toMatchObject({ ok: true, v: { id: 'existing' } });
    expect(h.get.mock.calls[0][0].eventId).toBe(h.insert.mock.calls[0][0].requestBody.id);
    expect(h.insert).toHaveBeenCalledTimes(2);
  });

  it('con id esplicito un 409 resta a carico del chiamante (riprogrammazione)', async () => {
    const { createEvent } = await load();
    h.insert.mockRejectedValue(apiError(409));
    const r = await settle(createEvent('primary', { id: 'fixedid1', summary: 'S', start, end }));
    expect(r.ok).toBe(false);
    expect((r as any).e.code).toBe(409);
    expect(h.get).not.toHaveBeenCalled();
  });

  it('dopo 3 tentativi su errore temporaneo persistente lancia', async () => {
    const { createEvent } = await load();
    h.insert.mockRejectedValue(apiError(503));
    const r = await settle(createEvent('primary', { summary: 'S', start, end }));
    expect(r.ok).toBe(false);
    expect(h.insert).toHaveBeenCalledTimes(3);
  });

  it('non ritenta errori permanenti', async () => {
    const { createEvent } = await load();
    h.insert.mockRejectedValue(apiError(403, { errors: [{ reason: 'forbidden' }] }));
    const r = await settle(createEvent('primary', { summary: 'S', start, end }));
    expect(r.ok).toBe(false);
    expect(h.insert).toHaveBeenCalledTimes(1);
  });

  it('marca l\'evento con il tipo CRM quando indicato', async () => {
    const { createEvent } = await load();
    h.insert.mockResolvedValue({ data: {} });
    await settle(createEvent('primary', { summary: 'S', start, end, kind: 'booking' }));
    expect(h.insert.mock.calls[0][0].requestBody.extendedProperties).toEqual({ private: { crmKind: 'booking' } });
    await settle(createEvent('primary', { summary: 'S', start, end }));
    expect(h.insert.mock.calls[1][0].requestBody.extendedProperties).toBeUndefined();
  });
});

describe('update / delete / get: timeout e retry sugli errori temporanei', () => {
  it('updateEvent ritenta un 429 e usa il timeout', async () => {
    const { updateEvent } = await load();
    h.patch.mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce({ data: { id: 'e' } });
    const r = await settle(updateEvent('primary', 'e', { start, end }));
    expect(r.ok).toBe(true);
    expect(h.patch).toHaveBeenCalledTimes(2);
    expect(h.patch.mock.calls[0][1]).toMatchObject({ timeout: 15000 });
  });

  it('deleteEvent ritenta un 503, e dopo 3 errori propaga', async () => {
    const { deleteEvent } = await load();
    h.del.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce({});
    expect((await settle(deleteEvent('primary', 'e'))).ok).toBe(true);
    h.del.mockReset(); h.del.mockRejectedValue(apiError(500));
    expect((await settle(deleteEvent('primary', 'e'))).ok).toBe(false);
    expect(h.del).toHaveBeenCalledTimes(3);
  });

  it('getEventById ritenta un errore di rete', async () => {
    const { getEventById } = await load();
    h.get.mockRejectedValueOnce(apiError('ECONNRESET')).mockResolvedValueOnce({ data: { id: 'e' } });
    const r = await settle(getEventById('primary', 'e'));
    expect(r).toMatchObject({ ok: true, v: { id: 'e' } });
  });
});
