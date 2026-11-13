import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { reservationDb } from './test-helpers/reservation-db.js';
import {
  authorizeBookingManagement, canIssueManagementLink, changeManagementLink,
  ensureBookingManagementLink, getManagementLinkSummary, MANAGEMENT_ACCESS,
} from './management-access.js';

const KEY = 'management-test-key-not-a-real-secret'.repeat(2);
let store: ReturnType<typeof reservationDb>;
const booking = () => ({ stato: 'confermata', campaignId: 'test-campaign',
  cliente: { nome: 'Cliente', cognome: 'Test', email: 'customer@example.test' }, noteAdmin: 'Private staff notes', acconto: 0 });
const token = (url: string) => new URL(url).hash.slice(1);
const mutate = (action: 'rotate' | 'revoke', expectedVersion: number) => ({ action, expectedVersion, requestId: randomUUID() });
beforeEach(() => { store = reservationDb(); store.seed('bookings/one', booking()); store.seed('bookings/two', booking()); });
afterEach(() => vi.unstubAllEnvs());

describe('personal booking management capability', () => {
  it('issues a random, idempotent fragment link and keeps the raw token out of Firestore', async () => {
    const url = await ensureBookingManagementLink(store.db, 'one', KEY);
    expect(new URL(url).pathname).toBe('/prenota/gestisci/one');
    expect(new URL(url).search).toBe('');
    expect(token(url)).toMatch(/^[a-f0-9]{64}$/);
    expect(await ensureBookingManagementLink(store.db, 'one', KEY)).toBe(url);
    expect(JSON.stringify([...store.rows])).not.toContain(token(url));
    expect((await authorizeBookingManagement(store.db, 'one', token(url))).booking.cliente.email).toBe('customer@example.test');
    expect((await ensureBookingManagementLink(store.db, 'two', KEY))).not.toBe(url);
  });
  it('rejects another booking, wrong token and malformed tokens without exposing data', async () => {
    const url = await ensureBookingManagementLink(store.db, 'one', KEY);
    await ensureBookingManagementLink(store.db, 'two', KEY);
    for (const [id, bearer] of [['two', token(url)], ['missing', token(url)], ['one', 'f'.repeat(64)], ['one', 'bad']]) {
      await expect(authorizeBookingManagement(store.db, id, bearer)).rejects.toMatchObject({ status: 404 });
    }
  });
  it.each(['in_attesa', 'rifiutata', 'annullata', 'cancellation_pending'])('does not issue a link for %s', async stato => {
    store.seed('bookings/one', { ...booking(), stato });
    await expect(ensureBookingManagementLink(store.db, 'one', KEY)).rejects.toMatchObject({ status: 409 });
    expect(store.value(`${MANAGEMENT_ACCESS}/one`)).toBeUndefined();
  });
  it('does not let a fake confirmed/manual amount bypass an unpaid deposit', async () => {
    store.seed('bookings/one', { ...booking(), acconto: 30, depositPaymentRequest: { status: 'pending', amountCents: 3000, currency: 'EUR' } });
    expect(canIssueManagementLink(store.value('bookings/one'))).toBe(false);
    await expect(ensureBookingManagementLink(store.db, 'one', KEY)).rejects.toMatchObject({ status: 409 });
  });
  it('accepts a verified paid deposit but not late money or a mismatched amount', () => {
    const root = { ...booking(), depositPayment: { status: 'paid', provider: 'paypal', currency: 'EUR',
      amountCents: 3000, paypalCaptureId: 'test-capture', paypalOrderId: 'test-order' } };
    expect(canIssueManagementLink(root)).toBe(true);
    expect(canIssueManagementLink({ ...root, paymentReviewRequired: true })).toBe(false);
    expect(canIssueManagementLink({ ...root, depositPayment: { ...root.depositPayment, status: 'paid_action_required' } })).toBe(false);
    expect(canIssueManagementLink({ ...root, depositPaymentRequest: { status: 'paid', currency: 'EUR', amountCents: 2000 } })).toBe(false);
  });
  it('revokes without the signing secret and never reissues automatically after revocation', async () => {
    const url = await ensureBookingManagementLink(store.db, 'one', KEY);
    vi.stubEnv('SESSION_SECRET', '');
    const result = await changeManagementLink(store.db, 'one', mutate('revoke', 1), 'staff');
    expect(result).toMatchObject({ status: 'revoked', version: 2, url: null });
    await expect(authorizeBookingManagement(store.db, 'one', token(url))).rejects.toMatchObject({ status: 404 });
    await expect(ensureBookingManagementLink(store.db, 'one', KEY)).rejects.toMatchObject({ status: 409 });
  });
  it('rotates atomically, invalidates the old token and replays only the latest matching intent', async () => {
    const old = await ensureBookingManagementLink(store.db, 'one', KEY), intent = mutate('rotate', 1);
    const first = await changeManagementLink(store.db, 'one', intent, 'staff', KEY);
    const replay = await changeManagementLink(store.db, 'one', intent, 'staff', KEY);
    expect(replay.url).toBe(first.url); expect(replay.version).toBe(2);
    await expect(authorizeBookingManagement(store.db, 'one', token(old))).rejects.toMatchObject({ status: 404 });
    await authorizeBookingManagement(store.db, 'one', token(first.url!));
    await changeManagementLink(store.db, 'one', mutate('revoke', 2), 'staff', KEY);
    await expect(changeManagementLink(store.db, 'one', intent, 'staff', KEY)).rejects.toMatchObject({ status: 409 });
  });
  it('allows one concurrent rotation and rejects a stale competing version', async () => {
    await ensureBookingManagementLink(store.db, 'one', KEY);
    const outcomes = await Promise.allSettled([1, 2].map(() => changeManagementLink(store.db, 'one', mutate('rotate', 1), 'staff', KEY)));
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(store.value(`${MANAGEMENT_ACCESS}/one`).version).toBe(2);
  });
  it('binds the link to the customer and document incarnation, not just the URL ID', async () => {
    const url = await ensureBookingManagementLink(store.db, 'one', KEY);
    store.seed('bookings/one', { ...store.value('bookings/one'), cliente: { ...booking().cliente, email: 'other@example.test' } });
    await expect(authorizeBookingManagement(store.db, 'one', token(url))).rejects.toMatchObject({ status: 404 });
    await expect(ensureBookingManagementLink(store.db, 'one', KEY)).rejects.toMatchObject({ status: 409 });
    store.seed('bookings/one', booking());
    await expect(authorizeBookingManagement(store.db, 'one', token(url))).rejects.toMatchObject({ status: 404 });
  });
  it('keeps an already issued link readable after cancellation, without allowing a fresh issue', async () => {
    const url = await ensureBookingManagementLink(store.db, 'one', KEY);
    store.seed('bookings/one', { ...store.value('bookings/one'), stato: 'annullata' });
    await authorizeBookingManagement(store.db, 'one', token(url));
    expect((await getManagementLinkSummary(store.db, 'one')).canIssue).toBe(false);
  });
  it('does not silently change the existing emailed link when the signing key changes', async () => {
    const url = await ensureBookingManagementLink(store.db, 'one', KEY);
    await expect(ensureBookingManagementLink(store.db, 'one', 'different-key')).rejects.toMatchObject({ status: 409 });
    await authorizeBookingManagement(store.db, 'one', token(url));
  });
  it('does not issue a new customer’s token to a stale email recipient', async () => {
    store.seed('bookings/one', { ...booking(), cliente: { email: 'new-owner@example.test' } });
    await expect(ensureBookingManagementLink(store.db, 'one', KEY, 'customer@example.test')).rejects.toMatchObject({ status: 409 });
    expect(store.value(`${MANAGEMENT_ACCESS}/one`)).toBeUndefined();
  });
});
