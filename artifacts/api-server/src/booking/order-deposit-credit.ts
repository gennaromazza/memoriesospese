import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';

export const BOOKING_DEPOSIT_SOURCE = 'booking_paypal_deposit';
const cents = (value: number) => Math.round(value * 100);

/** Copies an existing receipt into ONE product order. Never creates a cash movement. */
export async function reconcileOrderBookingDeposit(db: Firestore, orderId: string): Promise<boolean> {
  return db.runTransaction(async tx => {
    const ref = db.collection('orders').doc(orderId);
    const order = (await tx.get(ref)).data();
    if (!order?.bookingId || ['shop', 'print_shop'].includes(order.orderType)) return false;
    const booking = (await tx.get(db.collection('bookings').doc(order.bookingId))).data();
    const payment = booking?.depositPayment;
    if (payment?.provider !== 'paypal' || payment.status !== 'paid' || payment.currency !== 'EUR'
      || !Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0 || !payment.paypalCaptureId) return false;
    const receiptId = createHash('sha256').update(`paypal-capture:${payment.paypalCaptureId}`).digest('hex');
    const [receiptSnap, related] = await Promise.all([
      tx.get(db.collection('bookingPaymentCaptures').doc(receiptId)),
      tx.get(db.collection('orders').where('bookingId', '==', order.bookingId).limit(2)),
    ]);
    const receipt = receiptSnap.data();
    if (!receipt || receipt.bookingId !== order.bookingId || receipt.paypalCaptureId !== payment.paypalCaptureId
      || receipt.amountCents !== payment.amountCents || receipt.currency !== 'EUR') {
      throw new Error('Ricevuta dell’acconto non verificabile: controlla il pagamento della prenotazione.');
    }
    if (related.size !== 1) throw new Error('Più ordini collegati alla stessa prenotazione: acconto da riconciliare senza duplicarlo.');
    const refunded = booking?.bookingRefund?.status === 'completed';
    const amount = refunded ? 0 : payment.amountCents / 100;
    let transactions: any[] = Array.isArray(order.transactions) ? [...order.transactions] : [];
    // Preserve old manual payments before adding the first receipt to a legacy order.
    if (!transactions.length && Number(order.acconto) > 0) {
      transactions.push({ tipo: 'acconto', importo: Number(order.acconto), metodo: order.metodoPagamentoAcconto || 'contante',
        data: order.dataAcconto || order.createdAt || Timestamp.now(), emailInviata: false, note: 'Acconto ordine preesistente' });
    }
    const matches = transactions.filter(line => line.providerTransactionId === payment.paypalCaptureId
      || line.source === BOOKING_DEPOSIT_SOURCE);
    if (matches.length > 1) throw new Error('Acconto già presente più volte nell’ordine: verifica necessaria.');
    const credit = {
      tipo: 'acconto', importo: amount, metodo: 'paypal', data: payment.paidAt,
      emailInviata: true, source: BOOKING_DEPOSIT_SOURCE, bookingId: order.bookingId,
      providerTransactionId: payment.paypalCaptureId, paypalOrderId: payment.paypalOrderId,
      originalAmountCents: payment.amountCents, cashMovementId: receipt.cashMovementId,
      note: refunded ? 'Acconto prenotazione rimborsato da PayPal' : 'Acconto versato online durante la prenotazione',
    };
    if (!credit.data || !credit.cashMovementId || !credit.paypalOrderId) throw new Error('Dati della ricevuta acconto incompleti.');
    if (matches.length) transactions = transactions.map(line => line === matches[0] ? { ...line, ...credit } : line);
    else transactions.push(credit);
    const paidCents = transactions.reduce((sum, line) => sum + cents(Number(line.importo) || 0), 0);
    const saldo = Math.max(0, cents(Number(order.totale) || 0) - paidCents) / 100;
    const changed = !matches.length || matches[0].source !== BOOKING_DEPOSIT_SOURCE
      || matches[0].importo !== amount || order.acconto !== paidCents / 100 || order.saldo !== saldo;
    if (!changed) return false;
    tx.update(ref, { transactions, acconto: paidCents / 100, saldo, updatedAt: Timestamp.now() });
    return true;
  });
}

export interface DepositBatchResult {
  updated: number;
  failed: Array<{ id: string; error: string }>;
}

/**
 * Riconcilia più ordini con concorrenza limitata. Un ordine anomalo (ricevuta mancante,
 * più ordini sulla stessa prenotazione…) finisce in `failed` senza bloccare gli altri.
 */
export async function reconcileOrderBookingDepositsBatch(
  db: Firestore,
  orderIds: Iterable<string>,
  concurrency = 5,
): Promise<DepositBatchResult> {
  const queue = [...new Set(orderIds)];
  const result: DepositBatchResult = { updated: 0, failed: [] };
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        if (await reconcileOrderBookingDeposit(db, id)) result.updated++;
      } catch (error: any) {
        result.failed.push({ id, error: error?.message || 'Acconto da riconciliare' });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker));
  return result;
}
