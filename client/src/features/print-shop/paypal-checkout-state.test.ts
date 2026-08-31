import { describe, expect, it } from 'vitest';
import type { PrintShopQuote } from '@shared/print-shop-types';
import {
  buildPaypalCreatePayload,
  hasSamePaypalQuoteGuard,
  PrintShopQuoteReviewRequiredError,
  paypalOrderActionNotice,
  sandboxPaypalNotice,
} from './paypal-checkout-state';

function quote(fingerprint: string, totalCents = 1290): PrintShopQuote {
  return {
    currency: 'EUR',
    catalogVersion: 1,
    items: [],
    totals: { subtotalCents: totalCents, discountCents: 0, totalCents },
    assetCount: 1,
    copyCount: 1,
    quoteFingerprint: fingerprint,
  };
}

const consents = {
  termsAccepted: true,
  privacyAccepted: true,
  personalizedProductionAccepted: true,
};

describe('PayPal checkout state', () => {
  it('binds the three consents to the authoritative quote fingerprint and total', () => {
    const fingerprint = 'a'.repeat(64);
    expect(buildPaypalCreatePayload(consents, quote(fingerprint))).toEqual({
      ...consents,
      expectedQuoteFingerprint: fingerprint,
      expectedTotalCents: 1290,
    });
  });

  it('blocks checkout when the quote is unsigned or changed', () => {
    expect(() => buildPaypalCreatePayload(consents, quote('')))
      .toThrow(PrintShopQuoteReviewRequiredError);
    expect(hasSamePaypalQuoteGuard(quote('a'.repeat(64)), quote('b'.repeat(64)))).toBe(false);
    expect(hasSamePaypalQuoteGuard(quote('a'.repeat(64)), quote('a'.repeat(64)))).toBe(true);
  });

  it('shows an explicit no-charge notice only in sandbox', () => {
    expect(sandboxPaypalNotice('sandbox')).toBe('Ambiente di prova PayPal: nessun addebito reale.');
    expect(sandboxPaypalNotice('live')).toBeNull();
    expect(paypalOrderActionNotice('sandbox')).toContain('Nessun addebito reale');
    expect(paypalOrderActionNotice('live')).toContain('obbligo di pagamento');
  });
});
