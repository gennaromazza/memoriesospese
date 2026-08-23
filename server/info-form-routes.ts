/**
 * Info Form Routes — endpoint pubblici per i Moduli Informativi.
 *
 * I client non sono autenticati: ricevono il link via email e accedono
 * solo tramite il token UUID. Le Firestore Security Rules NON consentono
 * a un utente non autenticato di leggere `infoFormSubmissions` (per evitare
 * di esporre l'intera collezione), quindi qui usiamo l'admin SDK per:
 *   - cercare la submission tramite token
 *   - validare token + completare la submission
 *   - creare la notifica admin
 */

import express, { Request, Response, Router } from 'express';
import { db, FieldValue } from './firebase-admin.js';
import type { InfoFormSubmission, InfoFormField } from '../shared/info-form-types.js';
import { sendGmailEmail } from './email-routes.js';

const router: Router = express.Router();

const SUBMISSIONS_COL = 'infoFormSubmissions';
const NOTIFICATIONS_COL = 'infoFormNotifications';
const ADMIN_EMAIL = 'gennaro.mazzacane@gmail.com';

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '<em style="color:#888;">—</em>';
  if (Array.isArray(value)) return escapeHtml(value.join(', '));
  if (typeof value === 'boolean') return value ? 'Sì' : 'No';
  return escapeHtml(value);
}

function buildAdminEmailHtml(params: {
  clientName: string;
  clientEmail: string;
  templateName: string;
  jobId: string;
  templateFields: InfoFormField[];
  answers: Record<string, any>;
  siteUrl: string;
}): string {
  const { clientName, clientEmail, templateName, jobId, templateFields, answers, siteUrl } = params;

  const seen = new Set<string>();
  const rows: string[] = [];

  for (const f of templateFields) {
    seen.add(f.id);
    rows.push(`
      <div style="background:#faf8f5; border-left:4px solid #8b9a7d; padding:14px 16px; margin:0 0 12px; border-radius:6px;">
        <p style="margin:0 0 6px; font-weight:600; color:#6b7d8a; font-size:13px;">${escapeHtml(f.label)}</p>
        <p style="margin:0; color:#333; font-size:15px;">${formatAnswerValue(answers[f.id])}</p>
      </div>
    `);
  }
  for (const [k, v] of Object.entries(answers)) {
    if (seen.has(k)) continue;
    rows.push(`
      <div style="background:#faf8f5; border-left:4px solid #c0a080; padding:14px 16px; margin:0 0 12px; border-radius:6px;">
        <p style="margin:0 0 6px; font-weight:600; color:#6b7d8a; font-size:13px;">${escapeHtml(k)}</p>
        <p style="margin:0; color:#333; font-size:15px;">${formatAnswerValue(v)}</p>
      </div>
    `);
  }

  const deepLink = `${siteUrl}/admin/jobs/${jobId}?tab=moduli`;

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f4f1ec; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:620px; margin:0 auto; padding:24px;">
    <div style="background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="background:#8b9a7d; color:#fff; padding:20px 24px;">
        <h1 style="margin:0; font-size:20px;">Modulo informativo compilato</h1>
        <p style="margin:6px 0 0; opacity:0.9; font-size:14px;">${escapeHtml(templateName)}</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px; color:#333;">
          <strong>${escapeHtml(clientName)}</strong>${clientEmail ? ` (<a href="mailto:${escapeHtml(clientEmail)}" style="color:#8b9a7d;">${escapeHtml(clientEmail)}</a>)` : ''} ha appena inviato le risposte al modulo.
        </p>
        <div style="margin:20px 0;">
          ${rows.join('\n') || '<p style="color:#888;">Nessuna risposta presente.</p>'}
        </div>
        <div style="text-align:center; margin-top:24px;">
          <a href="${deepLink}" style="display:inline-block; background:#8b9a7d; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:600;">Apri il job nella dashboard</a>
        </div>
      </div>
      <div style="background:#f4f1ec; padding:14px 24px; font-size:12px; color:#888; text-align:center;">
        Image Studio Fotografico — notifica automatica
      </div>
    </div>
  </div>
</body></html>`;
}

/**
 * GET /api/info-forms/by-token/:token
 * Ritorna la submission corrispondente al token, accessibile pubblicamente.
 * Espone solo i campi necessari alla compilazione (no campi admin sensibili).
 */
router.get('/by-token/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token || typeof token !== 'string' || token.length < 8) {
      return res.status(400).json({ error: 'Token non valido' });
    }

    const snap = await db
      .collection(SUBMISSIONS_COL)
      .where('token', '==', token)
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ error: 'Modulo non trovato' });
    }

    const docSnap = snap.docs[0];
    const data = docSnap.data() as Partial<InfoFormSubmission>;

    // Serializza Timestamp per JSON
    const sentAt =
      data.sentAt && typeof (data.sentAt as any).toDate === 'function'
        ? (data.sentAt as any).toDate().toISOString()
        : null;
    const completedAt =
      data.completedAt && typeof (data.completedAt as any).toDate === 'function'
        ? (data.completedAt as any).toDate().toISOString()
        : null;

    return res.json({
      id: docSnap.id,
      jobId: data.jobId,
      templateId: data.templateId,
      templateName: data.templateName,
      templateFields: data.templateFields || [],
      token: data.token,
      clientName: data.clientName,
      clientEmail: data.clientEmail,
      status: data.status || 'pending',
      answers: data.answers || {},
      editorialConsent: data.editorialConsent === true,
      sentAt,
      completedAt,
    });
  } catch (error) {
    console.error('[info-forms] Errore by-token:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

/**
 * POST /api/info-forms/by-token/:token/submit
 * Completa la submission identificata dal token con le risposte fornite,
 * crea la notifica admin. Idempotente lato cliente: se già completata
 * ritorna 200 senza ricreare notifica duplicata.
 */
router.post('/by-token/:token/submit', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { answers, editorialConsent } = req.body || {};

    if (!token || typeof token !== 'string' || token.length < 8) {
      return res.status(400).json({ error: 'Token non valido' });
    }
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ error: 'Risposte non valide' });
    }

    const snap = await db
      .collection(SUBMISSIONS_COL)
      .where('token', '==', token)
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ error: 'Modulo non trovato' });
    }

    const docSnap = snap.docs[0];
    const data = docSnap.data() as Partial<InfoFormSubmission>;

    if (data.status === 'completed') {
      return res.json({ ok: true, alreadyCompleted: true });
    }

    await docSnap.ref.update({
      answers,
      // Consenso separato, esplicito e false per impostazione predefinita.
      editorialConsent: editorialConsent === true,
      editorialConsentAt: editorialConsent === true ? FieldValue.serverTimestamp() : null,
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
    });

    await db.collection(NOTIFICATIONS_COL).add({
      submissionId: docSnap.id,
      jobId: data.jobId,
      clientName: data.clientName,
      templateName: data.templateName,
      createdAt: FieldValue.serverTimestamp(),
      isRead: false,
      deepLink: `/admin/jobs/${data.jobId}?tab=moduli`,
    });

    // Sincronizza i profili Instagram dei clienti dai campi di tipo "instagram".
    // clientTarget client1/client2 → primo/secondo cliente del job (job.clientiIds);
    // in mancanza di clientTarget si usa il cliente destinatario del modulo
    // (submission.clienteId). L'handle viene normalizzato a username puro (senza @,
    // gestendo anche URL instagram.com). Non bloccante: un errore qui non deve
    // impedire la conferma di invio al cliente.
    try {
      const fields: InfoFormField[] = Array.isArray(data.templateFields) ? data.templateFields : [];
      const instagramFields = fields.filter((f) => f && f.type === 'instagram');
      if (instagramFields.length > 0) {
        const normalizeInstagramHandle = (raw: any): string => {
          let v = String(raw || '').trim();
          if (!v) return '';
          const urlMatch = v.match(/instagram\.com\/([^/?#\s]+)/i);
          if (urlMatch) v = urlMatch[1];
          return v.replace(/^@+/, '').replace(/\/+$/, '').trim();
        };

        // Carica i clientiIds del job solo se almeno un campo usa client1/client2.
        let jobClientiIds: string[] = [];
        const needsJobClients = instagramFields.some((f) => !!f.clientTarget);
        if (needsJobClients && data.jobId) {
          try {
            const jobDoc = await db.collection('jobs').doc(data.jobId).get();
            const jobData = jobDoc.exists ? jobDoc.data() : undefined;
            if (jobData && Array.isArray(jobData.clientiIds)) {
              jobClientiIds = jobData.clientiIds as string[];
            }
          } catch (jobErr) {
            console.error('[info-forms] Errore lettura job per sync Instagram:', jobErr);
          }
        }

        // Username Instagram: lettere/numeri/punto/underscore, max 30 caratteri.
        const isValidInstagramHandle = (h: string): boolean => /^[A-Za-z0-9._]{1,30}$/.test(h);

        for (const f of instagramFields) {
          // try/catch per-campo: il fallimento di un singolo update non deve
          // impedire la sincronizzazione degli altri campi Instagram.
          try {
            const handle = normalizeInstagramHandle((answers as Record<string, any>)[f.id]);
            if (!handle) continue;
            if (!isValidInstagramHandle(handle)) {
              console.log(
                `ℹ️ [info-forms] Instagram ignorato (campo ${f.id}): handle non valido "${handle}"`,
              );
              continue;
            }
            const targetId =
              f.clientTarget === 'client1'
                ? jobClientiIds[0]
                : f.clientTarget === 'client2'
                  ? jobClientiIds[1]
                  : data.clienteId || undefined;
            if (!targetId) {
              console.log(
                `ℹ️ [info-forms] Instagram non sincronizzato (campo ${f.id}): cliente target assente (clientTarget=${f.clientTarget || 'destinatario'})`,
              );
              continue;
            }
            await db.collection('clienti').doc(targetId).update({
              instagram: handle,
              updatedAt: FieldValue.serverTimestamp(),
            });
            console.log(`✅ [info-forms] Instagram → cliente ${targetId}: @${handle}`);
          } catch (perFieldErr) {
            console.error(`[info-forms] Errore sync Instagram campo ${f.id} (ignorato):`, perFieldErr);
          }
        }
      }
    } catch (instaErr) {
      console.warn('⚠️ [info-forms] Sync Instagram da modulo fallito (non bloccante):', instaErr);
    }

    // Notifica admin via email — fire-and-forget: NON attendiamo Gmail per non
    // bloccare la risposta HTTP al client. L'errore viene loggato; la notifica
    // in-app è già stata creata sopra, quindi l'admin vede comunque l'evento.
    try {
      const siteUrl =
        process.env.SITE_URL ||
        process.env.PUBLIC_SITE_URL ||
        'https://imagestudiofotografico.com';
      const clientName = data.clientName || 'Cliente';
      const templateName = data.templateName || 'Modulo informativo';
      const html = buildAdminEmailHtml({
        clientName,
        clientEmail: data.clientEmail || '',
        templateName,
        jobId: data.jobId || '',
        templateFields: data.templateFields || [],
        answers: answers as Record<string, any>,
        siteUrl,
      });
      void sendGmailEmail(
        ADMIN_EMAIL,
        `📋 Modulo compilato: ${templateName} — ${clientName}`,
        html,
        undefined,
        {
          type: 'info_form_submission',
          relatedDocId: docSnap.id,
          relatedDocType: 'infoFormSubmission',
          clientName,
        },
      ).catch((emailError) => {
        console.error('[info-forms] Errore invio email admin (notifica creata comunque):', emailError);
      });
    } catch (emailError) {
      console.error('[info-forms] Errore preparazione email admin:', emailError);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('[info-forms] Errore submit:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

export default router;
