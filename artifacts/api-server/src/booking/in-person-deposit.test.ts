import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { CheckoutHoldError } from './checkout-hold-state.js';
import { CHECKOUT_HOLDS } from './slot-reservations.js';
import { CONFIRMATION_JOBS } from './confirmation-delivery.js';
import { recordInPersonDeposit, IN_PERSON_DEPOSITS } from './in-person-deposit.js';
import { depositReceiptReference } from '@shared/booking-deposit-receipt';

const now = Date.parse('2030-12-10T08:00:00Z');
const id = 'booking-1';
const start = Timestamp.fromMillis(now + 3 * 86_400_000), end = Timestamp.fromMillis(now + 3 * 86_400_000 + 1_800_000);
let store: ReturnType<typeof reservationDb>;

const input = (extra: Record<string, unknown> = {}) => ({ amountCents: 2000, method: 'contante' as const, requestId: 'req-0001', ...extra });
const run = (extra: Record<string, unknown> = {}, actor = 'admin-uid') => recordInPersonDeposit(store.db, id, input(extra) as any, actor);

function seedBooking(extra: Record<string, unknown> = {}) {
  store.seed('booking_campaigns/camp', { nome: 'Campagna Natale', temaStagionale: 'natale', attiva: true,
    richiedeAcconto: true, richiedeApprovazione: true, accontoImportoCentesimi: 5000 });
  store.seed(`bookings/${id}`, { campaignId: 'camp', stato: 'in_attesa', statoWorkflow: 'richiesta',
    cliente: { nome: 'Anna', cognome: 'Rossi', email: 'anna@example.test', whatsapp: '1' },
    dataShootingInizio: start, dataShootingFine: end, acconto: 0, transactions: [], ...extra });
}
function seedApprovedRequest(hold: Record<string, unknown> = {}) {
  const requestedAt = Timestamp.fromMillis(now - 600_000), expiresAt = Timestamp.fromMillis(now + 3_000_000);
  seedBooking({ depositPaymentRequest: { status: 'pending', amountCents: 5000, currency: 'EUR', requestedAt, expiresAt, approvedBy: 'admin-uid' } });
  store.seed(`${CHECKOUT_HOLDS}/${id}`, { bookingId: id, campaignId: 'camp', kind: 'approved_deposit', status: 'active', currency: 'EUR',
    depositAmountCents: 5000, createdAt: requestedAt, expiresAt, dataShootingInizio: start, dataShootingFine: end,
    draft: { cliente: { email: 'anna@example.test' } }, ...hold });
}
const cashRows = () => [...store.rows].filter(([key]) => key.startsWith('cashMovements/'));

beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now); store = reservationDb(); });
afterEach(() => vi.restoreAllMocks());

describe('acconto incassato di persona: registrazione', () => {
  it('conferma la prenotazione con un importo DIVERSO da quello della campagna, in una sola transazione', async () => {
    seedApprovedRequest();
    const result = await run({ amountCents: 2000, method: 'carta' });
    expect(result).toMatchObject({ bookingId: id, amountCents: 2000, method: 'carta', duplicate: false, stato: 'confermata' });

    const booking = store.value(`bookings/${id}`);
    expect(booking).toMatchObject({ stato: 'confermata', acconto: 20, metodoPagamento: 'carta', confermataDa: 'admin-uid', calendarSyncPending: true });
    expect(booking.depositPayment).toMatchObject({ provider: 'in_person', status: 'paid', method: 'carta', amountCents: 2000, currency: 'EUR',
      recordedBy: 'admin-uid' });
    expect(depositReceiptReference(booking.depositPayment)).toBe(result.receiptId);
    expect(booking.transactions).toHaveLength(1);
    expect(booking.transactions[0]).toMatchObject({ tipo: 'acconto', importo: 20, metodo: 'carta', source: 'booking_in_person_deposit',
      receiptId: result.receiptId });
    expect(booking.depositPaymentRequest).toMatchObject({ status: 'paid', amountCents: 5000 }); // la richiesta storica non viene riscritta
  });

  it('chiude il link PayPal (il checkout non e\' piu\' utilizzabile) e crea il lavoro di conferma', async () => {
    seedApprovedRequest();
    const { receiptId } = await run();
    expect(store.value(`${CHECKOUT_HOLDS}/${id}`)).toMatchObject({ status: 'cancelled', closedReason: 'in_person_deposit' });
    expect(store.value(`${CONFIRMATION_JOBS}/${id}`)).toMatchObject({ status: 'pending', attempts: 0, captureId: receiptId, amountCents: 2000 });
  });

  it('registra l\'incasso in cassa con lo stesso importo e il metodo scelto, una volta sola', async () => {
    seedApprovedRequest();
    const { receiptId } = await run({ amountCents: 1550, method: 'bonifico' });
    const rows = cashRows();
    expect(rows).toHaveLength(1);
    expect(rows[0][1].value).toMatchObject({ tipo: 'entrata', categoria: 'Prenotazioni', importo: 15.5, metodoPagamento: 'bonifico',
      origine: 'booking', origineRef: id, bookingId: id, campaignId: 'camp', provider: 'in_person', receiptId, origineTema: 'natale' });
    expect(store.value(`${IN_PERSON_DEPOSITS}/${receiptId}`)).toMatchObject({ bookingId: id, amountCents: 1550, method: 'bonifico' });
    expect(store.value(`bookings/${id}`).transactions[0].cashMovementId).toBe(rows[0][0].split('/')[1]);
  });

  it('funziona anche su una richiesta non ancora approvata (nessuna finestra PayPal)', async () => {
    seedBooking();
    const result = await run({ amountCents: 3000 });
    expect(result.stato).toBe('confermata');
    expect(store.value(`bookings/${id}`)).toMatchObject({ stato: 'confermata', acconto: 30 });
    expect(store.value(`${CHECKOUT_HOLDS}/${id}`)).toBeUndefined(); // nessun hold da chiudere
  });

  it('aggiorna la guardia del giorno come ogni altra riserva', async () => {
    seedBooking();
    await run();
    expect([...store.rows.keys()].some(key => key.startsWith('bookingSlotLocks/'))).toBe(true);
  });
});

describe('acconto incassato di persona: idempotenza', () => {
  it('la stessa richiesta ripetuta (doppio clic, ritentativo) non duplica nulla', async () => {
    seedApprovedRequest();
    const first = await run();
    const again = await run();
    expect(again).toMatchObject({ duplicate: true, receiptId: first.receiptId, amountCents: 2000 });
    expect(cashRows()).toHaveLength(1);
    expect(store.value(`bookings/${id}`).transactions).toHaveLength(1);
    expect(store.value(`bookings/${id}`).acconto).toBe(20);
  });

  it('due richieste concorrenti identiche: una sola registrazione', async () => {
    seedApprovedRequest();
    const results = await Promise.all([run(), run()]);
    expect(results.filter(r => !r.duplicate)).toHaveLength(1);
    expect(cashRows()).toHaveLength(1);
    expect(store.value(`bookings/${id}`).acconto).toBe(20);
  });

  it('lo stesso identificativo con dati diversi viene rifiutato', async () => {
    seedApprovedRequest();
    await run({ amountCents: 2000 });
    await expect(run({ amountCents: 2500 })).rejects.toMatchObject({ status: 409 });
    expect(store.value(`bookings/${id}`).acconto).toBe(20);
  });

  it('un nuovo identificativo su una prenotazione gia\' pagata viene rifiutato (nessun secondo acconto)', async () => {
    seedApprovedRequest();
    await run({ requestId: 'req-0001' });
    await expect(run({ requestId: 'req-0002' })).rejects.toBeInstanceOf(CheckoutHoldError);
    expect(cashRows()).toHaveLength(1);
  });
});

describe('acconto incassato di persona: rifiuti senza effetti', () => {
  const untouched = () => {
    expect(store.value(`bookings/${id}`)).toMatchObject({ stato: expect.stringMatching(/in_attesa|annullata/), acconto: 0 });
    expect(cashRows()).toHaveLength(0);
    expect(store.value(`${CONFIRMATION_JOBS}/${id}`)).toBeUndefined();
  };

  it.each([
    ['importo zero', { amountCents: 0 }],
    ['importo negativo', { amountCents: -500 }],
    ['importo con decimali', { amountCents: 1999.5 }],
    ['importo non numerico', { amountCents: '20' }],
    ['importo enorme', { amountCents: 100_000_000 }],
    ['metodo sconosciuto', { method: 'paypal' }],
    ['identificativo troppo corto', { requestId: 'a' }],
  ])('rifiuta %s', async (_label, patch) => {
    seedApprovedRequest();
    await expect(run(patch)).rejects.toMatchObject({ status: 400 });
    untouched();
  });

  it('prenotazione inesistente: 404', async () => {
    await expect(run()).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ['gia\' confermata', { stato: 'confermata' }, 409],
    ['annullata', { stato: 'annullata' }, 409],
    ['da riconciliare', { paymentReviewRequired: true }, 409],
    ['con acconto gia\' registrato', { acconto: 10 }, 409],
  ])('prenotazione %s: nessun effetto', async (_label, patch, status) => {
    seedApprovedRequest();
    store.seed(`bookings/${id}`, { ...store.value(`bookings/${id}`), ...patch });
    await expect(run()).rejects.toMatchObject({ status });
    expect(cashRows()).toHaveLength(0);
  });

  it('richiesta di acconto scaduta: 410, non si riattiva', async () => {
    seedApprovedRequest();
    store.seed(`bookings/${id}`, { ...store.value(`bookings/${id}`), depositPaymentRequest: {
      ...store.value(`bookings/${id}`).depositPaymentRequest, expiresAt: Timestamp.fromMillis(now - 1000) } });
    await expect(run()).rejects.toMatchObject({ status: 410 });
    untouched();
  });

  it('con un pagamento PayPal in corso o incerto: 409, prima si verifica PayPal', async () => {
    seedApprovedRequest({ paypalCaptureAttempt: { state: 'capturing', leaseUntil: Timestamp.fromMillis(now + 30_000) } });
    await expect(run()).rejects.toMatchObject({ status: 409 });
    seedApprovedRequest({ paypalCaptureAttempt: { state: 'unknown', leaseUntil: Timestamp.fromMillis(0) } });
    await expect(run()).rejects.toMatchObject({ status: 409 });
    untouched();
  });

  it('un tentativo PayPal rifiutato con certezza non blocca il pagamento di persona', async () => {
    seedApprovedRequest({ paypalCaptureAttempt: { state: 'declined', leaseUntil: Timestamp.fromMillis(0) } });
    await expect(run()).resolves.toMatchObject({ stato: 'confermata' });
  });

  it('se PayPal ha gia\' incassato (denaro ricevuto) non si registra un secondo acconto', async () => {
    seedApprovedRequest({ depositPayment: { status: 'paid_action_required', paypalCaptureId: 'CAP-1' } });
    await expect(run()).rejects.toMatchObject({ status: 409 });
    untouched();
  });

  it('shooting gia\' iniziato: 400', async () => {
    seedApprovedRequest();
    store.seed(`bookings/${id}`, { ...store.value(`bookings/${id}`), dataShootingInizio: Timestamp.fromMillis(now - 1000) });
    await expect(run()).rejects.toMatchObject({ status: 400 });
  });

  it('slot occupato da un\'altra prenotazione nel frattempo: 409', async () => {
    seedBooking();
    store.seed('bookings/other', { campaignId: 'camp', stato: 'confermata', dataShootingInizio: start, dataShootingFine: end });
    await expect(run()).rejects.toMatchObject({ status: 409 });
    untouched();
  });
});
