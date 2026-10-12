import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { DEFAULT_SHOP_SETTINGS, type ShopCatalogDto } from '@shared/shop-types';
import { createShopRouter } from './router';

let server: Server | undefined;

afterEach(async () => {
  vi.useRealTimers();
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

const emptyCatalog = (): ShopCatalogDto => ({
  enabled: true,
  orderingOpen: true,
  lastOrderDate: null,
  currency: 'EUR',
  categories: [],
  products: [],
  shipping: DEFAULT_SHOP_SETTINGS.shipping,
  photoWaitDays: 7,
});

async function start(publicCatalog: () => Promise<ShopCatalogDto>) {
  const service = {
    publicCatalog: vi.fn(publicCatalog),
    updateSettings: vi.fn(async (input: unknown) => input),
  };
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  const app = express();
  app.use(express.json());
  app.use('/api/shop', createShopRouter({
    service: service as any,
    orders: {} as any,
    uploads: {} as any,
    payments: { paypalConfig: () => ({}) } as any,
    admin: {} as any,
    maintenance: {} as any,
    adminEmails: ['admin@studio.test'],
    authenticate: ((req: any, _res: unknown, next: () => void) => {
      req.user = { uid: 'admin', email: 'admin@studio.test', provider: 'password', emailVerified: true };
      next();
    }) as any,
    verifiedCustomer: pass as any,
    maintenanceAuth: pass as any,
  }));
  await new Promise<void>(resolve => { server = app.listen(0, () => resolve()); });
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/shop`;
  return { service, get: () => fetch(`${base}/catalog`), put: (body: unknown) => fetch(`${base}/admin/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), base };
}

const settingsBody = {
  enabled: true,
  ordersOpen: true,
  categoryValues: ['natale'],
  lastOrderDate: null,
  photoWaitDays: 7,
  shipping: { enabled: false, priceCents: 0, estimatedMinDays: 3, estimatedMaxDays: 7 },
};

describe('cache del catalogo pubblico', () => {
  it('molte richieste ravvicinate costano una sola lettura', async () => {
    const { service, get } = await start(async () => emptyCatalog());
    const responses = await Promise.all(Array.from({ length: 25 }, () => get()));
    expect(responses.every(response => response.status === 200)).toBe(true);
    await get();
    expect(service.publicCatalog).toHaveBeenCalledTimes(1);
  });

  it('dopo 10 secondi rilegge', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { service, get } = await start(async () => emptyCatalog());
    await get();
    vi.setSystemTime(Date.now() + 9_000);
    await get();
    expect(service.publicCatalog).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2_000);
    await get();
    expect(service.publicCatalog).toHaveBeenCalledTimes(2);
  });

  it('salvare le impostazioni azzera la cache', async () => {
    const { service, get, put } = await start(async () => emptyCatalog());
    await get();
    expect((await put(settingsBody)).status).toBe(200);
    await get();
    expect(service.publicCatalog).toHaveBeenCalledTimes(2);
  });

  it('un errore non resta in cache: la richiesta dopo riprova', async () => {
    let calls = 0;
    const { service, get } = await start(async () => {
      calls += 1;
      if (calls === 1) throw new Error('Firestore non risponde');
      return emptyCatalog();
    });
    expect((await get()).status).toBe(500);
    expect((await get()).status).toBe(200);
    expect(service.publicCatalog).toHaveBeenCalledTimes(2);
  });
});
