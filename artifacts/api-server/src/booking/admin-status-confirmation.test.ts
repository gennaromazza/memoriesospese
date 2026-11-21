import { beforeEach, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { checkAdminConfirmation, commitAdminConfirmation } from './admin-status-confirmation.js';
import { unpaidDepositRequestExpired } from './payment-deadlines.js';
import { canIssueManagementLink } from './management-access.js';

// Management links are only checked for eligibility here; never send or rotate real links.
vi.mock('../google-calendar.js', () => ({}));
let store: ReturnType<typeof reservationDb>;
const start = Timestamp.fromDate(new Date('2030-12-16T16:30:00Z'));
const end = Timestamp.fromMillis(start.toMillis() + 30 * 60_000);
const request = { status: 'pending', amountCents: 500, currency: 'EUR',
  requestedAt: Timestamp.fromMillis(Date.now() - 10_000), expiresAt: Timestamp.fromMillis(Date.now() + 3_590_000) };
const booking = () => ({ stato: 'in_attesa', campaignId: 'campaign', dataShootingInizio: start, dataShootingFine: end,
  cliente: { nome: 'Cliente', cognome: 'Test', email: 'cliente@example.test' },
  acconto: 0, saldo: 50, transactions: [], depositPaymentRequest: request });
const source = () => store.value('bookings/one');
const confirm = () => commitAdminConfirmation(store.db, 'one', source(), {
  stato: 'confermata', googleCalendarEventId: 'new-google-event',
}, 'admin-test');
beforeEach(() => {
  store = reservationDb(); store.seed('bookings/one', booking());
  store.seed('bookingCheckoutHolds/one', { bookingId: 'one', status: 'active', kind: 'approved_deposit',
    dataShootingInizio: start, dataShootingFine: end, expiresAt: request.expiresAt, tokenHash: 'old-token' });
});
it('conferma, conserva l’audit e disabilita il checkout senza inventare un acconto', async () => {
  await checkAdminConfirmation(store.db, 'one', source()); await confirm();
  expect(source()).toMatchObject({ stato: 'confermata', googleCalendarEventId: 'new-google-event',
    acconto: 0, saldo: 50, transactions: [], depositWaiver: { originalRequest: request, waivedBy: 'admin-test' } });
  expect(source().depositPayment).toBeUndefined();
  expect(source().depositPaymentRequest).toBeUndefined();
  expect(store.value('bookingCheckoutHolds/one')).toMatchObject({ status: 'cancelled', closedReason: 'admin_deposit_waiver' });
  expect(unpaidDepositRequestExpired(source(), Date.now() + 99_999_999)).toBe(false);
  expect(canIssueManagementLink(source())).toBe(true);
  expect([...store.rows.keys()].filter(key => !key.startsWith('bookingSlotLocks/')).sort()).toEqual([
    'bookingCheckoutHolds/one', 'bookings/one',
  ]);
});
it.each(['started', 'unknown', 'captured'])('non sovrascrive un incasso PayPal %s', async state => {
  const original = { ...source() };
  store.seed('bookingCheckoutHolds/one', { bookingId: 'one', status: 'active', paypalCaptureAttempt: { state } });
  await expect(confirm()).rejects.toThrow('pagamento PayPal');
  expect(source()).toEqual(original);
  expect(store.value('bookingCheckoutHolds/one').status).toBe('active');
});
it('un tentativo rifiutato non impedisce la conferma senza acconto', async () => {
  store.seed('bookingCheckoutHolds/one', { bookingId: 'one', status: 'active', paypalCaptureAttempt: { state: 'declined' } });
  await confirm(); expect(source().stato).toBe('confermata');
});
it('ricontrolla in transazione se PayPal è partito dopo la verifica preliminare', async () => {
  await checkAdminConfirmation(store.db, 'one', source());
  store.seed('bookingCheckoutHolds/one', { bookingId: 'one', status: 'active', paypalCaptureAttempt: { state: 'started' } });
  await expect(confirm()).rejects.toThrow('pagamento PayPal');
  expect(source().stato).toBe('in_attesa');
});
it('non sostituisce una ricevuta o un caso da riconciliare con un esonero', async () => {
  store.seed('bookings/one', { ...booking(), paymentReviewRequired: true, depositPayment: { status: 'paid_action_required' } });
  await expect(confirm()).rejects.toThrow('da verificare');
  expect(source().depositWaiver).toBeUndefined();
});
it('una richiesta segnata pagata senza ricevuta richiede verifica, non un esonero', async () => {
  store.seed('bookings/one', { ...booking(), depositPaymentRequest: { ...request, status: 'paid' } });
  await expect(confirm()).rejects.toMatchObject({ status: 409 });
  expect(source().depositPaymentRequest.status).toBe('paid');
  expect(source().depositWaiver).toBeUndefined();
});
it('riacquisisce lo slot di una richiesta scaduta soltanto se è ancora libero', async () => {
  store.seed('bookings/one', { ...booking(), depositPaymentRequest: { ...request, status: 'expired' } });
  store.seed('bookings/other', { ...booking(), stato: 'confermata', depositPaymentRequest: undefined });
  await expect(confirm()).rejects.toMatchObject({ status: 409, message: 'Slot non più disponibile: aggiorna la prenotazione.' });
  expect(source().stato).toBe('in_attesa');
});
it('può confermare una richiesta scaduta quando lo slot è libero senza riavviare PayPal', async () => {
  store.seed('bookings/one', { ...booking(), depositPaymentRequest: { ...request, status: 'expired' } });
  await confirm(); expect(source().stato).toBe('confermata');
  expect(source().depositWaiver.originalRequest.status).toBe('expired');
});
it('una seconda conferma concorrente non modifica l’esonero già salvato', async () => {
  const original = source();
  const results = await Promise.allSettled([1, 2].map(() => commitAdminConfirmation(store.db, 'one', original,
    { stato: 'confermata', googleCalendarEventId: 'new-google-event' }, 'admin-test')));
  expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(source().stato).toBe('confermata');
});
