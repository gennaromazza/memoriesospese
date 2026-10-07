import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  google: [] as any[],
  platform: [] as any[],
  pending: [] as any[],
  confirmed: [] as any[],
}));

vi.mock('../calendar-engine/google-sync.js', () => ({
  checkGoogleCalendarBusyPeriods: vi.fn(async () => h.google),
}));

vi.mock('../consultations/calendar-adapter.js', () => ({
  getAllExistingEvents: vi.fn(async (_start: Date, _end: Date, _db: unknown, options: unknown) => {
    expect(options).toMatchObject({
      includeGoogle: false,
      includeConsultations: true,
      includeBookings: false,
      includeJobs: true,
    });
    return h.platform;
  }),
}));

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { fromDate: (date: Date) => ({ date }) },
}));

import { getAllExistingBookingEvents } from './calendar-adapter.js';

function fakeDb() {
  return {
    collection: (name: string) => {
      if (name !== 'bookings') throw new Error(`collezione inattesa: ${name}`);
      let state = '';
      const chain: any = {
        where: (field: string, _operator: string, value: unknown) => {
          if (field === 'stato') state = String(value);
          return chain;
        },
        get: async () => {
          const docs = state === 'in_attesa' ? h.pending : h.confirmed;
          return { docs, size: docs.length };
        },
      };
      return chain;
    },
  } as any;
}

function booking(id: string, start: Date, end: Date) {
  return { id, data: () => ({ dataShootingInizio: { toDate: () => start }, dataShootingFine: { toDate: () => end } }) };
}

describe('getAllExistingBookingEvents', () => {
  beforeEach(() => {
    h.google = [];
    h.platform = [];
    h.pending = [];
    h.confirmed = [];
  });

  it('centralizza Google, consulenze, Job e prenotazioni pendenti/confermate', async () => {
    const start = new Date('2026-09-17T07:00:00.000Z');
    const end = new Date('2026-09-17T18:00:00.000Z');
    h.google = [{ start, end, allDay: false }];
    h.platform = [
      { start: new Date('2026-09-17T08:00:00.000Z'), end: new Date('2026-09-17T09:00:00.000Z'), allDay: false, source: 'consultation' },
      { start: new Date('2026-09-17T10:00:00.000Z'), end: new Date('2026-09-17T18:00:00.000Z'), allDay: true, source: 'job' },
    ];
    h.pending = [booking('pending-1', new Date('2026-09-17T12:00:00.000Z'), new Date('2026-09-17T13:00:00.000Z'))];
    h.confirmed = [booking('confirmed-1', new Date('2026-09-17T14:00:00.000Z'), new Date('2026-09-17T15:00:00.000Z'))];

    const events = await getAllExistingBookingEvents(start, end, fakeDb());

    expect(events).toHaveLength(5);
    expect(events.map((event) => event.source)).toEqual(expect.arrayContaining([
      'google_calendar', 'firestore_consultation', 'firestore_job', 'firestore_booking',
    ]));
    expect(events.map((event) => event.id)).toEqual(expect.arrayContaining(['pending-1', 'confirmed-1']));
  });
});
