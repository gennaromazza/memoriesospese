import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { orderDepositFixture as fixture } from './test-helpers/order-deposit-fixture.js';
import { BOOKING_DEPOSIT_SOURCE, reconcileOrderBookingDeposit, reconcileOrderBookingDepositsBatch } from './order-deposit-credit.js';
import { reservationDb } from './test-helpers/reservation-db.js';
import { IN_PERSON_DEPOSITS, IN_PERSON_SOURCE } from './in-person-deposit.js';

describe('acconto prenotazione nell’ordine prodotti', () => {
  it('mostra 5 euro pagati e 15 residui senza creare un secondo incasso', async () => {
    const store = fixture();
    expect(await reconcileOrderBookingDeposit(store.db, 'order')).toBe(true);
    expect(store.value('orders/order')).toMatchObject({
      totale: 20, acconto: 5, saldo: 15, transactions: [{
        source: BOOKING_DEPOSIT_SOURCE, tipo: 'acconto', importo: 5,
        providerTransactionId: 'CAPTURE', cashMovementId: 'cash',
      }],
    });
    expect([...store.rows.keys()].filter(key => key.startsWith('cashMovements/'))).toEqual(['cashMovements/cash']);
  });

  it('è idempotente anche con due letture concorrenti e ricaricamenti', async () => {
    const store = fixture();
    await Promise.all([reconcileOrderBookingDeposit(store.db, 'order'), reconcileOrderBookingDeposit(store.db, 'order')]);
    expect(await reconcileOrderBookingDeposit(store.db, 'order')).toBe(false);
    expect(store.value('orders/order').transactions).toHaveLength(1);
    expect(store.value('orders/order').saldo).toBe(15);
  });

  it('mantiene gli altri pagamenti e riconosce un saldo già registrato', async () => {
    const store = fixture({ acconto: 15, saldo: 5, transactions: [
      { tipo: 'saldo', importo: 15, metodo: 'contante', data: Timestamp.now() },
    ] });
    await reconcileOrderBookingDeposit(store.db, 'order');
    expect(store.value('orders/order')).toMatchObject({ acconto: 20, saldo: 0 });
    expect(store.value('orders/order').transactions).toHaveLength(2);
  });

  it('preserva l’acconto manuale legacy senza sovrascriverlo', async () => {
    const store = fixture({ acconto: 2, saldo: 18 });
    await reconcileOrderBookingDeposit(store.db, 'order');
    expect(store.value('orders/order')).toMatchObject({ acconto: 7, saldo: 13 });
  });

  it('non copia incassi incerti o non confermati', async () => {
    const store = fixture();
    const booking = store.value('bookings/booking');
    store.seed('bookings/booking', { ...booking, depositPayment: { ...booking.depositPayment, status: 'paid_action_required' } });
    expect(await reconcileOrderBookingDeposit(store.db, 'order')).toBe(false);
    expect(store.value('orders/order').acconto).toBe(0);
  });

  it('non applica la stessa ricevuta a due ordini', async () => {
    const store = fixture();
    store.seed('orders/duplicate', { bookingId: 'booking', totale: 30 });
    await expect(reconcileOrderBookingDeposit(store.db, 'order')).rejects.toThrow('Più ordini');
    expect(store.value('orders/order').acconto).toBe(0);
  });

  it('riutilizza una ricevuta già presente invece di duplicarla', async () => {
    const store = fixture({ transactions: [{ tipo: 'acconto', importo: 5, providerTransactionId: 'CAPTURE' }] });
    await reconcileOrderBookingDeposit(store.db, 'order');
    expect(store.value('orders/order').transactions).toHaveLength(1);
    expect(store.value('orders/order').saldo).toBe(15);
  });

  it('azzera il credito solo dopo il rimborso completato, conservando il riferimento originale', async () => {
    const store = fixture();
    await reconcileOrderBookingDeposit(store.db, 'order');
    const booking = store.value('bookings/booking');
    store.seed('bookings/booking', { ...booking, bookingRefund: { status: 'pending' } });
    expect(await reconcileOrderBookingDeposit(store.db, 'order')).toBe(false);
    store.seed('bookings/booking', { ...booking, bookingRefund: { status: 'completed' } });
    await reconcileOrderBookingDeposit(store.db, 'order');
    expect(store.value('orders/order')).toMatchObject({ acconto: 0, saldo: 20,
      transactions: [{ importo: 0, originalAmountCents: 500, providerTransactionId: 'CAPTURE' }] });
  });

  it('verifica importo e identità della ricevuta persistita', async () => {
    const store = fixture();
    const receiptId = createHash('sha256').update('paypal-capture:CAPTURE').digest('hex');
    store.seed(`bookingPaymentCaptures/${receiptId}`, { bookingId: 'other', amountCents: 500, currency: 'EUR' });
    await expect(reconcileOrderBookingDeposit(store.db, 'order')).rejects.toThrow('Ricevuta');
    expect(store.value('orders/order').acconto).toBe(0);
  });

  it('non modifica gli ordini autonomi o degli shop', async () => {
    for (const extra of [{ bookingId: null }, { orderType: 'shop' }, { orderType: 'print_shop' }]) {
      const store = fixture(extra);
      expect(await reconcileOrderBookingDeposit(store.db, 'order')).toBe(false);
    }
  });

  describe('riconciliazione a gruppi', () => {
    function twoOrders() {
      const store = fixture();
      // Seconda prenotazione con ricevuta mancante: deve fallire da sola.
      store.seed('orders/broken', { bookingId: 'booking-broken', totale: 10, acconto: 0, saldo: 10, transactions: [] });
      store.seed('bookings/booking-broken', {
        depositPayment: { provider: 'paypal', status: 'paid', currency: 'EUR', amountCents: 300,
          paypalCaptureId: 'MISSING', paypalOrderId: 'PO', paidAt: Timestamp.fromMillis(1) },
      });
      return store;
    }

    it('un ordine anomalo non blocca gli altri del gruppo', async () => {
      const store = twoOrders();
      const result = await reconcileOrderBookingDepositsBatch(store.db, ['broken', 'order']);
      expect(result.updated).toBe(1);
      expect(result.failed).toEqual([{ id: 'broken', error: expect.stringContaining('Ricevuta') }]);
      expect(store.value('orders/order')).toMatchObject({ acconto: 5, saldo: 15 });
      expect(store.value('orders/broken').acconto).toBe(0);
    });

    it('elabora ogni identificativo una sola volta e rispetta il limite di concorrenza', async () => {
      const store = fixture();
      let running = 0;
      let peak = 0;
      const original = store.db.runTransaction.bind(store.db);
      (store.db as any).runTransaction = async (fn: any) => {
        running++; peak = Math.max(peak, running);
        try { return await original(fn); } finally { running--; }
      };
      const ids = ['order', 'order', ...Array.from({ length: 9 }, (_, n) => `none-${n}`)];
      const result = await reconcileOrderBookingDepositsBatch(store.db, ids, 3);
      expect(result).toEqual({ updated: 1, failed: [] });
      expect(peak).toBeLessThanOrEqual(3);
    });
  });
});

describe("acconto incassato di persona nell'ordine", () => {
  const receiptId = 'f'.repeat(64);
  function inPersonFixture(orderExtra: Record<string, unknown> = {}, paymentExtra: Record<string, unknown> = {}) {
    const store = reservationDb();
    store.seed('orders/order', { bookingId: 'booking', totale: 100, acconto: 0, saldo: 100, transactions: [], ...orderExtra });
    store.seed('bookings/booking', { stato: 'confermata', acconto: 20, depositPayment: { provider: 'in_person', status: 'paid', method: 'contante',
      currency: 'EUR', amountCents: 2000, receiptId, paidAt: Timestamp.fromMillis(123456), recordedBy: 'admin', ...paymentExtra },
    transactions: [{ tipo: 'acconto', importo: 20, metodo: 'contante', source: IN_PERSON_SOURCE, receiptId, cashMovementId: 'cash-inperson' }] });
    store.seed(`${IN_PERSON_DEPOSITS}/${receiptId}`, { bookingId: 'booking', amountCents: 2000, method: 'contante', cashMovementId: 'cash-inperson' });
    store.seed('cashMovements/cash-inperson', { tipo: 'entrata', importo: 20 });
    return store;
  }

  it("copia l'acconto di persona nell'ordine senza creare un secondo movimento di cassa", async () => {
    const store = inPersonFixture();
    expect(await reconcileOrderBookingDeposit(store.db, 'order')).toBe(true);
    expect(store.value('orders/order')).toMatchObject({ acconto: 20, saldo: 80, transactions: [{
      tipo: 'acconto', importo: 20, metodo: 'contante', source: IN_PERSON_SOURCE, receiptId, cashMovementId: 'cash-inperson', emailInviata: true }] });
    expect([...store.rows.keys()].filter(key => key.startsWith('cashMovements/'))).toEqual(['cashMovements/cash-inperson']);
  });

  it("e' idempotente (riletture e richieste concorrenti)", async () => {
    const store = inPersonFixture();
    await Promise.all([reconcileOrderBookingDeposit(store.db, 'order'), reconcileOrderBookingDeposit(store.db, 'order')]);
    expect(await reconcileOrderBookingDeposit(store.db, 'order')).toBe(false);
    expect(store.value('orders/order').transactions).toHaveLength(1);
    expect(store.value('orders/order').saldo).toBe(80);
  });

  it("mantiene i pagamenti gia' presenti e non supera il totale", async () => {
    const store = inPersonFixture({ acconto: 90, saldo: 10, transactions: [{ tipo: 'saldo', importo: 90, metodo: 'contante', data: Timestamp.now() }] });
    await reconcileOrderBookingDeposit(store.db, 'order');
    expect(store.value('orders/order').transactions).toHaveLength(2);
    expect(store.value('orders/order').saldo).toBe(0);
  });

  it("rifiuta una ricevuta mancante, di un'altra prenotazione o con importo diverso", async () => {
    const missing = inPersonFixture(); missing.rows.delete(`${IN_PERSON_DEPOSITS}/${receiptId}`);
    await expect(reconcileOrderBookingDeposit(missing.db, 'order')).rejects.toThrow('Ricevuta');
    const other = inPersonFixture(); other.seed(`${IN_PERSON_DEPOSITS}/${receiptId}`, { bookingId: 'altra', amountCents: 2000 });
    await expect(reconcileOrderBookingDeposit(other.db, 'order')).rejects.toThrow('Ricevuta');
    const amount = inPersonFixture(); amount.seed(`${IN_PERSON_DEPOSITS}/${receiptId}`, { bookingId: 'booking', amountCents: 1500 });
    await expect(reconcileOrderBookingDeposit(amount.db, 'order')).rejects.toThrow('Ricevuta');
    expect(missing.value('orders/order').acconto).toBe(0);
  });

  it("non fa nulla se la prenotazione non e' confermata o la ricevuta non e' valida", async () => {
    const pending = inPersonFixture(); pending.seed('bookings/booking', { ...pending.value('bookings/booking'), stato: 'in_attesa' });
    expect(await reconcileOrderBookingDeposit(pending.db, 'order')).toBe(false);
    const noReceipt = inPersonFixture({}, { receiptId: undefined });
    expect(await reconcileOrderBookingDeposit(noReceipt.db, 'order')).toBe(false);
  });

  it("piu' ordini sulla stessa prenotazione: da riconciliare a mano, senza duplicare l'acconto", async () => {
    const store = inPersonFixture();
    store.seed('orders/second', { bookingId: 'booking', totale: 50, acconto: 0, saldo: 50, transactions: [] });
    await expect(reconcileOrderBookingDeposit(store.db, 'order')).rejects.toThrow('Più ordini');
  });
});
