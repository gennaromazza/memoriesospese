/**
 * Test route-level del backfill signed URL → download token
 * (GET /signed-urls/preview e POST /signed-urls in migration-routes).
 * Firestore e Storage sono mockati: nessun accesso a servizi reali.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const h = vi.hoisted(() => ({
  db: null as any,
  storage: null as any,
  adminEmail: 'gennaro.mazzacane@gmail.com',
}));

vi.mock('./firebase-admin.js', () => ({
  db: new Proxy({}, { get: (_t, p) => (h.db as any)[p] }),
  storage: new Proxy({}, { get: (_t, p) => (h.storage as any)[p] }),
  Timestamp: { now: () => ({ _mock: 'now' }) },
  FieldValue: {},
}));

vi.mock('./email-routes.js', () => ({
  authenticateFirebase: (req: any, _res: any, next: any) => {
    req.user = { uid: 'u1', email: h.adminEmail };
    next();
  },
}));

vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({}) }));

// ---- fake Firestore in-memory ----
function makeFakeDb(collections: Record<string, Record<string, any>>) {
  const updates: Array<{ collection: string; id: string; data: any }> = [];
  const db = {
    collection(name: string) {
      const docs = collections[name] || {};
      return {
        async get() {
          return {
            docs: Object.entries(docs).map(([id, data]) => ({ id, data: () => data })),
          };
        },
        doc(id: string) {
          return {
            async get() {
              return { exists: id in docs, data: () => docs[id] };
            },
            async update(data: any) {
              updates.push({ collection: name, id, data });
              Object.assign(docs[id], data);
            },
          };
        },
      };
    },
  };
  return { db, updates };
}

// ---- fake Storage bucket ----
function makeFakeStorage(objects: Record<string, { token?: string }>) {
  const bucket = {
    name: 'bkt',
    file(path: string) {
      return {
        async exists() {
          return [path in objects];
        },
        async getMetadata() {
          const t = objects[path]?.token;
          return [{ metadata: t ? { firebaseStorageDownloadTokens: t } : {} }];
        },
        async setMetadata(meta: any) {
          objects[path].token = meta.metadata.firebaseStorageDownloadTokens;
        },
      };
    },
  };
  return { storage: { bucket: () => bucket }, objects };
}

async function startApp() {
  const { default: router } = await import('./migration-routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/migrations', router);
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}/api/migrations`,
    close: () => new Promise((r) => server.close(r)),
  };
}

const SIGNED_IMG =
  'https://storage.googleapis.com/bkt/consultation-templates/t1/img1.jpg?GoogleAccessId=sa@x.iam&Signature=abc';
const SIGNED_PDF =
  'https://storage.googleapis.com/bkt/jobs/j1/modulo.pdf?GoogleAccessId=sa@x.iam&Signature=def';
const STABLE_URL =
  'https://firebasestorage.googleapis.com/v0/b/bkt/o/x.jpg?alt=media&token=ok';

describe('backfill signed URLs', () => {
  let ctx: Awaited<ReturnType<typeof startApp>>;
  let updates: any[];

  beforeEach(async () => {
    const fakeDb = makeFakeDb({
      consultationTemplates: {
        t1: { imageUrls: [STABLE_URL, SIGNED_IMG] },
        t2: { imageUrls: [STABLE_URL] },
      },
      jobs: {
        j1: { pdfs: [{ type: 'modulo_prenotazione', url: SIGNED_PDF, fileName: 'modulo.pdf' }] },
        j2: { pdfs: [] },
      },
    });
    h.db = fakeDb.db;
    updates = fakeDb.updates;
    h.storage = makeFakeStorage({
      'consultation-templates/t1/img1.jpg': {},
      'jobs/j1/modulo.pdf': { token: 'pre-existing' },
    }).storage;
    ctx = await startApp();
  });

  it('preview elenca solo i documenti con signed URL', async () => {
    const res = await fetch(`${ctx.base}/signed-urls/preview`);
    const body = await res.json();
    expect(body.remaining).toBe(2);
    expect(body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collection: 'consultationTemplates', docId: 't1' }),
        expect.objectContaining({ collection: 'jobs', docId: 'j1' }),
      ])
    );
    await ctx.close();
  });

  it('backfill riscrive gli URL e la verifica torna a 0', async () => {
    const res = await fetch(`${ctx.base}/signed-urls`, { method: 'POST' });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.stats.fixed).toBe(2);

    // template: URL stabile intatto, signed sostituito
    const tUpdate = updates.find((u) => u.collection === 'consultationTemplates');
    expect(tUpdate.data.imageUrls[0]).toBe(STABLE_URL);
    expect(tUpdate.data.imageUrls[1]).toContain('firebasestorage.googleapis.com');
    expect(tUpdate.data.imageUrls[1]).toContain('alt=media&token=');

    // job: riusa il token già presente nei metadata
    const jUpdate = updates.find((u) => u.collection === 'jobs');
    expect(jUpdate.data.pdfs[0].url).toContain('token=pre-existing');
    expect(jUpdate.data.pdfs[0].fileName).toBe('modulo.pdf');

    // verifica post-backfill: 0 residui
    const verify = await (await fetch(`${ctx.base}/signed-urls/preview`)).json();
    expect(verify.remaining).toBe(0);
    await ctx.close();
  });

  it('oggetto Storage mancante: nessun update, failure riportata', async () => {
    h.storage = makeFakeStorage({ 'jobs/j1/modulo.pdf': { token: 'pre-existing' } }).storage;
    const res = await fetch(`${ctx.base}/signed-urls`, { method: 'POST' });
    const body = await res.json();
    expect(body.stats.missingObject).toBe(1);
    expect(body.stats.fixed).toBe(1); // il PDF del job viene comunque riparato
    const tUpdate = updates.find((u) => u.collection === 'consultationTemplates');
    expect(tUpdate).toBeUndefined();
    await ctx.close();
  });

  it('non-admin riceve 403', async () => {
    h.adminEmail = 'altro@example.com';
    const res = await fetch(`${ctx.base}/signed-urls`, { method: 'POST' });
    expect(res.status).toBe(403);
    h.adminEmail = 'gennaro.mazzacane@gmail.com';
    await ctx.close();
  });
});
