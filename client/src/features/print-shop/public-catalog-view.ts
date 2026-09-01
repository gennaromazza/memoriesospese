import { PRINT_SHOP_CATEGORIES } from '@shared/print-shop-catalog';
import type { PrintShopCatalogProduct } from '@shared/print-shop-types';
import type { PrintPriceTable } from '@shared/print-service-content';
import { normalizePrintFormat } from '@shared/print-service-content';

export interface PublicCatalogPriceRow {
  sku: string;
  format: string;
  prices: string[];
  quantityHeaders: string[];
  isPackage: boolean;
  priceAvailable: boolean;
  startingPrice: string;
}

export interface PublicCatalogPriceSection {
  id: string;
  title: string;
  description: string;
  rows: PublicCatalogPriceRow[];
}

export interface PublicCatalogSearchResult {
  sectionId: string;
  sectionTitle: string;
  row: PublicCatalogPriceRow;
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'stampe-classiche': 'Perfetti per album, scatole dei ricordi, cornici e fotografie da regalare.',
  'stampe-medie': 'Per cornici importanti, composizioni fotografiche e piccoli ingrandimenti.',
  'stampe-grandi': 'Quando una fotografia merita di diventare parte della casa.',
};

export function formatCatalogEuro(cents: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(Math.max(0, cents) / 100);
}

function centimetres(mm: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(mm / 10);
}

function formatName(product: PrintShopCatalogProduct): string {
  const dimensions = `${centimetres(product.printSpec.widthMm)}×${centimetres(product.printSpec.heightMm)}`;
  return dimensions;
}

function quantityLabel(minQuantity: number, maxQuantity?: number): string {
  if (maxQuantity === undefined) return `${minQuantity}+`;
  if (minQuantity === maxQuantity) return String(minQuantity);
  return `${minQuantity}–${maxQuantity}`;
}

function catalogRow(product: PrintShopCatalogProduct): PublicCatalogPriceRow {
  const pricing = product.printSpec.pricing;
  if (pricing.model === 'package') {
    return {
      sku: product.sku,
      format: formatName(product),
      prices: [formatCatalogEuro(pricing.packagePriceCents)],
      quantityHeaders: [String(pricing.packageSize)],
      isPackage: true,
      priceAvailable: true,
      startingPrice: formatCatalogEuro(pricing.packagePriceCents),
    };
  }
  return {
    sku: product.sku,
    format: formatName(product),
    prices: pricing.tiers.map((tier) => formatCatalogEuro(tier.unitPriceCents)),
    quantityHeaders: pricing.tiers.map((tier) => quantityLabel(tier.minQuantity, tier.maxQuantity)),
    isPackage: false,
    priceAvailable: true,
    startingPrice: formatCatalogEuro(Math.min(...pricing.tiers.map((tier) => tier.unitPriceCents))),
  };
}

export function buildPublicCatalogPriceSections(
  products: readonly PrintShopCatalogProduct[],
): PublicCatalogPriceSection[] {
  return PRINT_SHOP_CATEGORIES.map((category) => ({
    id: category.id,
    title: category.nome,
    description: CATEGORY_DESCRIPTIONS[category.id] || 'Formati fotografici disponibili nello shop.',
    rows: products
      .filter((product) => product.attivo && product.categoria === category.id)
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map(catalogRow),
  })).filter((section) => section.rows.length > 0);
}

/** Converte il vecchio listino solo per la modalità degradata, mai per il checkout. */
export function buildFallbackPriceSections(
  tables: readonly PrintPriceTable[],
): PublicCatalogPriceSection[] {
  return tables.map((table) => ({
    id: `fallback-${table.id}`,
    title: table.title,
    description: table.description,
    rows: table.rows.map((row, index) => ({
      sku: `fallback-${table.id}-${index}`,
      format: row.format,
      prices: row.prices.map(() => 'Prezzo non disponibile'),
      quantityHeaders: [...table.quantityHeaders],
      isPackage: row.format.toLocaleLowerCase('it-IT').includes('polaroid'),
      priceAvailable: false,
      startingPrice: 'Prezzo non disponibile',
    })),
  }));
}

export function searchPublicCatalogSections(
  sections: readonly PublicCatalogPriceSection[],
  query: string,
): PublicCatalogSearchResult[] {
  const normalized = normalizePrintFormat(query);
  if (!normalized) return [];
  return sections.flatMap((section) => section.rows
    .filter((row) => normalizePrintFormat(row.format).includes(normalized))
    .map((row) => ({ sectionId: section.id, sectionTitle: section.title, row })));
}

export function catalogPriceRangeCents(products: readonly PrintShopCatalogProduct[]): {
  lowCents: number;
  highCents: number;
} | null {
  const prices = products.flatMap((product) => product.printSpec.pricing.model === 'package'
    ? [product.printSpec.pricing.packagePriceCents]
    : product.printSpec.pricing.tiers.map((tier) => tier.unitPriceCents));
  if (prices.length === 0) return null;
  return { lowCents: Math.min(...prices), highCents: Math.max(...prices) };
}

export function lowestProductPriceCents(product?: PrintShopCatalogProduct): number | null {
  if (!product) return null;
  const pricing = product.printSpec.pricing;
  return pricing.model === 'package'
    ? pricing.packagePriceCents
    : Math.min(...pricing.tiers.map((tier) => tier.unitPriceCents));
}
