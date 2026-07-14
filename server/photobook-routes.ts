/**
 * Photobook Routes — Modulo Revisione Fotolibro.
 *
 * Route admin (authenticateFirebase + requireAdmin): CRUD fotolibri, versioni,
 * upload pagine JPEG su Storage (`photobooks/{id}/v{n}/`), gestione richieste.
 *
 * Route pubbliche a token (`/by-token/:token`): il cliente accede SOLO tramite
 * link dedicato, mai dalla galleria pubblica. L'admin SDK bypassa le Security
 * Rules (pattern moduli informativi).
 *
 * Revisione "a penna": il cliente disegna X colorate a mano libera sulla
 * pagina; ogni X è una richiesta (replace/delete/edit) con tratti normalizzati
 * 0–1 e colore da palette. All'invio il client carica uno snapshot JPEG della
 * pagina con le X disegnate (`photobooks/{id}/snapshots/`).
 */

import express, { Request, Response, Router, NextFunction } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { db, storage, FieldValue } from './firebase-admin.js';
import {
  findOrCreateLabParentFolder,
  createShipmentFolder,
  uploadStreamToDriveFolder,
} from './google-drive.js';
import { LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS } from '../shared/lab-types.js';
import { authenticateFirebase } from './email-routes.js';
import { loadGalleryPhotoDocs, listGalleryPhotosPublic, loadGalleryChapters } from './photobook-gallery.js';
import { PHOTOBOOK_MARK_PALETTE, type PhotobookMarkPoint } from '../shared/photobook-types.js';

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
    locked: !!d.locked,
    jobId: d.jobId || null,
    labShipmentId: d.labShipmentId || null,
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
    displayUrl: d.displayUrl || null,
    displayStoragePath: d.displayStoragePath || null,
    width: d.width || 0,
    height: d.height || 0,
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
  };
}

/**
 * Firestore non permette array annidati: i tratti vengono salvati come
 * [{ points: [...] }] e riconvertiti in PhotobookMarkPoint[][] per il client.
 */
function deserializeMarkStrokes(raw: any): PhotobookMarkPoint[][] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const strokes: PhotobookMarkPoint[][] = [];
  for (const s of raw) {
    if (Array.isArray(s)) {
      strokes.push(s);
    } else if (s && typeof s === 'object' && Array.isArray(s.points)) {
      strokes.push(s.points);
    }
  }
  return strokes.length > 0 ? strokes : null;
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
    type: d.type,
    markColor: d.markColor || null,
    markStrokes: deserializeMarkStrokes(d.markStrokes),
    snapshotUrl: d.snapshotUrl || null,
    replacementPhotoId: d.replacementPhotoId || null,
    replacementPhotoName: d.replacementPhotoName || null,
    replacementPhotoThumbnailUrl: d.replacementPhotoThumbnailUrl || null,
    note: d.note || null,
    status: d.status || 'pending',
    batchId: d.batchId || null,
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
    // Campi legacy del sistema a slot (richieste precedenti)
    slotId: d.slotId || null,
    originalPhotoId: d.originalPhotoId || null,
    originalPhotoName: d.originalPhotoName || null,
    originalPhotoThumbnailUrl: d.originalPhotoThumbnailUrl || null,
  };
}

async function getBookByToken(token: string) {
  if (!token || typeof token !== 'string' || token.length < 12) return null;
  const snap = await db.collection(BOOKS_COL).where('token', '==', token).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0];
}

const MARK_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const PALETTE_HEX = new Set(PHOTOBOOK_MARK_PALETTE.map((c) => c.hex.toLowerCase()));
const MAX_STROKES_PER_MARK = 12;
const MAX_POINTS_PER_STROKE = 600;

/**
 * Valida e normalizza i tratti di una X: 1–12 tratti, 2–600 punti ciascuno,
 * coordinate clampate 0–1 e arrotondate a 4 decimali. Ritorna null se invalidi.
 */
function sanitizeMarkStrokes(raw: any): PhotobookMarkPoint[][] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_STROKES_PER_MARK) return null;
  const strokes: PhotobookMarkPoint[][] = [];
  for (const s of raw) {
    if (!Array.isArray(s) || s.length < 2 || s.length > MAX_POINTS_PER_STROKE) return null;
    const stroke: PhotobookMarkPoint[] = [];
    for (const p of s) {
      if (!p || typeof p !== 'object') return null;
      const x = typeof p.x === 'number' && isFinite(p.x) ? p.x : null;
      const y = typeof p.y === 'number' && isFinite(p.y) ? p.y : null;
      if (x === null || y === null) return null;
      stroke.push({
        x: Math.round(Math.min(1, Math.max(0, x)) * 10000) / 10000,
        y: Math.round(Math.min(1, Math.max(0, y)) * 10000) / 10000,
      });
    }
    strokes.push(stroke);
  }
  return strokes;
}

/** Messaggio mostrato al cliente quando il fotolibro è bloccato. */
const LOCKED_MESSAGE =
  "L'album è stato mandato in stampa: non è più possibile apportare modifiche.";

/** Prefisso degli URL snapshot validi per un fotolibro (anti-spoofing). */
function snapshotUrlPrefix(photobookId: string): string {
  const bucket = storage.bucket();
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    encodeURIComponent(`photobooks/${photobookId}/snapshots/`)
  );
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

/** GET /by-token/:token/gallery-photos — foto + capitoli della galleria per la scelta sostitutiva */
router.get('/by-token/:token/gallery-photos', async (req: Request, res: Response) => {
  try {
    const bookDoc = await getBookByToken(req.params.token);
    if (!bookDoc) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const galleryId = bookDoc.data().galleryId;
    const [photos, chapters] = await Promise.all([
      listGalleryPhotosPublic(galleryId),
      loadGalleryChapters(galleryId),
    ]);
    return res.json({ photos, chapters });
  } catch (error) {
    console.error('[photobooks] Errore gallery-photos by-token:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/**
 * POST /by-token/:token/pages/:pageId/snapshot — carica lo snapshot JPEG della
 * pagina con le X disegnate (body raw image/jpeg). Ritorna { url }.
 * Chiamato dal client subito prima dell'invio delle richieste.
 */
router.post(
  '/by-token/:token/pages/:pageId/snapshot',
  express.raw({ type: ['image/jpeg'], limit: '15mb' }),
  async (req: Request, res: Response) => {
    try {
      const bookDoc = await getBookByToken(req.params.token);
      if (!bookDoc) return res.status(404).json({ error: 'Fotolibro non trovato' });
      const book = bookDoc.data();
      if (book.locked) {
        return res.status(403).json({ error: LOCKED_MESSAGE });
      }

      const pageDoc = await db.collection(PAGES_COL).doc(req.params.pageId).get();
      if (!pageDoc.exists || pageDoc.data()!.photobookId !== bookDoc.id) {
        return res.status(404).json({ error: 'Pagina non trovata' });
      }
      if (pageDoc.data()!.version !== book.currentVersion) {
        return res.status(400).json({
          error: 'Le versioni precedenti del fotolibro sono in sola lettura',
        });
      }

      const buffer = req.body as Buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length < 500) {
        return res.status(400).json({ error: 'Snapshot mancante o non valido' });
      }
      // Deve essere un JPEG reale (magic bytes FF D8)
      if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        return res.status(400).json({ error: 'Formato snapshot non valido' });
      }

      const bucket = storage.bucket();
      const downloadToken = randomUUID();
      const storagePath = `photobooks/${bookDoc.id}/snapshots/${pageDoc.id}-${Date.now()}.jpg`;
      await bucket.file(storagePath).save(buffer, {
        resumable: false,
        metadata: {
          contentType: 'image/jpeg',
          metadata: { firebaseStorageDownloadTokens: downloadToken },
        },
      });
      const url =
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
        `${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

      return res.json({ url });
    } catch (error) {
      console.error('[photobooks] Errore upload snapshot:', error);
      return res.status(500).json({ error: 'Errore interno del server' });
    }
  },
);

/** POST /by-token/:token/requests — invio definitivo delle richieste di modifica */
router.post('/by-token/:token/requests', async (req: Request, res: Response) => {
  try {
    const bookDoc = await getBookByToken(req.params.token);
    if (!bookDoc) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const book = bookDoc.data();
    if (book.locked) {
      return res.status(403).json({ error: LOCKED_MESSAGE });
    }

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

    // Le foto sostitutive devono appartenere alla galleria collegata al
    // fotolibro; nome e miniatura vengono risolti server-side (anti-spoofing)
    const needsReplacementCheck = requests.some((r: any) => r.type === 'replace');
    let galleryPhotosById: Map<string, { name: string; url: string; thumbnailUrl?: string | null }> | null = null;
    if (needsReplacementCheck) {
      const galleryDocs = await loadGalleryPhotoDocs(book.galleryId);
      galleryPhotosById = new Map(galleryDocs.map((d) => [d.id, d]));
    }

    const validSnapshotPrefix = snapshotUrlPrefix(bookDoc.id);
    const batchId = randomUUID();
    const batch = db.batch();
    const created: string[] = [];

    for (const r of requests) {
      const type = r.type;
      if (type !== 'replace' && type !== 'delete' && type !== 'edit') {
        return res.status(400).json({ error: `Tipo richiesta non valido: ${type}` });
      }
      const note = typeof r.note === 'string' ? r.note.trim().slice(0, 2000) : '';
      if (type === 'edit' && !note) {
        return res.status(400).json({ error: 'La nota è obbligatoria per le richieste di modifica' });
      }
      let replacementPhoto: { name: string; url: string; thumbnailUrl?: string | null } | null = null;
      if (type === 'replace') {
        if (!r.replacementPhotoId) {
          return res.status(400).json({ error: 'Foto sostitutiva mancante' });
        }
        replacementPhoto = galleryPhotosById?.get(String(r.replacementPhotoId)) || null;
        if (!replacementPhoto) {
          return res.status(400).json({
            error: 'La foto sostitutiva non appartiene alla galleria di questo fotolibro',
          });
        }
      }
      const pageData = pageDocs.get(String(r.pageId));

      // La X disegnata: colore della palette + tratti normalizzati
      const markColor =
        typeof r.markColor === 'string' &&
        MARK_COLOR_RE.test(r.markColor) &&
        PALETTE_HEX.has(r.markColor.toLowerCase())
          ? r.markColor.toLowerCase()
          : null;
      const markStrokes = sanitizeMarkStrokes(r.markStrokes);
      if (!markColor || !markStrokes) {
        return res.status(400).json({ error: 'Segno (X) mancante o non valido' });
      }

      // Snapshot obbligatorio: accetta solo URL generati dall'endpoint
      // snapshot di QUESTO fotolibro (anti-spoofing)
      const snapshotUrl =
        typeof r.snapshotUrl === 'string' && r.snapshotUrl.startsWith(validSnapshotPrefix)
          ? r.snapshotUrl.slice(0, 1000)
          : null;
      if (!snapshotUrl) {
        return res.status(400).json({
          error: 'Snapshot della pagina mancante o non valido: riprova l\'invio',
        });
      }

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
        type,
        markColor,
        // Firestore vieta gli array annidati: ogni tratto diventa una mappa
        markStrokes: markStrokes.map((points) => ({ points })),
        snapshotUrl,
        // Metadati risolti server-side dalla galleria (mai dal client)
        replacementPhotoId: replacementPhoto ? String(r.replacementPhotoId) : null,
        replacementPhotoName: replacementPhoto ? replacementPhoto.name : null,
        replacementPhotoThumbnailUrl: replacementPhoto
          ? replacementPhoto.thumbnailUrl || replacementPhoto.url
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

/**
 * DELETE /by-token/:token/requests/:requestId — il cliente cancella una
 * richiesta già inviata (solo se il fotolibro NON è bloccato e la richiesta
 * appartiene alla versione corrente). Il body JSON opzionale { snapshotUrl }
 * contiene il nuovo snapshot della pagina rigenerato senza la X cancellata:
 * viene applicato alle altre richieste rimaste sulla stessa pagina.
 */
router.delete('/by-token/:token/requests/:requestId', async (req: Request, res: Response) => {
  try {
    const bookDoc = await getBookByToken(req.params.token);
    if (!bookDoc) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const book = bookDoc.data();
    if (book.locked) {
      return res.status(403).json({ error: LOCKED_MESSAGE });
    }

    const reqRef = db.collection(REQUESTS_COL).doc(req.params.requestId);
    const reqDoc = await reqRef.get();
    if (!reqDoc.exists || reqDoc.data()!.photobookId !== bookDoc.id) {
      return res.status(404).json({ error: 'Richiesta non trovata' });
    }
    const reqData = reqDoc.data()!;
    if (reqData.version !== book.currentVersion) {
      return res.status(400).json({
        error: 'Le richieste delle versioni precedenti non possono essere cancellate',
      });
    }

    // Nuovo snapshot (facoltativo) per le richieste rimaste sulla pagina:
    // accetta solo URL generati dall'endpoint snapshot di QUESTO fotolibro
    const validSnapshotPrefix = snapshotUrlPrefix(bookDoc.id);
    const newSnapshotUrl =
      typeof req.body?.snapshotUrl === 'string' &&
      req.body.snapshotUrl.startsWith(validSnapshotPrefix)
        ? req.body.snapshotUrl.slice(0, 1000)
        : null;

    const siblingsSnap = await db
      .collection(REQUESTS_COL)
      .where('photobookId', '==', bookDoc.id)
      .where('pageId', '==', reqData.pageId)
      .where('version', '==', book.currentVersion)
      .get();

    const batch = db.batch();
    batch.delete(reqRef);
    if (newSnapshotUrl) {
      siblingsSnap.docs.forEach((d) => {
        if (d.id === reqRef.id) return;
        batch.update(d.ref, {
          snapshotUrl: newSnapshotUrl,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    }
    await batch.commit();

    console.log(
      `📖 [photobooks] Richiesta ${reqRef.id} cancellata dal cliente per "${book.name}" (pagina ${reqData.pageNumber})`,
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('[photobooks] Errore cancellazione richiesta by-token:', error);
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

/** GET / — lista fotolibri (con backfill lazy di jobId dalla galleria) */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const snap = await db.collection(BOOKS_COL).get();
    const entries = snap.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() }));

    // Backfill una tantum: fotolibri esistenti senza jobId → risali da
    // gallery.jobId e persisti. jobId === null (galleria orfana) viene
    // ritentato ad ogni lista finché non risolto (o impostato a mano).
    for (const e of entries) {
      if (e.data.jobId) continue;
      try {
        const gDoc = await db.collection('galleries').doc(e.data.galleryId).get();
        const gJobId = (gDoc.exists ? gDoc.data()?.jobId : null) || null;
        if (gJobId || e.data.jobId === undefined) {
          await e.ref.update({ jobId: gJobId });
          e.data.jobId = gJobId;
        }
      } catch {
        // best-effort: il backfill non deve bloccare la lista
      }
    }

    const books = entries
      .map((e) => serializeBook(e.id, e.data))
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
      // Associazione esplicita al lavoro: risale da gallery.jobId
      jobId: g.jobId || null,
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
    if (typeof req.body?.locked === 'boolean') {
      updates.locked = req.body.locked;
    }
    // Associazione manuale al lavoro (solo per gallerie orfane senza job)
    if (typeof req.body?.jobId === 'string' && req.body.jobId.trim()) {
      const jobDoc = await db.collection('jobs').doc(req.body.jobId.trim()).get();
      if (!jobDoc.exists) return res.status(404).json({ error: 'Lavoro non trovato' });
      updates.jobId = req.body.jobId.trim();
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

/**
 * Un trasferimento marcato "running" senza heartbeat da oltre questo tempo è
 * considerato morto (crash/restart del server): un nuovo POST può ripartire.
 */
const TRANSFER_STALE_MS = 3 * 60 * 1000;

/**
 * Trasferimento pagine → Drive eseguito in background (fuori dalla richiesta
 * HTTP). Idempotente: nome file deterministico per pagina, salta quelle già
 * presenti nella spedizione. Avanzamento e esito vengono scritti in
 * `labShipments/{id}.pageTransfer` (heartbeat ad ogni pagina).
 */
async function runPhotobookPageTransfer(
  shipmentRef: FirebaseFirestore.DocumentReference,
  photobookId: string,
  driveFolderId: string,
  pages: Array<{ id: string; pageNumber: number; storagePath: string }>,
): Promise<void> {
  const bucket = storage.bucket();
  let transferred = 0;
  let skipped = 0;
  const failed: Array<{ pageNumber: number; error: string }> = [];

  try {
    // Rileggi i file già presenti (fonte di verità per il retry)
    const sDoc = await shipmentRef.get();
    const files: any[] = Array.isArray(sDoc.data()?.files) ? [...sDoc.data()!.files] : [];
    const existingNames = new Set(files.map((f) => f.name));

    for (const page of pages) {
      const extMatch = String(page.storagePath).match(/\.(\w+)$/);
      const ext = extMatch ? extMatch[1] : 'jpg';
      const fileName = `pagina-${String(page.pageNumber).padStart(3, '0')}-${page.id}.${ext}`;
      if (existingNames.has(fileName)) {
        skipped++;
      } else {
        try {
          const storageFile = bucket.file(page.storagePath);
          const [meta] = await storageFile.getMetadata();
          const uploaded = await uploadStreamToDriveFolder(
            driveFolderId,
            fileName,
            String(meta.contentType || 'image/jpeg'),
            storageFile.createReadStream(),
          );
          const entry: any = {
            driveFileId: uploaded.fileId,
            name: fileName,
            size: uploaded.size || Number(meta.size) || 0,
            mimeType: String(meta.contentType || 'image/jpeg'),
            uploadedAt: new Date(),
          };
          if (uploaded.webViewLink) entry.webViewLink = uploaded.webViewLink;
          files.push(entry);
          existingNames.add(fileName);
          transferred++;
        } catch (e: any) {
          console.error(
            `[photobooks] Trasferimento pagina ${page.pageNumber} fallito (fotolibro ${photobookId}):`,
            e?.message || e,
          );
          failed.push({ pageNumber: page.pageNumber, error: e?.message || 'Errore trasferimento' });
        }
      }
      // Persistenza incrementale + avanzamento: un crash a metà non perde i
      // file già copiati e il client vede il progresso in tempo reale
      await shipmentRef.update({
        files,
        'pageTransfer.transferred': transferred,
        'pageTransfer.skipped': skipped,
        'pageTransfer.failed': failed,
        'pageTransfer.heartbeatAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await shipmentRef.update({
      'pageTransfer.status': failed.length > 0 ? 'partial' : 'completed',
      'pageTransfer.finishedAt': FieldValue.serverTimestamp(),
      'pageTransfer.heartbeatAt': FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(
      `📖 [photobooks] Trasferimento pagine fotolibro ${photobookId} → spedizione ${shipmentRef.id} concluso: ${transferred} trasferite, ${skipped} già presenti, ${failed.length} fallite`,
    );
  } catch (e: any) {
    // Errore fatale (es. Firestore/Drive irraggiungibile): marca il fallimento
    console.error(
      `[photobooks] Trasferimento background fallito (fotolibro ${photobookId}):`,
      e?.message || e,
    );
    try {
      await shipmentRef.update({
        'pageTransfer.status': 'failed',
        'pageTransfer.error': String(e?.message || 'Errore trasferimento'),
        'pageTransfer.finishedAt': FieldValue.serverTimestamp(),
        'pageTransfer.heartbeatAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch {
      // best-effort
    }
  }
}

/**
 * POST /:id/lab-shipment — crea (o riusa) la spedizione laboratorio del
 * fotolibro e trasferisce server-side le pagine ORIGINALI (storagePath, mai le
 * versioni display ridotte) della versione corrente da Firebase Storage alla
 * cartella Google Drive della spedizione. Copia byte-per-byte, nessuna
 * ricompressione.
 *
 * Body: { labId?, descrizione?, expiryDays?, jobId? }
 * - jobId serve solo come fallback se il fotolibro non ha un lavoro associato.
 * - Idempotente: richiamandolo ritrasferisce SOLO le pagine mancanti (retry
 *   dopo errori parziali), senza duplicare file già presenti.
 *
 * Risposta: { shipment, transferred, skipped, failed: [{pageNumber, error}] }
 */
router.post('/:id/lab-shipment', async (req: any, res: Response) => {
  try {
    const ref = db.collection(BOOKS_COL).doc(req.params.id);
    const bookDoc = await ref.get();
    if (!bookDoc.exists) return res.status(404).json({ error: 'Fotolibro non trovato' });
    const book = bookDoc.data()!;

    // Lavoro associato (obbligatorio per la spedizione)
    const jobId: string =
      book.jobId || (typeof req.body?.jobId === 'string' ? req.body.jobId.trim() : '');
    if (!jobId) {
      return res.status(400).json({
        error:
          'Il fotolibro non è associato a nessun lavoro: seleziona il lavoro a cui collegare la spedizione',
      });
    }
    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: 'Lavoro non trovato' });

    // Pagine della versione corrente (originali ad alta risoluzione)
    const pagesSnap = await db
      .collection(PAGES_COL)
      .where('photobookId', '==', ref.id)
      .where('version', '==', book.currentVersion)
      .get();
    const pages = pagesSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((p) => p.storagePath)
      .sort((a, b) => a.pageNumber - b.pageNumber);
    if (pages.length === 0) {
      return res.status(400).json({ error: 'La versione corrente non ha pagine da trasferire' });
    }

    // Riusa la spedizione già collegata (retry idempotente), altrimenti creala
    let shipmentRef = book.labShipmentId
      ? db.collection('labShipments').doc(book.labShipmentId)
      : null;
    let shipment: any = null;
    if (shipmentRef) {
      const sDoc = await shipmentRef.get();
      if (sDoc.exists) shipment = sDoc.data();
      else shipmentRef = null;
    }

    let isNewShipment = false;
    if (!shipmentRef) {
      isNewShipment = true;
      const descrizione =
        (typeof req.body?.descrizione === 'string' && req.body.descrizione.trim()) ||
        `Fotolibro "${book.name}" v${book.currentVersion}`;
      const expiryDays =
        typeof req.body?.expiryDays === 'number' && req.body.expiryDays > 0
          ? req.body.expiryDays
          : LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS;
      const shipmentData: any = {
        jobId,
        descrizione,
        files: [],
        status: 'da_inviare',
        expiryDays,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: req.user?.email || undefined,
        photobookId: ref.id,
      };
      const labId = typeof req.body?.labId === 'string' ? req.body.labId.trim() : '';
      if (labId) {
        shipmentData.labId = labId;
        const labDoc = await db.collection('labs').doc(labId).get();
        if (labDoc.exists) {
          shipmentData.labNome = labDoc.data()?.nome;
          shipmentData.labEmail = labDoc.data()?.email;
        }
      }
      shipmentRef = await db.collection('labShipments').add(shipmentData);
      const sDoc = await shipmentRef.get();
      shipment = sDoc.data();
      console.log(
        `📖 [photobooks] Spedizione laboratorio ${shipmentRef.id} creata per fotolibro ${ref.id} (job ${jobId})`,
      );
    }

    // Cartella Drive dedicata (creata al primo trasferimento)
    let driveFolderId: string | undefined = shipment.driveFolderId;
    if (!driveFolderId) {
      const parentId = await findOrCreateLabParentFolder();
      const folderName = `${shipment.labNome ? shipment.labNome + ' - ' : ''}${
        shipment.descrizione || 'Consegna'
      } - ${shipmentRef.id}`;
      const folder = await createShipmentFolder(parentId, folderName);
      driveFolderId = folder.folderId;
      await shipmentRef.update({
        driveFolderId,
        shareableLink: folder.webViewLink || null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Collega subito fotolibro ↔ spedizione (evita doppie creazioni anche se
    // il trasferimento fallisce a metà e si riprova)
    await ref.update({
      jobId,
      labShipmentId: shipmentRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Trasferimento pagine in BACKGROUND: con fotolibri grandi (50+ pagine ad
    // alta risoluzione) la copia sequenziale può durare minuti e far scadere la
    // richiesta HTTP lato client/proxy. La route risponde subito e il client
    // segue l'avanzamento leggendo `pageTransfer` sulla spedizione.
    const now = Date.now();
    const existingTransfer = shipment.pageTransfer;
    const heartbeatMs = existingTransfer?.heartbeatAt?.toDate
      ? existingTransfer.heartbeatAt.toDate().getTime()
      : typeof existingTransfer?.heartbeatAt?._seconds === 'number'
        ? existingTransfer.heartbeatAt._seconds * 1000
        : 0;
    const transferAlreadyRunning =
      existingTransfer?.status === 'running' && now - heartbeatMs < TRANSFER_STALE_MS;

    if (!transferAlreadyRunning) {
      await shipmentRef.update({
        pageTransfer: {
          status: 'running',
          total: pages.length,
          transferred: 0,
          skipped: 0,
          failed: [],
          startedAt: FieldValue.serverTimestamp(),
          heartbeatAt: FieldValue.serverTimestamp(),
          finishedAt: null,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Fire-and-forget: gli errori vengono registrati dentro pageTransfer
      void runPhotobookPageTransfer(shipmentRef, ref.id, driveFolderId, pages);
    }

    // Evento timeline sul job (solo alla prima creazione, best-effort)
    if (isNewShipment) {
      try {
        await db.collection('jobTimeline').add({
          id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          jobId,
          tipo: 'nota_aggiunta',
          descrizione: `Fotolibro "${book.name}" mandato in stampa: creata spedizione laboratorio${
            shipment.labNome ? ` (${shipment.labNome})` : ''
          } con trasferimento pagine su Google Drive.`,
          data: FieldValue.serverTimestamp(),
          metadata: { labShipmentId: shipmentRef.id, photobookId: ref.id },
        });
      } catch (e: any) {
        console.warn('[photobooks] Evento timeline non salvato (non bloccante):', e?.message);
      }
    }

    const finalDoc = await shipmentRef.get();
    console.log(
      `📖 [photobooks] Trasferimento pagine fotolibro ${ref.id} → spedizione ${shipmentRef.id} avviato in background (${pages.length} pagine${transferAlreadyRunning ? ', già in corso' : ''})`,
    );
    return res.status(202).json({
      shipment: { id: finalDoc.id, ...finalDoc.data() },
      started: !transferAlreadyRunning,
      alreadyRunning: transferAlreadyRunning,
      totalPages: pages.length,
    });
  } catch (error: any) {
    console.error('[photobooks] Errore creazione spedizione laboratorio:', error);
    const msg = String(error?.message || '');
    if (msg.includes('GOOGLE_DRIVE_RECONNECTION_NEEDED')) {
      return res.status(502).json({
        error: 'Google Drive non connesso: riconnetti Google Drive dalle impostazioni e riprova',
      });
    }
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
 * Query: pageNumber (int), fileName.
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

      const contentType = String(req.headers['content-type'] || 'image/jpeg');
      const mime = contentType.split(';')[0].trim().toLowerCase();
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const bucket = storage.bucket();
      const token = randomUUID();
      const storagePath = `photobooks/${ref.id}/v${version}/${Date.now()}-${pageNumber}.${ext}`;
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

      // Dimensioni originali della pagina (per il rendering proporzionale)
      let pageWidth = 0;
      let pageHeight = 0;
      try {
        const meta = await sharp(buffer).metadata();
        pageWidth = meta.width || 0;
        pageHeight = meta.height || 0;
      } catch {
        // non bloccante: il client usa l'aspect ratio dell'immagine caricata
      }

      // Versione ridotta per la visualizzazione (mobile): ~1400px, JPEG q80.
      // Non bloccante: se fallisce, il client usa l'originale.
      let displayUrl: string | null = null;
      let displayStoragePath: string | null = null;
      try {
        const resized = await sharp(buffer)
          .rotate()
          .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80, mozjpeg: true })
          .toBuffer();
        // Ha senso solo se davvero più piccola dell'originale
        if (resized.length < buffer.length * 0.9) {
          const dToken = randomUUID();
          displayStoragePath = `photobooks/${ref.id}/v${version}/display/${Date.now()}-${pageNumber}.jpg`;
          await bucket.file(displayStoragePath).save(resized, {
            resumable: false,
            metadata: {
              contentType: 'image/jpeg',
              metadata: { firebaseStorageDownloadTokens: dToken },
            },
          });
          displayUrl =
            `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
            `${encodeURIComponent(displayStoragePath)}?alt=media&token=${dToken}`;
        }
      } catch (e) {
        console.warn('[photobooks] Generazione versione display fallita (non bloccante):', e);
        displayUrl = null;
        displayStoragePath = null;
      }

      const pageRef = await db.collection(PAGES_COL).add({
        photobookId: ref.id,
        version,
        pageNumber,
        fileName,
        url,
        storagePath,
        displayUrl,
        displayStoragePath,
        width: pageWidth,
        height: pageHeight,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Aggiorna il conteggio pagine della versione (in transazione: upload
      // paralleli non devono perdere incrementi con read-modify-write)
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (!fresh.exists) return;
        const updatedVersions = (fresh.data()!.versions || []).map((v: any) =>
          v.version === version ? { ...v, pageCount: (v.pageCount || 0) + 1 } : v,
        );
        tx.update(ref, { versions: updatedVersions, updatedAt: FieldValue.serverTimestamp() });
      });

      const saved = await pageRef.get();
      console.log(`📖 [photobooks] Pagina ${pageNumber} caricata (v${version})`);
      return res.json({ page: serializePage(pageRef.id, saved.data()) });
    } catch (error) {
      console.error('[photobooks] Errore upload pagina:', error);
      return res.status(500).json({ error: 'Errore interno del server' });
    }
  },
);

/** PATCH /:id/pages/:pageId — aggiorna il numero pagina */
router.patch('/:id/pages/:pageId', async (req: Request, res: Response) => {
  try {
    const pageRef = db.collection(PAGES_COL).doc(req.params.pageId);
    const pageDoc = await pageRef.get();
    if (!pageDoc.exists || pageDoc.data()!.photobookId !== req.params.id) {
      return res.status(404).json({ error: 'Pagina non trovata' });
    }

    const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
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
    try {
      if (pageData.displayStoragePath)
        await storage.bucket().file(pageData.displayStoragePath).delete();
    } catch {
      // best-effort
    }

    // Cascade: elimina le richieste di modifica che puntano alla pagina
    // (altrimenti restano orfane nella schermata "Modifiche Fotolibro")
    try {
      const orphanReqs = await db
        .collection(REQUESTS_COL)
        .where('photobookId', '==', req.params.id)
        .where('pageId', '==', pageRef.id)
        .get();
      if (!orphanReqs.empty) {
        // Chunk da 450: un singolo batch Firestore accetta max 500 operazioni
        for (let i = 0; i < orphanReqs.docs.length; i += 450) {
          const batch = db.batch();
          for (const d of orphanReqs.docs.slice(i, i + 450)) batch.delete(d.ref);
          await batch.commit();
        }
        console.log(
          `📖 [photobooks] Eliminate ${orphanReqs.size} richieste orfane della pagina ${pageRef.id}`,
        );
      }
    } catch (e) {
      console.warn('[photobooks] Pulizia richieste della pagina fallita (non bloccante):', e);
    }

    // Decrementa il conteggio pagine della versione (in transazione)
    const bookRef = db.collection(BOOKS_COL).doc(req.params.id);
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(bookRef);
      if (!fresh.exists) return;
      const versions = (fresh.data()!.versions || []).map((v: any) =>
        v.version === pageData.version
          ? { ...v, pageCount: Math.max(0, (v.pageCount || 0) - 1) }
          : v,
      );
      tx.update(bookRef, { versions, updatedAt: FieldValue.serverTimestamp() });
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error('[photobooks] Errore eliminazione pagina:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

export default router;
