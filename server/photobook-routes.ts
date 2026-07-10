/**
 * Photobook Routes — Modulo Revisione Fotolibro.
 *
 * Route admin (authenticateFirebase + requireAdmin): CRUD fotolibri, versioni,
 * upload pagine JPEG su Storage (`photobooks/{id}/v{n}/`), riconoscimento slot
 * e associazione automatica alle foto della galleria, gestione richieste.
 *
 * Route pubbliche a token (`/by-token/:token`): il cliente accede SOLO tramite
 * link dedicato, mai dalla galleria pubblica. L'admin SDK bypassa le Security
 * Rules (pattern moduli informativi).
 */

import express, { Request, Response, Router, NextFunction } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { db, storage, FieldValue } from './firebase-admin.js';
import { authenticateFirebase } from './email-routes.js';
import { detectPhotoSlots } from './photobook-detection.js';
import {
  buildGalleryHashIndex,
  prepareGalleryHashes,
  matchSlotsToPhotos,
  loadGalleryPhotoDocs,
  listGalleryPhotosPublic,
} from './photobook-matching.js';
import type {
  Photobook,
  PhotobookPage,
  PhotobookSlot,
  PhotobookChangeRequest,
} from '../shared/photobook-types.js';

const router: Router = express.Router();

const BOOKS_COL = 'photobooks';
const PAGES_COL = 'photobookPages';
const REQUESTS_COL = 'photobookChangeRequests';
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

function requireAdmin(req: any, res: Response, next: NextFunction) {
  const email = req.user?.email || '';
  if (!ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Accesso riservato agli amministratori' });
  }
  next();
}

/** Serializza Timestamp Firestore in ISO string per il JSON. */
function ts(v: any): string | null {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000).toISOString();
  return null;
}

function serializeBook(id: string, d: any): any {
  return {
    id,
    name: d.name,
    galleryId: d.galleryId,
    galleryName: d.galleryName || null,
    clientName: d.clientName || null,
    token: d.token,
    currentVersion: d.currentVersion,
    versions: (d.versions || []).map((v: any) => ({
      version: v.version,
      label: v.label || null,
      pageCount: v.pageCount || 0,
      createdAt: ts(v.createdAt) || v.createdAt || null,
    })),
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
  };
}

function serializePage(id: string, d: any): any {
  return {
    id,
    photobookId: d.photobookId,
    version: d.version,
    pageNumber: d.pageNumber,
    fileName: d.fileName || null,
    url: d.url,
    storagePath: d.storagePath,
    width: d.width || 0,
    height: d.height || 0,
    slots: d.slots || [],
    detectionStatus: d.detectionStatus || 'done',
    detectionError: d.detectionError || null,
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
  };
}

function serializeRequest(id: string, d: any): any {
  return {
    id,
    photobookId: d.photobookId,
    photobookName: d.photobookName || null,
    galleryId: d.galleryId,
    galleryName: d.galleryName || null,
    clientName: d.clientName || null,
    version: d.version,
    pageId: d.pageId,
    pageNumber: d.pageNumber,
    slotId: d.slotId,
    type: d.type,
    originalPhotoId: d.originalPhotoId || null,
    originalPhotoName: d.originalPhotoName || null,
    originalPhotoThumbnailUrl: d.originalPhotoThumbnailUrl || null,
    replacementPhotoId: d.replacementPhotoId || null,
    replacementPhotoName: d.replacementPhotoName || null,
    replacementPhotoThumbnailUrl: d.replacementPhotoThumbnailUrl || null,
    note: d.note || null,
    status: d.status || 'pending',
    batchId: d.batchId || null,
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
  };
}

async function getBookByToken(token: string) {
  if (!token || typeof token !== 'string' || token.length < 12) return null;
  const snap = await db.collection(BOOKS_COL).where('token', '==', token).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0];
}

function sanitizeSlots(raw: any): PhotobookSlot[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PhotobookSlot[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') return null;
    const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : null);
    const x = num(s.x);
    const y = num(s.y);
    const width = num(s.width);
    const height = num(s.height);
    if (x === null || y === null || width === null || height === null) return null;
    out.push({
      id: typeof s.id === 'string' && s.id ? s.id : randomUUID(),
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      width: Math.min(1, Math.max(0.005, width)),
      height: Math.min(1, Math.max(0.005, height)),
      rotation: num(s.rotation) || 0,
      photoId: typeof s.photoId === 'string' ? s.photoId : null,
      photoName: typeof s.photoName === 'string' ? s.photoName : null,
      photoThumbnailUrl: typeof s.photoThumbnailUrl === 'string' ? s.photoThumbnailUrl : null,
      confidence: num(s.confidence),
      matchStatus: s.matchStatus === 'auto' || s.matchStatus === 'manual' ? s.matchStatus : 'none',
    });
  }
  return out;
}

/** Scarica il buffer di una pagina dal suo storagePath. */
async function downloadPageBuffer(storagePath: string): Promise<Buffer> {
  const [buf] = await storage.bucket().file(storagePath).download();
  return buf;
}

/** Esegue il matching automatico sugli slot senza associazione manuale. */
async function autoMatchSlots(
  galleryId: string,
  pageBuffer: Buffer,
  slots: PhotobookSlot[],
): Promise<PhotobookSlot[]> {
  const index = await buildGalleryHashIndex(galleryId);
  const docs = await loadGalleryPhotoDocs(galleryId);
  const byId = new Map(docs.map((d) => [d.id, { url: d.url, thumbnailUrl: d.thumbnailUrl }]));

  const toMatch = slots.filter((s) => s.matchStatus !== 'manual');
  const matches = await matchSlotsToPhotos(pageBuffer, toMatch, index, byId);

  return slots.map((s) => {
    if (s.matchStatus === 'manual') return s;
    const m = matches.get(s.id);
    if (!m) {
      return { ...s, photoId: null, photoName: null, photoThumbnailUrl: null, confidence: null, matchStatus: 'none' as const };
    }
    return {
      ...s,
      photoId: m.photoId,
      photoName: m.photoName,
      photoThumbnailUrl: m.photoThumbnailUrl,
      confidence: m.confidence,
      matchStatus: 'auto' as const,
    };
  });
}

// ============================================================
// ROUTE PUBBLICHE A TOKEN (nessuna autenticazione)
// ============================================================

/** GET /by-token/:token — fotolibro + pagine della versione corrente */
router.get('/by-token/:token', async (req: Request, res: Response) => {
  try {
    const bookDoc = await getBookByToken(req.params.token);
    if (!bookDoc) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const book = bookDoc.data();

    const requestedVersion = Number(req.query.version) || book.currentVersion;
    // Il cliente può vedere solo versioni esistenti (storico consentito)
    const validVersions = (book.versions || []).map((v: any) => v.version);
    const version = validVersions.includes(requestedVersion) ? requestedVersion : book.currentVersion;

    const pagesSnap = await db
      .collection(PAGES_COL)
      .where('photobookId', '==', bookDoc.id)
      .where('version', '==', version)
      .get();

    const pages = pagesSnap.docs
      .map((d) => serializePage(d.id, d.data()))
      .sort((a, b) => a.pageNumber - b.pageNumber);

    // Richieste già inviate per questa versione (così il cliente vede lo stato)
    const reqSnap = await db
      .collection(REQUESTS_COL)
      .where('photobookId', '==', bookDoc.id)
      .where('version', '==', version)
      .get();
    const requests = reqSnap.docs.map((d) => serializeRequest(d.id, d.data()));

    return res.json({
      photobook: serializeBook(bookDoc.id, book),
      version,
      pages,
      requests,
    });
  } catch (error) {
    console.error('[photobooks] Errore by-token:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** GET /by-token/:token/gallery-photos — foto della galleria per la scelta sostitutiva */
router.get('/by-token/:token/gallery-photos', async (req: Request, res: Response) => {
  try {
    const bookDoc = await getBookByToken(req.params.token);
    if (!bookDoc) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const photos = await listGalleryPhotosPublic(bookDoc.data().galleryId);
    return res.json({ photos });
  } catch (error) {
    console.error('[photobooks] Errore gallery-photos by-token:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** POST /by-token/:token/requests — invio definitivo delle richieste di modifica */
router.post('/by-token/:token/requests', async (req: Request, res: Response) => {
  try {
    const bookDoc = await getBookByToken(req.params.token);
    if (!bookDoc) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const book = bookDoc.data();

    const { requests } = req.body || {};
    if (!Array.isArray(requests) || requests.length === 0 || requests.length > 200) {
      return res.status(400).json({ error: 'Richieste non valide' });
    }

    // Valida le pagine referenziate (devono appartenere a questo fotolibro
    // e alla versione attuale: le versioni precedenti sono in sola lettura)
    const pageIds = Array.from(new Set(requests.map((r: any) => String(r.pageId || ''))));
    const pageDocs = new Map<string, any>();
    for (const pid of pageIds) {
      if (!pid) return res.status(400).json({ error: 'pageId mancante' });
      const pd = await db.collection(PAGES_COL).doc(pid).get();
      if (!pd.exists || pd.data()!.photobookId !== bookDoc.id) {
        return res.status(400).json({ error: 'Pagina non valida' });
      }
      if (pd.data()!.version !== book.currentVersion) {
        return res.status(400).json({
          error: 'Le versioni precedenti del fotolibro sono in sola lettura',
        });
      }
      pageDocs.set(pid, pd.data());
    }

    // Le foto sostitutive devono appartenere alla galleria collegata al fotolibro
    const needsReplacementCheck = requests.some((r: any) => r.type === 'replace');
    let galleryPhotoIds: Set<string> | null = null;
    if (needsReplacementCheck) {
      const galleryDocs = await loadGalleryPhotoDocs(book.galleryId);
      galleryPhotoIds = new Set(galleryDocs.map((d) => d.id));
    }

    const batchId = randomUUID();
    const batch = db.batch();
    const created: string[] = [];

    for (const r of requests) {
      const type = r.type;
      if (type !== 'replace' && type !== 'delete' && type !== 'edit') {
        return res.status(400).json({ error: `Tipo richiesta non valido: ${type}` });
      }
      const note = typeof r.note === 'string' ? r.note.trim() : '';
      if (type === 'edit' && !note) {
        return res.status(400).json({ error: 'La nota è obbligatoria per le richieste di modifica' });
      }
      if (type === 'replace') {
        if (!r.replacementPhotoId) {
          return res.status(400).json({ error: 'Foto sostitutiva mancante' });
        }
        if (!galleryPhotoIds?.has(String(r.replacementPhotoId))) {
          return res.status(400).json({
            error: 'La foto sostitutiva non appartiene alla galleria di questo fotolibro',
          });
        }
      }
      const pageData = pageDocs.get(String(r.pageId));
      const slot = (pageData.slots || []).find((s: any) => s.id === r.slotId);
      if (!slot) return res.status(400).json({ error: 'Slot non valido' });

      const ref = db.collection(REQUESTS_COL).doc();
      created.push(ref.id);
      batch.set(ref, {
        photobookId: bookDoc.id,
        photobookName: book.name || '',
        galleryId: book.galleryId,
        galleryName: book.galleryName || '',
        clientName: book.clientName || '',
        version: pageData.version,
        pageId: String(r.pageId),
        pageNumber: pageData.pageNumber,
        slotId: String(r.slotId),
        type,
        originalPhotoId: slot.photoId || null,
        originalPhotoName: slot.photoName || null,
        originalPhotoThumbnailUrl: slot.photoThumbnailUrl || null,
        replacementPhotoId: type === 'replace' ? String(r.replacementPhotoId) : null,
        replacementPhotoName: type === 'replace' ? String(r.replacementPhotoName || '') : null,
        replacementPhotoThumbnailUrl:
          type === 'replace' && r.replacementPhotoThumbnailUrl
            ? String(r.replacementPhotoThumbnailUrl)
            : null,
        note: note || null,
        status: 'pending',
        batchId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    console.log(`📖 [photobooks] ${created.length} richieste modifica ricevute per "${book.name}" (batch ${batchId})`);
    return res.json({ ok: true, batchId, count: created.length });
  } catch (error) {
    console.error('[photobooks] Errore submit richieste:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

// ============================================================
// ROUTE ADMIN
// ============================================================

router.use(authenticateFirebase, requireAdmin);

/** GET /requests — tutte le richieste di modifica (schermata "Modifiche Fotolibro") */
router.get('/requests', async (req: Request, res: Response) => {
  try {
    const snap = await db.collection(REQUESTS_COL).get();
    const requests = snap.docs
      .map((d) => serializeRequest(d.id, d.data()))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return res.json({ requests });
  } catch (error) {
    console.error('[photobooks] Errore lista richieste:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** PATCH /requests/:requestId — aggiorna lo stato di una richiesta */
router.patch('/requests/:requestId', async (req: Request, res: Response) => {
  try {
    const { status } = req.body || {};
    if (!['pending', 'done', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Stato non valido' });
    }
    const ref = db.collection(REQUESTS_COL).doc(req.params.requestId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Richiesta non trovata' });
    await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
    return res.json({ ok: true });
  } catch (error) {
    console.error('[photobooks] Errore aggiornamento richiesta:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** GET / — lista fotolibri */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection(BOOKS_COL).get();
    const books = snap.docs
      .map((d) => serializeBook(d.id, d.data()))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return res.json({ photobooks: books });
  } catch (error) {
    console.error('[photobooks] Errore lista:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** POST / — crea fotolibro { name, galleryId } */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, galleryId } = req.body || {};
    if (!name || typeof name !== 'string' || !galleryId || typeof galleryId !== 'string') {
      return res.status(400).json({ error: 'Nome e galleria sono obbligatori' });
    }

    const galleryDoc = await db.collection('galleries').doc(galleryId).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: 'Galleria non trovata' });
    const g = galleryDoc.data() || {};

    const token = randomBytes(24).toString('base64url');
    const now = new Date();
    const docData = {
      name: name.trim(),
      galleryId,
      galleryName: g.name || '',
      clientName: g.clientName || g.clientEmail || g.name || '',
      token,
      currentVersion: 1,
      versions: [{ version: 1, label: null, pageCount: 0, createdAt: now }],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const ref = await db.collection(BOOKS_COL).add(docData);
    const saved = await ref.get();
    console.log(`📖 [photobooks] Creato fotolibro "${name}" per galleria ${galleryId}`);
    return res.json({ photobook: serializeBook(ref.id, saved.data()) });
  } catch (error) {
    console.error('[photobooks] Errore creazione:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** GET /:id — dettaglio fotolibro */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await db.collection(BOOKS_COL).doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Fotolibro non trovato' });
    return res.json({ photobook: serializeBook(doc.id, doc.data()) });
  } catch (error) {
    console.error('[photobooks] Errore dettaglio:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** PATCH /:id — aggiorna nome / versione corrente / label versione */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const ref = db.collection(BOOKS_COL).doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const data = doc.data()!;

    const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
    if (typeof req.body?.name === 'string' && req.body.name.trim()) {
      updates.name = req.body.name.trim();
    }
    if (typeof req.body?.currentVersion === 'number') {
      const exists = (data.versions || []).some((v: any) => v.version === req.body.currentVersion);
      if (!exists) return res.status(400).json({ error: 'Versione inesistente' });
      updates.currentVersion = req.body.currentVersion;
    }
    await ref.update(updates);
    const saved = await ref.get();
    return res.json({ photobook: serializeBook(ref.id, saved.data()) });
  } catch (error) {
    console.error('[photobooks] Errore aggiornamento:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** DELETE /:id — elimina fotolibro, pagine, richieste e file Storage (cascade) */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const ref = db.collection(BOOKS_COL).doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Fotolibro non trovato' });

    const pagesSnap = await db.collection(PAGES_COL).where('photobookId', '==', ref.id).get();
    const reqSnap = await db.collection(REQUESTS_COL).where('photobookId', '==', ref.id).get();

    // Elimina i documenti in batch (max 500 per batch)
    const allDocs = [...pagesSnap.docs, ...reqSnap.docs, doc];
    for (let i = 0; i < allDocs.length; i += 450) {
      const batch = db.batch();
      for (const d of allDocs.slice(i, i + 450)) batch.delete(d.ref);
      await batch.commit();
    }

    // Elimina i file Storage (best-effort)
    try {
      await storage.bucket().deleteFiles({ prefix: `photobooks/${ref.id}/` });
    } catch (e) {
      console.warn('[photobooks] Pulizia Storage fallita (non bloccante):', e);
    }

    console.log(`📖 [photobooks] Eliminato fotolibro ${ref.id} (${pagesSnap.size} pagine, ${reqSnap.size} richieste)`);
    return res.json({ ok: true });
  } catch (error) {
    console.error('[photobooks] Errore eliminazione:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** POST /:id/versions — crea nuova versione (diventa la corrente) */
router.post('/:id/versions', async (req: Request, res: Response) => {
  try {
    const ref = db.collection(BOOKS_COL).doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const data = doc.data()!;

    const versions = data.versions || [];
    const next = Math.max(0, ...versions.map((v: any) => v.version)) + 1;
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : null;

    await ref.update({
      versions: [...versions, { version: next, label, pageCount: 0, createdAt: new Date() }],
      currentVersion: next,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const saved = await ref.get();
    console.log(`📖 [photobooks] Nuova versione v${next} per fotolibro ${ref.id}`);
    return res.json({ photobook: serializeBook(ref.id, saved.data()) });
  } catch (error) {
    console.error('[photobooks] Errore nuova versione:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** GET /:id/pages?version=n — pagine di una versione */
router.get('/:id/pages', async (req: Request, res: Response) => {
  try {
    const bookDoc = await db.collection(BOOKS_COL).doc(req.params.id).get();
    if (!bookDoc.exists) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const version = Number(req.query.version) || bookDoc.data()!.currentVersion;

    const snap = await db
      .collection(PAGES_COL)
      .where('photobookId', '==', req.params.id)
      .where('version', '==', version)
      .get();

    const pages = snap.docs
      .map((d) => serializePage(d.id, d.data()))
      .sort((a, b) => a.pageNumber - b.pageNumber);
    return res.json({ pages, version });
  } catch (error) {
    console.error('[photobooks] Errore lista pagine:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** POST /:id/prepare-hashes — calcola/cacha hash foto galleria (batch, chiamare in loop) */
router.post('/:id/prepare-hashes', async (req: Request, res: Response) => {
  try {
    const bookDoc = await db.collection(BOOKS_COL).doc(req.params.id).get();
    if (!bookDoc.exists) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const limit = Number(req.body?.limit) || 40;
    const result = await prepareGalleryHashes(bookDoc.data()!.galleryId, limit);
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[photobooks] Errore prepare-hashes:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** GET /:id/gallery-photos — foto galleria per il picker admin */
router.get('/:id/gallery-photos', async (req: Request, res: Response) => {
  try {
    const bookDoc = await db.collection(BOOKS_COL).doc(req.params.id).get();
    if (!bookDoc.exists) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const photos = await listGalleryPhotosPublic(bookDoc.data()!.galleryId);
    return res.json({ photos });
  } catch (error) {
    console.error('[photobooks] Errore gallery-photos:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/**
 * POST /:id/versions/:version/pages — upload pagina JPEG (body raw image/*).
 * Query: pageNumber (int), fileName. Esegue subito riconoscimento slot + matching.
 */
router.post(
  '/:id/versions/:version/pages',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '40mb' }),
  async (req: Request, res: Response) => {
    try {
      const ref = db.collection(BOOKS_COL).doc(req.params.id);
      const bookDoc = await ref.get();
      if (!bookDoc.exists) return res.status(404).json({ error: 'Fotolibro non trovato' });
      const book = bookDoc.data()!;

      const version = Number(req.params.version);
      const versions = book.versions || [];
      if (!versions.some((v: any) => v.version === version)) {
        return res.status(400).json({ error: 'Versione inesistente' });
      }

      const pageNumber = Number(req.query.pageNumber);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 999) {
        return res.status(400).json({ error: 'Numero pagina non valido' });
      }
      const fileName = String(req.query.fileName || `pagina-${pageNumber}.jpg`).slice(0, 200);

      const buffer = req.body as Buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length < 1000) {
        return res.status(400).json({ error: 'File pagina mancante o non valido' });
      }

      const contentType = req.headers['content-type'] || 'image/jpeg';
      const bucket = storage.bucket();
      const token = randomUUID();
      const storagePath = `photobooks/${ref.id}/v${version}/${Date.now()}-${pageNumber}.jpg`;
      await bucket.file(storagePath).save(buffer, {
        resumable: false,
        metadata: {
          contentType: String(contentType),
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });
      const url =
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
        `${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

      // Riconoscimento slot + matching automatico
      let slots: PhotobookSlot[] = [];
      let pageWidth = 0;
      let pageHeight = 0;
      let detectionStatus: 'done' | 'failed' = 'done';
      let detectionError: string | null = null;
      try {
        const det = await detectPhotoSlots(buffer);
        pageWidth = det.pageWidth;
        pageHeight = det.pageHeight;
        slots = await autoMatchSlots(book.galleryId, buffer, det.slots);
      } catch (err: any) {
        detectionStatus = 'failed';
        detectionError = err?.message || 'Riconoscimento fallito';
      }

      const pageRef = await db.collection(PAGES_COL).add({
        photobookId: ref.id,
        version,
        pageNumber,
        fileName,
        url,
        storagePath,
        width: pageWidth,
        height: pageHeight,
        slots,
        detectionStatus,
        detectionError,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Aggiorna il conteggio pagine della versione
      const updatedVersions = versions.map((v: any) =>
        v.version === version ? { ...v, pageCount: (v.pageCount || 0) + 1 } : v,
      );
      await ref.update({ versions: updatedVersions, updatedAt: FieldValue.serverTimestamp() });

      const saved = await pageRef.get();
      console.log(
        `📖 [photobooks] Pagina ${pageNumber} caricata (v${version}, ${slots.length} slot, ${slots.filter((s) => s.photoId).length} match)`,
      );
      return res.json({ page: serializePage(pageRef.id, saved.data()) });
    } catch (error) {
      console.error('[photobooks] Errore upload pagina:', error);
      return res.status(500).json({ error: 'Errore interno del server' });
    }
  },
);

/** PATCH /:id/pages/:pageId — salva gli slot modificati dall'editor admin */
router.patch('/:id/pages/:pageId', async (req: Request, res: Response) => {
  try {
    const pageRef = db.collection(PAGES_COL).doc(req.params.pageId);
    const pageDoc = await pageRef.get();
    if (!pageDoc.exists || pageDoc.data()!.photobookId !== req.params.id) {
      return res.status(404).json({ error: 'Pagina non trovata' });
    }

    const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
    if (req.body?.slots !== undefined) {
      const slots = sanitizeSlots(req.body.slots);
      if (!slots) return res.status(400).json({ error: 'Slot non validi' });
      updates.slots = slots;
    }
    if (typeof req.body?.pageNumber === 'number' && Number.isInteger(req.body.pageNumber) && req.body.pageNumber >= 1) {
      updates.pageNumber = req.body.pageNumber;
    }
    await pageRef.update(updates);
    const saved = await pageRef.get();
    return res.json({ page: serializePage(pageRef.id, saved.data()) });
  } catch (error) {
    console.error('[photobooks] Errore aggiornamento pagina:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** DELETE /:id/pages/:pageId — elimina una pagina */
router.delete('/:id/pages/:pageId', async (req: Request, res: Response) => {
  try {
    const pageRef = db.collection(PAGES_COL).doc(req.params.pageId);
    const pageDoc = await pageRef.get();
    if (!pageDoc.exists || pageDoc.data()!.photobookId !== req.params.id) {
      return res.status(404).json({ error: 'Pagina non trovata' });
    }
    const pageData = pageDoc.data()!;

    await pageRef.delete();
    try {
      if (pageData.storagePath) await storage.bucket().file(pageData.storagePath).delete();
    } catch {
      // best-effort
    }

    // Decrementa il conteggio pagine della versione
    const bookRef = db.collection(BOOKS_COL).doc(req.params.id);
    const bookDoc = await bookRef.get();
    if (bookDoc.exists) {
      const versions = (bookDoc.data()!.versions || []).map((v: any) =>
        v.version === pageData.version
          ? { ...v, pageCount: Math.max(0, (v.pageCount || 0) - 1) }
          : v,
      );
      await bookRef.update({ versions, updatedAt: FieldValue.serverTimestamp() });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('[photobooks] Errore eliminazione pagina:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** POST /:id/pages/:pageId/redetect — riesegue riconoscimento slot + matching */
router.post('/:id/pages/:pageId/redetect', async (req: Request, res: Response) => {
  try {
    const bookDoc = await db.collection(BOOKS_COL).doc(req.params.id).get();
    if (!bookDoc.exists) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const pageRef = db.collection(PAGES_COL).doc(req.params.pageId);
    const pageDoc = await pageRef.get();
    if (!pageDoc.exists || pageDoc.data()!.photobookId !== req.params.id) {
      return res.status(404).json({ error: 'Pagina non trovata' });
    }
    const pageData = pageDoc.data()!;

    const buffer = await downloadPageBuffer(pageData.storagePath);
    const det = await detectPhotoSlots(buffer);
    const slots = await autoMatchSlots(bookDoc.data()!.galleryId, buffer, det.slots);

    await pageRef.update({
      slots,
      width: det.pageWidth,
      height: det.pageHeight,
      detectionStatus: 'done',
      detectionError: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const saved = await pageRef.get();
    return res.json({ page: serializePage(pageRef.id, saved.data()) });
  } catch (error) {
    console.error('[photobooks] Errore redetect:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/** POST /:id/pages/:pageId/rematch — riesegue solo il matching sugli slot esistenti */
router.post('/:id/pages/:pageId/rematch', async (req: Request, res: Response) => {
  try {
    const bookDoc = await db.collection(BOOKS_COL).doc(req.params.id).get();
    if (!bookDoc.exists) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const pageRef = db.collection(PAGES_COL).doc(req.params.pageId);
    const pageDoc = await pageRef.get();
    if (!pageDoc.exists || pageDoc.data()!.photobookId !== req.params.id) {
      return res.status(404).json({ error: 'Pagina non trovata' });
    }
    const pageData = pageDoc.data()!;

    const buffer = await downloadPageBuffer(pageData.storagePath);
    const slots = await autoMatchSlots(bookDoc.data()!.galleryId, buffer, pageData.slots || []);

    await pageRef.update({ slots, updatedAt: FieldValue.serverTimestamp() });
    const saved = await pageRef.get();
    return res.json({ page: serializePage(pageRef.id, saved.data()) });
  } catch (error) {
    console.error('[photobooks] Errore rematch:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

export default router;
