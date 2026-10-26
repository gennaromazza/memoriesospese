export interface GalleryProductRequirement {
  prodottoId?: string | null;
  prodottoNome?: string;
  prodottoNumeroFoto?: number;
  galleriaCondivisaId?: string;
}

export interface BundleOrderProduct {
  prodottoId?: string;
  prodottoNome?: string;
  prodottoNumeroFoto?: number;
  quantita?: number;
  isBundle?: boolean;
  fotoCondivise?: boolean;
  prodottoSorgenteFotoId?: string;
  bundleItems?: Array<{
    prodottoId?: string;
    prodottoNome: string;
    quantita: number;
    numeroFoto: number;
  }>;
}

/** Expands bundle snapshots without merging their per-product photo quotas. */
export function expandOrderProductsToRequirements(
  prodotti: BundleOrderProduct[] = [],
): GalleryProductRequirement[] {
  const expanded: GalleryProductRequirement[] = [];
  for (const item of prodotti) {
    const qty = item.quantita || 1;
    const bundleItems = item.isBundle && item.bundleItems?.length ? item.bundleItems : null;
    const bundleParentName = item.prodottoNome || 'Bundle';

    if (bundleItems) {
      for (let orderQty = 0; orderQty < qty; orderQty++) {
        const sharedGalleryId = item.fotoCondivise && item.prodottoSorgenteFotoId
          ? `${item.prodottoId || bundleParentName}:${orderQty}:${item.prodottoSorgenteFotoId}`
          : undefined;
        for (const bundleItem of bundleItems) {
          if (!bundleItem.quantita || bundleItem.quantita <= 0) continue;
          if (bundleItem.numeroFoto === undefined || bundleItem.numeroFoto < 0) continue;
          for (let i = 0; i < bundleItem.quantita; i++) {
            const prefix = qty > 1 ? `[${orderQty + 1}/${qty}] ` : '';
            expanded.push({
              prodottoId: bundleItem.prodottoId || null,
              prodottoNome: bundleItem.quantita > 1
                ? `${prefix}${bundleItem.prodottoNome} (${i + 1}/${bundleItem.quantita}) - ${bundleParentName}`
                : `${prefix}${bundleItem.prodottoNome} - ${bundleParentName}`,
              prodottoNumeroFoto: bundleItem.numeroFoto,
              ...(sharedGalleryId ? { galleriaCondivisaId: sharedGalleryId } : {}),
            });
          }
        }
      }
    } else {
      for (let i = 0; i < qty; i++) {
        expanded.push({
          prodottoId: item.prodottoId && !item.prodottoId.startsWith('custom_') ? item.prodottoId : null,
          prodottoNome: qty > 1 ? `${item.prodottoNome} (${i + 1}/${qty})` : item.prodottoNome,
          prodottoNumeroFoto: item.prodottoNumeroFoto ?? 0,
        });
      }
    }
  }
  return expanded;
}

/** Counts unique photo pools while preserving separate per-product requirements. */
export function getRequiredGalleryPhotoCount(
  requirements: GalleryProductRequirement[] = [],
): number {
  const sharedPoolCounts = new Map<string, number>();
  let independentCount = 0;

  for (const requirement of requirements) {
    const count = requirement.prodottoNumeroFoto || 0;
    if (requirement.galleriaCondivisaId) {
      sharedPoolCounts.set(
        requirement.galleriaCondivisaId,
        Math.max(sharedPoolCounts.get(requirement.galleriaCondivisaId) || 0, count),
      );
    } else {
      independentCount += count;
    }
  }

  return independentCount + [...sharedPoolCounts.values()].reduce((sum, count) => sum + count, 0);
}
