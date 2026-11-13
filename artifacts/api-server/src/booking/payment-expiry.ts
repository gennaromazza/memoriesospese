import { FieldPath, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { syncBookingWorkflowState } from '../../shared/workflow-helpers.js';
import { logger } from '../lib/logger.js';
import { CHECKOUT_HOLDS, checkoutHoldBlocksSlot } from './slot-reservations.js';
import { approvedDepositDeadline, hasPaidBookingDeposit, unpaidDepositRequestExpired } from './payment-deadlines.js';

export interface BookingExpiryCursor { holdId?: string; bookingId?: string }

async function expireHold(db: Firestore, id: string) {
  const ref = db.collection(CHECKOUT_HOLDS).doc(id);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref), data = snapshot.data();
    if (!data || data.status !== 'active' || hasPaidBookingDeposit(data)
      || !Number.isFinite(data.expiresAt?.toMillis?.()) || checkoutHoldBlocksSlot(data)) return false;
    transaction.update(ref, { status: 'expired', expiredAt: Timestamp.now() });
    return true;
  });
}

async function expireRequest(db: Firestore, id: string) {
  const ref = db.collection('bookings').doc(id);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref), data = snapshot.data();
    if (!data || data.depositPaymentRequest?.status !== 'pending' || !unpaidDepositRequestExpired(data)) return false;
    const now = Timestamp.now();
    const cancel = data.stato === 'in_attesa' || data.stato === 'confermata';
    transaction.update(ref, {
      depositPaymentRequest: { ...data.depositPaymentRequest, status: 'expired', expiredAt: now },
      ...(cancel ? { stato: 'annullata', ...syncBookingWorkflowState('annullata') } : {}),
      updatedAt: now,
    });
    return true;
  });
}

/**
 * Bounded pages use single-field indexes and document-ID cursors. Even a page
 * full of not-yet-expired records cannot starve later abandoned checkouts.
 * Availability enforces deadlines independently, without waiting for this sweep.
 */
export async function expireBookingPayments(db: Firestore, cursor: BookingExpiryCursor = {}, pageSize = 100) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new RangeError('Pagina scadenze non valida');
  const page = async (collection: string, field: string, value: string, after?: string) => {
    let query = db.collection(collection).where(field, '==', value).orderBy(FieldPath.documentId()).limit(pageSize);
    if (after) query = query.startAfter(after);
    return query.get();
  };
  const [holds, requests] = await Promise.all([
    page(CHECKOUT_HOLDS, 'status', 'active', cursor.holdId),
    page('bookings', 'depositPaymentRequest.status', 'pending', cursor.bookingId),
  ]);
  let expiredHolds = 0, expiredRequests = 0, invalid = 0;
  for (const doc of holds.docs) {
    const data = doc.data();
    if (!Number.isFinite(data.expiresAt?.toMillis?.())) { invalid++; continue; }
    if (!checkoutHoldBlocksSlot(data) && await expireHold(db, doc.id)) expiredHolds++;
  }
  for (const doc of requests.docs) {
    const data = doc.data();
    if (approvedDepositDeadline(data) === null) { invalid++; continue; }
    if (unpaidDepositRequestExpired(data) && await expireRequest(db, doc.id)) expiredRequests++;
  }
  return {
    checkedHolds: holds.size, checkedRequests: requests.size, expiredHolds, expiredRequests, invalid,
    cursor: {
      holdId: holds.size === pageSize ? holds.docs.at(-1)!.id : undefined,
      bookingId: requests.size === pageSize ? requests.docs.at(-1)!.id : undefined,
    } satisfies BookingExpiryCursor,
  };
}

export function startBookingPaymentExpiryWorker(db: Firestore, intervalMs = 60_000): () => void {
  let running = false, cursor: BookingExpiryCursor = {};
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void expireBookingPayments(db, cursor).then(result => {
      cursor = result.cursor;
      if (result.expiredHolds || result.expiredRequests) logger.info({
        expiredHolds: result.expiredHolds, expiredRequests: result.expiredRequests,
      }, 'Scadenze pagamento prenotazioni applicate');
      if (result.invalid) logger.warn({ count: result.invalid }, 'Scadenze prenotazioni da verificare');
    }).catch(() => logger.error('Verifica scadenze prenotazioni non completata'))
      .finally(() => { running = false; });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
