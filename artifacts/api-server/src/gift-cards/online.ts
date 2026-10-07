import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { DateTime } from 'luxon';
import {
  GIFT_CARD_DELIVERY_HOUR,
  GIFT_CARD_MAX_DELIVERY_DAYS,
  GIFT_CARD_MESSAGE_MAX,
  GIFT_CARD_NAME_MAX,
  formatGiftCardPrice,
  isIsoDay,
  isPlausibleEmail,
  normalizeGiftCardCode,
  type GiftCardDto,
  type GiftCardOnlineCaptureResult,
  type GiftCardOnlineCreateResult,
  type GiftCardShopDto,
  type GiftCardStatus,
  type GiftCardTypeDto,
} from '@shared/gift-card-types';
import {
  PayPalApiError,
  PayPalConfigurationError,
  paypalRequestId,
  paypalValueToCents,
  type PayPalCreateOrderInput,
  type PayPalOrderResponse,
  type PayPalPublicConfig,
  type PayPalWebhookHeaders,
} from '../print-shop/paypal-orders.js';
import {
  CARDS,
  CASH,
  EVENTS,
  GiftCardHttpError,
  cardToDto,
  cleanText,
  endOfRomeDay,
  generateGiftCardCode,
  toIso,
  typeToDto,
  type GiftCardService,
} from './service.js';
import {
  giftCardReceiptEmail,
  giftCardReceiptSubject,
  giftCardRecipientEmail,
  giftCardRecipientSubject,
} from './email.js';

const ROME_ZONE = 'Europe/Rome';
const CAPTURES = 'giftCardPaymentCaptures';
const PAYMENT_EVENTS = 'giftCardPaymentEvents';
const TYPES = 'giftCardTypes';
const CLAIM_TTL_MS = 15 * 60 * 1000;
const MAIL_LOCK_MS = 2 * 60 * 1000;
const MAIL_RETRY_MS = 15 * 60 * 1000;
const MAIL_MAX_ATTEMPTS = 5;
const MAX_CODE_ATTEMPTS = 8;
const DUE_BATCH = 50;

export interface GiftCardPaypalClient {
  readonly config: { merchantId?: string };
  publicConfig(): PayPalPublicConfig;
  createOrder(input: PayPalCreateOrderInput, requestId?: string): Promise<PayPalOrderResponse>;
  captureOrder(paypalOrderId: string, requestId: string): Promise<PayPalOrderResponse>;
  getOrder(paypalOrderId: string): Promise<PayPalOrderResponse>;
}

export interface GiftCardMail {
  send(
    to: string,
    subject: string,
    html: string,
    log: { type: string; relatedDocId: string; relatedDocType: string; clientName?: string },
  ): Promise<void>;
  studio(): Promise<{ name: string; email?: string; phone?: string }>;
}

export interface GiftCardWebhookVerifier {
  verifyWebhook(headers: PayPalWebhookHeaders, event: unknown): Promise<boolean>;
}

export interface GiftCardOnlineDeps {
  db: Firestore;
  service: GiftCardService;
  paypal: GiftCardPaypalClient;
  mail: GiftCardMail;
  siteUrl: () => string;
  /** Presente solo se è stato registrato su PayPal un webhook dedicato alle gift card. */
  webhook?: GiftCardWebhookVerifier;
  now?: () => Date;
  randomCode?: () => string;
}

export interface CompletedCapture {
  paypalOrderId: string;
  captureId: string;
  amountCents: number;
  currency: string;
  feeCents: number;
  customId?: string;
  merchantId?: string;
  payerEmail?: string;
}

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

function millis(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function mapPayPalError(error: unknown): GiftCardHttpError {
  if (error instanceof GiftCardHttpError) return error;
  if (error instanceof PayPalConfigurationError) {
    return new GiftCardHttpError(503, 'paypal_not_configured', 'Il pagamento online non è ancora attivo');
  }
  if (error instanceof PayPalApiError) {
    return new GiftCardHttpError(502, 'paypal_rejected', 'PayPal non ha accettato la richiesta. Non è stato addebitato nulla.');
  }
  return new GiftCardHttpError(502, 'paypal_unavailable', 'PayPal non risponde in questo momento. Riprova tra poco.');
}

/** Estrae il pagamento completato da una risposta di PayPal (ordine o capture). */
export function extractCompletedCapture(order: PayPalOrderResponse): CompletedCapture | null {
  const unit = order.purchase_units?.[0] as any;
  const capture = (unit?.payments?.captures as any[] | undefined)?.find(item => item?.status === 'COMPLETED');
  if (!capture || typeof capture.id !== 'string') return null;
  const amountCents = paypalValueToCents(capture.amount?.value);
  if (amountCents === null) return null;
  const email = (order.payer as any)?.email_address;
  return {
    paypalOrderId: order.id,
    captureId: capture.id,
    amountCents,
    currency: String(capture.amount?.currency_code || ''),
    feeCents: paypalValueToCents(capture.seller_receivable_breakdown?.paypal_fee?.value) ?? 0,
    customId: typeof unit?.custom_id === 'string' ? unit.custom_id : undefined,
    merchantId: typeof unit?.payee?.merchant_id === 'string' ? unit.payee.merchant_id : undefined,
    payerEmail: typeof email === 'string' ? email : undefined,
  };
}

function captureFromWebhook(event: any): CompletedCapture | null {
  const resource = event?.resource;
  if (!resource || resource.status !== 'COMPLETED' || typeof resource.id !== 'string') return null;
  const orderId = resource.supplementary_data?.related_ids?.order_id;
  const amountCents = paypalValueToCents(resource.amount?.value);
  if (typeof orderId !== 'string' || amountCents === null) return null;
  return {
    paypalOrderId: orderId,
    captureId: resource.id,
    amountCents,
    currency: String(resource.amount?.currency_code || ''),
    feeCents: paypalValueToCents(resource.seller_receivable_breakdown?.paypal_fee?.value) ?? 0,
    customId: typeof resource.custom_id === 'string' ? resource.custom_id : undefined,
  };
}

function tokenMatches(card: any, token: unknown): boolean {
  if (typeof token !== 'string' || !token || typeof card?.buyerTokenHash !== 'string') return false;
  const a = Buffer.from(sha(token), 'hex');
  const b = Buffer.from(card.buyerTokenHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function longDate(date: Date): string {
  return DateTime.fromJSDate(date).setZone(ROME_ZONE).setLocale('it').toFormat('d LLLL yyyy');
}

/** Giorno di consegna scelto: `null` significa subito. */
function resolveDeliverAt(deliverOn: unknown, now: Date): Date | null {
  if (deliverOn === undefined || deliverOn === null || deliverOn === '') return null;
  if (!isIsoDay(deliverOn)) throw new GiftCardHttpError(422, 'invalid_input', 'Data di consegna non valida');
  const today = DateTime.fromJSDate(now).setZone(ROME_ZONE).startOf('day');
  const day = DateTime.fromISO(deliverOn, { zone: ROME_ZONE }).startOf('day');
  if (day < today) throw new GiftCardHttpError(422, 'delivery_in_past', 'La data di consegna è già passata');
  if (day.diff(today, 'days').days > GIFT_CARD_MAX_DELIVERY_DAYS) {
    throw new GiftCardHttpError(422, 'invalid_input', 'La data di consegna è troppo lontana');
  }
  const at = day.set({ hour: GIFT_CARD_DELIVERY_HOUR });
  return at.toMillis() <= now.getTime() ? null : at.toJSDate();
}

interface OnlineInput {
  typeId: string;
  recipientName: string;
  message: string;
  buyerName: string;
  buyerEmail: string;
  recipientEmail: string;
  deliverOn: unknown;
}

function parseOnlineInput(raw: unknown): OnlineInput {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (input.termsAccepted !== true || input.privacyAccepted !== true) {
    throw new GiftCardHttpError(400, 'legal_acceptance_required', 'Accetta le condizioni di vendita e la privacy per continuare');
  }
  const typeId = typeof input.typeId === 'string' ? input.typeId.trim() : '';
  if (!typeId || typeId.length > 200 || typeId.includes('/')) {
    throw new GiftCardHttpError(422, 'invalid_input', 'Scegli un regalo');
  }
  const buyerName = cleanText(input.buyerName, 80, 'Il tuo nome');
  if (!buyerName) throw new GiftCardHttpError(422, 'invalid_input', 'Scrivi il tuo nome');
  const buyerEmail = typeof input.buyerEmail === 'string' ? input.buyerEmail.trim().toLowerCase() : '';
  if (!isPlausibleEmail(buyerEmail)) throw new GiftCardHttpError(422, 'invalid_input', 'Scrivi un indirizzo email valido');
  const recipientEmail = typeof input.recipientEmail === 'string' ? input.recipientEmail.trim().toLowerCase() : '';
  if (recipientEmail && !isPlausibleEmail(recipientEmail)) {
    throw new GiftCardHttpError(422, 'invalid_input', 'L\'email di chi riceve non è valida');
  }
  return {
    typeId,
    recipientName: cleanText(input.recipientName, GIFT_CARD_NAME_MAX, 'Nome di chi riceve'),
    message: cleanText(input.message, GIFT_CARD_MESSAGE_MAX, 'Messaggio'),
    buyerName,
    buyerEmail,
    recipientEmail,
    deliverOn: input.deliverOn,
  };
}

export class GiftCardOnlineService {
  private readonly db: Firestore;
  private readonly now: () => Date;
  private readonly randomCode: () => string;

  constructor(private readonly deps: GiftCardOnlineDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
    this.randomCode = deps.randomCode ?? generateGiftCardCode;
  }

  // ------------------------------------------------------------ vetrina

  private isSellableOnline(type: GiftCardTypeDto, now: Date): boolean {
    if (!type.active || !type.sellOnline) return false;
    return !type.sellUntil || endOfRomeDay(type.sellUntil).getTime() > now.getTime();
  }

  async shop(): Promise<GiftCardShopDto> {
    const now = this.now();
    const types: GiftCardShopDto['types'] = [];
    for (const type of await this.deps.service.listTypes()) {
      if (!this.isSellableOnline(type, now)) continue;
      let expires: Date | null;
      try {
        expires = await this.deps.service.resolveExpiry(type, {});
      } catch {
        continue; // una campagna sparita rende il tipo non vendibile
      }
      if (expires && expires.getTime() <= now.getTime()) continue;
      types.push({
        id: type.id,
        name: type.name,
        description: type.description,
        title: type.title,
        line2: type.line2,
        kind: type.kind,
        priceCents: type.priceCents,
        theme: type.theme,
        validUntil: expires ? expires.toISOString() : null,
      });
    }
    const config = this.deps.paypal.publicConfig();
    return {
      types,
      paypal: {
        enabled: config.checkoutEnabled,
        clientId: config.checkoutEnabled ? config.clientId : null,
        environment: config.environment,
        currency: 'EUR',
      },
    };
  }

  // ------------------------------------------------------------ acquisto

  async createOrder(raw: unknown): Promise<GiftCardOnlineCreateResult> {
    if (!this.deps.paypal.publicConfig().checkoutEnabled) {
      throw new GiftCardHttpError(503, 'paypal_not_configured', 'Il pagamento online non è ancora attivo');
    }
    const input = parseOnlineInput(raw);
    const now = this.now();
    const typeSnap = await this.db.collection(TYPES).doc(input.typeId).get();
    if (!typeSnap.exists) throw new GiftCardHttpError(404, 'type_not_found', 'Questo regalo non esiste più');
    const type = typeToDto(typeSnap.id, typeSnap.data());
    if (!this.isSellableOnline(type, now)) {
      throw new GiftCardHttpError(409, 'type_not_sellable', 'Questo regalo non è più in vendita online');
    }
    const expiresAt = await this.deps.service.resolveExpiry(type, {});
    if (expiresAt && expiresAt.getTime() <= now.getTime()) {
      throw new GiftCardHttpError(409, 'type_expired', 'Questo regalo non è più acquistabile');
    }
    const deliverAt = resolveDeliverAt(input.deliverOn, now);
    if (deliverAt && expiresAt && deliverAt.getTime() >= expiresAt.getTime()) {
      throw new GiftCardHttpError(422, 'delivery_after_expiry', 'La consegna cadrebbe dopo la scadenza della card');
    }

    const buyerToken = randomBytes(24).toString('base64url');
    const timestamp = Timestamp.fromDate(now);
    let code = '';
    let created = false;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !created; attempt++) {
      const candidate = normalizeGiftCardCode(this.randomCode());
      if (!candidate) throw new Error('Generatore di codici non valido');
      const ref = this.db.collection(CARDS).doc(candidate);
      created = await this.db.runTransaction(async tx => {
        if ((await tx.get(ref)).exists) return false;
        tx.set(ref, {
          typeId: type.id,
          typeName: type.name,
          title: type.title,
          line2: type.line2,
          kind: type.kind,
          theme: type.theme,
          valueCents: type.priceCents,
          campaignId: type.campaignId,
          recipientName: input.recipientName,
          message: input.message,
          status: 'in_attesa_pagamento',
          channel: 'online',
          paymentMethod: 'paypal',
          issuedAt: timestamp,
          expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null,
          redeemedAt: null,
          bookingId: null,
          cancelledAt: null,
          cancelReason: null,
          buyerName: input.buyerName,
          buyerEmail: input.buyerEmail,
          recipientEmail: input.recipientEmail,
          buyerTokenHash: sha(buyerToken),
          deliverAt: deliverAt ? Timestamp.fromDate(deliverAt) : null,
          deliveredAt: null,
          payment: { provider: 'paypal', status: 'created', paypalOrderId: null, captureId: null },
          mail: {
            receipt: { status: 'pending', attempts: 0 },
            delivery: { status: input.recipientEmail ? 'pending' : 'not_required', attempts: 0 },
          },
          mailDueAt: null,
          mailLockAt: null,
          consents: { termsAccepted: true, privacyAccepted: true, at: timestamp },
        });
        tx.set(this.db.collection(EVENTS).doc(), {
          cardCode: candidate,
          type: 'online_created',
          at: timestamp,
          by: 'cliente',
          details: { valueCents: type.priceCents, scheduled: Boolean(deliverAt) },
        });
        return true;
      });
      if (created) code = candidate;
    }
    if (!created) throw new GiftCardHttpError(503, 'code_generation_failed', 'Impossibile generare un codice, riprova');

    const cardRef = this.db.collection(CARDS).doc(code);
    try {
      const order = await this.deps.paypal.createOrder(
        { internalOrderId: code, orderNumber: code, amountCents: type.priceCents },
        paypalRequestId('gift-card', 'create', code),
      );
      await cardRef.update({ 'payment.paypalOrderId': order.id });
      return { code, paypalOrderId: order.id, buyerToken, amountCents: type.priceCents };
    } catch (error) {
      await cardRef.update({
        status: 'annullata',
        cancelledAt: timestamp,
        cancelReason: 'Creazione dell\'ordine PayPal non riuscita',
      }).catch(() => undefined);
      throw mapPayPalError(error);
    }
  }

  private requireOnlineCard(rawCode: string): { code: string; ref: DocumentReference } {
    const code = normalizeGiftCardCode(rawCode);
    if (!code) throw new GiftCardHttpError(404, 'not_found', 'Gift card non trovata');
    return { code, ref: this.db.collection(CARDS).doc(code) };
  }

  async capture(rawCode: string, raw: unknown): Promise<GiftCardOnlineCaptureResult> {
    const { code, ref } = this.requireOnlineCard(rawCode);
    const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const snap = await ref.get();
    const card = snap.exists ? (snap.data() as any) : null;
    // Stessa risposta per codice inesistente, card non online e token errato.
    if (!card || card.channel !== 'online' || !tokenMatches(card, body.buyerToken)) {
      throw new GiftCardHttpError(404, 'not_found', 'Gift card non trovata');
    }
    const orderId: string | null = card.payment?.paypalOrderId ?? null;
    if (!orderId) throw new GiftCardHttpError(409, 'paypal_order_required', 'Pagamento non inizializzato');
    if (typeof body.paypalOrderId === 'string' && body.paypalOrderId && body.paypalOrderId !== orderId) {
      throw new GiftCardHttpError(409, 'paypal_order_mismatch', 'Ordine PayPal non corrispondente');
    }
    const result = (status: GiftCardStatus, duplicate: boolean): GiftCardOnlineCaptureResult => ({
      code,
      status,
      duplicate,
      deliverAt: toIso(card.deliverAt),
    });
    if (card.payment?.captureId) return result(card.status, true);

    // PayPal può aver già incassato prima che il browser ce lo dicesse: riallinea
    // sempre con PayPal prima di chiedere un secondo pagamento.
    if (card.status !== 'in_attesa_pagamento') {
      const reconciled = await this.reconcileWithProvider(code, orderId, 'capture');
      if (reconciled) return result(reconciled.status, true);
      throw new GiftCardHttpError(409, 'order_not_payable', 'Questa gift card non è in attesa di pagamento');
    }

    const claimNow = this.now();
    let alreadyPaid = false;
    await this.db.runTransaction(async tx => {
      const fresh = await tx.get(ref);
      const current = fresh.data() as any;
      if (current.payment?.captureId) { alreadyPaid = true; return; }
      if (current.status !== 'in_attesa_pagamento') {
        throw new GiftCardHttpError(409, 'order_not_payable', 'Questa gift card non è in attesa di pagamento');
      }
      const claimedAt = millis(current.payment?.captureClaimedAt);
      if (current.payment?.captureStatus === 'capturing' && claimedAt !== null && claimedAt > claimNow.getTime() - CLAIM_TTL_MS) {
        throw new GiftCardHttpError(409, 'capture_running', 'Pagamento già in corso, attendi un momento');
      }
      tx.set(ref, {
        ...current,
        payment: { ...current.payment, captureStatus: 'capturing', captureClaimedAt: Timestamp.fromDate(claimNow) },
      });
    });
    if (alreadyPaid) return result(card.status, true);

    let response: PayPalOrderResponse;
    try {
      response = await this.deps.paypal.captureOrder(orderId, paypalRequestId('gift-card', 'capture', code, orderId));
    } catch (error) {
      // Risposta persa o ordine già incassato: PayPal è la fonte di verità.
      const reconciled = await this.reconcileWithProvider(code, orderId, 'capture').catch(() => null);
      if (reconciled) return result(reconciled.status, true);
      await this.releaseClaim(ref);
      throw mapPayPalError(error);
    }
    const completed = extractCompletedCapture(response);
    if (!completed) {
      await this.releaseClaim(ref);
      throw new GiftCardHttpError(409, 'paypal_not_completed', 'PayPal non ha confermato il pagamento');
    }
    const outcome = await this.activate(code, completed, 'capture');
    return result(outcome.status, outcome.duplicate);
  }

  private async releaseClaim(ref: DocumentReference): Promise<void> {
    await this.db.runTransaction(async tx => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return;
      const current = fresh.data() as any;
      if (current.payment?.captureStatus !== 'capturing') return;
      tx.set(ref, { ...current, payment: { ...current.payment, captureStatus: 'released', captureClaimedAt: null } });
    }).catch(() => undefined);
  }

  /** Chiede a PayPal com'è l'ordine e, se è già pagato, attiva la card. */
  private async reconcileWithProvider(
    code: string,
    orderId: string,
    source: string,
  ): Promise<{ status: GiftCardStatus } | null> {
    const provider = await this.deps.paypal.getOrder(orderId);
    const completed = extractCompletedCapture(provider);
    if (!completed) return null;
    const outcome = await this.activate(code, completed, source);
    return { status: outcome.status };
  }

  // ----------------------------------------------------------- attivazione

  private assertCaptureMatches(card: any, code: string, capture: CompletedCapture) {
    const merchantId = this.deps.paypal.config.merchantId;
    const problems: string[] = [];
    if (capture.currency !== 'EUR') problems.push('valuta');
    if (capture.amountCents !== card.valueCents) problems.push('importo');
    if (capture.customId && capture.customId !== code) problems.push('riferimento');
    if (capture.paypalOrderId !== card.payment?.paypalOrderId) problems.push('ordine');
    if (merchantId && capture.merchantId && capture.merchantId !== merchantId) problems.push('venditore');
    if (problems.length) {
      throw new GiftCardHttpError(409, 'payment_mismatch', 'Il pagamento non corrisponde alla gift card', { problems });
    }
  }

  /** Attiva la card dopo un pagamento completato. Sicura da ripetere. */
  async activate(
    code: string,
    capture: CompletedCapture,
    source: string,
  ): Promise<{ status: GiftCardStatus; duplicate: boolean }> {
    const now = this.now();
    const ts = Timestamp.fromDate(now);
    const cardRef = this.db.collection(CARDS).doc(code);
    const captureRef = this.db.collection(CAPTURES).doc(sha(`paypal-capture:${capture.captureId}`));
    const cashRef = this.db.collection(CASH).doc(`gift_paypal_${sha(capture.captureId).slice(0, 32)}`);
    const feeRef = this.db.collection(CASH).doc(`gift_paypal_fee_${sha(capture.captureId).slice(0, 32)}`);
    let outcome: { status: GiftCardStatus; duplicate: boolean } = { status: 'attiva', duplicate: false };

    await this.db.runTransaction(async tx => {
      const [cardSnap, captureSnap] = await Promise.all([tx.get(cardRef), tx.get(captureRef)]);
      if (!cardSnap.exists) throw new GiftCardHttpError(404, 'not_found', 'Gift card non trovata');
      const card = cardSnap.data() as any;
      if (captureSnap.exists || card.payment?.captureId) {
        outcome = { status: card.status, duplicate: true };
        return;
      }
      this.assertCaptureMatches(card, code, capture);
      const wasPending = card.status === 'in_attesa_pagamento';
      const status: GiftCardStatus = wasPending ? 'attiva' : card.status;
      tx.set(cardRef, {
        ...card,
        status,
        paidAt: ts,
        payment: {
          ...card.payment,
          status: 'paid',
          captureStatus: 'completed',
          paypalOrderId: capture.paypalOrderId,
          captureId: capture.captureId,
          amountCents: capture.amountCents,
          feeCents: capture.feeCents,
          netCents: capture.amountCents - capture.feeCents,
          currency: capture.currency,
          payerEmail: capture.payerEmail ?? null,
          paidAt: ts,
        },
        // Pagamento arrivato per una card già annullata: il denaro c'è, serve una verifica a mano.
        ...(wasPending ? {} : { reviewRequired: true, reviewReason: `pagamento ricevuto con la card ${card.status}` }),
        mailDueAt: wasPending ? ts : card.mailDueAt ?? null,
      });
      tx.set(this.db.collection(EVENTS).doc(), {
        cardCode: code,
        type: 'paid_online',
        at: ts,
        by: source,
        details: { captureId: capture.captureId, amountCents: capture.amountCents, feeCents: capture.feeCents, status },
      });
      tx.set(cashRef, {
        tipo: 'entrata',
        categoria: 'Gift card',
        importo: capture.amountCents / 100,
        descrizione: `Gift card ${card.title} - ${code}`,
        data: ts,
        metodoPagamento: 'paypal',
        note: `PayPal capture ${capture.captureId}`,
        origine: 'gift_card',
        origineRef: code,
        provider: 'paypal',
        providerTransactionId: capture.captureId,
        createdAt: ts,
        updatedAt: ts,
      });
      if (capture.feeCents > 0) {
        tx.set(feeRef, {
          tipo: 'uscita',
          categoria: 'Commissioni di pagamento',
          importo: capture.feeCents / 100,
          descrizione: `Commissione PayPal gift card ${code}`,
          data: ts,
          metodoPagamento: 'paypal',
          note: `Commissione associata alla cattura PayPal ${capture.captureId}`,
          origine: 'gift_card',
          origineRef: code,
          provider: 'paypal',
          providerTransactionId: capture.captureId,
          movementRole: 'payment_fee',
          createdAt: ts,
          updatedAt: ts,
        });
      }
      tx.set(captureRef, {
        provider: 'paypal',
        captureId: capture.captureId,
        paypalOrderId: capture.paypalOrderId,
        cardCode: code,
        amountCents: capture.amountCents,
        createdAt: ts,
      });
      outcome = { status, duplicate: false };
    });

    if (!outcome.duplicate && outcome.status === 'attiva') {
      await this.processMail(code).catch(() => undefined);
    }
    return outcome;
  }

  // ----------------------------------------------------------------- email

  private async buildMailContext(code: string, card: any) {
    const studio = await this.deps.mail.studio().catch(() => ({ name: 'Image Studio Fotografico' } as { name: string; email?: string; phone?: string }));
    const expiresAt = card.expiresAt?.toDate?.() as Date | undefined;
    return {
      theme: card.theme,
      title: card.title,
      line2: card.line2 || '',
      recipientName: card.recipientName || '',
      message: card.message || '',
      buyerName: card.buyerName || '',
      code,
      giftUrl: `${this.deps.siteUrl()}/regalo/${encodeURIComponent(code)}`,
      validUntilLabel: expiresAt ? `Valida fino al ${longDate(expiresAt)}` : 'Senza scadenza',
      studioName: studio.name,
      studioPhone: studio.phone,
      studioEmail: studio.email,
    };
  }

  /**
   * Invia le email dovute per una card: ricevuta a chi compra e, quando è ora,
   * consegna a chi riceve. Un fallimento viene ritentato dal lavoro programmato.
   */
  async processMail(code: string): Promise<void> {
    const ref = this.db.collection(CARDS).doc(code);
    const now = this.now();
    const ts = Timestamp.fromDate(now);
    const card = await this.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const current = snap.data() as any;
      const lockedAt = millis(current.mailLockAt);
      if (lockedAt !== null && lockedAt > now.getTime() - MAIL_LOCK_MS) return null;
      tx.set(ref, { ...current, mailLockAt: ts });
      return current;
    });
    if (!card || card.channel !== 'online' || card.status !== 'attiva') {
      if (card) await ref.update({ mailLockAt: null }).catch(() => undefined);
      return;
    }

    const mail = {
      receipt: { status: 'pending', attempts: 0, ...(card.mail?.receipt || {}) },
      delivery: { status: 'not_required', attempts: 0, ...(card.mail?.delivery || {}) },
    } as Record<'receipt' | 'delivery', { status: string; attempts: number; sentAt?: Timestamp; lastError?: string }>;
    const context = await this.buildMailContext(code, card);
    const deliverAtMs = millis(card.deliverAt);
    const deliveryDue = deliverAtMs === null || deliverAtMs <= now.getTime();
    let deliveredAt = card.deliveredAt ?? null;

    const attempt = async (
      slot: 'receipt' | 'delivery',
      to: string,
      subject: string,
      html: string,
      type: string,
    ): Promise<boolean> => {
      try {
        await this.deps.mail.send(to, subject, html, {
          type,
          relatedDocId: code,
          relatedDocType: 'giftCards',
          clientName: card.buyerName,
        });
        mail[slot] = { status: 'sent', attempts: mail[slot].attempts + 1, sentAt: ts };
        return true;
      } catch {
        const attempts = mail[slot].attempts + 1;
        mail[slot] = {
          status: attempts >= MAIL_MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts,
          lastError: 'invio non riuscito',
        };
        return false;
      }
    };

    if (mail.receipt.status === 'pending' && card.buyerEmail) {
      await attempt(
        'receipt',
        card.buyerEmail,
        giftCardReceiptSubject(card.title),
        giftCardReceiptEmail({
          ...context,
          amountLabel: formatGiftCardPrice(card.valueCents),
          deliveryLabel: deliverAtMs !== null && !deliveryDue ? longDate(new Date(deliverAtMs)) : null,
          recipientGetsEmail: Boolean(card.recipientEmail),
        }),
        'gift_card_receipt',
      );
    }
    if (mail.delivery.status === 'pending' && deliveryDue && card.recipientEmail) {
      const sent = await attempt(
        'delivery',
        card.recipientEmail,
        giftCardRecipientSubject(card.buyerName || 'Qualcuno'),
        giftCardRecipientEmail(context),
        'gift_card_delivery',
      );
      if (sent) deliveredAt = ts;
    }

    const retryAt = Timestamp.fromMillis(now.getTime() + MAIL_RETRY_MS);
    let next: Timestamp | null = null;
    const earliest = (candidate: Timestamp) => {
      if (!next || candidate.toMillis() < next.toMillis()) next = candidate;
    };
    if (mail.receipt.status === 'pending') earliest(retryAt);
    if (mail.delivery.status === 'pending') {
      earliest(deliveryDue ? retryAt : Timestamp.fromMillis(deliverAtMs as number));
    }
    await ref.update({ mail, deliveredAt, mailDueAt: next, mailLockAt: null, updatedAt: ts });
  }

  /** Lavoro programmato: invia le email scadute (consegne di Natale comprese). */
  async processDueDeliveries(limit = DUE_BATCH): Promise<{ processed: number }> {
    const now = this.now();
    const snapshot = await this.db
      .collection(CARDS)
      .where('mailDueAt', '<=', Timestamp.fromDate(now))
      .limit(limit)
      .get();
    let processed = 0;
    for (const doc of snapshot.docs) {
      const due = millis((doc.data() as any).mailDueAt);
      if (due === null || due > now.getTime()) continue;
      await this.processMail(doc.id).catch(() => undefined);
      processed++;
    }
    return { processed };
  }

  // ------------------------------------------------------------ strumenti admin

  /** Verifica con PayPal una card online rimasta in attesa e la attiva se è pagata. */
  async reconcile(rawCode: string, adminEmail: string): Promise<GiftCardDto> {
    const { code, ref } = this.requireOnlineCard(rawCode);
    const snap = await ref.get();
    const card = snap.exists ? (snap.data() as any) : null;
    if (!card || card.channel !== 'online') throw new GiftCardHttpError(404, 'not_found', 'Gift card online non trovata');
    const orderId = card.payment?.paypalOrderId;
    if (!orderId) throw new GiftCardHttpError(409, 'paypal_order_required', 'Questa card non ha un ordine PayPal');
    try {
      await this.reconcileWithProvider(code, orderId, `admin:${adminEmail}`);
    } catch (error) {
      throw mapPayPalError(error);
    }
    const fresh = await ref.get();
    return cardToDto(code, fresh.data(), this.now());
  }

  async resend(rawCode: string, target: 'buyer' | 'recipient', adminEmail: string): Promise<GiftCardDto> {
    const { code, ref } = this.requireOnlineCard(rawCode);
    const snap = await ref.get();
    const card = snap.exists ? (snap.data() as any) : null;
    if (!card || card.channel !== 'online') throw new GiftCardHttpError(404, 'not_found', 'Gift card online non trovata');
    if (card.status !== 'attiva') throw new GiftCardHttpError(409, 'not_active', 'La card non è attiva');
    if (target === 'recipient' && !card.recipientEmail) {
      throw new GiftCardHttpError(409, 'no_recipient_email', 'Non c\'è un\'email di chi riceve');
    }
    const ts = Timestamp.fromDate(this.now());
    await ref.update({
      [target === 'buyer' ? 'mail.receipt' : 'mail.delivery']: { status: 'pending', attempts: 0 },
      ...(target === 'recipient' ? { deliverAt: null } : {}),
      mailLockAt: null,
    });
    await this.db.collection(EVENTS).doc().set({ cardCode: code, type: 'mail_resent', at: ts, by: adminEmail, details: { target } });
    await this.processMail(code);
    const fresh = await ref.get();
    return cardToDto(code, fresh.data(), this.now());
  }

  // -------------------------------------------------------------- webhook

  isWebhookEnabled(): boolean {
    return Boolean(this.deps.webhook);
  }

  async webhook(headers: PayPalWebhookHeaders, event: any): Promise<Record<string, unknown>> {
    if (!this.deps.webhook) {
      throw new GiftCardHttpError(503, 'webhook_not_configured', 'Webhook gift card non configurato');
    }
    let verified = false;
    try {
      verified = await this.deps.webhook.verifyWebhook(headers, event);
    } catch (error) {
      throw mapPayPalError(error);
    }
    if (!verified) throw new GiftCardHttpError(401, 'invalid_webhook_signature', 'Firma webhook PayPal non valida');

    const eventId = typeof event?.id === 'string' ? event.id.slice(0, 160) : '';
    const eventType = typeof event?.event_type === 'string' ? event.event_type.slice(0, 160) : '';
    if (!eventId || !eventType) throw new GiftCardHttpError(400, 'invalid_webhook', 'Evento PayPal non valido');
    const eventRef = this.db.collection(PAYMENT_EVENTS).doc(sha(`paypal-event:${eventId}`));
    if ((await eventRef.get()).exists) return { ok: true, duplicate: true };
    const record = (status: string) =>
      eventRef.set({ provider: 'paypal', providerEventId: eventId, type: eventType, status, processedAt: Timestamp.fromDate(this.now()) });

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const capture = captureFromWebhook(event);
      const code = normalizeGiftCardCode(capture?.customId);
      if (!capture || !code) { await record('ignored'); return { ok: true, ignored: true }; }
      const snap = await this.db.collection(CARDS).doc(code).get();
      const card = snap.exists ? (snap.data() as any) : null;
      if (!card || card.channel !== 'online' || card.payment?.paypalOrderId !== capture.paypalOrderId) {
        await record('ignored_unknown_order');
        return { ok: true, ignored: true };
      }
      const outcome = await this.activate(code, capture, 'webhook');
      await record(outcome.duplicate ? 'processed_duplicate' : 'processed');
      return { ok: true, code };
    }

    if (eventType === 'PAYMENT.CAPTURE.REFUNDED' || eventType === 'PAYMENT.CAPTURE.REVERSED') {
      const resource = event?.resource || {};
      let code = normalizeGiftCardCode(resource.custom_id);
      if (!code) {
        const captureId = resource.supplementary_data?.related_ids?.capture_id || resource.parent_payment;
        if (typeof captureId === 'string' && captureId) {
          const found = await this.db.collection(CARDS).where('payment.captureId', '==', captureId).limit(1).get();
          code = found.docs[0]?.id ?? null;
        }
      }
      const snap = code ? await this.db.collection(CARDS).doc(code).get() : null;
      const card = snap?.exists ? (snap.data() as any) : null;
      if (!code || !card || card.channel !== 'online') { await record('ignored_unknown_order'); return { ok: true, ignored: true }; }
      const ts = Timestamp.fromDate(this.now());
      await this.db.runTransaction(async tx => {
        const fresh = await tx.get(this.db.collection(CARDS).doc(code as string));
        const current = fresh.data() as any;
        tx.set(this.db.collection(CARDS).doc(code as string), {
          ...current,
          ...(current.status === 'attiva' || current.status === 'in_attesa_pagamento'
            ? { status: 'annullata', cancelledAt: ts, cancelReason: 'Rimborso PayPal' }
            : {}),
          reviewRequired: true,
          reviewReason: 'rimborso PayPal: controlla la cassa',
        });
        tx.set(this.db.collection(EVENTS).doc(), {
          cardCode: code, type: 'refunded', at: ts, by: 'paypal', details: { eventType },
        });
      });
      await record('processed');
      return { ok: true, code };
    }

    await record('ignored_event_type');
    return { ok: true, ignored: true };
  }
}
