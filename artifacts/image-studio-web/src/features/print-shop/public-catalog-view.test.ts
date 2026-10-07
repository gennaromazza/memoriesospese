import { describe, expect, it } from 'vitest';
import { PRINT_SHOP_CATALOG } from '@shared/print-shop-catalog';
import { PRINT_PRICE_TABLES } from '@shared/print-service-content';
import {
  buildFallbackPriceSections,
  buildPublicCatalogPriceSections,
  catalogPriceRangeCents,
  findActivePrintShopProduct,
  searchPublicCatalogSections,
  verifiedCatalogPriceCents,
} from './public-catalog-view';
import { POLAROID_SKU } from '@shared/print-shop-catalog';

describe('listino pubblico autorevole', () => {
  it('deriva formati, quantità e prezzi dagli stessi prodotti usati dal checkout', () => {
    const source = PRINT_SHOP_CATALOG.find((product) => product.sku === 'PRINT-100X150')
      ?? PRINT_SHOP_CATALOG.find((product) => product.printSpec.widthMm === 100 && product.printSpec.heightMm === 150)!;
    const changed = {
      ...source,
      printSpec: {
        ...source.printSpec,
        pricing: {
          model: 'tiered' as const,
          tiers: [
            { minQuantity: 1, maxQuantity: 3, unitPriceCents: 77 },
            { minQuantity: 4, unitPriceCents: 66 },
          ],
        },
      },
    };
    const sections = buildPublicCatalogPriceSections([changed]);
    expect(sections[0].rows[0]).toMatchObject({
      sku: changed.sku,
      format: '10×15',
      quantityHeaders: ['1–3', '4+'],
      prices: ['0,77 €', '0,66 €'],
    });
    expect(searchPublicCatalogSections(sections, '10 x 15')).toHaveLength(1);
  });

  it('distingue la Polaroid dalla 10×15 classica e cerca per nome o dimensioni', () => {
    const sections = buildPublicCatalogPriceSections(PRINT_SHOP_CATALOG);
    const sameSizeRows = sections.flatMap((section) => section.rows)
      .filter((row) => row.format === '10×15');
    expect(sameSizeRows.map((row) => row.sku)).toEqual(['PRINT-100X150', POLAROID_SKU]);
    expect(sameSizeRows.map((row) => row.name)).toEqual(['10×15 cm', 'Polaroid 10×15 cm']);

    const polaroidResults = searchPublicCatalogSections(sections, 'polaroid');
    expect(polaroidResults).toHaveLength(1);
    expect(polaroidResults[0].row.sku).toBe(POLAROID_SKU);

    const dimensionResults = searchPublicCatalogSections(sections, '10×15');
    expect(dimensionResults.map((result) => result.row.sku)).toEqual([
      'PRINT-100X150',
      POLAROID_SKU,
    ]);
  });

  it('espone la Polaroid solo se il prodotto è attivo nel canale print shop', () => {
    const polaroid = PRINT_SHOP_CATALOG.find((product) => product.sku === POLAROID_SKU)!;
    expect(findActivePrintShopProduct(PRINT_SHOP_CATALOG, POLAROID_SKU)).toEqual(polaroid);
    expect(findActivePrintShopProduct(PRINT_SHOP_CATALOG, 'SKU-ASSENTE')).toBeUndefined();
    expect(findActivePrintShopProduct([
      { ...polaroid, attivo: false },
    ], POLAROID_SKU)).toBeUndefined();
    expect(findActivePrintShopProduct([
      { ...polaroid, salesChannels: ['admin'] },
    ], POLAROID_SKU)).toBeUndefined();
    expect(verifiedCatalogPriceCents(polaroid, true)).toBe(100);
    expect(verifiedCatalogPriceCents(polaroid, false)).toBeNull();
    expect(verifiedCatalogPriceCents(undefined, true)).toBeNull();
  });

  it('calcola il range strutturato senza ricavare numeri dai testi statici', () => {
    expect(catalogPriceRangeCents(PRINT_SHOP_CATALOG)).toEqual({ lowCents: 40, highCents: 1700 });
  });

  it('in errore conserva soltanto i formati e non pubblicizza prezzi statici', () => {
    const fallback = buildFallbackPriceSections(PRINT_PRICE_TABLES);
    expect(fallback.flatMap((section) => section.rows)).toHaveLength(11);
    expect(searchPublicCatalogSections(fallback, 'polaroid')).toHaveLength(0);
    expect(fallback.flatMap((section) => section.rows).every((row) =>
      row.priceAvailable === false && row.prices.every((price) => price === 'Prezzo non disponibile'),
    )).toBe(true);
  });
});
