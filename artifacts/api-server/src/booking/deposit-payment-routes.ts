import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { CaptureBookingDepositBody, CaptureBookingDepositParams, CaptureBookingDepositResponse } from '@workspace/api-zod';
import { GetBookingPayPalConfigResponse, GetBookingDepositStatusBody, GetBookingDepositStatusParams, GetBookingDepositStatusResponse } from '@workspace/api-zod';
import { bookingPayPalClient, BookingDepositOrderError } from './paypal-deposit-orders.js';
import { CheckoutHoldError } from './checkout-hold-state.js';
import { captureBookingDeposit, getBookingDepositStatus, handleVerifiedBookingPayPalEvent, type BookingCapturePayPalClient } from './deposit-payments.js';
import { logger } from '../lib/logger.js';
import { bookingPublicRateLimiter, CHECKOUT_PAYMENT_LIMIT } from './public-rate-limit.js';

export function bookingDepositPaymentRouter(db: Firestore, client: () => BookingCapturePayPalClient = bookingPayPalClient) {
  const router = Router();
  const paymentLimiter = bookingPublicRateLimiter(CHECKOUT_PAYMENT_LIMIT.maxRequests, CHECKOUT_PAYMENT_LIMIT.windowMs);
  router.get('/paypal/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const config = client().publicConfig();
      res.json(GetBookingPayPalConfigResponse.parse({
        enabled: config.checkoutEnabled, clientId: config.checkoutEnabled ? config.clientId : null,
        environment: config.environment, currency: 'EUR',
      }));
    } catch (error) { failure(res, error); }
  });
  const failure = (res: import('express').Response, error: unknown) => {
    if (error instanceof CheckoutHoldError) return res.status(error.status).json({
      error: error.message, ...(error instanceof BookingDepositOrderError ? { code: error.checkoutCode } : {}),
    });
    logger.error('Verifica acconto PayPal non completata');
    return res.status(503).json({ error: 'Impossibile verificare il pagamento. Riprova tra poco.' });
  };
  router.post('/v2/checkout-holds/:bookingId/paypal-capture', paymentLimiter, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const params = CaptureBookingDepositParams.safeParse(req.params);
    const body = CaptureBookingDepositBody.strict().safeParse(req.body);
    if (!params.success || !body.success) { res.status(400).json({ error: 'Dati del checkout non validi' }); return; }
    try { res.json(CaptureBookingDepositResponse.parse(await captureBookingDeposit(db, client(), params.data.bookingId, body.data.token))); }
    catch (error) { failure(res, error); }
  });
  router.post('/v2/checkout-holds/:bookingId/paypal-status', paymentLimiter, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const params = GetBookingDepositStatusParams.safeParse(req.params);
    const body = GetBookingDepositStatusBody.strict().safeParse(req.body);
    if (!params.success || !body.success) { res.status(400).json({ error: 'Dati del checkout non validi' }); return; }
    try { res.json(GetBookingDepositStatusResponse.parse(await getBookingDepositStatus(db, client(), params.data.bookingId, body.data.token))); }
    catch (error) { failure(res, error); }
  });
  router.post('/paypal/webhook', async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) { res.status(400).json({ error: 'Evento PayPal non valido' }); return; }
    try {
      const paypal = client();
      const verified = await paypal.verifyWebhook({
        transmissionId: req.get('paypal-transmission-id'), transmissionTime: req.get('paypal-transmission-time'),
        certUrl: req.get('paypal-cert-url'), authAlgo: req.get('paypal-auth-algo'), transmissionSig: req.get('paypal-transmission-sig'),
      }, req.body);
      if (!verified) { res.status(401).json({ error: 'Firma webhook PayPal non valida' }); return; }
      res.json(await handleVerifiedBookingPayPalEvent(db, paypal, req.body) ?? { ok: true, ignored: true });
    } catch (error) { failure(res, error); }
  });
  return router;
}
