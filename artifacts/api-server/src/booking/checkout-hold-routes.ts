import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import {
  CreateBookingCheckoutHoldBody, CreateBookingCheckoutHoldResponse,
  ResumeBookingCheckoutHoldBody, ResumeBookingCheckoutHoldParams, ResumeBookingCheckoutHoldResponse,
  ReleaseBookingCheckoutHoldBody, ReleaseBookingCheckoutHoldParams, ReleaseBookingCheckoutHoldResponse,
} from '@workspace/api-zod';
import { createCheckoutHold, resumeCheckoutHold, releaseCheckoutHold, CheckoutHoldError } from './checkout-holds.js';
import { BookingSlotConflictError } from './slot-reservations.js';
import { logger } from '../lib/logger.js';

export function checkoutHoldRouter(db: Firestore): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  function failure(res: import('express').Response, error: any) {
    if (error instanceof CheckoutHoldError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof BookingSlotConflictError) { res.status(409).json({ error: 'Slot non più disponibile' }); return; }
    // Fail closed for Firestore and Calendar failures, without leaking personal data or tokens.
    logger.error({ code: error?.code }, 'Disponibilità checkout non verificabile');
    res.status(503).json({ error: 'Impossibile verificare il checkout. Riprova tra poco.' });
  }
  router.post('/', async (req, res) => {
    const input = CreateBookingCheckoutHoldBody.strict().safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: 'Dati della prenotazione non validi' }); return; }
    try { res.status(201).json(CreateBookingCheckoutHoldResponse.parse(await createCheckoutHold(db, input.data))); }
    catch (error) { failure(res, error); }
  });
  router.post('/:bookingId/resume', async (req, res) => {
    const params = ResumeBookingCheckoutHoldParams.safeParse(req.params);
    const input = ResumeBookingCheckoutHoldBody.strict().safeParse(req.body);
    if (!params.success || !input.success) { res.status(400).json({ error: 'Dati del checkout non validi' }); return; }
    try { res.json(ResumeBookingCheckoutHoldResponse.parse(await resumeCheckoutHold(db, params.data.bookingId, input.data.token))); }
    catch (error) { failure(res, error); }
  });
  router.post('/:bookingId/release', async (req, res) => {
    const params = ReleaseBookingCheckoutHoldParams.safeParse(req.params);
    const input = ReleaseBookingCheckoutHoldBody.strict().safeParse(req.body);
    if (!params.success || !input.success) { res.status(400).json({ error: 'Dati del checkout non validi' }); return; }
    try { res.json(ReleaseBookingCheckoutHoldResponse.parse(await releaseCheckoutHold(db, params.data.bookingId, input.data.token))); }
    catch (error) { failure(res, error); }
  });
  return router;
}
