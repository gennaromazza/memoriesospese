import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';

// These fakes have no connection to Firebase credentials, production buckets or real documents.
const h = vi.hoisted(() => ({
  docs: new Map<string, Record<string, any>>(),
  blobs: new Map<string, Buffer>(),
  tokens: new Map<string, string>(),
  types: new Map<string, string>(),
  storageDeleteFailures: new Set<string>(),
  signedUrlBase: '',
  nextId: 0,
}));

vi.mock('./firebase-admin.js', () => {
  const snapshot = (path: string, source: Map<string, Record<string, any>> = h.docs): any => ({
    id: path.split('/').at(-1),
    exists: source.has(path),
    data: () => source.get(path),
    ref: reference(path),
  });
  const apply = (docs: Map<string, Record<string, any>>, path: string, updates: Record<string, any>) => {
    const existing = docs.get(path);
    if (!existing) throw new Error(`Document missing: ${path}`);
    docs.set(path, Object.fromEntries(Object.entries(updates).map(([key, value]) =>
      [key, typeof value === 'object' && value?.__increment !== undefined
        ? (existing[key] || 0) + value.__increment : value]).concat(
      Object.entries(existing).filter(([key]) => !(key in updates)))));
  };
  function reference(path: string): any {
    return {
      id: path.split('/').at(-1),
      path,
      get: async () => snapshot(path),
      update: async (updates: Record<string, any>) => apply(h.docs, path, updates),
      set: async (data: Record<string, any>) => { h.docs.set(path, data); },
      delete: async () => { h.docs.delete(path); },
      collection: (name: string) => collection(`${path}/${name}`),
    };
  }
  function collection(path: string, filters: [string, string, any][] = [], max = Infinity, order?: [string, string]): any {
    const matching = () => [...h.docs.keys()].filter(key =>
      key.startsWith(`${path}/`) && key.slice(path.length + 1).split('/').length === 1 &&
      filters.every(([field, operator, value]) => {
        const actual = h.docs.get(key)?.[field];
        if (operator === '<=') return actual <= value;
        if (operator === '<') return actual < value;
        if (operator === '>=') return actual >= value;
        if (operator === '>') return actual > value;
        return actual === value;
      }));
    return {
      doc: (id: string) => reference(`${path}/${id}`),
      add: async (data: Record<string, any>) => {
        const ref = reference(`${path}/item-${++h.nextId}`);
        h.docs.set(`${path}/${ref.id}`, data);
        return ref;
      },
      where: (key: string, operator: string, value: any) => collection(path, [...filters, [key, operator, value]], max, order),
      orderBy: (key: string, direction = 'asc') => collection(path, filters, max, [key, direction]),
      limit: (n: number) => collection(path, filters, n, order),
      get: async () => {
        const keys = matching();
        if (order) {
          const [field, direction] = order;
          keys.sort((left, right) => {
            const a = h.docs.get(left)?.[field], b = h.docs.get(right)?.[field];
            const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''));
            return direction === 'desc' ? -comparison : comparison;
          });
        }
        const limitedKeys = keys.slice(0, max);
        return { docs: limitedKeys.map(key => snapshot(key)), size: limitedKeys.length, empty: limitedKeys.length === 0 };
      },
    };
  }
  return {
    db: {
      collection,
      runTransaction: async (fn: (tx: any) => Promise<any>) => {
        const workingDocs = new Map(h.docs);
        let hasWritten = false;
        const tx = {
          get: async (ref: any) => {
            if (hasWritten) throw new Error('Firestore transactions must read before writing');
            return snapshot(ref.path, workingDocs);
          },
          update: (ref: any, data: any) => {
            hasWritten = true;
            apply(workingDocs, ref.path, data);
          },
          set: (ref: any, data: any) => {
            hasWritten = true;
            workingDocs.set(ref.path, data);
          },
          delete: (ref: any) => {
            hasWritten = true;
            workingDocs.delete(ref.path);
          },
          create: (ref: any, data: any) => {
            hasWritten = true;
            if (workingDocs.has(ref.path)) throw new Error(`Document already exists: ${ref.path}`);
            workingDocs.set(ref.path, data);
          },
        };
        const result = await fn(tx);
        h.docs.clear();
        for (const [path, data] of workingDocs) h.docs.set(path, data);
        return result;
      },
      getAll: async (...refs: any[]) => Promise.all(refs.map(r => r.get())),
      batch: () => {
        const changes: Array<() => Promise<void>> = [];
        return { update: (ref: any, data: any) => changes.push(() => ref.update(data)),
          commit: async () => { for (const change of changes) await change(); } };
      },
    },
    FieldValue: { serverTimestamp: () => 'fixture-time', increment: (n: number) => ({ __increment: n }) },
    storage: {
      bucket: () => ({
        name: 'isolated-fixture-bucket',
        file: (path: string) => ({
          getSignedUrl: async () => [`${h.signedUrlBase}/signed/${encodeURIComponent(path)}`],
          getMetadata: async () => {
            if (!h.blobs.has(path)) throw new Error('Original missing');
            return [{ size: h.blobs.get(path)!.length, contentType: h.types.get(path), metadata: { firebaseStorageDownloadTokens: h.tokens.get(path) } }];
          },
          createReadStream: () => Readable.from([h.blobs.get(path) || Buffer.alloc(0)]),
          setMetadata: async ({ metadata }: any) => {
            if (!h.blobs.has(path)) throw new Error('Original missing');
            h.tokens.set(path, metadata.firebaseStorageDownloadTokens);
          },
          delete: async () => {
            if (h.storageDeleteFailures.has(path)) { h.storageDeleteFailures.delete(path); throw new Error('storage unavailable'); }
            h.blobs.delete(path); h.tokens.delete(path);
          },
        }),
      }),
    },
  };
});
vi.mock('./email-routes.js', () => ({
  authenticateFirebase: (req: any, res: any, next: any) => {
    if (req.headers.authorization !== 'Bearer fixture-admin' && req.headers.authorization !== 'Bearer fixture-other')
      return res.status(401).json({ error: 'Unauthorized' });
    req.user = {
      uid: 'fixture-uid',
      email: req.headers.authorization === 'Bearer fixture-admin'
        ? 'gennaro.mazzacane@gmail.com' : 'other@example.test',
      name: 'Fixture Admin',
    };
    next();
  },
  sendGmailEmail: vi.fn(),
}));
import router from './desktop-gallery-routes.js';
import { sendGmailEmail } from './email-routes.js';

const app = express();
app.use(express.json());
app.put('/signed/:path', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  h.blobs.set(req.params.path, Buffer.from(req.body));
  h.types.set(req.params.path, req.headers['content-type'] || '');
  res.sendStatus(200);
});
app.get('/download/:path', (req, res) => {
  const path = req.params.path;
  if (h.tokens.get(path) !== req.query.token || !h.blobs.has(path)) return res.sendStatus(404);
  return res.type('application/octet-stream').send(h.blobs.get(path));
});
app.use('/api/desktop', router);
let server: ReturnType<typeof app.listen>;
let base: string;
const request = async (path: string, method = 'GET', body?: any, token = 'fixture-admin') => {
  const response = await fetch(`${base}/api/desktop${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() as any };
};

beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  h.signedUrlBase = base;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  h.docs.clear(); h.blobs.clear(); h.tokens.clear(); h.types.clear(); h.storageDeleteFailures.clear(); h.nextId = 0;
  vi.mocked(sendGmailEmail).mockClear();
  h.docs.set('galleries/gallery-1', { name: 'Existing gallery', active: true, photoCount: 0, chapters: [] });
  h.docs.set('galleries/other', { name: 'Other gallery', photoCount: 0 });
});

describe('desktop gallery sharing email', () => {
  it('sends a branded invitation with a visible URL and the saved password without returning the password', async () => {
    h.docs.get('galleries/gallery-1')!.name = 'Gennaro <Mazzacane>';
    h.docs.get('galleries/gallery-1')!.code = 'album-1';
    h.docs.get('galleries/gallery-1')!.accessMode = 'password';
    h.docs.get('galleries/gallery-1')!.clientIds = ['client-1'];
    h.docs.set('clienti/client-1', { email: 'cliente@example.com' });
    h.docs.set('gallerySecrets/gallery-1', { password: 'Segreta<&"123' });
    const result = await request('/galleries/gallery-1/share', 'POST', { to: 'cliente@example.com' });
    expect(result).toMatchObject({ status: 200, data: { success: true, publicUrl: 'https://imagestudiofotografico.com/gallery/album-1' } });
    expect(JSON.stringify(result.data)).not.toContain('Segreta');
    expect(sendGmailEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = vi.mocked(sendGmailEmail).mock.calls[0];
    expect(to).toBe('cliente@example.com');
    expect(subject).toContain('Gennaro');
    expect(html).toContain('IMAGE STUDIO FOTOGRAFICO');
    expect(html).toContain('href="https://imagestudiofotografico.com/gallery/album-1"');
    expect(html).toContain('>https://imagestudiofotografico.com/gallery/album-1</a>');
    expect(html).toContain('Password di accesso');
    expect(html).toContain('Segreta&lt;&amp;&quot;123');
    expect(html).toContain('Gennaro &lt;Mazzacane&gt;');
    expect(html).not.toContain('Gennaro <Mazzacane>');
  });

  it('includes the saved PIN for PIN galleries and omits credentials for public galleries', async () => {
    h.docs.get('galleries/gallery-1')!.code = 'ritratto';
    h.docs.get('galleries/gallery-1')!.accessMode = 'pin';
    h.docs.get('galleries/gallery-1')!.clientIds = ['client-1'];
    h.docs.set('clienti/client-1', { email: 'cliente@example.com' });
    h.docs.set('gallerySecrets/gallery-1', { specialPin: '1357' });
    expect((await request('/galleries/gallery-1/share', 'POST', { to: 'cliente@example.com' })).status).toBe(200);
    expect(vi.mocked(sendGmailEmail).mock.calls[0][2]).toContain('PIN di accesso');
    expect(vi.mocked(sendGmailEmail).mock.calls[0][2]).toContain('1357');
    vi.mocked(sendGmailEmail).mockClear();
    h.docs.get('galleries/gallery-1')!.accessMode = 'open';
    expect((await request('/galleries/gallery-1/share', 'POST', { to: 'cliente@example.com' })).status).toBe(200);
    expect(vi.mocked(sendGmailEmail).mock.calls[0][2]).not.toContain('1357');
    expect(vi.mocked(sendGmailEmail).mock.calls[0][2]).not.toContain('Password di accesso');
  });

  it('does not send an unusable invitation if the credential or public URL is missing', async () => {
    const g = h.docs.get('galleries/gallery-1')!;
    g.code = 'private-album';
    g.accessMode = 'password';
    expect((await request('/galleries/gallery-1/share', 'POST', { to: 'cliente@example.com' })).status).toBe(409);
    expect(sendGmailEmail).not.toHaveBeenCalled();
    delete g.code;
    g.accessMode = 'open';
    g.publicUrl = 'https://unrelated.example/gallery/private-album';
    expect((await request('/galleries/gallery-1/share', 'POST', { to: 'cliente@example.com' })).status).toBe(400);
    expect(sendGmailEmail).not.toHaveBeenCalled();
  });

  it('rejects an unassociated or malformed recipient without disclosing the password', async () => {
    const g = h.docs.get('galleries/gallery-1')!;
    g.code = 'album-1';
    g.accessMode = 'password';
    g.clientIds = ['client-1'];
    h.docs.set('clienti/client-1', { email: 'cliente@example.com' });
    h.docs.set('gallerySecrets/gallery-1', { password: 'protected-password' });
    expect((await request('/galleries/gallery-1/share', 'POST', { to: 'someone-else@example.com' })).status).toBe(403);
    expect((await request('/galleries/gallery-1/share', 'POST', { to: 'cliente@example.com\r\nBcc:another@example.com' })).status).toBe(400);
    expect(sendGmailEmail).not.toHaveBeenCalled();
  });

  it('does not claim success when the email provider rejects the send', async () => {
    const g = h.docs.get('galleries/gallery-1')!;
    g.code = 'album-1';
    g.accessMode = 'password';
    g.clientIds = ['client-1'];
    h.docs.set('clienti/client-1', { email: 'cliente@example.com' });
    h.docs.set('gallerySecrets/gallery-1', { password: 'protected-password' });
    vi.mocked(sendGmailEmail).mockRejectedValueOnce(new Error('provider unavailable'));
    const result = await request('/galleries/gallery-1/share', 'POST', { to: 'cliente@example.com' });
    expect(result).toMatchObject({ status: 502, data: { error: expect.stringContaining('Invio non confermato') } });
    expect(JSON.stringify(result.data)).not.toContain('protected-password');
    expect((await request('/galleries/gallery-1/share', 'POST', { to: 'cliente@example.com' })).status).toBe(200);
  });
});

describe('desktop gallery WhatsApp handoff', () => {
  it('rejects and removes an expired handoff without redirecting to WhatsApp', async () => {
    const token = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const key = `desktopWhatsappHandoffs/${createHash('sha256').update(token).digest('hex')}`;
    h.docs.set(key, { galleryId: 'gallery-1', clientId: 'client-1', expiresAt: Date.now() - 1 });

    const response = await fetch(`${base}/api/desktop/galleries/whatsapp-handoff/${token}`, { redirect: 'manual' });
    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toContain('non valido o scaduto');
    expect(h.docs.has(key)).toBe(false);
  });

  it('finds linked clients and their WhatsApp/mobile numbers in legacy CRM fields', async () => {
    const gallery = h.docs.get('galleries/gallery-1')!;
    gallery.code = 'legacy-album';
    gallery.clientIds = [];
    gallery.clientiIds = ['client-1'];
    gallery.clienteId = 'client-2';
    gallery.accessMode = 'pin';
    h.docs.set('clienti/client-1', { whatsapp: 'N/D', cellulare1: '+39 327 123 4567' });
    h.docs.set('clienti/client-2', { whatsapp: '+39 333 444 5566' });
    h.docs.set('gallerySecrets/gallery-1', { specialPin: '2468' });

    const listed = await request('/galleries', 'GET');
    expect(listed.status).toBe(200);
    const normalized = listed.data.galleries.find((g: any) => g.id === 'gallery-1');
    expect(normalized.clientIds).toEqual(['client-1', 'client-2']);

    const first = await request('/galleries/gallery-1/whatsapp-share', 'POST', { clientId: 'client-1' });
    expect(first.status).toBe(200);
    const response = await fetch(`${base}${first.data.handoffPath}`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/393271234567');
    expect(location.searchParams.get('text')).toContain('PIN di accesso: 2468');
    expect((await request('/galleries/gallery-1/whatsapp-share', 'POST', { clientId: 'client-2' })).status).toBe(200);
  });

  it('opens WhatsApp with the saved password through a single-use server handoff', async () => {
    const gallery = h.docs.get('galleries/gallery-1')!;
    gallery.code = 'album-1';
    gallery.accessMode = 'password';
    gallery.clientIds = ['client-1'];
    h.docs.set('clienti/client-1', {
      nome: 'Ada',
      cognome: 'Lovelace',
      telefono: '+39 327 123 4567',
    });
    h.docs.set('gallerySecrets/gallery-1', { password: 'Secret-123<&' });
    h.docs.set('desktopWhatsappHandoffs/expired-fixture', { expiresAt: 1 });

    const created = await request('/galleries/gallery-1/whatsapp-share', 'POST', { clientId: 'client-1' });
    expect(created.status).toBe(200);
    expect(created.data).toMatchObject({ expiresInSeconds: 120 });
    expect(created.data.handoffPath).toMatch(/^\/api\/desktop\/galleries\/whatsapp-handoff\/[0-9a-f-]{36}$/i);
    expect(JSON.stringify(created.data)).not.toContain('Secret-123');
    expect(h.docs.has('desktopWhatsappHandoffs/expired-fixture')).toBe(false);

    const handoffUrl = `${base}${created.data.handoffPath}`;
    const response = await fetch(handoffUrl, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const whatsappUrl = new URL(location!);
    expect(whatsappUrl.hostname).toBe('wa.me');
    expect(whatsappUrl.pathname).toBe('/393271234567');
    expect(whatsappUrl.searchParams.get('text')).toContain('https://imagestudiofotografico.com/gallery/album-1');
    expect(whatsappUrl.searchParams.get('text')).toContain('Password di accesso: Secret-123<&');

    expect([...h.docs.keys()].some(key => key.startsWith('desktopWhatsappHandoffs/'))).toBe(false);
    expect((await fetch(handoffUrl, { redirect: 'manual' })).status).toBe(404);
  });

  it('includes a PIN only for an associated client and omits credentials for open galleries', async () => {
    const gallery = h.docs.get('galleries/gallery-1')!;
    gallery.code = 'ritratto';
    gallery.accessMode = 'pin';
    gallery.clientIds = ['client-1'];
    h.docs.set('clienti/client-1', { telefono: '3271234567' });
    h.docs.set('gallerySecrets/gallery-1', { specialPin: '1357' });

    const pinHandoff = await request('/galleries/gallery-1/whatsapp-share', 'POST', { clientId: 'client-1' });
    const pinResponse = await fetch(`${base}${pinHandoff.data.handoffPath}`, { redirect: 'manual' });
    const pinMessage = new URL(pinResponse.headers.get('location')!).searchParams.get('text') || '';
    expect(pinMessage).toContain('PIN di accesso: 1357');
    expect(pinMessage).not.toContain('Password di accesso');

    gallery.accessMode = 'open';
    h.docs.set('gallerySecrets/gallery-1', { specialPin: 'legacy-pin' });
    const openHandoff = await request('/galleries/gallery-1/whatsapp-share', 'POST', { clientId: 'client-1' });
    const openResponse = await fetch(`${base}${openHandoff.data.handoffPath}`, { redirect: 'manual' });
    const openMessage = new URL(openResponse.headers.get('location')!).searchParams.get('text') || '';
    expect(openMessage).toContain('https://imagestudiofotografico.com/gallery/ritratto');
    expect(openMessage).not.toContain('legacy-pin');
  });

  it('rejects unassociated recipients and linked clients without a valid phone number', async () => {
    const gallery = h.docs.get('galleries/gallery-1')!;
    gallery.code = 'album-1';
    gallery.clientIds = ['client-1'];
    h.docs.set('clienti/client-1', { telefono: '' });
    h.docs.set('clienti/client-2', { telefono: '+39 333 444 5566' });

    expect(await request('/galleries/gallery-1/whatsapp-share', 'POST', { clientId: 'client-2' }))
      .toMatchObject({ status: 403 });
    expect(await request('/galleries/gallery-1/whatsapp-share', 'POST', { clientId: 'client-1' }))
      .toMatchObject({ status: 409 });
    expect([...h.docs.keys()].some(key => key.startsWith('desktopWhatsappHandoffs/'))).toBe(false);
  });
});

describe('desktop gallery authenticated isolated upload', () => {
  it('rejects requests without Firebase authentication or admin allow-list', async () => {
    expect((await request('/galleries/gallery-1/photos', 'GET', undefined, 'bad')).status).toBe(401);
    expect((await request('/galleries/gallery-1/photos', 'GET', undefined, 'fixture-other')).status).toBe(403);
    expect(h.docs.size).toBe(2);
  });

  it('keeps legacy credentials out of gallery responses and exposes secrets only through the admin secret contract', async () => {
    h.docs.get('galleries/gallery-1')!.password = 'legacy-password';
    h.docs.set('gallerySecrets/gallery-1', { password: 'server-password', specialPin: null });
    const gallery = await request('/galleries/gallery-1');
    expect(gallery.status).toBe(200);
    expect(gallery.data).not.toHaveProperty('password');
    expect(gallery.data).not.toHaveProperty('specialPin');
    expect(await request('/galleries/gallery-1/secrets')).toMatchObject({
      status: 200, data: { passwordEnabled: true, pinEnabled: false },
    });
    expect((await request('/galleries/gallery-1/secrets')).data).not.toHaveProperty('password');
    expect(await request('/galleries/gallery-1/secrets', 'PUT', { password: 'new-password', specialPin: '1234' }))
      .toMatchObject({ status: 400 });
    expect(await request('/galleries/gallery-1/secrets', 'PUT', { password: 'new-password' }))
      .toMatchObject({ status: 200, data: { passwordEnabled: true, pinEnabled: false } });
  });

  it('changes theme and access together, retains unchanged credentials and rejects unprotected special themes', async () => {
    const gallery = 'galleries/gallery-1', secrets = 'gallerySecrets/gallery-1';
    expect((await request('/galleries/gallery-1/secrets', 'PUT', {
      accessMode: 'pin', specialTheme: 'natale'
    })).status).toBe(400);
    expect(h.docs.get(gallery)?.specialTheme).toBeUndefined();
    expect((await request('/galleries/gallery-1/secrets', 'PUT', {
      accessMode: 'pin', specialTheme: 'natale', specialPin: '1234'
    })).status).toBe(200);
    expect(h.docs.get(gallery)).toMatchObject({ specialTheme: 'natale', accessMode: 'pin', hasSpecialPin: true });
    expect(h.docs.get(secrets)).toMatchObject({ specialPin: '1234', password: null });
    expect((await request('/galleries/gallery-1/secrets', 'PUT', {
      accessMode: 'pin', specialTheme: 'pasqua'
    })).status).toBe(200);
    expect(h.docs.get(secrets)?.specialPin).toBe('1234');
    expect((await request('/galleries/gallery-1/secrets', 'PUT', {
      accessMode: 'password', specialTheme: null
    })).status).toBe(400);
    expect(h.docs.get(gallery)?.specialTheme).toBe('pasqua');
    expect((await request('/galleries/gallery-1/secrets', 'PUT', {
      accessMode: 'password', specialTheme: null, password: 'new-pass'
    })).status).toBe(200);
    expect(h.docs.get(gallery)).toMatchObject({ specialTheme: null, accessMode: 'password', hasSpecialPin: false });
    expect(h.docs.get(secrets)).toMatchObject({ password: 'new-pass', specialPin: null });
    expect((await request('/galleries/gallery-1', 'PATCH', { specialTheme: 'natale' })).status).toBe(400);
  });

  it('validates catalog-backed selection products and derives the required quota', async () => {
    h.docs.set('products/album', { nome: 'Album', numeroFoto: 20 });
    const result = await request('/galleries/gallery-1/customer-selection', 'PUT', {
      selectionEnabled: true,
      productRequirements: [{ prodottoId: 'album', prodottoNome: 'Album', prodottoNumeroFoto: 20 }],
      requiredPhotoCount: 999,
    });
    expect(result.status).toBe(200);
    expect(h.docs.get('galleries/gallery-1')).toMatchObject({
      requiredPhotoCount: 20, unlimitedSelection: false,
      productRequirements: [{ prodottoId: 'album', prodottoNome: 'Album', prodottoNumeroFoto: 20 }],
    });
    expect((await request('/galleries/gallery-1/customer-selection', 'PUT', {
      productRequirements: [{ prodottoId: 'album', prodottoNome: 'Wrong', prodottoNumeroFoto: 20 }],
    })).status).toBe(400);
  });

  it('uploads an original, finalizes metadata and downloads identical bytes; folder chapters are reused', async () => {
    const original = Buffer.from([255, 216, 255, 19, 42, 0, 128]);
    const hash = createHash('sha256').update(original).digest('hex');
    const start = await request('/galleries/gallery-1/upload-sessions', 'POST', {
      fileName: 'original.jpg', contentType: 'image/jpeg', size: original.length, contentHash: hash,
    });
    expect(start.status).toBe(201);
    const put = await fetch(start.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: original });
    expect(put.status).toBe(200);
    const finalizeBody = { storagePath: start.data.storagePath, name: 'original.jpg', size: original.length, contentType: 'image/jpeg', contentHash: hash, chapterName: '' };
    expect((await request('/galleries/other/photos/finalize', 'POST', finalizeBody)).status).toBe(400);
    const withChapter = await request('/galleries/gallery-1/upload-sessions', 'POST', {
      fileName: 'original.jpg', contentType: 'image/jpeg', size: original.length, contentHash: hash, chapterName: 'Cerimonia'
    });
    await fetch(withChapter.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: original });
    finalizeBody.storagePath = withChapter.data.storagePath;
    finalizeBody.chapterName = 'Cerimonia';
    const result = await request('/galleries/gallery-1/photos/finalize', 'POST', finalizeBody);
    expect(result.status).toBe(201);
    const photo = h.docs.get(`photos/${result.data.id}`)!;
    expect(photo).toMatchObject({ galleryId: 'gallery-1', originalName: 'original.jpg', size: original.length, contentHash: hash, uploaderUid: 'fixture-uid', chapterName: 'Cerimonia' });
    expect(h.docs.get('galleries/gallery-1')?.chapters).toHaveLength(1);
    expect(photo.chapterId).toBe(h.docs.get('galleries/gallery-1')?.chapters[0].id);
    const downloadUrl = new URL(photo.url);
    expect(downloadUrl.hostname).toBe('firebasestorage.googleapis.com');
    expect(downloadUrl.pathname).toContain(encodeURIComponent(withChapter.data.storagePath));
    const downloaded = await fetch(`${base}/download/${encodeURIComponent(withChapter.data.storagePath)}?token=${downloadUrl.searchParams.get('token')}`);
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(original);
    expect(h.docs.get('galleries/gallery-1')?.photoCount).toBe(1);

    const repeated = await request('/galleries/gallery-1/upload-sessions', 'POST', { fileName: 'copy.jpg', size: original.length, contentType: 'image/jpeg', contentHash: hash });
    expect(repeated).toMatchObject({ status: 409, data: { duplicatePhotoId: result.data.id } });
    const finalizeDuplicate = await request('/galleries/gallery-1/photos/finalize', 'POST', finalizeBody);
    expect(finalizeDuplicate).toMatchObject({ status: 409, data: { duplicatePhotoId: result.data.id } });
    expect([...h.docs.keys()].filter(key => key.startsWith('photos/'))).toHaveLength(1);
    expect(h.docs.get('galleries/gallery-1')?.chapters).toHaveLength(1);
    expect(h.docs.get('galleries/gallery-1')?.photoCount).toBe(1);
  });

  it('rejects nonexistent and forged objects before finalization, and retry remains idempotent', async () => {
    const bytes = Buffer.from([255, 216, 255, 10, 20, 30]);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const body = { fileName: 'a.jpg', contentType: 'image/jpeg', size: bytes.length, contentHash: hash };
    expect((await request('/galleries/missing/upload-sessions', 'POST', body)).status).toBe(400);
    const session = await request('/galleries/gallery-1/upload-sessions', 'POST', body);
    const finalize = { storagePath: session.data.storagePath, name: 'a.jpg', contentType: 'image/jpeg', size: bytes.length, contentHash: hash };
    expect((await request('/galleries/gallery-1/photos/finalize', 'POST', { ...finalize, storagePath: 'galleries/gallery-1/photos/forged' })).status).toBe(400);
    await fetch(session.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: Buffer.from([255, 216, 255, 1, 2, 3]) });
    expect((await request('/galleries/gallery-1/photos/finalize', 'POST', finalize)).status).toBe(400);
    await fetch(session.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: bytes });
    expect((await request('/galleries/gallery-1/photos/finalize', 'POST', finalize)).status).toBe(201);
    expect((await request('/galleries/gallery-1/photos/finalize', 'POST', finalize)).status).toBe(409);
    expect(h.docs.get('galleries/gallery-1')?.photoCount).toBe(1);
  });

  it('finalizes original names with accents and spaces while keeping the storage path safe', async () => {
    const bytes = Buffer.from([255, 216, 255, 2, 9, 3]);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const fileName = 'ritratto è bello.jpg';
    const session = await request('/galleries/gallery-1/upload-sessions', 'POST', {
      fileName, size: bytes.length, contentType: 'image/jpeg', contentHash: hash,
    });
    expect(session.status).toBe(201);
    expect(session.data.storagePath).not.toContain(' ');
    expect(session.data.metadata.originalName).toBe(fileName);
    await fetch(session.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: bytes });
    const finalize = { storagePath: session.data.storagePath, name: fileName, originalName: fileName,
      contentType: 'image/jpeg', size: bytes.length, contentHash: hash };
    expect((await request('/galleries/gallery-1/photos/finalize', 'POST', { ...finalize, name: 'ritratto__.jpg' })).status).toBe(400);
    const result = await request('/galleries/gallery-1/photos/finalize', 'POST', finalize);
    expect(result.status).toBe(201);
    expect(h.docs.get(`photos/${result.data.id}`)).toMatchObject({ name: fileName, originalName: fileName });
    expect((await request('/galleries/gallery-1/photos/finalize', 'POST', finalize)).status).toBe(409);
    expect([...h.docs.keys()].filter(key => key.startsWith('photos/'))).toHaveLength(1);
  });

  it('uploads separate local covers and persists mobile focal position without adding gallery photos', async () => {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
    const start = await request('/galleries/gallery-1/covers/upload-sessions', 'POST', { size: bytes.length, contentType: 'image/png' });
    expect(start.status).toBe(201);
    await fetch(start.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: bytes });
    expect((await request('/galleries/other/covers/finalize', 'POST', { storagePath: start.data.storagePath, kind: 'mobile', position: { x: 30, y: 60 } })).status).toBe(400);
    const result = await request('/galleries/gallery-1/covers/finalize', 'POST', { storagePath: start.data.storagePath, kind: 'mobile', position: { x: 30, y: 60 } });
    expect(result.status).toBe(200);
    expect(h.docs.get('galleries/gallery-1')).toMatchObject({ coverImageMobile: result.data.url, coverImageMobilePosition: { x: 30, y: 60 }, photoCount: 0 });
    expect((await request('/galleries/gallery-1/cover/position', 'PATCH', { kind: 'mobile', position: { x: 45, y: 55 } })).status).toBe(200);
    expect(h.docs.get('galleries/gallery-1')?.coverImageMobilePosition).toEqual({ x: 45, y: 55 });
  });
});

describe('modern and legacy photos in an existing gallery', () => {
  beforeEach(() => {
    h.docs.set('photos/modern', { galleryId: 'gallery-1', name: 'Modern', storagePath: 'modern.jpg', position: 2 });
    h.docs.set('galleries/gallery-1/photos/old', { name: 'Legacy', filePath: 'legacy.jpg', position: 1 });
    h.blobs.set('modern.jpg', Buffer.from('modern'));
    h.blobs.set('legacy.jpg', Buffer.from('legacy'));
    h.docs.get('galleries/gallery-1')!.photoCount = 2;
  });

  it('lists both schemas and deletes each through the gallery-scoped photo endpoint', async () => {
    const list = await request('/galleries/gallery-1/photos');
    expect(list.data.photos.map((photo: any) => photo.id)).toEqual(['legacy-old', 'modern']);
    expect((await request('/galleries/other/photos/modern?confirm=true', 'DELETE')).status).toBe(404);
    expect((await request('/galleries/gallery-1/photos/legacy-old', 'DELETE')).status).toBe(400);
    expect((await request('/galleries/gallery-1/photos/legacy-old?confirm=true', 'DELETE')).status).toBe(200);
    expect((await request('/galleries/gallery-1/photos/modern?confirm=true', 'DELETE')).status).toBe(200);
    expect((await request('/galleries/gallery-1/photos')).data.photos).toEqual([]);
    expect(h.blobs.size).toBe(0);
    expect(h.docs.get('galleries/gallery-1')?.photoCount).toBe(0);
  });

  it('keeps metadata and counters consistent when storage deletion temporarily fails', async () => {
    h.storageDeleteFailures.add('modern.jpg');
    h.storageDeleteFailures.add('legacy.jpg');
    expect((await request('/galleries/gallery-1/photos/modern?confirm=true', 'DELETE')).status).toBe(503);
    expect((await request('/galleries/gallery-1/photos/legacy-old?confirm=true', 'DELETE')).status).toBe(503);
    expect(h.docs.has('photos/modern')).toBe(true);
    expect(h.docs.has('galleries/gallery-1/photos/old')).toBe(true);
    expect((await request('/galleries/gallery-1/photos/modern?confirm=true', 'DELETE')).status).toBe(200);
    expect((await request('/galleries/gallery-1/photos/legacy-old?confirm=true', 'DELETE')).status).toBe(200);
    expect(h.docs.has('photos/modern')).toBe(false);
    expect(h.docs.has('galleries/gallery-1/photos/old')).toBe(false);
    expect(h.docs.get('galleries/gallery-1')?.photoCount).toBe(0);
    // Retrying after the object has been removed must remain safe.
    expect((await request('/galleries/gallery-1/photos/modern?confirm=true', 'DELETE')).status).toBe(404);
  });

  it('creates, edits, orders, assigns and deletes chapters without losing modern or legacy photos', async () => {
    const first = await request('/galleries/gallery-1/chapters', 'POST', { titolo: 'Preparativi', descrizione: 'Prima' });
    const second = await request('/galleries/gallery-1/chapters', 'POST', { titolo: 'Cerimonia' });
    expect(first.status).toBe(201);
    expect((await request('/galleries/gallery-1/chapters', 'POST', { titolo: '' })).status).toBe(400);
    const a = first.data.chapter.id, b = second.data.chapter.id;
    expect((await request(`/galleries/gallery-1/chapters/${a}`, 'PATCH', { titolo: 'Preparazione', descrizione: 'Casa' })).status).toBe(200);
    expect((await request('/galleries/gallery-1/chapters/reorder', 'POST', { chapterIds: [b, a] })).status).toBe(200);
    expect((await request('/galleries/gallery-1/chapters')).data.chapters.map((c: any) => c.titolo)).toEqual(['Cerimonia', 'Preparazione']);
    expect((await request('/galleries/gallery-1/photos/assign', 'POST', { photoIds: ['modern', 'legacy-old'], chapterId: a })).status).toBe(200);
    expect((await request('/galleries/other/photos/assign', 'POST', { photoIds: ['modern'], chapterId: null })).status).toBe(404);
    expect((await request('/galleries/gallery-1/photos/assign', 'POST', { photoIds: ['modern'], chapterId: 'missing' })).status).toBe(404);
    const photoUrl = 'https://example.test/modern.jpg';
    h.docs.get('photos/modern')!.url = photoUrl;
    expect((await request(`/galleries/gallery-1/chapters/${a}/cover`, 'POST', { photoId: 'modern', position: { x: 25, y: 80 } })).status).toBe(200);
    expect(h.docs.get('galleries/gallery-1')?.chapters.find((c: any) => c.id === a)?.coverPhotoUrl).toBe(photoUrl);
    expect((await request(`/galleries/gallery-1/chapters/${b}/cover`, 'POST', { photoId: 'modern' })).status).toBe(400);
    expect((await request(`/galleries/gallery-1/chapters/${a}`, 'DELETE', { confirm: true })).status).toBe(200);
    expect(h.docs.get('photos/modern')?.chapterId).toBe(null);
    expect(h.docs.get('galleries/gallery-1/photos/old')?.chapterId).toBe(null);
    expect((await request('/galleries/gallery-1/photos')).data.photos).toHaveLength(2);
  });

  it('sets separate desktop/mobile covers from owned photos, rejects foreign photos and validates focal points', async () => {
    h.docs.get('photos/modern')!.url = 'https://example.test/modern.jpg';
    h.docs.get('galleries/gallery-1/photos/old')!.url = 'https://example.test/old.jpg';
    expect((await request('/galleries/gallery-1/cover', 'PATCH', { kind: 'desktop', photoId: 'modern', position: { x: 12, y: 80 } })).status).toBe(200);
    expect((await request('/galleries/gallery-1/cover', 'PATCH', { kind: 'mobile', photoId: 'legacy-old', position: { x: 70, y: 30 } })).status).toBe(200);
    expect(h.docs.get('galleries/gallery-1')).toMatchObject({
      coverImageDesktop: 'https://example.test/modern.jpg',
      coverImageMobile: 'https://example.test/old.jpg',
      coverImageDesktopPosition: { x: 12, y: 80 }, coverImageMobilePosition: { x: 70, y: 30 },
    });
    expect((await request('/galleries/other/cover', 'PATCH', { kind: 'desktop', photoId: 'modern' })).status).toBe(400);
    expect((await request('/galleries/gallery-1/cover', 'PATCH', { kind: 'mobile', photoId: 'modern', position: { x: 110, y: 50 } })).status).toBe(400);
    expect((await request('/galleries/gallery-1/cover', 'PATCH', { kind: 'desktop', photoId: null })).status).toBe(200);
  });

  it('archives without removing either schema or storage bytes', async () => {
    expect((await request('/galleries/gallery-1/archive', 'POST')).status).toBe(200);
    expect(h.docs.get('galleries/gallery-1')?.active).toBe(false);
    expect((await request('/galleries/gallery-1/photos')).data.photos).toHaveLength(2);
    expect(h.blobs.size).toBe(2);
  });

  it('treats confirmed non-permanent deletion as archival', async () => {
    const result = await request('/galleries/gallery-1', 'DELETE', { confirm: true });
    expect(result).toMatchObject({ status: 200, data: { archived: true } });
    expect(h.docs.get('galleries/gallery-1')?.active).toBe(false);
    expect((await request('/galleries/gallery-1/photos')).data.photos).toHaveLength(2);
    expect(h.blobs.size).toBe(2);
  });

  it('requires confirmation and permanently deletes both schemas, bytes and secrets', async () => {
    h.docs.set('gallerySecrets/gallery-1', { fixture: true });
    expect((await request('/galleries/gallery-1', 'DELETE', { permanent: true })).status).toBe(400);
    expect(h.docs.get('galleries/gallery-1')).toBeDefined();
    const result = await request('/galleries/gallery-1', 'DELETE', { permanent: true, confirm: true });
    expect(result).toMatchObject({ status: 200, data: { deleted: true, deletedPhotos: 2 } });
    expect([...h.docs.keys()].filter(key => key.includes('gallery-1') || key === 'photos/modern')).toEqual([]);
    expect(h.blobs.size).toBe(0);
    expect(h.docs.has('galleries/other')).toBe(true);
  });
});

describe('desktop gallery associations', () => {
  it('returns active centralized job types in their web-app display order', async () => {
    h.docs.set('jobTypes/last', { slug: 'ritratto', nome: 'Ritratto', attivo: true, ordine: 2 });
    h.docs.set('jobTypes/first', { slug: 'matrimonio', nome: 'Matrimonio', attivo: true, ordine: 1 });
    h.docs.set('jobTypes/disabled', { slug: 'altro', nome: 'Altro', attivo: false, ordine: 0 });
    const result = await request('/job-types');
    expect(result.status).toBe(200);
    expect(result.data.jobTypes.map((type: any) => type.slug)).toEqual(['matrimonio', 'ritratto']);
    expect(result.data.jobTypes[0]).toMatchObject({ id: 'first', nome: 'Matrimonio' });
  });

  it('validates and creates job/client reverse links', async () => {
    h.docs.set('jobs/job-a', { name: 'Job A', galleryIds: [] });
    h.docs.set('clienti/client-a', { nome: 'Client A', sourceRefs: { crm: 'x' } });
    const result = await request('/galleries', 'POST', {
      name: 'Associated gallery', jobId: 'job-a', clientiIds: ['client-a'],
    });
    expect(result.status).toBe(201);
    const gallery = h.docs.get(`galleries/${result.data.id}`)!;
    expect(gallery).toMatchObject({ jobId: 'job-a', clientIds: ['client-a'], clientiIds: ['client-a'], clienteId: 'client-a' });
    expect(h.docs.get('jobs/job-a')?.galleryIds).toEqual([result.data.id]);
    expect(h.docs.get('clienti/client-a')?.sourceRefs).toEqual({ crm: 'x', galleryIds: [result.data.id] });
  });

  it('moves associations on patch without persisting the UI-only clientId', async () => {
    h.docs.set('jobs/job-a', { galleryIds: ['gallery-1'] });
    h.docs.set('jobs/job-b', { galleryIds: [] });
    h.docs.set('clienti/client-a', { sourceRefs: { galleryIds: ['gallery-1'] } });
    h.docs.set('clienti/client-b', { sourceRefs: {} });
    h.docs.get('galleries/gallery-1')!.jobId = 'job-a';
    h.docs.get('galleries/gallery-1')!.clientIds = ['client-a'];
    expect((await request('/galleries/gallery-1', 'PATCH', {
      jobId: 'job-b', clientIds: ['client-b'], clientId: 'ignored',
    })).status).toBe(200);
    expect(h.docs.get('galleries/gallery-1')).toMatchObject({ jobId: 'job-b', clientIds: ['client-b'], clientiIds: ['client-b'], clienteId: 'client-b' });
    expect(h.docs.get('galleries/gallery-1')).not.toHaveProperty('clientId');
    expect(h.docs.get('jobs/job-a')?.galleryIds).toEqual([]);
    expect(h.docs.get('jobs/job-b')?.galleryIds).toEqual(['gallery-1']);
    expect(h.docs.get('clienti/client-a')?.sourceRefs.galleryIds).toEqual([]);
    expect(h.docs.get('clienti/client-b')?.sourceRefs.galleryIds).toEqual(['gallery-1']);
  });

  it('clears associations and rejects references that do not exist', async () => {
    h.docs.set('jobs/job-a', { galleryIds: ['gallery-1'] });
    h.docs.set('clienti/client-a', { sourceRefs: { galleryIds: ['gallery-1'] } });
    h.docs.get('galleries/gallery-1')!.jobId = 'job-a';
    h.docs.get('galleries/gallery-1')!.clientIds = ['client-a'];
    expect((await request('/galleries/gallery-1', 'PATCH', { jobId: null, clientIds: [] })).status).toBe(200);
    expect(h.docs.get('galleries/gallery-1')).toMatchObject({ jobId: null, clientIds: [], clientiIds: [], clienteId: null });
    expect(h.docs.get('jobs/job-a')?.galleryIds).toEqual([]);
    expect(h.docs.get('clienti/client-a')?.sourceRefs.galleryIds).toEqual([]);
    expect((await request('/galleries/gallery-1', 'PATCH', { jobId: 'missing' })).status).toBe(400);
    expect((await request('/galleries/gallery-1', 'PATCH', { clientIds: ['missing'] })).status).toBe(400);
  });

  it('keeps the legacy clienteId in sync when clients change and clear', async () => {
    h.docs.set('clienti/client-a', { sourceRefs: {} });
    h.docs.set('clienti/client-b', { sourceRefs: {} });
    h.docs.get('galleries/gallery-1')!.clientIds = ['client-a'];
    h.docs.get('galleries/gallery-1')!.clientiIds = ['client-a'];
    h.docs.get('galleries/gallery-1')!.clienteId = 'client-a';
    expect((await request('/galleries/gallery-1', 'PATCH', { clientIds: ['client-b'] })).status).toBe(200);
    expect(h.docs.get('galleries/gallery-1')?.clienteId).toBe('client-b');
    expect((await request('/galleries/gallery-1', 'PATCH', { clientIds: [] })).status).toBe(200);
    expect(h.docs.get('galleries/gallery-1')?.clienteId).toBe(null);
  });

  it('removes reverse links from every legacy client representation when canonical ids are empty', async () => {
    h.docs.set('clienti/client-array', { sourceRefs: { crm: 'x', galleryIds: ['gallery-1'] } });
    h.docs.set('clienti/client-scalar', { sourceRefs: { galleryIds: ['gallery-1'] } });
    Object.assign(h.docs.get('galleries/gallery-1')!, {
      clientIds: [],
      clientiIds: ['client-array'],
      clienteId: 'client-scalar',
    });

    expect((await request('/galleries/gallery-1', 'PATCH', { clientIds: [] })).status).toBe(200);
    expect(h.docs.get('galleries/gallery-1')).toMatchObject({
      clientIds: [], clientiIds: [], clienteId: null,
    });
    expect(h.docs.get('clienti/client-array')?.sourceRefs).toEqual({ crm: 'x', galleryIds: [] });
    expect(h.docs.get('clienti/client-scalar')?.sourceRefs.galleryIds).toEqual([]);
  });

  it('unions legacy client fields when changing only the Job on an older gallery', async () => {
    h.docs.set('jobs/job-old', { galleryIds: ['gallery-1'] });
    h.docs.set('jobs/job-new', { galleryIds: [] });
    h.docs.set('clienti/client-array', { sourceRefs: {} });
    h.docs.set('clienti/client-scalar', { sourceRefs: {} });
    Object.assign(h.docs.get('galleries/gallery-1')!, {
      jobId: 'job-old',
      clientIds: [],
      clientiIds: ['client-array'],
      clienteId: 'client-scalar',
    });

    expect((await request('/galleries/gallery-1', 'PATCH', { jobId: 'job-new' })).status).toBe(200);
    expect(h.docs.get('galleries/gallery-1')).toMatchObject({
      jobId: 'job-new',
      clientIds: ['client-array', 'client-scalar'],
      clientiIds: ['client-array', 'client-scalar'],
      clienteId: 'client-array',
    });
    expect(h.docs.get('jobs/job-old')?.galleryIds).toEqual([]);
    expect(h.docs.get('jobs/job-new')?.galleryIds).toEqual(['gallery-1']);
    expect(h.docs.get('clienti/client-array')?.sourceRefs.galleryIds).toEqual(['gallery-1']);
    expect(h.docs.get('clienti/client-scalar')?.sourceRefs.galleryIds).toEqual(['gallery-1']);
  });

  it('validates and synchronizes associations through PUT as well', async () => {
    h.docs.set('jobs/job-put', { galleryIds: [] });
    h.docs.set('clienti/client-put', { sourceRefs: {} });
    expect((await request('/galleries/gallery-1', 'PUT', { jobId: 'job-put', clientIds: ['client-put'] })).status).toBe(200);
    expect(h.docs.get('jobs/job-put')?.galleryIds).toEqual(['gallery-1']);
    expect(h.docs.get('clienti/client-put')?.sourceRefs.galleryIds).toEqual(['gallery-1']);
    expect((await request('/galleries/gallery-1', 'PUT', { jobId: 'missing' })).status).toBe(400);
    expect((await request('/galleries/gallery-1', 'PUT', { clientIds: ['missing'] })).status).toBe(400);
  });

  it('clears reverse links before permanently deleting a gallery', async () => {
    h.docs.set('jobs/job-a', { galleryIds: ['gallery-1', 'other-gallery'] });
    h.docs.set('clienti/client-a', { sourceRefs: { crm: 'x', galleryIds: ['gallery-1'] } });
    h.docs.get('galleries/gallery-1')!.jobId = 'job-a';
    h.docs.get('galleries/gallery-1')!.clienteId = 'client-a';
    const result = await request('/galleries/gallery-1', 'DELETE', { confirm: true, permanent: true });
    expect(result).toMatchObject({ status: 200, data: { deleted: true } });
    expect(h.docs.has('galleries/gallery-1')).toBe(false);
    expect(h.docs.get('jobs/job-a')?.galleryIds).toEqual(['other-gallery']);
    expect(h.docs.get('clienti/client-a')?.sourceRefs).toEqual({ crm: 'x', galleryIds: [] });
  });
});
describe('client selection results and reset (same behaviour as the web admin)', () => {
  beforeEach(() => {
    h.docs.set('galleries/gallery-1', {
      name: 'Existing gallery', photoCount: 2,
      chapters: [{ id: 'ch-1', titolo: 'Cerimonia' }],
      selectionStatus: 'completed', selectedPhotoIds: ['modern', 'legacy-old'], selectionNotes: 'Stampa opaca',
      photoAssignments: { modern: ['0'] }, photoNotes: { modern: 'ritaglia' }, selectionLocked: true,
      productRequirements: [{ prodottoId: 'album', prodottoNome: 'Album 30x30', prodottoNumeroFoto: 20 }],
    });
    h.docs.set('photos/modern', { galleryId: 'gallery-1', name: '1762272139996-DSCF4065.jpg', chapterId: 'ch-1', url: 'https://cdn/modern.jpg' });
    h.docs.set('galleries/gallery-1/photos/old', { name: 'DSCF0001.jpg' });
    h.docs.set('photos/foreign', { galleryId: 'other', name: 'foreign.jpg' });
  });

  it('returns Lightroom-ready names grouped with chapter, product and per-photo notes', async () => {
    const { status, data } = await request('/galleries/gallery-1/selection-results');
    expect(status).toBe(200);
    expect(data.status).toBe('completed');
    expect(data.notes).toBe('Stampa opaca');
    h.docs.get('galleries/gallery-1')!.selectedPhotoIds.push('foreign');
    const foreign = (await request('/galleries/gallery-1/selection-results')).data.photos.at(-1);
    expect(foreign).toMatchObject({ id: 'foreign', name: 'foreign', url: null });
    expect(data.photos).toEqual([
      { id: 'modern', name: '1762272139996-DSCF4065.jpg', exportName: 'DSCF4065.jpg', url: 'https://cdn/modern.jpg', chapterId: 'ch-1', chapterName: 'Cerimonia', products: ['Album 30x30'], note: 'ritaglia' },
      { id: 'legacy-old', name: 'DSCF0001.jpg', exportName: 'DSCF0001.jpg', url: null, chapterId: null, chapterName: null, products: [], note: null },
    ]);
  });

  it('archives a completed selection as a revision snapshot before clearing it', async () => {
    expect((await request('/galleries/gallery-1/customer-selection/reset', 'POST', {})).status).toBe(400);
    expect((await request('/galleries/missing/customer-selection/reset', 'POST', { confirm: true })).status).toBe(404);
    const first = await request('/galleries/gallery-1/customer-selection/reset', 'POST', { confirm: true });
    expect(first.status).toBe(200);
    expect(first.data.snapshot).toMatchObject({ label: 'Revisione 1', selectedPhotoIds: ['modern', 'legacy-old'], selectionNotes: 'Stampa opaca', photoAssignments: { modern: ['0'] }, createdBy: 'admin' });
    const gallery = h.docs.get('galleries/gallery-1')!;
    expect(gallery).toMatchObject({ selectedPhotoIds: [], photoAssignments: {}, selectionStatus: 'pending', selectionNotes: '', photoNotes: {}, selectionLocked: false });
    expect(gallery.selectionSnapshots).toHaveLength(1);
    // A pending/empty selection is not archived again.
    const second = await request('/galleries/gallery-1/customer-selection/reset', 'POST', { confirm: true });
    expect(second.data.snapshot).toBeNull();
    expect(h.docs.get('galleries/gallery-1')!.selectionSnapshots).toHaveLength(1);
    expect((await request('/galleries/gallery-1/customer-selection')).data.snapshots).toHaveLength(1);
  });
});
