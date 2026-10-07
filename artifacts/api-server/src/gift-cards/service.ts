import { randomInt } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { DateTime } from 'luxon';
import { upsertGiftCustomer } from './customers.js';
import {
  GIFT_CARD_CODE_ALPHABET,
  GIFT_CARD_CODE_LENGTH,
  GIFT_CARD_MESSAGE_MAX,
  GIFT_CARD_NAME_MAX,
  effectiveGiftCardStatus,
  isIsoDay,
  isPlausibleEmail,
  normalizeGiftCardCode,
  validateGiftCardTypeInput,
  type GiftCardCampaignState,
  type GiftCardItemDto,
  type GiftCardItemInput,
  type GiftCardChannel,
  type GiftCardDto,
  type GiftCardPaymentMethod,
  type GiftCardPublicDto,
  type GiftCardSellInput,
  type GiftCardStatus,
  type GiftCardThemeKey,
  type GiftCardTypeDto,
} from '@shared/gift-card-types';

const ROME_ZONE = 'Europe/Rome';
export const TYPES = 'giftCardTypes';
export const CARDS = 'giftCards';
export const EVENTS = 'giftCardEvents';
export const CASH = 'cashMovements';
export const CAMPAIGNS = 'booking_campaigns';
export const PRODUCTS = 'products';
const MAX_CODE_ATTEMPTS = 8;
const LIST_LIMIT = 1000;
const PAYMENT_METHODS: readonly GiftCardPaymentMethod[] = ['contante', 'carta', 'bonifico', 'paypal', 'altro'];

export class GiftCardHttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'GiftCardHttpError';
  }
}

export interface GiftCardServiceDeps {
  db: Firestore;
  now?: () => Date;
  randomCode?: () => string;
}

export function generateGiftCardCode(): string {
  let compact = '';
  for (let index = 0; index < GIFT_CARD_CODE_LENGTH; index++) {
    compact += GIFT_CARD_CODE_ALPHABET[randomInt(GIFT_CARD_CODE_ALPHABET.length)];
  }
  return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`;
}

export function toIso(value: any): string | null {
  if (!value) return null;
  const date: Date | null =
    typeof value.toDate === 'function' ? value.toDate() : value instanceof Date ? value : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

/** Fine giornata (Europe/Rome) per una data YYYY-MM-DD. */
export function endOfRomeDay(isoDay: string): Date {
  return DateTime.fromISO(isoDay, { zone: ROME_ZONE }).endOf('day').toJSDate();
}

export function cleanText(value: unknown, max: number, field: string): string {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (text.length > max) {
    throw new GiftCardHttpError(422, 'invalid_input', `${field}: massimo ${max} caratteri`);
  }
  return text;
}

export function typeToDto(id: string, data: any): GiftCardTypeDto {
  return {
    id,
    name: data.name,
    description: data.description || '',
    title: data.title,
    line2: data.line2 || '',
    kind: data.kind,
    priceCents: data.priceCents,
    items: Array.isArray(data.items)
      ? data.items.map((item: any) => ({ productId: String(item.productId), quantity: Number(item.quantity) || 1 }))
      : [],
    theme: data.theme,
    campaignId: data.campaignId ?? null,
    validityMode: data.validityMode,
    validityDate: data.validityDate ?? null,
    sellUntil: data.sellUntil ?? null,
    sellOnline: data.sellOnline === true,
    sellInStudio: data.sellInStudio !== false,
    active: data.active !== false,
    createdAt: toIso(data.createdAt) ?? undefined,
    updatedAt: toIso(data.updatedAt) ?? undefined,
  };
}

/** Prodotto incluso, fotografato alla vendita (può non esistere più nel catalogo). */
export interface GiftCardItemSnapshot extends GiftCardItemInput {
  name: string;
  description: string;
  imageUrls: string[];
}

function imageList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((url): url is string => typeof url === 'string' && url.length > 0).slice(0, 6)
    : [];
}

/** Legge i prodotti del catalogo e ne salva nome, descrizione e foto: mai il prezzo. */
export async function snapshotItems(db: Firestore, items: readonly GiftCardItemInput[]): Promise<GiftCardItemSnapshot[]> {
  return Promise.all(
    items.map(async item => {
      const snap = await db.collection(PRODUCTS).doc(item.productId).get();
      if (!snap.exists) {
        throw new GiftCardHttpError(422, 'product_not_found', 'Uno dei prodotti scelti non esiste più nel catalogo');
      }
      const product = snap.data() as any;
      return {
        productId: item.productId,
        quantity: item.quantity,
        name: String(product.nome || ''),
        description: String(product.descrizione || ''),
        imageUrls: imageList(product.immagini),
      };
    }),
  );
}

export function cardToDto(code: string, data: any, now: Date): GiftCardDto {
  const expiresAt = toIso(data.expiresAt);
  const status = data.status as GiftCardStatus;
  return {
    code,
    typeId: data.typeId,
    typeName: data.typeName,
    title: data.title,
    line2: data.line2 || '',
    kind: data.kind,
    theme: data.theme as GiftCardThemeKey,
    valueCents: data.valueCents,
    recipientName: data.recipientName || '',
    message: data.message || '',
    status,
    effectiveStatus: effectiveGiftCardStatus({ status, expiresAt }, now),
    channel: data.channel as GiftCardChannel,
    paymentMethod: data.paymentMethod as GiftCardPaymentMethod,
    campaignId: data.campaignId ?? null,
    issuedAt: toIso(data.issuedAt) ?? '',
    expiresAt,
    redeemedAt: toIso(data.redeemedAt),
    bookingId: data.bookingId ?? null,
    cancelledAt: toIso(data.cancelledAt),
    cancelReason: data.cancelReason ?? null,
    buyerName: data.buyerName || '',
    buyerEmail: data.buyerEmail || '',
    recipientEmail: data.recipientEmail || '',
    deliverAt: toIso(data.deliverAt),
    deliveredAt: toIso(data.deliveredAt),
    reviewRequired: data.reviewRequired === true,
    reviewReason: data.reviewReason ?? null,
  };
}

export class GiftCardService {
  private readonly db: Firestore;
  private readonly now: () => Date;
  private readonly randomCode: () => string;

  constructor(deps: GiftCardServiceDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
    this.randomCode = deps.randomCode ?? generateGiftCardCode;
  }

  // ---------------------------------------------------------------- tipi

  async listTypes(): Promise<GiftCardTypeDto[]> {
    const snapshot = await this.db.collection(TYPES).get();
    return snapshot.docs
      .map(doc => typeToDto(doc.id, doc.data()))
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.name.localeCompare(b.name));
  }

  async saveType(id: string | null, raw: unknown, adminEmail: string): Promise<GiftCardTypeDto> {
    const { value, issues } = validateGiftCardTypeInput((raw ?? {}) as any);
    if (!value) {
      throw new GiftCardHttpError(422, 'invalid_input', 'Dati del tipo di gift card non validi', issues);
    }
    if (value.campaignId) {
      const campaign = await this.db.collection(CAMPAIGNS).doc(value.campaignId).get();
      if (!campaign.exists) {
        throw new GiftCardHttpError(422, 'campaign_not_found', 'La campagna scelta non esiste');
      }
    }
    await snapshotItems(this.db, value.items);
    const timestamp = Timestamp.fromDate(this.now());
    if (!id) {
      const ref = this.db.collection(TYPES).doc();
      const data = { ...value, createdAt: timestamp, updatedAt: timestamp, createdBy: adminEmail };
      await ref.set(data);
      return typeToDto(ref.id, data);
    }
    const ref = this.db.collection(TYPES).doc(id);
    const existing = await ref.get();
    if (!existing.exists) {
      throw new GiftCardHttpError(404, 'type_not_found', 'Tipo di gift card non trovato');
    }
    const data = { ...existing.data(), ...value, updatedAt: timestamp, updatedBy: adminEmail };
    await ref.set(data);
    return typeToDto(ref.id, data);
  }

  // -------------------------------------------------------------- vendita

  async resolveExpiry(
    type: GiftCardTypeDto,
    input: Pick<GiftCardSellInput, 'noExpiry' | 'expiresOn'>,
  ): Promise<Date | null> {
    if (input.noExpiry) return null;
    if (input.expiresOn) {
      if (!isIsoDay(input.expiresOn)) {
        throw new GiftCardHttpError(422, 'invalid_input', 'Data di scadenza non valida');
      }
      return endOfRomeDay(input.expiresOn);
    }
    if (type.validityMode === 'none') return null;
    if (type.validityMode === 'date' && type.validityDate) return endOfRomeDay(type.validityDate);
    if (type.validityMode === 'campaign' && type.campaignId) {
      const campaign = await this.db.collection(CAMPAIGNS).doc(type.campaignId).get();
      const end = campaign.exists ? (campaign.data() as any)?.dataFine : null;
      if (!end || typeof end.toDate !== 'function') {
        throw new GiftCardHttpError(
          409,
          'campaign_not_found',
          'La campagna collegata non esiste più: scegli una data di scadenza',
        );
      }
      return end.toDate();
    }
    return null;
  }

  async sell(raw: GiftCardSellInput, adminEmail: string): Promise<GiftCardDto> {
    const paymentMethod = raw.paymentMethod;
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      throw new GiftCardHttpError(422, 'invalid_input', 'Metodo di pagamento non valido');
    }
    const recipientName = cleanText(raw.recipientName, GIFT_CARD_NAME_MAX, 'Nome');
    const message = cleanText(raw.message, GIFT_CARD_MESSAGE_MAX, 'Messaggio');

    const typeSnap = await this.db.collection(TYPES).doc(String(raw.typeId || '_')).get();
    if (!typeSnap.exists) {
      throw new GiftCardHttpError(404, 'type_not_found', 'Tipo di gift card non trovato');
    }
    const type = typeToDto(typeSnap.id, typeSnap.data());
    if (!type.active || !type.sellInStudio) {
      throw new GiftCardHttpError(409, 'type_not_sellable', 'Questo tipo non è in vendita in studio');
    }

    const now = this.now();
    const expiresAt = await this.resolveExpiry(type, raw);
    if (expiresAt && expiresAt.getTime() <= now.getTime()) {
      throw new GiftCardHttpError(422, 'expiry_in_past', 'La scadenza è già passata');
    }

    const buyerInput = raw.buyer ?? {};
    const buyerEmail = typeof buyerInput.email === 'string' ? buyerInput.email.trim().toLowerCase() : '';
    const buyerFirstName = cleanText(buyerInput.firstName, 60, 'Nome di chi compra');
    const buyerLastName = cleanText(buyerInput.lastName, 60, 'Cognome di chi compra');
    const buyerPhone = cleanText(buyerInput.phone, 30, 'Telefono');
    let buyerClienteId: string | null = null;
    if (buyerEmail) {
      if (!isPlausibleEmail(buyerEmail)) {
        throw new GiftCardHttpError(422, 'invalid_input', 'L\'email di chi compra non è valida');
      }
      if (!buyerFirstName || !buyerLastName) {
        throw new GiftCardHttpError(422, 'invalid_input', 'Per salvare il cliente servono nome, cognome ed email');
      }
      buyerClienteId = await upsertGiftCustomer(
        this.db,
        { firstName: buyerFirstName, lastName: buyerLastName, email: buyerEmail, phone: buyerPhone },
        now,
      );
    }
    const awaitingPayment = paymentMethod === 'bonifico';
    const status: GiftCardStatus = awaitingPayment ? 'in_attesa_pagamento' : 'attiva';
    const timestamp = Timestamp.fromDate(now);
    const items = await snapshotItems(this.db, type.items);

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = normalizeGiftCardCode(this.randomCode());
      if (!code) throw new Error('Generatore di codici non valido');
      const cardRef = this.db.collection(CARDS).doc(code);
      const stored = await this.db.runTransaction(async tx => {
        const existing = await tx.get(cardRef);
        if (existing.exists) return null;
        const card = {
          typeId: type.id,
          typeName: type.name,
          title: type.title,
          line2: type.line2,
          kind: type.kind,
          theme: type.theme,
          valueCents: type.priceCents,
          campaignId: type.campaignId,
          includes: type.description,
          items,
          ...(buyerEmail
            ? {
                buyerName: `${buyerFirstName} ${buyerLastName}`,
                buyerFirstName,
                buyerLastName,
                buyerEmail,
                buyerPhone,
                buyerClienteId,
              }
            : {}),
          recipientName,
          message,
          status,
          channel: 'studio',
          paymentMethod,
          issuedAt: timestamp,
          expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null,
          redeemedAt: null,
          bookingId: null,
          cancelledAt: null,
          cancelReason: null,
          soldBy: adminEmail,
        };
        tx.set(cardRef, card);
        tx.set(this.db.collection(EVENTS).doc(), {
          cardCode: code,
          type: 'sold',
          at: timestamp,
          by: adminEmail,
          details: { status, paymentMethod, valueCents: type.priceCents },
        });
        if (!awaitingPayment) {
          tx.set(this.db.collection(CASH).doc(), this.cashMovement(code, card, timestamp));
        }
        return card;
      });
      if (stored) return cardToDto(code, stored, now);
    }
    throw new GiftCardHttpError(503, 'code_generation_failed', 'Impossibile generare un codice, riprova');
  }

  private cashMovement(code: string, card: any, at: Timestamp) {
    return {
      tipo: 'entrata',
      categoria: 'Gift card',
      importo: card.valueCents / 100,
      descrizione: `Gift card ${card.title} - ${code}`,
      data: at,
      metodoPagamento: card.paymentMethod,
      note: `Vendita gift card ${code}`,
      origine: 'gift_card',
      origineRef: code,
      ...(card.buyerClienteId ? { clienteId: card.buyerClienteId, nomeCliente: card.buyerName } : {}),
      createdAt: at,
      updatedAt: at,
    };
  }

  async confirmPayment(rawCode: string, adminEmail: string): Promise<GiftCardDto> {
    const code = this.requireCode(rawCode);
    const now = this.now();
    const timestamp = Timestamp.fromDate(now);
    const ref = this.db.collection(CARDS).doc(code);
    const updated = await this.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new GiftCardHttpError(404, 'not_found', 'Gift card non trovata');
      const card = snap.data() as any;
      if (card.status !== 'in_attesa_pagamento') {
        throw new GiftCardHttpError(409, 'not_awaiting_payment', 'La card non è in attesa di pagamento');
      }
      const next = { ...card, status: 'attiva', paidAt: timestamp };
      tx.set(ref, next);
      tx.set(this.db.collection(EVENTS).doc(), {
        cardCode: code,
        type: 'payment_confirmed',
        at: timestamp,
        by: adminEmail,
        details: { paymentMethod: card.paymentMethod },
      });
      tx.set(this.db.collection(CASH).doc(), this.cashMovement(code, card, timestamp));
      return next;
    });
    return cardToDto(code, updated, now);
  }

  // ------------------------------------------------------------- gestione

  async list(options: { status?: GiftCardStatus } = {}): Promise<GiftCardDto[]> {
    const now = this.now();
    const snapshot = await this.db.collection(CARDS).limit(LIST_LIMIT).get();
    return snapshot.docs
      .map(doc => cardToDto(doc.id, doc.data(), now))
      .filter(card => !options.status || card.effectiveStatus === options.status)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }

  async get(rawCode: string): Promise<GiftCardDto> {
    const code = this.requireCode(rawCode);
    const snap = await this.db.collection(CARDS).doc(code).get();
    if (!snap.exists) throw new GiftCardHttpError(404, 'not_found', 'Gift card non trovata');
    return cardToDto(code, snap.data(), this.now());
  }

  async cancel(rawCode: string, reason: unknown, adminEmail: string): Promise<GiftCardDto> {
    const code = this.requireCode(rawCode);
    const text = cleanText(reason, 200, 'Motivo');
    if (!text) throw new GiftCardHttpError(422, 'invalid_input', 'Indica il motivo dell\'annullamento');
    const now = this.now();
    const timestamp = Timestamp.fromDate(now);
    const ref = this.db.collection(CARDS).doc(code);
    const updated = await this.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new GiftCardHttpError(404, 'not_found', 'Gift card non trovata');
      const card = snap.data() as any;
      if (card.status !== 'attiva' && card.status !== 'in_attesa_pagamento') {
        throw new GiftCardHttpError(409, 'not_cancellable', 'Questa card non si può annullare');
      }
      const next = { ...card, status: 'annullata', cancelledAt: timestamp, cancelReason: text };
      tx.set(ref, next);
      tx.set(this.db.collection(EVENTS).doc(), {
        cardCode: code,
        type: 'cancelled',
        at: timestamp,
        by: adminEmail,
        details: { reason: text, previousStatus: card.status },
      });
      return next;
    });
    return cardToDto(code, updated, now);
  }

  /** Sposta la scadenza di una card (o la toglie con `null`). */
  async setExpiry(rawCode: string, expiresOn: string | null, adminEmail: string): Promise<GiftCardDto> {
    const code = this.requireCode(rawCode);
    if (expiresOn !== null && !isIsoDay(expiresOn)) {
      throw new GiftCardHttpError(422, 'invalid_input', 'Data di scadenza non valida');
    }
    const expiresAt = expiresOn ? endOfRomeDay(expiresOn) : null;
    const now = this.now();
    if (expiresAt && expiresAt.getTime() <= now.getTime()) {
      throw new GiftCardHttpError(422, 'expiry_in_past', 'La nuova scadenza è già passata');
    }
    const timestamp = Timestamp.fromDate(now);
    const ref = this.db.collection(CARDS).doc(code);
    const updated = await this.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new GiftCardHttpError(404, 'not_found', 'Gift card non trovata');
      const card = snap.data() as any;
      if (card.status !== 'attiva' && card.status !== 'in_attesa_pagamento') {
        throw new GiftCardHttpError(409, 'not_extendable', 'La scadenza di questa card non si può cambiare');
      }
      const next = { ...card, expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null };
      tx.set(ref, next);
      tx.set(this.db.collection(EVENTS).doc(), {
        cardCode: code,
        type: 'expiry_changed',
        at: timestamp,
        by: adminEmail,
        details: { from: toIso(card.expiresAt), to: expiresAt ? expiresAt.toISOString() : null },
      });
      return next;
    });
    return cardToDto(code, updated, now);
  }

  // ------------------------------------------------------ riscatto in prenotazione

  /**
   * Prenota l'uso della card per una prenotazione: passa a «riscattata» in modo
   * atomico, così due richieste insieme non possono usare lo stesso codice.
   */
  async claimForBooking(
    rawCode: string,
    campaignId: string,
  ): Promise<{ code: string; title: string; typeName: string; valueCents: number }> {
    const code = normalizeGiftCardCode(rawCode);
    if (!code) throw new GiftCardHttpError(404, 'gift_card_not_found', 'Gift card non trovata');
    const ref = this.db.collection(CARDS).doc(code);
    const now = this.now();
    const ts = Timestamp.fromDate(now);
    return this.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new GiftCardHttpError(404, 'gift_card_not_found', 'Gift card non trovata');
      const card = snap.data() as any;
      const state = effectiveGiftCardStatus({ status: card.status, expiresAt: toIso(card.expiresAt) }, now);
      const messages: Partial<Record<GiftCardStatus, string>> = {
        in_attesa_pagamento: 'Questa gift card non è ancora attiva',
        riscattata: 'Questa gift card è già stata usata',
        scaduta: 'Questa gift card è scaduta',
        annullata: 'Questa gift card non è più valida',
      };
      if (state !== 'attiva') {
        throw new GiftCardHttpError(409, 'gift_card_unusable', messages[state] ?? 'Gift card non utilizzabile');
      }
      if (card.campaignId && card.campaignId !== campaignId) {
        throw new GiftCardHttpError(409, 'gift_card_campaign_mismatch', 'Questa gift card vale per un\'altra campagna');
      }
      tx.set(ref, { ...card, status: 'riscattata', redeemedAt: ts });
      tx.set(this.db.collection(EVENTS).doc(), {
        cardCode: code, type: 'redeem_claimed', at: ts, by: 'prenotazione', details: { campaignId },
      });
      return { code, title: card.title, typeName: card.typeName, valueCents: card.valueCents };
    });
  }

  /** Annulla l'uso prenotato quando la prenotazione non è stata creata. */
  async releaseClaim(rawCode: string): Promise<void> {
    const code = normalizeGiftCardCode(rawCode);
    if (!code) return;
    const ref = this.db.collection(CARDS).doc(code);
    const ts = Timestamp.fromDate(this.now());
    await this.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const card = snap.data() as any;
      if (card.status !== 'riscattata' || card.bookingId) return;
      tx.set(ref, { ...card, status: 'attiva', redeemedAt: null });
      tx.set(this.db.collection(EVENTS).doc(), { cardCode: code, type: 'redeem_released', at: ts, by: 'prenotazione', details: {} });
    });
  }

  /**
   * Collega la card alla prenotazione e porta con sé anche gli incassi: i
   * movimenti di cassa della vendita ricevono prenotazione e campagna, così la
   * dashboard finanziaria li attribuisce alla campagna senza doppi conteggi.
   */
  async attachBooking(
    rawCode: string,
    booking: { id: string; campaignId: string; campaignTheme?: string | null },
  ): Promise<void> {
    const code = normalizeGiftCardCode(rawCode);
    if (!code) return;
    const ts = Timestamp.fromDate(this.now());
    await this.db.collection(CARDS).doc(code).update({ bookingId: booking.id });
    await this.db.collection(EVENTS).doc().set({
      cardCode: code, type: 'redeemed', at: ts, by: 'prenotazione', details: { bookingId: booking.id, campaignId: booking.campaignId },
    });
    const movements = await this.db.collection(CASH).where('origineRef', '==', code).get();
    for (const doc of movements.docs) {
      if ((doc.data() as any).origine !== 'gift_card') continue;
      await doc.ref.update({
        bookingId: booking.id,
        campaignId: booking.campaignId,
        ...(booking.campaignTheme ? { origineTema: booking.campaignTheme } : {}),
        updatedAt: ts,
      });
    }
  }

  // -------------------------------------------------------------- pubblico

  async getPublic(rawCode: string): Promise<GiftCardPublicDto> {
    const code = normalizeGiftCardCode(rawCode);
    // Stessa risposta per codici malformati e inesistenti: niente indizi.
    if (!code) throw new GiftCardHttpError(404, 'not_found', 'Gift card non trovata');
    const snap = await this.db.collection(CARDS).doc(code).get();
    if (!snap.exists) throw new GiftCardHttpError(404, 'not_found', 'Gift card non trovata');
    const card = snap.data() as any;
    const now = this.now();
    const expiresAt = toIso(card.expiresAt);
    return {
      code,
      status: effectiveGiftCardStatus({ status: card.status, expiresAt }, now),
      theme: card.theme,
      title: card.title,
      line2: card.line2 || '',
      recipientName: card.recipientName || '',
      message: card.message || '',
      validUntil: expiresAt,
      includes: typeof card.includes === 'string' ? card.includes : '',
      items: await this.publicItems(card.items),
      campaign: card.campaignId ? await this.publicCampaign(card.campaignId, now) : null,
    };
  }

  /** Prodotti inclusi per chi riceve: dati aggiornati dal catalogo, o quelli della vendita se il prodotto non c'è più. */
  private async publicItems(stored: unknown): Promise<GiftCardItemDto[]> {
    if (!Array.isArray(stored)) return [];
    return Promise.all(
      stored.map(async (item: any): Promise<GiftCardItemDto> => {
        const fallback: GiftCardItemDto = {
          productId: String(item.productId),
          quantity: Number(item.quantity) || 1,
          name: String(item.name || ''),
          description: String(item.description || ''),
          imageUrls: imageList(item.imageUrls),
        };
        try {
          const snap = await this.db.collection(PRODUCTS).doc(fallback.productId).get();
          const product = snap.exists ? (snap.data() as any) : null;
          if (!product || product.attivo === false) return fallback;
          return {
            ...fallback,
            name: String(product.nome || fallback.name),
            description: String(product.descrizione || fallback.description),
            imageUrls: imageList(product.immagini).length ? imageList(product.immagini) : fallback.imageUrls,
          };
        } catch {
          return fallback;
        }
      }),
    );
  }

  private async publicCampaign(campaignId: string, now: Date): Promise<GiftCardPublicDto['campaign']> {
    const snap = await this.db.collection(CAMPAIGNS).doc(campaignId).get();
    if (!snap.exists) return null;
    const campaign = snap.data() as any;
    const opensAt = toIso(campaign.dataInizio);
    const closesAt = toIso(campaign.dataFine);
    let state: GiftCardCampaignState = 'open';
    if (campaign.attiva === false || (closesAt && new Date(closesAt).getTime() < now.getTime())) {
      state = 'closed';
    } else if (opensAt && new Date(opensAt).getTime() > now.getTime()) {
      state = 'upcoming';
    }
    return {
      name: String(campaign.nome || ''),
      bookingCode: typeof campaign.code === 'string' ? campaign.code : null,
      state,
      opensAt,
      closesAt,
    };
  }

  requireCode(raw: string): string {
    const code = normalizeGiftCardCode(raw);
    if (!code) throw new GiftCardHttpError(422, 'invalid_code', 'Codice non valido');
    return code;
  }
}
