import { describe, expect, it } from 'vitest';
import { LEGACY_POLAROID_PRODUCT, PRINT_SHOP_CATALOG } from '@shared/print-shop-catalog';
import type { PrintShopCatalogProduct } from '@shared/print-shop-types';
import { validatePrintCatalogDraft } from '@/components/print-shop/PrintShopCatalogManager';

function withPricing(
  pricing: PrintShopCatalogProduct['printSpec']['pricing'],
  sku = PRINT_SHOP_CATALOG[0].sku,
): PrintShopCatalogProduct {
  const source = sku === LEGACY_POLAROID_PRODUCT.sku
    ? LEGACY_POLAROID_PRODUCT
    : PRINT_SHOP_CATALOG.find((product) => product.sku === sku) ?? PRINT_SHOP_CATALOG[0];
  return {
    ...source,
    printSpec: {
      ...source.printSpec,
      finishes: ['glossy', 'matte'],
      fitModes: ['border', 'cover'],
      pricing,
    },
  };
}

describe('validazione listino stampe gestionale', () => {
  it('accetta scaglioni consecutivi con ultimo limite aperto', () => {
    expect(validatePrintCatalogDraft(withPricing({
      model: 'tiered',
      tiers: [
        { minQuantity: 1, maxQuantity: 10, unitPriceCents: 50 },
        { minQuantity: 11, unitPriceCents: 45 },
      ],
    }))).toEqual([]);
  });

  it('blocca buchi tra scaglioni e pacchetti Polaroid non conformi', () => {
    expect(validatePrintCatalogDraft(withPricing({
      model: 'tiered',
      tiers: [
        { minQuantity: 1, maxQuantity: 10, unitPriceCents: 50 },
        { minQuantity: 12, unitPriceCents: 45 },
      ],
    }))).toEqual(expect.arrayContaining([expect.stringContaining('consecutivi')]));

    expect(validatePrintCatalogDraft(withPricing({
      model: 'package',
      packageSize: 49,
      packagePriceCents: 990,
      requireDistinctAssets: false,
      allowMultiplePackages: true,
    }, 'PRINT-POLAROID-100X090'))).toEqual(expect.arrayContaining([
      expect.stringContaining('esattamente 50'),
      expect.stringContaining('tutte diverse'),
      expect.stringContaining('più pacchetti'),
    ]));
  });

  it('lega il modello pacchetto allo SKU Polaroid, non alla categoria', () => {
    const regularAsPackage = withPricing({
      model: 'package',
      packageSize: 50,
      packagePriceCents: 990,
      requireDistinctAssets: true,
      allowMultiplePackages: false,
    });
    expect(validatePrintCatalogDraft(regularAsPackage)).toEqual(
      expect.arrayContaining([expect.stringContaining('deve usare prezzi per copia')]),
    );
  });
});
