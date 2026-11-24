import type { DocumentData } from 'firebase-admin/firestore';
import { approvedDepositDeadline } from './payment-deadlines.js';
import { CheckoutHoldError } from './checkout-hold-state.js';

/** Only the authenticated approval service can create this private hold kind. */
export const isApprovedDepositHold = (hold: DocumentData) => hold.kind === 'approved_deposit';
export function approvedDepositMatchesBooking(hold: DocumentData, booking: DocumentData | undefined, now = Date.now()): boolean {
  const request = booking?.depositPaymentRequest;
  const deadline = booking ? approvedDepositDeadline(booking) : null;
  return isApprovedDepositHold(hold) && booking?.stato === 'in_attesa' && request?.status === 'pending'
    && Number(booking.acconto ?? 0) === 0 && !booking.depositPayment?.paypalCaptureId
    && request.currency === 'EUR' && request.amountCents === hold.depositAmountCents
    && Number.isSafeInteger(request.amountCents) && request.amountCents > 0
    && deadline !== null && deadline > now && deadline === hold.expiresAt?.toMillis?.()
    && request.requestedAt?.toMillis?.() === hold.createdAt?.toMillis?.()
    && booking.campaignId === hold.campaignId
    && booking.dataShootingInizio?.toMillis?.() === hold.dataShootingInizio?.toMillis?.()
    && booking.dataShootingFine?.toMillis?.() === hold.dataShootingFine?.toMillis?.()
    && typeof booking.cliente?.email === 'string'
    && booking.cliente.email.trim().toLowerCase() === hold.draft?.cliente?.email?.trim().toLowerCase();
}
export function assertApprovedDepositMatchesBooking(hold: DocumentData, booking: DocumentData | undefined) {
  if (!approvedDepositMatchesBooking(hold, booking)) {
    throw new CheckoutHoldError(409, 'La richiesta di acconto non è più utilizzabile. Contatta lo studio prima di pagare.');
  }
}
