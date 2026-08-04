/**
 * Test della pre-elaborazione OCR con foto "reali" simulate:
 * documento renderizzato, ruotato (storto), con sfondo scuro e contrasto
 * ridotto, come in una foto da smartphone. Verifica che la pipeline con
 * pre-elaborazione (recognizeBest) estragga il codice fiscale.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';
import { recognizeBest } from './document-ocr-routes';
import { buildOcrVariants } from './document-ocr-preprocess';
import { parseOcrText } from '../shared/document-ocr';

const CF = 'RSSMRA85M01H501Q';

/** Renderizza una tessera sanitaria sintetica come farebbe una stampa. */
function documentSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560">
    <rect width="900" height="560" fill="#dfe9f5"/>
    <text x="40" y="70" font-family="DejaVu Sans" font-size="34" fill="#123">TESSERA SANITARIA</text>
    <text x="40" y="120" font-family="DejaVu Sans" font-size="24" fill="#123">CARTA NAZIONALE DEI SERVIZI</text>
    <text x="40" y="200" font-family="DejaVu Sans" font-size="24" fill="#123">Codice Fiscale</text>
    <text x="40" y="245" font-family="DejaVu Sans Mono" font-size="34" fill="#000">${CF}</text>
    <text x="40" y="320" font-family="DejaVu Sans" font-size="24" fill="#123">Cognome</text>
    <text x="40" y="360" font-family="DejaVu Sans" font-size="30" fill="#000">ROSSI</text>
    <text x="40" y="430" font-family="DejaVu Sans" font-size="24" fill="#123">Nome</text>
    <text x="40" y="470" font-family="DejaVu Sans" font-size="30" fill="#000">MARIO</text>
  </svg>`;
}

/**
 * Simula una foto da smartphone: documento ruotato di `angle`°, appoggiato su
 * uno sfondo scuro, con contrasto ridotto e leggera sfocatura.
 */
async function fakePhoto(angle: number): Promise<Buffer> {
  const doc = await sharp(Buffer.from(documentSvg())).png().toBuffer();
  const rotated = await sharp(doc).rotate(angle, { background: '#4a4238' }).png().toBuffer();
  const meta = await sharp(rotated).metadata();
  const bg = await sharp({
    create: {
      width: (meta.width || 900) + 160,
      height: (meta.height || 560) + 160,
      channels: 3,
      background: '#4a4238', // tavolo di legno scuro
    },
  })
    .composite([{ input: rotated, top: 80, left: 80 }])
    .png()
    .toBuffer();
  // Contrasto ridotto + leggera sfocatura, come una foto mediocre
  return sharp(bg)
    .linear(0.6, 60) // schiaccia il contrasto
    .blur(0.8)
    .jpeg({ quality: 78 })
    .toBuffer();
}

let worker: Worker;
beforeAll(async () => {
  worker = await createWorker('ita', undefined, { cachePath: '/tmp/tesseract-cache' });
}, 120_000);
afterAll(async () => {
  await worker?.terminate();
});

describe('buildOcrVariants', () => {
  it('produce varianti migliorata, binarizzata e raddrizzate', async () => {
    const photo = await fakePhoto(3);
    const variants = await buildOcrVariants(photo);
    const labels = variants.map((v) => v.label);
    expect(labels[0]).toBe('migliorata');
    expect(labels).toContain('binarizzata');
    expect(labels.some((l) => l.startsWith('raddrizzata'))).toBe(true);
    for (const v of variants) expect(v.buffer.length).toBeGreaterThan(0);
  }, 60_000);
});

describe('recognizeBest con foto simulate', () => {
  for (const angle of [0, 3, -4]) {
    it(`estrae il CF da una foto storta di ${angle}° a basso contrasto`, async () => {
      const photo = await fakePhoto(angle);
      const text = await recognizeBest(worker, photo, () => {});
      const parsed = parseOcrText(text);
      expect(parsed.codiceFiscale).toBe(CF);
      expect(parsed.dataNascita).toBe('1985-08-01');
    }, 180_000);
  }

  it('con un buffer non-immagine salta l\'OCR e ritorna testo vuoto', async () => {
    const text = await recognizeBest(worker, Buffer.from('non sono una immagine'), () => {});
    expect(text).toBe('');
  }, 60_000);
});
