import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { registerManualBookingDeposit } from './manual-booking-deposit.js';
import { IN_PERSON_DEPOSITS, IN_PERSON_SOURCE } from './in-person-deposit.js';
import { depositReceiptReference } from '@shared/booking-deposit-receipt';
import { reconcileOrderBookingDeposit } from './order-deposit-credit.js';

// Prenotazione manuale dell'admin con acconto: l'incasso deve entrare in cassa e poter arrivare
// nell'ordine, come l'acconto incassato di persona.
const now = Date.parse('2030-12-10T08:00:00Z');
const id = 'manual-1';
let store: ReturnType<typeof reservationDb>;

function seed(extra: Record<string, unknown> = {}) {
  store.seed('booking_campaigns/camp', { nome: 'Campagna', temaStagionale: 'natale' });
  store.seed(`bookings/${id}`, { campaignId: 'camp', stato: 'confermata', isManual: true, createdByAdmin: 'admin-uid',
    cliente: { nome: 'Anna', cognome: 'Rossi', email: 'anna@example.test' },
    dataShootingInizio: Timestamp.fromMillis(now + 86_400_000), dataShootingFine: Timestamp.fromMillis(now + 88_200_000),
    totale: 100, acconto: 20, saldo: 80, metodoPagamento: 'contante',
    transactions: [{ tipo: 'acconto', importo: 20, metodo: 'contante', data: Timestamp.fromMillis(now), note: 'Acconto alla prenotazione', emailInviata: false }],
    ...extra });
}
const cashRows = () => [...store.rows].filter(([key]) => key.startsWith('cashMovements/'));

beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now); store = reservationDb(); });
afterEach(() => vi.restoreAllMocks());

describe('registerManualBookingDeposit', () => {
  it('crea l\'incasso in cassa e la ricevuta e collega la riga della prenotazione', async () => {
    seed();
    expect(await registerManualBookingDeposit(store.db, id, 'admin-uid')).toBe(true);
    const rows = cashRows();
    expect(rows).toHaveLength(1);
    expect(rows[0][1].value).toMatchObject({ tipo: 'entrata', categoria: 'Prenotazioni', importo: 20, metodoPagamento: 'contante',
      origine: 'booking', origineRef: id, bookingId: id, provider: 'in_person', origineTema: 'natale' });
    const booking = store.value(`bookings/${id}`);
    expect(booking.depositPayment).toMatchObject({ provider: 'in_person', status: 'paid', method: 'contante', amountCents: 2000, currency: 'EUR' });
    const receiptId = depositReceiptReference(booking.depositPayment)!;
    expect(booking.transactions[0]).toMatchObject({ source: IN_PERSON_SOURCE, receiptId, cashMovementId: rows[0][0].split('/')[1] });
    expect(store.value(`${IN_PERSON_DEPOSITS}/${receiptId}`)).toMatchObject({ bookingId: id, amountCents: 2000, method: 'contante' });
    expect(booking.acconto).toBe(20); // importi invariati
  });

  it('e\' idempotente: una seconda chiamata non duplica la cassa', async () => {
    seed();
    await registerManualBookingDeposit(store.db, id, 'admin-uid');
    expect(await registerManualBookingDeposit(store.db, id, 'admin-uid')).toBe(false);
    expect(cashRows()).toHaveLength(1);
  });

  it('chiamate concorrenti: una sola registrazione', async () => {
    seed();
    const results = await Promise.all([registerManualBookingDeposit(store.db, id, 'a'), registerManualBookingDeposit(store.db, id, 'a')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(cashRows()).toHaveLength(1);
  });

  it.each([
    ['senza acconto', { acconto: 0, transactions: [] }],
    ['non manuale', { isManual: false }],
    ['acconto gia\' con ricevuta PayPal', { depositPayment: { provider: 'paypal', status: 'paid', paypalCaptureId: 'CAP' } }],
    ['metodo non gestito', { metodoPagamento: 'altro', transactions: [{ tipo: 'acconto', importo: 20, metodo: 'altro' }] }],
    ['saldo completo registrato come pagamento unico', { transactions: [{ tipo: 'saldo', importo: 100, metodo: 'contante' }] }],
  ])('non fa nulla per una prenotazione %s', async (_label, patch) => {
    seed(patch);
    expect(await registerManualBookingDeposit(store.db, id, 'admin-uid')).toBe(false);
    expect(cashRows()).toHaveLength(0);
    expect(store.value(`bookings/${id}`).depositPayment).toEqual((patch as any).depositPayment);
  });

  it('prenotazione inesistente: nessun effetto', async () => {
    expect(await registerManualBookingDeposit(store.db, 'missing', 'admin-uid')).toBe(false);
  });

  it('l\'acconto arriva poi nell\'ordine senza un secondo movimento di cassa', async () => {
    seed();
    await registerManualBookingDeposit(store.db, id, 'admin-uid');
    store.seed('orders/order', { bookingId: id, totale: 100, acconto: 0, saldo: 100, transactions: [] });
    expect(await reconcileOrderBookingDeposit(store.db, 'order')).toBe(true);
    expect(store.value('orders/order')).toMatchObject({ acconto: 20, saldo: 80 });
    expect(cashRows()).toHaveLength(1);
  });
});
