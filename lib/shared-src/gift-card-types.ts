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
