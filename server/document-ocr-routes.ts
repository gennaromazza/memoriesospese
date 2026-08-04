/**
 * Document OCR Routes — estrazione dati da tessera sanitaria / CIE
 *
 * Riconoscimento GRATUITO e locale con Tesseract (open source): l'immagine
 * viene elaborata sul server e mai inviata a servizi esterni, salvata su
 * disco, storage o database. Data di nascita e sesso vengono decodificati
 * direttamente dal codice fiscale letto.
 */
import { Router, json } from 'express';
import { createWorker, type Worker } from 'tesseract.js';
import { authenticateFirebase } from './email-routes.js';
import { crossCheckDocument, parseOcrText } from '../shared/document-ocr.js';
import { buildOcrVariants, originalVariant } from './document-ocr-preprocess.js';
import { isValidCodiceFiscale } from '../shared/fiscal-validation.js';

const router = Router();

// Solo l'admin dello studio può usare la scansione (dati sensibili)
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

function requireAdmin(req: any, res: any, next: any) {
  if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
    return res.status(403).json({ error: 'Accesso negato: solo admin' });
  }
  next();
}

// Le foto dei documenti (già ridimensionate lato client) restano sotto i 10 MB
router.use(json({ limit: '10mb' }));

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGES = 2; // CIE fronte/retro
const MAX_BASE64_LEN = 8 * 1024 * 1024; // ~6 MB di immagine reale

// Worker Tesseract riusato tra le richieste (l'inizializzazione è costosa)
let workerPromise: Promise<Worker> | null = null;
function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('ita', undefined, { cachePath: '/tmp/tesseract-cache' }).catch((err) => {
      workerPromise = null; // riprova alla prossima richiesta
      throw err;
    });
  }
  return workerPromise;
}

// Numero massimo di varianti pre-elaborate tentate per immagine (tempi contenuti)
const MAX_VARIANTS_TRIED = 4;

/**
 * Riconosce il testo provando più varianti pre-elaborate dell'immagine
 * (grigi+contrasto, binarizzata, piccole rotazioni di raddrizzamento) e si
 * ferma appena una variante contiene un codice fiscale valido. Altrimenti
 * ritorna il testo della variante con la confidenza Tesseract più alta.
 */
export async function recognizeBest(
  worker: Worker,
  buffer: Buffer,
  log: (msg: string) => void = (m) => console.log(m)
): Promise<string> {
  let variants;
  try {
    variants = (await buildOcrVariants(buffer)).slice(0, MAX_VARIANTS_TRIED);
    variants.push(await originalVariant(buffer));
  } catch (err: any) {
    // Immagine non decodificabile da sharp: anche Tesseract fallirebbe (e il suo
    // worker emette un errore non gestibile) — meglio fermarsi subito.
    log(`⚠️ Immagine non decodificabile (${err?.message || err}): salto l'OCR`);
    return '';
  }

  let bestText = '';
  let bestConfidence = -1;
  for (const variant of variants) {
    let data;
    try {
      ({ data } = await worker.recognize(variant.buffer));
    } catch {
      continue; // variante illeggibile: prova la prossima
    }
    const parsed = parseOcrText(data.text);
    if (parsed.codiceFiscale && isValidCodiceFiscale(parsed.codiceFiscale)) {
      log(`📄 OCR ok con variante "${variant.label}" (confidenza ${Math.round(data.confidence)})`);
      return data.text;
    }
    if (data.confidence > bestConfidence) {
      bestConfidence = data.confidence;
      bestText = data.text;
    }
  }
  log(`📄 OCR senza CF valido: uso la variante con confidenza migliore (${Math.round(bestConfidence)})`);
  return bestText;
}

/**
 * POST /api/document-ocr/scan
 * body: { images: [{ data: base64 (senza prefisso), mimeType }] } (max 2)
 * Ritorna { available, extracted?, crossCheck?, error? }
 */
router.post('/scan', authenticateFirebase, requireAdmin, async (req: any, res) => {
  const images = Array.isArray(req.body?.images) ? req.body.images : [];
  if (images.length < 1 || images.length > MAX_IMAGES) {
    return res.status(400).json({ error: `Servono da 1 a ${MAX_IMAGES} immagini` });
  }
  for (const img of images) {
    if (
      typeof img?.data !== 'string' ||
      img.data.length === 0 ||
      img.data.length > MAX_BASE64_LEN ||
      !/^[A-Za-z0-9+/=]+$/.test(img.data) ||
      !ALLOWED_MIME.has(img?.mimeType)
    ) {
      return res.status(400).json({ error: 'Immagine non valida (formati ammessi: JPG, PNG, WebP)' });
    }
  }

  try {
    const worker = await getWorker();
    let fullText = '';
    for (const img of images) {
      const buffer = Buffer.from(img.data, 'base64');
      fullText += (await recognizeBest(worker, buffer)) + '\n';
    }

    const extracted = parseOcrText(fullText);

    if (extracted.tipoDocumento === 'sconosciuto' && !extracted.codiceFiscale) {
      return res.json({
        available: true,
        extracted: null,
        error: 'Documento non riconosciuto: prova con una foto più nitida e dritta, oppure inserisci i dati a mano',
      });
    }

    const crossCheck = crossCheckDocument(extracted);
    return res.json({ available: true, extracted, crossCheck });
  } catch (error: any) {
    console.warn('⚠️ Document OCR fallito:', error?.message || error);
    return res.status(502).json({
      error: 'Il riconoscimento non è riuscito: riprova o inserisci i dati a mano',
    });
  }
});

export default router;
