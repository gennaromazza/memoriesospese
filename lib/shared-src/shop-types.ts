/**
 * Contratti condivisi dello shop online ("Shopping online Natale 2026").
 *
 * I prodotti sono prodotti normali del catalogo (`products`), raggruppati dalle
 * categorie scelte nelle impostazioni dello shop. Gli importi sono sempre in
 * centesimi e li calcola solo il server.
 */
import type { PrintShopShippingConfig } from './print-shop-types';

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
