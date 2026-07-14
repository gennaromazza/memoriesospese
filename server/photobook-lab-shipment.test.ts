/**
 * Test del trasferimento pagine fotolibro → Drive in BACKGROUND
 * (POST /api/photobooks/:id/lab-shipment).
 *
 * Verifica con Drive mockato (il connettore reale non è disponibile in test):
 * - la route risponde subito (202) anche con upload lenti e molte pagine
 * - un secondo POST durante il run NON avvia un secondo trasferimento
 * - convergenza: tutte le pagine trasferite, nessun duplicato
 * - fallimenti parziali → status 'partial'; il retry copia SOLO le mancanti
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const h = vi.hoisted(() => ({
  state: {} as Record<string, Record<string, any>>,
  nextId: 1,
  uploadDelayMs: 5,
  uploadCalls: [] as string[],
  failNames: new Set<string>(),
}));

function applyPatch(target: any, patch: Record<string, any>) {
  for (const [k, v] of Object.entries(patch)) {
    if (k.includes('.')) {
      const parts = k.split('.');
      let obj = target;
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = obj[parts[i]] || {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = v;
    } else {
      target[k] = v;
    }
  }
}

function makeDocRef(col: string, id: string) {
  return {
    id,
    get: async () => {
      const d = h.state[col]?.[id];
      return { exists: !!d, id, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) };
    },
    update: async (patch: Record<string, any>) => {
      const d = h.state[col]?.[id];
      if (!d) throw new Error('not found');
      applyPatch(d, resolveTimestamps(patch));
    },
    delete: async () => {
      delete h.state[col]?.[id];
    },
  };
}

// serverTimestamp() sentinel → oggetto simil-Timestamp con toDate()
const SERVER_TS = Symbol('serverTimestamp');
function resolveTimestamps(patch: any): any {
  const out: any = Array.isArray(patch) ? [] : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === SERVER_TS) {
      const now = new Date();
      out[k] = { toDate: () => now, _seconds: Math.floor(now.getTime() / 1000) };
    } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      out[k] = resolveTimestamps(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function makeCollection(col: string) {
  const filters: Array<[string, any]> = [];
  const self: any = {
    doc: (id?: string) => makeDocRef(col, id || `auto${h.nextId++}`),
    add: async (data: any) => {
      const id = `auto${h.nextId++}`;
      h.state[col] = h.state[col] || {};
      h.state[col][id] = JSON.parse(JSON.stringify(resolveTimestamps(data)));
      return makeDocRef(col, id);
    },
    where: (f: string, _op: string, v: any) => {
      filters.push([f, v]);
      return self;
    },
    get: async () => {
      const all = Object.entries(h.state[col] || {});
      const docs = all
        .filter(([, d]) => filters.every(([f, v]) => (d as any)[f] === v))
        .map(([id, d]) => ({ id, data: () => JSON.parse(JSON.stringify(d)) }));
      return { docs, empty: docs.length === 0 };
    },
  };
  return self;
}

vi.mock('./firebase-admin.js', () => ({
  db: { collection: (name: string) => makeCollection(name) },
  storage: {
    bucket: () => ({
      file: (path: string) => ({
        getMetadata: async () => [{ contentType: 'image/jpeg', size: '1000' }],
        createReadStream: () => ({ path } as any),
      }),
    }),
  },
  FieldValue: { serverTimestamp: () => SERVER_TS },
  Timestamp: { now: () => ({ toDate: () => new Date() }) },
}));

vi.mock('./google-drive.js', () => ({
  findOrCreateLabParentFolder: async () => 'parent-folder',
  createShipmentFolder: async () => ({ folderId: 'ship-folder', webViewLink: 'http://drive/x' }),
  uploadStreamToDriveFolder: async (_folder: string, fileName: string) => {
    await new Promise((r) => setTimeout(r, h.uploadDelayMs));
    h.uploadCalls.push(fileName);
    if (h.failNames.has(fileName)) throw new Error(`upload fallito ${fileName}`);
    return { fileId: `drive-${fileName}`, webViewLink: undefined, size: 1000 };
  },
}));

vi.mock('./email-routes.js', () => ({
  authenticateFirebase: (req: any, _res: any, next: any) => {
    req.user = { email: 'gennaro.mazzacane@gmail.com' };
    next();
  },
}));

vi.mock('./photobook-gallery.js', () => ({
  loadGalleryPhotoDocs: vi.fn(),
  listGalleryPhotosPublic: vi.fn(),
  loadGalleryChapters: vi.fn(),
}));

import photobookRoutes from './photobook-routes.js';

const N = 40;

let baseUrl = '';
let server: any;

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/photobooks', photobookRoutes);
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function seedBook() {
  h.state.jobs = { job1: { nomeEvento: 'Test' } };
  h.state.photobooks = {
    book1: {
      name: 'Big Book',
      galleryId: 'g1',
      token: 't',
      currentVersion: 1,
      jobId: 'job1',
      versions: [{ version: 1, pageCount: N }],
    },
  };
  h.state.photobookPages = {};
  for (let i = 1; i <= N; i++) {
    h.state.photobookPages[`p${i}`] = {
      photobookId: 'book1',
      version: 1,
      pageNumber: i,
      storagePath: `photobooks/book1/v1/${i}.jpg`,
    };
  }
  h.state.labShipments = {};
  h.state.jobTimeline = {};
}

async function postShipment(body: any = {}) {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/photobooks/book1/lab-shipment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json(), ms: Date.now() - t0 };
}

async function waitTransferDone(shipmentId: string, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pt = h.state.labShipments[shipmentId]?.pageTransfer;
    if (pt && pt.status !== 'running') return pt;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('timeout attesa trasferimento');
}

describe('POST /api/photobooks/:id/lab-shipment (trasferimento background)', () => {
  beforeEach(async () => {
    h.nextId = 1;
    h.uploadDelayMs = 5;
    h.uploadCalls = [];
    h.failNames = new Set();
    seedBook();
    if (!server) await startServer();
  });

  it('risponde subito (202) senza aspettare il trasferimento e poi converge senza duplicati', async () => {
    h.uploadDelayMs = 30; // 40 pagine x 30ms = ~1.2s di trasferimento totale
    const r = await postShipment({ descrizione: 'Test big' });
    expect(r.status).toBe(202);
    expect(r.json.started).toBe(true);
    expect(r.json.totalPages).toBe(N);
    // La risposta deve arrivare molto prima della fine del trasferimento
    expect(r.ms).toBeLessThan(800);

    const shipmentId = r.json.shipment.id;
    expect(h.state.labShipments[shipmentId].pageTransfer.status).toBe('running');

    const pt = await waitTransferDone(shipmentId);
    expect(pt.status).toBe('completed');
    expect(pt.transferred).toBe(N);
    expect(pt.failed).toEqual([]);

    const names = h.state.labShipments[shipmentId].files.map((f: any) => f.name);
    expect(names.length).toBe(N);
    expect(new Set(names).size).toBe(N); // nessun duplicato
  });

  it('un secondo POST durante il run non avvia un secondo trasferimento', async () => {
    h.uploadDelayMs = 30;
    const r1 = await postShipment();
    expect(r1.json.started).toBe(true);
    const r2 = await postShipment();
    expect(r2.status).toBe(202);
    expect(r2.json.alreadyRunning).toBe(true);
    expect(r2.json.started).toBe(false);

    const pt = await waitTransferDone(r1.json.shipment.id);
    expect(pt.status).toBe('completed');
    // Nessun upload doppio: al massimo N chiamate
    expect(h.uploadCalls.length).toBe(N);
    const names = h.state.labShipments[r1.json.shipment.id].files.map((f: any) => f.name);
    expect(new Set(names).size).toBe(N);
  });

  it('fallimenti parziali → partial; il retry copia solo le mancanti senza duplicati', async () => {
    // Fai fallire 3 pagine al primo giro
    const failPages = [5, 17, 33];
    for (const p of failPages) {
      h.failNames.add(`pagina-${String(p).padStart(3, '0')}-p${p}.jpg`);
    }
    const r1 = await postShipment();
    const shipmentId = r1.json.shipment.id;
    const pt1 = await waitTransferDone(shipmentId);
    expect(pt1.status).toBe('partial');
    expect(pt1.transferred).toBe(N - 3);
    expect(pt1.failed.map((f: any) => f.pageNumber).sort((a: number, b: number) => a - b)).toEqual(
      failPages,
    );

    // Retry: ora gli upload riescono
    h.failNames.clear();
    h.uploadCalls = [];
    const r2 = await postShipment();
    expect(r2.status).toBe(202);
    expect(r2.json.started).toBe(true); // il run precedente è concluso
    // Riusa la stessa spedizione (idempotente)
    expect(r2.json.shipment.id).toBe(shipmentId);

    const pt2 = await waitTransferDone(shipmentId);
    expect(pt2.status).toBe('completed');
    expect(pt2.transferred).toBe(3); // SOLO le mancanti
    expect(pt2.skipped).toBe(N - 3);
    expect(h.uploadCalls.length).toBe(3);

    const names = h.state.labShipments[shipmentId].files.map((f: any) => f.name);
    expect(names.length).toBe(N);
    expect(new Set(names).size).toBe(N);
  });
});
