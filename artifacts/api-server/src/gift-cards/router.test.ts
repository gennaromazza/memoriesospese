import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { FakeFirestore } from '../print-shop/test-fakes';
import { createGiftCardRouter } from './router';
import { GiftCardService } from './service';

const NOW = new Date('2026-11-20T10:00:00.000Z');
let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function start(online?: any) {
  const db = new FakeFirestore();
  const codes = ['K7QM-4XD2-9PTR', 'R3WN-8HC5-2VJA'];
  const service = new GiftCardService({ db: db as any, now: () => NOW, randomCode: () => codes.shift() ?? 'ZZZZ-ZZZZ-ZZZZ' });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/gift-cards',
    createGiftCardRouter({
      service,
      online,
      adminEmails: ['admin@studio.test'],
      authenticate: (req: any, res, next) => {
        const token = String(req.headers.authorization || '');
        if (!token.startsWith('Bearer ')) {
          res.status(401).json({ error: { code: 'unauthenticated' } });
          return;
        }
        req.user = { email: token.slice('Bearer '.length) };
        next();
      },
    }),
  );
  await new Promise<void>(resolve => { server = app.listen(0, () => resolve()); });
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/gift-cards`;
  const call = (path: string, init: RequestInit & { as?: string } = {}) => {
    const { as, ...rest } = init;
    return fetch(`${base}${path}`, {
      ...rest,
      headers: {
        'content-type': 'application/json',
        ...(as ? { authorization: `Bearer ${as}` } : {}),
        ...(rest.headers || {}),
      },
    });
  };
  return { call };
}

const typeBody = {
  name: 'Foto di Natale + tela',
  description: '',
  title: 'Foto di Natale',
  line2: 'con stampa su tela',
  kind: 'prodotto',
  priceCents: 3000,
  theme: 'natale',
  campaignId: null,
  validityMode: 'none',
  validityDate: null,
  sellUntil: null,
  sellOnline: false,
  sellInStudio: true,
  active: true,
};

describe('gift card router', () => {
  it('protegge le rotte amministrative', async () => {
    const { call } = await start();
    expect((await call('/types')).status).toBe(401);
    expect((await call('/types', { as: 'cliente@example.com' })).status).toBe(403);
    expect((await call('/sell', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await call('/K7QM-4XD2-9PTR', { as: 'cliente@example.com' })).status).toBe(403);
    expect((await call('/types', { as: 'admin@studio.test' })).status).toBe(200);
  });

  it('crea un tipo, vende una card e la rende leggibile dal pubblico', async () => {
    const { call } = await start();
    const created = await call('/types', { method: 'POST', as: 'admin@studio.test', body: JSON.stringify(typeBody) });
    expect(created.status).toBe(201);
    const type = (await created.json()) as { id: string };

    const sold = await call('/sell', {
      method: 'POST',
      as: 'admin@studio.test',
      body: JSON.stringify({ typeId: type.id, recipientName: 'Giulia', message: 'Auguri', paymentMethod: 'carta' }),
    });
    expect(sold.status).toBe(201);
    expect(await sold.json()).toMatchObject({ code: 'K7QM-4XD2-9PTR', status: 'attiva' });

    const publicResponse = await call('/public/k7qm4xd29ptr');
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get('cache-control')).toBe('no-store');
    expect(await publicResponse.json()).toMatchObject({ code: 'K7QM-4XD2-9PTR', recipientName: 'Giulia' });
  });

  it('risponde 422 a richieste non valide', async () => {
    const { call } = await start();
    const bad = await call('/sell', { method: 'POST', as: 'admin@studio.test', body: JSON.stringify({ typeId: '', paymentMethod: 'oro' }) });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as any).error.code).toBe('invalid_input');
    const badType = await call('/types', { method: 'POST', as: 'admin@studio.test', body: JSON.stringify({ name: '' }) });
    expect(badType.status).toBe(422);
  });

  it('rallenta chi prova molti codici inesistenti, senza bloccare le richieste valide di altri', async () => {
    const { call } = await start();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 32; attempt++) {
      statuses.push((await call('/public/AAAA-BBBB-CCCC', { headers: { 'x-forwarded-for': '203.0.113.9' } })).status);
    }
    expect(statuses.slice(0, 30).every(status => status === 404)).toBe(true);
    expect(statuses[31]).toBe(429);
    const other = await call('/public/AAAA-BBBB-CCCC', { headers: { 'x-forwarded-for': '198.51.100.7' } });
    expect(other.status).toBe(404);
  });
});

describe('gift card router: acquisto online', () => {
  const stub = () => {
    const calls: Array<[string, unknown]> = [];
    return {
      calls,
      shop: async () => ({ types: [], paypal: { enabled: true, clientId: 'c', environment: 'sandbox', currency: 'EUR' } }),
      createOrder: async (body: unknown) => { calls.push(['create', body]); return { code: 'K7QM-4XD2-9PTR', paypalOrderId: 'PP1', buyerToken: 't', amountCents: 3000 }; },
      capture: async (code: string, body: unknown) => { calls.push(['capture', { code, body }]); return { code, status: 'attiva', duplicate: false, deliverAt: null }; },
      webhook: async (headers: unknown, event: unknown) => { calls.push(['webhook', { headers, event }]); return { ok: true }; },
      processDueDeliveries: async () => ({ processed: 2 }),
      reconcile: async () => ({ code: 'K7QM-4XD2-9PTR' }),
      resend: async (_code: string, target: string) => ({ target }),
    };
  };

  it('la vetrina e l\'acquisto sono pubblici, il lavoro di consegna no', async () => {
    const online = stub();
    const { call } = await start(online);
    const shop = await call('/shop');
    expect(shop.status).toBe(200);
    expect(shop.headers.get('cache-control')).toBe('no-store');
    expect((await call('/online/create', { method: 'POST', body: JSON.stringify({ typeId: 'x' }) })).status).toBe(201);
    expect((await call('/online/K7QM-4XD2-9PTR/capture', { method: 'POST', body: JSON.stringify({ buyerToken: 't' }) })).status).toBe(200);
    expect(online.calls.map(call => call[0])).toEqual(['create', 'capture']);

    expect((await call('/deliveries/run', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await call('/deliveries/run', { method: 'POST', body: '{}', as: 'cliente@example.com' })).status).toBe(403);
    const run = await call('/deliveries/run', { method: 'POST', body: '{}', as: 'admin@studio.test' });
    expect(await run.json()).toEqual({ processed: 2 });
  });

  it('limita le creazioni di ordini ripetute dallo stesso cliente', async () => {
    const { call } = await start(stub());
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      statuses.push((await call('/online/create', { method: 'POST', body: '{}', headers: { 'x-forwarded-for': '203.0.113.5' } })).status);
    }
    expect(statuses.slice(0, 8).every(status => status === 201)).toBe(true);
    expect(statuses.slice(8)).toEqual([429, 429]);
    expect((await call('/online/create', { method: 'POST', body: '{}', headers: { 'x-forwarded-for': '198.51.100.9' } })).status).toBe(201);
  });

  it('passa a PayPal le intestazioni del webhook e protegge reinvio e verifica', async () => {
    const online = stub();
    const { call } = await start(online);
    await call('/paypal/webhook', { method: 'POST', body: JSON.stringify({ id: 'WH' }), headers: { 'paypal-transmission-id': 'T1', 'paypal-transmission-sig': 'S1' } });
    expect(online.calls[0]).toMatchObject(['webhook', { headers: { transmissionId: 'T1', transmissionSig: 'S1' }, event: { id: 'WH' } }]);
    expect((await call('/K7QM-4XD2-9PTR/reconcile', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await call('/K7QM-4XD2-9PTR/resend', { method: 'POST', as: 'admin@studio.test', body: JSON.stringify({ target: 'buyer' }) })).status).toBe(200);
    expect((await call('/K7QM-4XD2-9PTR/resend', { method: 'POST', as: 'admin@studio.test', body: JSON.stringify({ target: 'altro' }) })).status).toBe(422);
  });

  it('senza servizio online risponde 503', async () => {
    const { call } = await start();
    expect((await call('/shop')).status).toBe(503);
  });
});
