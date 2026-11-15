/**
 * Area Cliente — /api/client-area
 *
 *  POST /login/request   { email }         → invia un codice di 6 cifre (pubblico)
 *  POST /login/verify    { email, code }   → restituisce un custom token Firebase (pubblico)
 *  GET  /me                                → lavori, gallerie, prenotazioni, IBAN (cliente)
 *  GET  /prefill?jobId=…                   → dati del cliente per precompilare una prenotazione (cliente)
 *  GET  /admin/settings                    → impostazioni area cliente (admin)
 *  PUT  /admin/settings                    → salva IBAN, intestatario, banca, causale, benvenuto automatico (admin)
 *  POST /admin/welcome/job/:jobId          → benvenuto ai clienti del lavoro non ancora invitati (admin)
 *  POST /admin/welcome/cliente/:clienteId  → invia (o reinvia) il benvenuto a un cliente (admin)
 *
 * Sicurezza:
 *  - il cliente entra con un uid dedicato (`ca_…`) creato dal custom token:
 *    gli account esistenti (compreso l'admin) non vengono mai toccati;
 *  - /me accetta solo sessioni nate da questo flusso (claim `clientArea`) e usa
 *    l'email verificata col codice (claim `caEmail`), non quella dell'account;
 *  - l'email dell'admin non può usare l'area cliente;
 *  - la risposta a /login/request è identica che l'email sia in archivio o no.
 */
import { Router, type Request, type Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { db, FieldValue } from './firebase-admin';
import { authenticateFirebase, getSiteBaseUrl, getStudioContactInfo, sendGmailEmail } from './email-routes.js';
import { isAdminEmail } from './admin-security/admin-identity.js';
import { requireAdmin } from './admin-security/admin-guard.js';
import { safeErrorMessage } from './utils/safe-logging.js';
import {
  isValidEmail, isValidIban, normalizeClientEmail, normalizeIban, type ClientAreaSettings,
} from '@shared/client-area';
import {
  MAX_ATTEMPTS, clientAreaUid, emailKey, generateCode, prepareSend, verifyCode, type LoginCodeRecord,
} from './client-area/login-code.js';
import { findClientRecords, loadClientAreaOverview } from './client-area/overview.js';
import { escapeHtml } from './client-area/emails.js';
import { jobClienteIds, sendClientAreaWelcome, type WelcomeOutcome } from './client-area/welcome.js';

const router = Router();
const CODES = 'clientAreaLoginCodes';
const SETTINGS_DOC = () => db.collection('clientAreaSettings').doc('main');

// Limite per IP in memoria, in aggiunta al limite per email salvato su Firestore.
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX = 20;
const ipHits = new Map<string, { start: number; count: number }>();
function ipLimited(req: Request): boolean {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now - entry.start > IP_WINDOW_MS) {
    ipHits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > IP_MAX;
}

const GENERIC_SENT = {
  success: true,
  message: "Se l'email è collegata a un nostro servizio, riceverai a breve un codice di accesso.",
};


function codeEmailHtml(studioName: string, nome: string, code: string): string {
  const name = escapeHtml(studioName);
  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 0;"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#6b7f6b;padding:28px 32px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:normal;letter-spacing:1px;">${name}</h1>
      </td></tr>
      <tr><td style="padding:40px 32px;text-align:center;">
        <p style="margin:0 0 8px;color:#555;font-size:15px;">Ciao ${escapeHtml(nome)}! Ecco il codice per entrare nella tua area personale:</p>
        <div style="margin:28px auto;display:inline-block;background:#f5f0e8;border:2px dashed #6b7f6b;border-radius:12px;padding:20px 40px;">
          <span style="font-size:40px;font-weight:bold;letter-spacing:10px;color:#3d4f3d;">${code}</span>
        </div>
        <p style="margin:12px 0 0;color:#888;font-size:13px;">Il codice è valido per <strong>10 minuti</strong>.</p>
        <p style="margin:8px 0 0;color:#aaa;font-size:12px;">Se non hai richiesto tu questo codice, ignora questa email.</p>
      </td></tr>
      <tr><td style="background:#f9f6f1;padding:20px 32px;text-align:center;">
        <p style="margin:0;color:#aaa;font-size:11px;">${name} · Area cliente</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

router.post('/login/request', async (req: Request, res: Response) => {
  try {
    const email = normalizeClientEmail(req.body?.email);
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Inserisci un indirizzo email valido.' });
    if (ipLimited(req)) return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
    if (isAdminEmail(email)) return res.json(GENERIC_SENT);

    const clienti = await findClientRecords(db, email);
    if (clienti.length === 0) return res.json(GENERIC_SENT);

    const ref = db.collection(CODES).doc(emailKey(email));
    const code = generateCode();
    const decision = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const result = prepareSend(snap.exists ? snap.data() as LoginCodeRecord : null, email, code, Date.now());
      if (result.allowed) tx.set(ref, result.record);
      return result;
    });
    if (!decision.allowed) {
      return res.status(429).json({ error: 'Hai richiesto troppi codici. Attendi qualche minuto e riprova.' });
    }

    const studio = await getStudioContactInfo().catch(() => null);
    const studioName = studio?.name || 'Image Studio';
    const nome = typeof clienti[0].data.nome === 'string' ? clienti[0].data.nome : '';
    await sendGmailEmail([email], `${code} - Il tuo codice di accesso ${studioName}`, codeEmailHtml(studioName, nome, code));
    return res.json(GENERIC_SENT);
  } catch (error) {
    console.error('❌ Area cliente: invio codice non riuscito:', safeErrorMessage(error));
    return res.status(500).json({ error: "Impossibile inviare l'email. Riprova tra qualche secondo." });
  }
});

router.post('/login/verify', async (req: Request, res: Response) => {
  try {
    const email = normalizeClientEmail(req.body?.email);
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!isValidEmail(email) || !/^\s*\d{6}\s*$/.test(code)) {
      return res.status(400).json({ error: 'Inserisci il codice di 6 cifre ricevuto via email.' });
    }
    if (ipLimited(req)) return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
    if (isAdminEmail(email)) return res.status(400).json({ error: 'Codice scaduto o non valido. Richiedine uno nuovo.' });

    const ref = db.collection(CODES).doc(emailKey(email));
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const record = snap.exists ? snap.data() as LoginCodeRecord : null;
      const outcome = verifyCode(record, email, code, Date.now());
      if (outcome.ok) tx.delete(ref);
      else if (outcome.reason === 'wrong_code') tx.update(ref, { attempts: FieldValue.increment(1) });
      else if (snap.exists) tx.delete(ref);
      return outcome;
    });

    if (!result.ok) {
      const message = result.reason === 'wrong_code'
        ? (result.attemptsLeft > 0
          ? `Codice errato. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'tentativo rimasto' : 'tentativi rimasti'}.`
          : 'Codice errato. Richiedine uno nuovo.')
        : result.reason === 'too_many_attempts'
          ? `Troppi tentativi errati (${MAX_ATTEMPTS}). Richiedine uno nuovo.`
          : 'Codice scaduto o non valido. Richiedine uno nuovo.';
      return res.status(400).json({ error: message, ...(result.reason === 'wrong_code' ? { attemptsLeft: result.attemptsLeft } : {}) });
    }

    const uid = clientAreaUid(email);
    await linkClientRecords(email, uid);
    const customToken = await getAuth().createCustomToken(uid, { clientArea: true, caEmail: email });
    return res.json({ success: true, customToken });
  } catch (error) {
    console.error('❌ Area cliente: verifica codice non riuscita:', safeErrorMessage(error));
    return res.status(500).json({ error: 'Errore del server. Riprova.' });
  }
});

/** Collega l'uid dell'area cliente alle schede con quell'email e registra l'accesso. */
async function linkClientRecords(email: string, uid: string): Promise<void> {
  const clienti = await findClientRecords(db, email);
  await Promise.all(clienti.map(cliente => {
    const update: Record<string, unknown> = {
      'sourceRefs.userIds': FieldValue.arrayUnion(uid),
      'clientArea.lastLoginAt': FieldValue.serverTimestamp(),
    };
    if (!cliente.data.clientArea?.activatedAt) update['clientArea.activatedAt'] = FieldValue.serverTimestamp();
    return db.collection('clienti').doc(cliente.id).update(update);
  }));
}

function requireClientAreaSession(req: any, res: Response, next: () => void) {
  const claims = req.user?.claims || {};
  const email = normalizeClientEmail(claims.caEmail);
  if (claims.clientArea !== true || !isValidEmail(email) || isAdminEmail(email)) {
    return res.status(403).json({ error: "Accedi all'area cliente con il codice ricevuto via email.", code: 'client_area_only' });
  }
  req.clientArea = { email, uid: req.user.uid };
  return next();
}

router.get('/me', authenticateFirebase, requireClientAreaSession, async (req: any, res: Response) => {
  try {
    const overview = await loadClientAreaOverview(db, req.clientArea);
    res.set('Cache-Control', 'no-store');
    return res.json(overview);
  } catch (error) {
    console.error('❌ Area cliente: caricamento dati non riuscito:', safeErrorMessage(error));
    return res.status(500).json({ error: 'Impossibile caricare i tuoi dati. Riprova tra poco.' });
  }
});

/**
 * Dati del cliente collegato per precompilare la pagina di prenotazione.
 * Con `jobId` restituisce la scheda del cliente collegata a quel lavoro e
 * rifiuta lavori che non sono suoi.
 */
router.get('/prefill', authenticateFirebase, requireClientAreaSession, async (req: any, res: Response) => {
  try {
    const { email, uid } = req.clientArea as { email: string; uid: string };
    const clienti = await findClientRecords(db, email, uid);
    if (clienti.length === 0) return res.status(404).json({ error: 'Scheda cliente non trovata' });
    let cliente = clienti[0];
    const jobId = typeof req.query.jobId === 'string' ? req.query.jobId.trim() : '';
    if (jobId) {
      const job = await db.collection('jobs').doc(jobId).get();
      const jobClients = job.exists ? jobClienteIds(job.data() || {}) : [];
      const match = clienti.find(c => jobClients.includes(c.id));
      if (!match || job.data()?.deletedAt) return res.status(403).json({ error: 'Questo lavoro non è collegato alla tua area.' });
      cliente = match;
    }
    const data = cliente.data;
    res.set('Cache-Control', 'no-store');
    return res.json({
      cliente: {
        nome: typeof data.nome === 'string' ? data.nome : '',
        cognome: typeof data.cognome === 'string' ? data.cognome : '',
        email,
        whatsapp: data.whatsapp || data.cellulare1 || data.cellulare || '',
      },
      jobId: jobId || null,
    });
  } catch (error) {
    console.error('❌ Area cliente: precompilazione non riuscita:', safeErrorMessage(error));
    return res.status(500).json({ error: 'Impossibile recuperare i tuoi dati.' });
  }
});

router.get('/admin/settings', authenticateFirebase, requireAdmin, async (_req: Request, res: Response) => {
  const snap = await SETTINGS_DOC().get();
  const data = (snap.exists ? snap.data() : {}) as ClientAreaSettings;
  return res.json({
    iban: data.iban || '',
    intestatario: data.intestatario || '',
    banca: data.banca || '',
    causale: data.causale || '',
    welcomeAuto: data.welcomeAuto !== false,
  });
});

router.put('/admin/settings', authenticateFirebase, requireAdmin, async (req: Request, res: Response) => {
  const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const iban = normalizeIban(req.body?.iban);
  const intestatario = clean(req.body?.intestatario, 120);
  if (iban && !isValidIban(iban)) return res.status(400).json({ error: 'IBAN non valido: controlla le cifre.' });
  if (iban && !intestatario) return res.status(400).json({ error: "Indica l'intestatario del conto." });
  const settings: ClientAreaSettings = {
    iban,
    intestatario,
    banca: clean(req.body?.banca, 120),
    causale: clean(req.body?.causale, 200),
    welcomeAuto: req.body?.welcomeAuto !== false,
  };
  await SETTINGS_DOC().set({ ...settings, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return res.json({ success: true, ...settings });
});

async function welcomeDeps(req?: Request) {
  const studio = await getStudioContactInfo().catch(() => null);
  return {
    baseUrl: getSiteBaseUrl(req as any),
    studioName: studio?.name || 'Image Studio',
    send: (to: string, subject: string, html: string) => sendGmailEmail([to], subject, html),
    isExcludedEmail: (email: string) => isAdminEmail(email),
  };
}

/**
 * Benvenuto automatico ai clienti di un lavoro: una volta per cliente, solo se
 * l'opzione è attiva nelle impostazioni. Usato dal pannello dopo la creazione
 * del lavoro o l'aggiunta di clienti, e dalla conversione di una consulenza.
 */
export async function welcomeClientsOfJob(jobId: string, req?: Request): Promise<WelcomeOutcome[] | 'disabled' | 'not_found'> {
  const settings = await SETTINGS_DOC().get();
  if (settings.exists && settings.data()?.welcomeAuto === false) return 'disabled';
  const job = await db.collection('jobs').doc(jobId).get();
  if (!job.exists || job.data()?.deletedAt) return 'not_found';
  const data = job.data() || {};
  return sendClientAreaWelcome(db, jobClienteIds(data), await welcomeDeps(req), {
    nomeEvento: typeof data.nomeEvento === 'string' ? data.nomeEvento : undefined,
  });
}

router.post('/admin/welcome/job/:jobId', authenticateFirebase, requireAdmin, async (req: Request, res: Response) => {
  try {
    const outcome = await welcomeClientsOfJob(String(req.params.jobId), req);
    if (outcome === 'not_found') return res.status(404).json({ error: 'Lavoro non trovato' });
    if (outcome === 'disabled') return res.json({ disabled: true, outcomes: [] });
    return res.json({ disabled: false, outcomes: outcome });
  } catch (error) {
    console.error('❌ Area cliente: benvenuto non inviato:', safeErrorMessage(error));
    return res.status(500).json({ error: "Impossibile inviare l'email di benvenuto." });
  }
});

router.post('/admin/welcome/cliente/:clienteId', authenticateFirebase, requireAdmin, async (req: Request, res: Response) => {
  try {
    const [outcome] = await sendClientAreaWelcome(db, [String(req.params.clienteId)], await welcomeDeps(req), { force: true });
    if (outcome.result === 'sent') return res.json({ success: true });
    const message = outcome.result === 'error' ? "Invio dell'email non riuscito. Riprova."
      : outcome.reason === 'no_email' ? 'Il cliente non ha un indirizzo email valido.'
        : outcome.reason === 'not_found' ? 'Cliente non trovato.'
          : 'Questo indirizzo non può ricevere inviti all’area cliente.';
    return res.status(outcome.result === 'error' ? 502 : 400).json({ error: message });
  } catch (error) {
    console.error('❌ Area cliente: invito manuale non inviato:', safeErrorMessage(error));
    return res.status(500).json({ error: "Impossibile inviare l'invito." });
  }
});

export default router;
