import { Timestamp } from 'firebase-admin/firestore';

export const APPROVED_DEPOSIT_PAYMENT_MS = 60 * 60 * 1000;

export class BookingPaymentDeadlineError extends Error {}

function millis(value: any): number | null {
  const result = value instanceof Date ? value.getTime() : value?.toMillis?.();
  return Number.isFinite(result) ? result : null;
}

/** A confirmed receipt must never be undone by an expiry worker. */
export function hasPaidBookingDeposit(data: FirebaseFirestore.DocumentData): boolean {
  return data.depositPayment?.status === 'paid'
    && typeof data.depositPayment.paypalCaptureId === 'string'
    && data.depositPayment.paypalCaptureId.length > 0;
}

export function createApprovedDepositRequest(amountCents: number, shootingStart: Date, requestedAt = Date.now()) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !Number.isFinite(requestedAt)) {
    throw new BookingPaymentDeadlineError('Importo o data della richiesta non validi');
  }
  if (!Number.isFinite(shootingStart.getTime()) || shootingStart.getTime() <= requestedAt + APPROVED_DEPOSIT_PAYMENT_MS) {
    throw new BookingPaymentDeadlineError('Shooting troppo vicino: contatta lo studio invece di aprire un pagamento');
  }
  return {
    status: 'pending' as const, amountCents, currency: 'EUR' as const,
    requestedAt: Timestamp.fromMillis(requestedAt),
    expiresAt: Timestamp.fromMillis(requestedAt + APPROVED_DEPOSIT_PAYMENT_MS),
  };
}

/** Stored deadlines only. A retry or a changed campaign must not restart the hour. */
export function approvedDepositDeadline(data: FirebaseFirestore.DocumentData): number | null {
  const request = data.depositPaymentRequest;
  const requested = millis(request?.requestedAt), expires = millis(request?.expiresAt);
  if (requested === null || expires === null || expires <= requested) return null;
  return Math.min(expires, requested + APPROVED_DEPOSIT_PAYMENT_MS);
}

/** Explicit requests only: legacy bookings without a request remain untouched. */
export function unpaidDepositRequestExpired(data: FirebaseFirestore.DocumentData, now = Date.now()): boolean {
  if (hasPaidBookingDeposit(data)) return false;
  if (data.depositPaymentRequest?.status === 'expired') return true;
  if (data.depositPaymentRequest?.status !== 'pending') return false;
  const deadline = approvedDepositDeadline(data);
  // Corrupt dates fail closed: do not free a possibly occupied slot.
  return deadline !== null && deadline <= now;
}
