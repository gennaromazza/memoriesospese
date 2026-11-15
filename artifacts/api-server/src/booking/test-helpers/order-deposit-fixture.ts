import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './reservation-db.js';

/** Existing PayPal receipt: reconciling must never create another cash entry. */
export function orderDepositFixture(extra: Record<string, unknown> = {}) {
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
