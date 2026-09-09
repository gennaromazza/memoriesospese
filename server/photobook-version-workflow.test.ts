import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
// Database isolato: transazioni serializzate e scritture atomiche, nessun accesso Firebase.
const h = vi.hoisted(() => ({ docs: new Map<string, Record<string, any>>(), queue: Promise.resolve(), beforeTransaction: null as (() => void) | null }));
function ref(path: string) {
  return { path, id: path.split('/').pop(), collection: (name: string) => collection(`${path}/${name}`), update: async (value: object) => update(path, value), get: async () => ({ id: path.split('/').pop(), ref: ref(path), exists: h.docs.has(path), data: () => structuredClone(h.docs.get(path)) }) };
}
function update(path: string, value: object) {
  const next = structuredClone(h.docs.get(path)!);
  for (const [key, item] of Object.entries(value)) {
    const [parent, child] = key.split('.');
    if (child) { next[parent] ||= {}; if (item === '__delete__') delete next[parent][child]; else next[parent][child] = item; }
    else next[key] = item;
  }
  h.docs.set(path, next);
}
function collection(path: string, filters: [string, unknown][] = []) {
  return { doc: (id: string = crypto.randomUUID()) => ref(`${path}/${id}`), limit: () => collection(path, filters), where: (field: string, _op: string, value: unknown) => collection(path, [...filters, [field, value]]), get: async () => {
    const docs = await Promise.all([...h.docs].filter(([key, value]) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1 && filters.every(([field, expected]) => value[field] === expected)).map(([key]) => ref(key).get()));
    return { docs, empty: docs.length === 0, size: docs.length };
  } };
}
vi.mock('./firebase-admin.js', () => ({ db: {
  collection,
  runTransaction: async (run: (tx: object) => Promise<unknown>) => {
    const previous = h.queue;
    let release!: () => void;
    h.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    h.beforeTransaction?.(); h.beforeTransaction = null;
    const writes: (() => void)[] = [];
    try {
      const result = await run({ get: (r: { get: () => Promise<unknown> }) => r.get(),
        delete: (r: { path: string }) => writes.push(() => h.docs.delete(r.path)),
        set: (r: { path: string }, value: object) => writes.push(() => h.docs.set(r.path, structuredClone(value))),
        update: (r: { path: string }, value: object) => writes.push(() => update(r.path, value)) });
      writes.forEach(write => write()); return result;
    } finally { release(); }
  },
}, storage: { bucket: () => ({ name: 'test-bucket', file: () => ({ save: async () => {}, delete: async () => {} }) }) }, FieldValue: { serverTimestamp: () => 'timestamp', delete: () => '__delete__' } }));
vi.mock('./email-routes.js', () => ({ authenticateFirebase: (req: express.Request & { user?: object }, _res: express.Response, next: express.NextFunction) => { req.user = { email: req.headers['x-test-admin'] === 'no' ? 'other@example.test' : 'gennaro.mazzacane@gmail.com' }; next(); }, sendGmailEmail: vi.fn(), getSiteBaseUrl: () => 'https://example.test' }));
vi.mock('./google-drive.js', () => ({ findOrCreateLabParentFolder: vi.fn(), createShipmentFolder: vi.fn(), uploadStreamToDriveFolder: vi.fn(), deleteDriveFile: vi.fn() }));
vi.mock('./photobook-gallery.js', () => ({ loadGalleryPhotoDocs: vi.fn(), listGalleryPhotosPublic: vi.fn(), loadGalleryChapters: vi.fn() }));
vi.mock('./lab-shipment-instructions.js', () => ({ refreshLabShipmentInstructions: vi.fn() }));
import routes from './photobook-routes';
import { sendGmailEmail } from './email-routes';
import { createVersionDraft, publishVersion } from './photobook-version-workflow';
const book = () => h.docs.get('photobooks/book')!;
function pages(numbers = [1, 2]) {
  numbers.forEach((pageNumber, index) => h.docs.set(`photobookPages/p${index}`, { photobookId: 'book', version: 2, pageNumber }));
  book().versions[1].pageCount = numbers.length;
}
beforeEach(() => {
  h.docs.clear(); h.queue = Promise.resolve(); h.beforeTransaction = null;
  h.docs.set('photobooks/book', { currentVersion: 1, token: 'same-token-long', locked: false, versions: [{ version: 1, pageCount: 3 }, { version: 2, status: 'draft', pageCount: 0 }] });
});
describe('API reali: link cliente, autorizzazione e notifica pubblicazione', () => {
  let server: Server; let base: string;
  beforeEach(async () => {
    vi.mocked(sendGmailEmail).mockReset();
    book().galleryId = 'gallery'; h.docs.set('galleries/gallery', { clientEmail: 'client@example.test' });
    const app = express(); app.use(express.json()); app.use('/api/photobooks', routes);
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/photobooks`;
  });
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  const post = (base: string, path: string, body: object, admin = true) => fetch(`${base}/book/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-admin': admin ? 'yes' : 'no' }, body: JSON.stringify(body) });
  it('il link esistente ignora bozze richieste e le nasconde dal menu', async () => {
    const result = await fetch(`${base}/by-token/same-token-long?version=2`).then(r => r.json());
    expect(result.version).toBe(1); expect(result.photobook.versions.map((v: { version: number }) => v.version)).toEqual([1]);
    expect(result.photobook.versions[0].status).toBeUndefined(); // Gli upload legacy restano possibili, non marcarli come immutabili.
  });
  it('pubblicazione poi link attuale e storico in sola consultazione', async () => {
    pages(); expect((await post(base, 'publish-version', { version: 2, expectedCurrentVersion: 1, expectedPageCount: 2 })).status).toBe(200);
    expect((await fetch(`${base}/by-token/same-token-long`).then(r => r.json())).version).toBe(2);
    expect((await fetch(`${base}/by-token/same-token-long?version=1`).then(r => r.json())).version).toBe(1);
    expect(sendGmailEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendGmailEmail).mock.calls[0][2]).toContain('https://example.test/fotolibro/same-token');
  });
  it('non invia email per bozza o versione senza pagine', async () => { expect((await post(base, 'notify-version', { version: 2 })).status).toBe(409); expect(sendGmailEmail).not.toHaveBeenCalled(); });
  it('due notifiche simultanee inviano una sola email', async () => {
    pages(); await publishVersion('book', 2, 1, 2);
    await Promise.all([post(base, 'notify-version', { version: 2 }), post(base, 'notify-version', { version: 2 })]);
    expect(sendGmailEmail).toHaveBeenCalledTimes(1);
  });
  it('email assente non nasconde la versione pubblicata', async () => {
    pages(); h.docs.delete('galleries/gallery');
    const response = await post(base, 'publish-version', { version: 2, expectedCurrentVersion: 1, expectedPageCount: 2 });
    expect(await response.json()).toMatchObject({ skipped: 'no-client-email' }); expect(book().currentVersion).toBe(2); expect(sendGmailEmail).not.toHaveBeenCalled();
  });
  it('errore email non annulla la pubblicazione', async () => {
    pages(); vi.mocked(sendGmailEmail).mockRejectedValueOnce(new Error('Gmail non disponibile'));
    expect((await post(base, 'publish-version', { version: 2, expectedCurrentVersion: 1, expectedPageCount: 2 })).status).toBe(500);
    expect(book().currentVersion).toBe(2);
    expect((await post(base, 'notify-version', { version: 2 })).status).toBe(409);
    expect(sendGmailEmail).toHaveBeenCalledTimes(1);
  });
  it('email cliente risolta dal lavoro quando manca nella galleria', async () => {
    pages(); await publishVersion('book', 2, 1, 2); h.docs.delete('galleries/gallery'); book().jobId='job';
    h.docs.set('jobs/job', { clientiIds:['client'] }); h.docs.set('clienti/client',{ email:'job-client@example.test' });
    expect((await post(base,'notify-version',{version:2})).status).toBe(200);
    expect(vi.mocked(sendGmailEmail).mock.calls[0][0]).toBe('job-client@example.test');
  });
  it('la prima versione non genera email automatica', async () => {
    expect(await (await post(base,'notify-version',{version:1})).json()).toMatchObject({skipped:'first-version'}); expect(sendGmailEmail).not.toHaveBeenCalled();
  });
  it('non permette di aggirare la pubblicazione con PATCH currentVersion', async () => {
    const response=await fetch(`${base}/book`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentVersion:2})});
    expect(response.status).toBe(409); expect(book().currentVersion).toBe(1);
  });
  it('il token non apre il mockup di una bozza privata', async () => { expect((await fetch(`${base}/by-token/same-token-long/mockup?version=2`)).status).toBe(404); });
  it('non notifica una versione precedente o in stampa', async () => {
    pages(); await publishVersion('book',2,1,2); book().locked=true;
    expect((await post(base,'notify-version',{version:2})).status).toBe(409); expect(sendGmailEmail).not.toHaveBeenCalled();
  });
  it.each(['PATCH','DELETE'])('non altera pagine pubblicate tramite %s', async method => {
    pages(); await publishVersion('book',2,1,2);
    const response=await fetch(`${base}/book/pages/p0`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({pageNumber:3})});
    expect(response.status).toBe(409); expect(h.docs.get('photobookPages/p0')!.pageNumber).toBe(1);
  });
  it('upload bozza registra pagina e contatore insieme senza email', async () => {
    const image = await sharp({create:{width:600,height:400,channels:3,background:'#997744'}}).jpeg().toBuffer();
    const response=await fetch(`${base}/book/versions/2/pages?pageNumber=1&fileName=pagina.jpg`,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:image});
    expect(response.status).toBe(200); expect(book().versions[1].pageCount).toBe(1); expect(book().currentVersion).toBe(1); expect(sendGmailEmail).not.toHaveBeenCalled();
  });
  it('lock durante upload impedisce scrittura pagina e contatore', async () => {
    const image = await sharp({create:{width:600,height:400,channels:3,background:'#997744'}}).jpeg().toBuffer();
    h.beforeTransaction=()=>{book().locked=true;};
    const response=await fetch(`${base}/book/versions/2/pages?pageNumber=1`,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:image});
    expect(response.status).toBe(409); expect(book().versions[1].pageCount).toBe(0); expect([...h.docs.keys()].filter(k=>k.startsWith('photobookPages/'))).toHaveLength(0);
  });
  it('eliminare una pagina di bozza aggiorna il contatore', async () => { pages(); expect((await fetch(`${base}/book/pages/p0`,{method:'DELETE'})).status).toBe(200); expect(book().versions[1].pageCount).toBe(1); expect(h.docs.has('photobookPages/p0')).toBe(false); });
  it('upload su versione pubblicata rifiutato prima di memorizzare la pagina', async () => {
    pages(); await publishVersion('book',2,1,2);
    expect((await fetch(`${base}/book/versions/2/pages?pageNumber=3`,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:Buffer.alloc(1200)})).status).toBe(409); expect(book().versions[1].pageCount).toBe(2);
  });
  it.each(['versions', 'publish-version', 'notify-version'])('non amministratore non può chiamare %s', async path => {
    expect((await post(base, path, { version: 2, expectedCurrentVersion: 1, expectedPageCount: 2 }, false)).status).toBe(403); expect(sendGmailEmail).not.toHaveBeenCalled();
  });
  it('un link sconosciuto non legge il fotolibro', async () => { expect((await fetch(`${base}/by-token/unknown`)).status).toBe(404); });
});
describe('Versioni fotolibro: bozza, pubblicazione e concorrenza', () => {
  it('creare una bozza non cambia link e versione visibile', async () => {
    await createVersionDraft('book', 'Correzioni');
    expect(book()).toMatchObject({ currentVersion: 1, token: 'same-token-long' });
    expect(book().versions[2]).toMatchObject({ version: 3, status: 'draft', pageCount: 0, label: 'Correzioni' });
  });
  it('due creazioni simultanee producono numeri distinti', async () => {
    await Promise.all([createVersionDraft('book', null), createVersionDraft('book', null)]);
    expect(book().versions.map((v: { version: number }) => v.version)).toEqual([1, 2, 3, 4]);
  });
  it('blocca la creazione in stampa', async () => { book().locked = true; await expect(createVersionDraft('book', null)).rejects.toMatchObject({ status: 409 }); });
  it('rifiuta fotolibro mancante', async () => { await expect(createVersionDraft('missing', null)).rejects.toMatchObject({ status: 404 }); });
  it('pubblica pagine complete lasciando invariata la versione precedente', async () => {
    pages(); const old = structuredClone(book().versions[0]); await publishVersion('book', 2, 1, 2);
    expect(book().currentVersion).toBe(2); expect(book().versions[0]).toEqual(old); expect(book().versions[1].status).toBe('published');
  });
  it.each([[], [1], [1, 1], [1, 3], [0, 1], [1, 2, 3]])('rifiuta conteggio o numerazione errata %j', async (...args) => {
    const numbers = args as number[]; pages(numbers);
    await expect(publishVersion('book', 2, 1, 2)).rejects.toMatchObject({ status: 409 }); expect(book().currentVersion).toBe(1);
  });
  it.each([0, -1, 1.5, NaN, 10000])('rifiuta versione non valida %s', async version => { await expect(publishVersion('book', version, 1, 2)).rejects.toMatchObject({ status: 400 }); });
  it('rifiuta contatore pagine incoerente', async () => { pages(); book().versions[1].pageCount = 7; await expect(publishVersion('book', 2, 1, 2)).rejects.toMatchObject({ status: 409 }); });
  it('rifiuta una sessione studio obsoleta', async () => { pages(); book().currentVersion = 3; await expect(publishVersion('book', 2, 1, 2)).rejects.toMatchObject({ status: 409 }); });
  it('una vecchia bozza non sostituisce una versione più recente già pubblicata', async () => { pages(); book().currentVersion=3; await expect(publishVersion('book',2,3,2)).rejects.toMatchObject({status:409}); });
  it('rifiuta pubblicazione in stampa', async () => { pages(); book().locked = true; await expect(publishVersion('book', 2, 1, 2)).rejects.toMatchObject({ status: 409 }); });
  it('ripetere la pubblicazione non duplica le revisioni', async () => { pages(); await Promise.all([publishVersion('book', 2, 1, 2), publishVersion('book', 2, 1, 2)]); expect(book().currentVersion).toBe(2); });
  it('non conta le pagine di un altro fotolibro', async () => { pages(); h.docs.get('photobookPages/p1')!.photobookId = 'other'; await expect(publishVersion('book', 2, 1, 2)).rejects.toMatchObject({ status: 409 }); });
});
describe('Continuità mockup fra versioni', () => {
  beforeEach(() => {
    pages();
    h.docs.set('photobooks/book/mockups/v1', { version: 1, revision: 8, status: 'confirmed', confirmedAt: 'yesterday', reportPath: 'private/report', configuration: { photoAssetId: 'front', backPhotoAssetId: 'back', topText: 'Anna e Marco' } });
    h.docs.set('photobooks/book/mockupOffers/v1', { revision: 2, options: [{ name: 'Plaza' }] });
    h.docs.set('photobooks/book/mockupAssets/front', { version: 1, storagePath: 'private/front.jpg' });
    h.docs.set('photobooks/book/mockupAssets/back', { version: 1, storagePath: 'private/back.jpg' });
  });
  it('conserva foto, retro e nomi senza alterare conferma o asset precedenti', async () => {
    const old = structuredClone(h.docs.get('photobooks/book/mockups/v1'));
    await publishVersion('book', 2, 1, 2);
    const next = h.docs.get('photobooks/book/mockups/v2')!;
    expect(next).toMatchObject({ version: 2, revision: 1, status: 'draft', configuration: { topText: 'Anna e Marco' } });
    expect(next.reportPath).toBeUndefined(); expect(next.confirmedAt).toBeUndefined();
    expect(h.docs.get('photobooks/book/mockups/v1')).toEqual(old);
    for (const field of ['photoAssetId', 'backPhotoAssetId']) expect(h.docs.get(`photobooks/book/mockupAssets/${next.configuration[field]}`)?.version).toBe(2);
    expect(h.docs.get('photobooks/book/mockupAssets/front')?.version).toBe(1);
    expect(h.docs.get('photobooks/book/mockupOffers/v2')).toEqual(h.docs.get('photobooks/book/mockupOffers/v1'));
  });
  it.each(['front', 'back'])('asset mancante %s annulla tutta la pubblicazione', async id => {
    h.docs.delete(`photobooks/book/mockupAssets/${id}`);
    await expect(publishVersion('book', 2, 1, 2)).rejects.toMatchObject({ status: 409 });
    expect(book().currentVersion).toBe(1); expect(h.docs.has('photobooks/book/mockups/v2')).toBe(false);
  });
  it('rifiuta asset appartenente a versione diversa', async () => { h.docs.get('photobooks/book/mockupAssets/front')!.version = 9; await expect(publishVersion('book', 2, 1, 2)).rejects.toMatchObject({ status: 409 }); });
  it('supporta incisione senza fotografie', async () => { h.docs.get('photobooks/book/mockups/v1')!.configuration = { photoAssetId: null }; await publishVersion('book', 2, 1, 2); expect(h.docs.get('photobooks/book/mockups/v2')!.configuration.photoAssetId).toBeNull(); });
  it('non sovrascrive un mockup già presente nella bozza', async () => { h.docs.set('photobooks/book/mockups/v2', { revision: 1 }); await expect(publishVersion('book', 2, 1, 2)).rejects.toMatchObject({ status: 409 }); });
});
