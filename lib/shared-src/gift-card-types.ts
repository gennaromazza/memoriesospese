/**
 * Contratti condivisi del dominio "gift card".
 *
 * Gli importi sono sempre espressi in centesimi, come nello shop stampe.
 * Il modulo non dipende da Firebase, così può essere usato sia dal backend
 * (Admin SDK) sia dal browser.
 */

export const GIFT_CARD_THEME_KEYS = [
  'natale',
  'carnevale',
  'san-valentino',
  'pasqua',
  'halloween',
  'classico',
] as const;
export type GiftCardThemeKey = (typeof GIFT_CARD_THEME_KEYS)[number];

/**
 * Collega il tema stagionale di una campagna di prenotazione (campo
 * `temaStagionale`) al tema grafico della gift card. Le campagne senza tema
 * usano il tema Classico.
 */
export function giftCardThemeFromSeasonalTheme(value: string | null | undefined): GiftCardThemeKey {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
  return (GIFT_CARD_THEME_KEYS as readonly string[]).includes(normalized)
    ? (normalized as GiftCardThemeKey)
    : 'classico';
}

export type GiftCardKind = 'prodotto' | 'importo';
export type GiftCardValidityMode = 'campaign' | 'date' | 'none';
export type GiftCardChannel = 'studio' | 'online';
export type GiftCardPaymentMethod = 'contante' | 'carta' | 'bonifico' | 'paypal' | 'altro';

/**
 * Stato memorizzato. La scadenza non è uno stato memorizzato: una card
 * `attiva` con scadenza passata viene mostrata come `scaduta` (vedi
 * {@link effectiveGiftCardStatus}), senza bisogno di processi di fondo.
 */
export type GiftCardStatus =
  | 'in_attesa_pagamento'
  | 'attiva'
  | 'riscattata'
  | 'scaduta'
  | 'annullata';

export const GIFT_CARD_STATUS_LABELS: Record<GiftCardStatus, string> = {
  in_attesa_pagamento: 'In attesa di pagamento',
  attiva: 'Attiva',
  riscattata: 'Riscattata',
  scaduta: 'Scaduta',
  annullata: 'Annullata',
};

export const GIFT_CARD_MESSAGE_MAX = 90;
export const GIFT_CARD_NAME_MAX = 60;
export const GIFT_CARD_TYPE_NAME_MAX = 80;
export const GIFT_CARD_TYPE_TITLE_MAX = 40;
export const GIFT_CARD_TYPE_LINE2_MAX = 40;
export const GIFT_CARD_TYPE_DESCRIPTION_MAX = 240;
export const GIFT_CARD_MAX_PRICE_CENTS = 500_000;

/**
 * Alfabeto dei codici: niente 0/O e 1/I, che si confondono quando il codice
 * viene letto a voce o digitato dal cartoncino.
 */
export const GIFT_CARD_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const GIFT_CARD_CODE_LENGTH = 12;
const CODE_GROUP = 4;

/** Normalizza un codice digitato o scansionato; `null` se non è valido. */
export function normalizeGiftCardCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const compact = input.toUpperCase().replace(/[\s-]+/g, '');
  if (compact.length !== GIFT_CARD_CODE_LENGTH) return null;
  for (const char of compact) {
    if (!GIFT_CARD_CODE_ALPHABET.includes(char)) return null;
  }
  const groups: string[] = [];
  for (let index = 0; index < compact.length; index += CODE_GROUP) {
    groups.push(compact.slice(index, index + CODE_GROUP));
  }
  return groups.join('-');
}

type DateLike = Date | string | number | null | undefined;

function toMillis(value: DateLike): number | null {
  if (value === null || value === undefined) return null;
  const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(millis) ? millis : null;
}

export function effectiveGiftCardStatus(
  card: { status: GiftCardStatus; expiresAt?: DateLike },
  now: Date = new Date(),
): GiftCardStatus {
  if (card.status !== 'attiva') return card.status;
  const expires = toMillis(card.expiresAt);
  return expires !== null && expires <= now.getTime() ? 'scaduta' : 'attiva';
}

export function formatGiftCardPrice(cents: number): string {
  const value = (Number(cents) || 0) / 100;
  return `${Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',')} €`;
}

export const GIFT_CARD_MAX_ITEMS = 12;
export const GIFT_CARD_MAX_ITEM_QUANTITY = 99;

/** Prodotto del catalogo incluso in una gift card. */
export interface GiftCardItemInput {
  productId: string;
  quantity: number;
}

/** Prodotto incluso come lo vede chi riceve la card: mai con il prezzo. */
export interface GiftCardItemDto {
  productId: string;
  quantity: number;
  name: string;
  description: string;
  imageUrls: string[];
}

/** Tipo di gift card come lo vede l'API (date in ISO 8601). */
export interface GiftCardTypeDto {
  id: string;
  name: string;
  description: string;
  /** Titolo stampato sulla card, per esempio "Foto di Natale". */
  title: string;
  /** Seconda riga della card, per esempio "con stampa su tela". */
  line2: string;
  kind: GiftCardKind;
  priceCents: number;
  /** Prodotti del catalogo inclusi nel regalo (possono essere nessuno). */
  items: GiftCardItemInput[];
  theme: GiftCardThemeKey;
  campaignId: string | null;
  validityMode: GiftCardValidityMode;
  /** Data di scadenza (YYYY-MM-DD) quando `validityMode` è `date`. */
  validityDate: string | null;
  /** Ultimo giorno (YYYY-MM-DD) in cui la card si vende online. */
  sellUntil: string | null;
  sellOnline: boolean;
  sellInStudio: boolean;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type GiftCardTypeInput = Omit<GiftCardTypeDto, 'id' | 'createdAt' | 'updatedAt'>;

/** Card come la vede lo studio. */
export interface GiftCardDto {
  code: string;
  typeId: string;
  typeName: string;
  title: string;
  line2: string;
  kind: GiftCardKind;
  theme: GiftCardThemeKey;
  valueCents: number;
  recipientName: string;
  message: string;
  /** Stato memorizzato. */
  status: GiftCardStatus;
  /** Stato che tiene conto della scadenza. */
  effectiveStatus: GiftCardStatus;
  channel: GiftCardChannel;
  paymentMethod: GiftCardPaymentMethod;
  campaignId: string | null;
  issuedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  bookingId: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Dati di chi ha comprato online (vuoti per le vendite al banco). */
  buyerName: string;
  buyerEmail: string;
  recipientEmail: string;
  /** Quando la card va consegnata a chi la riceve; `null` = subito. */
  deliverAt: string | null;
  deliveredAt: string | null;
  /** `true` quando serve un controllo a mano (per esempio un rimborso PayPal). */
  reviewRequired: boolean;
  reviewReason: string | null;
}

export interface GiftCardSellInput {
  typeId: string;
  recipientName: string;
  message: string;
  paymentMethod: GiftCardPaymentMethod;
  /** Se presente sostituisce la scadenza del tipo (YYYY-MM-DD). */
  expiresOn?: string | null;
  /** `true` per vendere senza scadenza, anche se il tipo ne prevede una. */
  noExpiry?: boolean;
  /** Chi compra, facoltativo: con l'email viene salvato tra i clienti. */
  buyer?: { firstName?: string; lastName?: string; email?: string; phone?: string };
}

export type GiftCardCampaignState = 'upcoming' | 'open' | 'closed';

/** Dati minimi esposti a chi scansiona il QR: nessun dato personale. */
export interface GiftCardPublicDto {
  code: string;
  /** Stato che tiene conto della scadenza. */
  status: GiftCardStatus;
  theme: GiftCardThemeKey;
  title: string;
  line2: string;
  recipientName: string;
  message: string;
  validUntil: string | null;
  /** Testo «cosa include» scritto dallo studio. */
  includes: string;
  /** Prodotti del catalogo inclusi, senza prezzo. */
  items: GiftCardItemDto[];
  campaign: {
    name: string;
    bookingCode: string | null;
    state: GiftCardCampaignState;
    opensAt: string | null;
    closesAt: string | null;
  } | null;
}

export interface GiftCardTypeValidationIssue {
  field: string;
  message: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Valida e normalizza un tipo di gift card; restituisce gli errori trovati. */
export function validateGiftCardTypeInput(
  raw: Partial<GiftCardTypeInput>,
): { value?: GiftCardTypeInput; issues: GiftCardTypeValidationIssue[] } {
  const issues: GiftCardTypeValidationIssue[] = [];
  const text = (field: string, value: unknown, max: number, required: boolean) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (required && !trimmed) issues.push({ field, message: 'Campo obbligatorio' });
    if (trimmed.length > max) issues.push({ field, message: `Massimo ${max} caratteri` });
    return trimmed;
  };

  const name = text('name', raw.name, GIFT_CARD_TYPE_NAME_MAX, true);
  const description = text('description', raw.description, GIFT_CARD_TYPE_DESCRIPTION_MAX, false);
  const title = text('title', raw.title, GIFT_CARD_TYPE_TITLE_MAX, true);
  const line2 = text('line2', raw.line2, GIFT_CARD_TYPE_LINE2_MAX, false);

  const kind: GiftCardKind = raw.kind === 'importo' ? 'importo' : 'prodotto';
  if (raw.kind !== 'prodotto' && raw.kind !== 'importo') {
    issues.push({ field: 'kind', message: 'Tipo non valido' });
  }

  const priceCents = raw.priceCents;
  if (
    typeof priceCents !== 'number' ||
    !Number.isSafeInteger(priceCents) ||
    priceCents <= 0 ||
    priceCents > GIFT_CARD_MAX_PRICE_CENTS
  ) {
    issues.push({ field: 'priceCents', message: 'Il prezzo deve essere maggiore di zero' });
  }

  const items: GiftCardItemInput[] = [];
  if (raw.items !== undefined && !Array.isArray(raw.items)) {
    issues.push({ field: 'items', message: 'Elenco prodotti non valido' });
  } else {
    const seen = new Set<string>();
    for (const entry of raw.items ?? []) {
      const productId = typeof entry?.productId === 'string' ? entry.productId.trim() : '';
      const quantity = entry?.quantity;
      if (!productId || productId.length > 200 || productId.includes('/')) {
        issues.push({ field: 'items', message: 'Prodotto non valido' });
      } else if (seen.has(productId)) {
        issues.push({ field: 'items', message: 'Un prodotto è stato aggiunto due volte' });
      } else if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > GIFT_CARD_MAX_ITEM_QUANTITY) {
        issues.push({ field: 'items', message: `La quantità va da 1 a ${GIFT_CARD_MAX_ITEM_QUANTITY}` });
      } else {
        seen.add(productId);
        items.push({ productId, quantity: quantity as number });
      }
    }
    if (items.length > GIFT_CARD_MAX_ITEMS) {
      issues.push({ field: 'items', message: `Al massimo ${GIFT_CARD_MAX_ITEMS} prodotti` });
    }
  }

  const theme = (GIFT_CARD_THEME_KEYS as readonly string[]).includes(String(raw.theme))
    ? (raw.theme as GiftCardThemeKey)
    : 'classico';
  if (raw.theme !== undefined && theme !== raw.theme) {
    issues.push({ field: 'theme', message: 'Tema non valido' });
  }

  const campaignId =
    typeof raw.campaignId === 'string' && raw.campaignId.trim() ? raw.campaignId.trim() : null;

  const validityMode: GiftCardValidityMode =
    raw.validityMode === 'campaign' || raw.validityMode === 'date' || raw.validityMode === 'none'
      ? raw.validityMode
      : 'none';
  if (raw.validityMode !== validityMode) {
    issues.push({ field: 'validityMode', message: 'Validità non valida' });
  }
  if (validityMode === 'campaign' && !campaignId) {
    issues.push({ field: 'validityMode', message: 'Per scadere a fine campagna scegli una campagna' });
  }

  let validityDate: string | null = null;
  if (validityMode === 'date') {
    if (isIsoDay(raw.validityDate)) validityDate = raw.validityDate;
    else issues.push({ field: 'validityDate', message: 'Scegli una data di scadenza' });
  }

  let sellUntil: string | null = null;
  if (raw.sellUntil) {
    if (isIsoDay(raw.sellUntil)) sellUntil = raw.sellUntil;
    else issues.push({ field: 'sellUntil', message: 'Data non valida' });
  }

  if (issues.length) return { issues };
  return {
    issues,
    value: {
      name,
      description,
      title,
      line2,
      kind,
      priceCents: priceCents as number,
      items,
      theme,
      campaignId,
      validityMode,
      validityDate,
      sellUntil,
      sellOnline: raw.sellOnline === true,
      sellInStudio: raw.sellInStudio !== false,
      active: raw.active !== false,
    },
  };
}

export const GIFT_CARD_DELIVERY_HOUR = 8;
export const GIFT_CARD_MAX_DELIVERY_DAYS = 400;

/** Tipo in vendita sul sito: niente dati interni. */
export interface GiftCardShopTypeDto {
  id: string;
  name: string;
  description: string;
  title: string;
  line2: string;
  kind: GiftCardKind;
  priceCents: number;
  theme: GiftCardThemeKey;
  /** Scadenza che avrà la card se comprata adesso. */
  validUntil: string | null;
}

export interface GiftCardPaypalPublicConfig {
  enabled: boolean;
  clientId: string | null;
  environment: 'sandbox' | 'live';
  currency: 'EUR';
}

export interface GiftCardShopDto {
  types: GiftCardShopTypeDto[];
  paypal: GiftCardPaypalPublicConfig;
}

export interface GiftCardOnlineCreateInput {
  typeId: string;
  recipientName: string;
  message: string;
  /** Nome e cognome di chi compra, salvati tra i clienti. */
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;
  buyerPhone?: string;
  /** Se manca, il link del regalo arriva solo a chi compra. */
  recipientEmail?: string;
  /** Giorno (YYYY-MM-DD) in cui consegnare la card alle 08:00; assente = subito. */
  deliverOn?: string | null;
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

export interface GiftCardOnlineCreateResult {
  code: string;
  paypalOrderId: string;
  /** Serve a chi compra per confermare il pagamento; non si può recuperare. */
  buyerToken: string;
  amountCents: number;
}

export interface GiftCardOnlineCaptureResult {
  code: string;
  status: GiftCardStatus;
  duplicate: boolean;
  deliverAt: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isPlausibleEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && EMAIL_PATTERN.test(value.trim());
}
