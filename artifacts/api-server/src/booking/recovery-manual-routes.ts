import { Router, type RequestHandler } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { RecoveryDependencies } from './recovery-delivery.js';
import {
  deliverBookingRecovery,
  inspectManualBookingRecovery,
  queueManualBookingRecovery,
} from './recovery-delivery.js';
import { CHECKOUT_HOLDS } from './slot-reservations.js';

const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);

export function bookingManualRecoveryRouter(
  db: Firestore,
  authenticate: RequestHandler,
  requireAdmin: RequestHandler,
  dependencies: Partial<RecoveryDependencies> = {},
  allowRealDelivery = process.env.NODE_ENV === 'production',
) {
  const router = Router();
  router.post('/admin/recovery/preview', authenticate, requireAdmin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const campaignId = req.body?.campaignId;
    if (!validId(campaignId)) {
      res.status(400).json({ error: 'Seleziona una campagna valida.' });
      return;
    }
    try {
      const [bookings, holds] = await Promise.all([
        db.collection('bookings').where('campaignId', '==', campaignId).limit(1001).get(),
        db.collection(CHECKOUT_HOLDS).where('campaignId', '==', campaignId).limit(1001).get(),
      ]);
      if (bookings.size > 1000 || holds.size > 1000) {
        res.status(413).json({ error: 'La campagna contiene troppi record per un’anteprima sicura.' });
        return;
      }
      const ids = new Set([...bookings.docs, ...holds.docs].map(doc => doc.id));
      const candidates = await Promise.all([...ids].sort().map(id => inspectManualBookingRecovery(db, id, campaignId)));
      const seenEmails = new Set<string>();
      const uniqueCandidates = candidates.map(candidate => {
        const email = candidate.email?.trim().toLowerCase();
        if (!candidate.eligible || !email) return candidate;
        if (seenEmails.has(email)) return { ...candidate, eligible: false, reason: 'destinatario_duplicato_nella_selezione' };
        seenEmails.add(email);
        return candidate;
      });
      res.json({
        campaignId,
        eligible: uniqueCandidates.filter(candidate => candidate.eligible),
        excluded: uniqueCandidates.filter(candidate => !candidate.eligible),
      });
    } catch {
      res.status(503).json({ error: 'Non è stato possibile verificare le prenotazioni scadute.' });
    }
  });

  router.post('/admin/recovery/send', authenticate, requireAdmin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!allowRealDelivery) {
      res.status(403).json({ error: 'L’invio manuale è disponibile solo nell’ambiente di produzione.' });
      return;
    }
    const campaignId = req.body?.campaignId;
    const bookingIds = req.body?.bookingIds;
    if (!validId(campaignId) || !Array.isArray(bookingIds) || bookingIds.length < 1 || bookingIds.length > 100
      || bookingIds.some(id => !validId(id)) || new Set(bookingIds).size !== bookingIds.length) {
      res.status(400).json({ error: 'Selezione destinatari non valida.' });
      return;
    }
    const adminId = (req as any).user?.uid || (req as any).user?.email || 'admin';
    const outcomes = [];
    for (const bookingId of bookingIds as string[]) {
      try {
        const queued = await queueManualBookingRecovery(db, bookingId, campaignId, adminId);
        if (!queued.queued) {
          outcomes.push({ bookingId, status: 'skipped', reason: queued.reason });
          continue;
        }
        await deliverBookingRecovery(db, bookingId, dependencies);
        const job = (await db.collection('bookingRecoveryJobs').doc(bookingId).get()).data();
        outcomes.push({ bookingId, status: job?.status || 'unknown', ...(job?.reason ? { reason: job.reason } : {}) });
      } catch {
        let status = 'unknown';
        try { status = (await db.collection('bookingRecoveryJobs').doc(bookingId).get()).data()?.status || status; }
        catch { /* The persisted job remains the source for checking an uncertain result. */ }
        outcomes.push({ bookingId, status, reason: 'esito_da_verificare' });
      }
    }
    res.json({ outcomes });
  });
  return router;
}
