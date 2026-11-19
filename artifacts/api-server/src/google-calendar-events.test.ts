import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ del: vi.fn(), get: vi.fn() }));
vi.mock('googleapis', () => ({
  google: {
    auth: { JWT: class { async authorize() { return {}; } } },
    calendar: () => ({ events: { delete: h.del, get: h.get }, calendarList: { get: vi.fn(), list: vi.fn() } }),
  },
}));

const apiError = (code: number, message = 'err') => Object.assign(new Error(message), { code, response: { status: code } });

async function load() {
  process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL = 'sa@p.iam.gserviceaccount.com';
  process.env.GOOGLE_CALENDAR_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----';
  vi.resetModules();
  return import('./google-calendar.js');
}
beforeEach(() => {
  h.del.mockReset(); h.get.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('deleteEvent: un evento gia\' eliminato non e\' un errore', () => {
  it.each([404, 410])('risolve con true su %i', async (status) => {
    const { deleteEvent } = await load();
    h.del.mockRejectedValue(apiError(status, status === 410 ? 'Resource has been deleted' : 'Not Found'));
    await expect(deleteEvent('primary', 'evt')).resolves.toBe(true);
  });

  it.each([403, 500, 429])('propaga ancora gli altri errori (%i)', async (status) => {
    const { deleteEvent } = await load();
    h.del.mockRejectedValue(apiError(status));
    await expect(deleteEvent('primary', 'evt')).rejects.toMatchObject({ code: status });
  });
});

describe('getEventById', () => {
  it.each([404, 410])('restituisce null su %i', async (status) => {
    const { getEventById } = await load();
    h.get.mockRejectedValue(apiError(status));
    await expect(getEventById('primary', 'evt')).resolves.toBeNull();
  });

  it('propaga gli errori temporanei', async () => {
    const { getEventById } = await load();
    h.get.mockRejectedValue(apiError(503));
    await expect(getEventById('primary', 'evt')).rejects.toMatchObject({ code: 503 });
  });
});
