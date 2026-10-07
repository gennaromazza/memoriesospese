import {
  PRINT_SHOP_CATALOG_VERSION,
  PRINT_SHOP_CURRENCY,
  PRINT_SHOP_MAX_JPEG_BYTES,
  PrintShopValidationError,
  type AppliedPrintTier,
  type PrintFitMode,
  type PrintFinish,
  type PrintJpegUploadCandidate,
  type PrintOrderItemInput,
  type PrintOrderItemSnapshot,
  type PrintPriceTier,
  type PrintShopCatalogProduct,
  type PrintShopCategorySeed,
  type PrintShopQuote,
  type PrintShopQuoteInput,
  type PrintShopValidationIssue,
  type PrintShopValidationResult,
} from './print-shop-types';

export const PRINT_FINISH_OPTIONS: ReadonlyArray<{
  value: PrintFinish;
  label: string;
  description: string;
}> = [
  {
    value: 'glossy',
    label: 'Carta lucida',
    description: 'Colori brillanti e contrasto più intenso.',
  },
  {
    value: 'matte',
    label: 'Carta opaca',
    description: 'Meno riflessi e impronte, con un aspetto più morbido.',
  },
];

export const PRINT_FIT_OPTIONS: ReadonlyArray<{
  value: PrintFitMode;
  label: string;
  description: string;
}> = [
  {
    value: 'border',
    label: 'Con bordo bianco',
    description: 'La foto resta intera e lo spazio in più diventa un bordo bianco.',
  },
  {
    value: 'cover',
    label: 'A tutta pagina',
    description: 'La foto riempie tutta la stampa; una piccola parte ai bordi potrebbe essere tagliata.',
  },
];

export const PRINT_SHOP_CATEGORIES: readonly PrintShopCategorySeed[] = [
  { id: 'stampe-classiche', nome: 'Stampe classiche', value: 'stampe-classiche', attivo: true, displayOrder: 20 },
  { id: 'stampe-medie', nome: 'Stampe medie', value: 'stampe-medie', attivo: true, displayOrder: 21 },
  { id: 'stampe-grandi', nome: 'Stampe grandi e poster', value: 'stampe-grandi', attivo: true, displayOrder: 22 },
];

interface TierBound {
  minQuantity: number;
  maxQuantity?: number;
}
interface TieredFormatFixture {
  format: string;
  widthMm: number;
  heightMm: number;
  pricesCents: readonly number[];
}

const CLASSIC_BOUNDS: readonly TierBound[] = [
  { minQuantity: 1, maxQuantity: 10 },
  { minQuantity: 11, maxQuantity: 25 },
  { minQuantity: 26, maxQuantity: 50 },
  { minQuantity: 51, maxQuantity: 499 },
  { minQuantity: 500 },
];

const MEDIUM_BOUNDS: readonly TierBound[] = [
  { minQuantity: 1, maxQuantity: 5 },
  { minQuantity: 6, maxQuantity: 25 },
  { minQuantity: 26, maxQuantity: 50 },
  { minQuantity: 51 },
];

const LARGE_BOUNDS: readonly TierBound[] = [
  { minQuantity: 1, maxQuantity: 5 },
  { minQuantity: 6, maxQuantity: 25 },
  { minQuantity: 26 },
];

const CLASSIC_FORMATS: readonly TieredFormatFixture[] = [
  { format: '10×15', widthMm: 100, heightMm: 150, pricesCents: [70, 60, 50, 45, 40] },
  { format: '15×20', widthMm: 150, heightMm: 200, pricesCents: [180, 150, 130, 120, 100] },
];

const MEDIUM_FORMATS: readonly TieredFormatFixture[] = [
  { format: '20×30', widthMm: 200, heightMm: 300, pricesCents: [500, 350, 250, 200] },
  { format: '30×40', widthMm: 300, heightMm: 400, pricesCents: [700, 450, 350, 290] },
  { format: '30×45', widthMm: 300, heightMm: 450, pricesCents: [800, 500, 390, 320] },
];

const LARGE_FORMATS: readonly TieredFormatFixture[] = [
  { format: '30×50', widthMm: 300, heightMm: 500, pricesCents: [800, 600, 450] },
  { format: '30×60', widthMm: 300, heightMm: 600, pricesCents: [800, 600, 470] },
  { format: '35×50', widthMm: 350, heightMm: 500, pricesCents: [800, 600, 470] },
  { format: '40×60', widthMm: 400, heightMm: 600, pricesCents: [1000, 700, 550] },
  { format: '40×80', widthMm: 400, heightMm: 800, pricesCents: [1700, 1250, 1000] },
  { format: '50×80', widthMm: 500, heightMm: 800, pricesCents: [1700, 1250, 1000] },
];

const COMMON_PRODUCT_FIELDS = {
  sconto: 0,
  attivo: true,
  immagini: [] as readonly string[],
  salesChannels: ['admin', 'print_shop'] as const,
  currency: PRINT_SHOP_CURRENCY,
  catalogVersion: PRINT_SHOP_CATALOG_VERSION,
} as const;

function padMillimetres(value: number): string {
  return String(value).padStart(3, '0');
}

function createTiers(bounds: readonly TierBound[], pricesCents: readonly number[]): readonly PrintPriceTier[] {
  if (bounds.length !== pricesCents.length) {
    throw new Error('Fixture listino non valida: numero prezzi diverso dagli scaglioni');
  }

  return bounds.map((bound, index) => ({ ...bound, unitPriceCents: pricesCents[index] }));
}

function createTieredProduct(
  fixture: TieredFormatFixture,
  category: string,
  bounds: readonly TierBound[],
  displayOrder: number,
): PrintShopCatalogProduct {
  const sku = `PRINT-${padMillimetres(fixture.widthMm)}X${padMillimetres(fixture.heightMm)}`;
  const basePrice = fixture.pricesCents[0] / 100;

  return {
    ...COMMON_PRODUCT_FIELDS,
    id: sku.toLocaleLowerCase('en-US'),
    sku,
    nome: `Stampa ${fixture.format} cm`,
    descrizione: `Stampa fotografica ${fixture.format} cm, disponibile su carta lucida o opaca.`,
    prezzo: basePrice,
    prezzoFinale: basePrice,
    numeroFoto: 1,
    categoria: category,
    displayOrder,
    printSpec: {
      widthMm: fixture.widthMm,
      heightMm: fixture.heightMm,
      finishes: ['glossy', 'matte'],
      fitModes: ['border', 'cover'],
      pricing: { model: 'tiered', tiers: createTiers(bounds, fixture.pricesCents) },
      qualityWarningDpi: 150,
      qualityTargetDpi: 300,
    },
  };
}

/** Conservato per leggere e validare eventuali ordini storici, ma non è più venduto. */
export const LEGACY_POLAROID_PRODUCT: PrintShopCatalogProduct = {
  ...COMMON_PRODUCT_FIELDS,
  id: 'print-polaroid-100x090',
  sku: 'PRINT-POLAROID-100X090',
  nome: 'Stampa 10×9 cm Polaroid Wide',
  descrizione: 'Confezione da 50 fotografie Polaroid Wide, tutte diverse.',
  prezzo: 9.9,
  prezzoFinale: 9.9,
  numeroFoto: 50,
  categoria: 'stampe-polaroid',
  displayOrder: 1033,
  printSpec: {
    widthMm: 100,
    heightMm: 90,
    finishes: ['glossy', 'matte'],
    fitModes: ['border', 'cover'],
    pricing: {
      model: 'package',
      packageSize: 50,
      packagePriceCents: 990,
      requireDistinctAssets: true,
      allowMultiplePackages: false,
    },
    qualityWarningDpi: 150,
    qualityTargetDpi: 300,
  },
};

export const PRINT_SHOP_CATALOG: readonly PrintShopCatalogProduct[] = [
  ...CLASSIC_FORMATS.map((fixture, index) => createTieredProduct(fixture, 'stampe-classiche', CLASSIC_BOUNDS, 1000 + index)),
  ...MEDIUM_FORMATS.map((fixture, index) => createTieredProduct(fixture, 'stampe-medie', MEDIUM_BOUNDS, 1010 + index)),
  ...LARGE_FORMATS.map((fixture, index) => createTieredProduct(fixture, 'stampe-grandi', LARGE_BOUNDS, 1020 + index)),
];

export const PRINT_SHOP_CATALOG_SKUS = new Set(
  PRINT_SHOP_CATALOG.map(product => product.sku.trim().toLocaleUpperCase('en-US')),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSku(value: string): string {
  return value.trim().toLocaleUpperCase('en-US');
}

export function getPrintProductBySku(
  sku: string,
  catalog: readonly PrintShopCatalogProduct[] = PRINT_SHOP_CATALOG,
): PrintShopCatalogProduct | undefined {
  const normalized = normalizeSku(sku);
  return catalog.find(product => normalizeSku(product.sku) === normalized);
}

export function resolvePrintPriceTier(
  product: PrintShopCatalogProduct,
  quantity: number,
): AppliedPrintTier | undefined {
  if (product.printSpec.pricing.model !== 'tiered' || !Number.isSafeInteger(quantity) || quantity < 1) {
    return undefined;
  }

  const tier = product.printSpec.pricing.tiers.find(candidate =>
    quantity >= candidate.minQuantity &&
    (candidate.maxQuantity === undefined || quantity <= candidate.maxQuantity));

  return tier ? { ...tier } : undefined;
}

function countCopies(item: PrintOrderItemInput): number {
  return item.assignments.reduce((total, assignment) => total + assignment.copies, 0);
}

export function validatePrintOrderRequest(
  input: unknown,
  catalog: readonly PrintShopCatalogProduct[] = PRINT_SHOP_CATALOG,
): PrintShopValidationResult {
  const issues: PrintShopValidationIssue[] = [];
  if (!isRecord(input) || !Array.isArray(input.items) || input.items.length === 0) {
    return {
      valid: false,
      issues: [{ code: 'EMPTY_ORDER', message: 'Aggiungi almeno un formato all’ordine.', path: 'items' }],
    };
  }

  const packageOccurrences = new Map<string, number>();

  input.items.forEach((rawItem, itemIndex) => {
    const itemPath = `items[${itemIndex}]`;
    if (!isRecord(rawItem)) {
      issues.push({ code: 'INVALID_ITEM', message: 'La riga di stampa non è valida.', path: itemPath });
      return;
    }

    const sku = typeof rawItem.sku === 'string' ? rawItem.sku : '';
    const product = sku ? getPrintProductBySku(sku, catalog) : undefined;
    if (!product) {
      issues.push({ code: 'UNKNOWN_SKU', message: 'Il formato richiesto non è disponibile.', path: `${itemPath}.sku` });
    } else if (!product.attivo || !product.salesChannels.includes('print_shop')) {
      issues.push({ code: 'INACTIVE_PRODUCT', message: 'Il formato richiesto non è attivo nello shop.', path: `${itemPath}.sku` });
    }

    const finish = rawItem.finish;
    if (!product || typeof finish !== 'string' || !product.printSpec.finishes.includes(finish as PrintFinish)) {
      issues.push({ code: 'INVALID_FINISH', message: 'Scegli carta lucida oppure opaca.', path: `${itemPath}.finish` });
    }

    const fitMode = rawItem.fitMode;
    if (!product || typeof fitMode !== 'string' || !product.printSpec.fitModes.includes(fitMode as PrintFitMode)) {
      issues.push({ code: 'INVALID_FIT_MODE', message: 'Scegli bordo bianco oppure stampa a tutta pagina.', path: `${itemPath}.fitMode` });
    }

    if (!Array.isArray(rawItem.assignments) || rawItem.assignments.length === 0) {
      issues.push({ code: 'EMPTY_ASSIGNMENTS', message: 'Aggiungi almeno una fotografia al formato.', path: `${itemPath}.assignments` });
      return;
    }

    const seenAssetIds = new Set<string>();
    let copyCount = 0;
    let validCopyCounts = true;

    rawItem.assignments.forEach((rawAssignment, assignmentIndex) => {
      const assignmentPath = `${itemPath}.assignments[${assignmentIndex}]`;
      if (!isRecord(rawAssignment)) {
        issues.push({ code: 'INVALID_ASSET_ID', message: 'Il riferimento alla fotografia non è valido.', path: assignmentPath });
        validCopyCounts = false;
        return;
      }

      const assetId = typeof rawAssignment.assetId === 'string' ? rawAssignment.assetId.trim() : '';
      if (!assetId) {
        issues.push({ code: 'INVALID_ASSET_ID', message: 'Il riferimento alla fotografia non è valido.', path: `${assignmentPath}.assetId` });
      } else if (seenAssetIds.has(assetId)) {
        const packageRequiresDistinct = product?.printSpec.pricing.model === 'package' &&
          product.printSpec.pricing.requireDistinctAssets;
        issues.push({
          code: packageRequiresDistinct ? 'PACKAGE_REQUIRES_DISTINCT_ASSETS' : 'DUPLICATE_ASSET',
          message: packageRequiresDistinct
            ? 'Le 50 fotografie Polaroid devono essere tutte diverse.'
            : 'La stessa fotografia è stata aggiunta due volte alla riga.',
          path: `${assignmentPath}.assetId`,
        });
      }
      if (assetId) seenAssetIds.add(assetId);

      const copies = rawAssignment.copies;
      if (!Number.isSafeInteger(copies) || (copies as number) < 1) {
        validCopyCounts = false;
        issues.push({ code: 'INVALID_COPIES', message: 'Il numero di copie deve essere un intero positivo.', path: `${assignmentPath}.copies` });
      } else {
        copyCount += copies as number;
      }
    });

    if (!product || !validCopyCounts) return;
    const pricing = product.printSpec.pricing;
    if (pricing.model === 'tiered') {
      if (!resolvePrintPriceTier(product, copyCount)) {
        issues.push({ code: 'UNSUPPORTED_QUANTITY', message: 'La quantità non rientra nel listino disponibile.', path: `${itemPath}.assignments` });
      }
      return;
    }

    packageOccurrences.set(product.sku, (packageOccurrences.get(product.sku) ?? 0) + 1);
    if (rawItem.assignments.length !== pricing.packageSize || copyCount !== pricing.packageSize) {
      issues.push({
        code: 'INVALID_PACKAGE_SIZE',
        message: `Il pacchetto richiede esattamente ${pricing.packageSize} fotografie diverse.`,
        path: `${itemPath}.assignments`,
      });
    }
    if (rawItem.assignments.some(assignment => !isRecord(assignment) || assignment.copies !== 1)) {
      issues.push({
        code: 'PACKAGE_REQUIRES_SINGLE_COPIES',
        message: 'Nel pacchetto Polaroid ogni fotografia può avere una sola copia.',
        path: `${itemPath}.assignments`,
      });
    }
    if (pricing.requireDistinctAssets && seenAssetIds.size !== rawItem.assignments.length) {
      if (!issues.some(issue => issue.code === 'PACKAGE_REQUIRES_DISTINCT_ASSETS' && issue.path?.startsWith(itemPath))) {
        issues.push({
          code: 'PACKAGE_REQUIRES_DISTINCT_ASSETS',
          message: `Le ${pricing.packageSize} fotografie Polaroid devono essere tutte diverse.`,
          path: `${itemPath}.assignments`,
        });
      }
    }
  });

  for (const [sku, occurrences] of packageOccurrences) {
    const product = getPrintProductBySku(sku, catalog);
    if (product?.printSpec.pricing.model === 'package' &&
        !product.printSpec.pricing.allowMultiplePackages && occurrences > 1) {
      issues.push({
        code: 'MULTIPLE_PACKAGES_NOT_ALLOWED',
        message: 'È consentito un solo pacchetto Polaroid da 50 fotografie per ordine.',
        path: 'items',
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

function calculateValidatedLine(
  item: PrintOrderItemInput,
  product: PrintShopCatalogProduct,
  pricingQuantity: number,
): PrintOrderItemSnapshot {
  const copyCount = countCopies(item);
  const baseSnapshot = {
    productId: product.id,
    sku: product.sku,
    productName: product.nome,
    category: product.categoria,
    catalogVersion: product.catalogVersion,
    currency: product.currency,
    widthMm: product.printSpec.widthMm,
    heightMm: product.printSpec.heightMm,
    finish: item.finish,
    fitMode: item.fitMode,
    assetCount: item.assignments.length,
    copyCount,
    pricingQuantity,
    assignments: item.assignments.map(assignment => ({ ...assignment })),
  } as const;

  const pricing = product.printSpec.pricing;
  if (pricing.model === 'package') {
    return {
      ...baseSnapshot,
      pricingModel: 'package',
      packageSize: pricing.packageSize,
      packageCount: 1,
      packagePriceCents: pricing.packagePriceCents,
      lineTotalCents: pricing.packagePriceCents,
    };
  }

  const tier = resolvePrintPriceTier(product, pricingQuantity);
  if (!tier) {
    throw new PrintShopValidationError([{ code: 'UNSUPPORTED_QUANTITY', message: 'Quantità non supportata dal listino.' }]);
  }
  const lineTotalCents = copyCount * tier.unitPriceCents;
  if (!Number.isSafeInteger(lineTotalCents)) {
    throw new RangeError('Totale riga fuori dall’intervallo numerico sicuro');
  }

  return {
    ...baseSnapshot,
    pricingModel: 'tiered',
    unitPriceCents: tier.unitPriceCents,
    appliedTier: tier,
    lineTotalCents,
  };
}

export function calculatePrintLine(
  item: PrintOrderItemInput,
  product: PrintShopCatalogProduct,
  pricingQuantity: number = countCopies(item),
): PrintOrderItemSnapshot {
  const result = validatePrintOrderRequest({ items: [item] }, [product]);
  if (!result.valid) throw new PrintShopValidationError(result.issues);
  if (!Number.isSafeInteger(pricingQuantity) || pricingQuantity < countCopies(item)) {
    throw new PrintShopValidationError([{
      code: 'UNSUPPORTED_QUANTITY',
      message: 'La quantità usata per lo scaglione non può essere inferiore alle copie della riga.',
    }]);
  }
  return calculateValidatedLine(item, product, pricingQuantity);
}

/**
 * Calcolo autorevole del preventivo. Se lo stesso SKU è suddiviso tra opzioni
 * diverse, lo scaglione viene scelto sulla quantità complessiva di quel formato.
 */
export function calculatePrintQuote(
  input: PrintShopQuoteInput,
  catalog: readonly PrintShopCatalogProduct[] = PRINT_SHOP_CATALOG,
): PrintShopQuote {
  const validation = validatePrintOrderRequest(input, catalog);
  if (!validation.valid) throw new PrintShopValidationError(validation.issues);

  const quantitiesBySku = new Map<string, number>();
  for (const item of input.items) {
    const product = getPrintProductBySku(item.sku, catalog)!;
    quantitiesBySku.set(product.sku, (quantitiesBySku.get(product.sku) ?? 0) + countCopies(item));
  }

  const items = input.items.map(item => {
    const product = getPrintProductBySku(item.sku, catalog)!;
    return calculateValidatedLine(item, product, quantitiesBySku.get(product.sku)!);
  });
  const subtotalCents = items.reduce((total, item) => total + item.lineTotalCents, 0);
  if (!Number.isSafeInteger(subtotalCents)) {
    throw new RangeError('Totale ordine fuori dall’intervallo numerico sicuro');
  }

  const uniqueAssets = new Set(input.items.flatMap(item => item.assignments.map(assignment => assignment.assetId.trim())));
  return {
    currency: PRINT_SHOP_CURRENCY,
    catalogVersion: Math.max(...items.map(item => item.catalogVersion)),
    items,
    totals: {
      subtotalCents,
      discountCents: 0,
      totalCents: subtotalCents,
    },
    assetCount: uniqueAssets.size,
    copyCount: items.reduce((total, item) => total + item.copyCount, 0),
  };
}

export function validateJpegUpload(
  candidate: unknown,
  maxBytes: number = PRINT_SHOP_MAX_JPEG_BYTES,
): PrintShopValidationResult {
  const issues: PrintShopValidationIssue[] = [];
  if (!isRecord(candidate)) {
    return {
      valid: false,
      issues: [{ code: 'INVALID_FILE_NAME', message: 'Il file non è valido.' }],
    };
  }

  const typedCandidate = candidate as unknown as PrintJpegUploadCandidate;
  if (typeof typedCandidate.fileName !== 'string' || !/\.jpe?g$/i.test(typedCandidate.fileName.trim())) {
    issues.push({ code: 'INVALID_FILE_NAME', message: 'Carica soltanto fotografie JPG.', path: 'fileName' });
  }
  if (typeof typedCandidate.contentType !== 'string' || typedCandidate.contentType.trim().toLocaleLowerCase('en-US') !== 'image/jpeg') {
    issues.push({ code: 'INVALID_CONTENT_TYPE', message: 'Il contenuto del file deve essere in formato JPEG.', path: 'contentType' });
  }
  if (!Number.isSafeInteger(typedCandidate.sizeBytes) || typedCandidate.sizeBytes <= 0) {
    issues.push({ code: 'EMPTY_FILE', message: 'La fotografia è vuota o ha una dimensione non valida.', path: 'sizeBytes' });
  } else if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || typedCandidate.sizeBytes > maxBytes) {
    issues.push({
      code: 'FILE_TOO_LARGE',
      message: `La fotografia supera il limite di ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
      path: 'sizeBytes',
    });
  }

  if (typedCandidate.firstBytes !== undefined) {
    const bytes = typedCandidate.firstBytes;
    const hasJpegSignature = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!hasJpegSignature) {
      issues.push({
        code: 'INVALID_JPEG_SIGNATURE',
        message: 'Il file ha estensione JPG ma il suo contenuto non è un JPEG valido.',
        path: 'firstBytes',
      });
    }
  }

  return { valid: issues.length === 0, issues };
}
