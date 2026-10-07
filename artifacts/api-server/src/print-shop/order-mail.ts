import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { printOrderPhone, printOrderWhatsAppLink } from '@shared/print-order-contact';
import type { PrintShopMailAdapter } from './service.js';

export const PRINT_REMINDER_DAY = 86_400_000;
const LEASE = 10 * 60_000;
const RETRY = 60 * 60_000;
const MAX_ATTEMPTS = 3;
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const millis = (value: any): number => value?.toMillis?.() ?? 0;
const validEmail = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length <= 254
  && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value.trim());

export function newPrintRecovery(now: Timestamp, retentionDays = 8) {
  return {
    version: 1, sentCount: 0, attempts: 0, status: 'pending',
    endsAt: Timestamp.fromMillis(now.toMillis() + 7 * PRINT_REMINDER_DAY),
    expiresAt: Timestamp.fromMillis(now.toMillis() + Math.max(8, retentionDays) * PRINT_REMINDER_DAY),
  };
}

export function recoverablePrintOrder(order: any, now: number): boolean {
  return order.orderType === 'print_shop'
    && ['draft', 'awaiting_payment'].includes(order.fulfillment?.status)
    && ['pending', 'failed'].includes(order.payment?.status)
    && !order.payment?.paidAt && !order.payment?.paypalCaptureId
    && !order.deletedAt && !order.adminVisibility?.hidden
    && !['purging', 'purged', 'failed', 'capture_in_progress'].includes(order.retention?.status)
    && millis(order.retention?.deleteAfter) > now;
}

interface Dependencies {
  db: any;
  storage: any;
  mail?: PrintShopMailAdapter;
  now: () => Timestamp;
  siteUrl: () => string;
}

/** Narrow order-only queue. Due fields are removed on termination, so bounded
 * inequality queries make progress without scanning historical orders. */
export class PrintOrderMail {
  constructor(private readonly deps: Dependencies) {}

  async retryAdmin(orderId: string): Promise<boolean> {
    const ref = this.deps.db.collection('orders').doc(orderId);
    const ready = await this.deps.db.runTransaction(async (tx: any) => {
      const doc = await tx.get(ref);
      const state = doc.data()?.printAdminMail;
      if (!doc.exists || !state || !['failed', 'uncertain'].includes(state.status) ||
          Number(state.attempts || 0) >= MAX_ATTEMPTS) return false;
      tx.update(ref, { printAdminMailDueAt: this.deps.now(), 'printAdminMail.status': 'pending' });
      return true;
    });
    return ready ? this.send(orderId, 'admin') : false;
  }

  async stop(identity: { uid: string }, orderId: string) {
    const ref = this.deps.db.collection('orders').doc(orderId);
    return this.deps.db.runTransaction(async (tx: any) => {
      const doc = await tx.get(ref);
      if (!doc.exists || doc.data()?.ownerUid !== identity.uid ||
          doc.data()?.orderType !== 'print_shop') return false;
      tx.update(ref, {
        'printRecovery.stoppedAt': this.deps.now(),
        'printRecovery.status': 'stopped',
        printRecoveryDueAt: FieldValue.delete(),
      });
      return true;
    });
  }

  async run(limit = 25) {
    const results = { admin: 0, reminders: 0, errors: 0 };
    for (const kind of ['admin', 'recovery'] as const) {
      const due = kind === 'admin' ? 'printAdminMailDueAt' : 'printRecoveryDueAt';
      const docs = await this.deps.db.collection('orders')
        .where(due, '<=', this.deps.now()).limit(Math.min(50, Math.max(1, limit))).get();
      for (const doc of docs.docs) {
        try {
          if (await this.send(doc.id, kind)) {
            if (kind === 'admin') results.admin++; else results.reminders++;
          }
        } catch {
          // A storage/database failure must not block the other maintenance jobs.
          results.errors++;
        }
      }
    }
    return results;
  }

  async send(orderId: string, kind: 'admin' | 'recovery'): Promise<boolean> {
    if (!this.deps.mail) return false;
    const ref = this.deps.db.collection('orders').doc(orderId);
    const field = kind === 'admin' ? 'printAdminMail' : 'printRecovery';
    const due = kind === 'admin' ? 'printAdminMailDueAt' : 'printRecoveryDueAt';
    const token = randomUUID();
    const now = this.deps.now();
    const order = await this.deps.db.runTransaction(async (tx: any) => {
      const doc = await tx.get(ref);
      if (!doc.exists) return null;
      const value = doc.data();
      const state = value[field];
      if (!state || millis(value[due]) > now.toMillis() || !value[due]) return null;
      const eligible = kind === 'admin'
        ? ['paid', 'paid_action_required'].includes(value.payment?.status) && value.payment?.paypalCaptureId
        : recoverablePrintOrder(value, now.toMillis()) && !state.stoppedAt
          && Number(state.sentCount || 0) + Number(state.uncertainCount || 0) < 7
          && now.toMillis() <= millis(state.endsAt)
          && millis(value.retention?.deleteAfter) >= now.toMillis() + PRINT_REMINDER_DAY;
      if (!eligible || state.status === 'sent' || state.status === 'exhausted') {
        tx.update(ref, { [due]: FieldValue.delete(), [`${field}.status`]: 'stopped' });
        return null;
      }
      if (state.status === 'sending' && millis(state.claimedAt) + LEASE > now.toMillis()) return null;
      if (state.status === 'sending') {
        // Gmail offers no idempotency key. A lost acknowledgement may mean the
        // email was delivered: never blindly resend that same attempt.
        const next = now.toMillis() + PRINT_REMINDER_DAY;
        tx.update(ref, {
          [`${field}.status`]: kind === 'admin' ? 'uncertain' : 'pending',
          [`${field}.lastError`]: 'Tentativo interrotto: consegna non verificabile',
          [`${field}.uncertainCount`]: Number(state.uncertainCount || 0) + 1,
          [`${field}.token`]: FieldValue.delete(),
          ...(kind === 'recovery' ? { [`${field}.attempts`]: 0 } : {}),
          [due]: kind === 'admin' || next > millis(state.endsAt)
            ? FieldValue.delete() : Timestamp.fromMillis(next),
        });
        return null;
      }
      if (Number(state.attempts || 0) >= MAX_ATTEMPTS) {
        tx.update(ref, { [due]: FieldValue.delete(), [`${field}.status`]: 'exhausted' });
        return null;
      }
      tx.update(ref, {
        [`${field}.status`]: 'sending', [`${field}.token`]: token,
        [`${field}.claimedAt`]: now, [`${field}.attempts`]: Number(state.attempts || 0) + 1,
        [due]: Timestamp.fromMillis(now.toMillis() + LEASE),
      });
      return { ...value, id: doc.id };
    });
    if (!order) return false;
    let delivered = false;
    try {
      const base = new URL(this.deps.siteUrl());
      if (base.protocol !== 'https:') throw new Error('URL HTTPS del sito non configurato');
      const studio = await this.deps.mail.studio();
      let to: string;
      let subject: string;
      let html: string;
      if (kind === 'admin') {
        // Only the configured studio address, never the Admin authorization list
        // or the contact helper's hardcoded fallback.
        const settings = await this.deps.db.collection('settings').doc('studio').get();
        const email = settings.data()?.email;
        if (!validEmail(email)) throw new Error('Email delle impostazioni studio mancante o non valida');
        to = email.trim();
        subject = `Nuovo ordine stampe confermato ${order.orderNumber}`;
        const link = new URL(`/admin?printOrderId=${encodeURIComponent(orderId)}`, base).href;
        const whatsapp = printOrderWhatsAppLink(order);
        html = `<h2>Nuovo ordine stampe confermato</h2><p>Ordine ${escape(order.orderNumber)}</p>
          <p>${escape(order.customer?.name || order.nomeCliente)}<br>
          ${escape(order.customer?.email || order.emailCliente)}<br>
          Cellulare: ${escape(printOrderPhone(order) || 'Non disponibile')}</p>
          <ul>${(order.printShop?.items || []).map((item: any) =>
            `<li>${escape(item.productName)} · ${escape(item.widthMm)}×${escape(item.heightMm)} mm · ${escape(item.finish === 'matte' ? 'Opaca' : 'Lucida')} · ${escape(item.copyCount)} copie</li>`).join('')}</ul>
          <p>Totale: ${escape((Number(order.totals?.totalCents || 0) / 100).toFixed(2))} EUR<br>
          Consegna: ${order.fulfillment?.method === 'shipping' ? 'Spedizione a domicilio' : 'Ritiro in studio'}</p>
          <p><a href="${escape(link)}">Apri gli ordini Admin (accesso richiesto)</a></p>
          ${whatsapp ? `<a href="${escape(whatsapp)}">Contatta su WhatsApp</a>` : ''}`;
      } else {
        to = order.customer?.email || order.emailCliente;
        if (!validEmail(to)) throw new Error('Email proprietario non valida');
        const assets = await ref.collection('assets').where('status', '==', 'ready').get();
        if (!assets.docs.length) {
          await this.finish(ref, field, due, token, 'stopped');
          return false;
        }
        for (const asset of assets.docs) {
          const path = asset.data()?.storagePath;
          if (!path || !(await this.deps.storage.bucket().file(path).exists())[0]) {
            await this.finish(ref, field, due, token, 'stopped');
            return false;
          }
        }
        const link = new URL(`/stampa-foto-aversa/ordine?orderId=${encodeURIComponent(orderId)}`, base);
        const stop = new URL(link);
        stop.searchParams.set('stopReminders', '1');
        subject = `Riprendi il tuo ordine stampe ${order.orderNumber}`;
        html = `<h2>Il tuo acquisto non è ancora completato</h2>
          <p>Ciao ${escape(order.customer?.name || order.nomeCliente)}, puoi riprendere l’ordine ${escape(order.orderNumber)} accedendo con il tuo account.</p>
          <p><a href="${escape(link.href)}">Riprendi il tuo ordine</a></p>
          <p>Ritroverai solo foto e configurazioni effettivamente salvate. I caricamenti locali non completati non sono recuperabili.
          I file sono disponibili fino al ${escape(new Date(millis(order.retention.deleteAfter)).toLocaleString('it-IT', { timeZone: 'Europe/Rome' }))}, salvo annullamento dell’ordine.</p>
          <p><a href="${escape(stop.href)}">Interrompi i soli promemoria di questo ordine</a>. Le email transazionali restano attive.</p>
          <p>${escape(studio.name)}</p>`;
      }
      // Recheck after asynchronous preparation, immediately before dispatch.
      const fresh = await ref.get();
      const current = fresh.data();
      if (!fresh.exists || current?.[field]?.token !== token ||
          (kind === 'admin' && !['paid', 'paid_action_required'].includes(current.payment?.status)) ||
          (kind === 'recovery' && (!recoverablePrintOrder(current, this.deps.now().toMillis()) ||
            current.printRecovery?.stoppedAt))) {
        await this.finish(ref, field, due, token, 'stopped');
        return false;
      }
      await this.deps.mail.send(to, subject, html, {
        type: kind === 'admin' ? 'print_shop_admin_paid' : 'print_shop_recovery',
        relatedDocId: orderId, relatedDocType: 'order',
      });
      delivered = true;
      await this.finish(ref, field, due, token, 'sent');
      return true;
    } catch {
      // Leave the claim for ambiguity handling if dispatch succeeded but saving
      // the acknowledgement failed. Do not falsely label it safe to resend.
      if (!delivered) await this.finish(ref, field, due, token, 'failed').catch(() => undefined);
      return false;
    }
  }

  private async finish(ref: any, field: string, due: string, token: string,
    status: 'sent' | 'failed' | 'stopped') {
    await this.deps.db.runTransaction(async (tx: any) => {
      const doc = await tx.get(ref);
      const order = doc.data();
      const state = order?.[field];
      if (!doc.exists || state?.token !== token) return;
      const now = this.deps.now();
      const recovery = field === 'printRecovery';
      const sentCount = Number(state.sentCount || 0) + (status === 'sent' ? 1 : 0);
      const exhausted = status === 'failed' && state.attempts >= MAX_ATTEMPTS;
      const stopped = status === 'stopped' || Boolean(state.stoppedAt);
      const next = now.toMillis() + (status === 'failed' ? RETRY : PRINT_REMINDER_DAY);
      const done = stopped || exhausted || (!recovery && status === 'sent') ||
        (recovery && (sentCount + Number(state.uncertainCount || 0) >= 7 || next > millis(state.endsAt)));
      tx.update(ref, {
        [`${field}.status`]: stopped ? 'stopped' : exhausted ? 'exhausted' : recovery && status === 'sent' ? 'pending' : status,
        [`${field}.token`]: FieldValue.delete(),
        [`${field}.sentCount`]: sentCount,
        ...(status === 'sent' ? { [`${field}.sentAt`]: now, [`${field}.attempts`]: 0,
          [`${field}.lastError`]: FieldValue.delete() } : {}),
        ...(status === 'failed' ? { [`${field}.failedAt`]: now, [`${field}.lastError`]: 'Invio non riuscito; massimo tre tentativi' } : {}),
        [due]: done ? FieldValue.delete() : Timestamp.fromMillis(next),
      });
    });
  }
}