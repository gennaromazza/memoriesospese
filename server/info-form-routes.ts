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
import type { InfoFormSubmission } from '../shared/info-form-types.js';

const router: Router = express.Router();

const SUBMISSIONS_COL = 'infoFormSubmissions';
const NOTIFICATIONS_COL = 'infoFormNotifications';

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
    const { answers } = req.body || {};

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

    return res.json({ ok: true });
  } catch (error) {
    console.error('[info-forms] Errore submit:', error);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

export default router;
