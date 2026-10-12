import { describe, expect, it } from 'vitest';
import { FakeFirestore } from '../print-shop/test-fakes';
import { ShopMailer, SHOP_MAIL_MAX_ATTEMPTS, SHOP_MAIL_RETRY_MS } from './mail';
import { shopMailContent } from './mail-templates';

const NOW = new Date('2026-12-01T10:00:00Z');
const ctx = { studioName: 'Image Studio', studioPhone: '081 000000', studioEmail: 'studio@example.com', studioAddress: 'Via Roma 1, Aversa', siteUrl: 'https://sito.test' };

const order = (patch: Record<string, unknown> = {}) => ({
  orderType: 'shop',
  orderNumber: 'SH-2026-ABCDEFGH',
  nomeCliente: 'Alice Verdi',
  emailCliente: 'alice@example.com',
  customer: { name: 'Alice Verdi', email: 'alice@example.com' },
  lines: [
    { lineId: 'l_00000001', productId: 'mug', productName: 'Tazza con foto', quantity: 1, photosRequired: 1, unitPriceCents: 1500, lineTotalCents: 1500 },
    { lineId: 'l_00000002', productId: 'card', productName: 'Cartolina', quantity: 2, photosRequired: 0, unitPriceCents: 300, lineTotalCents: 600 },
  ],
  totals: { subtotalCents: 2100, shippingCents: 0, totalCents: 2100 },
  fulfillment: { method: 'studio_pickup', status: 'awaiting_photos' },
  payment: { status: 'paid' },
  shop: { photoDeadlineAt: new Date('2026-12-08T10:00:00Z') },
  ...patch,
});

function setup() {
  const db = new FakeFirestore();
  const sent: Array<{ to: string; subject: string; html: string; log: any }> = [];
  const state = { failNext: false, clock: NOW };
  const mailer = new ShopMailer({
    db: db as any,
    siteUrl: () => 'https://sito.test',
    now: () => state.clock,
    mail: {
      async send(to, subject, html, log) {
        if (state.failNext) {
          state.failNext = false;
          throw new Error('Gmail non risponde');
        }
        sent.push({ to, subject, html, log });
      },
      async studio() {
        return { name: 'Image Studio', email: 'studio@example.com', phone: '081 000000', address: 'Via Roma 1, Aversa' };
      },
    },
  });
  return { db, sent, state, mailer };
}

describe('testi delle email', () => {
  it('la conferma elenca prodotti e totale e spiega cosa fare per le foto mancanti', () => {
    const content = shopMailContent('order_confirmed', { id: 'o1', ...order() }, ctx);
    expect(content.subject).toBe('Ordine SH-2026-ABCDEFGH confermato');
    expect(content.html).toContain('Tazza con foto');
    expect(content.html).toContain('Cartolina × 2');
    expect(content.html).toContain('21,00');
    expect(content.html).toContain('manca 1 foto');
    expect(content.html).toContain('8 dicembre 2026');
    expect(content.html).toContain('https://sito.test/shop-natale/i-miei-ordini?ordine=o1');
    expect(content.html).toContain('Ritiro in studio');
  });

  it('con tutte le foto la conferma lo dice e non chiede nulla', () => {
    const assets = [{ lineId: 'l_00000001', status: 'ready' }];
    const content = shopMailContent('order_confirmed', { id: 'o1', ...order(), __assets: assets }, ctx);
    expect(content.html).toContain('Abbiamo già tutte le foto');
    expect(content.html).not.toContain('Carica la foto');
  });

  it('la spedizione mostra indirizzo; l\'email di spedizione mostra corriere e codice', () => {
    const shipped = order({
      fulfillment: { method: 'shipping', status: 'shipped', shippingAddress: { street: 'Via Po', houseNumber: '3', postalCode: '10100', city: 'Torino', province: 'TO' }, tracking: { carrier: 'BRT', code: 'ABC123' } },
      totals: { subtotalCents: 2100, shippingCents: 590, totalCents: 2690 },
    });
    const confirmed = shopMailContent('order_confirmed', { id: 'o1', ...shipped }, ctx);
    expect(confirmed.html).toContain('Via Po 3, 10100 Torino (TO)');
    expect(confirmed.html).toContain('Spedizione');
    expect(confirmed.html).toContain('26,90');
    const email = shopMailContent('shipped', { id: 'o1', ...shipped }, ctx);
    expect(email.html).toContain('BRT');
    expect(email.html).toContain('ABC123');
    expect(email.html).toContain('Consegna a:');
  });

  it('promemoria, pronto al ritiro, consegnato, annullato e rimborsato hanno testo proprio', () => {
    const base = { id: 'o1', ...order() };
    expect(shopMailContent('photos_reminder', base, ctx).html).toContain('ci manca ancora 1 foto');
    expect(shopMailContent('ready_for_pickup', base, ctx).html).toContain('Via Roma 1, Aversa');
    expect(shopMailContent('delivered', base, ctx).subject).toContain('consegnato');
    expect(shopMailContent('cancelled', base, ctx).subject).toContain('annullato');
    expect(shopMailContent('refunded', base, ctx).html).toContain('PayPal');
    expect(shopMailContent('photos_received', base, ctx).subject).toContain('abbiamo tutte le foto');
  });

  it('le email per lo studio portano il link all\'ordine nel pannello', () => {
    const base = { id: 'o 1', ...order() };
    for (const kind of ['admin_new_order', 'admin_photos_complete', 'admin_photos_overdue', 'admin_refund_after_shipping', 'admin_reconcile'] as const) {
      expect(shopMailContent(kind, base, ctx).html).toContain('https://sito.test/admin/dashboard?shopOrderId=o%201');
    }
    expect(shopMailContent('admin_new_order', base, ctx).subject).toContain('mancano 1 foto');
  });

  it('non lascia passare HTML inserito dal cliente', () => {
    const hostile = { id: 'o1', ...order({ nomeCliente: '<script>alert(1)</script> Mario', customer: { name: '<img src=x onerror=alert(1)>', email: 'a@b.it' } }) };
    for (const kind of ['order_confirmed', 'admin_new_order'] as const) {
      const html = shopMailContent(kind, hostile, ctx).html;
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img src=x');
    }
  });
});

describe('ShopMailer', () => {
  it('invia al cliente una volta sola e tiene traccia dello stato', async () => {
    const { db, sent, mailer } = setup();
    db.seed('orders/o1', order());
    expect(await mailer.send('o1', 'order_confirmed')).toBe('sent');
    expect(await mailer.send('o1', 'order_confirmed')).toBe('skipped');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'alice@example.com', log: { type: 'shop_order_order_confirmed', relatedDocId: 'o1', relatedDocType: 'shop_order', clientName: 'Alice Verdi' } });
    expect(db.value('orders/o1').shop.notifications.order_confirmed).toMatchObject({ kind: 'order_confirmed', status: 'sent', attempts: 1 });
  });

  it('le email per lo studio vanno all\'indirizzo dello studio', async () => {
    const { db, sent, mailer } = setup();
    db.seed('orders/o1', order());
    await mailer.send('o1', 'admin_new_order');
    expect(sent[0].to).toBe('studio@example.com');
  });

  it('i promemoria con chiavi diverse partono separatamente', async () => {
    const { db, sent, mailer } = setup();
    db.seed('orders/o1', order());
    await mailer.send('o1', 'photos_reminder', { key: 'photos_reminder_1' });
    await mailer.send('o1', 'photos_reminder', { key: 'photos_reminder_2' });
    await mailer.send('o1', 'photos_reminder', { key: 'photos_reminder_2' });
    expect(sent).toHaveLength(2);
  });

  it('un invio fallito resta da riprovare e non blocca nulla', async () => {
    const { db, sent, state, mailer } = setup();
    db.seed('orders/o1', order());
    state.failNext = true;
    expect(await mailer.send('o1', 'order_confirmed')).toBe('failed');
    expect(db.value('orders/o1').shop.notifications.order_confirmed).toMatchObject({ status: 'failed', attempts: 1, lastError: 'Gmail non risponde' });
    expect(sent).toHaveLength(0);
    expect(await mailer.send('o1', 'order_confirmed')).toBe('sent');
    expect(db.value('orders/o1').shop.notifications.order_confirmed).toMatchObject({ status: 'sent', attempts: 2, lastError: null });
  });

  it('riprova i fallimenti solo dopo un po\' e fino a un massimo di tentativi', async () => {
    const { db, sent, state, mailer } = setup();
    db.seed('orders/o1', order());
    state.failNext = true;
    await mailer.send('o1', 'order_confirmed');
    expect(await mailer.retryOrder('o1', db.value('orders/o1'))).toBe(0);
    state.clock = new Date(NOW.getTime() + SHOP_MAIL_RETRY_MS + 1000);
    expect(await mailer.retryOrder('o1', db.value('orders/o1'))).toBe(1);
    expect(sent).toHaveLength(1);
    const exhausted = order({ shop: { notifications: { order_confirmed: { kind: 'order_confirmed', status: 'failed', attempts: SHOP_MAIL_MAX_ATTEMPTS, lastAttemptAt: NOW } } } });
    db.seed('orders/o2', exhausted);
    state.clock = new Date(NOW.getTime() + 10 * SHOP_MAIL_RETRY_MS);
    expect(await mailer.retryOrder('o2', exhausted)).toBe(0);
  });

  it('non parte una seconda email mentre la prima è in invio, ma riparte se è rimasta a metà', async () => {
    const { db, sent, state, mailer } = setup();
    db.seed('orders/o1', order({ shop: { notifications: { order_confirmed: { kind: 'order_confirmed', status: 'sending', claimedAt: NOW, attempts: 1 } } } }));
    expect(await mailer.send('o1', 'order_confirmed')).toBe('skipped');
    state.clock = new Date(NOW.getTime() + 5 * 60 * 1000);
    expect(await mailer.send('o1', 'order_confirmed')).toBe('sent');
    expect(sent).toHaveLength(1);
  });

  it('con force reinvia anche se già inviata', async () => {
    const { db, sent, mailer } = setup();
    db.seed('orders/o1', order());
    await mailer.send('o1', 'shipped');
    await mailer.send('o1', 'shipped', { force: true });
    expect(sent).toHaveLength(2);
  });

  it('un ordine che non esiste o non è dello shop dà errore', async () => {
    const { db, mailer } = setup();
    db.seed('orders/stampe', { orderType: 'print_shop' });
    await expect(mailer.send('nope', 'order_confirmed')).rejects.toMatchObject({ status: 404 });
    await expect(mailer.send('stampe', 'order_confirmed')).rejects.toMatchObject({ status: 404 });
  });

  it('senza email del cliente segna il fallimento invece di perdere l\'invio in silenzio', async () => {
    const { db, sent, mailer } = setup();
    db.seed('orders/o1', order({ emailCliente: '' }));
    expect(await mailer.send('o1', 'order_confirmed')).toBe('failed');
    expect(db.value('orders/o1').shop.notifications.order_confirmed.lastError).toContain('Email del cliente');
    expect(sent).toHaveLength(0);
  });
});
