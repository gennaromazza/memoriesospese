import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  busy: [] as Array<{ start: Date; end: Date }>,
  busyError: null as Error | null,
  createEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock('../google-calendar.js', () => ({ createEvent: h.createEvent, deleteEvent: h.deleteEvent }));
vi.mock('../calendar-engine/google-sync.js', () => ({
  checkGoogleCalendarBusyPeriods: async () => {
    if (h.busyError) throw h.busyError;
    return h.busy;
  },
}));
vi.mock('../lib/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('firebase-admin/firestore', async importOriginal => ({
  ...await importOriginal<typeof import('firebase-admin/firestore')>(),
  FieldValue: { serverTimestamp: () => ({ __ts: true }) },
}));

import { AutomaticConfirmationError, confirmPublicBooking } from './public-creation.js';

const start = new Date('2027-02-10T09:00:00Z');
const end = new Date('2027-02-10T10:00:00Z');
const data = { cliente: { nome: 'Anna', cognome: 'Rossi', email: 'a@example.test', whatsapp: '1' }, statoWorkflow: undefined };
const ref = { id: 'b1', update: vi.fn(), delete: vi.fn() } as any;

beforeEach(() => {
  vi.clearAllMocks();
  h.busy = [];
  h.busyError = null;
  h.createEvent.mockResolvedValue({ id: 'evt-1' });
  h.deleteEvent.mockResolvedValue(undefined);
  ref.update.mockResolvedValue(undefined);
  ref.delete.mockResolvedValue(undefined);
});

describe('confermaPublicBooking: ricontrollo di Google subito prima di creare l\'evento', () => {
  it('crea l\'evento e conferma se Google non ha impegni sovrapposti (anche slot adiacenti)', async () => {
    h.busy = [{ start: new Date('2027-02-10T08:00:00Z'), end: start }, { start: end, end: new Date('2027-02-10T11:00:00Z') }];
    await confirmPublicBooking(ref, data, start, end);
    expect(h.createEvent).toHaveBeenCalledTimes(1);
    expect(ref.update).toHaveBeenCalledWith(expect.objectContaining({ stato: 'confermata', googleCalendarEventId: 'evt-1' }));
    expect(ref.delete).not.toHaveBeenCalled();
  });

  it('non crea l\'evento se nel frattempo Google ha un impegno sovrapposto: libera la riserva e risponde 409', async () => {
    h.busy = [{ start: new Date('2027-02-10T09:30:00Z'), end: new Date('2027-02-10T10:30:00Z') }];
    const failure = await confirmPublicBooking(ref, data, start, end).catch(e => e);
    expect(failure).toBeInstanceOf(AutomaticConfirmationError);
    expect(failure).toMatchObject({ status: 409, bookingRetained: false });
    expect(h.createEvent).not.toHaveBeenCalled();
    expect(ref.delete).toHaveBeenCalledTimes(1);
  });

  it('se Google non e\' leggibile non crea l\'evento: libera la riserva e risponde 503', async () => {
    h.busyError = Object.assign(new Error('CALENDAR_UNAVAILABLE'), { code: 'CALENDAR_UNAVAILABLE' });
    const failure = await confirmPublicBooking(ref, data, start, end).catch(e => e);
    expect(failure).toMatchObject({ status: 503, bookingRetained: false });
    expect(h.createEvent).not.toHaveBeenCalled();
    expect(ref.delete).toHaveBeenCalledTimes(1);
  });

  it('se la riserva non si riesce a eliminare viene segnalata come mantenuta', async () => {
    h.busy = [{ start, end }];
    ref.delete.mockRejectedValue(new Error('Firestore down'));
    const failure = await confirmPublicBooking(ref, data, start, end).catch(e => e);
    expect(failure).toMatchObject({ status: 409, bookingRetained: true });
  });
});
