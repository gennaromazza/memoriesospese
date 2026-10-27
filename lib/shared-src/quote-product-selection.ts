import type { QuoteProduct } from './quotes-types';

/**
 * Returns a stable, unique selection key for one row in a saved quote.
 * The row index disambiguates repeated catalog/custom references and also
 * supports legacy rows that predate product identifiers.
 */
export function getQuoteProductSelectionKey(
  product: QuoteProduct,
  index: number,
): string {
  const identity = product.customProductId
    ? `custom:${product.customProductId}`
    : product.productId
      ? `catalog:${product.productId}`
      : 'legacy';
  return `${identity}:${index}`;
}

export function getSelectedQuoteProductNames(
  products: QuoteProduct[],
  selectedKeys: string[],
): string[] {
  const selected = new Set(selectedKeys);
  return products.flatMap((product, index) =>
    selected.has(getQuoteProductSelectionKey(product, index))
      ? [product.nome]
      : [],
  );
}

export function isQuoteProductSelected(
  product: QuoteProduct,
  index: number,
  selectedKeys: string[] | Set<string>,
): boolean {
  const selected = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys);
  return selected.has(getQuoteProductSelectionKey(product, index));
}

export function isQuoteProductSelectedForAcceptance(
  product: QuoteProduct,
  index: number,
  selectedKeys?: string[],
  legacySelectedNames?: string[],
): boolean {
  return selectedKeys !== undefined
    ? isQuoteProductSelected(product, index, selectedKeys)
    : legacySelectedNames?.includes(product.nome) ?? false;
}

export function getQuoteProductSelectionKeysForNames(
  products: QuoteProduct[],
  names: string[],
): string[] {
  const selectedNames = new Set(names);
  return products.flatMap((product, index) =>
    selectedNames.has(product.nome)
      ? [getQuoteProductSelectionKey(product, index)]
      : [],
  );
}
