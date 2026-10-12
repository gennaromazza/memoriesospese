import { describe, expect, it } from 'vitest';
import { activeShops, shopIsActive } from './shop-directory';

describe('pagina che raccoglie gli shop', () => {
  it('mostra solo gli shop attivi', () => {
    expect(activeShops({ natale: true, 'gift-card': false, stampe: true }).map(entry => entry.key)).toEqual(['natale', 'stampe']);
  });

  it('non mostra uno shop di cui non si sa lo stato', () => {
    expect(activeShops({ natale: null, 'gift-card': null, stampe: null })).toEqual([]);
  });

  it('lo shop di Natale e attivo solo con vetrina accesa e prodotti', () => {
    expect(shopIsActive({ enabled: true, products: [{}] })).toBe(true);
    expect(shopIsActive({ enabled: true, products: [] })).toBe(false);
    expect(shopIsActive({ enabled: false, products: [{}] })).toBe(false);
    expect(shopIsActive(null)).toBe(false);
  });
});
