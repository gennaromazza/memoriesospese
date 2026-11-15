import { describe, expect, it } from 'vitest';
import type { PrintShopQuote } from '@shared/print-shop-types';
import {
  applyCouponQuote,
  couponDraftDiffersFromApplied,
  preserveCouponCheckoutOnFailure,
} from './coupon-checkout-state';

function quote(): PrintShopQuote {
  return {
    items: [],
    assetCount: 2,
    copyCount: 2,
    catalogVersion: 1,
    totals: {
      subtotalCents: 2000,
      discountCents: 200,
      shippingCents: 500,
      totalCents: 2300,
    },
    coupon: {
      code: 'SAVE10',
      discountType: 'percentage',
      value: 10,
      discountCents: 200,
      scope: 'all',
      eligibleSkus: [],
    },
    qualityWarnings: [],
    fulfillment: { method: 'shipping' },
    quoteFingerprint: 'f'.repeat(64),
  };
}

describe('print shop coupon checkout state', () => {
  it('preserves the applied coupon and server quote when a replacement code is invalid', () => {
    const currentQuote = quote();
    const state = {
      quote: currentQuote,
      couponCode: 'SAVE10',
      couponDraft: 'NOTVALID',
    };

    const failure = preserveCouponCheckoutOnFailure(
      state,
      'Il codice coupon non è valido',
      'coupon_invalid',
    );

    expect(failure).toEqual({
      ...state,
      message: 'Il codice coupon non è valido',
      isError: true,
      needsMorePrints: false,
    });
    expect(failure.quote).toBe(currentQuote);
    expect(failure.quote?.totals).toEqual({
      subtotalCents: 2000,
      discountCents: 200,
      shippingCents: 500,
      totalCents: 2300,
    });
    expect(failure.couponCode).toBe('SAVE10');
    expect(failure.couponDraft).toBe('NOTVALID');
  });

  it('allows applying a replacement code without first removing the active coupon', () => {
    expect(couponDraftDiffersFromApplied('SAVE10', ' BADCODE ')).toBe(true);
    expect(couponDraftDiffersFromApplied('save10', ' SAVE10 ')).toBe(false);
    expect(couponDraftDiffersFromApplied('', 'BADCODE')).toBe(false);
  });

  it('replaces the active coupon state with the server quote instead of adding discounts', () => {
    const previousQuote = quote();
    const replacementQuote: PrintShopQuote = {
      ...previousQuote,
      totals: {
        subtotalCents: 2000,
        discountCents: 400,
        shippingCents: 500,
        totalCents: 2100,
      },
      coupon: {
        code: 'NEXT20',
        discountType: 'percentage',
        value: 20,
        discountCents: 400,
        scope: 'all',
        eligibleSkus: [],
      },
      quoteFingerprint: 'e'.repeat(64),
    };

    const next = applyCouponQuote({
      quote: previousQuote,
      couponCode: 'SAVE10',
      couponDraft: 'NEXT20',
    }, replacementQuote);

    expect(next.quote).toBe(replacementQuote);
    expect(next.couponCode).toBe('NEXT20');
    expect(next.couponDraft).toBe('NEXT20');
    expect(next.quote?.totals.discountCents).toBe(400);
    expect(next.quote?.totals.totalCents).toBe(2100);
    expect(next.message).toBe('Coupon NEXT20 applicato.');
    expect(next.isError).toBe(false);
  });

  it('keeps the minimum-print recovery state specific to its server error', () => {
    const state = { quote: quote(), couponCode: '', couponDraft: 'SAVE10' };
    expect(
      preserveCouponCheckoutOnFailure(state, 'Servono altre copie', 'coupon_min_quantity_not_met')
        .needsMorePrints,
    ).toBe(true);
    expect(
      preserveCouponCheckoutOnFailure(state, 'Quantità non valida', 'coupon_exact_quantity_not_met')
        .needsMorePrints,
    ).toBe(true);
    expect(preserveCouponCheckoutOnFailure(state, 'Codice non valido', 'coupon_invalid').needsMorePrints)
      .toBe(false);
  });
});
