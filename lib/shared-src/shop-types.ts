/**
 * Contratti condivisi dello shop online ("Shopping online Natale 2026").
 *
 * I prodotti sono prodotti normali del catalogo (`products`), raggruppati dalle
 * categorie scelte nelle impostazioni dello shop. Gli importi sono sempre in
 * centesimi e li calcola solo il server.
 */
import type { PrintShopDeliveryMethod, PrintShopPostalAddress, PrintShopBillingDetails, PrintShopShippingConfig } from './print-shop-types';

export const SHOP_ORDER_TYPE = 'shop' as const;
export const SHOP_CURRENCY = 'EUR' as const;

/** Numero massimo di foto che un singolo prodotto può richiedere al cliente. */
export const SHOP_MAX_PHOTOS_PER_PRODUCT = 50;
export const SHOP_MAX_CATEGORIES = 30;
export const SHOP_DEFAULT_PHOTO_WAIT_DAYS = 7;

/**
 * Impostazioni salvate in `settings/shop`. Quel documento è leggibile da
 * chiunque dal browser: contiene solo dati pubblici e si modifica dal server.
 */
export interface ShopSettings {
  /** La vetrina è visibile ai clienti. */
  enabled: boolean;
  /** Gli ordini online sono aperti (la vetrina può essere visibile prima). */
  ordersOpen: boolean;
  /** Valori (`ProductCategory.value`) delle categorie mostrate nella vetrina. */
  categoryValues: string[];
  /** Ultimo giorno utile per ordinare, `YYYY-MM-DD` (ora di Roma). */
  lastOrderDate: string | null;
  /** Giorni di attesa delle foto mancanti prima di annullare l'ordine. */
  photoWaitDays: number;
  shipping: PrintShopShippingConfig;
}

export const DEFAULT_SHOP_SHIPPING: PrintShopShippingConfig = {
  enabled: false,
  priceCents: 0,
  estimatedMinDays: 3,
  estimatedMaxDays: 7,
};

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  enabled: false,
  ordersOpen: false,
  categoryValues: [],
  lastOrderDate: null,
  photoWaitDays: SHOP_DEFAULT_PHOTO_WAIT_DAYS,
  shipping: DEFAULT_SHOP_SHIPPING,
};

export interface ShopCategoryDto {
  value: string;
  nome: string;
}

export interface ShopProductDto {
  id: string;
  nome: string;
  descrizione: string;
  /** Prezzo che paga il cliente, sconto compreso. */
  priceCents: number;
  /** Prezzo di listino prima dello sconto. */
  listPriceCents: number;
  discountPercent: number;
  /** Foto che il cliente deve fornire (0 = nessuna). */
  photosRequired: number;
  categoria: string;
  images: string[];
  displayOrder: number;
}

export interface ShopCatalogDto {
  enabled: boolean;
  /** Gli ordini si possono fare adesso (aperti e non oltre l'ultimo giorno). */
  orderingOpen: boolean;
  lastOrderDate: string | null;
  currency: typeof SHOP_CURRENCY;
  categories: ShopCategoryDto[];
  products: ShopProductDto[];
  shipping: PrintShopShippingConfig;
  photoWaitDays: number;
}

/** Giorno `YYYY-MM-DD` nel fuso orario dello studio. */
export function shopDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Gli ordini sono aperti e il giorno di oggi non supera l'ultimo giorno utile. */
export function isShopOrderingOpen(settings: Pick<ShopSettings, 'enabled' | 'ordersOpen' | 'lastOrderDate'>, now: Date): boolean {
  if (!settings.enabled || !settings.ordersOpen) return false;
  return !settings.lastOrderDate || shopDayKey(now) <= settings.lastOrderDate;
}

/**
 * Prezzo finale in centesimi da prezzo di listino (euro) e sconto in
 * percentuale. Restituisce null se il prezzo non è valido.
 */
export function shopPriceCents(prezzo: unknown, sconto: unknown): { priceCents: number; listPriceCents: number; discountPercent: number } | null {
  if (typeof prezzo !== 'number' || !Number.isFinite(prezzo)) return null;
  const listPriceCents = Math.round(prezzo * 100);
  if (listPriceCents <= 0 || listPriceCents > 100_000_000) return null;
  const rawDiscount = typeof sconto === 'number' && Number.isFinite(sconto) ? sconto : 0;
  const discountPercent = Math.min(100, Math.max(0, rawDiscount));
  const priceCents = Math.round((listPriceCents * (100 - discountPercent)) / 100);
  if (priceCents <= 0) return null;
  return { priceCents, listPriceCents, discountPercent };
}

/** Importo in centesimi come testo per il cliente, per esempio "19,90 €". */
export function formatShopPrice(cents: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: SHOP_CURRENCY }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// Ordini
// ---------------------------------------------------------------------------

/** Righe del carrello per ordine e quantità massima di un prodotto senza foto. */
export const SHOP_MAX_LINES = 20;
export const SHOP_MAX_QUANTITY = 20;
/** Fotografie: limite per file e per ordine. */
export const SHOP_MAX_PHOTO_BYTES = 30 * 1024 * 1024;
export const SHOP_MAX_PHOTOS_PER_ORDER = 200;
/** Sotto questo lato lungo (pixel) avvisiamo che la foto potrebbe venire sfocata. */
export const SHOP_LOW_RESOLUTION_PX = 1200;

export type ShopFulfillmentMethod = PrintShopDeliveryMethod;

/**
 * Stato di lavorazione. Prima del pagamento: `draft`, `awaiting_payment`.
 * Dopo: `awaiting_photos` (mancano foto), `photos_received` (si può lavorare),
 * `in_production`, poi `ready_for_pickup` oppure `shipped`, infine `delivered`.
 * Un rimborso totale o un annullamento portano a `cancelled`.
 */
export type ShopFulfillmentStatus =
  | 'draft'
  | 'awaiting_payment'
  | 'awaiting_photos'
  | 'photos_received'
  | 'in_production'
  | 'ready_for_pickup'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type ShopPaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'partially_refunded'
  | 'refunded'
  | 'paid_action_required';

/** Stati in cui carrello, consegna e prezzi si possono ancora cambiare. */
export const SHOP_EDITABLE_STATUSES: readonly ShopFulfillmentStatus[] = ['draft', 'awaiting_payment'];

export interface ShopOrderLineInput {
  /** Presente solo per righe già nell'ordine: serve a non perdere le foto collegate. */
  lineId?: string;
  productId: string;
  quantity: number;
}

export interface ShopOrderLineDto {
  lineId: string;
  productId: string;
  productName: string;
  categoria: string;
  unitPriceCents: number;
  listPriceCents: number;
  discountPercent: number;
  quantity: number;
  /** Foto richieste per questa riga (0 = nessuna). */
  photosRequired: number;
  lineTotalCents: number;
}

export interface ShopAssetDto {
  id: string;
  lineId: string;
  originalName: string;
  status: 'prepared' | 'ready' | 'purged';
  widthPx: number | null;
  heightPx: number | null;
  sizeBytes: number;
  lowResolution: boolean;
}

export interface ShopQuoteDto {
  currency: typeof SHOP_CURRENCY;
  lines: ShopOrderLineDto[];
  totals: { subtotalCents: number; shippingCents: number; totalCents: number };
  fulfillmentMethod: ShopFulfillmentMethod;
  /** Impronta del riepilogo: il cliente la rimanda al pagamento per confermare ciò che ha visto. */
  fingerprint: string;
}

export interface ShopOrderDto {
  id: string;
  orderNumber: string;
  createdAt: string | null;
  paidAt: string | null;
  fulfillmentStatus: ShopFulfillmentStatus;
  paymentStatus: ShopPaymentStatus;
  lines: Array<ShopOrderLineDto & { photos: ShopAssetDto[]; photosMissing: number }>;
  photosMissing: number;
  /** Data entro cui servono le foto, dopo il pagamento. */
  photoDeadlineAt: string | null;
  totals: ShopQuoteDto['totals'];
  quoteFingerprint: string | null;
  fulfillment: {
    method: ShopFulfillmentMethod;
    shippingAddress: PrintShopPostalAddress | null;
    tracking: { carrier: string; code: string } | null;
  };
  billingDetails: PrintShopBillingDetails | null;
  customer: { name: string; email: string; phone: string | null };
  customerNotes: string | null;
  /** Il cliente può ancora cambiare carrello, consegna e dati. */
  canEdit: boolean;
  /** Il cliente può caricare o togliere fotografie. */
  canUploadPhotos: boolean;
}

/** Foto ancora mancanti per le righe, contando solo quelle pronte. */
export function shopPhotosMissing(
  lines: ReadonlyArray<{ lineId: string; photosRequired: number }>,
  assets: ReadonlyArray<{ lineId: string; status: string }>,
): number {
  let missing = 0;
  for (const line of lines) {
    const ready = assets.filter(asset => asset.lineId === line.lineId && asset.status === 'ready').length;
    missing += Math.max(0, line.photosRequired - ready);
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Gestione ordini (studio)
// ---------------------------------------------------------------------------

/** Come l'ordine si raggruppa nell'elenco dello studio. */
export type ShopAdminView = 'active' | 'attention' | 'drafts' | 'closed' | 'all';

export interface ShopAdminOrderSummaryDto {
  id: string;
  orderNumber: string;
  createdAt: string | null;
  paidAt: string | null;
  customerName: string;
  customerEmail: string;
  fulfillmentStatus: ShopFulfillmentStatus;
  paymentStatus: ShopPaymentStatus;
  method: ShopFulfillmentMethod;
  totalCents: number;
  lineCount: number;
  /** Foto che mancano; null quando non serve saperlo (ordine già avviato o chiuso). */
  photosMissing: number | null;
  photoDeadlineAt: string | null;
  photoOverdue: boolean;
  /** C'è qualcosa che lo studio deve guardare: pagamento da verificare, foto in ritardo, rimborso dopo la spedizione. */
  needsAttention: boolean;
}

export interface ShopAdminHistoryEntry {
  at: string | null;
  by: string;
  from: ShopFulfillmentStatus;
  to: ShopFulfillmentStatus;
  note: string | null;
}

export interface ShopAdminNotificationDto {
  key: string;
  kind: string;
  status: 'sending' | 'sent' | 'failed';
  attempts: number;
  sentAt: string | null;
  lastError: string | null;
}

export interface ShopAdminOrderDto extends ShopAdminOrderSummaryDto {
  customer: { name: string; email: string; phone: string | null };
  customerNotes: string | null;
  adminNotes: string | null;
  lines: Array<ShopOrderLineDto & { photos: ShopAssetDto[]; photosMissing: number }>;
  totals: { subtotalCents: number; shippingCents: number; totalCents: number };
  fulfillment: {
    shippingAddress: PrintShopPostalAddress | null;
    tracking: { carrier: string; code: string } | null;
    readyAt: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
  };
  billingDetails: PrintShopBillingDetails | null;
  payment: {
    amountCents: number;
    paypalFeeCents: number;
    netAmountCents: number;
    refundedCents: number;
    paypalOrderId: string | null;
    paypalCaptureId: string | null;
    reconciliationRequired: boolean;
    reconciliationReason: string | null;
  };
  legal: { acceptedAt: string | null; termsVersion: string | null; manifestHash: string | null } | null;
  notifications: ShopAdminNotificationDto[];
  history: ShopAdminHistoryEntry[];
  refundedAfterShipping: boolean;
  /** Ordine annullato dallo studio e già pagato: il rimborso va fatto da PayPal. */
  refundPending: boolean;
  /** Stati in cui lo studio può portare l'ordine adesso. */
  allowedStatuses: ShopFulfillmentStatus[];
  /** Un pagamento arrivato su un ordine annullato: lo studio può decidere di tenerlo. */
  canReactivate: boolean;
  /** Si può chiedere una foto nuova al cliente. */
  canRequestNewPhoto: boolean;
}

/** Email che lo studio può far ripartire a mano. */
export const SHOP_RESENDABLE_MAILS = [
  'order_confirmed',
  'photos_reminder',
  'ready_for_pickup',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;
export type ShopResendableMail = typeof SHOP_RESENDABLE_MAILS[number];

export const SHOP_TRACKING_CARRIER_MAX = 60;
export const SHOP_TRACKING_CODE_MAX = 100;
