import type { BundleItem, Product } from '@shared/booking-types';

/** Catalog bundles use current component counts; quote/order snapshots stay untouched. */
export function resolveBundleItems(items: BundleItem[] = [], catalog: Product[] = []): BundleItem[] {
  return items.map(item => {
    const product = catalog.find(product => product.id === item.prodottoId);
    return product
      ? { ...item, prodottoNome: product.nome, prodottoCategoria: product.categoria, numeroFoto: product.numeroFoto }
      : item;
  });
}

export function countBundlePhotos(items: BundleItem[] = []): number {
  return items.reduce((sum, item) => sum + (item.numeroFoto ?? 0) * (item.quantita ?? 1), 0);
}
