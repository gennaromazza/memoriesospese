import type { PrintShopQuote } from '@shared/print-shop-types';
import type { PrintShopOrderListItem } from './types';
import type { PrintShopLegalConsents } from './types';

export interface PaypalCreatePayload extends PrintShopLegalConsents {
  expectedQuoteFingerprint: string;
  expectedTotalCents: number;
}

export class PrintShopQuoteReviewRequiredError extends Error {
  readonly code = 'quote_changed_client';

  constructor(readonly quoteAlreadyRefreshed = false) {
    super('Il riepilogo o il prezzo sono cambiati. Controlla il nuovo totale e accetta nuovamente prima di pagare.');
    this.name = 'PrintShopQuoteReviewRequiredError';
  }
}

export function buildPaypalCreatePayload(
  consents: PrintShopLegalConsents,
  quote: PrintShopQuote,
): PaypalCreatePayload {
  const fingerprint = quote.quoteFingerprint;
  const totalCents = quote.totals.totalCents;
  if (!fingerprint || !/^[a-f0-9]{64}$/i.test(fingerprint)) {
    throw new PrintShopQuoteReviewRequiredError();
  }
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new PrintShopQuoteReviewRequiredError();
  }
  return {
    ...consents,
    expectedQuoteFingerprint: fingerprint,
    expectedTotalCents: totalCents,
  };
}

export function hasSamePaypalQuoteGuard(
  displayed: PrintShopQuote | null,
  fresh: PrintShopQuote,
): boolean {
  return Boolean(
    displayed?.quoteFingerprint &&
    fresh.quoteFingerprint &&
    displayed.quoteFingerprint === fresh.quoteFingerprint &&
    displayed.totals.totalCents === fresh.totals.totalCents,
  );
}

export function requiresPaypalQuoteReview(error: unknown): boolean {
  if (error instanceof PrintShopQuoteReviewRequiredError) return true;
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return ['quote_changed', 'order_changed', 'low_resolution_confirmation_required'].includes(
    typeof error.code === 'string' ? error.code : '',
  );
}

export function hasRecordedPaypalPayment(order: PrintShopOrderListItem): boolean {
  return order.payment.status === 'paid' || order.payment.status === 'paid_action_required';
}

export function sandboxPaypalNotice(environment: 'sandbox' | 'live' | undefined): string | null {
  return environment === 'sandbox'
    ? 'Ambiente di prova PayPal: nessun addebito reale.'
    : null;
}

export function paypalOrderActionNotice(environment: 'sandbox' | 'live' | undefined): string | null {
  if (environment === 'sandbox') {
    return 'Ambiente di prova: premendo PayPal simuli l’inoltro di un ordine con obbligo di pagamento. Nessun addebito reale viene effettuato.';
  }
  if (environment === 'live') {
    return 'Ordine con obbligo di pagamento: premendo il pulsante PayPal inoltri l’ordine e autorizzi il pagamento anticipato dell’importo totale mostrato.';
  }
  return null;
}
