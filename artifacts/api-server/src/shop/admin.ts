import { shopOrderWeight } from '@shared/shop-shipping';
import {
  SHOP_ORDER_TYPE,
  SHOP_RESENDABLE_MAILS,
  SHOP_TRACKING_CARRIER_MAX,
  SHOP_TRACKING_CODE_MAX,
  shopPhotosMissing,
  type ShopAdminHistoryEntry,
  type ShopAdminNotificationDto,
  type ShopAdminOrderDto,
  type ShopAdminOrderSummaryDto,
  type ShopAdminView,
  type ShopFulfillmentMethod,
  type ShopFulfillmentStatus,
  type ShopOrderLineDto,
  type ShopResendableMail,
} from '@shared/shop-types';
import { assertDocumentId } from '../commerce/checkout-input.js';
import { CommerceHttpError } from '../commerce/errors.js';
import { cleanText, timestampMillis } from '../commerce/text.js';
import type { ShopMailer } from './mail.js';
import {
  SHOP_ASSETS,
  cancelledRetention,
  deliveredRetention,
  fulfillmentStatus,
  iso,
  isPaid,
  publicAsset,
} from './order-model.js';
import type { ShopService } from './service.js';
import type { ShopUploadService } from './uploads.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 50;
const LIST_LIMIT = 300;

export type AdminTargetStatus = 'in_production' | 'ready_for_pickup' | 'shipped' | 'delivered' | 'cancelled';

export interface ShopAdminDeps {
  db: any;
  mailer: ShopMailer;
  uploads: Pick<ShopUploadService, 'adminRemove'>;
  shop: ShopService;
  now?: () => Date;
}

/** Stati in cui lo studio può portare un ordine pagato, a partire dallo stato di adesso. */
export function allowedAdminTransitions(order: any): ShopFulfillmentStatus[] {
  if (!isPaid(order) || order.payment?.status === 'refunded') return [];
  const method: ShopFulfillmentMethod = order.fulfillment?.method === 'shipping' ? 'shipping' : 'studio_pickup';
  switch (fulfillmentStatus(order)) {
    case 'awaiting_photos':
      return ['cancelled'];
    case 'photos_received':
      return ['in_production', 'cancelled'];
    case 'in_production':
      return [method === 'shipping' ? 'shipped' : 'ready_for_pickup', 'cancelled'];
    case 'ready_for_pickup':
      return ['delivered', 'cancelled'];
    case 'shipped':
      return ['delivered'];
    default:
      return [];
  }
}

function needsAttention(order: any): boolean {
  return (
    order.payment?.status === 'paid_action_required' ||
    order.shop?.photoOverdue === true ||
    order.shop?.refundedAfterShipping === true ||
    order.shop?.refundPending === true ||
    order.payment?.status === 'failed'
  );
}

function summary(id: string, order: any, photosMissing: number | null): ShopAdminOrderSummaryDto {
  return {
    id,
    orderNumber: String(order.orderNumber || id),
    createdAt: iso(order.createdAt),
    paidAt: iso(order.payment?.paidAt),
    customerName: String(order.customer?.name || order.nomeCliente || ''),
    customerEmail: String(order.customer?.email || order.emailCliente || ''),
    fulfillmentStatus: fulfillmentStatus(order),
    paymentStatus: order.payment?.status || 'pending',
    method: order.fulfillment?.method === 'shipping' ? 'shipping' : 'studio_pickup',
    totalCents: Number(order.totals?.totalCents || 0),
    lineCount: Array.isArray(order.lines) ? order.lines.length : 0,
    photosMissing,
    photoDeadlineAt: iso(order.shop?.photoDeadlineAt),
    photoOverdue: order.shop?.photoOverdue === true,
    needsAttention: needsAttention(order),
  };
}

function inView(order: any, view: ShopAdminView): boolean {
  const status = fulfillmentStatus(order);
  const paid = isPaid(order);
  // Una bozza annullata mai pagata non è un ordine.
  if (status === 'cancelled' && !order.payment?.paidAt) return false;
  switch (view) {
    case 'active':
      return paid && ['awaiting_photos', 'photos_received', 'in_production', 'ready_for_pickup', 'shipped'].includes(status);
    case 'attention':
      return needsAttention(order);
    case 'drafts':
      return !paid && ['draft', 'awaiting_payment'].includes(status);
    case 'closed':
      return status === 'delivered' || status === 'cancelled';
    case 'all':
      return true;
  }
}

/**
 * Gestione degli ordini per lo studio: elenco, dettaglio, avanzamento con
 * regole precise, richiesta di una foto nuova, email da rifare e ordini
 * riattivati dopo un pagamento arrivato in ritardo.
 */
export class ShopAdminService {
  constructor(private readonly deps: ShopAdminDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private orderRef(orderId: string) {
    return this.deps.db.collection('orders').doc(orderId);
  }

  private async requireOrder(orderId: string): Promise<any> {
    assertDocumentId(orderId, 'orderId');
    const doc = await this.orderRef(orderId).get();
    const data = doc.exists ? doc.data() : undefined;
    if (!data || data.orderType !== SHOP_ORDER_TYPE) throw new CommerceHttpError(404, 'order_not_found', 'Ordine non trovato');
    return { id: doc.id, ...data };
  }

  private async assets(orderId: string): Promise<any[]> {
    const snapshot = await this.orderRef(orderId).collection(SHOP_ASSETS).get();
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  }

  async listOrders(options: { view?: ShopAdminView; q?: string } = {}): Promise<ShopAdminOrderSummaryDto[]> {
    const view = options.view ?? 'active';
    const q = (options.q || '').trim().toLowerCase();
    const snapshot = await this.deps.db.collection('orders').where('orderType', '==', SHOP_ORDER_TYPE).get();
    let orders = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })).filter((order: any) => inView(order, view));
    if (q) {
      orders = orders.filter((order: any) =>
        [order.orderNumber, order.nomeCliente, order.emailCliente, order.customer?.name]
          .filter(Boolean)
          .some((value: string) => String(value).toLowerCase().includes(q)),
      );
    }
    // Da lavorare: prima chi ha pagato da più tempo. Gli altri elenchi: i più recenti.
    orders.sort((a: any, b: any) =>
      view === 'active'
        ? timestampMillis(a.payment?.paidAt) - timestampMillis(b.payment?.paidAt)
        : timestampMillis(b.createdAt) - timestampMillis(a.createdAt),
    );
    const limited = orders.slice(0, LIST_LIMIT);
    return Promise.all(
      limited.map(async (order: any) => {
        const waitingPhotos = fulfillmentStatus(order) === 'awaiting_photos' || !isPaid(order);
        const missing = waitingPhotos
          ? shopPhotosMissing(Array.isArray(order.lines) ? order.lines : [], await this.assets(order.id))
          : null;
        return summary(order.id, order, missing);
      }),
    );
  }

  async getOrder(orderId: string): Promise<ShopAdminOrderDto> {
    const order = await this.requireOrder(orderId);
    const assets = (await this.assets(orderId)).filter(asset => asset.status !== 'purged');
    const lines: ShopOrderLineDto[] = Array.isArray(order.lines) ? order.lines : [];
    const dtoAssets = assets.map(asset => publicAsset(asset.id, asset));
    const photosMissing = shopPhotosMissing(lines, dtoAssets);
    const method: ShopFulfillmentMethod = order.fulfillment?.method === 'shipping' ? 'shipping' : 'studio_pickup';
    const tracking = order.fulfillment?.tracking;
    const status = fulfillmentStatus(order);
    const notifications = Object.entries<any>(order.shop?.notifications || {}).map(([key, state]): ShopAdminNotificationDto => ({
      key,
      kind: String(state?.kind || key),
      status: state?.status === 'sent' ? 'sent' : state?.status === 'failed' ? 'failed' : 'sending',
      attempts: Number(state?.attempts || 0),
      sentAt: iso(state?.sentAt),
      lastError: state?.lastError ? String(state.lastError) : null,
    }));
    const history: ShopAdminHistoryEntry[] = (Array.isArray(order.shop?.history) ? order.shop.history : []).map((entry: any) => ({
      at: iso(entry.at),
      by: String(entry.by || ''),
      from: entry.from,
      to: entry.to,
      note: entry.note ? String(entry.note) : null,
    }));
    return {
      ...summary(orderId, order, photosMissing),
      customer: {
        name: String(order.customer?.name || order.nomeCliente || ''),
        email: String(order.customer?.email || order.emailCliente || ''),
        phone: order.customer?.phone ? String(order.customer.phone) : null,
      },
      customerNotes: order.shop?.customerNotes ? String(order.shop.customerNotes) : null,
      adminNotes: order.shop?.adminNotes ? String(order.shop.adminNotes) : null,
      lines: lines.map(line => {
        const photos = dtoAssets.filter(asset => asset.lineId === line.lineId);
        return { ...line, photos, photosMissing: Math.max(0, line.photosRequired - photos.filter(photo => photo.status === 'ready').length) };
      }),
      totals: {
        subtotalCents: Number(order.totals?.subtotalCents || 0),
        shippingCents: Number(order.totals?.shippingCents || 0),
        totalCents: Number(order.totals?.totalCents || 0),
      },
      weightGrams: (() => {
        const weight = shopOrderWeight(lines);
        return weight.complete && weight.grams > 0 ? weight.grams : null;
      })(),
      fulfillment: {
        shippingAddress: order.fulfillment?.shippingAddress ?? null,
        tracking: tracking?.code ? { carrier: String(tracking.carrier || ''), code: String(tracking.code) } : null,
        readyAt: iso(order.fulfillment?.readyAt),
        shippedAt: iso(order.fulfillment?.shippedAt),
        deliveredAt: iso(order.fulfillment?.deliveredAt),
      },
      billingDetails: order.billingDetails ?? null,
      payment: {
        amountCents: Number(order.payment?.amountCents || 0),
        paypalFeeCents: Number(order.payment?.paypalFeeCents || 0),
        netAmountCents: Number(order.payment?.netAmountCents || 0),
        refundedCents: Number(order.payment?.refundedCents || 0),
        paypalOrderId: order.payment?.paypalOrderId ? String(order.payment.paypalOrderId) : null,
        paypalCaptureId: order.payment?.paypalCaptureId ? String(order.payment.paypalCaptureId) : null,
        reconciliationRequired: order.payment?.reconciliationRequired === true,
        reconciliationReason: order.payment?.reconciliationReason ? String(order.payment.reconciliationReason) : null,
      },
      legal: order.legal
        ? {
            acceptedAt: iso(order.legal.termsAcceptedAt),
            termsVersion: order.legal.termsVersion ? String(order.legal.termsVersion) : null,
            manifestHash: order.legal.manifestHash ? String(order.legal.manifestHash) : null,
          }
        : null,
      notifications,
      history,
      refundedAfterShipping: order.shop?.refundedAfterShipping === true,
      refundPending: order.shop?.refundPending === true,
      allowedStatuses: allowedAdminTransitions(order),
      canReactivate: order.payment?.status === 'paid_action_required' && status === 'cancelled' && order.retention?.status !== 'purged' && order.retention?.status !== 'purging',
      canRequestNewPhoto: isPaid(order) && ['awaiting_photos', 'photos_received', 'in_production'].includes(status),
    };
  }

  /** Porta l'ordine allo stato successivo, solo lungo i passaggi consentiti. */
  async updateStatus(
    orderId: string,
    adminEmail: string,
    input: { status: AdminTargetStatus; note?: string; tracking?: { carrier?: string; code: string } },
  ): Promise<ShopAdminOrderDto> {
    const orderRef = this.orderRef(orderId);
    const now = this.now();
    const note = cleanText(input.note, 500);
    let mailKind: 'ready_for_pickup' | 'shipped' | 'delivered' | 'cancelled' | undefined;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const fresh = await transaction.get(orderRef);
      const order = fresh.exists ? fresh.data() : undefined;
      if (!order || order.orderType !== SHOP_ORDER_TYPE) throw new CommerceHttpError(404, 'order_not_found', 'Ordine non trovato');
      const from = fulfillmentStatus(order);
      if (!allowedAdminTransitions(order).includes(input.status)) {
        throw new CommerceHttpError(409, 'transition_not_allowed', 'Questo passaggio non è consentito per lo stato attuale dell’ordine');
      }
      if (input.status === 'cancelled' && !note) {
        throw new CommerceHttpError(400, 'reason_required', 'Scrivi il motivo dell’annullamento');
      }
      const code = cleanText(input.tracking?.code, SHOP_TRACKING_CODE_MAX);
      if (input.status === 'shipped' && !code) {
        throw new CommerceHttpError(400, 'tracking_required', 'Inserisci il codice di tracciamento prima di segnare l’ordine come spedito');
      }
      const history = [...(Array.isArray(order.shop?.history) ? order.shop.history : []), { at: now, by: adminEmail, from, to: input.status, ...(note ? { note } : {}) }].slice(-HISTORY_LIMIT);
      const fulfillment: Record<string, unknown> = { ...order.fulfillment, status: input.status };
      const update: Record<string, unknown> = { shop: { ...(order.shop || {}), history }, updatedAt: now };
      switch (input.status) {
        case 'in_production':
          update.stato = 'in_lavorazione';
          break;
        case 'ready_for_pickup':
          fulfillment.readyAt = now;
          update.stato = 'in_lavorazione';
          mailKind = 'ready_for_pickup';
          break;
        case 'shipped':
          fulfillment.shippedAt = now;
          fulfillment.tracking = { carrier: cleanText(input.tracking?.carrier, SHOP_TRACKING_CARRIER_MAX) || '', code };
          update.stato = 'in_lavorazione';
          mailKind = 'shipped';
          break;
        case 'delivered':
          fulfillment.deliveredAt = now;
          update.stato = 'completato';
          update.retention = deliveredRetention(now);
          mailKind = 'delivered';
          break;
        case 'cancelled':
          fulfillment.cancelledAt = now;
          fulfillment.cancellationReason = note;
          update.stato = 'annullato';
          update.retention = cancelledRetention(now, 'cancelled');
          // Se è già pagato il rimborso si fa da PayPal: lo segnaliamo finché non arriva.
          update.shop = { ...(update.shop as object), refundPending: order.payment?.status === 'paid' };
          mailKind = 'cancelled';
          break;
      }
      update.fulfillment = fulfillment;
      transaction.update(orderRef, update);
    });
    if (mailKind) await this.deps.mailer.send(orderId, mailKind);
    return this.getOrder(orderId);
  }

  /** Elenco delle foto da mettere nell'archivio dell'ordine, con il nome di ogni file dentro l'archivio. */
  async archiveEntries(orderId: string): Promise<{ orderNumber: string; entries: Array<{ assetId: string; name: string }> }> {
    const order = await this.requireOrder(orderId);
    const assets = (await this.assets(orderId)).filter(asset => asset.status === 'ready');
    const lines: ShopOrderLineDto[] = Array.isArray(order.lines) ? order.lines : [];
    const pad = (value: number) => String(value).padStart(2, '0');
    const slug = (value: string) =>
      value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'prodotto';
    const safeFile = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'foto.jpg';
    const entries: Array<{ assetId: string; name: string }> = [];
    lines.forEach((line, lineIndex) => {
      assets
        .filter(asset => asset.lineId === line.lineId)
        .forEach((asset, assetIndex) => {
          entries.push({
            assetId: asset.id,
            name: `${pad(lineIndex + 1)}-${slug(line.productName)}/${pad(assetIndex + 1)}-${safeFile(String(asset.originalName || `${asset.id}.jpg`))}`,
          });
        });
    });
    return { orderNumber: String(order.orderNumber || orderId), entries };
  }

  async setAdminNotes(orderId: string, note: string): Promise<ShopAdminOrderDto> {
    const orderRef = this.orderRef(orderId);
    await this.requireOrder(orderId);
    await orderRef.update({ 'shop.adminNotes': cleanText(note, 2000) ?? '', updatedAt: this.now() });
    return this.getOrder(orderId);
  }

  async resendNotification(orderId: string, kind: ShopResendableMail): Promise<ShopAdminOrderDto> {
    if (!SHOP_RESENDABLE_MAILS.includes(kind)) throw new CommerceHttpError(400, 'invalid_mail', 'Email non valida');
    await this.requireOrder(orderId);
    const result = await this.deps.mailer.send(orderId, kind, {
      force: true,
      key: kind === 'photos_reminder' ? `photos_reminder_manual_${this.now().getTime()}` : kind,
    });
    if (result === 'failed') throw new CommerceHttpError(502, 'mail_failed', 'Non sono riuscito a inviare l’email: riprova tra poco');
    return this.getOrder(orderId);
  }

  /**
   * La foto non è adatta: la togliamo, l'ordine torna "mancano delle foto" con un
   * nuovo termine, e il cliente riceve una email con il motivo.
   */
  async requestNewPhoto(orderId: string, assetId: string, adminEmail: string, reason: string): Promise<ShopAdminOrderDto> {
    const cleanReason = cleanText(reason, 300);
    if (!cleanReason) throw new CommerceHttpError(400, 'reason_required', 'Scrivi che cosa non va nella foto');
    const settings = await this.deps.shop.settings();
    const order = await this.requireOrder(orderId);
    if (!isPaid(order) || !['awaiting_photos', 'photos_received', 'in_production'].includes(fulfillmentStatus(order))) {
      throw new CommerceHttpError(409, 'transition_not_allowed', 'Non si può chiedere una foto nuova per lo stato attuale dell’ordine');
    }
    const removed = await this.deps.uploads.adminRemove(orderId, assetId);
    const now = this.now();
    const orderRef = this.orderRef(orderId);
    await this.deps.db.runTransaction(async (transaction: any) => {
      const fresh = await transaction.get(orderRef);
      const current = fresh.exists ? fresh.data() : undefined;
      if (!current) return;
      const from = fulfillmentStatus(current);
      const history = [...(Array.isArray(current.shop?.history) ? current.shop.history : []), { at: now, by: adminEmail, from, to: 'awaiting_photos', note: `Foto da sostituire: ${cleanReason}` }].slice(-HISTORY_LIMIT);
      transaction.update(orderRef, {
        fulfillment: { ...current.fulfillment, status: 'awaiting_photos' },
        stato: 'in_lavorazione',
        shop: {
          ...(current.shop || {}),
          photoOverdue: false,
          photoDeadlineAt: new Date(now.getTime() + settings.photoWaitDays * DAY_MS),
          lastPhotoRejection: { reason: cleanReason, at: now, lineId: removed.lineId, fileName: removed.originalName },
          history,
        },
        updatedAt: now,
      });
    });
    await this.deps.mailer.send(orderId, 'photo_rejected', { force: true, key: `photo_rejected_${assetId}` });
    return this.getOrder(orderId);
  }

  /** Tiene un pagamento arrivato quando l'ordine era già annullato: l'ordine riparte. */
  async reactivate(orderId: string, adminEmail: string): Promise<ShopAdminOrderDto> {
    const settings = await this.deps.shop.settings();
    const orderRef = this.orderRef(orderId);
    const now = this.now();
    const assets = await this.assets(orderId);
    await this.deps.db.runTransaction(async (transaction: any) => {
      const fresh = await transaction.get(orderRef);
      const order = fresh.exists ? fresh.data() : undefined;
      if (!order || order.orderType !== SHOP_ORDER_TYPE) throw new CommerceHttpError(404, 'order_not_found', 'Ordine non trovato');
      if (
        order.payment?.status !== 'paid_action_required' ||
        fulfillmentStatus(order) !== 'cancelled' ||
        order.retention?.status === 'purged' ||
        order.retention?.status === 'purging'
      ) {
        throw new CommerceHttpError(409, 'transition_not_allowed', 'Questo ordine non si può riattivare');
      }
      const missing = shopPhotosMissing(Array.isArray(order.lines) ? order.lines : [], assets);
      const to: ShopFulfillmentStatus = missing > 0 ? 'awaiting_photos' : 'photos_received';
      const { cancelledAt: _cancelledAt, cancellationReason: _reason, ...fulfillment } = order.fulfillment || {};
      const { reconciliationRequired: _required, reconciliationReason: _why, ...payment } = order.payment || {};
      const history = [...(Array.isArray(order.shop?.history) ? order.shop.history : []), { at: now, by: adminEmail, from: 'cancelled', to, note: 'Ordine riattivato dopo il pagamento' }].slice(-HISTORY_LIMIT);
      transaction.update(orderRef, {
        payment: { ...payment, status: 'paid' },
        fulfillment: { ...fulfillment, status: to },
        stato: 'in_lavorazione',
        retention: { status: 'production' },
        shop: {
          ...(order.shop || {}),
          photoOverdue: false,
          photoDeadlineAt: missing > 0 ? new Date(now.getTime() + settings.photoWaitDays * DAY_MS) : null,
          history,
        },
        updatedAt: now,
      });
    });
    await this.deps.mailer.send(orderId, 'order_confirmed', { force: true });
    return this.getOrder(orderId);
  }
}
