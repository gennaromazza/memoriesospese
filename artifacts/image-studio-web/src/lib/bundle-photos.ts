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

/** A shared gallery source must still be an included, catalog-backed component with photos. */
export function isValidBundlePhotoSource(
  items: BundleItem[] = [],
  sourceProductId?: string,
  catalogProductIds?: ReadonlySet<string>,
): boolean {
  if (!sourceProductId) return false;
  const source = items.find((item) => item.prodottoId === sourceProductId);
  return Boolean(
    source
    && (source.numeroFoto ?? 0) > 0
    && (!catalogProductIds || catalogProductIds.has(sourceProductId)),
  );
}

export type PhotoProductAssignments = Record<string, string[]>;

export type PhotoProductAssignmentAction = 'added' | 'removed' | 'limit-reached';

export interface PhotoProductAssignmentResult {
  assignments: PhotoProductAssignments;
  action: PhotoProductAssignmentAction;
  productCount: number;
}

/**
 * Toggles a photo for one product while enforcing that product's own quota.
 * A photo can still be assigned to other products from the same shared gallery.
 */
export function togglePhotoProductAssignment(
  assignments: PhotoProductAssignments,
  photoId: string,
  productIndex: string | number,
  productLimit: number,
): PhotoProductAssignmentResult {
  const productKey = String(productIndex);
  const currentPhotoAssignments = assignments[photoId] || [];

  if (currentPhotoAssignments.includes(productKey)) {
    const nextPhotoAssignments = currentPhotoAssignments.filter((index) => index !== productKey);
    const nextAssignments = { ...assignments };
    if (nextPhotoAssignments.length === 0) {
      delete nextAssignments[photoId];
    } else {
      nextAssignments[photoId] = nextPhotoAssignments;
    }

    return {
      assignments: nextAssignments,
      action: 'removed',
      productCount: Object.values(nextAssignments).filter((products) => products.includes(productKey)).length,
    };
  }

  const currentProductCount = Object.values(assignments).filter((products) => products.includes(productKey)).length;
  if (productLimit > 0 && currentProductCount >= productLimit) {
    return { assignments, action: 'limit-reached', productCount: currentProductCount };
  }

  return {
    assignments: {
      ...assignments,
      [photoId]: [...currentPhotoAssignments, productKey],
    },
    action: 'added',
    productCount: currentProductCount + 1,
  };
}
