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

const THUMB_MAX_DIM = 400; // lato lungo massimo
const THUMB_JPEG_QUALITY = 72; // ~40KB per foto, qualità adeguata per griglia
const CONCURRENCY = 6;
const DEFAULT_LIMIT = 120; // miniature generate per chiamata (evita timeout HTTP su gallerie grandi)
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
 * Estrae il path dell'oggetto Storage da un download URL di Firebase.
 * es. ".../o/galleries%2Fabc%2Ffile.jpg?alt=media&token=..." -> "galleries/abc/file.jpg"
 */
export function parseStoragePath(downloadUrl: string): string | null {
  try {
    const m = downloadUrl.match(/\/o\/([^?]+)/);
    if (!m) return null;
    return decodeURIComponent(m[1]);
  } catch {
    return null;
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

/**
 * Genera e salva la miniatura per una singola foto, aggiornando Firestore.
 * Ritorna l'esito: generata, fallimento permanente (originale irrecuperabile),
 * o fallimento transitorio (errore di rete: verrà ritentato).
 */
async function generateOne(galleryId: string, p: PhotoRef): Promise<GenerateOutcome> {
  const path = parseStoragePath(p.url);
  if (!path) return 'permanent-fail'; // URL non interpretabile

  const bucket = storage.bucket();

  let buffer: Buffer;
  try {
    [buffer] = await bucket.file(path).download();
  } catch (err: any) {
    // 404 / oggetto inesistente (anche se l'originale è in un altro bucket) => permanente
    if (err?.code === 404) return 'permanent-fail';
    return 'transient-fail'; // errore di rete o transitorio: ritenta più tardi
  }

  let thumb: Buffer;
  try {
    thumb = await sharp(buffer)
      .rotate() // auto-orienta in base all'EXIF prima di scartare i metadati
      .resize(THUMB_MAX_DIM, THUMB_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch {
    return 'permanent-fail'; // file non è un'immagine valida
  }

  try {
    const token = randomUUID();
    const thumbPath = `thumbnails/${galleryId}/${p.ref.id}.jpg`;
    const file = bucket.file(thumbPath);

    await file.save(thumb, {
      resumable: false,
      metadata: {
        contentType: 'image/jpeg',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const thumbnailUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      `${encodeURIComponent(thumbPath)}?alt=media&token=${token}`;

    await p.ref.update({ thumbnailUrl });
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
