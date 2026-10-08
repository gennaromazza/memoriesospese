import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { FakeFirestore } from '../print-shop/test-fakes';
import { createShopRouter } from './router';
import { ShopService } from './service';

const NOW = new Date('2026-12-01T10:00:00Z');
let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function start() {
  const db = new FakeFirestore();
  db.seed('productCategories/c1', { value: 'natale', nome: 'Natale', attivo: true, displayOrder: 1 });
  db.seed('products/p1', { nome: 'Tazza', descrizione: 'Con la tua foto', prezzo: 12, sconto: 0, numeroFoto: 1, categoria: 'natale', attivo: true, immagini: [] });
  const service = new ShopService({ db: db as any, now: () => NOW });
  const app = express();
  app.use(express.json());
  app.use('/api/shop', createShopRouter({
    service,
    adminEmails: ['admin@studio.test'],
    authenticate: (req: any, res, next) => {
      const token = String(req.headers.authorization || '');
      if (!token.startsWith('Bearer ')) {
        res.status(401).json({ error: { code: 'unauthenticated' } });
        return;
      }
      req.user = { uid: 'u1', email: token.slice('Bearer '.length) };
      next();
    },
  }));
  await new Promise<void>(resolve => { server = app.listen(0, () => resolve()); });
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/shop`;
  const call = (path: string, init: RequestInit & { as?: string } = {}) => {
    const { as, ...rest } = init;
    return fetch(`${base}${path}`, {
      ...rest,
      headers: { 'content-type': 'application/json', ...(as ? { authorization: `Bearer ${as}` } : {}) },
    });
  };
  return { call, db };
}

const settingsBody = {
  enabled: true,
  ordersOpen: true,
  categoryValues: ['natale'],
  lastOrderDate: '2026-12-18',
  photoWaitDays: 7,
  shipping: { enabled: true, priceCents: 590, estimatedMinDays: 3, estimatedMaxDays: 6 },
};

describe('router dello shop', () => {
  it('il catalogo è pubblico e ha una cache breve', async () => {
    const { call } = await start();
    const response = await call('/catalog');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await response.json()).toMatchObject({ enabled: false, products: [] });
  });

  it('le impostazioni richiedono accesso e un amministratore', async () => {
    const { call } = await start();
    expect((await call('/admin/settings')).status).toBe(401);
    expect((await call('/admin/settings', { as: 'cliente@example.com' })).status).toBe(403);
    expect((await call('/admin/settings', { method: 'PUT', as: 'cliente@example.com', body: JSON.stringify(settingsBody) })).status).toBe(403);
    const ok = await call('/admin/settings', { as: 'admin@studio.test' });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('private, no-store');
  });

  it('salva le impostazioni e il catalogo mostra i prodotti', async () => {
    const { call } = await start();
    const saved = await call('/admin/settings', { method: 'PUT', as: 'admin@studio.test', body: JSON.stringify(settingsBody) });
    expect(saved.status).toBe(200);
    const catalog = (await (await call('/catalog')).json()) as any;
    expect(catalog.enabled).toBe(true);
    expect(catalog.orderingOpen).toBe(true);
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]).toMatchObject({ id: 'p1', priceCents: 1200, photosRequired: 1 });
  });

  it('rifiuta impostazioni non valide', async () => {
    const { call } = await start();
    const put = (body: unknown) => call('/admin/settings', { method: 'PUT', as: 'admin@studio.test', body: JSON.stringify(body) });
    expect((await put({ ...settingsBody, categoryValues: ['cat/sbagliata'] })).status).toBe(400);
    expect((await put({ ...settingsBody, lastOrderDate: '18/12/2026' })).status).toBe(400);
    expect((await put({ ...settingsBody, photoWaitDays: 0 })).status).toBe(400);
    expect((await put({ ...settingsBody, shipping: { ...settingsBody.shipping, estimatedMaxDays: 1 } })).status).toBe(400);
    expect((await put({ ...settingsBody, extra: true })).status).toBe(400);
    const invalid = await put({});
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as any).error.code).toBe('invalid_request');
  });
});
