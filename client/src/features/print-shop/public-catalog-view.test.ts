import { describe, expect, it } from 'vitest';
import { PRINT_SHOP_CATALOG } from '@shared/print-shop-catalog';
import { PRINT_PRICE_TABLES } from '@shared/print-service-content';
import {
  buildFallbackPriceSections,
  buildPublicCatalogPriceSections,
  catalogPriceRangeCents,
  searchPublicCatalogSections,
} from './public-catalog-view';

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

  it('calcola il range strutturato senza ricavare numeri dai testi statici', () => {
    expect(catalogPriceRangeCents(PRINT_SHOP_CATALOG)).toEqual({ lowCents: 20, highCents: 1700 });
  });

  it('in errore conserva soltanto i formati e non pubblicizza prezzi statici', () => {
    const fallback = buildFallbackPriceSections(PRINT_PRICE_TABLES);
    expect(fallback.flatMap((section) => section.rows)).toHaveLength(34);
    expect(fallback.flatMap((section) => section.rows).every((row) =>
      row.priceAvailable === false && row.prices.every((price) => price === 'Prezzo non disponibile'),
    )).toBe(true);
  });
});
