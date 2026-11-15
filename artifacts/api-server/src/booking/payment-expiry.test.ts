import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import {
  APPROVED_DEPOSIT_PAYMENT_MS, approvedDepositDeadline, createApprovedDepositRequest, unpaidDepositRequestExpired,
} from './payment-deadlines.js';
import { expireBookingPayments, startBookingPaymentExpiryWorker, STALE_HOLD_RETENTION_MS } from './payment-expiry.js';
import { checkSlotReservation } from './slot-reservations.js';

vi.mock('../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const now = Date.parse('2030-12-10T08:00:00Z'), hour = APPROVED_DEPOSIT_PAYMENT_MS;
const stamp = (time: number) => Timestamp.fromMillis(time);
const start = new Date(now + hour * 3), end = new Date(now + hour * 3.5);
let store: ReturnType<typeof reservationDb>;
const hold = (expiresAt: number, extra = {}) => ({
  status: 'active', expiresAt: stamp(expiresAt),
  dataShootingInizio: Timestamp.fromDate(start), dataShootingFine: Timestamp.fromDate(end), ...extra,
});
const booking = (extra = {}) => ({
  stato: 'in_attesa', dataShootingInizio: Timestamp.fromDate(start), dataShootingFine: Timestamp.fromDate(end),
  depositPaymentRequest: { ...createApprovedDepositRequest(2000, start, now - hour) }, ...extra,
});
beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now); store = reservationDb(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('scadenze memorizzate sul server', () => {
  it('crea un’ora esatta senza dipendere dall’ora legale', () => {
    const autumn = Date.parse('2026-10-25T00:30:00Z');
    const request = createApprovedDepositRequest(2000, new Date(autumn + hour * 3), autumn);
    expect(request.expiresAt.toMillis() - request.requestedAt.toMillis()).toBe(hour);
    expect(request).toMatchObject({ status: 'pending', amountCents: 2000, currency: 'EUR' });
  });
  it.each([-1, 0, 1])('applica il confine della richiesta: %sms', delta => {
    expect(unpaidDepositRequestExpired(booking(), now + delta)).toBe(delta >= 0);
  });
  it('non estende la scadenza durante retry e letture successive', () => {
    const data = booking();
    data.depositPaymentRequest.expiresAt = stamp(now + hour * 5);
    expect(approvedDepositDeadline(data)).toBe(now);
    expect(unpaidDepositRequestExpired(data, now + hour)).toBe(true);
    expect(data.depositPaymentRequest.requestedAt.toMillis()).toBe(now - hour);
  });
  it.each([0, -1, 1.5])('rifiuta un importo invalido: %s', amount => {
    expect(() => createApprovedDepositRequest(amount, start, now)).toThrow('Importo');
  });
  it.each([hour - 1, hour])('non apre richieste per shooting troppo vicini: %sms', distance => {
    expect(() => createApprovedDepositRequest(2000, new Date(now + distance), now)).toThrow('Shooting troppo vicino');
  });
  it('non inventa una scadenza per i dati legacy o corrotti', () => {
    expect(unpaidDepositRequestExpired({ stato: 'in_attesa' })).toBe(false);
    expect(unpaidDepositRequestExpired({ depositPaymentRequest: { status: 'pending' } })).toBe(false);
    expect(approvedDepositDeadline({ depositPaymentRequest: {
      requestedAt: stamp(now), expiresAt: stamp(now - 1),
    } })).toBeNull();
  });
});

describe('pulizia idempotente degli stati', () => {
  it('scade solo le riserve attive al limite, preservando date, catture e riserve consumate', async () => {
    store.seed('bookingCheckoutHolds/due', hold(now));
    store.seed('bookingCheckoutHolds/future', hold(now + 1));
    store.seed('bookingCheckoutHolds/consumed', hold(now - 1, { status: 'consumed' }));
    store.seed('bookingCheckoutHolds/paid', hold(now - 1, { depositPayment: { status: 'paid', paypalCaptureId: 'CAPTURE' } }));
    store.seed('bookingCheckoutHolds/review', hold(now - 1, {
      depositPayment: { status: 'paid_action_required', paypalCaptureId: 'LATE' }, paymentReviewRequired: true,
    }));
    const results = await Promise.all([expireBookingPayments(store.db), expireBookingPayments(store.db)]);
    expect(results.reduce((sum, result) => sum + result.expiredHolds, 0)).toBe(2);
    expect(store.value('bookingCheckoutHolds/due')).toMatchObject({ status: 'expired', expiresAt: stamp(now) });
    expect(store.value('bookingCheckoutHolds/future').status).toBe('active');
    expect(store.value('bookingCheckoutHolds/consumed').status).toBe('consumed');
    expect(store.value('bookingCheckoutHolds/paid').status).toBe('active');
    expect(store.value('bookingCheckoutHolds/review')).toMatchObject({
      status: 'expired', paymentReviewRequired: true, depositPayment: { paypalCaptureId: 'LATE' },
    });
  });
  it('anonimizza i dati del cliente nei checkout chiusi da oltre trenta giorni, senza toccare incassi o riserve recenti', async () => {
    const draft = { cliente: { nome: 'Mario', cognome: 'Rossi', email: 'mario@example.com', whatsapp: '+39000' } };
    const old = now - STALE_HOLD_RETENTION_MS;
    store.seed('bookingCheckoutHolds/old-expired', hold(old, { status: 'expired', draft, tokenHash: 'a'.repeat(64), paypal: { orderId: 'ORDER-OLD' } }));
    store.seed('bookingCheckoutHolds/old-cancelled', hold(old - 1, { status: 'cancelled', draft, tokenHash: 'b'.repeat(64) }));
    store.seed('bookingCheckoutHolds/recent-expired', hold(old + 1, { status: 'expired', draft, tokenHash: 'c'.repeat(64) }));
    store.seed('bookingCheckoutHolds/old-paid-late', hold(old, { status: 'expired', draft, tokenHash: 'd'.repeat(64),
      depositPayment: { status: 'paid_action_required', paypalCaptureId: 'LATE' }, paymentReviewRequired: true }));
    store.seed('bookingCheckoutHolds/old-consumed', hold(old, { status: 'consumed', draft, tokenHash: 'e'.repeat(64) }));
    const results = await Promise.all([expireBookingPayments(store.db), expireBookingPayments(store.db)]);
    expect(results.reduce((sum, result) => sum + result.anonymizedHolds, 0)).toBe(2);
    for (const id of ['old-expired', 'old-cancelled']) {
      const data = store.value(`bookingCheckoutHolds/${id}`);
      expect(data.draft).toBeUndefined(); expect(data.tokenHash).toBeUndefined();
      expect(data.anonymizedAt).toBeDefined();
    }
    expect(store.value('bookingCheckoutHolds/old-expired')).toMatchObject({ status: 'expired', paypal: { orderId: 'ORDER-OLD' }, expiresAt: stamp(old) });
    for (const id of ['recent-expired', 'old-paid-late', 'old-consumed']) {
      expect(store.value(`bookingCheckoutHolds/${id}`)).toMatchObject({ draft });
      expect(store.value(`bookingCheckoutHolds/${id}`).anonymizedAt).toBeUndefined();
    }
    expect((await expireBookingPayments(store.db)).anonymizedHolds).toBe(0);
  });
  it('chiude la richiesta scaduta e annulla la prenotazione non pagata una sola volta', async () => {
    store.seed('bookings/due', booking());
    store.seed('bookings/legacy', { stato: 'in_attesa', acconto: 10 });
    const results = await Promise.all([expireBookingPayments(store.db), expireBookingPayments(store.db)]);
    expect(results.reduce((sum, result) => sum + result.expiredRequests, 0)).toBe(1);
    expect(store.value('bookings/due')).toMatchObject({
      stato: 'annullata', depositPaymentRequest: { status: 'expired', expiresAt: stamp(now) },
    });
    expect(store.value('bookings/legacy')).toEqual({ stato: 'in_attesa', acconto: 10 });
    expect([...store.rows.keys()].some(path => path.startsWith('cashMovements/'))).toBe(false);
  });
  it('non cancella una prenotazione incassata neppure con un marker di richiesta vecchio', async () => {
    store.seed('bookings/paid', booking({
      stato: 'confermata', depositPayment: { status: 'paid', paypalCaptureId: 'CAPTURE' },
    }));
    expect((await expireBookingPayments(store.db)).expiredRequests).toBe(0);
    expect(store.value('bookings/paid').stato).toBe('confermata');
  });
  it('rilegge l’incasso concorrente prima di confermare un’annullamento', async () => {
    store.seed('bookings/race', booking());
    const original = store.db.runTransaction.bind(store.db);
    let injected = false;
    vi.spyOn(store.db, 'runTransaction').mockImplementation((fn: any) => original(async transaction => {
      const result = await fn(transaction);
      if (!injected) {
        injected = true;
        store.seed('bookings/race', { ...store.value('bookings/race'), stato: 'confermata',
          depositPayment: { status: 'paid', paypalCaptureId: 'CONCURRENT' } });
      }
      return result;
    }));
    expect((await expireBookingPayments(store.db)).expiredRequests).toBe(0);
    expect(store.value('bookings/race').stato).toBe('confermata');
    expect(store.retries()).toBeGreaterThan(0);
  });
  it('preserva l’incasso da riconciliare ma libera una richiesta non confermata scaduta', async () => {
    store.seed('bookings/review', booking({
      depositPayment: { status: 'paid_action_required', paypalCaptureId: 'LATE' },
      transactions: [{ importo: 20, providerTransactionId: 'LATE' }],
    }));
    await expireBookingPayments(store.db);
    expect(store.value('bookings/review')).toMatchObject({
      stato: 'annullata', depositPayment: { paypalCaptureId: 'LATE' }, transactions: [{ importo: 20 }],
    });
  });
  it('segnala le date corrotte senza liberare arbitrariamente lo slot', async () => {
    store.seed('bookingCheckoutHolds/bad', { status: 'active' });
    store.seed('bookings/bad', { stato: 'in_attesa', depositPaymentRequest: { status: 'pending' } });
    expect(await expireBookingPayments(store.db)).toMatchObject({ invalid: 2, expiredHolds: 0, expiredRequests: 0 });
    expect(store.value('bookings/bad').stato).toBe('in_attesa');
  });
  it('avanza oltre una pagina ancora valida per raggiungere gli abbandoni successivi', async () => {
    store.seed('bookingCheckoutHolds/aaa', hold(now + hour));
    store.seed('bookingCheckoutHolds/zzz', hold(now));
    const first = await expireBookingPayments(store.db, {}, 1);
    expect(first).toMatchObject({ expiredHolds: 0, cursor: { holdId: 'aaa' } });
    const second = await expireBookingPayments(store.db, first.cursor, 1);
    expect(second.expiredHolds).toBe(1);
    expect((await expireBookingPayments(store.db, second.cursor, 1)).cursor.holdId).toBeUndefined();
  });
  it('esegue la manutenzione pianificata e la ferma allo shutdown', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    store.seed('bookingCheckoutHolds/due', hold(now));
    const access = vi.spyOn(store.db, 'collection');
    const stop = startBookingPaymentExpiryWorker(store.db, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.value('bookingCheckoutHolds/due').status).toBe('expired');
    stop();
    const calls = access.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(access).toHaveBeenCalledTimes(calls);
  });
});

describe('disponibilità senza attendere il worker', () => {
  const reserve = () => store.db.runTransaction(async transaction => {
    const commit = await checkSlotReservation(transaction, store.db, start, end);
    commit();
    transaction.set(store.db.collection('bookings').doc('replacement'), {
      stato: 'confermata', dataShootingInizio: Timestamp.fromDate(start), dataShootingFine: Timestamp.fromDate(end),
    });
  });
  it('riassegna lo slot al limite e la pulizia non tocca il nuovo cliente', async () => {
    store.seed('bookings/expired', booking());
    await reserve();
    await expireBookingPayments(store.db);
    expect(store.value('bookings/expired').stato).toBe('annullata');
    expect(store.value('bookings/replacement').stato).toBe('confermata');
    await expect(reserve()).rejects.toThrow('Slot non più disponibile');
  });
  it.each(['before', 'corrupt', 'paid'])('mantiene protetti gli slot: %s', kind => {
    const data: any = booking();
    if (kind === 'before') data.depositPaymentRequest.expiresAt = stamp(now + 1);
    if (kind === 'before') data.depositPaymentRequest.requestedAt = stamp(now - hour + 1);
    if (kind === 'corrupt') delete data.depositPaymentRequest.expiresAt;
    if (kind === 'paid') data.depositPayment = { status: 'paid', paypalCaptureId: 'CAPTURE' };
    store.seed('bookings/protected', data);
    return expect(reserve()).rejects.toThrow('Slot non più disponibile');
  });
});
