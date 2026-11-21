import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { CheckoutHoldError } from './checkout-hold-state.js';
import { CHECKOUT_HOLDS, BookingSlotConflictError, checkSlotReservation } from './slot-reservations.js';
import { BookingStateChangedError } from './update-if-state-unchanged.js';

/** A status override waives a requirement; it must never invent an incoming payment. */
export function assertAdminConfirmationSafe(booking: DocumentData, hold: DocumentData | undefined, id: string) {
  if (booking.stato !== 'in_attesa' || booking.paymentReviewRequired || booking.automaticConfirmationError
    || booking.calendarSyncPending || booking.depositPayment
    || booking.depositPaymentRequest && !['pending', 'expired'].includes(booking.depositPaymentRequest.status)
    || ['pending', 'blocked'].includes(booking.customerReschedule?.status)
    || ['pending', 'working', 'blocked'].includes(booking.bookingCancellation?.status)) {
    throw new CheckoutHoldError(409, 'La prenotazione ha operazioni o pagamenti da verificare prima della conferma manuale.');
  }
  if (hold && (hold.bookingId !== id || hold.depositPayment || hold.paymentReviewRequired
    || hold.paypalCaptureAttempt && hold.paypalCaptureAttempt.state !== 'declined')) {
    throw new CheckoutHoldError(409, 'Un pagamento PayPal è in corso o ha un esito da verificare. Verificalo prima di confermare senza acconto.');
  }
}

export async function checkAdminConfirmation(db: Firestore, id: string, booking: DocumentData) {
  const hold = (await db.collection(CHECKOUT_HOLDS).doc(id).get()).data();
  assertAdminConfirmationSafe(booking, hold, id);
}

/** Calendar has already been checked/created by the normal approval flow.
 * Atomically reserve the slot, confirm, archive/waive the request and disable old payment links.
 * Capture/expiry workers read these same documents and cannot win concurrently.
 */
export async function commitAdminConfirmation(
  db: Firestore, id: string, original: DocumentData, updates: Record<string, unknown>, actor: string,
) {
  const ref = db.collection('bookings').doc(id), holdRef = db.collection(CHECKOUT_HOLDS).doc(id);
  await db.runTransaction(async tx => {
    const [snapshot, holdSnapshot] = await Promise.all([tx.get(ref), tx.get(holdRef)]);
    const current = snapshot.data(), hold = holdSnapshot.data();
    if (!current || current.stato !== original.stato
      || current.dataShootingInizio?.toDate?.().getTime() !== original.dataShootingInizio?.toDate?.().getTime()
      || current.dataShootingFine?.toDate?.().getTime() !== original.dataShootingFine?.toDate?.().getTime()
      || current.campaignId !== original.campaignId || current.cliente?.email !== original.cliente?.email) {
      throw new BookingStateChangedError();
    }
    assertAdminConfirmationSafe(current, hold, id);
    let reserve: () => void;
    try {
      reserve = await checkSlotReservation(tx, db, current.dataShootingInizio.toDate(),
        current.dataShootingFine.toDate(), id, id);
    } catch (error) {
      if (error instanceof BookingSlotConflictError) throw new CheckoutHoldError(409, 'Slot non più disponibile: aggiorna la prenotazione.');
      throw error;
    }
    const now = Timestamp.now();
    reserve();
    tx.update(ref, { ...updates, depositWaiver: {
      reason: 'admin_status_confirmation', waivedBy: actor, waivedAt: now,
      ...(current.depositPaymentRequest ? { originalRequest: current.depositPaymentRequest } : {}),
    }, depositPaymentRequest: FieldValue.delete() });
    if (hold) tx.update(holdRef, { status: 'cancelled', closedReason: 'admin_deposit_waiver', closedAt: now });
  });
}
