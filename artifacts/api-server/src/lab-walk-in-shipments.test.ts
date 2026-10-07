import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const collections = new Map<string, Map<string, Record<string, any>>>();
  let nextId = 1;

  const docsFor = (name: string) => {
    let docs = collections.get(name);
    if (!docs) {
      docs = new Map();
      collections.set(name, docs);
    }
    return docs;
  };

  const doc = (collectionName: string, id: string) => ({
    id,
    get: async () => {
      const value = docsFor(collectionName).get(id);
      return { exists: Boolean(value), id, data: () => value, ref: doc(collectionName, id) };
    },
    update: async (patch: Record<string, any>) => {
      const value = docsFor(collectionName).get(id);
      if (!value) throw new Error('not found');
      Object.assign(value, patch);
    },
    delete: async () => docsFor(collectionName).delete(id),
  });

  const collection = (name: string) => ({
    doc: (id: string) => doc(name, id),
    add: async (value: Record<string, any>) => {
      const id = `shipment_${nextId++}`;
      docsFor(name).set(id, { ...value });
      return doc(name, id);
    },
    where: (field: string, operator: string, expected: unknown) => ({
      get: async () => ({
        docs: [...docsFor(name).entries()]
          .filter(([_, value]) => operator === '==' && value[field] === expected)
          .map(([id, value]) => ({ id, data: () => value })),
      }),
    }),
  });

  return {
    collections,
    collection,
    seed: (name: string, id: string, value: Record<string, any>) => docsFor(name).set(id, value),
    get: (name: string, id: string) => docsFor(name).get(id),
    reset: () => {
      collections.clear();
      nextId = 1;
    },
  };
});

vi.mock('./firebase-admin.js', () => ({
  db: {
    collection: (name: string) => h.collection(name),
  },
}));

vi.mock('./email-routes.js', () => ({
  sendGmailEmail: vi.fn(async () => undefined),
  getStudioContactInfo: vi.fn(async () => ({ name: 'Image Studio' })),
  getSiteBaseUrl: vi.fn(() => 'https://example.test'),
}));

vi.mock('./print-shop/auth.js', () => ({
  authenticatePrintShop: (req: any, _res: any, next: () => void) => {
    req.user = { email: 'gennaro.mazzacane@gmail.com' };
    next();
  },
}));

vi.mock('./google-drive.js', () => ({
  findOrCreateLabParentFolder: vi.fn(),
  createShipmentFolder: vi.fn(),
  createResumableUploadSession: vi.fn(),
  deleteDriveFile: vi.fn(),
  revokeShipmentFolderPermission: vi.fn(),
  updateDriveFileContent: vi.fn(),
  uploadStreamToDriveFolder: vi.fn(),
}));

const { default: router } = await import('./lab-routes.js');
const app = express();
app.use(express.json());
app.use('/api', router);
const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

afterAll(() => server.close());
beforeEach(() => h.reset());

describe('walk-in order laboratory shipments', () => {
  it('creates a shipment with an immutable, payment-free snapshot and a fixed 20-day expiry', async () => {
    h.seed('orders', 'order-731', {
      source: 'walk_in',
      nomeEvento: 'Ordine walk-in - Album x1',
      nomeCliente: 'Alda Granata',
      note: 'Copertina opaca',
      totale: 120,
      emailCliente: 'private@example.com',
      prodotti: [{ prodottoNome: 'Album', quantita: 1 }],
    });
    h.seed('labs', 'lab-1', { nome: 'Laboratorio Uno', email: 'lab@example.com' });

    const response = await fetch(`${baseUrl}/api/lab-shipments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceType: 'walk_in',
        orderId: 'order-731',
        labId: 'lab-1',
        expiryDays: 99,
      }),
    });
    const body = await response.json() as any;
    const stored = h.get('labShipments', body.id);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      sourceType: 'walk_in',
      orderId: 'order-731',
      labNome: 'Laboratorio Uno',
      expiryDays: 20,
    });
    expect(stored?.walkInOrderSnapshot).toMatchObject({
      orderId: 'order-731',
      customerName: 'Alda Granata',
      orderDescription: 'Copertina opaca',
      products: [{ name: 'Album', quantity: 1 }],
    });
    expect(JSON.stringify(stored?.walkInOrderSnapshot)).not.toContain('private@example.com');
    expect(JSON.stringify(stored?.walkInOrderSnapshot)).not.toContain('120');

    const updated = await fetch(`${baseUrl}/api/lab-shipments/${body.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiryDays: 99 }),
    });
    expect(updated.status).toBe(200);
    expect(h.get('labShipments', body.id)?.expiryDays).toBe(20);
  });

  it('rejects non-walk-in orders and lists only walk-in shipments for the order', async () => {
    h.seed('orders', 'online-order', { source: 'print_shop', prodotti: [{ prodottoNome: 'Foto' }] });
    const rejected = await fetch(`${baseUrl}/api/lab-shipments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceType: 'walk_in', orderId: 'online-order' }),
    });
    expect(rejected.status).toBe(400);

    h.seed('labShipments', 'walk-in', {
      sourceType: 'walk_in',
      orderId: 'order-731',
      files: [],
    });
    h.seed('labShipments', 'print-shop', {
      sourceType: 'print_shop',
      orderId: 'order-731',
      files: [],
    });
    const listed = await fetch(`${baseUrl}/api/lab-shipments/order/order-731`);

    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject([{ id: 'walk-in', sourceType: 'walk_in' }]);
  });

  it('does not send a walk-in order when its only file is the generated manifest', async () => {
    h.seed('labShipments', 'manifest-only', {
      sourceType: 'walk_in',
      orderId: 'order-731',
      labId: 'lab-1',
      shareableLink: 'https://drive.example.test/folder',
      files: [{ name: 'DISTINTA-ORDINE.txt', kind: 'manifest', size: 400 }],
    });

    const response = await fetch(`${baseUrl}/api/lab-shipments/manifest-only/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    expect((await response.json() as any).error).toMatch(/allega almeno un materiale/i);
  });
});
