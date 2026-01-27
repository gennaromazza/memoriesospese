/**
 * QUOTE MAPPERS - Utility functions
 * Convert between Product (catalog) and QuoteProduct
 */

import type { Product } from '@shared/booking-types';
import type { QuoteProduct } from '@shared/quotes-types';

/**
 * Convert catalog Product to QuoteProduct
 */
export function catalogProductToQuoteProduct(
  product: Product,
  quoteType: 'fisso' | 'variabile'
): QuoteProduct {
  const quoteProduct: QuoteProduct = {
    productId: product.id,
    nome: product.nome,
    descrizione: product.descrizione,
    prezzo: product.prezzoFinale || product.prezzo, // Use discounted price if available
    selectable: quoteType === 'variabile',
    numeroFoto: product.numeroFoto,
    categoria: product.categoria,
    immagini: product.immagini || []
  };
  // Only add selected field if it's true (Firestore doesn't accept undefined)
  if (quoteType === 'fisso') {
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
  quoteType: 'fisso' | 'variabile'
): QuoteProduct[] {
  return productIds
    .map(id => {
      const product = allProducts.find(p => p.id === id);
      if (!product) {
        console.warn(`⚠️ Product ${id} not found in catalog`);
        return null;
      }
      return catalogProductToQuoteProduct(product, quoteType);
    })
    .filter((p): p is QuoteProduct => p !== null);
}

/**
 * Merge catalog + custom products into single QuoteProduct array
 */
export function mergeQuoteProducts(
  catalogProductIds: string[],
  customProducts: QuoteProduct[],
  allCatalogProducts: Product[],
  quoteType: 'fisso' | 'variabile'
): QuoteProduct[] {
  const catalogQuoteProducts = catalogProductsToQuoteProducts(
    catalogProductIds,
    allCatalogProducts,
    quoteType
  );
  
  // Custom products already in QuoteProduct format
  // Note: Firestore doesn't accept undefined, so we only set selected when it's true
  const customQuoteProducts = customProducts.map(p => {
    const product: QuoteProduct = {
      ...p,
      selectable: quoteType === 'variabile',
    };
    // Only add selected field if it's true (Firestore doesn't accept undefined)
    if (quoteType === 'fisso') {
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
  allCatalogProducts: Product[]
): number {
  // Catalog products total
  const catalogTotal = catalogProductIds.reduce((sum, id) => {
    const product = allCatalogProducts.find(p => p.id === id);
    return sum + (product?.prezzoFinale || product?.prezzo || 0);
  }, 0);
  
  // Custom products total
  const customTotal = customProducts.reduce((sum, p) => sum + (p.prezzo || 0), 0);
  
  return catalogTotal + customTotal;
}
