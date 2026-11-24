import { Router, type RequestHandler, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import {
  GetAdminBookingPaymentResponse, GetAdminBookingPaymentCheckoutsResponse, ResendAdminBookingDepositBody,
} from '@workspace/api-zod';
import { bookingPayPalClient } from './paypal-deposit-orders.js';
import { getBookingDepositStatusForAdmin, type BookingCapturePayPalClient } from './deposit-payments.js';
import { approveBookingWithDeposit } from './approved-deposit-request.js';
import { getAdminBookingPaymentSnapshot, listAdminBookingCheckouts } from './admin-payments.js';
import { CheckoutHoldError } from './checkout-hold-state.js';
import { CHECKOUT_HOLDS } from './slot-reservations.js';
import { recordInPersonDeposit } from './in-person-deposit.js';

export function bookingAdminPaymentRouter(db: Firestore, authenticate: RequestHandler, requireAdmin: RequestHandler,
  client: () => BookingCapturePayPalClient = bookingPayPalClient, resend = approveBookingWithDeposit) {
  const router = Router();
  const enabled = () => { try { return client().publicConfig().checkoutEnabled; } catch { return false; } };
  const failure = (res: Response, error: unknown) => {
    const status = error instanceof CheckoutHoldError ? error.status : 503;
    return res.status(status).json({ error: error instanceof CheckoutHoldError ? error.message : 'Verifica pagamento non disponibile. Nessun nuovo addebito eseguito.' });
  };
  const idFrom = (value: unknown) => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new CheckoutHoldError(400, 'Identificativo non valido.');
    return value;
  };
  router.get('/admin/payment-checkouts', authenticate, requireAdmin, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(GetAdminBookingPaymentCheckoutsResponse.parse(await listAdminBookingCheckouts(db, enabled()))); }
    catch (error) { failure(res, error); }
  });
  router.get('/:bookingId/payment', authenticate, requireAdmin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(GetAdminBookingPaymentResponse.parse(await getAdminBookingPaymentSnapshot(db, idFrom(req.params.bookingId), enabled()))); }
    catch (error) { failure(res, error); }
  });
  router.post('/:bookingId/payment/verify', authenticate, requireAdmin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) {
      res.status(400).json({ error: 'La verifica non accetta importi o azioni di pagamento.' }); return;
    }
    try {
      const id = idFrom(req.params.bookingId);
      await getBookingDepositStatusForAdmin(db, client(), id);
      res.json(GetAdminBookingPaymentResponse.parse(await getAdminBookingPaymentSnapshot(db, id, enabled())));
    } catch (error) { failure(res, error); }
  });
  /** Acconto incassato di persona (importo libero): conferma la prenotazione e chiude il link PayPal. */
  router.post('/:bookingId/payment/in-person', authenticate, requireAdmin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = idFrom(req.params.bookingId);
      await recordInPersonDeposit(db, id, req.body, (req as any).user?.uid || (req as any).user?.email || 'admin');
      res.json(GetAdminBookingPaymentResponse.parse(await getAdminBookingPaymentSnapshot(db, id, enabled())));
    } catch (error) { failure(res, error); }
  });
  router.post('/:bookingId/payment/resend', authenticate, requireAdmin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const body = ResendAdminBookingDepositBody.strict().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'Identificativo del reinvio non valido.' }); return; }
    try {
      const id = idFrom(req.params.bookingId), snapshot = await getAdminBookingPaymentSnapshot(db, id, enabled());
      const hold = (await db.collection(CHECKOUT_HOLDS).doc(id).get()).data();
      const replay = hold?.paymentEmail?.resendIds?.includes(body.data.requestId);
      if (!replay && !snapshot.canResend) throw new CheckoutHoldError(snapshot.stage === 'scaduta' ? 410 : 409, snapshot.resendReason || 'Reinvio non consentito.');
      if (!replay) {
        const result = await resend(db, id, (req as any).user?.uid || (req as any).user?.email || 'admin', {},
          { resendRequestId: body.data.requestId });
        if (!result) throw new CheckoutHoldError(409, 'Nessuna richiesta approvata da reinviare.');
      }
      res.json(GetAdminBookingPaymentResponse.parse(await getAdminBookingPaymentSnapshot(db, id, enabled())));
    } catch (error) { failure(res, error); }
  });
  return router;
}
