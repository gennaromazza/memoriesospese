import type { Product, InsertProduct, ProductCategory } from '@shared/booking-types';
import { giftCardDescriptionState } from './state';

const categories: ProductCategory[] = [{
  id: 'e2e-category-album',
  nome: 'Album',
  value: 'album',
  attivo: true,
  displayOrder: 1,
} as ProductCategory];

export async function getAllProducts(): Promise<Product[]> {
  return structuredClone(giftCardDescriptionState.products);
}

export async function getAllProductsWithShopCosts(): Promise<Product[]> {
  return getAllProducts();
}

export async function updateProduct(productId: string, changes: InsertProduct): Promise<void> {
  const product = giftCardDescriptionState.products.find(entry => entry.id === productId);
  if (!product) throw new Error(`Fixture prodotto non trovato: ${productId}`);
  Object.assign(product, structuredClone(changes));
  giftCardDescriptionState.productUpdates.push({
    productId,
    description: String(changes.descrizione ?? ''),
  });
}

export async function createProduct(changes: InsertProduct): Promise<string> {
  const product = { ...structuredClone(changes), id: 'e2e-created-product' } as Product;
  giftCardDescriptionState.products.push(product);
  return product.id;
}

export async function deleteProduct(productId: string): Promise<void> {
  giftCardDescriptionState.products = giftCardDescriptionState.products.filter(entry => entry.id !== productId);
}

export function useProductCategories() {
  return { data: categories, isLoading: false };
}

export function useActiveProductCategories() {
  return { data: categories, isLoading: false };
}

export function useReorderProducts() {
  return { mutate: () => undefined };
}
