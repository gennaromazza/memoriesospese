import { describe, expect, it } from 'vitest';
import { PRINT_SHOP_CATALOG } from '@shared/print-shop-catalog';
import {
  COUPON_ARTWORK_PLACEMENTS,
  COUPON_ARTWORK_TEMPLATES,
  createCouponArtworkSvg,
  formatCouponOffer,
  formatCouponTerms,
  layoutCouponArtworkTerms,
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
    const vertical = createCouponArtworkSvg(coupon, 'field-notes', story, { showGuides: true });
    expect(first).toContain('width="1080" height="1080"');
    expect(first).toContain('RICORDI15');
    expect(first).not.toEqual(second);
    expect(vertical).toContain('width="1080" height="1920"');
    expect(vertical).toContain('stroke-dasharray="9 11"');
    expect(createCouponArtworkSvg(coupon, 'field-notes', story)).not.toContain('stroke-dasharray="9 11"');
  });

  it('fits long codes in the artwork and preserves the exact package quantity rule', () => {
    const square = COUPON_ARTWORK_PLACEMENTS.find(item => item.id === 'instagram-organic-square')!;
    const longCode = 'PROMO-STAMPE-RICORDI-NATALE-CLIENTI-2026';
    const svg = createCouponArtworkSvg({ ...coupon, code: longCode }, 'contact-sheet', square);
    expect(svg).toContain(longCode);
    expect(svg).toMatch(/font-size="2[0-9]"[^>]*letter-spacing="1"[^>]*>PROMO-STAMPE/);
    expect(formatCouponTerms({ ...coupon, discountType: 'fixed_total', minPrintQuantity: 100 })[1]).toBe('Esattamente 100 stampe');
  });

  it('keeps all selectable format combinations above the footer in every supported placement', () => {
    const formats = PRINT_SHOP_CATALOG.map(product => product.nome);
    for (const placement of COUPON_ARTWORK_PLACEMENTS) {
      for (let count = 1; count <= formats.length; count++) {
        const data = { ...coupon, eligibleFormats: formats.slice(0, count) };
        const layout = layoutCouponArtworkTerms(data, placement);
        const lastTextBottom = layout.startY + (layout.lines.length - 1) * layout.lineHeight + layout.fontSize * 0.3;
        expect(lastTextBottom, `${placement.id}: ${count} formats`).toBeLessThanOrEqual(layout.bottomY);
        expect(layout.lines.every(line => line.length <= (placement.width === placement.height ? 34 : 39))).toBe(true);
      }
    }
    const square = COUPON_ARTWORK_PLACEMENTS.find(item => item.id === 'instagram-organic-square')!;
    const data = { ...coupon, eligibleFormats: formats };
    const layout = layoutCouponArtworkTerms(data, square);
    expect(layout.compact).toBe(true);
    expect(layout.lines).toEqual([
      'Valido fino al 31 ottobre 2027',
      'Minimo 12 stampe',
      `Solo su ${formats.length} formati selezionati`,
    ]);
    for (const template of COUPON_ARTWORK_TEMPLATES) {
      const exportedSvg = createCouponArtworkSvg(data, template.id, square);
      expect(exportedSvg).toContain(`Solo su ${formats.length} formati selezionati`);
      expect(exportedSvg).toContain('IMAGESTUDIOFOTOGRAFICO.COM');
    }
  });
});
