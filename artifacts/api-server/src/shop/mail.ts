import { CommerceHttpError } from '../commerce/errors.js';
import { cleanText, timestampMillis } from '../commerce/text.js';
import { SHOP_ADMIN_MAIL_KINDS, shopMailContent, type ShopMailContext, type ShopMailKind } from './mail-templates.js';
import { SHOP_ASSETS } from './order-model.js';

const CLAIM_MS = 2 * 60 * 1000;
export const SHOP_MAIL_MAX_ATTEMPTS = 5;
export const SHOP_MAIL_RETRY_MS = 15 * 60 * 1000;

export interface ShopMailAdapter {
  send(
    to: string,
    subject: string,
    html: string,
    log: { type: string; relatedDocId: string; relatedDocType: string; clientName?: string },
  ): Promise<void>;
  studio(): Promise<{ name: string; email?: string; phone?: string; address?: string }>;
}

export interface ShopMailerDeps {
  db: any;
  mail: ShopMailAdapter;
  siteUrl: () => string;
  now?: () => Date;
}

export type ShopMailResult = 'sent' | 'skipped' | 'failed';

/**
 * Invio delle email dell'ordine. Ogni email parte una volta sola: lo stato di
 * ogni invio (`shop.notifications.<chiave>`) sta nell'ordine, e un invio fallito
 * si riprova dalla pulizia periodica o dal pannello admin.
 */
export class ShopMailer {
  constructor(private readonly deps: ShopMailerDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  /**
   * Invia l'email `kind` dell'ordine. `key` distingue invii dello stesso tipo
   * (per esempio i promemoria). Con `force` si reinvia anche se è già partita.
   */
  async send(orderId: string, kind: ShopMailKind, options: { key?: string; force?: boolean } = {}): Promise<ShopMailResult> {
    const key = options.key || kind;
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    const now = this.now();
    let claimed = false;
    await this.deps.db.runTransaction(async (transaction: any) => {
      claimed = false;
      const fresh = await transaction.get(orderRef);
      const order = fresh.exists ? fresh.data() : undefined;
      if (!order || order.orderType !== 'shop') throw new CommerceHttpError(404, 'order_not_found', 'Ordine non trovato');
      const state = order.shop?.notifications?.[key];
      if (!options.force && state?.status === 'sent') return;
      if (state?.status === 'sending' && timestampMillis(state.claimedAt) > now.getTime() - CLAIM_MS) return;
      transaction.update(orderRef, {
        [`shop.notifications.${key}`]: {
          kind,
          key,
          status: 'sending',
          claimedAt: now,
          attempts: Number(state?.attempts || 0) + 1,
          ...(state?.sentAt ? { sentAt: state.sentAt } : {}),
        },
      });
      claimed = true;
    });
    if (!claimed) return 'skipped';

    try {
      const orderDoc = await orderRef.get();
      const order = { id: orderId, ...orderDoc.data() };
      const assets = (await orderRef.collection(SHOP_ASSETS).get()).docs.map((doc: any) => doc.data());
      const studio = await this.deps.mail.studio();
      const ctx: ShopMailContext = {
        studioName: studio.name,
        studioPhone: studio.phone,
        studioEmail: studio.email,
        studioAddress: studio.address,
        siteUrl: this.deps.siteUrl(),
      };
      const isAdmin = SHOP_ADMIN_MAIL_KINDS.includes(kind);
      const to = isAdmin ? cleanText(studio.email, 254) : cleanText(order.emailCliente, 254);
      if (!to) throw new Error(isAdmin ? 'Email dello studio non configurata' : 'Email del cliente mancante');
      const content = shopMailContent(kind, { ...order, __assets: assets }, ctx);
      await this.deps.mail.send(to, content.subject, content.html, {
        type: `shop_order_${kind}`,
        relatedDocId: orderId,
        relatedDocType: 'shop_order',
        clientName: cleanText(order.nomeCliente, 160),
      });
      await orderRef.update({
        [`shop.notifications.${key}.status`]: 'sent',
        [`shop.notifications.${key}.sentAt`]: this.now(),
        [`shop.notifications.${key}.lastError`]: null,
      });
      return 'sent';
    } catch (error) {
      await orderRef
        .update({
          [`shop.notifications.${key}.status`]: 'failed',
          [`shop.notifications.${key}.lastAttemptAt`]: this.now(),
          [`shop.notifications.${key}.lastError`]: String((error as any)?.message || error).slice(0, 500),
        })
        .catch(() => undefined);
      console.error(`⚠️ [Shop] email ${key} non inviata per l'ordine ${orderId}:`, error);
      return 'failed';
    }
  }

  /**
   * Riprova gli invii falliti o rimasti a metà. Restituisce quanti ne ha ripresi.
   */
  async retryOrder(orderId: string, order: any): Promise<number> {
    const notifications = order.shop?.notifications || {};
    let retried = 0;
    for (const [key, state] of Object.entries<any>(notifications)) {
      const attempts = Number(state?.attempts || 0);
      if (!state?.kind || attempts >= SHOP_MAIL_MAX_ATTEMPTS) continue;
      const last = timestampMillis(state.lastAttemptAt) || timestampMillis(state.claimedAt);
      const due = last <= this.now().getTime() - SHOP_MAIL_RETRY_MS;
      if ((state.status === 'failed' || state.status === 'sending') && due) {
        const result = await this.send(orderId, state.kind, { key });
        if (result === 'sent') retried++;
      }
    }
    return retried;
  }
}
