import type { PaypalCaptureResult } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Accetta sia la shape compatta del backend sia quella estesa futura. */
export function normalizePaypalCapture(
  raw: unknown,
  orderId: string,
  paypalOrderId: string,
): PaypalCaptureResult {
  const candidate = isRecord(raw) && isRecord(raw.order) ? raw.order : raw;
  if (!isRecord(candidate)) throw new Error('Conferma del pagamento non valida.');

  const paymentStatus = candidate.paymentStatus === 'paid' || candidate.status === 'paid'
    ? 'paid'
    : 'pending';
  return {
    orderId: typeof candidate.orderId === 'string' ? candidate.orderId : orderId,
    orderNumber: typeof candidate.orderNumber === 'string' ? candidate.orderNumber : '',
    paypalOrderId,
    paypalCaptureId: typeof candidate.paypalCaptureId === 'string'
      ? candidate.paypalCaptureId
      : typeof candidate.captureId === 'string' ? candidate.captureId : undefined,
    paymentStatus,
  };
}
