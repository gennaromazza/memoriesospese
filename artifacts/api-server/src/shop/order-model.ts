import {
  SHOP_EDITABLE_STATUSES,
  shopPhotosMissing,
  type ShopAssetDto,
  type ShopFulfillmentMethod,
  type ShopFulfillmentStatus,
  type ShopOrderDto,
  type ShopOrderLineDto,
  type ShopPaymentStatus,
} from '@shared/shop-types';
import type { PrintShopBillingDetails, PrintShopPostalAddress } from '@shared/print-shop-types';
import { SHOP_LEGAL_TERMS } from '@shared/shop-legal';
import { CommerceHttpError } from '../commerce/errors.js';
import { timestampMillis } from '../commerce/text.js';

/** Sottocartella delle foto di un ordine shop. NON chiamarla `assets`: quel nome appartiene al negozio stampe. */
export const SHOP_ASSETS = 'shopAssets';
export const SHOP_DRAFT_RETENTION_DAYS = SHOP_LEGAL_TERMS.draftPhotoRetentionDays;
export const SHOP_CANCELLED_RETENTION_DAYS = SHOP_LEGAL_TERMS.cancelledPhotoRetentionDays;
/** Giorni di conservazione delle foto dopo la consegna (come per le stampe). */
export const SHOP_DELIVERED_RETENTION_DAYS = SHOP_LEGAL_TERMS.deliveredPhotoRetentionDays;
const DAY_MS = 24 * 60 * 60 * 1000;

const PAID_STATUSES = new Set<ShopPaymentStatus>(['paid', 'paid_action_required', 'partially_refunded', 'refunded']);

export function isPaid(order: any): boolean {
  return PAID_STATUSES.has(order?.payment?.status);
}

export function fulfillmentStatus(order: any): ShopFulfillmentStatus {
  return (order?.fulfillment?.status || 'draft') as ShopFulfillmentStatus;
}

/** Scadenza di una bozza: ogni modifica la sposta avanti. */
export function draftRetention(now: Date) {
  return {
    status: 'scheduled' as const,
    reason: 'draft' as const,
    assetRetentionDays: SHOP_DRAFT_RETENTION_DAYS,
    deleteAfter: new Date(now.getTime() + SHOP_DRAFT_RETENTION_DAYS * DAY_MS),
  };
}

export function cancelledRetention(now: Date, reason: 'cancelled' | 'refunded') {
  return {
    status: 'scheduled' as const,
    reason,
    assetRetentionDays: SHOP_CANCELLED_RETENTION_DAYS,
    deleteAfter: new Date(now.getTime() + SHOP_CANCELLED_RETENTION_DAYS * DAY_MS),
  };
}

export function deliveredRetention(now: Date) {
  return {
    status: 'scheduled' as const,
    reason: 'delivered' as const,
    assetRetentionDays: SHOP_DELIVERED_RETENTION_DAYS,
    deleteAfter: new Date(now.getTime() + SHOP_DELIVERED_RETENTION_DAYS * DAY_MS),
  };
}

function retentionBlocks(order: any, nowMillis: number): boolean {
  const status = order?.retention?.status;
  if (status === 'purging' || status === 'purged' || status === 'failed') return true;
  // Per un ordine non pagato la scadenza è quella della bozza.
  if (!isPaid(order)) {
    const deleteAfter = timestampMillis(order?.retention?.deleteAfter);
    if (deleteAfter > 0 && deleteAfter <= nowMillis) return true;
  }
  return false;
}

/** Carrello, consegna e dati si possono cambiare finché l'ordine non è pagato. */
export function assertEditable(order: any, nowMillis: number): void {
  if (
    isPaid(order) ||
    !SHOP_EDITABLE_STATUSES.includes(fulfillmentStatus(order)) ||
    order?.payment?.captureStatus === 'capturing' ||
    retentionBlocks(order, nowMillis)
  ) {
    throw new CommerceHttpError(409, 'order_locked', 'L’ordine non può più essere modificato');
  }
}

export function canEdit(order: any, nowMillis: number): boolean {
  try {
    assertEditable(order, nowMillis);
    return true;
  } catch {
    return false;
  }
}

/** Le foto si caricano mentre l'ordine è modificabile e, dopo il pagamento, finché ne mancano. */
export function canUploadPhotos(order: any, nowMillis: number): boolean {
  if (retentionBlocks(order, nowMillis)) return false;
  if (order?.payment?.captureStatus === 'capturing') return false;
  if (canEdit(order, nowMillis)) return true;
  return isPaid(order) && fulfillmentStatus(order) === 'awaiting_photos';
}

export function assertCanUploadPhotos(order: any, nowMillis: number): void {
  if (!canUploadPhotos(order, nowMillis)) {
    throw new CommerceHttpError(409, 'order_locked', 'Le foto di questo ordine non si possono più modificare');
  }
}

export function iso(value: unknown): string | null {
  const millis = timestampMillis(value);
  return millis > 0 ? new Date(millis).toISOString() : null;
}

export function publicAsset(id: string, asset: any): ShopAssetDto {
  return {
    id,
    lineId: String(asset.lineId || ''),
    originalName: String(asset.originalName || ''),
    status: asset.status === 'ready' ? 'ready' : asset.status === 'purged' ? 'purged' : 'prepared',
    widthPx: Number.isFinite(asset.widthPx) ? asset.widthPx : null,
    heightPx: Number.isFinite(asset.heightPx) ? asset.heightPx : null,
    sizeBytes: Number(asset.sizeBytes || asset.declaredSizeBytes || 0),
    lowResolution: asset.lowResolution === true,
  };
}

/** Ordine come lo vede il suo cliente: senza campi interni, con le foto per riga. */
export function toOwnerDto(
  id: string,
  order: any,
  assets: ReadonlyArray<{ id: string } & Record<string, any>>,
  nowMillis: number,
): ShopOrderDto {
  const lines: ShopOrderLineDto[] = Array.isArray(order.lines) ? order.lines : [];
  const visibleAssets = assets
    .filter(asset => asset.status !== 'purged')
    .map(asset => publicAsset(asset.id, asset));
  const method: ShopFulfillmentMethod = order.fulfillment?.method === 'shipping' ? 'shipping' : 'studio_pickup';
  const tracking = order.fulfillment?.tracking;
  return {
    id,
    orderNumber: String(order.orderNumber || id),
    createdAt: iso(order.createdAt),
    paidAt: iso(order.payment?.paidAt),
    fulfillmentStatus: fulfillmentStatus(order),
    paymentStatus: (order.payment?.status || 'pending') as ShopPaymentStatus,
    lines: lines.map(line => {
      const photos = visibleAssets.filter(asset => asset.lineId === line.lineId);
      return {
        ...line,
        photos,
        photosMissing: Math.max(0, line.photosRequired - photos.filter(photo => photo.status === 'ready').length),
      };
    }),
    photosMissing: shopPhotosMissing(lines, visibleAssets),
    photoDeadlineAt: iso(order.shop?.photoDeadlineAt),
    totals: {
      subtotalCents: Number(order.totals?.subtotalCents || 0),
      shippingCents: Number(order.totals?.shippingCents || 0),
      totalCents: Number(order.totals?.totalCents || 0),
    },
    quoteFingerprint: typeof order.quoteFingerprint === 'string' ? order.quoteFingerprint : null,
    fulfillment: {
      method,
      shippingAddress: (order.fulfillment?.shippingAddress as PrintShopPostalAddress | undefined) ?? null,
      tracking: tracking?.code ? { carrier: String(tracking.carrier || ''), code: String(tracking.code) } : null,
    },
    billingDetails: (order.billingDetails as PrintShopBillingDetails | undefined) ?? null,
    customer: {
      name: String(order.customer?.name || order.nomeCliente || ''),
      email: String(order.customer?.email || order.emailCliente || ''),
      phone: order.customer?.phone ? String(order.customer.phone) : null,
    },
    customerNotes: order.shop?.customerNotes ? String(order.shop.customerNotes) : null,
    canEdit: canEdit(order, nowMillis),
    canUploadPhotos: canUploadPhotos(order, nowMillis),
  };
}

/** Righe nel formato che il gestionale conosce (`prodotti`), per elenchi e report. */
export function compatibilityProducts(lines: readonly ShopOrderLineDto[]): any[] {
  return lines.map(line => ({
    prodottoId: line.productId,
    prodottoNome: line.productName,
    prodottoPrezzo: line.unitPriceCents / 100,
    prodottoNumeroFoto: line.photosRequired,
    quantita: line.quantity,
    lineTotalCents: line.lineTotalCents,
  }));
}
