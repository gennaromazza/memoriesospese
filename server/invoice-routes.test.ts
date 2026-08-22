import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const state: Record<string, Record<string, any>> = {};
let nextId = 1;
let transactionTail: Promise<void> = Promise.resolve();

function ref(collection: string, id: string) {
  return {
    id,
    async get() {
      const value = state[collection]?.[id];
      return { exists: value !== undefined, id, data: () => value };
    },
    async delete() {
      delete state[collection]?.[id];
    },
  };
}

function collection(name: string) {
  const filters: Array<[string, unknown]> = [];
  const api: any = {
    doc: (id?: string) => ref(name, id || `auto-${nextId++}`),
    where: (field: string, _operator: string, value: unknown) => {
      filters.push([field, value]);
      return api;
    },
    async get() {
      const docs = Object.entries(state[name] || {})
        .filter(([, value]) => filters.every(([field, expected]) => value[field] === expected))
        .map(([id, value]) => ({ id, exists: true, data: () => value, ref: ref(name, id) }));
      return { docs, empty: docs.length === 0 };
    },
  };
  return api;
}

async function runTransaction(callback: (transaction: any) => Promise<void>) {
  const previous = transactionTail;
  let release!: () => void;
  transactionTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    await callback({
      get: (documentRef: ReturnType<typeof ref>) => documentRef.get(),
      set: (documentRef: ReturnType<typeof ref>, data: any, options?: { merge?: boolean }) => {
        state[Object.keys(state).find((key) => state[key]?.[documentRef.id] !== undefined) || 'counters'] ??= {};
        const targetCollection = documentRef.id.startsWith('invoices_') ? 'counters' : 'invoiceIdempotency';
        state[targetCollection] ??= {};
        state[targetCollection][documentRef.id] = options?.merge
          ? { ...(state[targetCollection][documentRef.id] || {}), ...data }
          : data;
      },
      create: (documentRef: ReturnType<typeof ref>, data: any) => {
        const targetCollection = documentRef.id.startsWith('auto-') ? 'invoices' : 'invoiceIdempotency';
        state[targetCollection] ??= {};
        if (state[targetCollection][documentRef.id]) throw new Error('already exists');
        state[targetCollection][documentRef.id] = data;
      },
    });
  } finally {
    release();
  }
}

vi.mock('./firebase-admin.js', () => ({
  db: { collection, runTransaction },
  Timestamp: { now: () => ({ toDate: () => new Date('2026-08-21T12:00:00.000Z') }) },
}));

vi.mock('./email-routes.js', () => ({
  authenticateFirebase: (req: any, _res: any, next: any) => {
    req.user = { uid: 'admin-1', email: 'gennaro.mazzacane@gmail.com' };
    next();
  },
}));

import invoiceRoutes from './invoice-routes.js';

let server: any;
let baseUrl = '';

beforeEach(async () => {
  for (const key of Object.keys(state)) delete state[key];
  nextId = 1;
  transactionTail = Promise.resolve();
  Object.assign(state, {
    settings: {
      studio: {
        name: 'Studio Test',
        partitaIVA: '00743110157',
        codiceFiscale: 'RSSMRA85M01H501Q',
        regimeFiscale: 'RF01',
        fiscalVia: 'Via Roma 1',
        fiscalCap: '00100',
        fiscalComune: 'Roma',
        fiscalProvincia: 'RM',
      },
    },
    jobs: { job1: { nomeEvento: 'Matrimonio Test', clientiIds: ['client1'] } },
    clienti: {
      client1: {
        nome: 'Mario', cognome: 'Rossi', codiceFiscale: 'RSSMRA85M01H501Q',
        via: 'Via Cliente 2', cap: '20100', citta: 'Milano', provincia: 'MI',
        tipoSoggetto: 'privato', email: 'mario.rossi@example.com',
      },
    },
    invoices: {},
    counters: {},
    invoiceIdempotency: {},
  });
  if (!server) {
    const app = express();
    app.use(express.json());
    app.use('/api/invoices', invoiceRoutes);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
});

afterAll(() => server?.close());

function invoicePayload(idempotencyKey: string) {
  return {
    jobId: 'job1',
    clienteId: 'client1',
    issueDate: '2026-08-21',
    taxableAmount: 100,
    taxTreatment: 'iva_ordinaria',
    description: 'Servizio & foto',
    idempotencyKey,
  };
}

describe('invoice routes', () => {
  it('mostra e crea l’XML per un privato con sola email usando i dati fiscali salvati dello studio', async () => {
    state.settings.studio.regimeFiscale = 'RF19';
    const payload = {
      ...invoicePayload('private-forfettario'),
      // Il client invia il vecchio default: RF19 deve comunque prevalere lato server.
      taxTreatment: 'iva_ordinaria',
    };
    const preview = await fetch(`${baseUrl}/api/invoices/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const previewBody = await preview.json();
    const created = await fetch(`${baseUrl}/api/invoices`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const createdBody = await created.json();
    const invoice = state.invoices[createdBody.invoiceId];

    expect(preview.status).toBe(200);
    expect(previewBody).toMatchObject({
      valid: true,
      sender: { name: 'Studio Test', regimeFiscale: 'RF19' },
      totals: { imponibile: 100, imposta: 0, totale: 100, natura: 'N2.2' },
      recipient: { codiceDestinatario: '0000000' },
    });
    expect(created.status).toBe(201);
    expect(createdBody.filename).toBe('IT00743110157_26001.xml');
    expect(invoice.senderSnapshot).toMatchObject({
      partitaIVA: '00743110157',
      regimeFiscale: 'RF19',
      fiscalVia: 'Via Roma 1',
    });
    expect(invoice.xml).toContain('<CodiceDestinatario>0000000</CodiceDestinatario>');
    expect(invoice.xml).not.toContain('<PECDestinatario>');
    expect(invoice.xml).not.toContain('mario.rossi@example.com');
    expect(invoice.xml).toContain('<Natura>N2.2</Natura>');
    expect(invoice.xml).not.toContain('<EsigibilitaIVA>');
    expect(invoice.input.taxTreatment).toBe('fuori_campo');
  });

  it('assegna progressivi annuali distinti anche con richieste concorrenti', async () => {
    const [a, b] = await Promise.all(['request-a', 'request-b'].map(async (key) => {
      const response = await fetch(`${baseUrl}/api/invoices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoicePayload(key)),
      });
      return { status: response.status, body: await response.json() };
    }));
    expect([a.status, b.status]).toEqual([201, 201]);
    expect([a.body.numero, b.body.numero].sort()).toEqual(['2026/0001', '2026/0002']);
    expect(Object.keys(state.invoices)).toHaveLength(2);
    expect(state.counters.invoices_2026.lastNumber).toBe(2);
  });

  it('riusa la stessa emissione in caso di retry con identica idempotency key', async () => {
    const first = await fetch(`${baseUrl}/api/invoices`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoicePayload('retry-safe')),
    });
    const firstBody = await first.json();
    const retry = await fetch(`${baseUrl}/api/invoices`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoicePayload('retry-safe')),
    });
    const retryBody = await retry.json();
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retryBody).toMatchObject({ invoiceId: firstBody.invoiceId, reused: true });
    expect(Object.keys(state.invoices)).toHaveLength(1);
  });

  it('riscarica il record già emesso anche se l’anagrafica cambia dopo il primo invio', async () => {
    const first = await fetch(`${baseUrl}/api/invoices`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoicePayload('immutable-retry')),
    });
    const firstBody = await first.json();
    delete state.clienti.client1.codiceFiscale;
    delete state.clienti.client1.codiceSdi;
    const retry = await fetch(`${baseUrl}/api/invoices`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoicePayload('immutable-retry')),
    });
    const retryBody = await retry.json();
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retryBody).toMatchObject({ invoiceId: firstBody.invoiceId, numero: firstBody.numero, reused: true });
  });

  it('rifiuta una chiave di idempotenza riusata per dati diversi', async () => {
    await fetch(`${baseUrl}/api/invoices`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoicePayload('mismatch')),
    });
    const retry = await fetch(`${baseUrl}/api/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...invoicePayload('mismatch'), description: 'Descrizione differente' }),
    });
    expect(retry.status).toBe(409);
    expect((await retry.json()).error).toContain('idempotenza');
  });

  it('elimina una fattura e la relativa chiave di idempotenza senza modificare il progressivo', async () => {
    const created = await fetch(`${baseUrl}/api/invoices`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoicePayload('delete-me')),
    });
    const createdBody = await created.json();

    const deleted = await fetch(`${baseUrl}/api/invoices/${createdBody.invoiceId}`, { method: 'DELETE' });

    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({ deleted: true, invoiceId: createdBody.invoiceId });
    expect(state.invoices[createdBody.invoiceId]).toBeUndefined();
    expect(state.invoiceIdempotency['delete-me']).toBeUndefined();
    expect(state.counters.invoices_2026.lastNumber).toBe(1);
  });
});
