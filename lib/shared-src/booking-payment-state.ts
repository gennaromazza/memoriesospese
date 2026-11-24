import { depositReceiptReference } from './booking-deposit-receipt';

/** Display state only: never persists a new booking status or changes financial records. */
export interface BookingPaymentStateSource {
  stato?: string;
  acconto?: number;
  paymentReviewRequired?: boolean;
  depositPayment?: { status?: string; provider?: string; paypalCaptureId?: string; receiptId?: string };
  depositPaymentRequest?: { status?: string; amountCents?: number; requestedAt?: unknown; expiresAt?: unknown };
}
export function bookingPaymentMillis(value: unknown): number | null {
  try {
    const input = value as any;
    const millis = typeof input?.toMillis === 'function' ? input.toMillis()
      : input instanceof Date ? input.getTime()
        : typeof input === 'string' ? Date.parse(input)
          : typeof input?.seconds === 'number' ? input.seconds * 1000 + (input.nanoseconds || 0) / 1_000_000
            : typeof input?._seconds === 'number' ? input._seconds * 1000 + (input._nanoseconds || 0) / 1_000_000 : NaN;
    return Number.isFinite(millis) ? millis : null;
  } catch { return null; }
}
export function bookingPaymentDeadline(booking: BookingPaymentStateSource): number | null {
  const request = booking.depositPaymentRequest;
  const requested = bookingPaymentMillis(request?.requestedAt), expires = bookingPaymentMillis(request?.expiresAt);
  return requested !== null && expires !== null && expires > requested
    ? Math.min(expires, requested + 3_600_000) : null;
}
export function bookingPaymentStage(booking: BookingPaymentStateSource, now = Date.now()): string {
  const request = booking.depositPaymentRequest;
  const paid = booking.depositPayment?.status === 'paid' && depositReceiptReference(booking.depositPayment) !== null;
  if (booking.paymentReviewRequired || booking.depositPayment?.status === 'paid_action_required' || paid && booking.stato === 'in_attesa'
    || request && !paid && Number(booking.acconto ?? 0) !== 0
    || request?.status === 'paid' && !paid
    || request?.status === 'pending' && !paid && (bookingPaymentDeadline(booking) === null
      || !Number.isSafeInteger(request.amountCents) || Number(request.amountCents) <= 0)) {
    return 'pagamento_da_verificare';
  }
  const deadline = bookingPaymentDeadline(booking);
  if (!paid && (request?.status === 'expired' || request?.status === 'pending' && deadline !== null && deadline <= now)) return 'scaduta';
  if (['annullata', 'cancellata'].includes(booking.stato || '')) return 'annullata';
  if (booking.stato === 'in_attesa' && request?.status === 'pending' && !paid) return 'in_attesa_pagamento';
  return booking.stato || 'in_attesa';
}
export function matchesBookingPaymentFilter(booking: BookingPaymentStateSource, filter: string, now = Date.now()): boolean {
  const stage = bookingPaymentStage(booking, now);
  return filter === 'all' ? !['annullata', 'cancellation_pending', 'scaduta'].includes(stage) : stage === filter;
}
export function bookingPaymentStageLabel(stage: string): string {
  return ({ in_attesa: 'Da approvare', in_attesa_pagamento: 'In attesa di pagamento',
    confermata: 'Confermata', completata: 'Completata', annullata: 'Annullata', scaduta: 'Scaduta',
    pagamento_da_verificare: 'Pagamento da riconciliare', cancellation_pending: 'Cancellazione Calendar in corso' } as Record<string, string>)[stage] || stage;
}
