import { describe, expect, it } from 'vitest';
import {
  COUPON_ARTWORK_PLACEMENTS,
  createCouponArtworkSvg,
  formatCouponOffer,
  formatCouponTerms,
  type CouponArtworkData,
} from './coupon-artwork';

const coupon: CouponArtworkData = {
  code: 'RICORDI15',
  discountType: 'percentage',
  value: 15,
  endsAt: '2027-10-31T23:59:00.000Z',
  minPrintQuantity: 12,
  scope: 'selected',
  eligibleFormats: ['10 × 15 cm', '13 × 18 cm'],
};

describe('coupon artwork helpers', () => {
  it('formats existing percentage and cents-based coupon units', () => {
    expect(formatCouponOffer(coupon)).toBe('15%');
    expect(formatCouponOffer({ ...coupon, discountType: 'fixed', value: 1250 })).toBe('−12,50 €');
    expect(formatCouponOffer({ ...coupon, discountType: 'fixed_total', value: 1250 })).toBe('12,50 €');
  });

  it('includes expiry, quantity rule, and eligible formats in the terms', () => {
    expect(formatCouponTerms(coupon)).toEqual([
      'Valido fino al 31 ottobre 2027',
      'Minimo 12 stampe',
      'Solo: 10 × 15 cm, 13 × 18 cm',
    ]);
  });

  it('builds distinct exportable artwork in correct placement dimensions', () => {
    const square = COUPON_ARTWORK_PLACEMENTS.find(item => item.id === 'whatsapp-channel-square')!;
    const story = COUPON_ARTWORK_PLACEMENTS.find(item => item.id === 'stories-reels')!;
    const first = createCouponArtworkSvg(coupon, 'contact-sheet', square);
    const second = createCouponArtworkSvg(coupon, 'darkroom', square);
    const vertical = createCouponArtworkSvg(coupon, 'field-notes', story);
    expect(first).toContain('width="1080" height="1080"');
    expect(first).toContain('RICORDI15');
    expect(first).not.toEqual(second);
    expect(vertical).toContain('width="1080" height="1920"');
    expect(vertical).toContain('stroke-dasharray="9 11"');
  });
});
