/**
 * Motore di associazione slot fotolibro → foto galleria.
 *
 * Perceptual hashing locale con sharp (nessun servizio AI esterno):
 *  - dHash 64 bit (gradiente orizzontale su griglia 9x8 grayscale)
 *  - aHash 64 bit (media su griglia 8x8 grayscale)
 * Similarità = 1 - (hammingD + hammingA) / 128, in percentuale.
 * Tiebreak per candidati vicini: correlazione pixel su micro-miniature 16x16.
 *
 * Gli hash delle foto galleria vengono cachati sul documento foto
 * (campo `pbHash: { d: string, a: string }`, hex) per evitare ricalcoli.
 */

import sharp from 'sharp';
import { db, storage } from './firebase-admin.js';
import { parseStoragePath } from './thumbnails.js';
import type { PhotobookSlot, PhotobookGalleryPhoto } from '../shared/photobook-types.js';

const BIG_0 = BigInt(0);
const BIG_1 = BigInt(1);

const MATCH_THRESHOLD = 55; // % minima per considerare valido un match automatico
const TIEBREAK_DELTA = 6; // % di distanza entro cui applicare il tiebreak pixel
const HASH_CONCURRENCY = 5;

export interface PhotoHashEntry {
  photoId: string;
  name: string;
  url: string;
  thumbnailUrl?: string | null;
  dHash: bigint;
  aHash: bigint;
  micro?: Uint8Array; // 16x16 grayscale per tiebreak (solo in-memory)
}

/** Calcola dHash (9x8) e aHash (8x8) da un buffer immagine. */
export async function computeHashes(buffer: Buffer): Promise<{ dHash: bigint; aHash: bigint }> {
  const { data: dData } = await sharp(buffer)
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let dHash = BIG_0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      dHash = (dHash << BIG_1) | (dData[y * 9 + x] > dData[y * 9 + x + 1] ? BIG_1 : BIG_0);
    }
  }

  const { data: aData } = await sharp(buffer)
    .grayscale()
    .resize(8, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  for (let i = 0; i < 64; i++) sum += aData[i];
  const avg = sum / 64;
  let aHash = BIG_0;
  for (let i = 0; i < 64; i++) {
    aHash = (aHash << BIG_1) | (aData[i] > avg ? BIG_1 : BIG_0);
  }

  return { dHash, aHash };
}

async function computeMicro(buffer: Buffer): Promise<Uint8Array> {
  const { data } = await sharp(buffer)
    .grayscale()
    .resize(16, 16, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}

function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x > BIG_0) {
    count += Number(x & BIG_1);
    x >>= BIG_1;
  }
  return count;
}

/** Correlazione (Pearson) tra due micro-miniature grayscale. */
function pixelCorrelation(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let dbb = 0;
  for (let i = 0; i < n; i++) {
    const va = a[i] - ma;
    const vb = b[i] - mb;
    num += va * vb;
    da += va * va;
    dbb += vb * vb;
  }
  const den = Math.sqrt(da * dbb);
  return den === 0 ? 0 : num / den;
}

function hexToBigInt(hex: string): bigint {
  return BigInt('0x' + hex);
}

function bigIntToHex(v: bigint): string {
  return v.toString(16).padStart(16, '0');
}

/** Scarica il buffer di una foto da Storage (preferendo la thumbnail se disponibile). */
async function downloadPhotoBuffer(photo: {
  url: string;
  thumbnailUrl?: string | null;
}): Promise<Buffer | null> {
  const bucket = storage.bucket();
  const candidates = [photo.thumbnailUrl, photo.url].filter(Boolean) as string[];
  for (const u of candidates) {
    const path = parseStoragePath(u);
    if (!path) continue;
    try {
      const [buf] = await bucket.file(path).download();
      return buf;
    } catch {
      // prova il prossimo candidato
    }
  }
  return null;
}

interface GalleryPhotoDoc {
  ref: FirebaseFirestore.DocumentReference;
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string | null;
  pbHash?: { d: string; a: string } | null;
  pbHashFailed?: boolean;
}

/** Carica le foto della galleria (collezione moderna `photos` + legacy subcollection). */
export async function loadGalleryPhotoDocs(galleryId: string): Promise<GalleryPhotoDoc[]> {
  const result: GalleryPhotoDoc[] = [];

  const modern = await db.collection('photos').where('galleryId', '==', galleryId).get();
  modern.forEach((doc) => {
    const d = doc.data();
    if (d.url) {
      result.push({
        ref: doc.ref,
        id: doc.id,
        name: d.name || d.fileName || doc.id,
        url: d.url,
        thumbnailUrl: d.thumbnailUrl || null,
        pbHash: d.pbHash || null,
        pbHashFailed: !!d.pbHashFailed,
      });
    }
  });

  try {
    const legacy = await db.collection('galleries').doc(galleryId).collection('photos').get();
    const seen = new Set(result.map((p) => p.id));
    legacy.forEach((doc) => {
      if (seen.has(doc.id)) return;
      const d = doc.data();
      if (d.url) {
        result.push({
          ref: doc.ref,
          id: doc.id,
          name: d.name || d.fileName || doc.id,
          url: d.url,
          thumbnailUrl: d.thumbnailUrl || null,
          pbHash: d.pbHash || null,
          pbHashFailed: !!d.pbHashFailed,
        });
      }
    });
  } catch {
    // subcollection legacy assente
  }

  return result;
}

/** Subset sicuro delle foto galleria per il client fotolibro. */
export async function listGalleryPhotosPublic(galleryId: string): Promise<PhotobookGalleryPhoto[]> {
  const docs = await loadGalleryPhotoDocs(galleryId);
  return docs.map((p) => ({
    id: p.id,
    name: p.name,
    url: p.url,
    thumbnailUrl: p.thumbnailUrl || null,
  }));
}

export interface PrepareHashesResult {
  total: number;
  hashed: number; // hash generati in QUESTA chiamata
  alreadyHashed: number;
  remaining: number;
  failed: number;
}

/**
 * Calcola e cacha gli hash percettivi (`pbHash`) per un batch di foto della
 * galleria che ancora non li hanno. Chiamare ripetutamente (pattern miniature)
 * finché `remaining` non è 0: evita timeout del proxy su gallerie grandi.
 * Le foto marcate `pbHashFailed` (buffer irrecuperabile/invalido) vengono saltate.
 */
export async function prepareGalleryHashes(
  galleryId: string,
  limit: number = 40,
): Promise<PrepareHashesResult> {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 40), 150);
  const docs = await loadGalleryPhotoDocs(galleryId);
  const pendingAll: GalleryPhotoDoc[] = [];

  // Escludi le foto già marcate come fallimento permanente
  for (const d of docs) {
    if (d.pbHash) continue;
    if (d.pbHashFailed) continue;
    pendingAll.push(d);
  }

  const batch = pendingAll.slice(0, safeLimit);
  let hashed = 0;
  let failed = 0;

  for (let i = 0; i < batch.length; i += HASH_CONCURRENCY) {
    const slice = batch.slice(i, i + HASH_CONCURRENCY);
    await Promise.allSettled(
      slice.map(async (p) => {
        const buf = await downloadPhotoBuffer(p);
        if (!buf) {
          failed++;
          await p.ref.update({ pbHashFailed: true }).catch(() => {});
          return;
        }
        try {
          const { dHash, aHash } = await computeHashes(buf);
          p.pbHash = { d: bigIntToHex(dHash), a: bigIntToHex(aHash) };
          await p.ref.update({ pbHash: p.pbHash }).catch(() => {});
          hashed++;
        } catch {
          failed++;
          await p.ref.update({ pbHashFailed: true }).catch(() => {});
        }
      }),
    );
  }

  const alreadyHashed = docs.filter((d) => d.pbHash).length - hashed;
  return {
    total: docs.length,
    hashed,
    alreadyHashed: Math.max(0, alreadyHashed),
    // I fallimenti sono marcati permanenti: non restano in coda
    remaining: Math.max(0, pendingAll.length - hashed - failed),
    failed,
  };
}

/**
 * Costruisce l'indice hash della galleria usando SOLO gli hash già cachati
 * (`pbHash`) sui documenti foto. Chiamare prima `prepareGalleryHashes` in loop
 * per popolare la cache senza incorrere in timeout.
 */
export async function buildGalleryHashIndex(galleryId: string): Promise<PhotoHashEntry[]> {
  const docs = await loadGalleryPhotoDocs(galleryId);
  const entries: PhotoHashEntry[] = [];

  for (const p of docs) {
    if (!p.pbHash) continue;
    entries.push({
      photoId: p.id,
      name: p.name,
      url: p.url,
      thumbnailUrl: p.thumbnailUrl || null,
      dHash: hexToBigInt(p.pbHash.d),
      aHash: hexToBigInt(p.pbHash.a),
    });
  }

  return entries;
}

export interface SlotMatch {
  photoId: string;
  photoName: string;
  photoThumbnailUrl: string | null;
  confidence: number; // 0–100
}

/**
 * Associa gli slot di una pagina alle foto della galleria.
 * `pageBuffer` è il JPEG originale della pagina; per ogni slot viene estratto
 * il ritaglio virtuale e confrontato con l'indice hash della galleria.
 */
export async function matchSlotsToPhotos(
  pageBuffer: Buffer,
  slots: PhotobookSlot[],
  index: PhotoHashEntry[],
  photoDocsById?: Map<string, { url: string; thumbnailUrl?: string | null }>,
): Promise<Map<string, SlotMatch | null>> {
  const results = new Map<string, SlotMatch | null>();
  if (index.length === 0) {
    for (const s of slots) results.set(s.id, null);
    return results;
  }

  const meta = await sharp(pageBuffer).rotate().metadata();
  const pw = meta.width || 0;
  const ph = meta.height || 0;
  if (!pw || !ph) {
    for (const s of slots) results.set(s.id, null);
    return results;
  }

  const oriented = await sharp(pageBuffer).rotate().toBuffer();

  for (const slot of slots) {
    try {
      const left = Math.max(0, Math.round(slot.x * pw));
      const top = Math.max(0, Math.round(slot.y * ph));
      const width = Math.min(pw - left, Math.max(8, Math.round(slot.width * pw)));
      const height = Math.min(ph - top, Math.max(8, Math.round(slot.height * ph)));
      if (width < 8 || height < 8) {
        results.set(slot.id, null);
        continue;
      }

      const crop = await sharp(oriented).extract({ left, top, width, height }).toBuffer();
      const { dHash, aHash } = await computeHashes(crop);

      // Similarità con tutte le foto dell'indice
      const scored = index
        .map((e) => ({
          entry: e,
          score: (1 - (hamming(dHash, e.dHash) + hamming(aHash, e.aHash)) / 128) * 100,
        }))
        .sort((a, b) => b.score - a.score);

      let best = scored[0];
      if (!best || best.score < MATCH_THRESHOLD) {
        results.set(slot.id, null);
        continue;
      }

      // Tiebreak: candidati entro TIEBREAK_DELTA % → correlazione pixel su micro 16x16
      const close = scored.filter((s) => best.score - s.score <= TIEBREAK_DELTA).slice(0, 4);
      if (close.length > 1 && photoDocsById) {
        const cropMicro = await computeMicro(crop);
        let bestCorr = -Infinity;
        let bestCand = best;
        for (const cand of close) {
          if (!cand.entry.micro) {
            const doc = photoDocsById.get(cand.entry.photoId);
            if (doc) {
              const buf = await downloadPhotoBuffer(doc);
              if (buf) {
                try {
                  cand.entry.micro = await computeMicro(buf);
                } catch {
                  // ignora
                }
              }
            }
          }
          const corr = cand.entry.micro
            ? pixelCorrelation(cropMicro, cand.entry.micro)
            : -1;
          if (corr > bestCorr) {
            bestCorr = corr;
            bestCand = cand;
          }
        }
        best = bestCand;
      }

      results.set(slot.id, {
        photoId: best.entry.photoId,
        photoName: best.entry.name,
        photoThumbnailUrl: best.entry.thumbnailUrl || null,
        confidence: Math.round(best.score),
      });
    } catch {
      results.set(slot.id, null);
    }
  }

  return results;
}
