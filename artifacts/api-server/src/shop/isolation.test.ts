import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { PrintShopService } from '../print-shop/service';
import { FakeFirestore, FakeStorage } from '../print-shop/test-fakes';
import { ShopMailer } from './mail';
import { ShopMaintenance } from './maintenance';

/**
 * Le pulizie periodiche di stampe e shop girano sugli stessi dati (`orders`) e
 * sullo stesso bucket: ognuna deve toccare solo il proprio.
 */

const NOW = new Date('2026-12-10T10:00:00Z');
const past = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const SHOP_PATH = 'shop-orders/alice/shop_1/l_00000001/a1.jpg';
const SHOP_PREPARED_PATH = 'shop-orders/alice/shop_1/l_00000001/a2.jpg';
const PRINT_PATH = 'print-orders/user_one/print_1/asset_1/original.jpg';

function seed(db: FakeFirestore, storage: FakeStorage) {
  db.seed('settings/studio', { name: 'Image Studio', email: 'studio@example.com' });
  // Ordine shop consegnato da 100 giorni: la sua conservazione è scaduta.
  db.seed('orders/shop_1', {
    orderType: 'shop',
    ownerUid: 'alice',
    orderNumber: 'SH-2026-AAAA1111',
    payment: { status: 'paid' },
    fulfillment: { method: 'studio_pickup', status: 'delivered' },
    retention: { status: 'scheduled', reason: 'delivered', deleteAfter: past(10) },
  });
  db.seed('orders/shop_1/shopAssets/a1', { status: 'ready', storagePath: SHOP_PATH, lineId: 'l_00000001' });
  // Caricamento preparato e mai concluso, già scaduto.
  db.seed('orders/shop_1/shopAssets/a2', {
    status: 'prepared',
    storagePath: SHOP_PREPARED_PATH,
    lineId: 'l_00000001',
    orderId: 'shop_1',
    expiresAt: Timestamp.fromDate(past(1)),
  });
  storage.put(SHOP_PATH, Buffer.from('shop'));
  storage.put(SHOP_PREPARED_PATH, Buffer.from('shop-prepared'));

  // Ordine stampe consegnato da 100 giorni, con la stessa scadenza superata.
  db.seed('orders/print_1', {
    orderType: 'print_shop',
    ownerUid: 'user_one',
    orderNumber: 'ST-2026-TEST0001',
    payment: { method: 'paypal', status: 'paid' },
    fulfillment: { method: 'studio_pickup', status: 'delivered', deliveredAt: Timestamp.fromDate(past(100)) },
    printShop: { items: [], assetCount: 1, assetRetentionDays: 90 },
    retention: { status: 'scheduled', reason: 'delivered', deleteAfter: Timestamp.fromDate(past(10)) },
  });
  db.seed('orders/print_1/assets/asset_1', { status: 'ready', storagePath: PRINT_PATH, orderId: 'print_1', ownerUid: 'user_one' });
  storage.put(PRINT_PATH, Buffer.from('print'));
}

function shopMaintenance(db: FakeFirestore, storage: FakeStorage) {
  const mailer = new ShopMailer({
    db: db as any,
    siteUrl: () => 'https://sito.test',
    now: () => NOW,
    mail: {
      async send() {},
      async studio() {
        return { name: 'Image Studio', email: 'studio@example.com' };
      },
    },
  });
  return new ShopMaintenance({ db: db as any, storage, mailer, now: () => NOW });
}

function printShopService(db: FakeFirestore, storage: FakeStorage) {
  return new PrintShopService({
    db: db as any,
    storage,
    paypal: { config: { environment: 'sandbox' }, publicConfig: () => ({ enabled: false }), verifyWebhook: vi.fn() } as any,
    now: () => Timestamp.fromDate(NOW),
  });
}

describe('le pulizie periodiche non si pestano i piedi', () => {
  it('quella delle stampe non tocca ordini, foto né caricamenti dello shop', async () => {
    const db = new FakeFirestore();
    const storage = new FakeStorage();
    seed(db, storage);
    const before = JSON.stringify([db.value('orders/shop_1'), db.value('orders/shop_1/shopAssets/a1'), db.value('orders/shop_1/shopAssets/a2')]);

    const result = await printShopService(db, storage).purgeExpiredAssets();

    expect(result).toMatchObject({ eligible: 1, purged: 1, preparedPurged: 0 });
    expect(storage.files.has(PRINT_PATH)).toBe(false);
    expect(storage.files.has(SHOP_PATH)).toBe(true);
    expect(storage.files.has(SHOP_PREPARED_PATH)).toBe(true);
    expect(JSON.stringify([db.value('orders/shop_1'), db.value('orders/shop_1/shopAssets/a1'), db.value('orders/shop_1/shopAssets/a2')])).toBe(before);
  });

  it('quella dello shop non tocca ordini né foto delle stampe', async () => {
    const db = new FakeFirestore();
    const storage = new FakeStorage();
    seed(db, storage);
    const before = JSON.stringify([db.value('orders/print_1'), db.value('orders/print_1/assets/asset_1')]);

    const result = await shopMaintenance(db, storage).run();

    expect(result).toMatchObject({ purgedOrders: 1, failures: [] });
    expect(storage.files.has(SHOP_PATH)).toBe(false);
    expect(storage.files.has(PRINT_PATH)).toBe(true);
    expect(JSON.stringify([db.value('orders/print_1'), db.value('orders/print_1/assets/asset_1')])).toBe(before);
  });
});
