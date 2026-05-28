/**
 * QUOTE MAPPERS - Utility functions
 * Convert between Product (catalog) and QuoteProduct
 */

import type { Product } from '@shared/booking-types';
import type { QuoteProduct } from '@shared/quotes-types';

/**
 * Override per-template / per-quote di un prodotto catalogo.
 * Se prezzo è settato, sovrascrive il prezzo del catalogo (snapshot locale).
 * Se selectable è settato, sovrascrive il default derivato dal tipo preventivo.
 */
export type CatalogProductOverride = {
  prezzo?: number;
  selectable?: boolean;
  /** Se true, il prodotto è marcato come Omaggio: prezzo=0, sempre incluso, non deselezionabile */
  isOmaggio?: boolean;
};

/**
 * Convert catalog Product to QuoteProduct
 */
export function catalogProductToQuoteProduct(
  product: Product,
  quoteType: 'fisso' | 'variabile',
  override?: CatalogProductOverride
): QuoteProduct {
  const isOmaggio = override?.isOmaggio === true;
  // Omaggio forza: selectable=false, prezzo=0, selected=true
  const selectable = isOmaggio
    ? false
    : (override?.selectable !== undefined
      ? !!override.selectable
      : quoteType === 'variabile');
  const prezzo = isOmaggio
    ? 0
    : (override?.prezzo !== undefined
      ? override.prezzo
      : (product.prezzoFinale || product.prezzo));

  const quoteProduct: QuoteProduct = {
    productId: product.id,
    nome: product.nome,
    descrizione: product.descrizione,
    prezzo,
    selectable,
    numeroFoto: product.numeroFoto,
    categoria: product.categoria,
    immagini: product.immagini || []
  };
  if (isOmaggio) {
    quoteProduct.isOmaggio = true;
    quoteProduct.selected = true;
  } else if (!selectable) {
    // Prodotti non-selezionabili in preventivo variabile = sempre inclusi (selected=true)
    quoteProduct.selected = true;
  }
  // Include bundle information if product is a bundle
  if (product.isBundle && product.bundleItems && product.bundleItems.length > 0) {
    quoteProduct.isBundle = true;
    quoteProduct.bundleItems = product.bundleItems.map(item => ({
      prodottoId: item.prodottoId,
      prodottoNome: item.prodottoNome,
      quantita: item.quantita,
      numeroFoto: item.numeroFoto
    }));
  }
  return quoteProduct;
}

/**
 * Convert array of catalog products to QuoteProducts
 */
export function catalogProductsToQuoteProducts(
  productIds: string[],
  allProducts: Product[],
  quoteType: 'fisso' | 'variabile',
  overrides?: Record<string, CatalogProductOverride>
): QuoteProduct[] {
  return productIds
    .map(id => {
      const product = allProducts.find(p => p.id === id);
      if (!product) {
        console.warn(`⚠️ Product ${id} not found in catalog`);
        return null;
      }
      return catalogProductToQuoteProduct(product, quoteType, overrides?.[id]);
    })
    .filter((p): p is QuoteProduct => p !== null);
}

/**
 * Merge catalog + custom products into single QuoteProduct array
 *
 * Per i custom products: se `selectable` è esplicitamente impostato (incl. false)
 * viene rispettato, altrimenti deriva dal `quoteType`. Prodotti con `selectable=false`
 * (non omaggio) vengono marcati come `selected: true` per essere sempre inclusi.
 */
export function mergeQuoteProducts(
  catalogProductIds: string[],
  customProducts: QuoteProduct[],
  allCatalogProducts: Product[],
  quoteType: 'fisso' | 'variabile',
  catalogOverrides?: Record<string, CatalogProductOverride>
): QuoteProduct[] {
  const catalogQuoteProducts = catalogProductsToQuoteProducts(
    catalogProductIds,
    allCatalogProducts,
    quoteType,
    catalogOverrides
  );

  // Custom products already in QuoteProduct format
  // Note: Firestore doesn't accept undefined, so we only set selected when it's true
  const customQuoteProducts = customProducts.map(p => {
    // Omaggi: sempre selectable=false e selected=true (non devono mai essere deselezionabili)
    if (p.isOmaggio) {
      const product: QuoteProduct = {
        ...p,
        selectable: false,
        selected: true,
        prezzo: 0,
      };
      return product;
    }
    // Rispetta selectable se esplicito sul prodotto custom, altrimenti deriva da quoteType
    const selectable = p.selectable === true || p.selectable === false
      ? p.selectable
      : quoteType === 'variabile';
    const product: QuoteProduct = {
      ...p,
      selectable,
    };
    // Non-selectable (fisso): sempre incluso
    if (!selectable) {
      product.selected = true;
    }
    return product;
  });

  return [...catalogQuoteProducts, ...customQuoteProducts];
}

/**
 * Calculate total from mixed products
 */
export function calculateQuoteTotal(
  catalogProductIds: string[],
  customProducts: QuoteProduct[],
  allCatalogProducts: Product[],
  catalogOverrides?: Record<string, CatalogProductOverride>
): number {
  // Catalog products total (con override prezzo se presente; omaggio = 0)
  const catalogTotal = catalogProductIds.reduce((sum, id) => {
    const override = catalogOverrides?.[id];
    if (override?.isOmaggio) return sum;
    if (override?.prezzo !== undefined) return sum + override.prezzo;
    const product = allCatalogProducts.find(p => p.id === id);
    return sum + (product?.prezzoFinale || product?.prezzo || 0);
  }, 0);

  // Custom products total (omaggio = 0)
  const customTotal = customProducts.reduce((sum, p) => sum + (p.isOmaggio ? 0 : (p.prezzo || 0)), 0);

  return catalogTotal + customTotal;
}
