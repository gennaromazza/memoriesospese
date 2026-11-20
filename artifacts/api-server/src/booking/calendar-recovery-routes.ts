import express, { type RequestHandler } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { CalendarRecoveryError, inspectBookingCalendar, recoverBookingCalendar } from './calendar-recovery.js';
import { safeErrorMessage } from '../utils/safe-logging.js';
import { clearCalendarEventCache } from '../services/calendar-event-cache.js';

export function calendarRecoveryRouter(db: Firestore, authenticate: RequestHandler, admin: RequestHandler) {
  const router = express.Router();
  router.use('/:id/calendar-recovery', authenticate, admin);
  router.get('/:id/calendar-recovery', async (req, res) => {
    try { res.json(await inspectBookingCalendar(db, req.params.id)); }
    catch (error) {
      res.status(error instanceof CalendarRecoveryError ? error.status : 503).json({
        error: safeErrorMessage(error, 'Verifica Google Calendar non disponibile. Riprova più tardi.'),
      });
    }
  });
  router.post('/:id/calendar-recovery', async (req, res) => {
    const key = req.body?.inspectionKey;
    if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) {
      res.status(400).json({ error: 'Esegui prima la verifica dell’appuntamento.' }); return;
    }
    try {
      const result = await recoverBookingCalendar(db, req.params.id, key, (req as any).user?.uid || 'admin');
      clearCalendarEventCache();
      res.json(result);
    } catch (error) {
      res.status(error instanceof CalendarRecoveryError ? error.status : 503).json({
        error: safeErrorMessage(error, 'Recupero non completato. Verifica di nuovo prima di riprovare.'),
      });
    }
  });
  return router;
}
