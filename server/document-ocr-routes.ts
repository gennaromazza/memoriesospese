/**
 * Document OCR Routes — estrazione dati da tessera sanitaria / CIE
 *
 * L'immagine viene inviata a un modello AI vision (OpenAI) SOLO per
 * l'estrazione: non viene mai salvata su disco, storage o database.
 * Se la chiave OPENAI_API_KEY manca, l'endpoint risponde { available: false }
 * e il form degrada all'inserimento manuale.
 */
import { Router, json } from 'express';
import { authenticateFirebase } from './email-routes.js';
import { crossCheckDocument, type ExtractedDocumentData } from '../shared/document-ocr.js';

const router = Router();

// Solo l'admin dello studio può usare la scansione (dati sensibili + costi API)
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

function requireAdmin(req: any, res: any, next: any) {
  if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
    return res.status(403).json({ error: 'Accesso negato: solo admin' });
  }
  next();
}

// Le foto dei documenti (già ridimensionate lato client) restano sotto i 10 MB
router.use(json({ limit: '10mb' }));

function getApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY || undefined;
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGES = 2; // CIE fronte/retro
const MAX_BASE64_LEN = 8 * 1024 * 1024; // ~6 MB di immagine reale

const EXTRACTION_PROMPT = `Sei un assistente OCR per documenti d'identità italiani.
Analizza le immagini (tessera sanitaria/codice fiscale oppure carta d'identità elettronica CIE, fronte e/o retro) ed estrai i dati in JSON.

Rispondi SOLO con un oggetto JSON con questi campi (ometti i campi non leggibili):
{
  "tipoDocumento": "tessera_sanitaria" | "cie" | "sconosciuto",
  "codiceFiscale": "16 caratteri maiuscoli",
  "nome": "...",
  "cognome": "...",
  "sesso": "M" | "F",
  "dataNascita": "YYYY-MM-DD",
  "luogoNascita": "comune di nascita",
  "numeroDocumento": "solo per CIE",
  "scadenza": "YYYY-MM-DD, solo per CIE"
}

Regole:
- Trascrivi ESATTAMENTE ciò che leggi, senza inventare o completare dati illeggibili.
- Se l'immagine non è un documento d'identità italiano riconoscibile, rispondi {"tipoDocumento":"sconosciuto"}.
- Il codice fiscale è composto da 16 caratteri alfanumerici: fai attenzione a 0/O, 1/I, 5/S, 8/B.`;

/**
 * POST /api/document-ocr/scan
 * body: { images: [{ data: base64 (senza prefisso), mimeType }] } (max 2)
 * Ritorna { available, extracted?, crossCheck?, error? }
 */
router.post('/scan', authenticateFirebase, requireAdmin, async (req: any, res) => {
  const apiKey = getApiKey();
  if (!apiKey) return res.json({ available: false });

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: EXTRACTION_PROMPT },
              ...images.map((img: any) => ({
                type: 'image_url',
                image_url: { url: `data:${img.mimeType};base64,${img.data}`, detail: 'high' },
              })),
            ],
          },
        ],
      }),
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`⚠️ Document OCR errore OpenAI ${response.status}: ${errText.slice(0, 300)}`);
      const noCredits = errText.includes('insufficient_quota') || errText.includes('credit_balance_exhausted');
      return res.status(502).json({
        error: noCredits
          ? 'Il credito OpenAI è esaurito: ricarica su platform.openai.com per usare la scansione'
          : 'Il servizio di riconoscimento non è al momento disponibile',
      });
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('⚠️ Document OCR: risposta non JSON dal modello');
      return res.status(502).json({ error: 'Risposta del riconoscimento non interpretabile, riprova' });
    }

    const extracted: ExtractedDocumentData = {
      tipoDocumento: ['tessera_sanitaria', 'cie'].includes(parsed.tipoDocumento)
        ? parsed.tipoDocumento
        : 'sconosciuto',
      codiceFiscale: cleanStr(parsed.codiceFiscale, 20)?.toUpperCase().replace(/\s/g, ''),
      nome: cleanStr(parsed.nome, 100),
      cognome: cleanStr(parsed.cognome, 100),
      sesso: parsed.sesso === 'M' || parsed.sesso === 'F' ? parsed.sesso : undefined,
      dataNascita: cleanDate(parsed.dataNascita),
      luogoNascita: cleanStr(parsed.luogoNascita, 100),
      numeroDocumento: cleanStr(parsed.numeroDocumento, 30),
      scadenza: cleanDate(parsed.scadenza),
    };

    if (extracted.tipoDocumento === 'sconosciuto' && !extracted.codiceFiscale) {
      return res.json({
        available: true,
        extracted: null,
        error: 'Documento non riconosciuto: prova con una foto più nitida o inserisci i dati a mano',
      });
    }

    const crossCheck = crossCheckDocument(extracted);
    return res.json({ available: true, extracted, crossCheck });
  } catch (error: any) {
    const isTimeout = error?.name === 'AbortError';
    console.warn('⚠️ Document OCR non raggiungibile:', error?.message || error);
    return res.status(502).json({
      error: isTimeout
        ? 'Il riconoscimento sta impiegando troppo tempo, riprova'
        : 'Il servizio di riconoscimento non è al momento disponibile',
    });
  }
});

function cleanStr(v: unknown, maxLen: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t && t.length <= maxLen ? t : undefined;
}

function cleanDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : undefined;
}

export default router;
