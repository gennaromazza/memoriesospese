import type { PrintOrderItemInput, PrintShopQuote } from '@shared/print-shop-types';
import type {
  LocalPrintPhoto,
  PrintGroupDraft,
  PrintShopOrderListItem,
  PrintShopOwnerAsset,
} from './types';

const RESUMABLE_FULFILLMENT_STATUSES = new Set(['draft', 'awaiting_payment']);
const RESUMABLE_PAYMENT_STATUSES = new Set(['pending', 'failed']);

export function printShopDraftStorageKey(uid: string): string {
  return `print-shop-draft:${uid}`;
}

export function printShopDraftRequestStorageKey(uid: string): string {
  return `print-shop-draft-request:${uid}`;
}

export function isResumablePrintDraft(order: PrintShopOrderListItem): boolean {
  return RESUMABLE_FULFILLMENT_STATUSES.has(order.fulfillment?.status ?? '')
    && RESUMABLE_PAYMENT_STATUSES.has(order.payment?.status ?? '');
}

function restoreAsset(asset: PrintShopOwnerAsset, index: number): LocalPrintPhoto {
  return {
    localId: `restored-${asset.id}`,
    fileName: asset.originalName?.trim() || `Foto ${index + 1}.jpg`,
    sizeBytes: Math.max(0, Number(asset.sizeBytes) || 0),
    // Il digest originale non viene esposto dall'API proprietario. Questo valore
    // serve solo come identificatore locale; i duplicati restano verificati dal server.
    sha256: `restored:${asset.id}`,
    widthPx: Math.max(0, Number(asset.widthPx) || 0),
    heightPx: Math.max(0, Number(asset.heightPx) || 0),
    status: 'uploaded',
    progress: 100,
    retryCount: 0,
    assetId: asset.id,
  };
}

function restoreGroup(
  item: PrintOrderItemInput,
  index: number,
  localIdByAssetId: ReadonlyMap<string, string>,
): PrintGroupDraft | null {
  const assignments = item.assignments.flatMap((assignment) => {
    const localPhotoId = localIdByAssetId.get(assignment.assetId);
    if (!localPhotoId) return [];
    return [{
      localPhotoId,
      copies: Math.max(1, Math.min(999, Math.floor(Number(assignment.copies) || 1))),
    }];
  });
  if (assignments.length === 0) return null;
  return {
    id: `restored-group-${index + 1}`,
    sku: item.sku,
    finish: item.finish,
    fitMode: item.fitMode,
    assignments,
  };
}

export function restorePrintDraft(order: PrintShopOrderListItem): {
  photos: LocalPrintPhoto[];
  groups: PrintGroupDraft[];
} {
  const assets = (order.assets ?? []).filter((asset) => asset.status === 'ready');
  const photos = assets.map(restoreAsset);
  const localIdByAssetId = new Map(
    photos.flatMap((photo) => photo.assetId ? [[photo.assetId, photo.localId] as const] : []),
  );
  const groups = (order.printShop?.requestedItems ?? [])
    .map((item, index) => restoreGroup(item, index, localIdByAssetId))
    .filter((group): group is PrintGroupDraft => group !== null);
  return { photos, groups };
}

export function restorePrintDraftQuote(order: PrintShopOrderListItem): PrintShopQuote | null {
  const items = order.printShop?.items;
  if (
    !order.quoteFingerprint || !order.catalogVersion || order.currency !== 'EUR'
    || !order.totals || !items?.length
  ) return null;
  return {
    currency: 'EUR',
    catalogVersion: order.catalogVersion,
    items,
    totals: order.totals,
    assetCount: order.printShop?.assetCount ?? 0,
    copyCount: order.printShop?.copyCount ?? 0,
    qualityWarnings: order.printShop?.qualityWarnings ?? [],
    quoteFingerprint: order.quoteFingerprint,
  };
}
