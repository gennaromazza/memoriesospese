/**
 * Motore di riconoscimento slot fotografici sulle pagine JPEG del fotolibro.
 *
 * Approccio (nessuna dipendenza pesante, solo sharp già presente):
 *  1. Downscale della pagina a larghezza max ~900px, buffer raw RGB.
 *  2. Stima del colore di sfondo campionando i bordi della pagina.
 *  3. Maschera binaria: pixel "diverso dallo sfondo" oltre una soglia di distanza colore.
 *  4. Connected components (flood fill iterativo) sulla maschera.
 *  5. Filtri: area minima, aspect ratio ragionevole, fill-ratio del bounding box.
 *  6. Coordinate salvate proporzionali 0–1 rispetto alla pagina.
 */

import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import type { PhotobookSlot } from '../shared/photobook-types.js';

const WORK_WIDTH = 900; // larghezza di lavoro per la segmentazione
const COLOR_THRESHOLD = 34; // distanza euclidea RGB dal colore di sfondo
const MIN_AREA_RATIO = 0.008; // area minima del bbox: 0.8% della pagina
const MAX_AREA_RATIO = 0.985; // esclude "tutta la pagina"
const MIN_FILL_RATIO = 0.45; // pixel componente / area bbox (le foto sono rettangoli pieni)
const MIN_ASPECT = 0.15;
const MAX_ASPECT = 7;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pixels: number;
}

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Stima i colori di sfondo dominanti campionando la cornice esterna della pagina.
 * Ritorna fino a 2 colori (alcune pagine hanno sfondo bicolore, es. doppia facciata).
 */
function estimateBackgroundColors(
  data: Buffer,
  width: number,
  height: number,
): Array<[number, number, number]> {
  const samples: Array<[number, number, number]> = [];
  const margin = Math.max(2, Math.floor(Math.min(width, height) * 0.01));
  const step = 3;

  const push = (x: number, y: number) => {
    const i = (y * width + x) * 3;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  };

  for (let x = 0; x < width; x += step) {
    for (let m = 0; m < margin; m++) {
      push(x, m);
      push(x, height - 1 - m);
    }
  }
  for (let y = 0; y < height; y += step) {
    for (let m = 0; m < margin; m++) {
      push(m, y);
      push(width - 1 - m, y);
    }
  }

  // Clustering greedy: raggruppa i campioni per vicinanza di colore
  const clusters: Array<{ r: number; g: number; b: number; n: number }> = [];
  for (const [r, g, b] of samples) {
    let found = false;
    for (const c of clusters) {
      if (colorDist(r, g, b, c.r / c.n, c.g / c.n, c.b / c.n) < 28) {
        c.r += r;
        c.g += g;
        c.b += b;
        c.n++;
        found = true;
        break;
      }
    }
    if (!found) clusters.push({ r, g, b, n: 1 });
  }

  clusters.sort((a, b) => b.n - a.n);
  const total = samples.length || 1;
  return clusters
    .filter((c, idx) => idx === 0 || c.n / total > 0.12)
    .slice(0, 2)
    .map((c) => [c.r / c.n, c.g / c.n, c.b / c.n] as [number, number, number]);
}

/** Flood fill iterativo (4-connectivity) su maschera binaria; ritorna bounding box. */
function floodFill(
  mask: Uint8Array,
  labels: Int32Array,
  width: number,
  height: number,
  startIdx: number,
  label: number,
): Box {
  const stack: number[] = [startIdx];
  labels[startIdx] = label;
  let x0 = startIdx % width;
  let x1 = x0;
  let y0 = Math.floor(startIdx / width);
  let y1 = y0;
  let pixels = 0;

  while (stack.length > 0) {
    const idx = stack.pop()!;
    pixels++;
    const x = idx % width;
    const y = Math.floor(idx / width);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;

    // vicini 4-connessi
    if (x > 0) {
      const n = idx - 1;
      if (mask[n] && labels[n] === 0) {
        labels[n] = label;
        stack.push(n);
      }
    }
    if (x < width - 1) {
      const n = idx + 1;
      if (mask[n] && labels[n] === 0) {
        labels[n] = label;
        stack.push(n);
      }
    }
    if (y > 0) {
      const n = idx - width;
      if (mask[n] && labels[n] === 0) {
        labels[n] = label;
        stack.push(n);
      }
    }
    if (y < height - 1) {
      const n = idx + width;
      if (mask[n] && labels[n] === 0) {
        labels[n] = label;
        stack.push(n);
      }
    }
  }

  return { x0, y0, x1, y1, pixels };
}

/** Rimuove i box contenuti quasi interamente in un box più grande. */
function dedupeBoxes(boxes: Box[]): Box[] {
  const kept: Box[] = [];
  const sorted = [...boxes].sort(
    (a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0),
  );
  for (const b of sorted) {
    const areaB = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
    let contained = false;
    for (const k of kept) {
      const ix0 = Math.max(b.x0, k.x0);
      const iy0 = Math.max(b.y0, k.y0);
      const ix1 = Math.min(b.x1, k.x1);
      const iy1 = Math.min(b.y1, k.y1);
      if (ix0 <= ix1 && iy0 <= iy1) {
        const inter = (ix1 - ix0 + 1) * (iy1 - iy0 + 1);
        if (inter / areaB > 0.82) {
          contained = true;
          break;
        }
      }
    }
    if (!contained) kept.push(b);
  }
  return kept;
}

export interface DetectionResult {
  slots: PhotobookSlot[];
  pageWidth: number;
  pageHeight: number;
}

/**
 * Riconosce gli slot fotografici in una pagina JPEG.
 * Ritorna slot con coordinate proporzionali 0–1 e le dimensioni originali della pagina.
 */
export async function detectPhotoSlots(pageBuffer: Buffer): Promise<DetectionResult> {
  const meta = await sharp(pageBuffer).metadata();
  const origWidth = meta.width || 0;
  const origHeight = meta.height || 0;
  if (!origWidth || !origHeight) {
    throw new Error('Impossibile leggere le dimensioni della pagina');
  }

  const { data, info } = await sharp(pageBuffer)
    .rotate()
    .resize(WORK_WIDTH, undefined, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const bgColors = estimateBackgroundColors(data, w, h);

  // Maschera binaria: 1 = "non sfondo"
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    let isBg = false;
    for (const [br, bgc, bb] of bgColors) {
      if (colorDist(r, g, b, br, bgc, bb) < COLOR_THRESHOLD) {
        isBg = true;
        break;
      }
    }
    if (!isBg) mask[i] = 1;
  }

  // Erosione leggera per staccare foto adiacenti separate da bordi sottili di sfondo:
  // (qui invece facciamo il contrario: nessuna dilatazione, la maschera resta conservativa)

  const labels = new Int32Array(w * h);
  const boxes: Box[] = [];
  let nextLabel = 1;
  const pageArea = w * h;

  for (let i = 0; i < w * h; i++) {
    if (mask[i] && labels[i] === 0) {
      const box = floodFill(mask, labels, w, h, i, nextLabel++);
      const bw = box.x1 - box.x0 + 1;
      const bh = box.y1 - box.y0 + 1;
      const area = bw * bh;
      if (area < pageArea * MIN_AREA_RATIO) continue;
      if (area > pageArea * MAX_AREA_RATIO) continue;
      const aspect = bw / bh;
      if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;
      if (box.pixels / area < MIN_FILL_RATIO) continue;
      boxes.push(box);
    }
  }

  const deduped = dedupeBoxes(boxes);

  // Ordina: prima per riga (top), poi per colonna (left) → ordine di lettura
  deduped.sort((a, b) => {
    const rowTolerance = h * 0.06;
    if (Math.abs(a.y0 - b.y0) > rowTolerance) return a.y0 - b.y0;
    return a.x0 - b.x0;
  });

  const slots: PhotobookSlot[] = deduped.map((b) => ({
    id: randomUUID(),
    x: b.x0 / w,
    y: b.y0 / h,
    width: (b.x1 - b.x0 + 1) / w,
    height: (b.y1 - b.y0 + 1) / h,
    rotation: 0,
    photoId: null,
    photoName: null,
    photoThumbnailUrl: null,
    confidence: null,
    matchStatus: 'none',
  }));

  return { slots, pageWidth: origWidth, pageHeight: origHeight };
}
