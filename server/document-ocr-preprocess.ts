/**
 * Pre-elaborazione immagini per l'OCR dei documenti (tessera sanitaria / CIE).
 *
 * Le foto reali da smartphone arrivano storte, con riflessi, ombre e sfondo:
 * Tesseract da solo spesso fallisce. Qui prepariamo più varianti dell'immagine
 * con sharp (orientamento EXIF, scala di grigi, normalizzazione del contrasto,
 * nitidezza, upscaling e una versione binarizzata) e piccole rotazioni di
 * raddrizzamento. Il chiamante prova le varianti in ordine e si ferma alla
 * prima che produce un risultato affidabile.
 */
import sharp from 'sharp';

export interface OcrVariant {
  /** Descrizione breve (per log/debug). */
  label: string;
  buffer: Buffer;
}

// Larghezza target: abbastanza per il microtesto dei documenti, senza esplodere i tempi
const TARGET_WIDTH = 1800;
const MIN_WIDTH = 1000;

/** Pipeline di base: EXIF-rotate, grigi, contrasto normalizzato, nitidezza, upscale. */
async function baseGray(input: Buffer): Promise<sharp.Sharp> {
  const img = sharp(input, { failOn: 'none' }).rotate(); // .rotate() senza argomenti applica l'orientamento EXIF
  const meta = await img.metadata();
  const width = meta.width || 0;
  let pipeline = img.grayscale().normalise({ lower: 2, upper: 98 }).sharpen();
  if (width > 0 && width < MIN_WIDTH) {
    pipeline = pipeline.resize({ width: TARGET_WIDTH, withoutEnlargement: false });
  } else if (width > TARGET_WIDTH * 1.5) {
    // Foto enormi rallentano Tesseract senza guadagno
    pipeline = pipeline.resize({ width: TARGET_WIDTH });
  }
  return pipeline;
}

/**
 * Genera le varianti pre-elaborate da passare a Tesseract, in ordine di
 * probabilità di successo. Sempre presenti: migliorata (grigi+contrasto) e
 * binarizzata; poi piccole rotazioni di raddrizzamento (±2°, ±4°) sulla
 * versione migliorata, per foto scattate leggermente storte.
 */
export async function buildOcrVariants(input: Buffer): Promise<OcrVariant[]> {
  const variants: OcrVariant[] = [];

  const enhancedPng = await (await baseGray(input)).png().toBuffer();
  variants.push({ label: 'migliorata', buffer: enhancedPng });

  // Binarizzata: aiuta con riflessi/ombre uniformi, ma può distruggere foto scure
  try {
    const bw = await sharp(enhancedPng).threshold(160).png().toBuffer();
    variants.push({ label: 'binarizzata', buffer: bw });
  } catch {
    // non bloccare: la variante migliorata resta disponibile
  }

  // Raddrizzamento a piccoli angoli: sharp non stima lo skew, quindi proviamo
  // rotazioni fisse; il chiamante si ferma appena una variante legge bene.
  for (const angle of [-2, 2, -4, 4]) {
    try {
      const rotated = await sharp(enhancedPng)
        .rotate(angle, { background: '#ffffff' })
        .png()
        .toBuffer();
      variants.push({ label: `raddrizzata ${angle}°`, buffer: rotated });
    } catch {
      // ignora: variante opzionale
    }
  }

  return variants;
}

/** Variante "originale" (solo EXIF-rotate) come ultima spiaggia. */
export async function originalVariant(input: Buffer): Promise<OcrVariant> {
  const buffer = await sharp(input, { failOn: 'none' }).rotate().png().toBuffer();
  return { label: 'originale', buffer };
}
