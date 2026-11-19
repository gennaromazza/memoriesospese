import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
const h = vi.hoisted(() => ({ events: [] as any[], platform: [] as any[] }));
vi.mock('../firebase-admin.js', async () => ({ db: (await import('./test-helpers/reservation-db.js')).reservationDb().db }));
vi.mock('../google-calendar.js', async original => ({
  ...await original<typeof import('../google-calendar.js')>(),
  resolveCalendarId: () => 'studio-calendar',
  getEventsWithDetailsAllCalendars: vi.fn(async () => h.events),
  updateEvent: vi.fn(async () => ({ id: 'event-one' })),
  createEvent: vi.fn(async (_calendar: string, event: any) => ({ id: event.id })),
  getEventById: vi.fn(),
}));
vi.mock('../consultations/calendar-adapter.js', () => ({ getAllExistingEvents: vi.fn(async () => h.platform) }));
vi.mock('../email-routes.js', async original => ({
  ...await original<typeof import('../email-routes.js')>(),
  getStudioContactInfo: vi.fn(async () => ({ name: 'Studio test', email: 'studio@example.test', address: 'Via test', phone: '00000000', whatsapp: '' })),
  sendGmailEmail: vi.fn(async () => undefined),
}));
import { reservationDb } from './test-helpers/reservation-db.js';
import { ensureBookingManagementLink, changeManagementLink } from './management-access.js';
import { reserveManagedReschedule, slotsForManagedBooking } from './rescheduling.js';
import { deliverManagedReschedule } from './reschedule-delivery.js';
import { RESCHEDULE_JOBS } from './reschedule-policy.js';
import { checkSlotReservation, loadCheckoutHoldEvents } from './slot-reservations.js';
import { updateEvent, createEvent, getEventById, getEventsWithDetailsAllCalendars } from '../google-calendar.js';
import { sendGmailEmail } from '../email-routes.js';

const original = new Date('2030-12-10T09:00:00Z'), target = new Date('2030-12-11T09:00:00Z');
const finish = (date: Date) => new Date(date.getTime() + 1_800_000);
const timestamp = (date: Date) => Timestamp.fromDate(date);
let store: ReturnType<typeof reservationDb>;
async function fixture(id = 'one', start = original) {
  store.seed(`bookings/${id}`, { stato: 'confermata', campaignId: 'campaign',
    cliente: { nome: 'Marta', cognome: 'Test', email: `${id}@example.test` },
    dataShootingInizio: timestamp(start), dataShootingFine: timestamp(finish(start)),
    googleCalendarEventId: `event-${id}`, acconto: 20, prodottoId: 'product', prodottoNome: 'Pacchetto test', noteAdmin: 'private',
    depositPayment: { status: 'paid', provider: 'paypal', currency: 'EUR', amountCents: 2000,
      paypalOrderId: `order-${id}`, paypalCaptureId: `capture-${id}`, paypalFeeCents: 84 },
  });
  const url = await ensureBookingManagementLink(store.db, id);
  return { id, input: { token: new URL(url).hash.slice(1), requestId: randomUUID(),
    expectedStartsAt: start, startsAt: target, endsAt: finish(target) } };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2030-12-01T12:00:00Z'));
  vi.stubEnv('SESSION_SECRET', 'reschedule-test-key-not-a-real-secret');
  h.events = []; h.platform = []; store = reservationDb();
  store.seed('booking_campaigns/campaign', { attiva: true, nome: 'Ritratti test', orarioApertura: '09:00',
    orarioPausaInizio: '13:00', orarioPausaFine: '14:00', orarioChiusura: '18:00', durataShootingMinuti: 30,
    dataInizio: timestamp(new Date('2030-12-01T00:00:00Z')), dataFine: timestamp(new Date('2030-12-20T00:00:00Z')) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('customer rescheduling', () => {
  it('reserves both slots, then changes atomically without touching the receipt and sends one real confirmation template', async () => {
    const { id, input } = await fixture(), before = store.value(`bookings/${id}`);
    await reserveManagedReschedule(store.db, id, input);
    expect(store.value(`bookings/${id}`).dataShootingInizio.toMillis()).toBe(original.getTime());
    expect(store.value(`bookings/${id}`).customerRescheduleCount).toBeUndefined();
    for (const start of [original, target]) {
      await expect(store.db.runTransaction(tx => checkSlotReservation(tx, store.db, start, finish(start)))).rejects.toThrow('Slot');
    }
    await Promise.all([deliverManagedReschedule(store.db, id), deliverManagedReschedule(store.db, id)]);
    const after = store.value(`bookings/${id}`);
    expect(after.dataShootingInizio.toMillis()).toBe(target.getTime());
    expect(after).toMatchObject({ customerRescheduleCount: 1, depositPayment: before.depositPayment, acconto: 20,
      prodottoId: 'product', noteAdmin: 'private', googleCalendarEventId: 'event-one', customerReschedule: { status: 'complete', emailStatus: 'sent' } });
    expect(updateEvent).toHaveBeenCalledTimes(1);
    expect(updateEvent).toHaveBeenCalledWith('studio-calendar', 'event-one', { start: target, end: finish(target) });
    expect(createEvent).not.toHaveBeenCalled();
    expect(sendGmailEmail).toHaveBeenCalledTimes(1);
    const [, subject, html] = vi.mocked(sendGmailEmail).mock.calls[0];
    expect(subject).toContain('Riprogrammata');
    expect(html).toContain('11 dicembre 2030');
    expect(html).toContain(`/prenota/gestisci/${id}#${input.token}`);
    expect(html).toContain('automatica');
    await store.db.runTransaction(tx => checkSlotReservation(tx, store.db, original, finish(original)));
    await reserveManagedReschedule(store.db, id, input); await deliverManagedReschedule(store.db, id);
    expect(updateEvent).toHaveBeenCalledTimes(1); expect(sendGmailEmail).toHaveBeenCalledTimes(1);
  });
  it('rejects a second change and reuse of an intent with a different destination', async () => {
    const { id, input } = await fixture();
    await reserveManagedReschedule(store.db, id, input); await deliverManagedReschedule(store.db, id);
    await expect(reserveManagedReschedule(store.db, id, { ...input, requestId: randomUUID() })).rejects.toThrow('già utilizzato');
    await expect(reserveManagedReschedule(store.db, id, { ...input, startsAt: new Date(target.getTime() + 3_600_000) })).rejects.toThrow('già usata');
  });
  it('rejects an occupied slot without consuming the change or releasing the original', async () => {
    const { id, input } = await fixture();
    store.seed('bookings/other', { stato: 'confermata', dataShootingInizio: timestamp(target), dataShootingFine: timestamp(finish(target)) });
    await expect(reserveManagedReschedule(store.db, id, input)).rejects.toThrow('non è più disponibile');
    expect(store.value(`bookings/${id}`).customerRescheduleCount).toBeUndefined();
    expect(store.value(`bookings/${id}`).dataShootingInizio.toMillis()).toBe(original.getTime());
    expect(updateEvent).not.toHaveBeenCalled();
  });
  it('allows exactly 24 hours before and denies one millisecond later', async () => {
    const { id, input } = await fixture();
    vi.setSystemTime(original.getTime() - 86_400_000);
    expect((await slotsForManagedBooking(store.db, id, input.token, '2030-12-11')).slots.length).toBeGreaterThan(0);
    vi.setSystemTime(original.getTime() - 86_400_000 + 1);
    await expect(reserveManagedReschedule(store.db, id, input)).rejects.toThrow('24 ore');
  });
  it('Natale 2026: il cambio e\' consentito fino a 4 giorni prima, non oltre', async () => {
    const { id, input } = await fixture(), campaign = store.value('booking_campaigns/campaign');
    store.seed('booking_campaigns/campaign', { ...campaign, nome: 'Natale 2026', temaStagionale: 'natale' });
    vi.setSystemTime(original.getTime() - 4 * 86_400_000);
    expect((await slotsForManagedBooking(store.db, id, input.token, '2030-12-11')).slots.length).toBeGreaterThan(0);
    vi.setSystemTime(original.getTime() - 4 * 86_400_000 + 1);
    await expect(reserveManagedReschedule(store.db, id, input)).rejects.toThrow('4 giorni');
  });
  it('rejects expired/disabled campaigns, out-of-period days and forged durations', async () => {
    const { id, input } = await fixture(), campaign = store.value('booking_campaigns/campaign');
    store.seed('booking_campaigns/campaign', { ...campaign, dataFine: timestamp(new Date('2030-11-30')) });
    await expect(reserveManagedReschedule(store.db, id, input)).rejects.toThrow('non è più prenotabile');
    store.seed('booking_campaigns/campaign', { ...campaign, attiva: false });
    await expect(reserveManagedReschedule(store.db, id, input)).rejects.toThrow('non è più prenotabile');
    store.seed('booking_campaigns/campaign', campaign);
    await expect(slotsForManagedBooking(store.db, id, input.token, '2030-12-21')).rejects.toThrow('periodo');
    await expect(reserveManagedReschedule(store.db, id, { ...input, endsAt: new Date(finish(target).getTime() + 60_000) })).rejects.toThrow('non è più disponibile');
  });
  it('supports campaigns without a lunch break and respects excluded days', async () => {
    const { id, input } = await fixture(), campaign = store.value('booking_campaigns/campaign');
    store.seed('booking_campaigns/campaign', { ...campaign, orarioPausaInizio: '', orarioPausaFine: '' });
    expect((await slotsForManagedBooking(store.db, id, input.token, '2030-12-11')).slots.length).toBeGreaterThan(0);
    store.seed('booking_campaigns/campaign', { ...campaign, excludedDays: [3] });
    expect((await slotsForManagedBooking(store.db, id, input.token, '2030-12-11')).slots).toEqual([]);
  });
  it('excludes only its own Google event, not another calendar with the same event ID', async () => {
    const { id, input } = await fixture();
    const event = { calendarId: 'studio-calendar', eventId: 'event-one',
      start: original.toISOString(), end: new Date(original.getTime() + 3_600_000).toISOString() };
    h.events = [event, { ...event, calendarId: 'another-calendar' }];
    const adjacent = finish(original).getTime();
    expect((await slotsForManagedBooking(store.db, id, input.token, '2030-12-10')).slots.some(slot => new Date(slot.startsAt).getTime() === adjacent)).toBe(false);
    h.events = [event];
    expect((await slotsForManagedBooking(store.db, id, input.token, '2030-12-10')).slots.some(slot => new Date(slot.startsAt).getTime() === adjacent)).toBe(true);
    expect(getEventsWithDetailsAllCalendars).toHaveBeenLastCalledWith(expect.any(Date), expect.any(Date),
      { strict: true, excludeEvent: { eventId: 'event-one', calendarId: 'studio-calendar' } });
  });
  it('fails closed for unavailable Google calendars and blocks CRM jobs too', async () => {
    const { id, input } = await fixture();
    vi.mocked(getEventsWithDetailsAllCalendars).mockRejectedValueOnce(new Error('Calendar offline'));
    await expect(slotsForManagedBooking(store.db, id, input.token, '2030-12-11')).rejects.toThrow('CALENDAR_UNAVAILABLE');
    h.platform = [{ start: target, end: finish(target), source: 'job', allDay: false }];
    await expect(reserveManagedReschedule(store.db, id, input)).rejects.toThrow('non è più disponibile');
  });
  it('serializes two competing destinations for one booking', async () => {
    const { id, input } = await fixture();
    const outcomes = await Promise.allSettled([reserveManagedReschedule(store.db, id, input),
      reserveManagedReschedule(store.db, id, { ...input, requestId: randomUUID(), startsAt: finish(target), endsAt: finish(finish(target)) })]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(store.value(`bookings/${id}`).customerRescheduleCount).toBeUndefined();
  });
  it('accepts simultaneous retries of the identical intent without taking a second change', async () => {
    const { id, input } = await fixture();
    await Promise.all([reserveManagedReschedule(store.db, id, input), reserveManagedReschedule(store.db, id, input)]);
    await Promise.all([deliverManagedReschedule(store.db, id), deliverManagedReschedule(store.db, id)]);
    expect(store.value(`bookings/${id}`).customerRescheduleCount).toBe(1);
    expect(updateEvent).toHaveBeenCalledTimes(1);
    expect(sendGmailEmail).toHaveBeenCalledTimes(1);
  });
  it('serializes competing bookings across campaigns on the destination day guard', async () => {
    const one = await fixture('one'), two = await fixture('two', new Date(original.getTime() + 3_600_000));
    store.seed('booking_campaigns/second', { ...store.value('booking_campaigns/campaign') });
    store.seed('bookings/two', { ...store.value('bookings/two'), campaignId: 'second' });
    const run = store.db.runTransaction.bind(store.db);
    let arrivals = 0, release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    // Both requests must finish their preflight before either transaction runs.
    vi.spyOn(store.db, 'runTransaction').mockImplementation(async callback => {
      if (++arrivals <= 2) { if (arrivals === 2) release(); await gate; }
      return run(callback);
    });
    const outcomes = await Promise.allSettled([reserveManagedReschedule(store.db, one.id, one.input), reserveManagedReschedule(store.db, two.id, two.input)]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(store.retries()).toBeGreaterThan(0);
  });
  it('rejects revoked and wrong-booking tokens', async () => {
    const one = await fixture(), two = await fixture('two');
    await expect(slotsForManagedBooking(store.db, two.id, one.input.token, '2030-12-11')).rejects.toThrow('Link');
    await changeManagementLink(store.db, one.id, { action: 'revoke', requestId: randomUUID(), expectedVersion: 1 }, 'staff');
    await expect(reserveManagedReschedule(store.db, one.id, one.input)).rejects.toThrow('Link');
    expect(updateEvent).not.toHaveBeenCalled();
  });
  it('does not turn read access for cancelled or completed bookings into permission to reschedule', async () => {
    const { id, input } = await fixture(), root = store.value(`bookings/${id}`);
    for (const stato of ['annullata', 'completata', 'cancellation_pending']) {
      store.seed(`bookings/${id}`, { ...root, stato });
      await expect(reserveManagedReschedule(store.db, id, input)).rejects.toThrow('confermata');
    }
    expect(updateEvent).not.toHaveBeenCalled();
  });
  it('retries an uncertain calendar response with the same event and retains both reservations until recovery', async () => {
    const { id, input } = await fixture();
    await reserveManagedReschedule(store.db, id, input);
    vi.mocked(updateEvent).mockRejectedValueOnce(new Error('Socket timeout after sending patch'));
    await deliverManagedReschedule(store.db, id);
    expect(store.value(`bookings/${id}`).customerRescheduleCount).toBeUndefined();
    expect((await loadCheckoutHoldEvents(store.db, target, finish(target)))[0].id).toBe(`reschedule-${id}`);
    expect(sendGmailEmail).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 60_001);
    await deliverManagedReschedule(store.db, id);
    expect(store.value(`bookings/${id}`).customerRescheduleCount).toBe(1);
    expect(updateEvent).toHaveBeenCalledTimes(2); expect(createEvent).not.toHaveBeenCalled();
    expect(sendGmailEmail).toHaveBeenCalledTimes(1);
  });
  it('does not consume the change after a definite first Calendar rejection', async () => {
    const { id, input } = await fixture();
    await reserveManagedReschedule(store.db, id, input);
    vi.mocked(updateEvent).mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { code: 403 }));
    await deliverManagedReschedule(store.db, id);
    expect(store.value(`${RESCHEDULE_JOBS}/${id}`).status).toBe('failed');
    expect(store.value(`bookings/${id}`).customerRescheduleCount).toBeUndefined();
    expect(await loadCheckoutHoldEvents(store.db, target, finish(target))).toEqual([]);
    await reserveManagedReschedule(store.db, id, { ...input, requestId: randomUUID() });
  });
  it('recovers if Calendar succeeds but the final database transaction fails', async () => {
    const { id, input } = await fixture();
    await reserveManagedReschedule(store.db, id, input);
    const run = store.db.runTransaction.bind(store.db);
    let failed = false;
    vi.spyOn(store.db, 'runTransaction').mockImplementation(async callback => {
      if (!failed && vi.mocked(updateEvent).mock.calls.length) { failed = true; throw new Error('Database temporarily unavailable'); }
      return run(callback);
    });
    await deliverManagedReschedule(store.db, id);
    expect(store.value(`bookings/${id}`).dataShootingInizio.toMillis()).toBe(original.getTime());
    expect(store.value(`bookings/${id}`).customerRescheduleCount).toBeUndefined();
    vi.setSystemTime(Date.now() + 60_001); await deliverManagedReschedule(store.db, id);
    expect(store.value(`bookings/${id}`).customerRescheduleCount).toBe(1);
    expect(updateEvent).toHaveBeenCalledTimes(2); expect(createEvent).not.toHaveBeenCalled();
    expect(sendGmailEmail).toHaveBeenCalledTimes(1);
  });
  it('creates a stable event ID for a legacy paid booking without an event or an initial synchronization in progress', async () => {
    const { id, input } = await fixture();
    store.seed(`bookings/${id}`, { ...store.value(`bookings/${id}`), googleCalendarEventId: null, calendarSyncPending: false });
    await reserveManagedReschedule(store.db, id, input); await deliverManagedReschedule(store.db, id);
    const booking = store.value(`bookings/${id}`);
    expect(booking.googleCalendarEventId).toMatch(/^[a-f0-9]{64}$/);
    expect(booking.calendarSyncPending).toBe(false);
    expect(createEvent).toHaveBeenCalledTimes(1);
  });
  it('reconciles an uncertain insert by its stable ID instead of creating another event', async () => {
    const { id, input } = await fixture();
    store.seed(`bookings/${id}`, { ...store.value(`bookings/${id}`), googleCalendarEventId: null });
    await reserveManagedReschedule(store.db, id, input);
    vi.mocked(createEvent).mockRejectedValueOnce(new Error('Timeout after insert'));
    await deliverManagedReschedule(store.db, id);
    const eventId = store.value(`${RESCHEDULE_JOBS}/${id}`).eventId;
    vi.mocked(createEvent).mockRejectedValueOnce(Object.assign(new Error('Already exists'), { code: 409 }));
    vi.mocked(getEventById).mockResolvedValueOnce({ id: eventId, start: { dateTime: target.toISOString() }, end: { dateTime: finish(target).toISOString() } });
    vi.setSystemTime(Date.now() + 60_001); await deliverManagedReschedule(store.db, id);
    expect(store.value(`bookings/${id}`).googleCalendarEventId).toBe(eventId);
    expect(vi.mocked(createEvent).mock.calls.map(call => call[1].id)).toEqual([eventId, eventId]);
    expect(sendGmailEmail).toHaveBeenCalledTimes(1);
  });
  it('does not resend an email whose provider response is uncertain or repeat the calendar update', async () => {
    const { id, input } = await fixture();
    await reserveManagedReschedule(store.db, id, input);
    const send = vi.fn(async () => { throw new Error('Gmail timeout'); });
    await deliverManagedReschedule(store.db, id, { send });
    expect(store.value(`bookings/${id}`).customerReschedule.emailStatus).toBe('unknown');
    await deliverManagedReschedule(store.db, id, { send });
    expect(send).toHaveBeenCalledTimes(1); expect(updateEvent).toHaveBeenCalledTimes(1);
    expect(store.value(`bookings/${id}`).customerRescheduleCount).toBe(1);
  });
});
