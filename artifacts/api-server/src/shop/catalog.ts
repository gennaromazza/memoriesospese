import {
  DEFAULT_SHOP_SETTINGS,
  DEFAULT_SHOP_SHIPPING,
  SHOP_CURRENCY,
  SHOP_MAX_CATEGORIES,
  SHOP_MAX_PHOTOS_PER_PRODUCT,
  SHOP_MAX_SHIPPING_GRAMS,
  isShopOrderingOpen,
  shopPriceCents,
  type ShopCatalogDto,
  type ShopCategoryDto,
  type ShopProductDto,
  type ShopSettings,
  type ShopShippingConfig,
} from '@shared/shop-types';
import { shopShippingTiers } from '@shared/shop-shipping';
import { normalizeShippingConfig } from '../commerce/checkout-input.js';
import { cleanText } from '../commerce/text.js';

/** Documento Firestore già letto: `id` più i campi del documento. */
export type ShopDocument = { id: string } & Record<string, any>;

const CATEGORY_VALUE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_IMAGES = 8;

function validDay(value: unknown): string | null {
  if (typeof value !== 'string' || !DAY_KEY.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value) ? value : null;
}

/** Spedizione dalle impostazioni: costo unico oppure, se ci sono fasce valide, costo per peso. */
function normalizeShopShipping(raw: unknown): ShopShippingConfig {
  const base = normalizeShippingConfig(raw, DEFAULT_SHOP_SHIPPING);
  const tiers = shopShippingTiers(raw && typeof raw === 'object' ? (raw as { tiers?: ShopShippingConfig['tiers'] }) : undefined);
  const withTiers = tiers.length > 0 ? { ...base, tiers } : base;
  const free = raw && typeof raw === 'object' ? (raw as { freeShippingOverCents?: unknown }).freeShippingOverCents : undefined;
  return Number.isSafeInteger(free) && Number(free) >= 1 && Number(free) <= 100_000_000
    ? { ...withTiers, freeShippingOverCents: Number(free) }
    : withTiers;
}

/** Peso di un esemplare in grammi dal prodotto del catalogo; null se non indicato. */
function productWeightGrams(value: unknown): number | null {
  return Number.isFinite(value) && Number(value) >= 1 ? Math.min(SHOP_MAX_SHIPPING_GRAMS, Math.round(Number(value))) : null;
}

/**
 * Impostazioni dello shop da un documento qualsiasi. Il documento `settings/*`
 * è scrivibile anche dal browser di un amministratore, quindi ogni lettura
 * lo ripulisce: valori mancanti o non validi tornano a quelli di riserva.
 */
export function normalizeShopSettings(raw: unknown): ShopSettings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const categoryValues = [
    ...new Set(
      (Array.isArray(source.categoryValues) ? source.categoryValues : [])
        .filter((value: unknown): value is string => typeof value === 'string')
        .map((value: string) => value.trim())
        .filter((value: string) => CATEGORY_VALUE.test(value)),
    ),
  ].slice(0, SHOP_MAX_CATEGORIES);
  const photoWaitDays =
    Number.isSafeInteger(source.photoWaitDays) && source.photoWaitDays >= 1 && source.photoWaitDays <= 60
      ? source.photoWaitDays
      : DEFAULT_SHOP_SETTINGS.photoWaitDays;
  return {
    enabled: source.enabled === true,
    ordersOpen: source.ordersOpen === true,
    categoryValues,
    lastOrderDate: validDay(source.lastOrderDate),
    photoWaitDays,
    shipping: normalizeShopShipping(source.shipping),
  };
}

function productImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((url): url is string => typeof url === 'string' && /^https:\/\//i.test(url.trim()))
    .map(url => url.trim())
    .slice(0, MAX_IMAGES);
}

/** Prodotto del catalogo gestionale come lo vede il cliente, oppure null se non vendibile. */
export function shopProductDto(product: ShopDocument, categoryValues: ReadonlySet<string>): ShopProductDto | null {
  if (product.attivo !== true) return null;
  const categoria = typeof product.categoria === 'string' ? product.categoria : '';
  if (!categoryValues.has(categoria)) return null;
  // I prodotti dello shop stampe hanno il loro negozio e il loro flusso.
  if (Array.isArray(product.salesChannels) && product.salesChannels.includes('print_shop')) return null;
  const nome = cleanText(product.nome, 200);
  if (!nome) return null;
  const price = shopPriceCents(product.prezzo, product.sconto);
  if (!price) return null;
  const photos = Number.isSafeInteger(product.numeroFoto) ? product.numeroFoto : 0;
  return {
    id: product.id,
    nome,
    descrizione: cleanText(product.descrizione, 2_000) || '',
    ...price,
    photosRequired: Math.min(SHOP_MAX_PHOTOS_PER_PRODUCT, Math.max(0, photos)),
    weightGrams: productWeightGrams(product.pesoGrammi),
    categoria,
    images: productImages(product.immagini),
    displayOrder: Number.isFinite(product.displayOrder) ? Number(product.displayOrder) : Number.MAX_SAFE_INTEGER,
  };
}

/** Catalogo pubblico: solo prodotti attivi delle categorie abilitate, con prezzi calcolati qui. */
export function buildShopCatalog(input: {
  settings: ShopSettings;
  products: readonly ShopDocument[];
  categories: readonly ShopDocument[];
  now: Date;
}): ShopCatalogDto {
  const { settings, now } = input;
  const base = {
    enabled: settings.enabled,
    orderingOpen: isShopOrderingOpen(settings, now),
    lastOrderDate: settings.lastOrderDate,
    currency: SHOP_CURRENCY,
    shipping: settings.shipping,
    photoWaitDays: settings.photoWaitDays,
  } as const;
  if (!settings.enabled) return { ...base, categories: [], products: [] };

  const enabledValues = new Set(settings.categoryValues);
  const visibleCategories = input.categories
    .filter(category => category.attivo !== false && typeof category.value === 'string' && enabledValues.has(category.value))
    .sort((left, right) => Number(left.displayOrder ?? 0) - Number(right.displayOrder ?? 0));
  const visibleValues = new Set<string>(visibleCategories.map(category => category.value as string));
  const categories: ShopCategoryDto[] = visibleCategories.map(category => ({
    value: category.value as string,
    nome: cleanText(category.nome, 120) || (category.value as string),
  }));
  const products = input.products
    .map(product => shopProductDto(product, visibleValues))
    .filter((product): product is ShopProductDto => product !== null)
    .sort((left, right) => left.displayOrder - right.displayOrder || left.nome.localeCompare(right.nome, 'it'));
  return { ...base, categories, products };
}
