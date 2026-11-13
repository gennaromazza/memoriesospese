import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { approveBookingWithDeposit, type ApprovedDepositDependencies } from './approved-deposit-request.js';
import { hashCheckoutToken } from './checkout-hold-state.js';
import { expireBookingPayments } from './payment-expiry.js';

const now = Date.parse('2030-12-10T08:00:00Z'), id = 'approved-test', campaignId = 'campaign-test';
const bookPath = `bookings/${id}`, holdPath = `bookingCheckoutHolds/${id}`, campaignPath = `booking_campaigns/${campaignId}`;
let store: ReturnType<typeof reservationDb>, deps: ApprovedDepositDependencies;
function approve() { return approveBookingWithDeposit(store.db, id, 'admin-test', deps); }
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  store = reservationDb();
  store.seed(campaignPath, { nome: 'Natale <2030>', attiva: true, richiedeApprovazione: true,
    richiedeAcconto: true, accontoImportoCentesimi: 2500 });
  store.seed(bookPath, { campaignId, stato: 'in_attesa', cliente: { nome: '<Alice>', cognome: 'Test', email: 'alice@example.test' },
    dataShootingInizio: Timestamp.fromMillis(now + 3_600_000 * 2), dataShootingFine: Timestamp.fromMillis(now + 3_600_000 * 2 + 1_800_000),
    note: 'Prodotti da decidere in studio', acconto: 0, transactions: [], createdAt: Timestamp.fromMillis(now - 10_000) });
  deps = {
    signingKey: () => 'test-signing-key-which-is-at-least-32-characters',
    assertPayPalConfigured: vi.fn(),
    checkCalendar: vi.fn(async () => {}),
    studio: vi.fn(async () => ({ name: 'Studio test', email: 'studio@example.test', phone: '000-test', address: 'Sede test' })),
    send: vi.fn(async () => {}),
  };
});
afterEach(() => vi.restoreAllMocks());
describe('approved deposit request', () => {
  it('keeps the booking pending, fixes one hour and sends only a personal payment request', async () => {
    const result = await approve();
    expect(result).toMatchObject({ success: true, paymentRequired: true, stato: 'in_attesa_pagamento', amountCents: 2500, emailStatus: 'sent' });
    expect(result?.expiresAt.getTime()).toBe(now + 3_600_000);
    expect(store.value(bookPath)).toMatchObject({ stato: 'in_attesa', acconto: 0,
      depositPaymentRequest: { status: 'pending', amountCents: 2500, emailStatus: 'sent' } });
    expect(store.value(bookPath).calendarEventId).toBeUndefined();
    const html = vi.mocked(deps.send).mock.calls[0][2];
    expect(html).toContain('25,00');
    expect(html).toContain('La prenotazione non è ancora confermata');
    expect(html).toContain('Non rispondere');
    expect(html).toContain('studio@example.test');
    expect(html).toContain('&lt;Alice&gt;');
    expect(html).not.toContain('<Alice>');
    const token = /https:\/\/imagestudiofotografico\.com\/prenota\/acconto\/approved-test#([a-f0-9]{64})/.exec(html)![1];
    expect(store.value(holdPath).tokenHash).toBe(hashCheckoutToken(token));
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(store.value(bookPath))).not.toContain(token);
    expect(vi.mocked(deps.send).mock.calls[0][1]).not.toContain('Prenotazione confermata');
  });
  it('concurrent/repeated approval sends once without changing the deadline', async () => {
    await Promise.all([approve(), approve()]);
    expect(deps.send).toHaveBeenCalledTimes(1);
    const original = store.value(holdPath);
    vi.mocked(Date.now).mockReturnValue(now + 11 * 60_000);
    await approve();
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(store.value(holdPath).expiresAt.toMillis()).toBe(now + 3_600_000);
    expect(store.value(holdPath).tokenHash).toBe(original.tokenHash);
    expect(deps.checkCalendar).toHaveBeenCalledTimes(2); // two initial preflights, never on retry
  });
  it('retries a definite provider rejection using the same amount, link and deadline', async () => {
    vi.mocked(deps.send).mockRejectedValueOnce(new Error('Gmail API error: 429 Too many requests'));
    expect(await approve()).toMatchObject({ emailStatus: 'failed' });
    const firstHtml = vi.mocked(deps.send).mock.calls[0][2];
    vi.mocked(Date.now).mockReturnValue(now + 30 * 60_000);
    store.seed(campaignPath, { ...store.value(campaignPath), accontoImportoCentesimi: 4000 });
    expect(await approve()).toMatchObject({ amountCents: 2500, emailStatus: 'sent' });
    expect(vi.mocked(deps.send).mock.calls[1][2]).toBe(firstHtml);
    expect(store.value(holdPath).paymentEmail.attempts).toBe(2);
    expect(store.value(bookPath).depositPaymentRequest.expiresAt.toMillis()).toBe(now + 3_600_000);
  });
  it('does not retry an ambiguous timeout or renew the request', async () => {
    vi.mocked(deps.send).mockRejectedValueOnce(new Error('Network timeout after sending'));
    expect(await approve()).toMatchObject({ emailStatus: 'unknown' });
    expect(await approve()).toMatchObject({ emailStatus: 'unknown' });
    expect(deps.send).toHaveBeenCalledTimes(1);
  });
  it('treats a crashed sending lease as unknown, not permission to send twice', async () => {
    await approve();
    store.seed(holdPath, { ...store.value(holdPath), paymentEmail: { status: 'sending', attempts: 1,
      leaseUntil: Timestamp.fromMillis(now - 1) } });
    expect(await approve()).toMatchObject({ emailStatus: 'unknown' });
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(store.value(bookPath).depositPaymentRequest.emailStatus).toBe('unknown');
  });
  it('bounds explicit retries after definite rejection', async () => {
    vi.mocked(deps.send).mockRejectedValue(new Error('Gmail API error: 403 Forbidden'));
    for (let i = 0; i < 4; i++) await approve();
    expect(deps.send).toHaveBeenCalledTimes(3);
    expect(store.value(holdPath).expiresAt.toMillis()).toBe(now + 3_600_000);
  });
  it('retains approved holds past ten minutes, then expires both documents at one hour', async () => {
    await approve();
    vi.mocked(Date.now).mockReturnValue(now + 11 * 60_000);
    await expireBookingPayments(store.db);
    expect(store.value(holdPath).status).toBe('active');
    expect(store.value(bookPath).stato).toBe('in_attesa');
    vi.mocked(Date.now).mockReturnValue(now + 3_600_000);
    await expect(approve()).rejects.toMatchObject({ status: 410 });
    await expireBookingPayments(store.db);
    expect(store.value(bookPath).stato).toBe('annullata');
    expect(store.value(bookPath).depositPaymentRequest.status).toBe('expired');
    expect(deps.send).toHaveBeenCalledTimes(1);
  });
  it.each([
    { richiedeAcconto: false }, { richiedeApprovazione: false },
  ])('leaves non-matching campaign modes untouched: %j', async changes => {
    store.seed(campaignPath, { ...store.value(campaignPath), ...changes });
    expect(await approve()).toBeNull();
    expect(deps.send).not.toHaveBeenCalled();
    expect(store.value(holdPath)).toBeUndefined();
  });
  it('does not retrofit unowned legacy requests', async () => {
    store.seed(bookPath, { ...store.value(bookPath), depositPaymentRequest: { status: 'pending' } });
    expect(await approve()).toBeNull();
    expect(deps.send).not.toHaveBeenCalled();
  });
  it('fails closed when PayPal or Calendar is unavailable', async () => {
    vi.mocked(deps.assertPayPalConfigured).mockImplementationOnce(() => { throw new Error('not configured'); });
    await expect(approve()).rejects.toMatchObject({ status: 503 });
    vi.mocked(deps.checkCalendar).mockRejectedValueOnce(new Error('Calendar unavailable'));
    await expect(approve()).rejects.toMatchObject({ status: 503 });
    expect(store.value(holdPath)).toBeUndefined();
    expect(deps.send).not.toHaveBeenCalled();
  });
  it('checks global reservations while excluding only the booking being approved', async () => {
    store.seed('bookings/conflicting', { ...store.value(bookPath), campaignId: 'another-campaign', stato: 'confermata' });
    await expect(approve()).rejects.toMatchObject({ status: 409 });
    expect(store.value(holdPath)).toBeUndefined();
  });
  it('rejects campaign or booking changes during the availability check', async () => {
    vi.mocked(deps.checkCalendar).mockImplementationOnce(async () => {
      store.seed(campaignPath, { ...store.value(campaignPath), accontoImportoCentesimi: 5000 });
    });
    await expect(approve()).rejects.toMatchObject({ status: 409 });
    expect(store.value(holdPath)).toBeUndefined();
  });
  it('does not regenerate credentials when the signing key rotates', async () => {
    await approve();
    const first = store.value(holdPath);
    deps.signingKey = () => 'another-test-key-which-is-at-least-32-characters';
    await expect(approve()).rejects.toMatchObject({ status: 503 });
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(store.value(holdPath).tokenHash).toBe(first.tokenHash);
    expect(store.value(holdPath).expiresAt.toMillis()).toBe(first.expiresAt.toMillis());
  });
  it('does not email after cancellation or modification of an existing request', async () => {
    vi.mocked(deps.send).mockRejectedValueOnce(new Error('Gmail API error: 429'));
    await approve();
    store.seed(bookPath, { ...store.value(bookPath), stato: 'annullata' });
    await expect(approve()).rejects.toMatchObject({ status: 409 });
    expect(deps.send).toHaveBeenCalledTimes(1);
  });
});
