import { beforeEach, describe, expect, it, vi } from 'vitest';

// Audit 19/11/2026: il worker azzerava googleCalendarEventId di record validi quando
// l'evento era oltre la finestra letta (-30/+90 giorni) o segnato "Libero".
const h = vi.hoisted(() => ({
  records: [] as any[],
  updates: [] as Array<{ id: string; data: any }>,
  gcal: [] as any[],          // eventi nel calendario (events.list li filtra per finestra e trasparenza non e' filtrata da Google)
  getErrors: new Map<string, any>(),
  getCalls: [] as string[],
  orphans: vi.fn(),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: { JWT: class { async authorize() { return {}; } } },
    calendar: () => ({
      calendarList: { get: vi.fn(), insert: vi.fn(), list: async () => ({ data: { items: [{ id: 'studio', summary: 'Studio' }] } }) },
      events: {
        list: async ({ timeMin, timeMax }: any) => ({
          data: { items: h.gcal.filter(e => e.start.dateTime >= timeMin && e.start.dateTime <= timeMax) },
        }),
        get: async ({ eventId }: any) => {
          h.getCalls.push(eventId);
          const error = h.getErrors.get(eventId);
          if (error) throw error;
          const found = h.gcal.find(e => e.id === eventId);
          if (!found) throw Object.assign(new Error('Not Found'), { code: 404 });
          return { data: found };
        },
      },
    }),
  },
}));
vi.mock('../firebase-admin.js', () => {
  const collection = (name: string) => ({
    where: () => ({
      get: async () => ({
        empty: name === 'jobs',
        docs: name === 'jobs' ? [] : h.records.filter(r => r.collection === name).map(r => ({ id: r.id, data: () => r.data })),
      }),
    }),
    doc: (id: string) => ({ update: async (data: any) => { h.updates.push({ id, data }); } }),
  });
  return { db: { collection }, FieldValue: { delete: () => 'DEL', serverTimestamp: () => 'TS' }, Timestamp: { now: () => 'now', fromDate: (d: Date) => d } };
});
vi.mock('../system-alerts.js', () => ({ notifyCalendarUnavailable: vi.fn(), notifyOrphanCalendarEvents: h.orphans }));
vi.mock('../job-routes.js', () => ({ ensureJobCalendarEvent: vi.fn() }));

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);
const dateOf = (n: number) => ({ toDate: () => inDays(n) });
const gEvent = (id: string, days: number, extra: Record<string, unknown> = {}) =>
  ({ id, status: 'confirmed', start: { dateTime: inDays(days).toISOString() }, end: { dateTime: inDays(days).toISOString() }, ...extra });
const booking = (id: string, eventId: string, days: number) =>
  ({ collection: 'bookings', id, data: { stato: 'confermata', googleCalendarEventId: eventId, dataShootingInizio: dateOf(days) } });

async function runGuard() {
  process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL = 'sa@p.iam.gserviceaccount.com';
  process.env.GOOGLE_CALENDAR_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----';
  vi.resetModules();
  const { runEventSyncGuard } = await import('./event-sync-guard.js');
  return runEventSyncGuard();
}

beforeEach(() => {
  h.records = []; h.updates = []; h.gcal = []; h.getErrors = new Map(); h.getCalls = []; h.orphans.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('event sync guard: non azzera riferimenti validi', () => {
  it('non tocca una prenotazione il cui evento e\' oltre la finestra letta (+200 giorni)', async () => {
    h.gcal = [gEvent('far', 200)];
    h.records = [booking('b-far', 'far', 200)];
    await runGuard();
    expect(h.updates).toEqual([]);
    expect(h.getCalls).toEqual([]); // fuori finestra: nessuna verifica inutile
  });

  it('non tocca i record passati da piu\' di 30 giorni', async () => {
    h.records = [booking('b-old', 'old-event', -90)];
    await runGuard();
    expect(h.updates).toEqual([]);
  });

  it('non azzera un evento in finestra segnato "Libero" (non e\' nel set ma esiste ancora)', async () => {
    h.gcal = [gEvent('free', 5, { transparency: 'transparent' })];
    h.records = [booking('b-free', 'free', 5)];
    await runGuard();
    expect(h.getCalls).toEqual(['free']);
    expect(h.updates).toEqual([]);
  });

  it.each([
    ['404', Object.assign(new Error('Not Found'), { code: 404 })],
    ['410 Gone', Object.assign(new Error('Resource has been deleted'), { code: 410 })],
  ])('azzera il riferimento se l\'evento in finestra non esiste piu\' (%s)', async (_label, error) => {
    h.records = [booking('b-gone', 'gone', 7)];
    h.getErrors.set('gone', error);
    await runGuard();
    expect(h.updates).toEqual([{ id: 'b-gone', data: { googleCalendarEventId: null } }]);
  });

  it('azzera il riferimento se Google restituisce l\'evento con stato cancelled', async () => {
    h.gcal = [gEvent('cancelled', 7, { status: 'cancelled' })];
    h.records = [booking('b-cancelled', 'cancelled', 7)];
    await runGuard();
    expect(h.updates).toEqual([{ id: 'b-cancelled', data: { googleCalendarEventId: null } }]);
  });

  it('non azzera se la verifica fallisce per un errore temporaneo (500)', async () => {
    h.records = [booking('b-unknown', 'unknown', 7)];
    h.getErrors.set('unknown', Object.assign(new Error('Backend Error'), { code: 500 }));
    await runGuard();
    expect(h.updates).toEqual([]);
  });

  it('non verifica ne\' azzera gli eventi presenti nella finestra', async () => {
    h.gcal = [gEvent('ok', 3)];
    h.records = [booking('b-ok', 'ok', 3)];
    await runGuard();
    expect(h.getCalls).toEqual([]);
    expect(h.updates).toEqual([]);
  });

  it('applica le stesse regole alle consulenze', async () => {
    h.records = [
      { collection: 'consultations', id: 'c-far', data: { stato: 'confermata', googleCalendarEventId: 'far', dataConsulenza: dateOf(150) } },
      { collection: 'consultations', id: 'c-gone', data: { stato: 'confermata', googleCalendarEventId: 'gone', dataConsulenza: dateOf(4) } },
    ];
    await runGuard();
    expect(h.updates).toEqual([{ id: 'c-gone', data: { googleCalendarEventId: null } }]);
  });
});

describe('event sync guard: avviso per eventi CRM orfani', () => {
  const crm = (kind: string, createdMinutesAgo: number) => ({
    extendedProperties: { private: { crmKind: kind } },
    created: new Date(Date.now() - createdMinutesAgo * 60_000).toISOString(),
  });

  it('avvisa l\'admin per un evento creato dal CRM (prenotazione/consulenza) senza record, da oltre 15 minuti', async () => {
    h.gcal = [
      gEvent('orphan-b', 3, { summary: 'Shooting: Anna', ...crm('booking', 60) }),
      gEvent('orphan-c', 4, { summary: 'Consulenza', ...crm('consultation', 120) }),
    ];
    await runGuard();
    expect(h.orphans).toHaveBeenCalledTimes(1);
    expect(h.orphans.mock.calls[0][0].map((e: any) => e.id).sort()).toEqual(['orphan-b', 'orphan-c']);
  });

  it('ignora eventi appena creati, di altri tipi, o non creati dal CRM', async () => {
    h.gcal = [
      gEvent('fresh', 3, crm('booking', 1)),               // il record potrebbe non essere ancora salvato
      gEvent('job', 3, crm('job', 600)),                   // i job hanno un loro riferimento
      gEvent('personal', 3, { summary: 'Dentista' }),      // impegno personale
    ];
    await runGuard();
    expect(h.orphans).not.toHaveBeenCalled();
  });

  it('non avvisa per eventi con un record collegato', async () => {
    h.gcal = [gEvent('linked', 3, crm('booking', 600))];
    h.records = [booking('b1', 'linked', 3)];
    await runGuard();
    expect(h.orphans).not.toHaveBeenCalled();
  });
});
