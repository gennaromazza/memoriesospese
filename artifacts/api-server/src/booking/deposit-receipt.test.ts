import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { bookingPaymentStage } from '@shared/booking-payment-state';
import { depositReceiptReference } from '@shared/booking-deposit-receipt';
import { hasPaidBookingDeposit, unpaidDepositRequestExpired } from './payment-deadlines.js';
import { canIssueManagementLink, MANAGEMENT_ACCESS } from './management-access.js';
import { CONFIRMATION_JOBS, deliverBookingConfirmation } from './confirmation-delivery.js';
import { synchronizeInitialBookingCalendar } from './initial-calendar.js';
import { reservationDb } from './test-helpers/reservation-db.js';

// L'acconto incassato di persona deve essere riconosciuto da tutte le protezioni che
// finora guardavano solo la cattura PayPal.
const now = Date.parse('2030-12-01T09:00:00Z');
const inPerson = (extra: Record<string, unknown> = {}) => ({
  provider: 'in_person', status: 'paid', method: 'contante', currency: 'EUR', amountCents: 2500,
  receiptId: 'r'.repeat(64), paidAt: Timestamp.fromMillis(now), ...extra,
});
const confirmed = (extra: Record<string, unknown> = {}) => ({
  stato: 'confermata', cliente: { nome: 'Anna', cognome: 'Rossi', email: 'anna@example.test' }, acconto: 25,
  dataShootingInizio: Timestamp.fromMillis(now + 7 * 86_400_000), dataShootingFine: Timestamp.fromMillis(now + 7 * 86_400_000 + 1_800_000),
  depositPayment: inPerson(),
  depositPaymentRequest: { status: 'paid', amountCents: 5000, currency: 'EUR',
    requestedAt: Timestamp.fromMillis(now - 600_000), expiresAt: Timestamp.fromMillis(now + 3_000_000) },
  ...extra,
});

describe('depositReceiptReference', () => {
  it('usa la cattura PayPal o la ricevuta di persona, mai un riferimento mancante', () => {
    expect(depositReceiptReference({ paypalCaptureId: 'CAP1' })).toBe('CAP1');
    expect(depositReceiptReference({ provider: 'in_person', receiptId: 'abc' })).toBe('abc');
    expect(depositReceiptReference({ provider: 'in_person' })).toBeNull();
    expect(depositReceiptReference({ provider: 'paypal', receiptId: 'abc' })).toBeNull(); // la ricevuta vale solo di persona
    expect(depositReceiptReference(undefined)).toBeNull();
  });
});

describe('protezioni che riconoscono l\'acconto di persona', () => {
  it('hasPaidBookingDeposit', () => {
    expect(hasPaidBookingDeposit({ depositPayment: inPerson() })).toBe(true);
    expect(hasPaidBookingDeposit({ depositPayment: inPerson({ receiptId: undefined }) })).toBe(false);
    expect(hasPaidBookingDeposit({ depositPayment: inPerson({ status: 'pending' }) })).toBe(false);
  });

  it('una richiesta pagata di persona non scade piu\' (il worker non annulla una prenotazione confermata)', () => {
    const booking = confirmed({ depositPaymentRequest: { status: 'pending', amountCents: 5000, currency: 'EUR',
      requestedAt: Timestamp.fromMillis(now - 7_200_000), expiresAt: Timestamp.fromMillis(now - 3_600_000) } });
    expect(unpaidDepositRequestExpired(booking, now)).toBe(false);
  });

  it('bookingPaymentStage non segnala "da riconciliare" una prenotazione pagata di persona', () => {
    expect(bookingPaymentStage(confirmed(), now)).toBe('confermata');
    // senza ricevuta resta da verificare
    expect(bookingPaymentStage(confirmed({ depositPayment: inPerson({ receiptId: undefined }) }), now)).toBe('pagamento_da_verificare');
  });

  it('canIssueManagementLink accetta l\'acconto di persona anche con importo diverso dalla richiesta', () => {
    expect(canIssueManagementLink(confirmed())).toBe(true);
    expect(canIssueManagementLink(confirmed({ depositPayment: inPerson({ receiptId: undefined }) }))).toBe(false);
    expect(canIssueManagementLink(confirmed({ depositPayment: inPerson({ status: 'paid_action_required' }) }))).toBe(false);
    expect(canIssueManagementLink(confirmed({ depositPayment: inPerson({ amountCents: 0 }) }))).toBe(false);
  });

  it('le regole PayPal restano invariate: serve cattura e ordine', () => {
    const paypal = { provider: 'paypal', status: 'paid', currency: 'EUR', amountCents: 5000, paypalCaptureId: 'CAP', paypalOrderId: 'ORD' };
    expect(canIssueManagementLink(confirmed({ depositPayment: paypal }))).toBe(true);
    expect(canIssueManagementLink(confirmed({ depositPayment: { ...paypal, paypalOrderId: undefined } }))).toBe(false);
    // un importo diverso dalla richiesta resta incoerente per PayPal
    expect(canIssueManagementLink(confirmed({ depositPayment: { ...paypal, amountCents: 4000 } }))).toBe(false);
  });
});

describe('conferma finale e calendario per l\'acconto di persona', () => {
  let store: ReturnType<typeof reservationDb>;
  const prepare = vi.fn(), send = vi.fn();
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    store = reservationDb();
    store.seed('bookings/one', { ...confirmed(), emailConfermataInviata: false, managementAccessEpoch: 'epoch', calendarSyncPending: true });
    store.seed(`${MANAGEMENT_ACCESS}/one`, { version: 1, status: 'active', nonce: '1'.repeat(64), tokenHash: '2'.repeat(64),
      epoch: 'epoch', email: 'anna@example.test' });
    store.seed(`${CONFIRMATION_JOBS}/one`, { status: 'pending', attempts: 0, captureId: 'r'.repeat(64), amountCents: 2500 });
    prepare.mockReset().mockResolvedValue({ to: 'anna@example.test', subject: 'S', html: '<p>x</p>', managementTokenHash: '2'.repeat(64) });
    send.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('il lavoro di conferma parte quando il riferimento coincide con la ricevuta di persona', async () => {
    await deliverBookingConfirmation(store.db, 'one', { prepare, send });
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.value(`${CONFIRMATION_JOBS}/one`).status).toBe('sent');
  });

  it('non parte se il riferimento del lavoro non corrisponde', async () => {
    store.seed(`${CONFIRMATION_JOBS}/one`, { status: 'pending', attempts: 0, captureId: 'altro', amountCents: 2500 });
    await deliverBookingConfirmation(store.db, 'one', { prepare, send });
    expect(send).not.toHaveBeenCalled();
  });

  it('il calendario viene creato con un evento stabile derivato dalla ricevuta', async () => {
    const created: any[] = [];
    const deps = {
      read: vi.fn(async (_c: string, id: string) => created.find(event => event.id === id) ?? null) as any,
      create: vi.fn(async (_c: string, data: any) => {
        const event = { id: data.id, status: 'confirmed', description: data.description,
          start: { dateTime: data.start.toISOString() }, end: { dateTime: data.end.toISOString() } };
        created.push(event); return event;
      }) as any,
      calendarId: () => 'primary',
    };
    const result = await synchronizeInitialBookingCalendar(store.db, 'one', deps);
    expect(result.calendarSyncPending).toBe(false);
    expect(deps.create).toHaveBeenCalledTimes(1);
    expect(deps.create.mock.calls[0][1].id).toMatch(/^b[0-9a-f]{64}$/);
    // una seconda sincronizzazione non crea altri eventi
    store.seed('bookings/one', { ...store.value('bookings/one'), calendarSyncPending: true });
    await synchronizeInitialBookingCalendar(store.db, 'one', deps);
    expect(deps.create).toHaveBeenCalledTimes(1);
  });
});
