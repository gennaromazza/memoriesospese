import { describe, expect, it } from 'vitest';
import { DEFAULT_SHOP_SETTINGS, type ShopSettings } from '@shared/shop-types';
import { validateShopSettings } from './ShopSettingsPanel';

const valid = (patch: Partial<ShopSettings> = {}): ShopSettings => ({
  ...DEFAULT_SHOP_SETTINGS,
  enabled: true,
  categoryValues: ['natale'],
  ...patch,
});

describe('validazione delle impostazioni shop', () => {
  it('accetta impostazioni complete e anche quelle di partenza', () => {
    expect(validateShopSettings(valid())).toEqual([]);
    expect(validateShopSettings(DEFAULT_SHOP_SETTINGS)).toEqual([]);
  });

  it('chiede una categoria se la vetrina è accesa', () => {
    expect(validateShopSettings(valid({ categoryValues: [] }))).toEqual(['Scegli almeno una categoria da mostrare nella vetrina.']);
  });

  it('controlla data, giorni di attesa e spedizione', () => {
    expect(validateShopSettings(valid({ lastOrderDate: '18/12/2026' }))).toHaveLength(1);
    expect(validateShopSettings(valid({ photoWaitDays: 0 }))).toHaveLength(1);
    expect(validateShopSettings(valid({ photoWaitDays: 61 }))).toHaveLength(1);
    const shipping = DEFAULT_SHOP_SETTINGS.shipping;
    expect(validateShopSettings(valid({ shipping: { ...shipping, priceCents: -1 } }))).toHaveLength(1);
    expect(validateShopSettings(valid({ shipping: { ...shipping, estimatedMinDays: 0 } }))).toHaveLength(1);
    expect(validateShopSettings(valid({ shipping: { ...shipping, estimatedMinDays: 5, estimatedMaxDays: 3 } }))).toHaveLength(1);
  });
});
