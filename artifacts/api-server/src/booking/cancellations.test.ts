import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
const h = vi.hoisted(() => ({ paypal: {} as any }));
vi.mock('../firebase-admin.js', async () => ({ db: (await import('./test-helpers/reservation-db.js')).reservationDb().db }));
vi.mock('../google-calendar.js', async original => ({ ...await original<typeof import('../google-calendar.js')>(),
  resolveCalendarId: () => 'studio-calendar', deleteEvent: vi.fn(async () => undefined) }));
vi.mock('../email-routes.js', async original => ({ ...await original<typeof import('../email-routes.js')>(),
  getStudioContactInfo: vi.fn(async () => ({ name: 'Studio test', email: 'studio@example.test', phone: '00000000', address: 'Via test', whatsapp: '' })),
  sendGmailEmail: vi.fn(async () => undefined) }));
vi.mock('./paypal-deposit-orders.js', async original => ({ ...await original<typeof import('./paypal-deposit-orders.js')>(), bookingPayPalClient: () => h.paypal }));
import express from 'express';
import { reservationDb } from './test-helpers/reservation-db.js';
import { bookingConditionsSnapshot, BOOKING_CONDITIONS_VERSION } from '../../shared/booking-conditions.js';
import { ensureBookingManagementLink, changeManagementLink } from './management-access.js';
import { requestBookingCancellation, deliverBookingCancellation } from './cancellations.js';
import { cancellationView } from './cancellation-policy.js';
import { approveBookingRefund, processBookingRefund } from './refunds.js';
import { bookingPayPalAccountKey } from './paypal-deposit-orders.js';
import { paymentHash } from './deposit-payment-ledger.js';
import { checkSlotReservation, loadCheckoutHoldEvents } from './slot-reservations.js';
import { deleteEvent } from '../google-calendar.js';
import { sendGmailEmail } from '../email-routes.js';
import { bookingCancellationRouter, adminCancellationSnapshot } from './cancellation-routes.js';

let store: ReturnType<typeof reservationDb>;
const start = new Date('2030-12-10T09:00:00Z'), end = new Date('2030-12-10T09:30:00Z');
const root = () => store.value('bookings/one');
const cancelJob = () => store.value('bookingCancellationJobs/one');
const refundJob = () => store.value('bookingRefunds/one');
const cash = () => [...store.rows.keys()].filter(key => key.startsWith('cashMovements/'));
async function fixture(paid = false) {
  store.seed('bookings/one', { stato: 'confermata', campaignId: 'campaign', cliente: { nome: 'Marta', cognome: 'Test', email: 'marta@example.test' },
    bookingConditions: bookingConditionsSnapshot(BOOKING_CONDITIONS_VERSION), dataShootingInizio: Timestamp.fromDate(start),
    dataShootingFine: Timestamp.fromDate(end), googleCalendarEventId: 'event-one', googleCalendarId: 'studio-calendar',
    acconto: paid ? 20 : 0, ...(paid ? { depositPayment: { provider: 'paypal', status: 'paid', amountCents: 2000,
      currency: 'EUR', paypalOrderId: 'ORDER12345', paypalCaptureId: 'CAPTURE12345' } } : {}) });
  const url = await ensureBookingManagementLink(store.db, 'one');
  if (paid) receipt();
  return { token: url.split('#')[1], requestId: randomUUID(), expectedStartsAt: start.toISOString() };
}
function receipt() {
  store.seed('bookingPayPalOrders/ORDER12345', { bookingId: 'one', captureId: 'CAPTURE12345',
    accountKey: bookingPayPalAccountKey(h.paypal.config) });
  store.seed(`bookingPaymentCaptures/${paymentHash('paypal-capture:CAPTURE12345')}`, { bookingId: 'one', amountCents: 2000 });
}
const refundDetail = () => ({ id: 'REFUND12345', status: 'COMPLETED', custom_id: refundJob().requestId,
  amount: { value: '20.00', currency_code: 'EUR' }, links: [{ rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE12345' }] });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2029-01-01T10:00:00Z'));
  vi.stubEnv('SESSION_SECRET', 'booking-cancellation-test-key-not-real-secret');
  vi.clearAllMocks(); store = reservationDb();
  vi.mocked(deleteEvent).mockResolvedValue(undefined as never);
  vi.mocked(sendGmailEmail).mockResolvedValue(undefined);
  h.paypal = { config: { environment: 'sandbox', clientId: 'fake-client', merchantId: 'MERCHANT' },
    getOrder: vi.fn(async () => ({ id: 'ORDER12345', purchase_units: [{ reference_id: 'booking:one', custom_id: 'booking:one',
      invoice_id: 'BOOKING-one', amount: { value: '20.00', currency_code: 'EUR' }, payee: { merchant_id: 'MERCHANT' },
      payments: { captures: [{ id: 'CAPTURE12345', status: 'COMPLETED', amount: { value: '20.00', currency_code: 'EUR' } }] } }] })),
    refundCapture: vi.fn(async () => ({ id: 'REFUND12345' })), getRefund: vi.fn(async () => refundDetail()) };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('customer cancellation and calendar', () => {
  it('cancels unpaid once, retains both slot protections until Google succeeds, releases after, emails once', async () => {
    const input = await fixture();
    store.seed('bookingCheckoutHolds/one', { status: 'active', expiresAt: Timestamp.fromMillis(Date.now() + 999999) });
    await requestBookingCancellation(store.db, 'one', input);
    expect(root().stato).toBe('cancellation_pending');
    expect(store.value('bookingCheckoutHolds/one').status).toBe('cancelled');
    expect((await loadCheckoutHoldEvents(store.db, start, end)).map(event => event.id)).toContain('cancel-one');
    await expect(store.db.runTransaction(tx => checkSlotReservation(tx, store.db, start, end))).rejects.toThrow('Slot non più disponibile');
    await Promise.all([deliverBookingCancellation(store.db, 'one'), deliverBookingCancellation(store.db, 'one')]);
    expect(root().stato).toBe('annullata'); expect(root().googleCalendarEventId).toBeUndefined();
    expect(deleteEvent).toHaveBeenCalledTimes(1); expect(deleteEvent).toHaveBeenCalledWith('studio-calendar', 'event-one');
    expect(sendGmailEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendGmailEmail).mock.calls[0][2]).toContain('non rispondere');
    await expect(store.db.runTransaction(tx => checkSlotReservation(tx, store.db, start, end))).resolves.toBeTypeOf('function');
    await requestBookingCancellation(store.db, 'one', { ...input, requestId: randomUUID() }); await deliverBookingCancellation(store.db, 'one');
    expect(sendGmailEmail).toHaveBeenCalledTimes(1); expect(deleteEvent).toHaveBeenCalledTimes(1);
    expect(h.paypal.refundCapture).not.toHaveBeenCalled();
  });
  it('retains a paid deposit and marks it for review, never auto-refunds customer cancellation', async () => {
    const input = await fixture(true), payment = root().depositPayment;
    await requestBookingCancellation(store.db, 'one', input); await deliverBookingCancellation(store.db, 'one');
    expect(root().depositPayment).toEqual(payment); expect(root().acconto).toBe(20);
    expect(root().bookingRefund.status).toBe('review'); expect(h.paypal.refundCapture).not.toHaveBeenCalled(); expect(cash()).toEqual([]);
  });
  it('uses only saved conditions, blocks legacy, wrong/revoked token, stale date and simultaneous reschedule', async () => {
    const input = await fixture();
    store.seed('bookings/one', { ...root(), bookingConditions: null });
    await expect(requestBookingCancellation(store.db, 'one', input)).rejects.toThrow('condizioni originali');
    store.seed('bookings/one', { ...root(), bookingConditions: bookingConditionsSnapshot(BOOKING_CONDITIONS_VERSION), customerReschedule: { status: 'pending' } });
    await expect(requestBookingCancellation(store.db, 'one', input)).rejects.toThrow('cambio appuntamento');
    store.seed('bookings/one', { ...root(), customerReschedule: null });
    await expect(requestBookingCancellation(store.db, 'one', { ...input, expectedStartsAt: end })).rejects.toThrow('data è cambiata');
    await expect(requestBookingCancellation(store.db, 'one', { ...input, token: 'b'.repeat(64) })).rejects.toThrow('Link non valido');
    await changeManagementLink(store.db, 'one', { action: 'revoke', requestId: randomUUID(), expectedVersion: 1 }, 'admin');
    await expect(requestBookingCancellation(store.db, 'one', input)).rejects.toThrow('Link non valido');
    expect(root().stato).toBe('confermata');
  });
  it('blocks at shooting start, independent of current campaign edits', async () => {
    const input = await fixture();
    store.seed('booking_campaigns/campaign', { attiva: false });
    vi.setSystemTime(start.getTime() - 1); expect(cancellationView(root()).canCancel).toBe(true);
    vi.setSystemTime(start); await expect(requestBookingCancellation(store.db, 'one', input)).rejects.toThrow('già iniziato');
  });
  it('recovers a Google outage without freeing early or changing the receipt; 404 is successful deletion', async () => {
    const input = await fixture(true);
    vi.mocked(deleteEvent).mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce({ code: 404 });
    await requestBookingCancellation(store.db, 'one', input); await deliverBookingCancellation(store.db, 'one');
    expect(root().stato).toBe('cancellation_pending'); expect(sendGmailEmail).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 60_001); await deliverBookingCancellation(store.db, 'one');
    expect(root().stato).toBe('annullata'); expect(sendGmailEmail).toHaveBeenCalledTimes(1); expect(root().acconto).toBe(20);
  });
  it('does not retry an ambiguous email send or roll back cancellation', async () => {
    const input = await fixture();
    vi.mocked(sendGmailEmail).mockRejectedValue(new Error('response lost'));
    await requestBookingCancellation(store.db, 'one', input); await deliverBookingCancellation(store.db, 'one');
    expect(cancelJob().emailStatus).toBe('unknown'); expect(root().stato).toBe('annullata');
    vi.setSystemTime(Date.now() + 240_000); await deliverBookingCancellation(store.db, 'one');
    expect(sendGmailEmail).toHaveBeenCalledTimes(1);
  });
});
describe('explicit administrative full refunds', () => {
  async function cancelled() { const input = await fixture(true); await requestBookingCancellation(store.db, 'one', input); await deliverBookingCancellation(store.db, 'one'); }
  it('requires explicit admin choice when studio cancels a paid booking', async () => {
    await fixture(true);
    await expect(requestBookingCancellation(store.db, 'one', { requestId: randomUUID() }, { actor: 'staff', decision: 'none' })).rejects.toThrow('Scegli rimborso');
    expect(h.paypal.refundCapture).not.toHaveBeenCalled();
    await requestBookingCancellation(store.db, 'one', { requestId: randomUUID() }, { actor: 'staff', decision: 'reschedule' });
    await deliverBookingCancellation(store.db, 'one'); expect(root().bookingRefund.decision).toBe('reschedule');
    expect(h.paypal.refundCapture).not.toHaveBeenCalled();
  });
  it('refuses a stale refund amount both before cancellation and before authorizing money', async () => {
    await fixture(true);
    await expect(requestBookingCancellation(store.db, 'one', { requestId: randomUUID() },
      { actor: 'staff', decision: 'refund', expectedAmountCents: 1000 })).rejects.toThrow('importo è cambiato');
    expect(root().stato).toBe('confermata'); expect(deleteEvent).not.toHaveBeenCalled();
    const input = { requestId: randomUUID() };
    await requestBookingCancellation(store.db, 'one', input, { actor: 'staff', decision: 'reschedule' });
    await deliverBookingCancellation(store.db, 'one');
    await expect(approveBookingRefund(store.db, 'one', 'staff', 1000)).rejects.toThrow('importo è cambiato');
    expect(h.paypal.refundCapture).not.toHaveBeenCalled(); expect(refundJob()).toBeUndefined();
  });
  it('verifies provider identity and completes one refund/cash outflow under duplicates', async () => {
    await cancelled();
    await Promise.all([approveBookingRefund(store.db, 'one', 'staff'), approveBookingRefund(store.db, 'one', 'staff')]);
    await Promise.all([processBookingRefund(store.db, 'one'), processBookingRefund(store.db, 'one')]);
    expect(h.paypal.refundCapture).toHaveBeenCalledTimes(1);
    expect(h.paypal.refundCapture).toHaveBeenCalledWith('CAPTURE12345', 2000, expect.stringMatching(/^[a-f0-9]{32}$/));
    expect(root().bookingRefund.status).toBe('completed'); expect(cash()).toHaveLength(1);
    expect(store.value(cash()[0])).toMatchObject({ tipo: 'uscita', importo: 20, origine: 'booking', movementRole: 'refund' });
    await approveBookingRefund(store.db, 'one', 'staff'); await processBookingRefund(store.db, 'one');
    expect(h.paypal.refundCapture).toHaveBeenCalledTimes(1); expect(cash()).toHaveLength(1); expect(root().acconto).toBe(20);
  });
  it('recovers an accepted refund with lost response using GET only, never another POST', async () => {
    await cancelled(); await approveBookingRefund(store.db, 'one', 'staff');
    h.paypal.refundCapture.mockRejectedValueOnce(new Error('timeout'));
    await processBookingRefund(store.db, 'one'); expect(refundJob().status).toBe('unknown'); expect(cash()).toHaveLength(0);
    const remote = await h.paypal.getOrder(); remote.purchase_units[0].payments.refunds = [{ id: 'REFUND12345' }];
    h.paypal.getOrder.mockResolvedValue(remote); vi.setSystemTime(Date.now() + 60_001);
    await processBookingRefund(store.db, 'one'); expect(refundJob().status).toBe('completed');
    expect(h.paypal.refundCapture).toHaveBeenCalledTimes(1); expect(cash()).toHaveLength(1);
  });
  it('leaves an unprovable timeout explicit for admin without reissuing, even after long time', async () => {
    await cancelled(); await approveBookingRefund(store.db, 'one', 'staff');
    h.paypal.refundCapture.mockRejectedValue(new Error('offline'));
    await processBookingRefund(store.db, 'one');
    for (let i = 0; i < 12; i++) { vi.setSystemTime(Date.now() + 24 * 3600_000); await processBookingRefund(store.db, 'one'); }
    expect(refundJob().status).toBe('review'); expect(h.paypal.refundCapture).toHaveBeenCalledTimes(1); expect(cash()).toHaveLength(0);
  });
  it('does not book money for a pending, wrong-amount or wrong-capture refund', async () => {
    await cancelled(); await approveBookingRefund(store.db, 'one', 'staff');
    h.paypal.getRefund.mockImplementation(async () => ({ ...refundDetail(), status: 'PENDING' }));
    await processBookingRefund(store.db, 'one'); expect(refundJob().status).toBe('pending'); expect(cash()).toHaveLength(0);
    h.paypal.getRefund.mockImplementation(async () => ({ ...refundDetail(), amount: { value: '19.00', currency_code: 'EUR' } }));
    vi.setSystemTime(Date.now() + 60_001); await processBookingRefund(store.db, 'one');
    expect(refundJob().status).toBe('review'); expect(cash()).toHaveLength(0);
  });
  it('refuses the wrong PayPal account before a financial call', async () => {
    await cancelled(); await approveBookingRefund(store.db, 'one', 'staff');
    h.paypal.config.clientId = 'another-account'; await processBookingRefund(store.db, 'one');
    expect(refundJob().status).toBe('review'); expect(h.paypal.refundCapture).not.toHaveBeenCalled();
  });
  it.each(['currency', 'capture', 'identity', 'id'])('refuses a provider refund with mismatched %s', async field => {
    await cancelled(); await approveBookingRefund(store.db, 'one', 'staff');
    h.paypal.getRefund.mockImplementation(async () => {
      const value = refundDetail();
      if (field === 'currency') value.amount.currency_code = 'USD';
      if (field === 'capture') value.links[0].href = 'https://api-m.sandbox.paypal.com/v2/payments/captures/OTHER12345';
      if (field === 'identity') value.custom_id = 'another-operation';
      if (field === 'id') value.id = 'OTHER12345';
      return value;
    });
    await processBookingRefund(store.db, 'one'); expect(refundJob().status).toBe('review'); expect(cash()).toHaveLength(0);
    await approveBookingRefund(store.db, 'one', 'staff'); await processBookingRefund(store.db, 'one');
    expect(h.paypal.refundCapture).toHaveBeenCalledTimes(1);
  });
  it('allows a fresh explicit approval after a pre-provider account failure, never after an attempted refund', async () => {
    await cancelled(); await approveBookingRefund(store.db, 'one', 'staff');
    h.paypal.config.clientId = 'another-account'; await processBookingRefund(store.db, 'one');
    expect(refundJob().providerStarted).toBeUndefined();
    h.paypal.config.clientId = 'fake-client'; await approveBookingRefund(store.db, 'one', 'staff'); await processBookingRefund(store.db, 'one');
    expect(refundJob().status).toBe('completed'); expect(h.paypal.refundCapture).toHaveBeenCalledTimes(1);
  });
  it('handles a late immediate capture with no booking and records its refund without creating an appointment', async () => {
    await fixture(true);
    store.seed('bookingCheckoutHolds/one', { campaignId: 'campaign', depositPayment: { ...root().depositPayment, status: 'paid_action_required' },
      draft: { cliente: root().cliente }, paymentReviewRequired: true });
    await store.db.collection('bookings').doc('one').delete();
    expect((await adminCancellationSnapshot(store.db, 'one')).canRefund).toBe(true);
    await approveBookingRefund(store.db, 'one', 'staff'); await processBookingRefund(store.db, 'one');
    expect(store.value('bookingCheckoutHolds/one').bookingRefund.status).toBe('completed');
    expect(root()).toBeUndefined(); expect(cash()).toHaveLength(1);
  });
  it('protects administrative routes and rejects client-supplied refund amounts', async () => {
    await cancelled();
    const app = express(); app.use(express.json()); app.use('/api/booking', bookingCancellationRouter(store.db,
      (req: any, res, next) => { if (!req.headers['x-test-role']) { res.sendStatus(401); return; } req.user = { uid: 'staff' }; next(); },
      (req, res, next) => { if (req.headers['x-test-role'] !== 'admin') { res.sendStatus(403); return; } next(); }));
    const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as any).port}/api/booking/one/cancellation`;
    try {
      expect((await fetch(url)).status).toBe(401);
      expect((await fetch(url, { headers: { 'x-test-role': 'user' } })).status).toBe(403);
      expect((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-role': 'admin' },
        body: JSON.stringify({ action: 'refund', requestId: randomUUID(), amountCents: 1 }) })).status).toBe(400);
      expect((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-role': 'admin' },
        body: JSON.stringify({ action: 'refund', requestId: randomUUID(), expectedAmountCents: 1000 }) })).status).toBe(409);
      expect(h.paypal.refundCapture).not.toHaveBeenCalled();
      await approveBookingRefund(store.db, 'one', 'staff');
      h.paypal.refundCapture.mockRejectedValueOnce(new Error('response lost'));
      await processBookingRefund(store.db, 'one');
      store.seed('bookingRefunds/one', { ...refundJob(), status: 'review', attempts: 10 });
      const remote = await h.paypal.getOrder(); remote.purchase_units[0].payments.refunds = [{ id: 'REFUND12345' }];
      h.paypal.getOrder.mockResolvedValue(remote);
      expect((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-role': 'admin' },
        body: JSON.stringify({ action: 'verify_refund', requestId: randomUUID() }) })).status).toBe(200);
      expect(refundJob().status).toBe('completed'); expect(h.paypal.refundCapture).toHaveBeenCalledTimes(1);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
