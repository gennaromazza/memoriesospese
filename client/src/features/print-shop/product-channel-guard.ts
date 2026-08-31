export function isPrintShopManagedProduct(product: { salesChannels?: unknown }): boolean {
  return Array.isArray(product.salesChannels) && product.salesChannels.includes('print_shop');
}
