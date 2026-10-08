import { describe, expect, it } from 'vitest';
import { FakeFirestore, FakeStorage } from '../print-shop/test-fakes';
import { ShopMailer } from './mail';
import { ShopMaintenance } from './maintenance';

const NOW = new Date('2026-12-10T10:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const daysAhead = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

function setup() {
  const db = new FakeFirestore();
  const storage = new FakeStorage();
  const sent: Array<{ to: string; subject: string; log: any }> = [];
  const mailer = new ShopMailer({
    db: db as any,
    siteUrl: () => 'https://sito.test',
    now: () => NOW,
    mail: {
      async send(to, subject, _html, log) {
        sent.push({ to, subject, log });
      },
      async studio() {
        return { name: 'Image Studio', email: 'studio@example.com' };
      },
    },
  });
  const maintenance = new ShopMaintenance({ db: db as any, storage, mailer, now: () => NOW });
  return { db, storage, sent, maintenance };
}

const base = (patch: Record<string, unknown> = {}) => ({
  orderType: 'shop',
  orderNumber: 'SH-2026-AAAA1111',
  nomeCliente: 'Alice',
  emailCliente: 'alice@example.com',
  ownerUid: 'alice',
  lines: [{ lineId: 'l_00000001', productId: 'mug', productName: 'Tazza', quantity: 1, photosRequired: 1, lineTotalCents: 1500 }],
  totals: { subtotalCents: 1500, shippingCents: 0, totalCents: 1500 },
  ...patch,
});

/** Ordine pagato che aspetta le foto. */
const awaitingPhotos = (paidDaysAgo: number, deadlineInDays: number, patch: Record<string, unknown> = {}) =>
  base({
    payment: { status: 'paid', paidAt: daysAgo(paidDaysAgo) },
    fulfillment: { method: 'studio_pickup', status: 'awaiting_photos' },
    shop: { paidAt: daysAgo(paidDaysAgo), photoDeadlineAt: daysAhead(deadlineInDays) },
    retention: { status: 'production' },
    ...patch,
  });

describe('promemoria per le foto', () => {
  it('non scrive prima del tempo', async () => {
    const { db, sent, maintenance } = setup();
    db.seed('orders/o1', awaitingPhotos(1, 6));
    const result = await maintenance.run();
    expect(result.reminders).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('dopo due giorni manda il primo promemoria, una volta sola', async () => {
    const { db, sent, maintenance } = setup();
    db.seed('orders/o1', awaitingPhotos(3, 4));
    expect((await maintenance.run()).reminders).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'alice@example.com', log: { type: 'shop_order_photos_reminder' } });
    expect(db.value('orders/o1').shop.notifications.photos_reminder_1.status).toBe('sent');
    expect((await maintenance.run()).reminders).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('dopo cinque giorni manda solo il secondo, anche se il processo era fermo', async () => {
    const { db, sent, maintenance } = setup();
    db.seed('orders/o1', awaitingPhotos(6, 1));
    await maintenance.run();
    expect(sent).toHaveLength(1);
    expect(db.value('orders/o1').shop.notifications.photos_reminder_2.status).toBe('sent');
    expect(db.value('orders/o1').shop.notifications.photos_reminder_1).toBeUndefined();
  });

  it('non scrive se le foto sono arrivate o se il termine è passato', async () => {
    const { db, sent, maintenance } = setup();
    db.seed('orders/arrived', awaitingPhotos(4, 3, { fulfillment: { method: 'studio_pickup', status: 'photos_received' } }));
    db.seed('orders/late', awaitingPhotos(9, -1));
    await maintenance.run();
    expect(sent.filter(mail => mail.log.type === 'shop_order_photos_reminder')).toHaveLength(0);
  });
});

describe('foto in ritardo', () => {
  it('segnala il ritardo allo studio una volta sola', async () => {
    const { db, sent, maintenance } = setup();
    db.seed('orders/o1', awaitingPhotos(9, -1));
    const result = await maintenance.run();
    expect(result.overdue).toBe(1);
    expect(db.value('orders/o1').shop).toMatchObject({ photoOverdue: true });
    expect(db.value('adminNotifications/shop-photos-overdue-o1')).toMatchObject({
      type: 'shop_order',
      title: 'Foto in ritardo',
      deepLink: '/admin/dashboard?shopOrderId=o1',
      isRead: false,
    });
    expect(sent.map(mail => [mail.to, mail.log.type])).toEqual([['studio@example.com', 'shop_order_admin_photos_overdue']]);
    expect((await maintenance.run()).overdue).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('non tocca l\'ordine: restano allo studio le decisioni (annullare, rimborsare, attendere)', async () => {
    const { db, maintenance } = setup();
    db.seed('orders/o1', awaitingPhotos(9, -1));
    await maintenance.run();
    expect(db.value('orders/o1')).toMatchObject({ fulfillment: { status: 'awaiting_photos' }, payment: { status: 'paid' }, retention: { status: 'production' } });
  });
});

describe('cancellazione delle foto', () => {
  function withFiles(db: FakeFirestore, storage: FakeStorage, orderId: string, order: Record<string, unknown>) {
    db.seed(`orders/${orderId}`, order);
    db.seed(`orders/${orderId}/shopAssets/a1`, { lineId: 'l_00000001', status: 'ready', storagePath: `shop-orders/alice/${orderId}/l/a1.jpg` });
    db.seed(`orders/${orderId}/shopAssets/a2`, { lineId: 'l_00000001', status: 'ready', storagePath: `shop-orders/alice/${orderId}/l/a2.jpg` });
    storage.put(`shop-orders/alice/${orderId}/l/a1.jpg`, Buffer.from('1'));
    storage.put(`shop-orders/alice/${orderId}/l/a2.jpg`, Buffer.from('2'));
  }

  const delivered = (deleteAfterDays: number) =>
    base({
      payment: { status: 'paid' },
      fulfillment: { method: 'studio_pickup', status: 'delivered' },
      retention: { status: 'scheduled', reason: 'delivered', deleteAfter: daysAhead(deleteAfterDays) },
    });

  it('dopo la consegna conserva le foto per il periodo previsto, poi le cancella', async () => {
    const { db, storage, maintenance } = setup();
    withFiles(db, storage, 'early', delivered(30));
    withFiles(db, storage, 'due', delivered(-1));
    const result = await maintenance.run();
    expect(result).toMatchObject({ purgedOrders: 1, purgedFiles: 2, failures: [] });
    expect(storage.files.size).toBe(2);
    expect(storage.deleted.sort()).toEqual(['shop-orders/alice/due/l/a1.jpg', 'shop-orders/alice/due/l/a2.jpg']);
    expect(db.value('orders/due').retention).toMatchObject({ status: 'purged' });
    expect(db.value('orders/due/shopAssets/a1')).toMatchObject({ status: 'purged', storagePath: null });
    expect(db.value('orders/early').retention.status).toBe('scheduled');
    // Un secondo giro non rifà niente.
    expect(await maintenance.run()).toMatchObject({ purgedOrders: 0, purgedFiles: 0 });
  });

  it('un ordine pagato in lavorazione non si cancella mai da solo', async () => {
    const { db, storage, maintenance } = setup();
    withFiles(db, storage, 'work', base({
      payment: { status: 'paid' },
      fulfillment: { method: 'studio_pickup', status: 'in_production' },
      retention: { status: 'production', deleteAfter: daysAgo(100) },
    }));
    expect((await maintenance.run()).purgedOrders).toBe(0);
    expect(storage.files.size).toBe(2);
  });

  it('una bozza scaduta e mai pagata diventa un ordine annullato e perde le foto', async () => {
    const { db, storage, maintenance } = setup();
    withFiles(db, storage, 'draft', base({
      payment: { status: 'pending' },
      fulfillment: { method: 'studio_pickup', status: 'draft' },
      retention: { status: 'scheduled', reason: 'draft', deleteAfter: daysAgo(1) },
    }));
    db.seed('orders/fresh', base({ payment: { status: 'pending' }, fulfillment: { method: 'studio_pickup', status: 'draft' }, retention: { status: 'scheduled', reason: 'draft', deleteAfter: daysAhead(3) } }));
    const result = await maintenance.run();
    expect(result.purgedOrders).toBe(1);
    expect(db.value('orders/draft')).toMatchObject({ stato: 'annullato', fulfillment: { status: 'cancelled', cancellationReason: 'draft_expired' }, retention: { status: 'purged' } });
    expect(db.value('orders/fresh').fulfillment.status).toBe('draft');
    expect(storage.files.size).toBe(0);
  });

  it('non tocca un ordine con un pagamento in corso', async () => {
    const { db, storage, maintenance } = setup();
    withFiles(db, storage, 'paying', base({
      payment: { status: 'pending', captureStatus: 'capturing' },
      fulfillment: { method: 'studio_pickup', status: 'awaiting_payment' },
      retention: { status: 'scheduled', reason: 'draft', deleteAfter: daysAgo(1) },
    }));
    expect((await maintenance.run()).purgedOrders).toBe(0);
    expect(storage.files.size).toBe(2);
  });

  it('se un file non si cancella lo segnala e al giro dopo riprova', async () => {
    const { db, storage, maintenance } = setup();
    withFiles(db, storage, 'o1', delivered(-1));
    storage.failDeletePaths.add('shop-orders/alice/o1/l/a2.jpg');
    const first = await maintenance.run();
    expect(first.failures).toHaveLength(1);
    expect(first.failures[0].orderId).toBe('o1');
    expect(db.value('orders/o1').retention.status).toBe('failed');
    storage.failDeletePaths.clear();
    const second = await maintenance.run();
    expect(second).toMatchObject({ purgedOrders: 1, failures: [] });
    expect(db.value('orders/o1').retention.status).toBe('purged');
    expect(storage.files.size).toBe(0);
  });

  it('toglie le foto caricate a metà e scadute', async () => {
    const { db, storage, maintenance } = setup();
    db.seed('orders/o1', base({ payment: { status: 'pending' }, fulfillment: { method: 'studio_pickup', status: 'draft' }, retention: { status: 'scheduled', reason: 'draft', deleteAfter: daysAhead(3) } }));
    db.seed('orders/o1/shopAssets/stale', { status: 'prepared', expiresAt: daysAgo(1), storagePath: 'shop-orders/alice/o1/l/stale.jpg' });
    db.seed('orders/o1/shopAssets/fresh', { status: 'prepared', expiresAt: daysAhead(1), storagePath: 'shop-orders/alice/o1/l/fresh.jpg' });
    db.seed('orders/o1/shopAssets/done', { status: 'ready', storagePath: 'shop-orders/alice/o1/l/done.jpg' });
    for (const name of ['stale', 'fresh', 'done']) storage.put(`shop-orders/alice/o1/l/${name}.jpg`, Buffer.from(name));
    expect((await maintenance.run()).expiredUploads).toBe(1);
    expect(db.value('orders/o1/shopAssets/stale')).toBeUndefined();
    expect(db.value('orders/o1/shopAssets/fresh')).toBeDefined();
    expect(db.value('orders/o1/shopAssets/done')).toBeDefined();
    expect([...storage.files.keys()].sort()).toEqual(['shop-orders/alice/o1/l/done.jpg', 'shop-orders/alice/o1/l/fresh.jpg']);
  });
});

describe('prove a vuoto e perimetro', () => {
  it('con dryRun conta ma non cambia nulla', async () => {
    const { db, storage, sent, maintenance } = setup();
    db.seed('orders/late', awaitingPhotos(9, -1));
    db.seed('orders/remind', awaitingPhotos(3, 4));
    db.seed('orders/gone', base({ payment: { status: 'paid' }, fulfillment: { method: 'studio_pickup', status: 'delivered' }, retention: { status: 'scheduled', deleteAfter: daysAgo(1) } }));
    db.seed('orders/gone/shopAssets/a', { status: 'ready', storagePath: 'shop-orders/x.jpg' });
    storage.put('shop-orders/x.jpg', Buffer.from('x'));
    const result = await maintenance.run({ dryRun: true });
    expect(result).toMatchObject({ dryRun: true, overdue: 1, reminders: 1, purgedOrders: 1 });
    expect(sent).toHaveLength(0);
    expect(storage.files.size).toBe(1);
    expect(db.value('orders/late').shop.photoOverdue).toBeUndefined();
    expect(db.value('orders/gone').retention.status).toBe('scheduled');
  });

  it('ignora gli ordini delle stampe e quelli già cancellati', async () => {
    const { db, sent, maintenance } = setup();
    db.seed('orders/stampe', { orderType: 'print_shop', payment: { status: 'paid' }, fulfillment: { status: 'awaiting_photos' }, shop: { paidAt: daysAgo(9), photoDeadlineAt: daysAgo(1) } });
    db.seed('orders/purged', awaitingPhotos(9, -1, { retention: { status: 'purged' } }));
    const result = await maintenance.run();
    expect(result).toMatchObject({ reminders: 0, overdue: 0, purgedOrders: 0 });
    expect(sent).toHaveLength(0);
  });

  it('un errore su un ordine non ferma gli altri', async () => {
    const { db, storage, maintenance } = setup();
    db.seed('orders/bad', base({ payment: { status: 'paid' }, fulfillment: { method: 'studio_pickup', status: 'delivered' }, retention: { status: 'scheduled', deleteAfter: daysAgo(1) } }));
    db.seed('orders/bad/shopAssets/a', { status: 'ready', storagePath: 'shop-orders/bad.jpg' });
    storage.put('shop-orders/bad.jpg', Buffer.from('x'));
    storage.failDeletePaths.add('shop-orders/bad.jpg');
    db.seed('orders/good', awaitingPhotos(9, -1));
    const result = await maintenance.run();
    expect(result.failures.map(failure => failure.orderId)).toEqual(['bad']);
    expect(result.overdue).toBe(1);
  });
});
