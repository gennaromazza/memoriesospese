import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const h = vi.hoisted(() => ({
  collections: {
    labs: new Map<string, Record<string, any>>(),
    jobs: new Map<string, Record<string, any>>(),
    labShipments: new Map<string, Record<string, any>>(),
  },
}));

function documentRef(collectionName: keyof typeof h.collections, id: string) {
  const store = h.collections[collectionName];
  return {
    id,
    get: async () => {
      const value = store.get(id);
      return { id, exists: Boolean(value), data: () => value };
    },
    update: async (patch: Record<string, any>) => {
      const value = store.get(id);
      if (!value) throw new Error(`missing document: ${collectionName}/${id}`);
      Object.assign(value, patch);
    },
    delete: async () => store.delete(id),
  };
}

vi.mock('./firebase-admin.js', () => ({
  db: {
    collection: (name: keyof typeof h.collections) => ({
      doc: (id: string) => documentRef(name, id),
      add: async (value: Record<string, any>) => {
        const id = `${name}_${h.collections[name].size + 1}`;
        h.collections[name].set(id, { ...value });
        return documentRef(name, id);
      },
      get: async () => ({
        docs: [...h.collections[name].entries()].map(([id, value]) => ({
          id,
          data: () => value,
        })),
      }),
    }),
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
}));

vi.mock('./lab-shipment-instructions.js', () => ({
  refreshLabShipmentInstructions: vi.fn(async () => undefined),
}));

vi.mock('./lab-mockup-catalog.js', async () => {
  const expressModule = await import('express');
  return { labMockupCatalogRouter: expressModule.default.Router() };
});

const { default: router } = await import('./lab-routes.js');
const app = express();
app.use(express.json());
app.use('/api', router);
const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

afterAll(() => server.close());

beforeEach(() => {
  for (const store of Object.values(h.collections)) store.clear();
});

async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() as any };
}

describe('rendiconto dei costi per laboratorio', () => {
  it('raggruppa per ID, include laboratori senza spese e mantiene separati i costi non associati', async () => {
    h.collections.labs.set('lab_live', { nome: 'Lab Attivo', attivo: true });
    h.collections.labs.set('lab_empty', { nome: 'Lab Senza Spese', attivo: false });
    h.collections.jobs.set('job_one', {
      nomeEvento: 'Matrimonio Bianchi',
      costi: [
        { id: 'cost_1', labId: 'lab_live', labNome: 'Nome precedente', descrizione: 'Album', importo: 25.5, data: { seconds: 1_800_000_000 } },
        { id: 'cost_2', labId: 'lab_live', labNome: 'Lab Attivo', descrizione: 'Stampe', importo: 10, data: { seconds: 1_800_000_100 } },
        { id: 'cost_2', labId: 'lab_live', labNome: 'Lab Attivo', descrizione: 'Stampe duplicate', importo: 10, data: { seconds: 1_800_000_100 } },
        { id: 'cost_old', labId: 'lab_removed', labNome: 'Lab Storico', descrizione: 'Fotolibro', importo: 7.25, data: { seconds: 1_800_000_200 } },
        { id: 'cost_unassigned', descrizione: 'Lab Storico', importo: 99, data: { seconds: 1_800_000_300 } },
      ],
    });

    const result = await request('/api/labs/costs-report');
    expect(result.status).toBe(200);
    expect(result.body.laboratori).toEqual(expect.arrayContaining([
      expect.objectContaining({
        labId: 'lab_live',
        labNome: 'Lab Attivo',
        totale: 35.5,
        numeroCosti: 2,
        costi: expect.arrayContaining([
          expect.objectContaining({ jobId: 'job_one', jobNome: 'Matrimonio Bianchi', costoId: 'cost_1', importo: 25.5 }),
          expect.objectContaining({ jobId: 'job_one', costoId: 'cost_2', importo: 10 }),
        ]),
      }),
      expect.objectContaining({
        labId: 'lab_empty',
        labNome: 'Lab Senza Spese',
        attivo: false,
        totale: 0,
        numeroCosti: 0,
        costi: [],
      }),
      expect.objectContaining({
        labId: 'lab_removed',
        labNome: 'Lab Storico',
        attivo: null,
        totale: 7.25,
        numeroCosti: 1,
      }),
    ]));
    expect(result.body.senzaLaboratorio).toEqual({ totale: 99, numeroCosti: 1 });
  });

  it('crea o aggiorna una sola spesa di spedizione mantenendo ID e nome del laboratorio selezionato', async () => {
    h.collections.jobs.set('job_one', {
      nomeEvento: 'Matrimonio Bianchi',
      costi: [{
        id: 'shipment_cost',
        descrizione: 'Descrizione precedente',
        importo: 5,
        tipo: 'fornitore',
        note: 'nota da conservare',
        data: { seconds: 1_800_000_000 },
      }],
    });
    h.collections.labShipments.set('shipment_one', {
      jobId: 'job_one',
      labId: 'lab_removed',
      labNome: 'Lab Storico',
      descrizione: 'Album',
      costoId: 'shipment_cost',
    });

    const first = await request('/api/lab-shipments/shipment_one/cost', 'POST', { importo: 32.5 });
    expect(first.status).toBe(200);
    expect(h.collections.jobs.get('job_one')?.costi).toHaveLength(1);
    expect(h.collections.jobs.get('job_one')?.costi[0]).toMatchObject({
      id: 'shipment_cost',
      importo: 32.5,
      labId: 'lab_removed',
      labNome: 'Lab Storico',
      note: 'nota da conservare',
    });

    const second = await request('/api/lab-shipments/shipment_one/cost', 'POST', { importo: 41 });
    expect(second.status).toBe(200);
    expect(h.collections.jobs.get('job_one')?.costi).toHaveLength(1);
    expect(h.collections.jobs.get('job_one')?.costi[0]).toMatchObject({
      id: 'shipment_cost',
      importo: 41,
      labId: 'lab_removed',
      labNome: 'Lab Storico',
    });
  });

  it('usa e persiste il laboratorio scelto sul form spedizione anche prima della richiesta di aggiornamento separata', async () => {
    h.collections.labs.set('lab_new', { nome: 'Lab Nuovo', email: 'nuovo@example.test' });
    h.collections.jobs.set('job_one', { nomeEvento: 'Matrimonio Bianchi', costi: [] });
    h.collections.labShipments.set('shipment_one', {
      jobId: 'job_one',
      labId: 'lab_old',
      labNome: 'Lab Precedente',
      descrizione: 'Album',
    });

    const result = await request('/api/lab-shipments/shipment_one/cost', 'POST', {
      importo: 18,
      labId: 'lab_new',
    });
    expect(result.status).toBe(200);
    expect(h.collections.jobs.get('job_one')?.costi).toHaveLength(1);
    expect(h.collections.jobs.get('job_one')?.costi[0]).toMatchObject({
      importo: 18,
      labId: 'lab_new',
      labNome: 'Lab Nuovo',
    });
    expect(h.collections.labShipments.get('shipment_one')).toMatchObject({
      labId: 'lab_new',
      labNome: 'Lab Nuovo',
      labEmail: 'nuovo@example.test',
    });
  });

  it('ricalcola il totale dopo la modifica e la rimozione di un costo sul lavoro', async () => {
    h.collections.labs.set('lab_live', { nome: 'Lab Attivo', attivo: true });
    h.collections.jobs.set('job_one', {
      nomeEvento: 'Matrimonio Bianchi',
      costi: [
        { id: 'cost_keep', labId: 'lab_live', labNome: 'Lab Attivo', descrizione: 'Album', importo: 12, data: { seconds: 1_800_000_000 } },
        { id: 'cost_delete', labId: 'lab_live', labNome: 'Lab Attivo', descrizione: 'Stampe', importo: 8, data: { seconds: 1_800_000_100 } },
      ],
    });

    const original = await request('/api/labs/costs-report');
    expect(original.body.laboratori.find((group: any) => group.labId === 'lab_live')).toMatchObject({
      totale: 20,
      numeroCosti: 2,
    });

    h.collections.jobs.get('job_one')!.costi = [
      { id: 'cost_keep', labId: 'lab_live', labNome: 'Lab Attivo', descrizione: 'Album aggiornato', importo: 15.5, data: { seconds: 1_800_000_000 } },
    ];
    const changed = await request('/api/labs/costs-report');
    expect(changed.body.laboratori.find((group: any) => group.labId === 'lab_live')).toMatchObject({
      totale: 15.5,
      numeroCosti: 1,
      costi: [expect.objectContaining({ costoId: 'cost_keep', descrizione: 'Album aggiornato' })],
    });
  });
});