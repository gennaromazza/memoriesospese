import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { synchronizeInitialBookingCalendar } from './initial-calendar.js';
import { cancellationView } from './cancellation-policy.js';
import { rescheduleView } from './reschedule-policy.js';
import { requestBookingCancellation } from './cancellations.js';
import { BOOKING_CONDITIONS_TEXT, BOOKING_CONDITIONS_VERSION } from '@shared/booking-conditions';
import { CONFIRMATION_JOBS, deliverBookingConfirmation } from './confirmation-delivery.js';
import { MANAGEMENT_ACCESS } from './management-access.js';

const { read, create, prepare } = vi.hoisted(() => ({ read: vi.fn(), create: vi.fn(), prepare: vi.fn() }));
vi.mock('../google-calendar.js', () => ({ getEventById: read, createEvent: create,
  resolveCalendarId: () => 'studio-calendar', deleteEvent: vi.fn() }));
vi.mock('./confirmation-email.js', () => ({ preparePaidBookingConfirmation: prepare }));

const start = Date.parse('2030-12-10T09:00:00Z'), end = start + 1_800_000;
let store: ReturnType<typeof reservationDb>;
let event: any;
const deps = { read, create, calendarId: () => 'studio-calendar' };
const root = () => ({ stato: 'confermata', calendarSyncPending: true,
  managementAccessEpoch: 'epoch-test',
  dataShootingInizio: Timestamp.fromMillis(start), dataShootingFine: Timestamp.fromMillis(end),
  cliente: { nome: 'Test', cognome: 'Cliente', email: 'customer@example.test' },
  depositPayment: { provider: 'paypal', status: 'paid', currency: 'EUR', amountCents: 2000,
    paypalCaptureId: 'CAPTURE-TEST', paypalOrderId: 'ORDER-TEST' },
  bookingConditions: { version: BOOKING_CONDITIONS_VERSION, text: BOOKING_CONDITIONS_TEXT } });
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(start - 172_800_000);
  store = reservationDb(); store.seed('bookings/one', root()); event = null;
  prepare.mockReset().mockResolvedValue({ to: 'customer@example.test', subject: 'Test',
    html: '<p>Conferma e link gestione</p>', managementTokenHash: '2'.repeat(64) });
  read.mockReset().mockImplementation(async () => event);
  create.mockReset().mockImplementation(async (_calendar, input) => {
    event = { id: input.id, description: input.description,
      start: { dateTime: input.start.toISOString() }, end: { dateTime: input.end.toISOString() } };
    return event;
  });
});
afterEach(() => vi.restoreAllMocks());
describe('prima sincronizzazione calendario dopo acconto', () => {
  function seedDelivery() {
    store.seed(`${MANAGEMENT_ACCESS}/one`, { version: 1, status: 'active', nonce: '1'.repeat(64),
      tokenHash: '2'.repeat(64), epoch: 'epoch-test', email: 'customer@example.test' });
    store.seed(`${CONFIRMATION_JOBS}/one`, { status: 'pending', attempts: 0,
      captureId: 'CAPTURE-TEST', amountCents: 2000 });
  }
  it('il worker effettivo sincronizza prima di preparare e spedire la conferma', async () => {
    seedDelivery(); const send = vi.fn(async () => undefined);
    await deliverBookingConfirmation(store.db, 'one', { send });
    expect(create).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledWith(store.db, 'one', expect.objectContaining({ calendarSyncPending: false }));
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(prepare.mock.invocationCallOrder[0]);
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]);
    expect(store.value(`${CONFIRMATION_JOBS}/one`).status).toBe('sent');
    expect(store.value('bookings/one').emailConfermataInviata).toBe(true);
  });
  it('il worker non invia email se il calendario è indisponibile e conserva il lavoro per la ripresa', async () => {
    seedDelivery(); const send = vi.fn();
    read.mockRejectedValue(new Error('503 unavailable'));
    await deliverBookingConfirmation(store.db, 'one', { send });
    expect(prepare).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
    expect(store.value(`${CONFIRMATION_JOBS}/one`).status).toBe('pending');
    expect(store.value('bookings/one').calendarSyncPending).toBe(true);
  });
  it('crea un evento stabile e registra il calendario reale senza cambiare l’incasso', async () => {
    const result = await synchronizeInitialBookingCalendar(store.db, 'one', deps);
    expect(result).toMatchObject({ calendarSyncPending: false, googleCalendarId: 'studio-calendar',
      depositPayment: root().depositPayment });
    expect(result.googleCalendarEventId).toMatch(/^b[a-f0-9]{64}$/);
    expect(create).toHaveBeenCalledOnce();
    await synchronizeInitialBookingCalendar(store.db, 'one', deps);
    expect(create).toHaveBeenCalledOnce();
  });
  it('riconcilia un inserimento riuscito la cui risposta è andata persa senza duplicarlo', async () => {
    const original = create.getMockImplementation()!;
    create.mockImplementationOnce(async (...args) => { await original(...args); throw new Error('timeout'); });
    await expect(synchronizeInitialBookingCalendar(store.db, 'one', deps)).rejects.toThrow('timeout');
    expect(store.value('bookings/one').calendarSyncPending).toBe(true);
    await synchronizeInitialBookingCalendar(store.db, 'one', deps);
    expect(create).toHaveBeenCalledOnce();
    expect(store.value('bookings/one').googleCalendarEventId).toBe(event.id);
  });
  it('riconcilia il conflitto di inserimento senza creare una seconda identità', async () => {
    const original = create.getMockImplementation()!;
    create.mockImplementationOnce(async (...args) => { await original(...args); throw Object.assign(new Error('exists'), { code: 409 }); });
    await synchronizeInitialBookingCalendar(store.db, 'one', deps);
    expect(create).toHaveBeenCalledOnce(); expect(read).toHaveBeenCalledTimes(2);
    expect(store.value('bookings/one').calendarSyncPending).toBe(false);
  });
  it.each(['provider', 'wrong-time', 'wrong-owner', 'cancelled'])('non completa un risultato incerto: %s', async scenario => {
    if (scenario === 'provider') read.mockRejectedValue(new Error('503 unavailable'));
    else create.mockImplementationOnce(async (_calendar, input) => ({
      id: input.id, description: scenario === 'wrong-owner' ? 'Altro appuntamento' : input.description,
      status: scenario === 'cancelled' ? 'cancelled' : 'confirmed',
      start: { dateTime: new Date(start + (scenario === 'wrong-time' ? 60_000 : 0)).toISOString() },
      end: { dateTime: new Date(end).toISOString() },
    }));
    await expect(synchronizeInitialBookingCalendar(store.db, 'one', deps)).rejects.toThrow();
    expect(store.value('bookings/one').calendarSyncPending).toBe(true);
    expect(store.value('bookings/one').depositPayment).toEqual(root().depositPayment);
  });
  it('nega annullamento e cambio data durante un inserimento ambiguo, anche lato admin', async () => {
    expect(cancellationView(root()).canCancel).toBe(false);
    expect(rescheduleView(root(), { attiva: true, dataInizio: Timestamp.fromMillis(start - 86400000),
      dataFine: Timestamp.fromMillis(end + 86400000) }).canChange).toBe(false);
    await expect(requestBookingCancellation(store.db, 'one', { requestId: 'request-test' },
      { actor: 'admin', decision: 'refund', expectedAmountCents: 2000 })).rejects.toThrow('verificare');
    expect(store.value('bookings/one').stato).toBe('confermata');
  });
  it('non aggancia un evento se la prenotazione cambia durante la chiamata', async () => {
    const original = create.getMockImplementation()!;
    create.mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      store.seed('bookings/one', { ...root(), stato: 'annullata' });
      return result;
    });
    await expect(synchronizeInitialBookingCalendar(store.db, 'one', deps)).rejects.toThrow('modificata');
    expect(store.value('bookings/one').calendarSyncPending).toBe(true);
  });
});
