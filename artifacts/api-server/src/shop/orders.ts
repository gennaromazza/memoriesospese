import {
  isShopOrderingOpen,
  SHOP_CURRENCY,
  SHOP_ORDER_TYPE,
  SHOP_EDITABLE_STATUSES,
  type ShopOrderDto,
  type ShopOrderLineDto,
  type ShopProductDto,
} from '@shared/shop-types';
import type { PrintShopBillingDetails, PrintShopPostalAddress } from '@shared/print-shop-types';
import { shopShippingQuote } from '@shared/shop-shipping';
import {
  assertDocumentId,
  normalizeBillingDetails,
  normalizePostalAddress,
  normalizeRequiredEmail,
} from '../commerce/checkout-input.js';
import { CommerceHttpError } from '../commerce/errors.js';
import { centsToEuros, cleanText, createOrderNumber, timestampMillis } from '../commerce/text.js';
import {
  SHOP_ASSETS,
  assertEditable,
  cancelledRetention,
  compatibilityProducts,
  draftRetention,
  fulfillmentStatus,
  isPaid,
  toOwnerDto,
} from './order-model.js';
import { buildQuote, parseLineInputs, priceLines } from './quote.js';
import type { ShopService } from './service.js';

export interface ShopIdentity {
  uid: string;
  email: string;
}

export interface ShopOrderDeps {
  db: any;
  shop: ShopService;
  now?: () => Date;
  /** Cancella le foto delle righe tolte dal carrello (file e documenti). */
  removeAssetsForLines?: (orderId: string, lineIds: readonly string[]) => Promise<void>;
}

const MAX_ACTIVE_DRAFTS = 5;

export interface ShopOrderPatch {
  customer?: { name?: string; phone?: string };
  customerNotes?: string;
  fulfillment?: { method: 'studio_pickup' } | { method: 'shipping'; shippingAddress: unknown };
  billingDetails?: unknown;
}

/**
 * Bozza e carrello dell'ordine. I prezzi li decide sempre il server dal
 * catalogo di adesso: quello che arriva dal browser conta solo come richiesta.
 */
export class ShopOrderService {
  constructor(private readonly deps: ShopOrderDeps) {}

  protected now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private ordersCollection() {
    return this.deps.db.collection('orders');
  }

  /** Prodotti vendibili adesso, per id. Con gli ordini chiusi non si crea né si cambia nulla. */
  private async sellableCatalog(): Promise<{ products: Map<string, ShopProductDto>; shipping: any }> {
    const settings = await this.deps.shop.settings();
    if (!settings.enabled) {
      throw new CommerceHttpError(409, 'shop_unavailable', 'Lo shop non è disponibile in questo momento');
    }
    if (!isShopOrderingOpen(settings, this.now())) {
      throw new CommerceHttpError(409, 'orders_closed', 'Gli ordini online non sono aperti');
    }
    const catalog = await this.deps.shop.publicCatalog();
    return { products: new Map(catalog.products.map(product => [product.id, product])), shipping: settings.shipping };
  }

  async requireOwnerOrder(identity: ShopIdentity, orderId: string): Promise<any> {
    assertDocumentId(orderId, 'orderId');
    const doc = await this.ordersCollection().doc(orderId).get();
    const data = doc.exists ? doc.data() : undefined;
    if (!data || data.orderType !== SHOP_ORDER_TYPE || data.ownerUid !== identity.uid) {
      throw new CommerceHttpError(404, 'order_not_found', 'Ordine non trovato');
    }
    return { id: doc.id, ...data };
  }

  async listAssets(orderId: string): Promise<any[]> {
    const snapshot = await this.ordersCollection().doc(orderId).collection(SHOP_ASSETS).get();
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  }

  async dto(order: any): Promise<ShopOrderDto> {
    return toOwnerDto(order.id, order, await this.listAssets(order.id), this.now().getTime());
  }

  async getOwnerOrder(identity: ShopIdentity, orderId: string): Promise<ShopOrderDto> {
    return this.dto(await this.requireOwnerOrder(identity, orderId));
  }

  async listOwnerOrders(identity: ShopIdentity): Promise<ShopOrderDto[]> {
    const snapshot = await this.ordersCollection().where('ownerUid', '==', identity.uid).get();
    const orders = snapshot.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .filter((order: any) => order.orderType === SHOP_ORDER_TYPE)
      // Una bozza annullata mai pagata non è un ordine: non va mostrata.
      .filter((order: any) => !(fulfillmentStatus(order) === 'cancelled' && !order.payment?.paidAt))
      .sort((a: any, b: any) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
    return Promise.all(orders.map((order: any) => this.dto(order)));
  }

  /** Crea la bozza con le righe del carrello, ai prezzi di adesso. */
  async createDraft(
    identity: ShopIdentity,
    input: { lines: unknown; customer?: { name?: string; phone?: string }; customerNotes?: string },
  ): Promise<ShopOrderDto> {
    const email = normalizeRequiredEmail(identity.email);
    const customerName = cleanText(input.customer?.name, 160) || email.split('@')[0];
    const phone = cleanText(input.customer?.phone, 40);
    const { products, shipping } = await this.sellableCatalog();
    const lines = priceLines(parseLineInputs(input.lines), products);
    const quote = buildQuote(lines, 'studio_pickup', shipping);
    const now = this.now();

    const owned = await this.ordersCollection().where('ownerUid', '==', identity.uid).get();
    const activeDrafts = owned.docs.filter((doc: any) => {
      const value = doc.data();
      return (
        value.orderType === SHOP_ORDER_TYPE &&
        !isPaid(value) &&
        SHOP_EDITABLE_STATUSES.includes(fulfillmentStatus(value)) &&
        value.retention?.status !== 'purged'
      );
    }).length;
    if (activeDrafts >= MAX_ACTIVE_DRAFTS) {
      throw new CommerceHttpError(
        409,
        'active_draft_limit',
        'Hai già troppi ordini in preparazione: completa o elimina una bozza prima di crearne un’altra',
        { maxActiveDrafts: MAX_ACTIVE_DRAFTS },
      );
    }

    // Il cliente si collega solo se già presente: il CRM si arricchisce al
    // primo pagamento, non per ogni carrello abbandonato.
    const existingClient = await this.deps.db.collection('clienti').where('email', '==', email).limit(1).get();
    const clienteId = existingClient.empty ? undefined : existingClient.docs[0].id;

    const orderRef = this.ordersCollection().doc();
    const order = {
      orderType: SHOP_ORDER_TYPE,
      source: SHOP_ORDER_TYPE,
      orderNumber: createOrderNumber(orderRef.id, now, 'SH'),
      ownerUid: identity.uid,
      ...(clienteId ? { clienteId } : {}),
      currency: SHOP_CURRENCY,
      customer: { name: customerName, email, ...(phone ? { phone } : {}) },
      nomeCliente: customerName,
      emailCliente: email,
      ...(phone ? { telefonoCliente: phone, whatsappCliente: phone } : {}),
      lines: quote.lines,
      products: compatibilityProducts(quote.lines),
      prodotti: compatibilityProducts(quote.lines),
      totals: quote.totals,
      totale: centsToEuros(quote.totals.totalCents),
      acconto: 0,
      saldo: centsToEuros(quote.totals.totalCents),
      transactions: [],
      stato: 'bozza',
      fulfillment: { method: 'studio_pickup', status: 'draft' },
      payment: { method: 'paypal', status: 'pending' },
      quoteFingerprint: quote.fingerprint,
      shop: {
        ...(cleanText(input.customerNotes, 1000) ? { customerNotes: cleanText(input.customerNotes, 1000) } : {}),
      },
      retention: draftRetention(now),
      createdAt: now,
      updatedAt: now,
    };
    await orderRef.set(order);
    return this.dto({ id: orderRef.id, ...order });
  }

  /**
   * Sostituisce le righe del carrello e riallinea i prezzi al catalogo di
   * adesso. Serve anche a "rinfrescare" un ordine dopo che un prezzo è cambiato.
   */
  async replaceLines(identity: ShopIdentity, orderId: string, rawLines: unknown): Promise<ShopOrderDto> {
    const { products, shipping } = await this.sellableCatalog();
    const inputs = parseLineInputs(rawLines);
    const orderRef = this.ordersCollection().doc(orderId);
    const now = this.now();
    let removedLineIds: string[] = [];
    await this.deps.db.runTransaction(async (transaction: any) => {
      const fresh = await transaction.get(orderRef);
      const order = fresh.exists ? fresh.data() : undefined;
      if (!order || order.orderType !== SHOP_ORDER_TYPE || order.ownerUid !== identity.uid) {
        throw new CommerceHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      assertEditable(order, now.getTime());
      const previous: ShopOrderLineDto[] = Array.isArray(order.lines) ? order.lines : [];
      const lines = priceLines(inputs, products, new Set(previous.map(line => line.lineId)));
      // Se con le righe nuove la spedizione non si può più calcolare (per esempio pesano troppo),
      // l'ordine torna al ritiro in studio: il cliente lo vede e può scegliere di nuovo.
      const wanted = order.fulfillment?.method === 'shipping' ? 'shipping' : 'studio_pickup';
      const method = wanted === 'shipping' && !shopShippingQuote(shipping, lines).available ? 'studio_pickup' : wanted;
      const quote = buildQuote(lines, method, shipping);
      const kept = new Set(lines.map(line => line.lineId));
      removedLineIds = previous.map(line => line.lineId).filter(lineId => !kept.has(lineId));
      transaction.update(orderRef, {
        lines: quote.lines,
        products: compatibilityProducts(quote.lines),
        prodotti: compatibilityProducts(quote.lines),
        totals: quote.totals,
        totale: centsToEuros(quote.totals.totalCents),
        saldo: centsToEuros(quote.totals.totalCents),
        quoteFingerprint: quote.fingerprint,
        payment: resetPendingPayment(order.payment),
        fulfillment: { ...order.fulfillment, method, status: 'draft' },
        retention: draftRetention(now),
        updatedAt: now,
      });
    });
    if (removedLineIds.length > 0) await this.deps.removeAssetsForLines?.(orderId, removedLineIds);
    return this.getOwnerOrder(identity, orderId);
  }

  /** Dati del cliente, consegna e fatturazione. Cambiare la consegna ricalcola la spedizione. */
  async updateOrder(identity: ShopIdentity, orderId: string, patch: ShopOrderPatch): Promise<ShopOrderDto> {
    const settings = await this.deps.shop.settings();
    const orderRef = this.ordersCollection().doc(orderId);
    const now = this.now();
    await this.deps.db.runTransaction(async (transaction: any) => {
      const fresh = await transaction.get(orderRef);
      const order = fresh.exists ? fresh.data() : undefined;
      if (!order || order.orderType !== SHOP_ORDER_TYPE || order.ownerUid !== identity.uid) {
        throw new CommerceHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      assertEditable(order, now.getTime());
      const update: Record<string, unknown> = { updatedAt: now, retention: draftRetention(now) };

      if (patch.customer) {
        const name = cleanText(patch.customer.name, 160) || order.customer?.name || order.nomeCliente;
        const phone = patch.customer.phone !== undefined ? cleanText(patch.customer.phone, 40) : order.customer?.phone;
        update.customer = { name, email: order.customer?.email || order.emailCliente, ...(phone ? { phone } : {}) };
        update.nomeCliente = name;
        if (phone) {
          update.telefonoCliente = phone;
          update.whatsappCliente = phone;
        }
      }
      if (patch.customerNotes !== undefined) {
        update['shop.customerNotes'] = cleanText(patch.customerNotes, 1000) ?? '';
      }

      let method: 'studio_pickup' | 'shipping' = order.fulfillment?.method === 'shipping' ? 'shipping' : 'studio_pickup';
      let shippingAddress: PrintShopPostalAddress | undefined = order.fulfillment?.shippingAddress;
      let billingDetails: PrintShopBillingDetails | undefined = order.billingDetails;
      if (patch.fulfillment) {
        method = patch.fulfillment.method;
        if (patch.fulfillment.method === 'shipping') {
          if (!settings.shipping.enabled) {
            throw new CommerceHttpError(409, 'shipping_disabled', 'La spedizione non è disponibile');
          }
          shippingAddress = normalizePostalAddress(patch.fulfillment.shippingAddress);
        } else {
          shippingAddress = undefined;
          billingDetails = undefined;
        }
      }
      if (patch.billingDetails !== undefined && method === 'shipping') {
        billingDetails = normalizeBillingDetails(patch.billingDetails);
      }

      const lines: ShopOrderLineDto[] = Array.isArray(order.lines) ? order.lines : [];
      const quote = buildQuote(lines, method, settings.shipping);
      update.fulfillment = {
        ...order.fulfillment,
        method,
        status: 'draft',
        ...(shippingAddress ? { shippingAddress } : {}),
      };
      if (!shippingAddress) {
        update.fulfillment = Object.fromEntries(
          Object.entries(update.fulfillment as Record<string, unknown>).filter(([key]) => key !== 'shippingAddress'),
        );
      }
      update.billingDetails = billingDetails ?? null;
      update.totals = quote.totals;
      update.totale = centsToEuros(quote.totals.totalCents);
      update.saldo = centsToEuros(quote.totals.totalCents);
      update.quoteFingerprint = quote.fingerprint;
      update.payment = resetPendingPayment(order.payment);
      transaction.update(orderRef, update);
    });
    return this.getOwnerOrder(identity, orderId);
  }

  /** Annulla una bozza non pagata. Le foto vengono eliminate dal processo di pulizia. */
  async cancelDraft(identity: ShopIdentity, orderId: string): Promise<{ cancelled: true }> {
    const orderRef = this.ordersCollection().doc(orderId);
    const now = this.now();
    await this.deps.db.runTransaction(async (transaction: any) => {
      const fresh = await transaction.get(orderRef);
      const order = fresh.exists ? fresh.data() : undefined;
      if (!order || order.orderType !== SHOP_ORDER_TYPE || order.ownerUid !== identity.uid) {
        throw new CommerceHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      if (isPaid(order) || order.payment?.captureStatus === 'capturing') {
        throw new CommerceHttpError(409, 'order_locked', 'L’ordine non può più essere annullato da qui');
      }
      if (fulfillmentStatus(order) === 'cancelled') return;
      transaction.update(orderRef, {
        fulfillment: { ...order.fulfillment, status: 'cancelled', cancelledAt: now },
        stato: 'annullato',
        payment: resetPendingPayment(order.payment),
        retention: cancelledRetention(now, 'cancelled'),
        updatedAt: now,
      });
    });
    return { cancelled: true };
  }
}

/**
 * Dopo una modifica il vecchio ordine PayPal non vale più: se ne creerà uno
 * nuovo, con il tentativo successivo. Un pagamento già avviato resta un
 * pagamento non andato a buon fine, mai uno stato "pagato".
 */
export function resetPendingPayment(payment: any): Record<string, unknown> {
  return {
    method: 'paypal',
    status: 'pending',
    ...(Number.isSafeInteger(payment?.attempt) ? { attempt: payment.attempt } : {}),
  };
}
