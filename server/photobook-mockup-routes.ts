import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { db, storage } from './firebase-admin.js';
import { loadGalleryPhotoDocs } from './photobook-gallery.js';
import { uidRateLimiter } from './print-shop/rate-limit.js';
import { mockupConfigurationSchema, mockupEditable, type MockupPhoto, type SavedMockup } from '../shared/mockup-types.js';
import { labMockupCatalogSchema, mockupOfferInputSchema, mockupSelectionSchema, mockupWorkflowInputSchema, optionFor, type MockupOffer, type MockupOption } from '../shared/mockup-workflow.js';
import { buildMockupReport, mockupConfirmSchema } from './mockup-report.js';

class MockupError extends Error { constructor(public status: number, message: string) { super(message); } }
const versionSchema = z.coerce.number().int().min(1).max(9999);
const saveSchema = z.object({ revision: z.number().int().min(0), configuration: mockupConfigurationSchema, selection: mockupSelectionSchema.optional(), offerRevision: z.number().int().min(0).optional() }).strict();
type Resolver = (req: Request) => Promise<DocumentSnapshot | null>;

/** Nessun URL fornito dal browser viene scaricato: accettiamo solo il bucket già configurato. */
export function mockupGalleryStoragePath(value: string, bucket: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error();
    if (url.hostname === 'firebasestorage.googleapis.com') {
      const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (match && decodeURIComponent(match[1]) === bucket) return decodeURIComponent(match[2]);
    }
    if (url.hostname === 'storage.googleapis.com') {
      const prefix = `/${bucket}/`;
      if (url.pathname.startsWith(prefix)) return decodeURIComponent(url.pathname.slice(prefix.length));
    }
  } catch { /* URL non appartenente al bucket */ }
  throw new MockupError(400, 'Questa foto non è disponibile nel deposito immagini dello studio. Carica una copia dal dispositivo.');
}

/** Montato dopo il controllo admin oppure sotto il token del singolo fotolibro. */
export function createPhotobookMockupRouter(resolveBook: Resolver, isAdmin: boolean) {
  const router = express.Router({ mergeParams: true });
  const canEditBook = (data: FirebaseFirestore.DocumentData, version: number) => mockupEditable(data as Parameters<typeof mockupEditable>[0], version);
  const writeLimit = uidRateLimiter(60, 10 * 60_000);
  router.use((req, res, next) => req.method === 'GET' ? next() : writeLimit(req, res, next));
  router.use(async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      const book = await resolveBook(req);
      if (!book?.exists) throw new MockupError(404, 'Fotolibro non trovato');
      const data = book.data()!;
      const version = versionSchema.parse(req.query.version ?? data.currentVersion);
      if (!(data.versions || []).some((v: { version: number }) => v.version === version)) throw new MockupError(404, 'Versione non trovata');
      if (!isAdmin && data.versions.some((v: { version: number; status?: string }) => v.version === version && v.status === 'draft')) throw new MockupError(404, 'Versione non pubblicata');
      res.locals.book = book;
      res.locals.version = version;
      if (req.method !== 'GET') {
        const deliveryOnly = isAdmin && version === data.currentVersion && ['/attach', '/reconcile-attachment'].includes(req.path);
        if (!canEditBook(data, version) && !deliveryOnly) throw new MockupError(409, 'Versione in sola lettura. Contatta lo studio.');
        if (!isAdmin) {
          const saved = await book.ref.collection('mockups').doc(`v${version}`).get();
          const offer = await book.ref.collection('mockupOffers').doc(`v${version}`).get();
          if (!saved.exists && !offer.exists) throw new MockupError(403, 'Lo studio non ha ancora attivato il mockup per questa versione.');
        }
      }
      next();
    } catch (error) { next(error); }
  });

  router.get('/', async (_req, res, next) => {
    try {
      const book = res.locals.book as DocumentSnapshot;
      const version = res.locals.version as number;
      const saved = await book.ref.collection('mockups').doc(`v${version}`).get();
      const offer = await book.ref.collection('mockupOffers').doc(`v${version}`).get();
      const data = saved.data();
      if (data && !isAdmin) delete data.reportPath;
      res.json({ version, editable: canEditBook(book.data()!, version), enabled: isAdmin || saved.exists || offer.exists, saved: data || null, offer: offer.data() || null });
    } catch (error) { next(error); }
  });

  async function guardCurrent(tx: FirebaseFirestore.Transaction, book: DocumentSnapshot, version: number) {
    const fresh = await tx.get(book.ref);
    if (!fresh.exists || !canEditBook(fresh.data()!, version) || fresh.data()!.galleryId !== book.data()!.galleryId || fresh.data()!.jobId !== book.data()!.jobId) {
      throw new MockupError(409, 'Il fotolibro è cambiato: ricarica prima di proseguire.');
    }
    return fresh;
  }

  router.put('/offer', async (req, res, next) => {
    try {
      if (!isAdmin) throw new MockupError(403, 'Solo lo studio può configurare la proposta');
      const input = mockupOfferInputSchema.parse(req.body);
      const book = res.locals.book as DocumentSnapshot;
      const version = res.locals.version as number;
      if (!book.data()!.jobId) throw new MockupError(400, 'Associa prima il fotolibro a un lavoro');
      const result = await db.runTransaction(async tx => {
        await guardCurrent(tx, book, version);
        const ref = book.ref.collection('mockupOffers').doc(`v${version}`);
        const savedRef = book.ref.collection('mockups').doc(`v${version}`);
        const old = await tx.get(ref);
        const saved = await tx.get(savedRef);
        if ((old.data()?.revision || 0) !== input.revision || (saved.data()?.revision || 0) !== input.savedRevision) throw new MockupError(409, 'Proposta modificata: ricarica prima di proseguire');
        const options: MockupOption[] = [];
        for (const selection of input.selections) {
          const lab = await tx.get(db.collection('labs').doc(selection.labId));
          if (!lab.exists || lab.data()!.attivo === false) throw new MockupError(400, 'Laboratorio non disponibile');
          const catalog = labMockupCatalogSchema.parse(lab.data()!.mockupCatalog);
          const model = catalog.models.find(m => m.id === selection.modelId && m.active && m.rendererId);
          if (!model) throw new MockupError(400, 'Modello non disponibile o asset 3D non ancora integrato');
          options.push({ ...model, materials: catalog.materials.filter(m => model.materialIds.includes(m.id)), labId: lab.id, labName: String(lab.data()!.nome) });
        }
        const offer: MockupOffer = { revision: input.revision + 1, options, updatedAt: new Date().toISOString() };
        tx.set(ref, offer);
        if (saved.exists) {
          const previous = saved.data() as SavedMockup;
          tx.set(book.ref.collection('mockupHistory').doc(`v${version}-r${previous.revision}`), previous);
          const { confirmedAt, reportPath, ...draft } = previous;
          tx.set(savedRef, { ...draft, revision: previous.revision + 1, status: 'draft', updatedBy: 'studio', updatedAt: offer.updatedAt });
        }
        return offer;
      });
      res.json(result);
    } catch (error) { next(error); }
  });

  router.put('/', async (req, res, next) => {
    try {
      const input = saveSchema.parse(req.body);
      const book = res.locals.book as DocumentSnapshot;
      const version = res.locals.version as number;
      const ref = book.ref.collection('mockups').doc(`v${version}`);
      const saved = await db.runTransaction(async tx => {
        await guardCurrent(tx, book, version);
        const previous = await tx.get(ref);
        const offerDoc = await tx.get(book.ref.collection('mockupOffers').doc(`v${version}`));
        const offer = (offerDoc.data() || null) as MockupOffer | null;
        const photoIds = [input.configuration.photoAssetId, ...('backPhotoAssetId' in input.configuration ? [input.configuration.backPhotoAssetId] : [])];
        for (const id of new Set(photoIds.filter((id): id is string => !!id))) {
          const photo = await tx.get(book.ref.collection('mockupAssets').doc(id));
          if (!photo.exists || photo.data()!.version !== version) throw new MockupError(400, 'Foto non appartenente a questa versione del fotolibro');
        }
        if ((previous.data()?.revision || 0) !== input.revision) throw new MockupError(409, 'Il mockup è stato modificato in un’altra sessione. Riaprilo per caricare la versione aggiornata.');
        if (!isAdmin && !previous.exists && !offer) throw new MockupError(403, 'Mockup non attivato');
        const option = optionFor(offer, input.selection);
        if (offer && (offer.revision !== input.offerRevision || !option || option.rendererId !== input.configuration.modelId || !option.materials.some(m => m.id === input.configuration.materialId))) throw new MockupError(409, 'Seleziona un modello e un rivestimento inclusi nella proposta aggiornata');
        if (!offer && input.selection) throw new MockupError(400, 'Pubblica prima una proposta');
        // Una correzione dello studio non restituisce implicitamente al cliente
        // una proposta in verifica/confermata: serve Richiedi modifiche.
        const status = isAdmin && ['submitted', 'confirmed'].includes(previous.data()?.status) ? 'submitted' : 'draft';
        const result: SavedMockup = { version, revision: input.revision + 1, configuration: input.configuration, updatedAt: new Date().toISOString(), status, updatedBy: isAdmin ? 'studio' : 'client', ...(option ? { selection: input.selection!, option } : {}) };
        if (previous.exists) tx.set(book.ref.collection('mockupHistory').doc(`v${version}-r${previous.data()!.revision}`), previous.data()!);
        tx.set(ref, result);
        return result;
      });
      res.json(saved);
    } catch (error) { next(error); }
  });

  for (const action of ['submit', 'request-changes'] as const) router.post(`/${action}`, async (req, res, next) => {
    try {
      if (action === 'request-changes' && !isAdmin) throw new MockupError(403, 'Solo lo studio può richiedere modifiche');
      const input = mockupWorkflowInputSchema.parse(req.body);
      const book = res.locals.book as DocumentSnapshot;
      const version = res.locals.version as number;
      const result = await db.runTransaction(async tx => {
        await guardCurrent(tx, book, version);
        const ref = book.ref.collection('mockups').doc(`v${version}`);
        const doc = await tx.get(ref);
        const previous = doc.data() as SavedMockup | undefined;
        const offerDoc = await tx.get(book.ref.collection('mockupOffers').doc(`v${version}`));
        const option = optionFor((offerDoc.data() || null) as MockupOffer | null, previous?.selection);
        if (!previous || previous.revision !== input.revision) throw new MockupError(409, 'Ricarica la proposta aggiornata');
        if (action === 'submit' && (!option || !option.materials.some(m => m.id === previous.configuration.materialId))) throw new MockupError(409, 'Salva prima una scelta inclusa nella proposta dello studio');
        if (action === 'submit' && ['submitted', 'confirmed'].includes(previous.status || '')) throw new MockupError(409, 'Proposta già inviata. Salva una modifica prima di inviarla di nuovo.');
        const { confirmedAt, reportPath, ...draft } = previous;
        const result: SavedMockup = { ...draft, revision: previous.revision + 1, status: action === 'submit' ? 'submitted' : 'changes_requested', updatedBy: isAdmin ? 'studio' : 'client', updatedAt: new Date().toISOString(), note: input.note };
        tx.set(book.ref.collection('mockupHistory').doc(`v${version}-r${previous.revision}`), previous);
        tx.set(ref, result);
        return result;
      });
      res.json(result);
    } catch (error) { next(error); }
  });

  router.post('/confirm', express.raw({ type: 'application/octet-stream', limit: '16mb' }), async (req, res, next) => {
    try {
      if (!isAdmin) throw new MockupError(403, 'Solo lo studio può confermare');
      const input = mockupConfirmSchema.parse(Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body);
      const book = res.locals.book as DocumentSnapshot;
      const version = res.locals.version as number;
      const ref = book.ref.collection('mockups').doc(`v${version}`);
      const initial = (await ref.get()).data() as SavedMockup | undefined;
      if (!initial || initial.revision !== input.revision || initial.status === 'confirmed') throw new MockupError(409, 'Ricarica la proposta prima di confermare');
      if (JSON.stringify(input.configuration) !== JSON.stringify(initial.configuration)) throw new MockupError(409, 'Le viste non corrispondono alla configurazione salvata');
      const offerDoc = await book.ref.collection('mockupOffers').doc(`v${version}`).get();
      const offer = offerDoc.data() as MockupOffer | undefined;
      const option = optionFor(offer || null, initial.selection);
      if (!option || !option.materials.some(m => m.id === initial.configuration.materialId)) throw new MockupError(409, 'Salva prima un modello e un rivestimento inclusi nella proposta');
      const now = new Date().toISOString();
      const reportPath = `photobook-mockups/${book.id}/v${version}/confirmed-${randomUUID()}.html`;
      const confirmed: SavedMockup = { ...initial, option, revision: initial.revision + 1, status: 'confirmed', confirmedAt: now, updatedAt: now, updatedBy: 'studio', reportPath };
      let report: Buffer;
      try { report = await buildMockupReport(confirmed, input.previews); }
      catch { throw new MockupError(400, 'Viste non leggibili: riapri il mockup e riprova la conferma'); }
      const file = storage.bucket().file(reportPath);
      await file.save(report, { metadata: { contentType: 'text/html', cacheControl: 'private, no-store' } });
      try {
        await db.runTransaction(async tx => {
          await guardCurrent(tx, book, version);
          const fresh = await tx.get(ref);
          const freshOffer = await tx.get(offerDoc.ref);
          if (fresh.data()?.revision !== input.revision || freshOffer.data()?.revision !== offer?.revision) throw new MockupError(409, 'Proposta cambiata durante la conferma: ricarica e riprova');
          tx.set(book.ref.collection('mockupHistory').doc(`v${version}-r${initial.revision}`), initial);
          tx.set(ref, confirmed);
        });
      } catch (error) {
        // Un errore di rete può arrivare dopo il commit: in quel caso la copia
        // va conservata. Cancelliamo solo dopo un rifiuto applicativo certo.
        if (error instanceof MockupError) await file.delete().catch(() => undefined);
        throw error;
      }
      res.json(confirmed);
    } catch (error) { next(error); }
  });

  router.get('/history', async (_req, res, next) => {
    try {
      if (!isAdmin) throw new MockupError(403, 'Storico riservato allo studio');
      const book = res.locals.book as DocumentSnapshot;
      const docs = await book.ref.collection('mockupHistory').where('version', '==', res.locals.version).get();
      res.json(docs.docs.map(d => { const { reportPath, ...data } = d.data(); return data; }).sort((a,b) => b.revision - a.revision));
    } catch (error) { next(error); }
  });
  router.get('/report/:revision', async (req, res, next) => {
    try {
      if (!isAdmin) throw new MockupError(403, 'Documento riservato allo studio');
      const revision = versionSchema.parse(req.params.revision);
      const book = res.locals.book as DocumentSnapshot;
      const version = res.locals.version as number;
      const current = await book.ref.collection('mockups').doc(`v${version}`).get();
      const saved = (current.data()?.revision === revision ? current.data() : (await book.ref.collection('mockupHistory').doc(`v${version}-r${revision}`).get()).data()) as SavedMockup | undefined;
      if (saved?.status !== 'confirmed' || !saved.reportPath) throw new MockupError(404, 'Conferma non trovata');
      const [buffer] = await storage.bucket().file(saved.reportPath).download();
      res.setHeader('Content-Disposition', `attachment; filename="mockup-v${version}-r${revision}.html"`);
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'");
      res.type('text/html').send(buffer);
    } catch (error) { next(error); }
  });
  router.post('/attach', async (req, res, next) => {
    try {
      if (!isAdmin) throw new MockupError(403, 'Solo lo studio può allegare alla spedizione');
      const { revision } = mockupWorkflowInputSchema.parse(req.body);
      const { attachConfirmedMockup, MockupDeliveryError } = await import('./photobook-mockup-delivery.js');
      try { res.json(await attachConfirmedMockup(res.locals.book as DocumentSnapshot, res.locals.version, revision)); }
      catch (error) { if (error instanceof MockupDeliveryError) throw new MockupError(error.status, error.message); throw error; }
    } catch (error) { next(error); }
  });
  router.post('/reconcile-attachment', async (req, res, next) => {
    try {
      if (!isAdmin) throw new MockupError(403, 'Operazione riservata allo studio');
      const { revision } = mockupWorkflowInputSchema.parse(req.body);
      const { reconcileMockupAttachment, MockupDeliveryError } = await import('./photobook-mockup-delivery.js');
      try { res.json(await reconcileMockupAttachment(res.locals.book as DocumentSnapshot, res.locals.version, revision)); }
      catch (error) { if (error instanceof MockupDeliveryError) throw new MockupError(error.status, error.message); throw error; }
    } catch (error) { next(error); }
  });

  async function storePhoto(res: Response, input: Buffer, info: { name: string; source: 'upload' | 'gallery'; photoId?: string }) {
    if (!input.length || input.length > 20 * 1024 * 1024) throw new MockupError(400, 'La foto deve essere entro 20 MB');
    const image = sharp(input, { limitInputPixels: 40_000_000, animated: false });
    let output: Buffer;
    try {
      const metadata = await image.metadata();
      if (!['jpeg','png','webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) throw new Error();
      output = await image.rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    } catch { throw new MockupError(400, 'Foto non leggibile: usa un JPG, PNG o WebP statico entro 40 megapixel.'); }
    const dimensions = await sharp(output).metadata();
    const book = res.locals.book as DocumentSnapshot;
    const version = res.locals.version as number;
    const id = randomUUID();
    const storagePath = `photobook-mockups/${book.id}/v${version}/${id}.jpg`;
    const photo: MockupPhoto = { id, ...info, width: dimensions.width!, height: dimensions.height! };
    const file = storage.bucket().file(storagePath);
    await file.save(output, { metadata: { contentType: 'image/jpeg', cacheControl: 'private, no-store' } });
    try {
      await db.runTransaction(async tx => {
        await guardCurrent(tx, book, version);
        tx.set(book.ref.collection('mockupAssets').doc(id), { ...photo, version, storagePath, createdAt: new Date().toISOString() });
      });
    } catch (error) {
      if (error instanceof MockupError) await file.delete().catch(() => undefined);
      throw error;
    }
    return photo;
  }

  router.post('/upload', express.raw({ type: ['image/jpeg','image/png','image/webp'], limit: '20mb' }), async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new MockupError(400, 'Formato immagine non supportato');
      const name = z.string().trim().min(1).max(200).parse(req.query.name);
      res.json(await storePhoto(res, req.body, { name, source: 'upload' }));
    } catch (error) { next(error); }
  });

  router.post('/gallery-photo', async (req, res, next) => {
    try {
      const { photoId } = z.object({ photoId: z.string().min(1).max(200) }).strict().parse(req.body);
      const book = res.locals.book as DocumentSnapshot;
      const photos = await loadGalleryPhotoDocs(book.data()!.galleryId);
      const photo = photos.find(p => p.id === photoId);
      if (!photo) throw new MockupError(404, 'Foto non trovata nella galleria associata');
      const bucket = storage.bucket();
      const file = bucket.file(mockupGalleryStoragePath(photo.url, bucket.name));
      const [meta] = await file.getMetadata();
      if (Number(meta.size) > 20 * 1024 * 1024) throw new MockupError(400, 'Foto oltre 20 MB: carica una copia ridotta dal dispositivo');
      const [bytes] = await file.download();
      res.json(await storePhoto(res, bytes, { name: photo.name.slice(0,200), source: 'gallery', photoId }));
    } catch (error) { next(error); }
  });

  router.get('/photos/:assetId', async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.assetId);
      const book = res.locals.book as DocumentSnapshot;
      const asset = await book.ref.collection('mockupAssets').doc(id).get();
      if (!asset.exists || asset.data()!.version !== res.locals.version) throw new MockupError(404, 'Foto non trovata');
      const [buffer] = await storage.bucket().file(asset.data()!.storagePath).download();
      res.type('image/jpeg').send(buffer);
    } catch (error) { next(error); }
  });

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const oversized = (error as { type?: string })?.type === 'entity.too.large';
    const status = error instanceof MockupError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : oversized ? 413 : 500;
    res.status(status).json({ error: error instanceof MockupError ? error.message : status === 500 ? 'Impossibile confermare l’esito. Ricarica la proposta prima di riprovare.' : 'Dati mockup o immagine non validi.' });
  });
  return router;
}
