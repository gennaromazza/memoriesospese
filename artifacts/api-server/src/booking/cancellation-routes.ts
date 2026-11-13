import { Router, type RequestHandler } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { GetAdminBookingCancellationResponse, ManageAdminBookingCancellationBody, CancelManagedBookingBody, CancelManagedBookingResponse } from '@workspace/api-zod';
import { BookingManagementError, authorizeBookingManagement } from './management-access.js';
import { bookingManagementView } from './management-summary.js';
import { requestBookingCancellation, deliverBookingCancellation, retryBookingCancellation } from './cancellations.js';
import { bookingDepositCents, cancellationView } from './cancellation-policy.js';
import { approveBookingRefund, processBookingRefund } from './refunds.js';
import { refundSource } from './refund-source.js';

export async function adminCancellationSnapshot(db: Firestore, id: string) {
  const source = await db.runTransaction(tx => refundSource(db, tx, id));
  const root = source?.data;
  if (!root) throw new BookingManagementError(404, 'Prenotazione o incasso non trovato.');
  const refund = (await db.collection('bookingRefunds').doc(id).get()).data();
  const canCancel = source.kind === 'booking' && ['confermata', 'in_attesa'].includes(root.stato)
    && root.calendarSyncPending !== true && !root.paymentReviewRequired && !root.automaticConfirmationError && !['pending', 'blocked'].includes(root.customerReschedule?.status);
  const canRefund = ['annullata', 'cancellata'].includes(root.stato) && bookingDepositCents(root) > 0 && (!refund || refund.status === 'review' && !refund.providerStarted)
    && root.depositPayment?.provider === 'paypal';
  return GetAdminBookingCancellationResponse.parse({ bookingId: id, bookingStatus: root.stato, amountCents: bookingDepositCents(root),
    status: cancellationView(root).status, refundStatus: refund?.status || root.bookingRefund?.status || (bookingDepositCents(root) > 0 && ['annullata', 'cancellata'].includes(root.stato) ? 'review' : 'none'),
    notificationStatus: root.bookingCancellation?.emailStatus || null, canCancel, canRefund,
    canVerifyRefund: !!refund?.providerStarted,
    paypalDeposit: root.depositPayment?.provider === 'paypal',
    reason: root.calendarSyncPending === true ? 'Il calendario è in aggiornamento. Riprova tra poco: l’annullamento resta sospeso per evitare eventi duplicati.'
      : refund?.status === 'review' ? 'Verifica manuale necessaria su PayPal. Non inviare un altro rimborso senza controllare l’esito.'
      : !refund && root.bookingCancellation?.decision === 'reschedule' ? 'Nuova data da concordare con il cliente. L’acconto resta tracciato: nessun nuovo pagamento automatico.'
      : bookingDepositCents(root) > 0 && !root.depositPayment ? 'Acconto non PayPal: gestione diretta dello studio.' : null,
    refundId: refund?.refundId || null });
}
export function bookingCancellationRouter(db: Firestore, auth: RequestHandler, admin: RequestHandler) {
  const router = Router();
  router.use((req, res, next) => {
    if (/\/(management\/cancel|cancellation)$/.test(req.path)) res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' });
    next();
  });
  const id = (value: unknown) => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new BookingManagementError(400, 'Identificativo non valido.');
    return value;
  };
  const failure = (res: any, error: unknown) => res.status(error instanceof BookingManagementError ? error.status : 503)
    .json({ error: error instanceof BookingManagementError ? error.message : 'Operazione da verificare. Aggiorna lo stato: non effettuare un nuovo pagamento o un rimborso manuale senza controllare l’esito.' });
  router.post('/:bookingId/management/cancel', async (req, res) => {
    const body = CancelManagedBookingBody.strict().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'Richiesta di annullamento non valida.' }); return; }
    try {
      const bookingId = id(req.params.bookingId);
      await requestBookingCancellation(db, bookingId, body.data);
      await deliverBookingCancellation(db, bookingId);
      const access = await authorizeBookingManagement(db, bookingId, body.data.token);
      res.json(CancelManagedBookingResponse.parse(await bookingManagementView(db, bookingId, access.booking)));
    } catch (error) { failure(res, error); }
  });
  router.get('/:bookingId/cancellation', auth, admin, async (req, res) => {
    try { res.json(await adminCancellationSnapshot(db, id(req.params.bookingId))); }
    catch (error) { failure(res, error); }
  });
  router.post('/:bookingId/cancellation', auth, admin, async (req, res) => {
    const body = ManageAdminBookingCancellationBody.strict().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'Azione non valida.' }); return; }
    try {
      const bookingId = id(req.params.bookingId), { action, requestId, expectedAmountCents } = body.data;
      if (['refund', 'cancel_refund'].includes(action) && expectedAmountCents === undefined) {
        res.status(400).json({ error: 'Aggiorna l’importo e conferma nuovamente il rimborso.' }); return;
      }
      const actor = (req as any).user?.uid || 'admin';
      if (action.startsWith('cancel_')) {
        await requestBookingCancellation(db, bookingId, { requestId },
          { actor, expectedAmountCents, decision: action === 'cancel_refund' ? 'refund' : action === 'cancel_reschedule' ? 'reschedule' : 'none' });
        await deliverBookingCancellation(db, bookingId);
      }
      if (action === 'retry_cancellation') await retryBookingCancellation(db, bookingId);
      if (action === 'refund' || action === 'cancel_refund') {
        const snapshot = await adminCancellationSnapshot(db, bookingId);
        if (['annullata', 'cancellata'].includes(snapshot.bookingStatus) && (action === 'refund' || snapshot.canRefund || snapshot.canVerifyRefund)) {
          await approveBookingRefund(db, bookingId, actor, expectedAmountCents); await processBookingRefund(db, bookingId);
        }
      }
      if (action === 'verify_refund') {
        await db.runTransaction(async tx => {
          const ref = db.collection('bookingRefunds').doc(bookingId), job = (await tx.get(ref)).data();
          if (job?.providerStarted && ['review', 'unknown', 'pending'].includes(job.status)
            && !(job.leaseUntil?.toMillis?.() > Date.now())) {
            tx.update(ref, { status: 'unknown', attempts: 0, notBefore: new Date(0) });
          }
        });
        await processBookingRefund(db, bookingId);
      }
      if (action === 'review') {
        await db.runTransaction(async tx => {
          const source = await refundSource(db, tx, bookingId);
          if (!source) throw new BookingManagementError(404, 'Prenotazione non trovata.');
          const job = (await tx.get(db.collection('bookingRefunds').doc(bookingId))).data();
          if (job) throw new BookingManagementError(409, 'Un rimborso è già stato avviato: verifica prima il suo esito.');
          tx.update(source.ref, { bookingRefund: { status: 'review', decision: 'studio_review', actor, updatedAt: new Date() } });
        });
      }
      res.json(await adminCancellationSnapshot(db, bookingId));
    } catch (error) { failure(res, error); }
  });
  return router;
}
