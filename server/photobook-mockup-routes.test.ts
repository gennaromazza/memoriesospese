import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import sharp from 'sharp';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MOCKUP_MODEL, ROTATING_MOCKUP_MODEL } from '../shared/mockup-catalog';

const h = vi.hoisted(() => ({ docs: new Map<string, any>(), files: new Map<string, Buffer>(), photos: [] as any[], failAfterCommit: false, beforeTransaction: null as (() => void) | null }));
function ref(path: string): any {
  return {
    id: path.split('/').pop(), path,
    get: async () => { const snapshot = structuredClone(h.docs.get(path)); return { exists: snapshot !== undefined, id: path.split('/').pop(), ref: ref(path), data: () => snapshot }; },
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
  };
}
vi.mock('./firebase-admin.js', () => ({
  db: { collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }), runTransaction: async (run: any) => {
    h.beforeTransaction?.(); h.beforeTransaction = null;
    const result = await run({ get: (r: any) => r.get(), set: (r: any, data: any) => h.docs.set(r.path, structuredClone(data)) });
    if (h.failAfterCommit) { h.failAfterCommit = false; throw new Error('Risposta persa dopo commit'); }
    return result;
  } },
  storage: { bucket: () => ({ name: 'test-bucket', file: (path: string) => ({
    save: async (data: Buffer) => { h.files.set(path, data); },
    delete: async () => { h.files.delete(path); },
    download: async () => [h.files.get(path)],
    getMetadata: async () => [{ size: h.files.get(path)?.length || 0 }],
  }) }) },
}));
vi.mock('./photobook-gallery.js', () => ({ loadGalleryPhotoDocs: vi.fn(async () => h.photos) }));
import { createPhotobookMockupRouter, mockupGalleryStoragePath } from './photobook-mockup-routes';

const photoId = '11111111-1111-4111-8111-111111111111';
const material = MOCKUP_MODEL.variants[0];
const configuration = { modelId: MOCKUP_MODEL.id, assetRevision: MOCKUP_MODEL.assetRevision, materialId: material.id, appearanceRevision: material.appearanceRevision, coverLayout: 'oblique', topText: 'Anna e Marco', bottomText: 'Il nostro giorno', photoAssetId: photoId, crop: { zoom: 1, x: .5, y: .5 } };
describe('Mockup Custodia: persistenza e isolamento fotolibro', () => {
  let server: Server; let base: string;
  beforeEach(async () => {
    h.docs.clear(); h.files.clear(); h.photos = []; h.beforeTransaction = null; h.failAfterCommit = false;
    h.docs.set('photobooks/book', { currentVersion: 1, versions: [{ version: 1 }, { version: 2 }], galleryId: 'gallery', locked: false });
    h.docs.set(`photobooks/book/mockupAssets/${photoId}`, { version: 1, storagePath: 'own-photo.jpg' });
    const app = express(); app.use(express.json());
    app.use('/admin', createPhotobookMockupRouter(async () => ref('photobooks/book').get(), true));
    app.use('/client', createPhotobookMockupRouter(async () => ref('photobooks/book').get(), false));
    app.use('/invalid', createPhotobookMockupRouter(async () => null, false));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  const save = (base: string, body: unknown, scope = 'admin', version = 1) => fetch(`${base}/${scope}?version=${version}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('salva, rilegge e consente la personalizzazione cliente solo dopo attivazione', async () => {
    expect((await fetch(`${base}/client`).then(r => r.json())).enabled).toBe(false);
    expect((await save(base, { revision: 0, configuration }, 'client')).status).toBe(403);
    expect((await save(base, { revision: 0, configuration })).status).toBe(200);
    const loaded = await fetch(`${base}/client`).then(r => r.json());
    expect(loaded.saved.configuration).toEqual(configuration);
    expect(loaded.saved.revision).toBe(1);
    expect((await save(base, { revision: 1, configuration: { ...configuration, topText: 'Nuova scritta' } }, 'client')).status).toBe(200);
    expect(h.docs.get('photobooks/book').approval).toBeUndefined();
    expect(h.docs.get('photobooks/book').locked).toBe(false);
  });
  it('impedisce la sovrascrittura da una sessione non aggiornata', async () => {
    await save(base, { revision: 0, configuration });
    expect((await save(base, { revision: 0, configuration: { ...configuration, topText: 'Obsoleto' } })).status).toBe(409);
    expect(h.docs.get('photobooks/book/mockups/v1').configuration.topText).toBe('Anna e Marco');
  });
  it('salva i due nomi del monogramma senza reinterpretare scritte o date precedenti', async () => {
    const monogram = { ...configuration, modelId: ROTATING_MOCKUP_MODEL.id, assetRevision: 3, frameFinish: 'wood', coverLayout: 'plaque', photoAssetId: null, backCover: 'fabric', backPhotoAssetId: null, backCrop: { zoom: 1, x: .5, y: .5 }, engravingNames: { first: 'Éléonore', second: 'Gian Marco' } };
    expect((await save(base, { revision: 0, configuration: monogram })).status).toBe(200);
    expect((await fetch(`${base}/client`).then(r => r.json())).saved.configuration.engravingNames).toEqual(monogram.engravingNames);
    expect((await save(base, { revision: 1, configuration: { ...monogram, engravingNames: { first: 'A'.repeat(51), second: 'Marco' } } })).status).toBe(400);
    expect((await save(base, { revision: 1, configuration: { ...monogram, assetRevision: 2 } })).status).toBe(400);
  });
  it('valida la foto del retro indipendentemente dalla copertina e conserva i salvataggi v1', async () => {
    const backId = '55555555-5555-4555-8555-555555555555';
    const rotating = { ...configuration, modelId: ROTATING_MOCKUP_MODEL.id, assetRevision: 2, frameFinish: 'wood', coverLayout: 'plaque', photoAssetId: null, backCover: 'photo', backPhotoAssetId: backId, backCrop: { zoom: 1.6, x: .2, y: .7 } };
    expect((await save(base, { revision: 0, configuration: rotating })).status).toBe(400);
    h.docs.set(`photobooks/book/mockupAssets/${backId}`, { version: 2 });
    expect((await save(base, { revision: 0, configuration: rotating })).status).toBe(400);
    h.docs.set(`photobooks/book/mockupAssets/${backId}`, { version: 1 });
    expect((await save(base, { revision: 0, configuration: { ...rotating, backPhotoAssetId: null } })).status).toBe(400);
    expect((await save(base, { revision: 0, configuration: { ...rotating, backCrop: { zoom: 4, x: .5, y: .5 } } })).status).toBe(400);
    expect((await save(base, { revision: 0, configuration: rotating })).status).toBe(200);
    expect((await fetch(`${base}/client`).then(r => r.json())).saved.configuration).toEqual(rotating);
    expect((await save(base, { revision: 1, configuration: { ...rotating, backCover: 'fabric', backPhotoAssetId: null } }, 'client')).status).toBe(200);
    expect((await save(base, { revision: 2, configuration: { ...rotating, assetRevision: 1 } })).status).toBe(400);
  });
  it('salva la placchetta girevole senza foto, ma esige una foto propria per i layout fotografici', async () => {
    const rotating = { ...configuration, modelId: ROTATING_MOCKUP_MODEL.id, assetRevision: 1, frameFinish: 'wood', coverLayout: 'plaque', photoAssetId: null };
    expect((await save(base, { revision: 0, configuration: rotating })).status).toBe(200);
    expect((await fetch(`${base}/client`).then(r => r.json())).saved.configuration).toEqual(rotating);
    for (const coverLayout of ['full', 'photo-plaque']) {
      expect((await save(base, { revision: 1, configuration: { ...rotating, coverLayout } })).status).toBe(400);
      expect((await save(base, { revision: 1, configuration: { ...rotating, coverLayout, photoAssetId: '22222222-2222-4222-8222-222222222222' } })).status).toBe(400);
    }
    expect((await save(base, { revision: 1, configuration: { ...rotating, frameFinish: 'red' } })).status).toBe(400);
    expect((await save(base, { revision: 1, configuration: { ...rotating, assetRevision: 2 } })).status).toBe(400);
    expect((await save(base, { revision: 1, configuration: { ...rotating, coverLayout: 'full', photoAssetId: photoId, frameFinish: 'fabric' } })).status).toBe(200);
    expect((await save(base, { revision: 2, configuration: { ...configuration, photoAssetId: null } })).status).toBe(400);
  });
  it('in stampa blocca sia cliente sia studio', async () => {
    await save(base, { revision: 0, configuration });
    h.docs.get('photobooks/book').locked = true;
    expect((await save(base, { revision: 1, configuration }, 'client')).status).toBe(409);
    expect((await save(base, { revision: 1, configuration })).status).toBe(409);
    expect(await fetch(`${base}/admin`).then(r => r.json())).toMatchObject({ editable: false });
  });
  it('approvare le pagine non blocca le nuove revisioni della copertina', async () => {
    await save(base, { revision: 0, configuration });
    h.docs.get('photobooks/book').approval = { version: 1 };
    expect((await save(base, { revision: 1, configuration }, 'client')).status).toBe(200);
  });
  it('ricontrolla il lock in transazione', async () => {
    await save(base, { revision: 0, configuration });
    h.beforeTransaction = () => { h.docs.get('photobooks/book').locked = true; };
    expect((await save(base, { revision: 1, configuration }, 'client')).status).toBe(409);
  });
  it.each(['draft', 'submitted', 'confirmed', 'changes_requested'].flatMap(status =>
    [false, true].flatMap(locked => [false, true].flatMap(approved => [1, 2].map(currentVersion => ({ status, locked, approved, currentVersion }))))
  ))('matrice permessi cliente e storico: %j', async ({ status, locked, approved, currentVersion }) => {
    await save(base, { revision: 0, configuration });
    const previous = { ...h.docs.get('photobooks/book/mockups/v1'), status };
    h.docs.set('photobooks/book/mockups/v1', previous);
    Object.assign(h.docs.get('photobooks/book'), { locked, currentVersion, approval: approved ? { version: 1 } : null });
    const allowed = !locked && currentVersion === 1;
    expect((await fetch(`${base}/client?version=1`).then(r => r.json())).editable).toBe(allowed);
    expect((await save(base, { revision: 1, configuration: { ...configuration, topText: 'Nuova revisione cliente' } }, 'client')).status).toBe(allowed ? 200 : 409);
    if (allowed) {
      expect(h.docs.get('photobooks/book/mockupHistory/v1-r1')).toEqual(previous);
      expect(h.docs.get('photobooks/book/mockups/v1')).toMatchObject({ revision: 2, status: 'draft', updatedBy: 'client' });
    } else expect(h.docs.get('photobooks/book/mockups/v1')).toEqual(previous);
  });
  it('rifiuta il salvataggio se cambia la galleria durante la richiesta', async () => {
    h.beforeTransaction = () => { h.docs.get('photobooks/book').galleryId = 'another-gallery'; };
    expect((await save(base, { revision: 0, configuration })).status).toBe(409);
  });
  it('conserva lo storico e non riusa la foto in una versione nuova', async () => {
    await save(base, { revision: 0, configuration });
    h.docs.get('photobooks/book').currentVersion = 2;
    expect((await save(base, { revision: 1, configuration })).status).toBe(409);
    expect((await save(base, { revision: 0, configuration }, 'admin', 2)).status).toBe(400);
    expect((await fetch(`${base}/admin?version=1`).then(r => r.json())).saved.revision).toBe(1);
  });
  it('rifiuta token invalido, asset estranei e configurazioni inventate', async () => {
    expect((await fetch(`${base}/invalid`)).status).toBe(404);
    expect((await save(base, { revision: 0, configuration: { ...configuration, photoAssetId: '22222222-2222-4222-8222-222222222222' } })).status).toBe(400);
    expect((await save(base, { revision: 0, configuration: { ...configuration, materialId: 'inventato' } })).status).toBe(400);
    expect((await save(base, { revision: 0, configuration: { ...configuration, crop: { zoom: 10, x: 0, y: 0 } } })).status).toBe(400);
    expect((await fetch(`${base}/admin/photos/22222222-2222-4222-8222-222222222222`)).status).toBe(404);
  });
  it('valida immagini reali e conserva una copia privata ridotta', async () => {
    const image = await sharp({ create: { width: 2200, height: 1100, channels: 3, background: '#7d9182' } }).png().toBuffer();
    const response = await fetch(`${base}/admin/upload?name=cover.png`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: image });
    expect(response.status).toBe(200);
    const photo = await response.json();
    expect(photo).toMatchObject({ source: 'upload', width: 2048, height: 1024, name: 'cover.png' });
    const download = await fetch(`${base}/admin/photos/${photo.id}`);
    expect(download.status).toBe(200);
    expect(download.headers.get('cache-control')).toBe('private, no-store');
    expect((await sharp(Buffer.from(await download.arrayBuffer())).metadata()).format).toBe('jpeg');
    expect((await fetch(`${base}/admin/upload?name=bad.png`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: 'not an image' })).status).toBe(400);
  });
  it('usa solo foto della galleria associata, senza fidarsi degli URL del browser', async () => {
    const image = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#708090' } }).jpeg().toBuffer();
    h.photos = [{ id: 'ours', name: 'Foto galleria', url: 'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/galleries%2Fphoto.jpg?alt=media' }];
    h.files.set('galleries/photo.jpg', image);
    const choose = (id: string) => fetch(`${base}/admin/gallery-photo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId: id }) });
    expect((await choose('other-gallery-photo')).status).toBe(404);
    expect(await choose('ours').then(r => r.json())).toMatchObject({ source: 'gallery', photoId: 'ours' });
    expect(() => mockupGalleryStoragePath('https://evil.test/photo.jpg', 'test-bucket')).toThrow();
    expect(() => mockupGalleryStoragePath('https://firebasestorage.googleapis.com/v0/b/other/o/photo.jpg', 'test-bucket')).toThrow();
  });

  const entryId = '33333333-3333-4333-8333-333333333333';
  const selection = { labId: 'lab', modelId: entryId };
  async function publish(base: string, selections = [selection]) {
    h.docs.get('photobooks/book').jobId = 'job';
    h.docs.set('labs/lab', { nome: 'Laboratorio scelto', attivo: true, mockupCatalog: { revision: 1, materials: [{ id: material.id, label: 'Tessuto scelto', supplierCode: 'LAB-01' }], models: [{ id: entryId, name: 'Custodia personalizzata', supplierCode: 'C-01', rendererId: MOCKUP_MODEL.id, active: true, materialIds: [material.id] }] } });
    return fetch(`${base}/admin/offer`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 0, savedRevision: 0, selections }) });
  }
  const action = (base: string, scope: string, path: string, revision: number) => fetch(`${base}/${scope}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, note: 'Controlla il ritaglio' }) });

  it('pubblica solo opzioni autorizzate e congela nomi e campionario del laboratorio', async () => {
    expect((await publish(base)).status).toBe(200);
    h.docs.get('labs/lab').nome = 'Nome cambiato nel catalogo';
    const payload = await fetch(`${base}/client`).then(r => r.json());
    expect(payload.enabled).toBe(true);
    expect(payload.offer.options[0]).toMatchObject({ labName: 'Laboratorio scelto', name: 'Custodia personalizzata' });
    expect((await save(base, { revision: 0, configuration, selection, offerRevision: 1 }, 'client')).status).toBe(200);
    expect((await save(base, { revision: 1, configuration, selection: { ...selection, labId: 'other' }, offerRevision: 1 }, 'client')).status).toBe(409);
    const other = MOCKUP_MODEL.variants[1];
    expect((await save(base, { revision: 1, configuration: { ...configuration, materialId: other.id }, selection, offerRevision: 1 }, 'client')).status).toBe(409);
    expect((await save(base, { revision: 1, configuration, selection, offerRevision: 0 }, 'client')).status).toBe(409);
  });
  it('non permette al cliente di pubblicare, confermare, allegare o vedere lo storico', async () => {
    await publish(base);
    for (const path of ['offer', 'confirm', 'attach', 'request-changes', 'history']) {
      const response = await fetch(`${base}/client/${path}`, { method: path === 'history' ? 'GET' : path === 'offer' ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: path === 'history' ? undefined : '{}' });
      expect(response.status, path).toBe(403);
    }
  });
  it('consente nuove revisioni cliente anche dopo invio allo studio', async () => {
    await publish(base);
    await save(base, { revision: 0, configuration, selection, offerRevision: 1 }, 'client');
    expect((await action(base, 'client', 'submit', 1)).status).toBe(200);
    expect((await fetch(`${base}/client`).then(r => r.json())).editable).toBe(true);
    expect((await save(base, { revision: 2, configuration, selection, offerRevision: 1 }, 'client')).status).toBe(200);
    expect((await fetch(`${base}/client`).then(r => r.json())).saved.status).toBe('draft');
    expect((await action(base, 'admin', 'request-changes', 3)).status).toBe(200);
    expect((await fetch(`${base}/client`).then(r => r.json())).editable).toBe(true);
    expect(h.docs.get('photobooks/book/mockupHistory/v1-r2').status).toBe('submitted');
    expect(h.docs.get('photobooks/book').approval).toBeUndefined();
  });
  it('conferma una copia immutabile, preservata quando lo studio modifica la proposta', async () => {
    await publish(base);
    await save(base, { revision: 0, configuration, selection, offerRevision: 1 });
    const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#708090' } }).jpeg().toBuffer();
    const body = { revision: 1, configuration, previews: Array.from({ length: 8 }, () => ({ label: '<script>vista</script>', image: `data:image/jpeg;base64,${image.toString('base64')}` })) };
    const confirm = await fetch(`${base}/admin/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: JSON.stringify(body) });
    expect(confirm.status).toBe(200);
    const confirmed = await confirm.json();
    expect(confirmed).toMatchObject({ revision: 2, status: 'confirmed', updatedBy: 'studio' });
    const report = h.files.get(confirmed.reportPath)!.toString('utf8');
    expect(report).toContain('Custodia personalizzata');
    expect(report).toContain('LAB-01');
    expect(report).not.toContain('<script>');
    expect(report.match(/<figure>/g)).toHaveLength(8);
    expect((await save(base, { revision: 2, configuration: { ...configuration, topText: 'Nuova revisione' }, selection, offerRevision: 1 }, 'client')).status).toBe(200);
    expect(h.docs.get('photobooks/book/mockupHistory/v1-r2')).toEqual(confirmed);
    expect(h.files.get(confirmed.reportPath)!.toString('utf8')).toBe(report);
    expect(h.docs.get('photobooks/book/mockups/v1').reportPath).toBeUndefined();
    expect(h.docs.get('photobooks/book/mockups/v1').status).toBe('draft');
  });
  it('rifiuta la conferma se cambia la proposta durante la generazione', async () => {
    await publish(base);
    await save(base, { revision: 0, configuration, selection, offerRevision: 1 });
    const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#708090' } }).jpeg().toBuffer();
    h.beforeTransaction = () => { h.docs.get('photobooks/book/mockups/v1').revision = 2; };
    const result = await fetch(`${base}/admin/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: JSON.stringify({ revision: 1, configuration, previews: Array.from({ length: 8 }, () => ({ label: 'vista', image: `data:image/jpeg;base64,${image.toString('base64')}` })) }) });
    expect(result.status).toBe(409);
    expect([...h.files.keys()].some(k => k.includes('confirmed-'))).toBe(false);
  });
  it('conserva il report se la conferma viene registrata ma si perde la risposta', async () => {
    await publish(base);
    await save(base, { revision: 0, configuration, selection, offerRevision: 1 });
    const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#708090' } }).jpeg().toBuffer();
    h.failAfterCommit = true;
    const result = await fetch(`${base}/admin/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: JSON.stringify({ revision: 1, configuration, previews: Array.from({ length: 8 }, () => ({ label: 'vista', image: `data:image/jpeg;base64,${image.toString('base64')}` })) }) });
    expect(result.status).toBe(500);
    const confirmed = h.docs.get('photobooks/book/mockups/v1');
    expect(confirmed.status).toBe('confirmed');
    expect(h.files.has(confirmed.reportPath)).toBe(true);
  });
  it('conserva la foto registrata dopo un errore post-commit dell’upload', async () => {
    h.failAfterCommit = true;
    const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#708090' } }).jpeg().toBuffer();
    const result = await fetch(`${base}/admin/upload?name=foto.jpg`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: image });
    expect(result.status).toBe(500);
    const asset = [...h.docs.values()].find(d => d.name === 'foto.jpg');
    expect(h.files.has(asset.storagePath)).toBe(true);
  });
});
