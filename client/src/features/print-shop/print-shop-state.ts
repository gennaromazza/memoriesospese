import type {
  PrintOrderItemInput,
  PrintPackagePricing,
  PrintShopCatalogProduct,
  PrintShopQuote,
} from '@shared/print-shop-types';
import type { LocalPrintPhoto, PrintGroupDraft } from './types';

export interface PrintGroupIssue {
  groupId: string;
  message: string;
}

export function createLocalId(prefix = 'print'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function formatEuroCents(cents: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export function findPrintProduct(
  products: readonly PrintShopCatalogProduct[],
  sku: string,
): PrintShopCatalogProduct | undefined {
  return products.find((product) => product.sku === sku);
}

export function isPackageProduct(product: PrintShopCatalogProduct | undefined): product is PrintShopCatalogProduct & {
  printSpec: PrintShopCatalogProduct['printSpec'] & { pricing: PrintPackagePricing };
} {
  return product?.printSpec.pricing.model === 'package';
}

export function groupCopyCount(group: PrintGroupDraft): number {
  return group.assignments.reduce((total, assignment) => total + assignment.copies, 0);
}

export function validatePrintGroups(
  groups: readonly PrintGroupDraft[],
  products: readonly PrintShopCatalogProduct[],
  photos: readonly LocalPrintPhoto[],
): PrintGroupIssue[] {
  const issues: PrintGroupIssue[] = [];
  const uploadedIds = new Set(
    photos.filter((photo) => photo.status === 'uploaded' && photo.assetId).map((photo) => photo.localId),
  );
  const packageSkuOccurrences = new Map<string, number>();

  if (groups.length === 0) {
    return [{ groupId: '', message: 'Crea almeno un gruppo di stampe.' }];
  }

  for (const group of groups) {
    const product = findPrintProduct(products, group.sku);
    if (!product) {
      issues.push({ groupId: group.id, message: 'Scegli un formato disponibile.' });
      continue;
    }
    if (!product.printSpec.finishes.includes(group.finish)) {
      issues.push({ groupId: group.id, message: 'Scegli carta lucida oppure opaca.' });
    }
    if (!product.printSpec.fitModes.includes(group.fitMode)) {
      issues.push({ groupId: group.id, message: 'Scegli come adattare la foto alla carta.' });
    }
    if (group.assignments.length === 0) {
      issues.push({ groupId: group.id, message: 'Seleziona almeno una foto per questo formato.' });
      continue;
    }

    const distinctPhotoIds = new Set(group.assignments.map((assignment) => assignment.localPhotoId));
    if (distinctPhotoIds.size !== group.assignments.length) {
      issues.push({ groupId: group.id, message: 'La stessa foto compare due volte nello stesso gruppo.' });
    }
    if (group.assignments.some((assignment) => !uploadedIds.has(assignment.localPhotoId))) {
      issues.push({ groupId: group.id, message: 'Attendi il caricamento di tutte le foto selezionate.' });
    }
    if (group.assignments.some((assignment) => !Number.isInteger(assignment.copies) || assignment.copies < 1)) {
      issues.push({ groupId: group.id, message: 'Il numero di copie deve essere almeno 1.' });
    }

    if (isPackageProduct(product)) {
      const pricing = product.printSpec.pricing;
      packageSkuOccurrences.set(group.sku, (packageSkuOccurrences.get(group.sku) ?? 0) + 1);
      if (group.assignments.length !== pricing.packageSize) {
        issues.push({
          groupId: group.id,
          message: `Il pacchetto Polaroid richiede esattamente ${pricing.packageSize} foto diverse.`,
        });
      }
      if (pricing.requireDistinctAssets && distinctPhotoIds.size !== pricing.packageSize) {
        issues.push({
          groupId: group.id,
          message: `Scegli ${pricing.packageSize} fotografie tutte diverse.`,
        });
      }
      if (group.assignments.some((assignment) => assignment.copies !== 1)) {
        issues.push({ groupId: group.id, message: 'Per le Polaroid è prevista una sola copia di ogni foto.' });
      }
    }
  }

  for (const [sku, count] of packageSkuOccurrences) {
    const product = findPrintProduct(products, sku);
    if (isPackageProduct(product) && !product.printSpec.pricing.allowMultiplePackages && count > 1) {
      for (const group of groups.filter((entry) => entry.sku === sku)) {
        issues.push({ groupId: group.id, message: 'Puoi aggiungere un solo pacchetto Polaroid per ordine.' });
      }
    }
  }

  return issues;
}

export function buildPrintOrderItems(
  groups: readonly PrintGroupDraft[],
  photos: readonly LocalPrintPhoto[],
): PrintOrderItemInput[] {
  const assetsByLocalId = new Map(
    photos
      .filter((photo): photo is LocalPrintPhoto & { assetId: string } => Boolean(photo.assetId))
      .map((photo) => [photo.localId, photo.assetId]),
  );

  return groups.map((group) => ({
    sku: group.sku,
    finish: group.finish,
    fitMode: group.fitMode,
    assignments: group.assignments.map((assignment) => ({
      assetId: assetsByLocalId.get(assignment.localPhotoId) ?? '',
      copies: assignment.copies,
    })),
  }));
}

export function estimateGroupTotalCents(
  group: PrintGroupDraft,
  product: PrintShopCatalogProduct,
): number {
  const quantity = groupCopyCount(group);
  const pricing = product.printSpec.pricing;
  if (pricing.model === 'package') {
    if (group.assignments.length !== pricing.packageSize) return 0;
    return pricing.packagePriceCents;
  }
  const tier = pricing.tiers.find((candidate) =>
    quantity >= candidate.minQuantity &&
    (candidate.maxQuantity === undefined || quantity <= candidate.maxQuantity),
  );
  return tier ? tier.unitPriceCents * quantity : 0;
}

export function estimateOrderTotalCents(
  groups: readonly PrintGroupDraft[],
  products: readonly PrintShopCatalogProduct[],
): number {
  // Gli scaglioni sono calcolati sulla quantità complessiva dello stesso SKU,
  // anche quando lucida/opaca o bordo/tutta pagina sono in gruppi distinti.
  const quantitiesBySku = new Map<string, number>();
  for (const group of groups) {
    quantitiesBySku.set(group.sku, (quantitiesBySku.get(group.sku) ?? 0) + groupCopyCount(group));
  }

  return groups.reduce((total, group) => {
    const product = findPrintProduct(products, group.sku);
    if (!product) return total;
    const pricing = product.printSpec.pricing;
    if (pricing.model === 'package') {
      return total + (group.assignments.length === pricing.packageSize ? pricing.packagePriceCents : 0);
    }
    const pricingQuantity = quantitiesBySku.get(group.sku) ?? 0;
    const tier = pricing.tiers.find((candidate) =>
      pricingQuantity >= candidate.minQuantity &&
      (candidate.maxQuantity === undefined || pricingQuantity <= candidate.maxQuantity),
    );
    return total + (tier ? tier.unitPriceCents * groupCopyCount(group) : 0);
  }, 0);
}

export function effectivePrintDpi(
  widthPx: number,
  heightPx: number,
  widthMm: number,
  heightMm: number,
  fitMode: 'border' | 'cover' = 'cover',
): number {
  if (widthPx <= 0 || heightPx <= 0 || widthMm <= 0 || heightMm <= 0) return 0;
  const pixelLong = Math.max(widthPx, heightPx);
  const pixelShort = Math.min(widthPx, heightPx);
  const printLongInches = Math.max(widthMm, heightMm) / 25.4;
  const printShortInches = Math.min(widthMm, heightMm) / 25.4;
  const longDpi = pixelLong / printLongInches;
  const shortDpi = pixelShort / printShortInches;
  return Math.round(fitMode === 'cover' ? Math.min(longDpi, shortDpi) : Math.max(longDpi, shortDpi));
}

export function hasLowResolutionPhotos(
  groups: readonly PrintGroupDraft[],
  products: readonly PrintShopCatalogProduct[],
  photos: readonly LocalPrintPhoto[],
): boolean {
  const photosById = new Map(photos.map((photo) => [photo.localId, photo]));
  return groups.some((group) => {
    const product = findPrintProduct(products, group.sku);
    if (!product) return false;
    return group.assignments.some((assignment) => {
      const photo = photosById.get(assignment.localPhotoId);
      if (!photo) return false;
      return effectivePrintDpi(
        photo.widthPx,
        photo.heightPx,
        product.printSpec.widthMm,
        product.printSpec.heightMm,
        group.fitMode,
      ) < product.printSpec.qualityWarningDpi;
    });
  });
}

export function quoteTotal(quote: PrintShopQuote | null | undefined, estimatedCents: number): number {
  return quote?.totals.totalCents ?? estimatedCents;
}
