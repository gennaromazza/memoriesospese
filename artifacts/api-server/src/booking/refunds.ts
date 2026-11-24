import { createHash, randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { PayPalOrdersClient } from '../print-shop/paypal-orders.js';
import { paypalValueToCents } from '../print-shop/paypal-orders.js';
import { BOOKING_PAYPAL_ORDERS, bookingPayPalAccountKey, bookingPayPalClient, assertBookingPayPalOrderIdentity } from './paypal-deposit-orders.js';
import { BOOKING_PAYMENT_CAPTURES, paymentHash } from './deposit-payment-ledger.js';
import { BookingManagementError } from './management-access.js';
import { bookingDepositCents } from './cancellation-policy.js';
import { refundSource } from './refund-source.js';
type RefundClient = Pick<PayPalOrdersClient, 'config' | 'getOrder' | 'getRefund' | 'refundCapture'>;
const digest = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);

/** Approval freezes the original receipt, not an amount supplied by the browser. */
export async function approveBookingRefund(db: Firestore, id: string, actor: string, expectedAmountCents?: number) {
  const refundRef = db.collection('bookingRefunds').doc(id);
  await db.runTransaction(async tx => {
    const source = await refundSource(db, tx, id), root = source?.data, old = (await tx.get(refundRef)).data();
    if (!root) throw new BookingManagementError(404, 'Prenotazione non trovata.');
    if (expectedAmountCents !== undefined && expectedAmountCents !== bookingDepositCents(root)) {
      throw new BookingManagementError(409, 'L’importo è cambiato: aggiorna e conferma nuovamente.');
    }
    if (old) {
      if (old.captureId !== root.depositPayment?.paypalCaptureId) throw new BookingManagementError(409, 'Incasso cambiato: verifica manuale necessaria.');
      if (old.status === 'review' && !old.providerStarted) {
        tx.update(refundRef, { status: 'approved', attempts: 0, actor, notBefore: Timestamp.fromMillis(0), leaseUntil: Timestamp.fromMillis(0) });
        tx.update(source!.ref, { 'bookingRefund.status': 'approved', updatedAt: Timestamp.now() });
      }
      return;
    }
    const payment = root.depositPayment;
    if (!['annullata', 'cancellata'].includes(root.stato) || root.bookingCancellation?.status === 'blocked') {
      throw new BookingManagementError(409, 'Completa prima l’annullamento del calendario.');
    }
    if (payment?.provider !== 'paypal' || !['paid', 'paid_action_required'].includes(payment.status)
      || payment.currency !== 'EUR' || !Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0) {
      throw new BookingManagementError(409, 'Acconto da gestire direttamente con lo studio: nessun rimborso PayPal avviato.');
    }
    const [capture, association] = await Promise.all([
      tx.get(db.collection(BOOKING_PAYMENT_CAPTURES).doc(paymentHash(`paypal-capture:${payment.paypalCaptureId}`))),
      tx.get(db.collection(BOOKING_PAYPAL_ORDERS).doc(payment.paypalOrderId)),
    ]);
    if (capture.data()?.bookingId !== id || capture.data()?.amountCents !== payment.amountCents
      || association.data()?.bookingId !== id || association.data()?.captureId !== payment.paypalCaptureId) {
      throw new BookingManagementError(409, 'Ricevuta di incasso non verificabile: controlla il pagamento prima del rimborso.');
    }
    const requestId = digest(`booking-refund:${payment.paypalCaptureId}`);
    tx.set(refundRef, { bookingId: id, amountCents: payment.amountCents, currency: 'EUR',
      captureId: payment.paypalCaptureId, orderId: payment.paypalOrderId, accountKey: association.data()!.accountKey,
      requestId, status: 'approved', actor, createdAt: Timestamp.now(), epoch: root.managementAccessEpoch || null,
      refundId: null, attempts: 0, sourceKind: source!.kind });
    tx.update(source!.ref, { bookingRefund: { status: 'approved', amountCents: payment.amountCents, refundId: null },
      updatedAt: Timestamp.now() });
  });
}

/** Only the first claimed invocation may POST. Recovery exclusively reads provider state. */
export async function processBookingRefund(db: Firestore, id: string, client?: RefundClient) {
  const ref = db.collection('bookingRefunds').doc(id), rootRef = db.collection('bookings').doc(id), lease = randomUUID();
  const job = await db.runTransaction(async tx => {
    const item = (await tx.get(ref)).data(), source = await refundSource(db, tx, id, item?.sourceKind), root = source?.data;
    if (!item || !['approved', 'processing', 'pending', 'unknown'].includes(item.status)
      || item.notBefore?.toMillis?.() > Date.now() || item.leaseUntil?.toMillis?.() > Date.now()) return null;
    if (!root || !['annullata', 'cancellata'].includes(root.stato) || root.depositPayment?.paypalCaptureId !== item.captureId
      || bookingDepositCents(root) !== item.amountCents || (root.managementAccessEpoch || null) !== item.epoch
      || (item.attempts || 0) >= 10) {
      tx.update(ref, { status: 'review' });
      if (root) tx.update(source!.ref, { 'bookingRefund.status': 'review' }); return null;
    }
    tx.update(ref, { status: 'processing', lease, leaseUntil: Timestamp.fromMillis(Date.now() + 180_000),
      attempts: (item.attempts || 0) + 1 });
    return item;
  });
  if (!job) return;
  let started = !!job.providerStarted;
  try {
    const paypal = client || bookingPayPalClient();
    if (bookingPayPalAccountKey(paypal.config) !== job.accountKey) throw new Error('Account PayPal diverso');
    const order = await paypal.getOrder(job.orderId);
    assertBookingPayPalOrderIdentity(order, job.orderId, id, job.amountCents, paypal.config.merchantId);
    const unit = order.purchase_units?.find(unit => unit.custom_id === `booking:${id}`);
    const capture = unit?.payments?.captures?.find((capture: any) => capture.id === job.captureId);
    if (!capture || paypalValueToCents(capture.amount?.value) !== job.amountCents || capture.amount?.currency_code !== 'EUR'
      || !['COMPLETED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(capture.status)) throw new Error('Incasso diverso');
    let refund: any, expectedRefundId = job.refundId;
    if (job.refundId) refund = await paypal.getRefund(job.refundId);
    else if (started) {
      const candidates = unit?.payments?.refunds || [];
      if (candidates.length > 10) throw new Error('Troppi rimborsi da riconciliare');
      for (const candidate of candidates) {
        const detail = await paypal.getRefund(candidate.id);
        if (detail.custom_id === job.requestId && detail.id === candidate.id) { refund = detail; expectedRefundId = candidate.id; break; }
      }
      if (!refund) { await finish('unknown'); return; }
    } else {
      if (capture.status !== 'COMPLETED' || (unit?.payments?.refunds || []).length) {
        await finish('review'); return; // External/partial refunds must be reviewed, never added blindly.
      }
      const ready = await db.runTransaction(async tx => {
        const live = (await tx.get(ref)).data(), source = await refundSource(db, tx, id, job.sourceKind), root = source?.data;
        if (live?.lease !== lease || live.status !== 'processing' || live.providerStarted) return false;
        if (!root || !['annullata', 'cancellata'].includes(root.stato) || root.depositPayment?.paypalCaptureId !== job.captureId
          || bookingDepositCents(root) !== job.amountCents || (root.managementAccessEpoch || null) !== job.epoch) return false;
        tx.update(ref, { providerStarted: true, providerStartedAt: Timestamp.now() }); return true;
      });
      if (!ready) return;
      started = true;
      const result = await paypal.refundCapture(job.captureId, job.amountCents, job.requestId);
      if (typeof result?.id !== 'string') throw new Error('Esito rimborso incompleto');
      // Persist the provider ID before GET verification; a crash is recoverable without another POST.
      await db.runTransaction(async tx => {
        const live = (await tx.get(ref)).data();
        if (live?.lease === lease) tx.update(ref, { refundId: result.id });
      });
      expectedRefundId = result.id; refund = await paypal.getRefund(result.id);
    }
    const up = (refund.links || []).some((link: any) => {
      try { const url = new URL(link.href); return link.rel === 'up' && url.protocol === 'https:'
        && ['api.paypal.com', 'api-m.paypal.com', 'api.sandbox.paypal.com', 'api-m.sandbox.paypal.com'].includes(url.hostname)
        && url.pathname === `/v2/payments/captures/${job.captureId}`; } catch { return false; }
    });
    if (refund.custom_id !== job.requestId || paypalValueToCents(refund.amount?.value) !== job.amountCents
      || refund.amount?.currency_code !== 'EUR' || !up || refund.id !== expectedRefundId) {
      await finish('review'); return;
    }
    await finish(refund.status === 'COMPLETED' ? 'completed' : refund.status === 'PENDING' ? 'pending' : 'review', refund.id);
  } catch { await finish(started ? 'unknown' : 'review'); }

  async function finish(status: string, refundId?: string) {
    const cashRef = db.collection('cashMovements').doc(`booking_refund_${digest(job!.captureId)}`);
    await db.runTransaction(async tx => {
      const [liveDoc, cash, source] = await Promise.all([tx.get(ref), tx.get(cashRef), refundSource(db, tx, id, job!.sourceKind)]);
      const live = liveDoc.data(), root = source?.data;
      if (live?.lease !== lease || live.status !== 'processing') return;
      if (!root || root.depositPayment?.paypalCaptureId !== job!.captureId || (root.managementAccessEpoch || null) !== job!.epoch) {
        tx.update(ref, { status: 'review' }); return;
      }
      const now = Timestamp.now();
      tx.update(ref, { status, ...(refundId ? { refundId } : {}), leaseUntil: Timestamp.fromMillis(0),
        notBefore: Timestamp.fromMillis(Date.now() + 60_000), updatedAt: now });
      tx.update(source!.ref, { bookingRefund: { status, amountCents: job!.amountCents, refundId: refundId || live.refundId || null }, updatedAt: now });
      if (status === 'completed' && !cash.exists) tx.set(cashRef, { tipo: 'uscita', categoria: 'Rimborsi prenotazioni',
        movementRole: 'refund', data: now, importo: job!.amountCents / 100, metodoPagamento: 'paypal',
        origine: 'booking', origineRef: id, bookingId: id, campaignId: root.campaignId,
        provider: 'paypal', providerTransactionId: refundId, descrizione: `Rimborso integrale acconto ${id}`, createdAt: now, updatedAt: now });
    });
  }
}
