import { describe, expect, it } from 'vitest';
import { PRINT_PRICE_TABLES } from './print-service-content';
import {
  PRINT_FIT_OPTIONS,
  PRINT_FINISH_OPTIONS,
  LEGACY_POLAROID_PRODUCT,
  PRINT_SHOP_CATALOG,
  PRINT_SHOP_CATEGORIES,
  calculatePrintLine,
  calculatePrintQuote,
  getPrintProductBySku,
  resolvePrintPriceTier,
  validateJpegUpload,
  validatePrintOrderRequest,
} from './print-shop-catalog';
import {
  PRINT_SHOP_MAX_JPEG_BYTES,
  PrintShopValidationError,
  type PrintOrderItemInput,
  type PrintShopCatalogProduct,
} from './print-shop-types';

function assignments(count: number, copies = 1, prefix = 'asset') {
  return Array.from({ length: count }, (_, index) => ({ assetId: `${prefix}-${index + 1}`, copies }));
}

function item(
  sku: string,
  copyCount: number,
  overrides: Partial<PrintOrderItemInput> = {},
): PrintOrderItemInput {
  return {
    sku,
    finish: 'glossy',
    fitMode: 'cover',
    assignments: [{ assetId: `${sku}-photo`, copies: copyCount }],
    ...overrides,
  };
}

function cents(price: string): number {
  return Math.round(Number(price.replace('€', '').replace(',', '.')) * 100);
}

describe('catalogo shop stampe', () => {
  it('contiene soltanto gli 11 formati presenti anche nel listino del laboratorio', () => {
    expect(PRINT_SHOP_CATALOG).toHaveLength(11);
    expect(PRINT_SHOP_CATALOG.map(product => product.nome.replace(/^Stampa | cm$/g, ''))).toEqual([
      '10×15',
      '15×20',
      '20×30',
      '30×40',
      '30×45',
      '30×50',
      '30×60',
      '35×50',
      '40×60',
      '40×80',
      '50×80',
    ]);
    expect(PRINT_SHOP_CATEGORIES.map(category => category.value)).toEqual([
      'stampe-classiche',
      'stampe-medie',
      'stampe-grandi',
    ]);
    expect(PRINT_SHOP_CATALOG.filter(product => product.categoria === 'stampe-classiche')).toHaveLength(2);
    expect(PRINT_SHOP_CATALOG.filter(product => product.categoria === 'stampe-medie')).toHaveLength(3);
    expect(PRINT_SHOP_CATALOG.filter(product => product.categoria === 'stampe-grandi')).toHaveLength(6);
    expect(PRINT_SHOP_CATALOG.some(product => product.printSpec.pricing.model === 'package')).toBe(false);
    expect(new Set(PRINT_SHOP_CATALOG.map(product => product.sku)).size).toBe(11);
    expect(new Set(PRINT_SHOP_CATALOG.map(product => product.id)).size).toBe(11);
  });

  it('replica tutti i prezzi in centesimi e nello stesso ordine del listino pubblico', () => {
    const publicRows = PRINT_PRICE_TABLES.flatMap(table => table.rows);
    expect(publicRows).toHaveLength(PRINT_SHOP_CATALOG.length);

    PRINT_SHOP_CATALOG.forEach((product, index) => {
      const row = publicRows[index];
      expect(product.nome).toContain(row.format.split(' Polaroid')[0]);
      const prices = product.printSpec.pricing.model === 'tiered'
        ? product.printSpec.pricing.tiers.map(tier => tier.unitPriceCents)
        : [product.printSpec.pricing.packagePriceCents];
      expect(prices).toEqual(row.prices.map(cents));
    });
  });

  it('espone soltanto le due finiture e le due modalità di adattamento concordate', () => {
    expect(PRINT_FINISH_OPTIONS.map(option => option.value)).toEqual(['glossy', 'matte']);
    expect(PRINT_FIT_OPTIONS.map(option => option.value)).toEqual(['border', 'cover']);
    expect(PRINT_FIT_OPTIONS.find(option => option.value === 'border')?.description).toContain('foto resta intera');
    expect(PRINT_FIT_OPTIONS.find(option => option.value === 'cover')?.description).toContain('potrebbe essere tagliata');

    for (const product of PRINT_SHOP_CATALOG) {
      expect(product.printSpec.finishes).toEqual(['glossy', 'matte']);
      expect(product.printSpec.fitModes).toEqual(['border', 'cover']);
      expect(product.currency).toBe('EUR');
      expect(product.salesChannels).toContain('print_shop');
    }
  });

  it('trova gli SKU senza dipendere dalle maiuscole o da spazi esterni', () => {
    expect(getPrintProductBySku(' print-100x150 ')?.nome).toBe('Stampa 10×15 cm');
    expect(getPrintProductBySku('inesistente')).toBeUndefined();
  });
});
describe('calcolo prezzi a scaglioni', () => {
  const tieredProducts = PRINT_SHOP_CATALOG.filter(product => product.printSpec.pricing.model === 'tiered');

  it.each(tieredProducts.map(product => [product.sku, product] as const))(
    'applica minimo, massimo e passaggi di ogni scaglione per %s',
    (_sku, product) => {
      if (product.printSpec.pricing.model !== 'tiered') throw new Error('fixture test non valida');
      for (const tier of product.printSpec.pricing.tiers) {
        expect(resolvePrintPriceTier(product, tier.minQuantity)?.unitPriceCents).toBe(tier.unitPriceCents);
        const maximumToTest = tier.maxQuantity ?? tier.minQuantity + 500;
        expect(resolvePrintPriceTier(product, maximumToTest)?.unitPriceCents).toBe(tier.unitPriceCents);

        const line = calculatePrintLine(item(product.sku, tier.minQuantity), product);
        expect(line.unitPriceCents).toBe(tier.unitPriceCents);
        expect(line.lineTotalCents).toBe(tier.minQuantity * tier.unitPriceCents);
        expect(Number.isSafeInteger(line.lineTotalCents)).toBe(true);
      }
    },
  );

  it('usa la quantità complessiva dello stesso formato anche se diviso fra opzioni', () => {
    const first = item('PRINT-100X150', 6, { finish: 'glossy', fitMode: 'cover' });
    const second = item('PRINT-100X150', 5, {
      finish: 'matte',
      fitMode: 'border',
      assignments: [{ assetId: 'second-photo', copies: 5 }],
    });
    const quote = calculatePrintQuote({ items: [first, second] });

    expect(quote.items.map(line => line.pricingQuantity)).toEqual([11, 11]);
    expect(quote.items.map(line => line.unitPriceCents)).toEqual([45, 45]);
    expect(quote.totals).toEqual({ subtotalCents: 495, discountCents: 0, totalCents: 495 });
    expect(quote.copyCount).toBe(11);
    expect(quote.assetCount).toBe(2);
  });

  it('calcola grandi quantità solo con interi in centesimi', () => {
    const quote = calculatePrintQuote({ items: [item('PRINT-100X150', 500)] });
    expect(quote.items[0].unitPriceCents).toBe(20);
    expect(quote.totals.totalCents).toBe(10_000);
    expect(Number.isSafeInteger(quote.totals.totalCents)).toBe(true);
  });

  it('rifiuta prodotto sconosciuto, disattivato e opzioni fuori catalogo', () => {
    const unknown = validatePrintOrderRequest({ items: [item('NOPE', 1)] });
    expect(unknown.issues.map(issue => issue.code)).toContain('UNKNOWN_SKU');

    const baseProduct = PRINT_SHOP_CATALOG[0];
    const inactive: PrintShopCatalogProduct = { ...baseProduct, attivo: false };
    const inactiveResult = validatePrintOrderRequest({ items: [item(inactive.sku, 1)] }, [inactive]);
    expect(inactiveResult.issues.map(issue => issue.code)).toContain('INACTIVE_PRODUCT');

    const invalidOptions = validatePrintOrderRequest({
      items: [{ ...item(baseProduct.sku, 1), finish: 'silk', fitMode: 'stretch' }],
    });
    expect(invalidOptions.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['INVALID_FINISH', 'INVALID_FIT_MODE']));
  });

  it('rifiuta quantità non intere e riferimenti fotografia duplicati nella stessa riga', () => {
    const result = validatePrintOrderRequest({
      items: [{
        ...item('PRINT-100X150', 1),
        assignments: [
          { assetId: 'same', copies: 1 },
          { assetId: 'same', copies: 1.5 },
        ],
      }],
    });
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['DUPLICATE_ASSET', 'INVALID_COPIES']));
    expect(() => calculatePrintQuote({ items: [] })).toThrow(PrintShopValidationError);
  });
});

describe('pacchetto Polaroid', () => {
  const sku = 'PRINT-POLAROID-100X090';
  const legacyCatalog = [...PRINT_SHOP_CATALOG, LEGACY_POLAROID_PRODUCT];
  const validItem: PrintOrderItemInput = {
    sku,
    finish: 'matte',
    fitMode: 'border',
    assignments: assignments(50),
  };

  it('accetta esattamente 50 fotografie tutte diverse a €9,90', () => {
    const quote = calculatePrintQuote({ items: [validItem] }, legacyCatalog);
    expect(quote.totals.totalCents).toBe(990);
    expect(quote.items[0]).toMatchObject({
      pricingModel: 'package',
      assetCount: 50,
      copyCount: 50,
      packageSize: 50,
      packageCount: 1,
      packagePriceCents: 990,
    });
  });

  it('rifiuta 49 fotografie', () => {
    const result = validatePrintOrderRequest({ items: [{ ...validItem, assignments: assignments(49) }] }, legacyCatalog);
    expect(result.issues.map(issue => issue.code)).toContain('INVALID_PACKAGE_SIZE');
  });

  it('rifiuta fotografie duplicate e copie multiple', () => {
    const duplicateAssignments = assignments(50);
    duplicateAssignments[49] = { assetId: duplicateAssignments[0].assetId, copies: 1 };
    const duplicateResult = validatePrintOrderRequest({ items: [{ ...validItem, assignments: duplicateAssignments }] }, legacyCatalog);
    expect(duplicateResult.issues.map(issue => issue.code)).toContain('PACKAGE_REQUIRES_DISTINCT_ASSETS');

    const multipleCopies = assignments(50);
    multipleCopies[0] = { ...multipleCopies[0], copies: 2 };
    const copiesResult = validatePrintOrderRequest({ items: [{ ...validItem, assignments: multipleCopies }] }, legacyCatalog);
    expect(copiesResult.issues.map(issue => issue.code)).toEqual(
      expect.arrayContaining(['PACKAGE_REQUIRES_SINGLE_COPIES', 'INVALID_PACKAGE_SIZE']),
    );
  });

  it('non consente di aggirare il limite creando due righe Polaroid', () => {
    const secondItem = { ...validItem, assignments: assignments(50, 1, 'second') };
    const result = validatePrintOrderRequest({ items: [validItem, secondItem] }, legacyCatalog);
    expect(result.issues.map(issue => issue.code)).toContain('MULTIPLE_PACKAGES_NOT_ALLOWED');
  });
});

describe('validazione upload JPG', () => {
  const validCandidate = {
    fileName: 'ricordo.JPG',
    contentType: 'image/jpeg',
    sizeBytes: 1_024,
    firstBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
  };

  it('accetta estensioni JPG/JPEG case-insensitive, MIME e firma corretti', () => {
    expect(validateJpegUpload(validCandidate)).toEqual({ valid: true, issues: [] });
    expect(validateJpegUpload({ ...validCandidate, fileName: 'ricordo.jpeg' }).valid).toBe(true);
    expect(validateJpegUpload({ ...validCandidate, sizeBytes: PRINT_SHOP_MAX_JPEG_BYTES }).valid).toBe(true);
  });

  it('rifiuta estensione o MIME non JPEG', () => {
    const extension = validateJpegUpload({ ...validCandidate, fileName: 'ricordo.png' });
    expect(extension.issues.map(issue => issue.code)).toContain('INVALID_FILE_NAME');
    const mime = validateJpegUpload({ ...validCandidate, contentType: 'image/png' });
    expect(mime.issues.map(issue => issue.code)).toContain('INVALID_CONTENT_TYPE');
  });

  it('rifiuta file vuoti, oltre 50 MB o con firma falsa', () => {
    expect(validateJpegUpload({ ...validCandidate, sizeBytes: 0 }).issues.map(issue => issue.code)).toContain('EMPTY_FILE');
    expect(validateJpegUpload({ ...validCandidate, sizeBytes: PRINT_SHOP_MAX_JPEG_BYTES + 1 }).issues.map(issue => issue.code)).toContain('FILE_TOO_LARGE');
    expect(validateJpegUpload({ ...validCandidate, firstBytes: [0x89, 0x50, 0x4e] }).issues.map(issue => issue.code)).toContain('INVALID_JPEG_SIGNATURE');
  });
});
