/**
 * Gallery Routes (non-admin, gallery-scoped)
 *
 * Endpoint accessibili agli utenti autenticati che hanno una relazione con la
 * galleria (es. ospiti che hanno appena caricato le proprie foto), oltre che agli
 * admin. Servono per innescare lato server (Firebase Admin SDK) operazioni che
 * dal client non sarebbero affidabili in produzione (es. generazione miniature,
 * vedi server/thumbnails.ts).
 */

import express from 'express';
import { db } from './firebase-admin.js';
import { authenticateFirebase } from './email-routes.js';
import { generateGalleryThumbnails } from './thumbnails.js';

const router = express.Router();

const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

/**
 * POST /api/galleries/:galleryId/generate-thumbnails
 * Genera le miniature mancanti per una galleria (lato server, admin SDK).
 *
 * Autorizzazione gallery-scoped: consentito agli admin OPPURE agli utenti che
 * hanno caricato almeno una foto in questa galleria (tipicamente un ospite subito
 * dopo il proprio upload). Questo evita di esporre un endpoint "aperto" a qualsiasi
 * utente autenticato su galleryId arbitrari (abuso di calcolo / enumerazione).
 *
 * Body: { limit?: number }. Idempotente: rigenera solo le foto senza thumbnailUrl.
 * Ritorna: { success, totalMissing, processed, generated, failed, remaining }.
 * Il client cicla finché remaining === 0 (o generated === 0).
 */
router.post('/:galleryId/generate-thumbnails', authenticateFirebase, async (req: any, res) => {
  try {
    const { galleryId } = req.params;
    if (!galleryId) {
      return res.status(400).json({ error: 'galleryId mancante' });
    }

    const email = req.user?.email || '';
    const uid = req.user?.uid || '';
    const isAdmin = ADMIN_EMAILS.includes(email);

    if (!isAdmin) {
      // L'utente deve aver caricato almeno una foto in questa galleria.
      // Query a sole uguaglianze: non richiede un indice composito (importante,
      // qui non possiamo fare deploy di nuovi indici Firestore).
      if (!uid) {
        return res.status(403).json({ error: 'Accesso negato a questa galleria' });
      }
      const own = await db.collection('photos')
        .where('galleryId', '==', galleryId)
        .where('uploaderUid', '==', uid)
        .limit(1)
        .get();
      if (own.empty) {
        return res.status(403).json({ error: 'Accesso negato a questa galleria' });
      }
    }

    const limit = Number(req.body?.limit) || undefined;
    const result = await generateGalleryThumbnails(galleryId, limit as number);

    console.log(
      `🖼️  [gallery-scoped] Thumbnails galleria ${galleryId} ` +
      `(${isAdmin ? 'admin' : 'guest'} ${email || uid}): ` +
      `${result.generated} generate, ${result.failed} fallite, ${result.remaining} rimanenti`
    );

    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error(`❌ Errore generazione miniature (gallery-scoped) ${req.params.galleryId}:`, error);
    res.status(500).json({ error: 'Errore durante la generazione delle miniature', details: error.message });
  }
});

export default router;
