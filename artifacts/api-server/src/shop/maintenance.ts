import { SHOP_ORDER_TYPE } from '@shared/shop-types';
import { timestampMillis } from '../commerce/text.js';
import type { ShopMailer } from './mail.js';
import { SHOP_ASSETS, fulfillmentStatus, isPaid } from './order-model.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Promemoria foto: giorni dopo il pagamento. */
export const SHOP_PHOTO_REMINDER_DAYS = [2, 5] as const;

export interface ShopMaintenanceDeps {
  db: any;
  storage: any;
  mailer: ShopMailer;
  now?: () => Date;
}

export interface ShopMaintenanceResult {
  dryRun: boolean;
  reminders: number;
  overdue: number;
  mailsRetried: number;
  purgedOrders: number;
  purgedFiles: number;
  expiredUploads: number;
  failures: Array<{ orderId: string; error: string }>;
}

const TERMINAL = new Set(['delivered', 'cancelled']);
const UNPAID_EDITABLE = new Set(['draft', 'awaiting_payment']);

/**
 * Lavori periodici dello shop: promemoria per le foto mancanti, segnalazione
 * dei ritardi, nuovi tentativi per le email fallite e cancellazione delle foto
 * quando non servono più. Va chiamato da un processo pianificato.
 */
export class ShopMaintenance {
  constructor(private readonly deps: ShopMaintenanceDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  async run(options: { dryRun?: boolean } = {}): Promise<ShopMaintenanceResult> {
    const dryRun = options.dryRun === true;
    const result: ShopMaintenanceResult = {
      dryRun,
      reminders: 0,
      overdue: 0,
      mailsRetried: 0,
      purgedOrders: 0,
      purgedFiles: 0,
      expiredUploads: 0,
      failures: [],
    };
    const snapshot = await this.deps.db.collection('orders').where('orderType', '==', SHOP_ORDER_TYPE).get();
    for (const doc of snapshot.docs) {
      const order = doc.data();
      if (order.retention?.status === 'purged') continue;
      try {
        await this.processOrder(doc.id, order, result, dryRun);
      } catch (error) {
        result.failures.push({ orderId: doc.id, error: String((error as any)?.message || error).slice(0, 300) });
      }
    }
    return result;
  }

  private async processOrder(orderId: string, order: any, result: ShopMaintenanceResult, dryRun: boolean): Promise<void> {
    const now = this.now();
    const nowMs = now.getTime();
    const status = fulfillmentStatus(order);
    const paid = isPaid(order);
    const capturing = order.payment?.captureStatus === 'capturing';

    // 1. Foto mancanti: promemoria e segnalazione del ritardo.
    if (paid && status === 'awaiting_photos') {
      const deadline = timestampMillis(order.shop?.photoDeadlineAt);
      const paidAt = timestampMillis(order.shop?.paidAt || order.payment?.paidAt);
      if (deadline > nowMs && paidAt > 0) {
        const dueIndexes = SHOP_PHOTO_REMINDER_DAYS.map((days, index) => (paidAt + days * DAY_MS <= nowMs ? index : -1)).filter(index => index >= 0);
        const latest = dueIndexes[dueIndexes.length - 1];
        if (latest !== undefined) {
          const key = `photos_reminder_${latest + 1}`;
          if (order.shop?.notifications?.[key]?.status !== 'sent') {
            if (dryRun) result.reminders++;
            else if ((await this.deps.mailer.send(orderId, 'photos_reminder', { key })) === 'sent') result.reminders++;
          }
        }
      }
      if (deadline > 0 && deadline <= nowMs && order.shop?.photoOverdue !== true) {
        result.overdue++;
        if (!dryRun) await this.flagOverdue(orderId, order);
      }
    }

    // 2. Email da riprovare.
    if (!dryRun && order.shop?.notifications) result.mailsRetried += await this.deps.mailer.retryOrder(orderId, order);

    // 3. Foto caricate a metà e mai concluse.
    if (!capturing && (UNPAID_EDITABLE.has(status) || status === 'awaiting_photos')) {
      result.expiredUploads += await this.removeExpiredUploads(orderId, nowMs, dryRun);
    }

    // 4. Cancellazione delle foto quando non servono più.
    const deleteAfter = timestampMillis(order.retention?.deleteAfter);
    const purgeStatus = order.retention?.status;
    const retryable = purgeStatus === 'scheduled' || purgeStatus === 'failed' || purgeStatus === 'purging';
    const draftExpired = !paid && UNPAID_EDITABLE.has(status) && deleteAfter > 0 && deleteAfter <= nowMs;
    const terminalDue = TERMINAL.has(status) && retryable && deleteAfter > 0 && deleteAfter <= nowMs;
    if (!capturing && (draftExpired || terminalDue)) {
      result.purgedOrders++;
      if (!dryRun) result.purgedFiles += await this.purgeOrder(orderId, draftExpired);
    }
  }

  private async flagOverdue(orderId: string, order: any): Promise<void> {
    const now = this.now();
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    await this.deps.db.runTransaction(async (transaction: any) => {
      const fresh = await transaction.get(orderRef);
      const current = fresh.exists ? fresh.data() : undefined;
      if (!current || current.shop?.photoOverdue === true || fulfillmentStatus(current) !== 'awaiting_photos') return;
      transaction.update(orderRef, { shop: { ...(current.shop || {}), photoOverdue: true, photoOverdueAt: now }, updatedAt: now });
      transaction.set(this.deps.db.collection('adminNotifications').doc(`shop-photos-overdue-${orderId}`), {
        type: 'shop_order',
        title: 'Foto in ritardo',
        description: `Ordine ${order.orderNumber || orderId}: le foto non sono arrivate entro il termine`,
        orderId,
        relatedDocId: orderId,
        relatedDocType: 'shop_order',
        isRead: false,
        createdAt: now,
        deepLink: `/admin/dashboard?shopOrderId=${encodeURIComponent(orderId)}`,
      });
    });
    await this.deps.mailer.send(orderId, 'admin_photos_overdue');
  }

  private async deleteFile(path: unknown): Promise<void> {
    if (typeof path !== 'string' || !path) return;
    await this.deps.storage.bucket().file(path).delete({ ignoreNotFound: true });
  }

  /** Foto preparate ma mai concluse, scadute: via file e documento. */
  private async removeExpiredUploads(orderId: string, nowMs: number, dryRun: boolean): Promise<number> {
    const assets = await this.deps.db.collection('orders').doc(orderId).collection(SHOP_ASSETS).get();
    let removed = 0;
    for (const doc of assets.docs) {
      const asset = doc.data();
      if (asset.status !== 'prepared' || timestampMillis(asset.expiresAt) > nowMs) continue;
      removed++;
      if (dryRun) continue;
      await this.deleteFile(asset.storagePath);
      await doc.ref.delete();
    }
    return removed;
  }

  /**
   * Cancella le foto di un ordine. Una bozza scaduta e mai pagata diventa un
   * ordine annullato. Se un file non si cancella, l'ordine resta "failed" e al
   * giro successivo si riprova.
   */
  private async purgeOrder(orderId: string, expireDraft: boolean): Promise<number> {
    const now = this.now();
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    let claimed = false;
    await this.deps.db.runTransaction(async (transaction: any) => {
      claimed = false;
      const fresh = await transaction.get(orderRef);
      const order = fresh.exists ? fresh.data() : undefined;
      if (!order || order.retention?.status === 'purged' || order.payment?.captureStatus === 'capturing') return;
      if (expireDraft && isPaid(order)) return;
      transaction.update(orderRef, {
        retention: { ...(order.retention || {}), status: 'purging', purgeClaimedAt: now },
        ...(expireDraft
          ? { fulfillment: { ...order.fulfillment, status: 'cancelled', cancelledAt: now, cancellationReason: 'draft_expired' }, stato: 'annullato' }
          : {}),
        updatedAt: now,
      });
      claimed = true;
    });
    if (!claimed) return 0;

    let deleted = 0;
    try {
      const assets = await orderRef.collection(SHOP_ASSETS).get();
      for (const doc of assets.docs) {
        const asset = doc.data();
        if (asset.status === 'purged') continue;
        await this.deleteFile(asset.storagePath);
        deleted++;
        await doc.ref.update({ status: 'purged', storagePath: null, assetsPurgedAt: now, updatedAt: now });
      }
      await orderRef.update({ 'retention.status': 'purged', 'retention.assetsPurgedAt': now, updatedAt: now });
    } catch (error) {
      await orderRef
        .update({
          'retention.status': 'failed',
          'retention.lastError': String((error as any)?.message || error).slice(0, 500),
          'retention.lastAttemptAt': now,
          updatedAt: now,
        })
        .catch(() => undefined);
      throw error;
    }
    return deleted;
  }
}
