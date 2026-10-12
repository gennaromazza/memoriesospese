import { describe, expect, it } from 'vitest';
import { DEFAULT_SHOP_SETTINGS, type ShopSettings } from '@shared/shop-types';
import { shopShareLinks, validateShopSettings } from './ShopSettingsPanel';

const valid = (patch: Partial<ShopSettings> = {}): ShopSettings => ({
  ...DEFAULT_SHOP_SETTINGS,
  enabled: true,
  categoryValues: ['natale'],
  ...patch,
});

describe('fasce di peso nelle impostazioni', () => {
  const shipping = { enabled: true, priceCents: 0, estimatedMinDays: 5, estimatedMaxDays: 8 };

  it('accetta fasce valide', () => {
    expect(validateShopSettings(valid({ shipping: { ...shipping, tiers: [{ maxGrams: 1000, priceCents: 590 }, { maxGrams: 3000, priceCents: 790 }] } }))).toEqual([]);
  });

  it('rifiuta fasce con lo stesso limite o con valori non validi', () => {
    expect(validateShopSettings(valid({ shipping: { ...shipping, tiers: [{ maxGrams: 1000, priceCents: 590 }, { maxGrams: 1000, priceCents: 790 }] } }))).toHaveLength(1);
    expect(validateShopSettings(valid({ shipping: { ...shipping, tiers: [{ maxGrams: 0, priceCents: 590 }] } }))).toHaveLength(1);
    expect(validateShopSettings(valid({ shipping: { ...shipping, tiers: [{ maxGrams: 1000, priceCents: -1 }] } }))).toHaveLength(1);
  });
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

describe('link da condividere', () => {
  const categories = [{ value: 'natale', nome: 'Natale' }, { value: 'stampe-e-album', nome: 'Stampe e album' }, { value: 'altro', nome: 'Altro' }];

  it('da il link dello shop e quello di ogni categoria scelta', () => {
    expect(shopShareLinks(categories, ['natale', 'stampe-e-album']).map(link => link.url)).toEqual([
      'https://imagestudiofotografico.com/shop-natale',
      'https://imagestudiofotografico.com/shop-natale/categoria/natale',
      'https://imagestudiofotografico.com/shop-natale/categoria/stampe-e-album',
    ]);
  });

  it('non mostra le categorie non scelte', () => {
    expect(shopShareLinks(categories, [])).toHaveLength(1);
  });
});
