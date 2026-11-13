import { Router, type RequestHandler, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AuthorizeBookingManagementAccessBody, AuthorizeBookingManagementAccessResponse,
  GetAdminBookingManagementLinkResponse, ChangeAdminBookingManagementLinkBody, ChangeAdminBookingManagementLinkResponse,
  GetBookingManagementSlotsBody, GetBookingManagementSlotsResponse, RescheduleManagedBookingBody, RescheduleManagedBookingResponse,
} from '@workspace/api-zod';
import { authorizeBookingManagement, BookingManagementError, changeManagementLink, getManagementLinkSummary } from './management-access.js';
import { bookingManagementView } from './management-summary.js';
import { reserveManagedReschedule, slotsForManagedBooking } from './rescheduling.js';
import { deliverManagedReschedule } from './reschedule-delivery.js';
import { RESCHEDULE_JOBS } from './reschedule-policy.js';

export function bookingManagementRouter(db: Firestore, authenticate: RequestHandler, requireAdmin: RequestHandler) {
  const router = Router();
  const headers = (res: Response) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' });
  };
  const id = (value: unknown) => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new BookingManagementError(400, 'Identificativo non valido.');
    return value;
  };
  const failure = (res: Response, error: unknown) => {
    const known = error instanceof BookingManagementError;
    res.status(known ? error.status : 503).json({ error: known ? error.message : 'Gestione del link non disponibile. Riprova più tardi.' });
  };
  router.post('/:bookingId/management/access', async (req, res) => {
    headers(res);
    const body = AuthorizeBookingManagementAccessBody.strict().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'Link non valido.' }); return; }
    try {
      const access = await authorizeBookingManagement(db, id(req.params.bookingId), body.data.token);
      res.json(AuthorizeBookingManagementAccessResponse.parse(await bookingManagementView(db, access.bookingId, access.booking)));
    } catch (error) { failure(res, error); }
  });
  router.post('/:bookingId/management/slots', async (req, res) => {
    headers(res);
    const body = GetBookingManagementSlotsBody.strict().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'Data o link non validi.' }); return; }
    try { res.json(GetBookingManagementSlotsResponse.parse(await slotsForManagedBooking(db, id(req.params.bookingId), body.data.token, body.data.date))); }
    catch (error) { failure(res, error); }
  });
  router.post('/:bookingId/management/reschedule', async (req, res) => {
    headers(res);
    const body = RescheduleManagedBookingBody.strict().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'Richiesta di cambio non valida.' }); return; }
    try {
      const bookingId = id(req.params.bookingId);
      await reserveManagedReschedule(db, bookingId, body.data);
      await deliverManagedReschedule(db, bookingId);
      const job = (await db.collection(RESCHEDULE_JOBS).doc(bookingId).get()).data();
      if (job?.requestId === body.data.requestId && job.status === 'failed') throw new BookingManagementError(409, 'Cambio non effettuato. L’appuntamento originale è conservato: scegli nuovamente la data.');
      const access = await authorizeBookingManagement(db, bookingId, body.data.token);
      res.json(RescheduleManagedBookingResponse.parse(await bookingManagementView(db, bookingId, access.booking)));
    } catch (error) { failure(res, error); }
  });
  router.get('/:bookingId/management-link', authenticate, requireAdmin, async (req, res) => {
    headers(res);
    try { res.json(GetAdminBookingManagementLinkResponse.parse(await getManagementLinkSummary(db, id(req.params.bookingId)))); }
    catch (error) { failure(res, error); }
  });
  router.post('/:bookingId/management-link', authenticate, requireAdmin, async (req, res) => {
    headers(res);
    const body = ChangeAdminBookingManagementLinkBody.strict().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'Richiesta di modifica del link non valida.' }); return; }
    try {
      res.json(ChangeAdminBookingManagementLinkResponse.parse(await changeManagementLink(
        db, id(req.params.bookingId), body.data, (req as any).user?.uid || 'admin',
      )));
    } catch (error) { failure(res, error); }
  });
  return router;
}
