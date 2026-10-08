import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import sharp from 'sharp';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { requireVerifiedCustomer } from '../commerce/http';
import { FakeFirestore, FakeStorage } from '../print-shop/test-fakes';
import { createShopRouter } from './router';
import { ShopMaintenance } from './maintenance';
import { ShopOrderService } from './orders';
import { ShopPaymentService } from './payments';
import { ShopService } from './service';
import { FakePayPal } from './test-support';
import { ShopUploadService } from './uploads';

const NOW = new Date('2026-12-01T10:00:00Z');
let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

const address = { street: 'Via Roma', houseNumber: '12', postalCode: '81031', city: 'Aversa', province: 'CE', country: 'IT' };
const billing = { fiscalCode: 'RSSMRA85M01H501Q', residenceAddress: address };

async function start() {
  const db = new FakeFirestore();
  const storage = new FakeStorage();
  db.seed('productCategories/c1', { value: 'natale', nome: 'Natale', attivo: true, displayOrder: 1 });
  db.seed('products/mug', { nome: 'Tazza con foto', descrizione: 'Con la tua foto', prezzo: 15, sconto: 0, numeroFoto: 1, categoria: 'natale', attivo: true, immagini: [] });
  db.seed('products/card', { nome: 'Cartolina', descrizione: '', prezzo: 3, sconto: 0, numeroFoto: 0, categoria: 'natale', attivo: true, immagini: [] });
  const shop = new ShopService({ db: db as any, now: () => NOW });
  const holder: { uploads?: ShopUploadService } = {};
  const orders = new ShopOrderService({ db: db as any, shop, now: () => NOW, removeAssetsForLines: (id, lines) => holder.uploads!.removeForLines(id, lines) });
  const uploads = new ShopUploadService({ db: db as any, storage, orders, now: () => NOW });
  holder.uploads = uploads;
  const paypal = new FakePayPal();
  const payments = new ShopPaymentService({
    db: db as any,
    paypal,
    orders,
    shop,
    now: () => NOW,
    studio: async () => ({ name: 'Image Studio', email: 'studio@example.com' }),
  });
  const maintenanceRun = vi.fn(async (options?: { dryRun?: boolean }) => ({ dryRun: options?.dryRun === true, ok: true }));
  const app = express();
  app.use(express.json());
  app.use('/api/shop', createShopRouter({
    service: shop,
    orders,
    uploads,
    payments,
    maintenance: { run: maintenanceRun as unknown as ShopMaintenance['run'] },
    adminEmails: ['admin@studio.test'],
    // Il "token" è `email|provider|verificata`: basta a distinguere chi chiama.
    authenticate: (req: any, res, next) => {
      const token = String(req.headers.authorization || '');
      if (!token.startsWith('Bearer ')) {
        res.status(401).json({ error: { code: 'unauthenticated' } });
        return;
      }
      const [email, provider = 'password', verified = 'si'] = token.slice('Bearer '.length).split('|');
      req.user = { uid: email.split('@')[0], email, provider, emailVerified: verified === 'si' };
      next();
    },
    verifiedCustomer: requireVerifiedCustomer,
    maintenanceAuth: (req, res, next) => {
      if (req.get('x-maintenance') !== 'ok') {
        res.status(401).json({ error: { code: 'maintenance_unauthenticated' } });
        return;
      }
      next();
    },
  }));
  await new Promise<void>(resolve => { server = app.listen(0, () => resolve()); });
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/shop`;
  const call = (path: string, init: RequestInit & { as?: string; json?: unknown } = {}) => {
    const { as, json, ...rest } = init;
    return fetch(`${base}${path}`, {
      ...rest,
      ...(json !== undefined ? { body: JSON.stringify(json), method: rest.method ?? 'POST' } : {}),
      headers: { 'content-type': 'application/json', ...(as ? { authorization: `Bearer ${as}` } : {}), ...(rest.headers || {}) },
    });
  };
  await shop.updateSettings({
    enabled: true,
    ordersOpen: true,
    categoryValues: ['natale'],
    lastOrderDate: '2026-12-18',
    photoWaitDays: 7,
    shipping: { enabled: true, priceCents: 590, estimatedMinDays: 3, estimatedMaxDays: 6 },
  });
  return { call, db, storage, paypal, maintenanceRun };
}

const alice = 'alice@example.com';
const bob = 'bob@example.com';
const settingsBody = {
  enabled: true,
  ordersOpen: true,
  categoryValues: ['natale'],
  lastOrderDate: '2026-12-18',
  photoWaitDays: 7,
  shipping: { enabled: true, priceCents: 590, estimatedMinDays: 3, estimatedMaxDays: 6 },
};

const json = async (response: Response) => (await response.json()) as any;

async function jpeg(width = 3000, height = 2000) {
  return sharp({ create: { width, height, channels: 3, background: '#8899aa' } }).jpeg().toBuffer();
}

describe('catalogo e impostazioni', () => {
  it('il catalogo è pubblico e ha una cache breve', async () => {
    const { call } = await start();
    const response = await call('/catalog');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    const body = await json(response);
    expect(body).toMatchObject({ enabled: true, orderingOpen: true });
    // Senza ordine di visualizzazione i prodotti si ordinano per nome.
    expect(body.products.map((product: any) => product.id)).toEqual(['card', 'mug']);
  });

  it('la configurazione PayPal è pubblica', async () => {
    const { call } = await start();
    expect(await json(await call('/paypal/config'))).toMatchObject({ checkoutEnabled: true, clientId: 'cid' });
  });

  it('le impostazioni richiedono accesso e un amministratore', async () => {
    const { call } = await start();
    expect((await call('/admin/settings')).status).toBe(401);
    expect((await call('/admin/settings', { as: 'cliente@example.com' })).status).toBe(403);
    expect((await call('/admin/settings', { method: 'PUT', as: 'cliente@example.com', json: settingsBody })).status).toBe(403);
    const ok = await call('/admin/settings', { as: 'admin@studio.test' });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('private, no-store');
  });

  it('salva le impostazioni e rifiuta quelle non valide', async () => {
    const { call } = await start();
    const put = (body: unknown) => call('/admin/settings', { method: 'PUT', as: 'admin@studio.test', json: body });
    expect((await put({ ...settingsBody, ordersOpen: false })).status).toBe(200);
    expect((await json(await call('/catalog'))).orderingOpen).toBe(false);
    expect((await put({ ...settingsBody, categoryValues: ['cat/sbagliata'] })).status).toBe(400);
    expect((await put({ ...settingsBody, lastOrderDate: '18/12/2026' })).status).toBe(400);
    expect((await put({ ...settingsBody, photoWaitDays: 0 })).status).toBe(400);
    expect((await put({ ...settingsBody, shipping: { ...settingsBody.shipping, estimatedMaxDays: 1 } })).status).toBe(400);
    expect((await put({ ...settingsBody, extra: true })).status).toBe(400);
    const invalid = await put({});
    expect(invalid.status).toBe(400);
    expect((await json(invalid)).error.code).toBe('invalid_request');
  });
});

describe('accesso del cliente', () => {
  it('serve un accesso valido: Google verificato oppure email e password', async () => {
    const { call } = await start();
    const lines = { lines: [{ productId: 'card', quantity: 1 }] };
    expect((await call('/orders', { json: lines })).status).toBe(401);
    expect((await call('/orders', { as: `${alice}|facebook.com`, json: lines })).status).toBe(403);
    const unverified = await call('/orders', { as: `${alice}|google.com|no`, json: lines });
    expect(unverified.status).toBe(403);
    expect((await json(unverified)).error.code).toBe('email_not_verified');
    expect((await call('/orders', { as: `${alice}|google.com|si`, json: lines })).status).toBe(201);
    expect((await call('/orders', { as: `${alice}|password`, json: lines })).status).toBe(201);
  });

  it('l\'amministratore non entra nelle route dei clienti senza un accesso cliente valido', async () => {
    const { call } = await start();
    expect((await call('/orders', { as: 'admin@studio.test|facebook.com' })).status).toBe(403);
  });
});

describe('acquisto completo', () => {
  it('bozza, consegna, foto e pagamento fino all\'ordine pagato', async () => {
    const { call, db, storage, paypal } = await start();

    const created = await call('/orders', {
      as: alice,
      json: { lines: [{ productId: 'mug', quantity: 1 }, { productId: 'card', quantity: 2 }], customer: { name: 'Alice Verdi', phone: '333 1112222' } },
    });
    expect(created.status).toBe(201);
    let order = (await json(created)).order;
    expect(order).toMatchObject({ fulfillmentStatus: 'draft', totals: { totalCents: 2100 }, canEdit: true, photosMissing: 1 });

    const shipped = await call(`/orders/${order.id}`, {
      method: 'PATCH',
      as: alice,
      json: { fulfillment: { method: 'shipping', shippingAddress: { ...address, province: 'ce' } }, billingDetails: billing },
    });
    expect(shipped.status, await shipped.clone().text()).toBe(200);
    order = (await json(shipped)).order;
    expect(order.totals).toEqual({ subtotalCents: 2100, shippingCents: 590, totalCents: 2690 });
    expect(order.fulfillment.shippingAddress.province).toBe('CE');

    // La foto: il browser la scrive su storage, poi il server la controlla.
    const data = await jpeg();
    const lineId = order.lines[0].lineId;
    const prepared = await call(`/orders/${order.id}/lines/${lineId}/uploads/prepare`, {
      as: alice,
      json: { fileName: 'foto.jpg', contentType: 'image/jpeg', sizeBytes: data.length },
    });
    expect(prepared.status).toBe(201);
    const { upload } = await json(prepared);
    expect(upload).toMatchObject({ contentType: 'image/jpeg' });
    storage.put(upload.storagePath, data);
    const finalized = await call(`/orders/${order.id}/uploads/finalize`, { as: alice, json: { assetId: upload.assetId } });
    expect(finalized.status).toBe(200);
    expect((await json(finalized)).asset).toMatchObject({ status: 'ready', widthPx: 3000, heightPx: 2000, lowResolution: false });

    const preview = await call(`/orders/${order.id}/assets/${upload.assetId}/preview`, { as: alice });
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-type')).toContain('image/jpeg');
    expect(preview.headers.get('cache-control')).toContain('no-store');

    order = (await json(await call(`/orders/${order.id}`, { as: alice }))).order;
    expect(order).toMatchObject({ photosMissing: 0, canEdit: true });

    const created2 = await call(`/orders/${order.id}/paypal/create`, {
      as: alice,
      json: { termsAccepted: true, privacyAccepted: true, personalizedProductionAccepted: true, expectedQuoteFingerprint: order.quoteFingerprint, expectedTotalCents: order.totals.totalCents },
    });
    const payBody = await created2.clone().text();
    expect(created2.status, payBody).toBe(200);
    const pay = await json(created2);
    expect(pay).toMatchObject({ paypalOrderId: 'PAYPAL-ORDER-1', amount: { totalCents: 2690 } });
    expect(paypal.created[0].amountCents).toBe(2690);

    const captured = await call(`/orders/${order.id}/paypal/capture`, { as: alice, json: { paypalOrderId: pay.paypalOrderId } });
    expect(captured.status).toBe(200);
    expect(await json(captured)).toMatchObject({ success: true, status: 'paid', duplicate: false });

    order = (await json(await call(`/orders/${order.id}`, { as: alice }))).order;
    expect(order).toMatchObject({ paymentStatus: 'paid', fulfillmentStatus: 'photos_received', canEdit: false, canUploadPhotos: false });
    expect(db.countCollection('cashMovements')).toBe(2);
    const list = (await json(await call('/orders', { as: alice }))).orders;
    expect(list.map((item: any) => item.id)).toEqual([order.id]);
  });

  it('rifiuta dati non validi con un errore chiaro', async () => {
    const { call } = await start();
    const created = (await json(await call('/orders', { as: alice, json: { lines: [{ productId: 'card', quantity: 1 }] } }))).order;
    const patch = (body: unknown) => call(`/orders/${created.id}`, { method: 'PATCH', as: alice, json: body });
    expect((await patch({})).status).toBe(400);
    expect((await patch({ fulfillment: { method: 'shipping', shippingAddress: { ...address, postalCode: '12' } } })).status).toBe(400);
    expect((await patch({ billingDetails: { ...billing, fiscalCode: 'SBAGLIATO' } })).status).toBe(400);
    expect((await patch({ stato: 'pagato' })).status).toBe(400);
    expect((await call('/orders', { as: alice, json: { lines: [] } })).status).toBe(400);
    expect((await call('/orders', { as: alice, json: { lines: [{ productId: 'card', quantity: 99 }] } })).status).toBe(400);
    expect((await call('/orders', { as: alice, json: { lines: [{ productId: 'card', quantity: 1 }], totale: 0 } })).status).toBe(400);
    expect((await call(`/orders/${created.id}/paypal/create`, { as: alice, json: { termsAccepted: false, privacyAccepted: true, expectedQuoteFingerprint: 'a'.repeat(64), expectedTotalCents: 600 } })).status).toBe(400);
    expect((await call(`/orders/${created.id}/paypal/create`, { as: alice, json: { termsAccepted: true, privacyAccepted: true, expectedQuoteFingerprint: 'corto', expectedTotalCents: 600 } })).status).toBe(400);
    const missingLine = await call(`/orders/${created.id}/lines/nope/uploads/prepare`, { as: alice, json: { fileName: 'a.jpg', contentType: 'image/jpeg', sizeBytes: 100 } });
    expect(missingLine.status).toBe(404);
    expect((await json(missingLine)).error.code).toBe('line_not_found');
  });

  it('aggiornare le righe riallinea i prezzi e annullare toglie l\'ordine dall\'elenco', async () => {
    const { call, db } = await start();
    const order = (await json(await call('/orders', { as: alice, json: { lines: [{ productId: 'card', quantity: 1 }] } }))).order;
    db.seed('products/card', { nome: 'Cartolina', descrizione: '', prezzo: 4, sconto: 0, numeroFoto: 0, categoria: 'natale', attivo: true, immagini: [] });
    const updated = await call(`/orders/${order.id}/lines`, { method: 'PUT', as: alice, json: { lines: [{ lineId: order.lines[0].lineId, productId: 'card', quantity: 1 }] } });
    expect((await json(updated)).order.totals.totalCents).toBe(400);
    expect((await json(await call(`/orders/${order.id}`, { method: 'DELETE', as: alice }))).cancelled).toBe(true);
    expect((await json(await call('/orders', { as: alice }))).orders).toEqual([]);
  });
});

describe('ogni cliente vede solo i suoi ordini', () => {
  it('le route sugli ordini altrui rispondono "non trovato"', async () => {
    const { call, storage } = await start();
    const order = (await json(await call('/orders', { as: alice, json: { lines: [{ productId: 'mug', quantity: 1 }] } }))).order;
    const lineId = order.lines[0].lineId;
    const data = await jpeg(1600, 1200);
    const prepared = (await json(await call(`/orders/${order.id}/lines/${lineId}/uploads/prepare`, { as: alice, json: { fileName: 'a.jpg', contentType: 'image/jpeg', sizeBytes: data.length } }))).upload;
    storage.put(prepared.storagePath, data);
    await call(`/orders/${order.id}/uploads/finalize`, { as: alice, json: { assetId: prepared.assetId } });

    const attempts: Array<[string, RequestInit & { json?: unknown }]> = [
      [`/orders/${order.id}`, {}],
      [`/orders/${order.id}`, { method: 'PATCH', json: { customerNotes: 'x' } }],
      [`/orders/${order.id}`, { method: 'DELETE' }],
      [`/orders/${order.id}/lines`, { method: 'PUT', json: { lines: [{ productId: 'card', quantity: 1 }] } }],
      [`/orders/${order.id}/lines/${lineId}/uploads/prepare`, { json: { fileName: 'a.jpg', contentType: 'image/jpeg', sizeBytes: 100 } }],
      [`/orders/${order.id}/uploads/finalize`, { json: { assetId: prepared.assetId } }],
      [`/orders/${order.id}/assets/${prepared.assetId}`, { method: 'DELETE' }],
      [`/orders/${order.id}/assets/${prepared.assetId}/preview`, {}],
      [`/orders/${order.id}/paypal/capture`, { json: {} }],
    ];
    for (const [path, init] of attempts) {
      const response = await call(path, { as: bob, ...init });
      expect(response.status, `${init.method ?? (init.json ? 'POST' : 'GET')} ${path}`).toBe(404);
    }
    expect((await json(await call('/orders', { as: bob }))).orders).toEqual([]);
  });
});

describe('webhook PayPal e lavori periodici', () => {
  it('il webhook verifica la firma e registra l\'incasso', async () => {
    const { call, db, paypal } = await start();
    const order = (await json(await call('/orders', { as: alice, json: { lines: [{ productId: 'card', quantity: 2 }] } }))).order;
    const pay = await json(await call(`/orders/${order.id}/paypal/create`, {
      as: alice,
      json: { termsAccepted: true, privacyAccepted: true, expectedQuoteFingerprint: order.quoteFingerprint, expectedTotalCents: order.totals.totalCents },
    }));
    const event = {
      id: 'WH-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAP-1',
        status: 'COMPLETED',
        amount: { value: '6.00', currency_code: 'EUR' },
        custom_id: order.id,
        payee: { merchant_id: 'MERCH' },
        supplementary_data: { related_ids: { order_id: pay.paypalOrderId } },
      },
    };
    paypal.webhookValid = false;
    expect((await call('/paypal/webhook', { json: event })).status).toBe(401);
    paypal.webhookValid = true;
    const ok = await call('/paypal/webhook', { json: event });
    expect(ok.status).toBe(200);
    expect(await json(ok)).toEqual({ ok: true, orderId: order.id });
    expect(db.value(`orders/${order.id}`).payment.status).toBe('paid');
    expect((await json(await call('/paypal/webhook', { json: event }))).duplicate).toBe(true);
  });

  it('la manutenzione risponde solo al processo pianificato', async () => {
    const { call, maintenanceRun } = await start();
    expect((await call('/internal/maintenance', { json: {} })).status).toBe(401);
    expect(maintenanceRun).not.toHaveBeenCalled();
    const ok = await call('/internal/maintenance', { json: { dryRun: true }, headers: { 'x-maintenance': 'ok' } });
    expect(ok.status).toBe(200);
    expect(await json(ok)).toMatchObject({ dryRun: true });
    expect((await call('/internal/maintenance', { json: { altro: 1 }, headers: { 'x-maintenance': 'ok' } })).status).toBe(400);
  });
});
