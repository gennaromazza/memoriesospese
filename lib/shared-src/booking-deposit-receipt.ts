/** Acconto incassato di persona (contanti, carta/POS, bonifico) registrato dall'admin. */
export const IN_PERSON_PROVIDER = 'in_person';
export const IN_PERSON_METHODS = ['contante', 'carta', 'bonifico'] as const;
export type InPersonMethod = (typeof IN_PERSON_METHODS)[number];

export interface DepositReceiptSource {
  provider?: string;
  paypalCaptureId?: string;
  receiptId?: string;
}

/**
 * Riferimento univoco della ricevuta di un acconto: la cattura PayPal oppure la ricevuta
 * dell'acconto incassato di persona. Null se manca (acconto non verificabile).
 */
export function depositReceiptReference(payment?: DepositReceiptSource | null): string | null {
  if (!payment) return null;
  if (typeof payment.paypalCaptureId === 'string' && payment.paypalCaptureId) return payment.paypalCaptureId;
  if (payment.provider === IN_PERSON_PROVIDER && typeof payment.receiptId === 'string' && payment.receiptId) return payment.receiptId;
  return null;
}
