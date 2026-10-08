import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import {
  SHOP_CURRENCY,
  SHOP_ORDER_TYPE,
  isShopOrderingOpen,
  shopPhotosMissing,
  type ShopOrderLineDto,
} from '@shared/shop-types';
import { SHOP_LEGAL_MANIFEST } from '@shared/shop-legal';
import {
  normalizeBillingDetails,
  normalizePostalAddress,
} from '../commerce/checkout-input.js';
import { CommerceHttpError } from '../commerce/errors.js';
import { captureFromWebhook, extractCompletedCapture, type CompletedCapture } from '../commerce/paypal-capture.js';
import { centsToEuros, cleanText, hashId, splitCustomerName, stableStringify, timestampMillis } from '../commerce/text.js';
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
import { SHOP_ASSETS, assertEditable, cancelledRetention, draftRetention, fulfillmentStatus, isPaid } from './order-model.js';
import type { ShopIdentity, ShopOrderService } from './orders.js';
import { buildQuote, priceLines } from './quote.js';
import type { ShopService } from './service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYPAL_ORDER_TTL_MS = 55 * 60 * 1000;
const CAPTURE_CLAIM_MS = 15 * 60 * 1000;

export interface ShopPaypalClient {
  readonly config: { merchantId?: string };
  publicConfig(): PayPalPublicConfig;
  createOrder(input: PayPalCreateOrderInput, requestId?: string): Promise<PayPalOrderResponse>;
  captureOrder(paypalOrderId: string, requestId: string): Promise<PayPalOrderResponse>;
  getOrder(paypalOrderId: string): Promise<PayPalOrderResponse>;
  verifyWebhook(headers: PayPalWebhookHeaders, event: unknown): Promise<boolean>;
}

/** Cose da fare dopo che un pagamento è stato registrato (email al cliente e allo studio). */
export interface ShopPaymentHooks {
  onPaid?(orderId: string, info: { photosMissing: number; needsReconciliation: boolean }): Promise<void>;
  onRefunded?(orderId: string, info: { full: boolean; cancelled: boolean }): Promise<void>;
}

export interface ShopPaymentDeps {
  db: any;
  paypal: ShopPaypalClient;
  orders: Pick<ShopOrderService, 'requireOwnerOrder'>;
  shop: ShopService;
  /** Dati dello studio, salvati come prova del venditore al momento dell'accettazione. */
  studio: () => Promise<{ name: string; email?: string; phone?: string; address?: string }>;
  hooks?: ShopPaymentHooks;
  now?: () => Date;
}

function mapPayPalError(error: unknown): CommerceHttpError {
  if (error instanceof CommerceHttpError) return error;
  if (error instanceof PayPalConfigurationError) {
    return new CommerceHttpError(503, 'paypal_not_configured', 'Il pagamento online non è ancora attivo');
  }
  if (error instanceof PayPalApiError) {
    return new CommerceHttpError(
      error.status >= 400 && error.status < 500 ? 409 : 502,
      'paypal_error',
      'PayPal non ha completato l’operazione. Non è stato addebitato nulla.',
      error.details,
    );
  }
  return new CommerceHttpError(502, 'paypal_error', 'PayPal temporaneamente non disponibile');
}

function validateCaptureAgainstOrder(orderId: string, order: any, capture: CompletedCapture, expectedMerchantId?: string): void {
  if (
    capture.status.toUpperCase() !== 'COMPLETED' ||
    capture.paypalOrderId !== order.payment?.paypalOrderId ||
    capture.amountCents !== Number(order.totals?.totalCents) ||
    capture.currency !== SHOP_CURRENCY ||
    (capture.customId && capture.customId !== orderId) ||
    (capture.invoiceId && capture.invoiceId !== (order.payment?.invoiceId || order.orderNumber)) ||
    (expectedMerchantId && capture.merchantId !== expectedMerchantId)
  ) {
    throw new CommerceHttpError(409, 'paypal_capture_mismatch', 'Il pagamento PayPal non corrisponde all’ordine');
  }
}

/**
 * Pagamento dell'ordine: creazione e conferma PayPal, webhook, rimborsi.
 * Stesse garanzie del negozio stampe: importi verificati dal server, un solo
 * incasso per ogni cattura PayPal, mai un doppio addebito.
 */
export class ShopPaymentService {
  constructor(private readonly deps: ShopPaymentDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private orderRef(orderId: string) {
    return this.deps.db.collection('orders').doc(orderId);
  }

  paypalConfig(): PayPalPublicConfig {
    return this.deps.paypal.publicConfig();
  }

  // -------------------------------------------------------------------------
  // Creazione dell'ordine PayPal
  // -------------------------------------------------------------------------

  async createPaypalOrder(
    identity: ShopIdentity,
    orderId: string,
    input: {
      termsAccepted: boolean;
      privacyAccepted: boolean;
      personalizedProductionAccepted?: boolean;
      expectedQuoteFingerprint: string;
      expectedTotalCents: number;
    },
  ): Promise<Record<string, unknown>> {
    if (!this.deps.paypal.publicConfig().checkoutEnabled) {
      throw new CommerceHttpError(503, 'paypal_not_configured', 'Il pagamento online non è ancora attivo');
    }
    const settings = await this.deps.shop.settings();
    if (!isShopOrderingOpen(settings, this.now())) {
      throw new CommerceHttpError(409, 'orders_closed', 'Gli ordini online non sono aperti');
    }
    const order = await this.deps.orders.requireOwnerOrder(identity, orderId);
    assertEditable(order, this.now().getTime());
    const storedLines: ShopOrderLineDto[] = Array.isArray(order.lines) ? order.lines : [];
    const hasPhotoProducts = storedLines.some(line => line.photosRequired > 0);
    if (
      input.termsAccepted !== true ||
      input.privacyAccepted !== true ||
      (hasPhotoProducts && input.personalizedProductionAccepted !== true)
    ) {
      throw new CommerceHttpError(
        400,
        'legal_acceptance_required',
        'Accetta condizioni di vendita, privacy e produzione personalizzata prima del pagamento',
      );
    }

    // Ricalcolo autorevole, con il catalogo di adesso, subito prima di chiedere i soldi.
    const catalog = await this.deps.shop.publicCatalog();
    const products = new Map(catalog.products.map(product => [product.id, product]));
    const lines = priceLines(
      storedLines.map(line => ({ lineId: line.lineId, productId: line.productId, quantity: line.quantity })),
      products,
      new Set(storedLines.map(line => line.lineId)),
    );
    const method = order.fulfillment?.method === 'shipping' ? 'shipping' : 'studio_pickup';
    const quote = buildQuote(lines, method, settings.shipping);
    if (quote.totals.totalCents <= 0) throw new CommerceHttpError(409, 'empty_total', 'Il totale dell’ordine non è valido');
    if (
      input.expectedQuoteFingerprint !== quote.fingerprint ||
      input.expectedTotalCents !== quote.totals.totalCents ||
      order.quoteFingerprint !== quote.fingerprint
    ) {
      throw new CommerceHttpError(
        409,
        'quote_changed',
        'Il riepilogo o il prezzo sono cambiati: controlla e accetta nuovamente',
        { fingerprint: quote.fingerprint, totalCents: quote.totals.totalCents },
      );
    }
    if (method === 'shipping') {
      // Non basta nascondere PayPal nel browser: anche richieste costruite a mano
      // vengono rifiutate finché consegna e dati fiscali non sono completi.
      normalizePostalAddress(order.fulfillment?.shippingAddress);
      normalizeBillingDetails(order.billingDetails);
    }

    const seller = await this.deps.studio();
    const sellerSnapshot = {
      name: cleanText(seller.name, 200) || '',
      email: cleanText(seller.email, 254) || '',
      phone: cleanText(seller.phone, 60) || '',
      address: cleanText(seller.address, 300) || '',
    };
    const manifestHash = hashId(stableStringify(SHOP_LEGAL_MANIFEST));
    const sellerSnapshotHash = hashId(stableStringify(sellerSnapshot));
    const now = this.now();
    const previousAttempt = Number.isSafeInteger(order.payment?.attempt) ? order.payment.attempt : 0;

    const pendingCreatedAt = timestampMillis(order.payment?.createdAt);
    const reusable =
      order.payment?.paypalOrderId &&
      order.payment.status === 'pending' &&
      order.payment.quoteFingerprint === quote.fingerprint &&
      pendingCreatedAt > now.getTime() - PAYPAL_ORDER_TTL_MS &&
      order.legal?.manifestHash === manifestHash &&
      order.legal?.quoteFingerprint === quote.fingerprint &&
      order.legal?.attempt === previousAttempt;
    if (reusable) {
      return {
        paypalOrderId: order.payment.paypalOrderId,
        status: order.payment.paypalStatus || 'CREATED',
        amount: quote.totals,
        currency: SHOP_CURRENCY,
        reused: true,
      };
    }

    const attempt = previousAttempt + 1;
    const invoiceId = `${order.orderNumber}-A${attempt}`;
    let paypalOrder: PayPalOrderResponse;
    try {
      paypalOrder = await this.deps.paypal.createOrder(
        { internalOrderId: orderId, orderNumber: order.orderNumber, invoiceId, amountCents: quote.totals.totalCents, currency: SHOP_CURRENCY },
        paypalRequestId('shop', 'create', orderId, quote.fingerprint, String(attempt)),
      );
    } catch (error) {
      throw mapPayPalError(error);
    }
    if (!paypalOrder.id) throw new CommerceHttpError(502, 'paypal_invalid_response', 'PayPal non ha restituito un ordine valido');

    const orderRef = this.orderRef(orderId);
    const acceptanceRef = orderRef.collection('legalAcceptances').doc(hashId(`${quote.fingerprint}:${manifestHash}:${attempt}`));
    let concurrentReplay = false;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const fresh = await transaction.get(orderRef);
      const data = fresh.exists ? fresh.data() : undefined;
      if (!data || data.ownerUid !== identity.uid) throw new CommerceHttpError(404, 'order_not_found', 'Ordine non trovato');
      assertEditable(data, now.getTime());
      const attemptChanged = (Number.isSafeInteger(data.payment?.attempt) ? data.payment.attempt : 0) !== previousAttempt;
      if (attemptChanged && data.payment?.paypalOrderId === paypalOrder.id) {
        concurrentReplay = true;
        return;
      }
      if (data.quoteFingerprint !== quote.fingerprint || attemptChanged) {
        throw new CommerceHttpError(409, 'order_changed', 'L’ordine è cambiato durante il pagamento: aggiorna il riepilogo');
      }
      transaction.update(orderRef, {
        payment: {
          method: 'paypal',
          status: 'pending',
          paypalOrderId: paypalOrder.id,
          paypalStatus: paypalOrder.status || 'CREATED',
          quoteFingerprint: quote.fingerprint,
          amountCents: quote.totals.totalCents,
          currency: SHOP_CURRENCY,
          attempt,
          invoiceId,
          createdAt: now,
        },
        fulfillment: { ...data.fulfillment, status: 'awaiting_payment' },
        stato: 'bozza',
        legal: {
          termsAcceptedAt: now,
          termsVersion: SHOP_LEGAL_MANIFEST.termsVersion,
          privacyAcceptedAt: now,
          privacyVersion: SHOP_LEGAL_MANIFEST.privacyVersion,
          ...(hasPhotoProducts
            ? { personalizedProductionAcceptedAt: now, personalizedProductionVersion: SHOP_LEGAL_MANIFEST.personalizedProductionVersion }
            : {}),
          manifestVersion: SHOP_LEGAL_MANIFEST.schemaVersion,
          manifestHash,
          sellerSnapshot,
          sellerSnapshotHash,
          quoteFingerprint: quote.fingerprint,
          totalCents: quote.totals.totalCents,
          fulfillmentMethod: method,
          shippingCents: quote.totals.shippingCents,
          attempt,
        },
        // Il tempo per pagare non deve far scadere la bozza.
        retention: draftRetention(now),
        updatedAt: now,
      });
      transaction.set(acceptanceRef, {
        orderId,
        ownerUid: identity.uid,
        paymentAttempt: attempt,
        quoteFingerprint: quote.fingerprint,
        totalCents: quote.totals.totalCents,
        currency: SHOP_CURRENCY,
        fulfillmentMethod: method,
        shippingCents: quote.totals.shippingCents,
        termsAccepted: true,
        privacyAccepted: true,
        personalizedProductionAccepted: hasPhotoProducts,
        manifest: SHOP_LEGAL_MANIFEST,
        manifestHash,
        sellerSnapshot,
        sellerSnapshotHash,
        acceptedAt: now,
      });
    });
    const approveUrl = paypalOrder.links?.find(link => link.rel === 'approve')?.href;
    return {
      paypalOrderId: paypalOrder.id,
      status: paypalOrder.status || 'CREATED',
      ...(approveUrl ? { approveUrl } : {}),
      amount: quote.totals,
      currency: SHOP_CURRENCY,
      reused: concurrentReplay,
    };
  }

  // -------------------------------------------------------------------------
  // Conferma del pagamento (dal browser del cliente)
  // -------------------------------------------------------------------------

  async capturePaypalOrder(identity: ShopIdentity, orderId: string, input: { paypalOrderId?: string }): Promise<Record<string, unknown>> {
    const initial = await this.deps.orders.requireOwnerOrder(identity, orderId);
    const storedPaypalOrderId: string | undefined = initial.payment?.paypalOrderId;
    if (!storedPaypalOrderId) throw new CommerceHttpError(409, 'paypal_order_required', 'Pagamento PayPal non inizializzato');
    if (input.paypalOrderId && input.paypalOrderId !== storedPaypalOrderId) {
      throw new CommerceHttpError(409, 'paypal_order_mismatch', 'Ordine PayPal non corrispondente');
    }
    const paidResult = (captureId: string, duplicate: boolean) => ({
      success: true,
      duplicate,
      orderId,
      paypalOrderId: storedPaypalOrderId,
      captureId,
      status: 'paid',
    });
    if (isPaid(initial) && initial.payment?.paypalCaptureId) return paidResult(initial.payment.paypalCaptureId, true);

    // PayPal può completare l'incasso prima che il browser o il webhook lo
    // registrino: si chiede a PayPal prima di offrire un altro pagamento,
    // così non si addebita due volte.
    if (initial.payment?.status !== 'pending' || fulfillmentStatus(initial) !== 'awaiting_payment') {
      try {
        const completed = extractCompletedCapture(await this.deps.paypal.getOrder(storedPaypalOrderId));
        if (completed) {
          await this.recordCompletedPayment(orderId, completed);
          return paidResult(completed.captureId, true);
        }
      } catch (error) {
        if (error instanceof CommerceHttpError) throw error;
      }
      throw new CommerceHttpError(409, 'order_not_payable', 'L’ordine non è in attesa di pagamento');
    }

    const orderRef = this.orderRef(orderId);
    const claimedAt = this.now();
    const claimToken = hashId(`capture:${identity.uid}:${orderId}:${storedPaypalOrderId}:${claimedAt.getTime()}:${Math.random()}`);
    let replay: any;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const fresh = await transaction.get(orderRef);
      const order = fresh.exists ? fresh.data() : undefined;
      if (!order || order.ownerUid !== identity.uid) throw new CommerceHttpError(404, 'order_not_found', 'Ordine non trovato');
      if (isPaid(order) && order.payment?.paypalCaptureId) {
        replay = order.payment;
        return;
      }
      if (
        order.payment?.status !== 'pending' ||
        order.payment?.paypalOrderId !== storedPaypalOrderId ||
        fulfillmentStatus(order) !== 'awaiting_payment'
      ) {
        throw new CommerceHttpError(409, 'order_not_payable', 'L’ordine non è in attesa di pagamento');
      }
      const recentCapture =
        order.payment?.captureStatus === 'capturing' &&
        timestampMillis(order.payment?.captureClaimedAt) > claimedAt.getTime() - CAPTURE_CLAIM_MS;
      if (recentCapture) throw new CommerceHttpError(409, 'capture_running', 'Pagamento già in acquisizione');
      transaction.update(orderRef, {
        payment: { ...order.payment, captureStatus: 'capturing', captureClaimToken: claimToken, captureClaimedAt: claimedAt },
        updatedAt: claimedAt,
      });
    });
    if (replay) return paidResult(replay.paypalCaptureId, true);

    let response: PayPalOrderResponse;
    try {
      response = await this.deps.paypal.captureOrder(storedPaypalOrderId, paypalRequestId('shop', 'capture', orderId, storedPaypalOrderId));
    } catch (error) {
      // Una risposta persa o un ordine già incassato si recuperano: PayPal è la fonte autorevole.
      try {
        const completed = extractCompletedCapture(await this.deps.paypal.getOrder(storedPaypalOrderId));
        if (completed) {
          await this.recordCompletedPayment(orderId, completed);
          return paidResult(completed.captureId, true);
        }
      } catch (reconciliationError) {
        if (reconciliationError instanceof CommerceHttpError) throw reconciliationError;
      }
      await this.releaseCaptureClaim(orderRef, claimToken, error);
      throw mapPayPalError(error);
    }
    const capture = extractCompletedCapture(response);
    if (!capture) {
      await this.releaseCaptureClaim(orderRef, claimToken, new Error(`PayPal status ${response.status || 'UNKNOWN'}`));
      throw new CommerceHttpError(409, 'paypal_not_completed', 'PayPal non ha confermato il pagamento', { status: response.status });
    }
    await this.recordCompletedPayment(orderId, capture);
    return paidResult(capture.captureId, false);
  }

  private async releaseCaptureClaim(orderRef: any, claimToken: string, error: unknown): Promise<void> {
    await this.deps.db
      .runTransaction(async (transaction: any) => {
        const orderDoc = await transaction.get(orderRef);
        const order = orderDoc.exists ? orderDoc.data() : undefined;
        if (!order || order.payment?.captureClaimToken !== claimToken || isPaid(order)) return;
        const { captureClaimToken: _token, captureClaimedAt: _claimedAt, ...payment } = order.payment || {};
        transaction.update(orderRef, {
          payment: {
            ...payment,
            captureStatus: 'retryable',
            captureFailedAt: this.now(),
            captureLastError: String((error as any)?.message || error).slice(0, 500),
          },
          updatedAt: this.now(),
        });
      })
      .catch(() => undefined);
  }

  // -------------------------------------------------------------------------
  // Webhook PayPal
  // -------------------------------------------------------------------------

  async paypalWebhook(headers: PayPalWebhookHeaders, event: any): Promise<Record<string, unknown>> {
    let verified = false;
    try {
      verified = await this.deps.paypal.verifyWebhook(headers, event);
    } catch (error) {
      throw mapPayPalError(error);
    }
    if (!verified) throw new CommerceHttpError(401, 'invalid_webhook_signature', 'Firma webhook PayPal non valida');
    const eventId = cleanText(event?.id, 160);
    const eventType = cleanText(event?.event_type, 160);
    if (!eventId || !eventType) throw new CommerceHttpError(400, 'invalid_webhook', 'Evento PayPal non valido');

    const eventRef = this.deps.db.collection('shopPaymentEvents').doc(hashId(`paypal-event:${eventId}`));
    if ((await eventRef.get()).exists) return { ok: true, duplicate: true };
    const eventRecord = {
      provider: 'paypal',
      providerEventId: eventId,
      type: eventType,
      payloadHash: createHash('sha256').update(JSON.stringify(event)).digest('hex'),
      receivedAt: this.now(),
      expiresAt: new Date(this.now().getTime() + 180 * DAY_MS),
    };

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const capture = captureFromWebhook(event);
      if (!capture) {
        await eventRef.set({ ...eventRecord, status: 'ignored_invalid', processedAt: this.now() });
        return { ok: true, ignored: true };
      }
      const orderId = await this.resolveWebhookOrderId(capture);
      if (!orderId) {
        await eventRef.set({ ...eventRecord, status: 'ignored_unknown_order', processedAt: this.now() });
        return { ok: true, ignored: true };
      }
      await this.recordCompletedPayment(orderId, capture, eventRef, eventRecord);
      return { ok: true, orderId };
    }

    if (eventType === 'PAYMENT.CAPTURE.DECLINED' || eventType === 'PAYMENT.CAPTURE.DENIED') {
      const capture = captureFromWebhook(event);
      const orderId = capture ? await this.resolveWebhookOrderId(capture) : null;
      await this.recordFailedPayment(orderId, eventRef, eventRecord, event);
      return { ok: true, ...(orderId ? { orderId } : { ignored: true }) };
    }

    if (eventType === 'PAYMENT.CAPTURE.REFUNDED' || eventType === 'PAYMENT.CAPTURE.REVERSED') {
      const orderId = await this.resolveRefundOrderId(event);
      if (!orderId) {
        await eventRef.set({ ...eventRecord, status: 'ignored_unknown_order', processedAt: this.now() });
        return { ok: true, ignored: true };
      }
      await this.recordRefund(orderId, eventRef, eventRecord, event);
      return { ok: true, orderId };
    }

    await eventRef.set({ ...eventRecord, status: 'ignored_event_type', processedAt: this.now() });
    return { ok: true, ignored: true };
  }

  private async resolveWebhookOrderId(capture: CompletedCapture): Promise<string | null> {
    if (capture.customId) {
      const direct = await this.orderRef(capture.customId).get();
      if (direct.exists && direct.data()?.orderType === SHOP_ORDER_TYPE && direct.data()?.payment?.paypalOrderId === capture.paypalOrderId) {
        return direct.id;
      }
    }
    const snapshot = await this.deps.db.collection('orders').where('payment.paypalOrderId', '==', capture.paypalOrderId).limit(2).get();
    const matches = snapshot.docs.filter((doc: any) => doc.data()?.orderType === SHOP_ORDER_TYPE);
    return matches.length === 1 ? matches[0].id : null;
  }

  private async resolveRefundOrderId(event: any): Promise<string | null> {
    const resource = event?.resource || {};
    const orderId = cleanText(resource.supplementary_data?.related_ids?.order_id || resource.custom_id, 200);
    if (orderId) {
      const direct = await this.orderRef(orderId).get();
      if (direct.exists && direct.data()?.orderType === SHOP_ORDER_TYPE) return direct.id;
    }
    const captureId = cleanText(resource.supplementary_data?.related_ids?.capture_id || resource.parent_payment, 200);
    if (!captureId) return null;
    const snapshot = await this.deps.db.collection('orders').where('payment.paypalCaptureId', '==', captureId).limit(2).get();
    const matches = snapshot.docs.filter((doc: any) => doc.data()?.orderType === SHOP_ORDER_TYPE);
    return matches.length === 1 ? matches[0].id : null;
  }

  // -------------------------------------------------------------------------
  // Registrazione dell'incasso: ordine, cassa, cliente, notifica
  // -------------------------------------------------------------------------

  async recordCompletedPayment(
    orderId: string,
    capture: CompletedCapture,
    eventRef?: any,
    eventRecord?: Record<string, unknown>,
  ): Promise<{ photosMissing: number; needsReconciliation: boolean } | null> {
    const settings = await this.deps.shop.settings();
    const orderRef = this.orderRef(orderId);
    const captureRef = this.deps.db.collection('shopPaymentCaptures').doc(hashId(`paypal-capture:${capture.captureId}`));
    const cashRef = this.deps.db.collection('cashMovements').doc(`shop_paypal_${hashId(capture.captureId).slice(0, 32)}`);
    const feeCashRef = this.deps.db.collection('cashMovements').doc(`shop_paypal_fee_${hashId(capture.captureId).slice(0, 32)}`);
    const clienti = this.deps.db.collection('clienti');
    const now = this.now();
    let outcome: { photosMissing: number; needsReconciliation: boolean } | null = null;

    await this.deps.db.runTransaction(async (transaction: any) => {
      outcome = null;
      const [orderDoc, captureDoc, eventDoc, assetsSnapshot] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(captureRef),
        eventRef ? transaction.get(eventRef) : Promise.resolve(undefined),
        transaction.get(orderRef.collection(SHOP_ASSETS)),
      ]);
      if (eventDoc?.exists) return;
      if (!orderDoc.exists || orderDoc.data()?.orderType !== SHOP_ORDER_TYPE) {
        if (eventRef) transaction.set(eventRef, { ...eventRecord, status: 'ignored_unknown_order', processedAt: now });
        return;
      }
      const order = orderDoc.data();
      validateCaptureAgainstOrder(orderId, order, capture, this.deps.paypal.config.merchantId);
      if (captureDoc.exists) {
        if (eventRef) transaction.set(eventRef, { ...eventRecord, status: 'processed_duplicate', processedAt: now });
        return;
      }

      // Cliente del gestionale: quello collegato, quello con la stessa email, oppure uno nuovo al primo pagamento.
      let clientRef: any;
      let clientDoc: any;
      if (order.clienteId) {
        clientRef = clienti.doc(order.clienteId);
        clientDoc = await transaction.get(clientRef);
      }
      if (!clientDoc?.exists) {
        const byEmail = await transaction.get(clienti.where('email', '==', order.emailCliente).limit(1));
        if (!byEmail.empty) {
          clientDoc = byEmail.docs[0];
          clientRef = clientDoc.ref ?? clienti.doc(clientDoc.id);
        } else {
          clientRef = clienti.doc();
          clientDoc = undefined;
        }
      }

      const filesUnavailable = order.retention?.status === 'purging' || order.retention?.status === 'purged';
      const cancelledBefore = fulfillmentStatus(order) === 'cancelled';
      const needsReconciliation = filesUnavailable || cancelledBefore;
      const lines: ShopOrderLineDto[] = Array.isArray(order.lines) ? order.lines : [];
      const assets = assetsSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      const photosMissing = shopPhotosMissing(lines, assets);
      const amountEuros = centsToEuros(capture.amountCents);
      const feeCents = capture.paypalFeeCents || 0;
      const { captureClaimToken: _claimToken, captureClaimedAt: _claimedAt, ...paymentBeforeCapture } = order.payment || {};
      const existingTransactions = Array.isArray(order.transactions) ? order.transactions : [];

      const nextFulfillment = needsReconciliation
        ? { ...order.fulfillment, status: 'cancelled', cancellationReason: order.fulfillment?.cancellationReason || 'payment_after_cancellation' }
        : { ...order.fulfillment, status: photosMissing > 0 ? 'awaiting_photos' : 'photos_received' };

      transaction.update(orderRef, {
        payment: {
          ...paymentBeforeCapture,
          method: 'paypal',
          status: needsReconciliation ? 'paid_action_required' : 'paid',
          captureStatus: 'completed',
          paypalOrderId: capture.paypalOrderId,
          paypalCaptureId: capture.captureId,
          paypalStatus: 'COMPLETED',
          amountCents: capture.amountCents,
          collectedCents: capture.amountCents,
          dueCents: 0,
          paypalFeeCents: feeCents,
          netAmountCents: capture.amountCents - feeCents,
          currency: capture.currency,
          ...(capture.payerEmail ? { payerEmail: capture.payerEmail } : {}),
          refundedCents: order.payment?.refundedCents || 0,
          paidAt: now,
          ...(needsReconciliation
            ? { reconciliationRequired: true, reconciliationReason: filesUnavailable ? 'paypal_completed_after_asset_purge' : 'paypal_completed_after_cancellation' }
            : {}),
        },
        fulfillment: nextFulfillment,
        transactions: [
          ...existingTransactions,
          {
            tipo: 'saldo',
            importo: amountEuros,
            metodo: 'paypal',
            data: now,
            emailInviata: false,
            cashMovementId: cashRef.id,
            provider: 'paypal',
            providerOrderId: capture.paypalOrderId,
            providerCaptureId: capture.captureId,
            note: `Pagamento anticipato shop online ${order.orderNumber}`,
          },
        ],
        acconto: amountEuros,
        saldo: 0,
        metodoPagamentoSaldo: 'paypal',
        dataSaldo: now,
        stato: needsReconciliation ? 'attenzione_pagamento' : 'in_lavorazione',
        clienteId: clientRef.id,
        shop: {
          ...(order.shop || {}),
          paidAt: now,
          photoOverdue: false,
          photoDeadlineAt:
            !needsReconciliation && photosMissing > 0 ? new Date(now.getTime() + settings.photoWaitDays * DAY_MS) : null,
          estimatedMarginCents: capture.amountCents - feeCents,
        },
        retention: needsReconciliation ? { ...(order.retention || {}), reconciliationRequired: true } : { status: 'production' },
        updatedAt: now,
      });

      transaction.set(cashRef, {
        tipo: 'entrata',
        categoria: 'Vendita shop online',
        importo: amountEuros,
        descrizione: `Shop online ${order.orderNumber} - ${order.nomeCliente || order.emailCliente}`,
        data: now,
        metodoPagamento: 'paypal',
        note: needsReconciliation ? `PayPal capture ${capture.captureId} - AZIONE MANUALE RICHIESTA: ordine non più attivo` : `PayPal capture ${capture.captureId}`,
        origine: 'shop',
        origineTema: 'shop',
        origineRef: orderId,
        orderId,
        provider: 'paypal',
        providerTransactionId: capture.captureId,
        createdAt: now,
        updatedAt: now,
      });
      if (feeCents > 0) {
        transaction.set(feeCashRef, {
          tipo: 'uscita',
          categoria: 'Commissioni di pagamento',
          importo: centsToEuros(feeCents),
          descrizione: `Commissione PayPal shop online ${order.orderNumber}`,
          data: now,
          metodoPagamento: 'paypal',
          note: `Commissione associata alla cattura PayPal ${capture.captureId}`,
          origine: 'shop',
          origineTema: 'shop',
          origineRef: orderId,
          orderId,
          provider: 'paypal',
          providerTransactionId: capture.captureId,
          movementRole: 'payment_fee',
          createdAt: now,
          updatedAt: now,
        });
      }
      transaction.set(captureRef, {
        provider: 'paypal',
        orderId,
        paypalOrderId: capture.paypalOrderId,
        captureId: capture.captureId,
        amountCents: capture.amountCents,
        currency: capture.currency,
        recordedAt: now,
      });

      // Scheda cliente: ricavi e ordini, più dati di contatto e fiscali (solo dove mancano, salvo schede create dagli shop).
      const stored = clientDoc?.exists ? clientDoc.data() : undefined;
      const profile = clientProfileFields(order, stored);
      if (stored) {
        transaction.update(clientRef, {
          ...profile,
          'financials.totalRevenue': FieldValue.increment(amountEuros),
          'financials.totalOrders': FieldValue.increment(1),
          'sourceRefs.orderIds': FieldValue.arrayUnion(orderId),
          'lifecycle.lastInteractionAt': now,
          updatedAt: now,
        });
      } else {
        transaction.set(clientRef, {
          ...profile,
          email: order.emailCliente,
          tags: ['shop-online'],
          source: SHOP_ORDER_TYPE,
          sourceRefs: { bookingIds: [], orderIds: [orderId], galleryIds: [], userIds: [order.ownerUid] },
          lifecycle: { firstContactAt: now, lastInteractionAt: now, status: 'cliente' },
          financials: { totalRevenue: amountEuros, outstandingBalance: 0, totalOrders: 1 },
          createdAt: now,
          updatedAt: now,
        });
      }
      if (eventRef) {
        transaction.set(eventRef, {
          ...eventRecord,
          status: needsReconciliation ? 'processed_manual_action_required' : 'processed',
          processedAt: now,
        });
      }
      outcome = { photosMissing, needsReconciliation };
    });

    if (outcome) {
      const info = outcome as { photosMissing: number; needsReconciliation: boolean };
      await Promise.allSettled([
        this.recordAdminNotification(orderId, info),
        this.deps.hooks?.onPaid?.(orderId, info) ?? Promise.resolve(),
      ]);
    }
    return outcome;
  }

  private async recordAdminNotification(orderId: string, info: { photosMissing: number; needsReconciliation: boolean }): Promise<void> {
    const notificationRef = this.deps.db.collection('adminNotifications').doc(`shop-order-${orderId}`);
    try {
      await this.deps.db.runTransaction(async (transaction: any) => {
        const existing = await transaction.get(notificationRef);
        if (existing.exists) return;
        const order = (await transaction.get(this.orderRef(orderId))).data() || {};
        const orderNumber = order.orderNumber || orderId;
        transaction.set(notificationRef, {
          type: 'shop_order',
          title: 'Nuovo ordine shop online',
          description: info.needsReconciliation
            ? `Ordine ${orderNumber}: pagamento arrivato su un ordine non più attivo, controlla`
            : info.photosMissing > 0
              ? `Ordine ${orderNumber} pagato online, mancano ${info.photosMissing} foto`
              : `Ordine ${orderNumber} ricevuto e pagato online`,
          orderId,
          relatedDocId: orderId,
          relatedDocType: 'shop_order',
          isRead: false,
          createdAt: this.now(),
          deepLink: `/admin/dashboard?shopOrderId=${encodeURIComponent(orderId)}`,
        });
      });
    } catch (error) {
      // La notifica è un di più: non deve toccare l'esito del pagamento.
      console.error('[shop] Notifica admin non salvata (non bloccante):', error);
    }
  }

  private async recordFailedPayment(orderId: string | null, eventRef: any, eventRecord: Record<string, unknown>, event: any): Promise<void> {
    const now = this.now();
    await this.deps.db.runTransaction(async (transaction: any) => {
      const eventDoc = await transaction.get(eventRef);
      if (eventDoc.exists) return;
      const orderRef = orderId ? this.orderRef(orderId) : undefined;
      const orderDoc = orderRef ? await transaction.get(orderRef) : undefined;
      if (orderRef && orderDoc?.exists && orderDoc.data()?.payment?.status === 'pending') {
        const order = orderDoc.data();
        transaction.update(orderRef, {
          payment: { ...order.payment, status: 'failed', paypalStatus: event?.resource?.status || 'DECLINED', failedAt: now },
          fulfillment: { ...order.fulfillment, status: 'awaiting_payment' },
          updatedAt: now,
        });
      }
      transaction.set(eventRef, { ...eventRecord, status: orderDoc?.exists ? 'processed' : 'ignored_unknown_order', processedAt: now });
    });
  }

  private async recordRefund(orderId: string, eventRef: any, eventRecord: Record<string, unknown>, event: any): Promise<void> {
    const resource = event?.resource || {};
    const refundId = cleanText(resource.id, 160) || cleanText(event?.id, 160)!;
    const eventType = String(event?.event_type || '');
    const orderRef = this.orderRef(orderId);
    const cashRef = this.deps.db.collection('cashMovements').doc(`shop_refund_${hashId(refundId).slice(0, 32)}`);
    const refundRef = this.deps.db.collection('shopPaymentRefunds').doc(hashId(`paypal-refund:${refundId}`));
    const now = this.now();
    let result: { full: boolean; cancelled: boolean } | null = null;
    await this.deps.db.runTransaction(async (transaction: any) => {
      result = null;
      const [eventDoc, orderDoc, refundDoc] = await Promise.all([transaction.get(eventRef), transaction.get(orderRef), transaction.get(refundRef)]);
      if (eventDoc.exists) return;
      if (refundDoc.exists) {
        transaction.set(eventRef, { ...eventRecord, status: 'processed_duplicate_refund', processedAt: now });
        return;
      }
      if (!orderDoc.exists) {
        transaction.set(eventRef, { ...eventRecord, status: 'ignored_unknown_order', processedAt: now });
        return;
      }
      const order = orderDoc.data();
      const relatedCaptureId = cleanText(resource.supplementary_data?.related_ids?.capture_id || resource.parent_payment, 200);
      if (order.payment?.paypalCaptureId && (!relatedCaptureId || relatedCaptureId !== order.payment.paypalCaptureId)) {
        transaction.set(eventRef, { ...eventRecord, status: 'ignored_capture_mismatch', processedAt: now });
        return;
      }
      const alreadyRefunded = Number(order.payment?.refundedCents || 0);
      const amountFromEvent = paypalValueToCents(resource.amount?.value);
      const paidCents = Number(order.payment?.amountCents || order.totals?.totalCents || 0);
      const refundCents =
        amountFromEvent !== null
          ? amountFromEvent
          : eventType === 'PAYMENT.CAPTURE.REVERSED'
            ? Math.max(0, paidCents - alreadyRefunded)
            : 0;
      if (refundCents <= 0 || String(resource.amount?.currency_code || SHOP_CURRENCY) !== SHOP_CURRENCY || alreadyRefunded + refundCents > paidCents) {
        transaction.set(eventRef, { ...eventRecord, status: 'ignored_invalid_amount', processedAt: now });
        return;
      }
      const totalRefunded = alreadyRefunded + refundCents;
      const fullRefund = totalRefunded === paidCents;
      // Se la merce è già partita, il rimborso non annulla l'ordine: lo studio deve saperlo.
      const goodsOut = ['shipped', 'delivered'].includes(fulfillmentStatus(order));
      const cancels = fullRefund && !goodsOut;
      const amountEuros = centsToEuros(refundCents);
      const clientRef = order.clienteId ? this.deps.db.collection('clienti').doc(order.clienteId) : undefined;
      const clientDoc = clientRef ? await transaction.get(clientRef) : undefined;
      const refunds = Array.isArray(order.payment?.refunds) ? order.payment.refunds : [];
      transaction.update(orderRef, {
        payment: {
          ...order.payment,
          status: fullRefund ? 'refunded' : 'partially_refunded',
          collectedCents: Math.max(0, paidCents - totalRefunded),
          dueCents: 0,
          refundedCents: totalRefunded,
          refundedAt: now,
          refunds: [...refunds, { id: refundId, amountCents: refundCents, currency: SHOP_CURRENCY, eventType, createdAt: now, cashMovementId: cashRef.id }],
        },
        acconto: centsToEuros(Math.max(0, paidCents - totalRefunded)),
        ...(cancels
          ? { fulfillment: { ...order.fulfillment, status: 'cancelled', cancelledAt: now }, stato: 'annullato', retention: cancelledRetention(now, 'refunded') }
          : {}),
        ...(fullRefund && goodsOut ? { shop: { ...(order.shop || {}), refundedAfterShipping: true } } : {}),
        updatedAt: now,
      });
      transaction.set(cashRef, {
        tipo: 'uscita',
        categoria: 'Rimborso',
        importo: amountEuros,
        descrizione: `Rimborso shop online ${order.orderNumber}`,
        data: now,
        metodoPagamento: 'paypal',
        note: `PayPal refund ${refundId}`,
        origine: 'shop',
        origineTema: 'shop',
        origineRef: orderId,
        orderId,
        provider: 'paypal',
        providerTransactionId: refundId,
        createdAt: now,
        updatedAt: now,
      });
      transaction.set(refundRef, {
        provider: 'paypal',
        refundId,
        orderId,
        captureId: relatedCaptureId || order.payment?.paypalCaptureId || null,
        amountCents: refundCents,
        currency: SHOP_CURRENCY,
        eventType,
        recordedAt: now,
      });
      if (clientRef && clientDoc?.exists) {
        transaction.update(clientRef, {
          'financials.totalRevenue': FieldValue.increment(-amountEuros),
          'lifecycle.lastInteractionAt': now,
          updatedAt: now,
        });
      }
      transaction.set(eventRef, { ...eventRecord, status: 'processed', processedAt: now });
      result = { full: fullRefund, cancelled: cancels };
    });
    if (result) await this.deps.hooks?.onRefunded?.(orderId, result).catch(error => console.error('[shop] email di rimborso non inviata:', error));
  }
}

/**
 * Dati anagrafici da portare nella scheda cliente. Per schede create dagli
 * shop si aggiornano sempre; per quelle del gestionale si riempiono solo i campi vuoti.
 */
function clientProfileFields(order: any, stored: any | undefined): Record<string, unknown> {
  const shopManaged = !stored || stored.source === 'print_shop' || stored.source === SHOP_ORDER_TYPE;
  const fields: Record<string, unknown> = {};
  const name = cleanText(order.customer?.name || order.nomeCliente, 160);
  if (name && (shopManaged || !cleanText(`${stored?.nome || ''} ${stored?.cognome || ''}`, 160))) {
    const names = splitCustomerName(name, 'Shop online');
    fields.nome = names.first;
    fields.cognome = names.last;
  }
  const phone = cleanText(order.customer?.phone || order.telefonoCliente, 40);
  if (phone && (shopManaged || (!stored?.whatsapp && !stored?.cellulare1))) {
    fields.whatsapp = phone;
    fields.cellulare1 = phone;
  }
  const billing = order.fulfillment?.method === 'shipping' ? order.billingDetails : undefined;
  if (billing?.residenceAddress) {
    const residence = billing.residenceAddress;
    const street = `${residence.street} ${residence.houseNumber}`.trim();
    const set = (key: string, value: string) => {
      if (shopManaged || !stored?.[key]) fields[key] = value;
    };
    set('codiceFiscale', billing.fiscalCode);
    set('indirizzo', street);
    set('cap', residence.postalCode);
    set('citta', residence.city);
    set('provincia', residence.province);
    set('viaFiscale', street);
    set('capFiscale', residence.postalCode);
    set('cittaFiscale', residence.city);
    set('provinciaFiscale', residence.province);
  }
  return fields;
}
