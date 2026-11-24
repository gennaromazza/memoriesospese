/**
 * Generazione miniature (thumbnails) lato server con Firebase Admin SDK.
 *
 * - Usa l'admin SDK che BYPASSA le Storage Security Rules (nessun problema di CORS/canvas).
 * - L'originale NON viene mai modificato: la miniatura è un file separato in `thumbnails/{galleryId}/`.
 * - Idempotente: rigenera solo le foto senza `thumbnailUrl`.
 * - Robusto ai fallimenti permanenti: una foto il cui originale è irrecuperabile
 *   (URL non interpretabile, file assente/404, immagine non valida) viene marcata con
 *   `thumbnailFailed: true` ed esclusa dalle esecuzioni successive, così le foto sane
 *   non restano bloccate dietro a quelle rotte.
 */

import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { db, storage } from './firebase-admin.js';
import { logger } from './lib/logger.js';

const THUMB_MAX_DIM = 400; // lato lungo massimo
const THUMB_JPEG_QUALITY = 72; // ~15KB per foto, qualità adeguata per griglia
const RETINA_MAX_DIM = 800; // griglia su schermi ad alta densità
const DISPLAY_MAX_DIM = 1600; // foto ingrandita (lightbox)
const WEBP_QUALITY = 78;
/**
 * Ogni file generato ha un percorso con token nuovo a ogni rigenerazione, quindi
 * il browser può tenerlo un anno senza ricontrollarlo. `private`: solo la cache
 * del browser del cliente, non quelle condivise di eventuali proxy.
 */
export const PHOTO_CACHE_CONTROL = 'private, max-age=31536000, immutable';
const CONCURRENCY = 6;
const DEFAULT_LIMIT = 15; // foto per chiamata HTTP (3 versioni ciascuna; basso per evitare timeout 502 del proxy; il client cicla automaticamente)
const MAX_LIMIT = 300;

interface PhotoRef {
  ref: FirebaseFirestore.DocumentReference;
  url: string;
}

type GenerateOutcome = 'generated' | 'permanent-fail' | 'transient-fail';

export interface ThumbnailRunResult {
  totalMissing: number;
  processed: number;
  generated: number;
  failed: number;
  remaining: number;
}

/**
 * Estrae il path dell'oggetto Storage da un URL, gestendo i formati usati nel progetto:
 *  1) Firebase download URL:
 *     https://firebasestorage.googleapis.com/v0/b/<bucket>/o/galleries%2Fabc%2Ffile.jpg?alt=media&token=...
 *     -> "galleries/abc/file.jpg"
 *  2) GCS signed/public URL (path-style):
 *     https://storage.googleapis.com/<bucket>/galleries/abc/file.jpg?GoogleAccessId=...&Signature=...
 *     -> "galleries/abc/file.jpg"
 *  3) GCS virtual-hosted style:
 *     https://<bucket>.storage.googleapis.com/galleries/abc/file.jpg?...
 *     -> "galleries/abc/file.jpg"
 */
export function parseStoragePath(downloadUrl: string): string | null {
  try {
    const u = new URL(downloadUrl);
    const pathname = u.pathname; // esclude la query string

    // 1) Firebase download URL: tutto ciò che segue "/o/"
    const oMatch = pathname.match(/\/o\/(.+)$/);
    if (oMatch) {
      return decodeURIComponent(oMatch[1]);
    }

    const host = u.hostname;

    // 2) Path-style: storage.googleapis.com/<bucket>/<object-path>
    if (host === 'storage.googleapis.com' || host === 'www.googleapis.com') {
      const parts = pathname.replace(/^\/+/, '').split('/');
      if (parts.length >= 2) {
        // parts[0] = nome bucket, il resto è il path dell'oggetto
        return decodeURIComponent(parts.slice(1).join('/'));
      }
      return null;
    }

    // 3) Virtual-hosted style: <bucket>.storage.googleapis.com/<object-path>
    if (host.endsWith('.storage.googleapis.com')) {
      const objectPath = pathname.replace(/^\/+/, '');
      return objectPath ? decodeURIComponent(objectPath) : null;
    }

    return null;
  } catch {
    // Fallback per URL non standard: prova comunque a estrarre dopo "/o/"
    const m = downloadUrl.match(/\/o\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

/**
 * Raccoglie le foto di una galleria senza thumbnailUrl (ed esclude quelle già
 * marcate come fallimento permanente), sia dalla collezione moderna `photos`
 * sia dalla subcollection legacy `galleries/{id}/photos`.
 */
async function collectPhotosMissingThumb(galleryId: string): Promise<PhotoRef[]> {
  const result: PhotoRef[] = [];

  const modern = await db.collection('photos').where('galleryId', '==', galleryId).get();
  modern.forEach((doc) => {
    const data = doc.data();
    if (!data.thumbnailUrl && !data.thumbnailFailed && data.url) {
      result.push({ ref: doc.ref, url: data.url });
    }
  });

  try {
    const legacy = await db.collection('galleries').doc(galleryId).collection('photos').get();
    legacy.forEach((doc) => {
      const data = doc.data();
      if (!data.thumbnailUrl && !data.thumbnailFailed && data.url) {
        result.push({ ref: doc.ref, url: data.url });
      }
    });
  } catch {
    // subcollection legacy assente: ignora
  }

  return result;
}

export interface RenderedPhotoVersions {
  /** JPEG, lato lungo 400 px: resta in `thumbnailUrl`, usato anche da fotolibri, SEO e app desktop. */
  thumb: Buffer;
  /** WebP, lato lungo 800 px: griglia su schermi ad alta densità. */
  w800: Buffer;
  /** WebP, lato lungo 1600 px: foto ingrandita. */
  w1600: Buffer;
  /** Dimensioni dell'originale già raddrizzato secondo l'EXIF. */
  width: number;
  height: number;
}

export interface PhotoVersionFields {
  thumbnailUrl: string;
  variants: { w800: string; w1600: string };
  width: number;
  height: number;
}

/**
 * Prepara le versioni leggere di una foto. Ogni versione è una pipeline sharp a
 * sé: con lo «shrink-on-load» dei JPEG ridurre a 400 px non decodifica l'intera
 * foto, quindi tre pipeline costano poco più di una.
 * Lancia un errore se i byte non sono un'immagine leggibile.
 */
export async function renderPhotoVersions(original: Buffer): Promise<RenderedPhotoVersions> {
  const { width, height, orientation } = await sharp(original).metadata();
  if (!width || !height) throw new Error('Immagine senza dimensioni');
  const sideways = (orientation ?? 1) >= 5; // EXIF 5-8: foto ruotata di 90°
  const fit = (max: number) => sharp(original)
    .rotate() // auto-orienta in base all'EXIF prima di scartare i metadati
    .resize(max, max, { fit: 'inside', withoutEnlargement: true });
  const [thumb, w800, w1600] = await Promise.all([
    fit(THUMB_MAX_DIM).jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true }).toBuffer(),
    fit(RETINA_MAX_DIM).webp({ quality: WEBP_QUALITY }).toBuffer(),
    fit(DISPLAY_MAX_DIM).webp({ quality: WEBP_QUALITY }).toBuffer(),
  ]);
  return { thumb, w800, w1600, width: sideways ? height : width, height: sideways ? width : height };
}

/** Salva le versioni in `thumbnails/{galleryId}/` con un unico token nuovo e cache lunga. */
async function savePhotoVersions(
  galleryId: string,
  photoId: string,
  versions: RenderedPhotoVersions,
): Promise<PhotoVersionFields> {
  const bucket = storage.bucket();
  const token = randomUUID();
  const files = {
    thumb: { path: `thumbnails/${galleryId}/${photoId}.jpg`, bytes: versions.thumb, type: 'image/jpeg' },
    w800: { path: `thumbnails/${galleryId}/${photoId}-800.webp`, bytes: versions.w800, type: 'image/webp' },
    w1600: { path: `thumbnails/${galleryId}/${photoId}-1600.webp`, bytes: versions.w1600, type: 'image/webp' },
  };
  await Promise.all(Object.values(files).map(({ path, bytes, type }) => bucket.file(path).save(bytes, {
    resumable: false,
    metadata: {
      contentType: type,
      cacheControl: PHOTO_CACHE_CONTROL,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  })));
  const url = (path: string) =>
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  return {
    thumbnailUrl: url(files.thumb.path),
    variants: { w800: url(files.w800.path), w1600: url(files.w1600.path) },
    width: versions.width,
    height: versions.height,
  };
}

/**
 * Prepara, salva e registra sulla foto tutte le versioni leggere a partire dai
 * byte dell'originale già in memoria. Restituisce null se l'immagine non è
 * leggibile o il salvataggio fallisce: la foto resta valida e il recupero
 * (`generateGalleryThumbnails`) la riprenderà.
 */
export async function createPhotoVersions(
  galleryId: string,
  photoRef: Pick<FirebaseFirestore.DocumentReference, 'id' | 'update'>,
  original: Buffer,
): Promise<PhotoVersionFields | null> {
  try {
    const fields = await savePhotoVersions(galleryId, photoRef.id, await renderPhotoVersions(original));
    await photoRef.update({ ...fields });
    return fields;
  } catch (err) {
    logger.warn({ err, galleryId, photoId: photoRef.id }, 'Versioni leggere della foto non create: le riprenderà il recupero miniature');
    return null;
  }
}

/**
 * Genera e salva le versioni per una singola foto, aggiornando Firestore.
 * Ritorna l'esito: generata, fallimento permanente (originale irrecuperabile),
 * o fallimento transitorio (errore di rete: verrà ritentato).
 */
async function generateOne(galleryId: string, p: PhotoRef): Promise<GenerateOutcome> {
  const path = parseStoragePath(p.url);
  if (!path) return 'permanent-fail'; // URL non interpretabile

  let buffer: Buffer;
  try {
    [buffer] = await storage.bucket().file(path).download();
  } catch (err: any) {
    // 404 / oggetto inesistente (anche se l'originale è in un altro bucket) => permanente
    if (err?.code === 404) return 'permanent-fail';
    return 'transient-fail'; // errore di rete o transitorio: ritenta più tardi
  }

  let versions: RenderedPhotoVersions;
  try {
    versions = await renderPhotoVersions(buffer);
  } catch {
    return 'permanent-fail'; // file non è un'immagine valida
  }

  try {
    await p.ref.update({ ...(await savePhotoVersions(galleryId, p.ref.id, versions)) });
    return 'generated';
  } catch {
    return 'transient-fail'; // upload/update fallito: ritenta più tardi
  }
}

/**
 * Genera le miniature mancanti per una galleria, fino a `limit` MINIATURE GENERATE
 * per chiamata. Salta automaticamente i fallimenti permanenti (marcandoli) così una
 * singola chiamata fa progressi reali anche se alcune foto sono rotte.
 * Chiamare ripetutamente finché `remaining` non è 0 (o finché `generated` è 0).
 */
export async function generateGalleryThumbnails(
  galleryId: string,
  limit: number = DEFAULT_LIMIT
): Promise<ThumbnailRunResult> {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit) || DEFAULT_LIMIT), MAX_LIMIT);
  // Limite di sicurezza sul lavoro per chiamata (evita timeout se ci sono molti fallimenti)
  const maxProcess = safeLimit * 4;

  const missing = await collectPhotosMissingThumb(galleryId);
  const totalMissing = missing.length;

  let generated = 0;
  let failed = 0;
  let permanentFailed = 0;
  let processed = 0;

  for (let i = 0; i < missing.length && generated < safeLimit && processed < maxProcess; i += CONCURRENCY) {
    const slice = missing.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.allSettled(slice.map((p) => generateOne(galleryId, p)));

    for (let j = 0; j < outcomes.length; j++) {
      processed++;
      const r = outcomes[j];
      const outcome: GenerateOutcome =
        r.status === 'fulfilled' ? r.value : 'transient-fail';

      if (outcome === 'generated') {
        generated++;
      } else {
        failed++;
        if (outcome === 'permanent-fail') {
          permanentFailed++;
          // Marca la foto come irrecuperabile così non riprova all'infinito
          // né blocca le foto sane dietro di essa.
          try {
            await slice[j].ref.update({ thumbnailFailed: true });
          } catch {
            // marcatura best-effort
          }
        }
      }
    }
  }

  // Restano da generare: le mancanti meno quelle generate e quelle marcate permanenti.
  // I fallimenti transitori restano in `remaining` (verranno ritentati).
  const remaining = Math.max(0, totalMissing - generated - permanentFailed);
  return { totalMissing, processed, generated, failed, remaining };
}
