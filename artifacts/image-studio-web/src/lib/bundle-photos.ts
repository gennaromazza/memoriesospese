import type { BundleItem, Product } from '@shared/booking-types';
export {
  expandOrderProductsToRequirements,
  getRequiredGalleryPhotoCount,
} from '@shared/gallery-requirements';

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

/**
 * Returns the shared gallery size when its source product is configured;
 * otherwise retains the existing sum for bundles without shared photos.
 */
export function getBundleGalleryPhotoCount(
  items: BundleItem[] = [],
  sourceProductId?: string,
): number {
  if (!sourceProductId) return countBundlePhotos(items);
  return items.find((item) => item.prodottoId === sourceProductId)?.numeroFoto ?? 0;
}


/** Counts unique photo pools while preserving separate per-product requirements. */
