import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { CONFIRMATION_JOBS, deliverBookingConfirmation, runBookingConfirmationDeliveries } from './confirmation-delivery.js';
import { MANAGEMENT_ACCESS } from './management-access.js';

const now = Date.parse('2030-12-01T09:00:00Z');
let store: ReturnType<typeof reservationDb>;
const prepare = vi.fn(), send = vi.fn();
const deps = { prepare, send };
const root = () => ({ stato: 'confermata', cliente: { email: 'customer@example.test' }, emailConfermataInviata: false, managementAccessEpoch: 'epoch-test',
  calendarSyncPending: true, acconto: 30, depositPayment: { status: 'paid', provider: 'paypal', currency: 'EUR',
    amountCents: 3000, paypalCaptureId: 'capture-test', paypalOrderId: 'order-test' } });
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  store = reservationDb(); store.seed('bookings/one', root());
  store.seed(`${MANAGEMENT_ACCESS}/one`, { version: 1, status: 'active', nonce: '1'.repeat(64), tokenHash: '2'.repeat(64),
    epoch: 'epoch-test', email: 'customer@example.test' });
  store.seed(`${CONFIRMATION_JOBS}/one`, { status: 'pending', attempts: 0, captureId: 'capture-test', amountCents: 3000 });
  prepare.mockReset().mockResolvedValue({ to: 'customer@example.test', subject: 'Test', html: '<p>Personal link</p>', managementTokenHash: '2'.repeat(64) });
  send.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());
describe('paid booking final confirmation outbox', () => {
  it('sends once even with concurrent workers or a replay', async () => {
    await Promise.all([deliverBookingConfirmation(store.db, 'one', deps), deliverBookingConfirmation(store.db, 'one', deps)]);
    await runBookingConfirmationDeliveries(store.db, deps);
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.value(`${CONFIRMATION_JOBS}/one`).status).toBe('sent');
    expect(store.value('bookings/one')).toMatchObject({ emailConfermataInviata: true, acconto: 30, calendarSyncPending: true });
  });
  it.each([
    { stato: 'in_attesa' }, { stato: 'annullata' }, { paymentReviewRequired: true },
    { depositPayment: { ...root().depositPayment, status: 'paid_action_required' } },
    { depositPayment: { ...root().depositPayment, paypalCaptureId: 'different' } },
    { emailConfermataInviata: true },
  ])('does not send an ineligible or already sent confirmation %j', async patch => {
    store.seed('bookings/one', { ...root(), ...patch });
    await deliverBookingConfirmation(store.db, 'one', deps);
    expect(prepare).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it('retains paid amounts and never retries an ambiguous provider result', async () => {
    send.mockRejectedValue(new Error('network timeout'));
    await deliverBookingConfirmation(store.db, 'one', deps);
    await deliverBookingConfirmation(store.db, 'one', deps);
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.value(`${CONFIRMATION_JOBS}/one`).status).toBe('unknown');
    expect(store.value('bookings/one')).toEqual(root());
  });
  it('retries only definite rejections, with cooldown and at most three attempts', async () => {
    send.mockRejectedValue(new Error('Gmail API error: 429 rejected'));
    for (let i = 0; i < 4; i++) {
      vi.mocked(Date.now).mockReturnValue(now + i * 61_000);
      await deliverBookingConfirmation(store.db, 'one', deps);
    }
    expect(send).toHaveBeenCalledTimes(3);
    expect(store.value(`${CONFIRMATION_JOBS}/one`)).toMatchObject({ status: 'failed', attempts: 3 });
    expect(store.value('bookings/one').acconto).toBe(30);
  });
  it('treats an expired provider-send lease as unknown, not another send', async () => {
    store.seed(`${CONFIRMATION_JOBS}/one`, { ...store.value(`${CONFIRMATION_JOBS}/one`), status: 'sending', phase: 'email',
      leaseUntil: Timestamp.fromMillis(now - 1) });
    await deliverBookingConfirmation(store.db, 'one', deps);
    expect(send).not.toHaveBeenCalled(); expect(store.value(`${CONFIRMATION_JOBS}/one`).status).toBe('unknown');
  });
  it('can safely recover a lease interrupted before sending', async () => {
    store.seed(`${CONFIRMATION_JOBS}/one`, { ...store.value(`${CONFIRMATION_JOBS}/one`), status: 'sending', phase: 'preparing',
      leaseUntil: Timestamp.fromMillis(now - 1) });
    await deliverBookingConfirmation(store.db, 'one', deps);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not send to a changed customer or after a cancellation during composition', async () => {
    prepare.mockImplementation(async () => {
      store.seed('bookings/one', { ...root(), stato: 'annullata' });
      return { to: 'customer@example.test', subject: 'Test', html: 'Test' };
    });
    await deliverBookingConfirmation(store.db, 'one', deps);
    expect(send).not.toHaveBeenCalled();
    expect(store.value('bookings/one').stato).toBe('annullata');
  });
  it('rejects a mismatched prepared recipient before calling Gmail', async () => {
    prepare.mockResolvedValue({ to: 'other@example.test', subject: 'Test', html: 'Test' });
    await deliverBookingConfirmation(store.db, 'one', deps);
    expect(send).not.toHaveBeenCalled(); expect(store.value(`${CONFIRMATION_JOBS}/one`).status).toBe('pending');
  });
  it('does not email a link revoked while its message was being composed', async () => {
    prepare.mockImplementation(async () => {
      store.seed(`${MANAGEMENT_ACCESS}/one`, { ...store.value(`${MANAGEMENT_ACCESS}/one`), status: 'revoked' });
      return { to: 'customer@example.test', subject: 'Test', html: 'Test', managementTokenHash: '2'.repeat(64) };
    });
    await deliverBookingConfirmation(store.db, 'one', deps);
    expect(send).not.toHaveBeenCalled();
  });
  it('recomposes a rotated link instead of sending the outdated one', async () => {
    prepare.mockImplementationOnce(async () => {
      store.seed(`${MANAGEMENT_ACCESS}/one`, { ...store.value(`${MANAGEMENT_ACCESS}/one`), version: 2, tokenHash: '3'.repeat(64) });
      return { to: 'customer@example.test', subject: 'Test', html: 'Old link', managementTokenHash: '2'.repeat(64) };
    });
    await deliverBookingConfirmation(store.db, 'one', deps);
    expect(send).not.toHaveBeenCalled(); expect(store.value(`${CONFIRMATION_JOBS}/one`).status).toBe('pending');
    vi.mocked(Date.now).mockReturnValue(now + 61_000);
    prepare.mockResolvedValue({ to: 'customer@example.test', subject: 'Test', html: 'New link', managementTokenHash: '3'.repeat(64) });
    await deliverBookingConfirmation(store.db, 'one', deps);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].html).toBe('New link');
  });
});
