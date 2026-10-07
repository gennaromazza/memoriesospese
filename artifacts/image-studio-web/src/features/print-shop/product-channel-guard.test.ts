import { describe, expect, it } from 'vitest';
import { isPrintShopManagedProduct } from './product-channel-guard';

describe('protezione catalogo generico', () => {
  it('riconosce soltanto i documenti assegnati al canale print_shop', () => {
    expect(isPrintShopManagedProduct({ salesChannels: ['admin', 'print_shop'] })).toBe(true);
    expect(isPrintShopManagedProduct({ salesChannels: ['admin', 'booking'] })).toBe(false);
    expect(isPrintShopManagedProduct({})).toBe(false);
    expect(isPrintShopManagedProduct({ salesChannels: 'print_shop' })).toBe(false);
  });
});
