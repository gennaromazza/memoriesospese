import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ list: vi.fn(), authorize: vi.fn() }));
vi.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: class {
        email = 'active@test.iam.gserviceaccount.com';
        authorize = h.authorize;
      },
    },
    calendar: () => ({ events: { list: h.list } }),
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('GOOGLE_CALENDAR_ID', 'studio@example.test');
  vi.stubEnv('GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL', 'dedicated@test.iam.gserviceaccount.com');
  vi.stubEnv('GOOGLE_CALENDAR_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----');
  vi.stubEnv('FIREBASE_ADMIN_CREDENTIALS', '');
  h.list.mockReset();
  h.authorize.mockReset().mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());

describe('stato collegamento calendario', () => {
  it.each(['', 'primary', '   '])('non mostra successo senza destinazione esplicita: %s', async (id) => {
    vi.stubEnv('GOOGLE_CALENDAR_ID', id);
    const { getCalendarConnectionStatus } = await import('./google-calendar.js');
    const result = await getCalendarConnectionStatus();
    expect(result.connected).toBe(false);
    expect(result.error).toContain('GOOGLE_CALENDAR_ID');
    expect(h.authorize).not.toHaveBeenCalled();
    expect(h.list).not.toHaveBeenCalled();
  });

  it.each(['writer', 'owner'])('verifica davvero il calendario con ruolo %s', async (accessRole) => {
    h.list.mockResolvedValue({ data: { accessRole } });
    const { getCalendarConnectionStatus } = await import('./google-calendar.js');
    expect(await getCalendarConnectionStatus()).toMatchObject({
      connected: true,
      calendarId: 'studio@example.test',
      accountEmail: 'active@test.iam.gserviceaccount.com',
    });
    expect(h.list).toHaveBeenCalledWith(
      { calendarId: 'studio@example.test', maxResults: 1, fields: 'accessRole' },
      { timeout: 15000 },
    );
  });

  it.each(['reader', 'freeBusyReader', undefined])('non accetta permessi insufficienti: %s', async (accessRole) => {
    h.list.mockResolvedValue({ data: { accessRole } });
    const { getCalendarConnectionStatus } = await import('./google-calendar.js');
    const result = await getCalendarConnectionStatus();
    expect(result.connected).toBe(false);
    expect(result.error).toContain('Apportare modifiche agli eventi');
  });

  it.each([403, 404])('se Google risponde %s non basta essere autenticati', async (code) => {
    h.list.mockRejectedValue(Object.assign(new Error('Google error'), { code }));
    const { getCalendarConnectionStatus } = await import('./google-calendar.js');
    const result = await getCalendarConnectionStatus();
    expect(result.connected).toBe(false);
    expect(result.error).toContain(code === 404 ? 'non trovato' : 'negato');
  });
});
