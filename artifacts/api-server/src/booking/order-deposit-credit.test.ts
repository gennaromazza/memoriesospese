import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { reservationDb } from './test-helpers/reservation-db.js';
import { BOOKING_DEPOSIT_SOURCE, reconcileOrderBookingDeposit } from './order-deposit-credit.js';

function fixture(extra: Record<string, unknown> = {}) {
  const store = reservationDb();
  store.seed('orders/order', { bookingId: 'booking', totale: 20, acconto: 0, saldo: 20, transactions: [], ...extra });
  store.seed('bookings/booking', {
    depositPayment: { provider: 'paypal', status: 'paid', currency: 'EUR', amountCents: 500,
      paypalCaptureId: 'CAPTURE', paypalOrderId: 'PAYPALORDER', paidAt: Timestamp.fromMillis(123456) },
  });
  const receiptId = createHash('sha256').update('paypal-capture:CAPTURE').digest('hex');
  store.seed(`bookingPaymentCaptures/${receiptId}`, {
    bookingId: 'booking', paypalCaptureId: 'CAPTURE', currency: 'EUR', amountCents: 500, cashMovementId: 'cash',
  });
  store.seed('cashMovements/cash', { tipo: 'entrata', importo: 5 });
  return store;
}

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
});
