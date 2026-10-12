import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { FakeFirestore, FakeStorage } from '../print-shop/test-fakes';
import { ShopOrderService } from './orders';
import { ShopService } from './service';
import { ShopUploadService } from './uploads';

const NOW = new Date('2026-12-01T10:00:00Z');
const alice = { uid: 'alice', email: 'alice@example.com' };
const bob = { uid: 'bob', email: 'bob@example.com' };

async function jpeg(width: number, height: number, orientation?: number): Promise<Buffer> {
  const image = sharp({ create: { width, height, channels: 3, background: '#8899aa' } });
  return (orientation ? image.withMetadata({ orientation }) : image).jpeg().toBuffer();
}

async function setup(options: { maxBytes?: number } = {}) {
  const db = new FakeFirestore();
  const storage = new FakeStorage();
  db.seed('productCategories/c1', { value: 'natale', nome: 'Natale', attivo: true, displayOrder: 1 });
  db.seed('products/mug', { nome: 'Tazza', descrizione: '', prezzo: 15, sconto: 0, numeroFoto: 1, categoria: 'natale', attivo: true, immagini: [] });
  db.seed('products/album', { nome: 'Album 3', descrizione: '', prezzo: 60, sconto: 0, numeroFoto: 3, categoria: 'natale', attivo: true, immagini: [] });
  db.seed('products/card', { nome: 'Cartolina', descrizione: '', prezzo: 3, sconto: 0, numeroFoto: 0, categoria: 'natale', attivo: true, immagini: [] });
  let clock = NOW;
  const shop = new ShopService({ db: db as any, now: () => clock });
  await shop.updateSettings({ enabled: true, ordersOpen: true, categoryValues: ['natale'] });
  const uploads: { current?: ShopUploadService } = {};
  const orders = new ShopOrderService({
    db: db as any,
    shop,
    now: () => clock,
    removeAssetsForLines: (orderId, lineIds) => uploads.current!.removeForLines(orderId, lineIds),
  });
  const onPhotosComplete = vi.fn(async () => undefined);
  uploads.current = new ShopUploadService({ db: db as any, storage, orders, now: () => clock, onPhotosComplete, maxBytes: options.maxBytes });
  return { db, storage, orders, uploads: uploads.current, onPhotosComplete, setClock: (date: Date) => { clock = date; } };
}

const candidate = (patch: Record<string, unknown> = {}) => ({ fileName: 'foto.jpg', contentType: 'image/jpeg', sizeBytes: 5000, ...patch });

async function draftWith(env: Awaited<ReturnType<typeof setup>>, productId = 'mug') {
  const draft = await env.orders.createDraft(alice, { lines: [{ productId, quantity: 1 }] });
  return { draft, line: draft.lines[0] };
}

async function uploadReady(env: Awaited<ReturnType<typeof setup>>, orderId: string, lineId: string, buffer?: Buffer, identity = alice) {
  const data = buffer ?? (await jpeg(3000, 2000));
  const prepared = await env.uploads.prepare(identity, orderId, lineId, candidate({ sizeBytes: data.length }));
  env.storage.put(prepared.storagePath, data);
  return { prepared, asset: await env.uploads.finalize(identity, orderId, prepared.assetId) };
}

describe('preparazione del caricamento', () => {
  it('crea il documento della foto e un indirizzo di caricamento firmato', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    const prepared = await env.uploads.prepare(alice, draft.id, line.lineId, candidate(), 'https://sito.test');
    expect(prepared.storagePath).toBe(`shop-orders/alice/${draft.id}/${line.lineId}/${prepared.assetId}.jpg`);
    expect(prepared.uploadUrl).toContain('upload_id');
    expect(prepared.requiredMetadata).toEqual({ ownerUid: 'alice', orderId: draft.id, assetId: prepared.assetId });
    expect(env.storage.resumableUploads[0].options).toMatchObject({ origin: 'https://sito.test', preconditionOpts: { ifGenerationMatch: 0 } });
    const stored = env.db.value(`orders/${draft.id}/shopAssets/${prepared.assetId}`);
    expect(stored).toMatchObject({ ownerUid: 'alice', lineId: line.lineId, status: 'prepared', declaredSizeBytes: 5000 });
    // Le foto dello shop non usano la sottocartella "assets" delle stampe.
    expect(env.db.countCollection(`orders/${draft.id}/assets`)).toBe(0);
  });

  it('rifiuta file che non sono JPEG o sono troppo grandi', async () => {
    const env = await setup({ maxBytes: 10_000 });
    const { draft, line } = await draftWith(env);
    for (const bad of [
      candidate({ fileName: 'foto.png' }),
      candidate({ contentType: 'image/png' }),
      candidate({ sizeBytes: 0 }),
      candidate({ sizeBytes: 20_000 }),
    ]) {
      await expect(env.uploads.prepare(alice, draft.id, line.lineId, bad)).rejects.toMatchObject({ status: 400, code: 'invalid_jpeg' });
    }
  });

  it('accetta solo le foto richieste dal prodotto', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env, 'mug');
    await env.uploads.prepare(alice, draft.id, line.lineId, candidate());
    await expect(env.uploads.prepare(alice, draft.id, line.lineId, candidate())).rejects.toMatchObject({ status: 409, code: 'line_photos_complete' });
    const album = await draftWith(env, 'album');
    for (let index = 0; index < 3; index++) await env.uploads.prepare(alice, album.draft.id, album.line.lineId, candidate());
    await expect(env.uploads.prepare(alice, album.draft.id, album.line.lineId, candidate())).rejects.toMatchObject({ code: 'line_photos_complete' });
  });

  it('rifiuta righe inesistenti, prodotti senza foto e ordini altrui', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    await expect(env.uploads.prepare(alice, draft.id, 'l_00000000', candidate())).rejects.toMatchObject({ status: 404, code: 'line_not_found' });
    const card = await draftWith(env, 'card');
    await expect(env.uploads.prepare(alice, card.draft.id, card.line.lineId, candidate())).rejects.toMatchObject({ status: 409, code: 'photos_not_required' });
    await expect(env.uploads.prepare(bob, draft.id, line.lineId, candidate())).rejects.toMatchObject({ status: 404, code: 'order_not_found' });
  });

  it('una foto preparata e scaduta libera il posto', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    await env.uploads.prepare(alice, draft.id, line.lineId, candidate());
    env.setClock(new Date('2026-12-02T11:00:00Z'));
    await expect(env.uploads.prepare(alice, draft.id, line.lineId, candidate())).resolves.toBeDefined();
  });

  it('ogni foto sposta avanti la scadenza della bozza', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    env.setClock(new Date('2026-12-05T10:00:00Z'));
    await env.uploads.prepare(alice, draft.id, line.lineId, candidate());
    const deleteAfter = env.db.value(`orders/${draft.id}`).retention.deleteAfter as Date;
    expect(deleteAfter.toISOString()).toBe('2026-12-12T10:00:00.000Z');
  });
});

describe('conclusione del caricamento', () => {
  it('controlla il JPEG e registra dimensioni e bassa risoluzione', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    const { asset } = await uploadReady(env, draft.id, line.lineId, await jpeg(3000, 2000));
    expect(asset).toMatchObject({ status: 'ready', widthPx: 3000, heightPx: 2000, lowResolution: false });
    const small = await draftWith(env);
    const { asset: smallAsset } = await uploadReady(env, small.draft.id, small.line.lineId, await jpeg(800, 600));
    expect(smallAsset).toMatchObject({ widthPx: 800, heightPx: 600, lowResolution: true });
  });

  it('tiene conto della rotazione salvata nella foto', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    const { asset } = await uploadReady(env, draft.id, line.lineId, await jpeg(3000, 2000, 6));
    expect(asset).toMatchObject({ widthPx: 2000, heightPx: 3000 });
  });

  it('rifiuta e toglie un file che non è un vero JPEG', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    const prepared = await env.uploads.prepare(alice, draft.id, line.lineId, candidate({ sizeBytes: 400 }));
    env.storage.put(prepared.storagePath, Buffer.alloc(400, 1));
    await expect(env.uploads.finalize(alice, draft.id, prepared.assetId)).rejects.toMatchObject({ status: 400, code: 'invalid_jpeg' });
    expect(env.storage.files.has(prepared.storagePath)).toBe(false);
  });

  it('rifiuta un file mancante e uno più grande di quanto dichiarato', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    const missing = await env.uploads.prepare(alice, draft.id, line.lineId, candidate());
    await expect(env.uploads.finalize(alice, draft.id, missing.assetId)).rejects.toMatchObject({ status: 409, code: 'file_missing' });
    const second = await draftWith(env);
    const data = await jpeg(1600, 1200);
    const oversize = await env.uploads.prepare(alice, second.draft.id, second.line.lineId, candidate({ sizeBytes: data.length - 10 }));
    env.storage.put(oversize.storagePath, data);
    await expect(env.uploads.finalize(alice, second.draft.id, oversize.assetId)).rejects.toMatchObject({ status: 400, code: 'invalid_jpeg' });
  });

  it('rifiuta un caricamento scaduto e le foto altrui; ripetere la conclusione è innocuo', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    const { prepared, asset } = await uploadReady(env, draft.id, line.lineId);
    await expect(env.uploads.finalize(alice, draft.id, prepared.assetId)).resolves.toEqual(asset);
    await expect(env.uploads.finalize(bob, draft.id, prepared.assetId)).rejects.toMatchObject({ status: 404 });
    const second = await draftWith(env);
    const stale = await env.uploads.prepare(alice, second.draft.id, second.line.lineId, candidate());
    env.setClock(new Date('2026-12-02T11:00:00Z'));
    await expect(env.uploads.finalize(alice, second.draft.id, stale.assetId)).rejects.toMatchObject({ status: 409, code: 'upload_expired' });
  });

  it('con un ordine pagato, la foto che manca lo porta a "foto ricevute" e avvisa lo studio', async () => {
    const env = await setup();
    const draft = await env.orders.createDraft(alice, { lines: [{ productId: 'album', quantity: 1 }] });
    const lineId = draft.lines[0].lineId;
    const stored = env.db.value(`orders/${draft.id}`);
    env.db.seed(`orders/${draft.id}`, {
      ...stored,
      payment: { method: 'paypal', status: 'paid', paidAt: NOW },
      fulfillment: { ...stored.fulfillment, status: 'awaiting_photos' },
      stato: 'in_lavorazione',
    });
    await uploadReady(env, draft.id, lineId);
    await uploadReady(env, draft.id, lineId);
    expect(env.db.value(`orders/${draft.id}`).fulfillment.status).toBe('awaiting_photos');
    expect(env.onPhotosComplete).not.toHaveBeenCalled();
    await uploadReady(env, draft.id, lineId);
    expect(env.db.value(`orders/${draft.id}`)).toMatchObject({ fulfillment: { status: 'photos_received' }, shop: { photoOverdue: false } });
    expect(env.onPhotosComplete).toHaveBeenCalledTimes(1);
    expect(env.onPhotosComplete).toHaveBeenCalledWith(draft.id);
  });

  it('per una bozza non cambia lo stato, ma sposta avanti la scadenza', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    await uploadReady(env, draft.id, line.lineId);
    expect(env.db.value(`orders/${draft.id}`).fulfillment.status).toBe('draft');
    expect(env.onPhotosComplete).not.toHaveBeenCalled();
  });
});

describe('rimozione, anteprime e originali', () => {
  it('toglie file e documento, e libera il posto per un\'altra foto', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    const { prepared } = await uploadReady(env, draft.id, line.lineId);
    await expect(env.uploads.remove(bob, draft.id, prepared.assetId)).rejects.toMatchObject({ status: 404 });
    await env.uploads.remove(alice, draft.id, prepared.assetId);
    expect(env.storage.files.has(prepared.storagePath)).toBe(false);
    expect(env.db.value(`orders/${draft.id}/shopAssets/${prepared.assetId}`)).toBeUndefined();
    await expect(env.uploads.prepare(alice, draft.id, line.lineId, candidate())).resolves.toBeDefined();
  });

  it('dopo che l\'ordine è in lavorazione le foto non si toccano più', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    const { prepared } = await uploadReady(env, draft.id, line.lineId);
    const stored = env.db.value(`orders/${draft.id}`);
    env.db.seed(`orders/${draft.id}`, { ...stored, payment: { method: 'paypal', status: 'paid' }, fulfillment: { ...stored.fulfillment, status: 'in_production' } });
    await expect(env.uploads.remove(alice, draft.id, prepared.assetId)).rejects.toMatchObject({ status: 409, code: 'order_locked' });
    await expect(env.uploads.prepare(alice, draft.id, line.lineId, candidate())).rejects.toMatchObject({ status: 409, code: 'order_locked' });
  });

  it('l\'anteprima è un JPEG ridotto, solo per il proprietario o per lo studio', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    const { prepared } = await uploadReady(env, draft.id, line.lineId, await jpeg(3000, 2000));
    const preview = await env.uploads.ownerPreview(alice, draft.id, prepared.assetId);
    expect(preview.contentType).toBe('image/jpeg');
    const info = await sharp(preview.body).metadata();
    expect(Math.max(info.width ?? 0, info.height ?? 0)).toBe(900);
    await expect(env.uploads.ownerPreview(bob, draft.id, prepared.assetId)).rejects.toMatchObject({ status: 404 });
    await expect(env.uploads.adminPreview(draft.id, prepared.assetId)).resolves.toBeDefined();
    await expect(env.uploads.adminPreview(draft.id, 'nope')).rejects.toMatchObject({ status: 404 });
  });

  it('lo studio scarica l\'originale con il nome del file del cliente', async () => {
    const env = await setup();
    const { draft, line } = await draftWith(env);
    const data = await jpeg(2400, 1600);
    const prepared = await env.uploads.prepare(alice, draft.id, line.lineId, candidate({ fileName: 'IMG_0042.JPG', sizeBytes: data.length }));
    env.storage.put(prepared.storagePath, data);
    await env.uploads.finalize(alice, draft.id, prepared.assetId);
    const original = await env.uploads.adminOriginal(draft.id, prepared.assetId);
    expect(original.fileName).toBe('IMG_0042.JPG');
    expect(original.body.equals(data)).toBe(true);
  });

  it('togliere una riga dal carrello elimina le sue foto', async () => {
    const env = await setup();
    const draft = await env.orders.createDraft(alice, { lines: [{ productId: 'mug', quantity: 1 }, { productId: 'mug', quantity: 1 }] });
    const [first, second] = draft.lines;
    const a = await uploadReady(env, draft.id, first.lineId);
    const b = await uploadReady(env, draft.id, second.lineId);
    await env.orders.replaceLines(alice, draft.id, [{ lineId: first.lineId, productId: 'mug', quantity: 1 }]);
    expect(env.storage.files.has(a.prepared.storagePath)).toBe(true);
    expect(env.storage.files.has(b.prepared.storagePath)).toBe(false);
    expect(env.db.value(`orders/${draft.id}/shopAssets/${b.prepared.assetId}`)).toBeUndefined();
    expect(env.db.value(`orders/${draft.id}/shopAssets/${a.prepared.assetId}`)).toBeDefined();
  });
});
