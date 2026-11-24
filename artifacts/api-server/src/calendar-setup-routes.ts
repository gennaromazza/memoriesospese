import express from 'express';
import { z } from 'zod/v4';
import { discoverStudioCalendars, getCalendarConnectionStatus } from './google-calendar.js';
import { CalendarDestinationConflict, confirmStudioCalendarId, getStudioCalendarId } from './calendar-destination.js';
import { clearCalendarEventCache } from './services/calendar-event-cache.js';

const selection = z.object({
  calendarId: z.string().trim().min(3).max(1024)
    .refine(id => id !== 'primary' && !/[\s/?#]/.test(id) && id.includes('@'), 'Inserisci l’ID del calendario, non il link.'),
});

/** Mounted behind Firebase authentication and the same admin guard as status. */
export const calendarSetupRouter = express.Router();

calendarSetupRouter.get('/', async (_req, res) => {
  try {
    res.json(await discoverStudioCalendars());
  } catch {
    res.status(503).json({ error: 'Impossibile accedere alla configurazione del Service Account. Verifica le credenziali sul server e riprova.' });
  }
});

calendarSetupRouter.post('/verify', async (req, res) => {
  const input = selection.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Inserisci un ID calendario valido, non un link o “primary”.' });
  try {
    return res.json(await getCalendarConnectionStatus(input.data.calendarId));
  } catch {
    return res.status(503).json({ error: 'Verifica calendario non disponibile. Riprova.' });
  }
});

calendarSetupRouter.post('/confirm', async (req, res) => {
  const input = selection.extend({ confirmed: z.literal(true) }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Scegli un calendario e conferma esplicitamente la destinazione.' });
  try {
    const id = input.data.calendarId;
    const current = await getStudioCalendarId();
    if (current && current !== id) throw new CalendarDestinationConflict();
    // Never trust a previous browser verification: permissions may have changed.
    const status = await getCalendarConnectionStatus(id);
    if (!status.connected) return res.status(422).json({ ...status, error: status.error });
    await confirmStudioCalendarId(id, (req as any).user.email);
    clearCalendarEventCache();
    return res.json(status);
  } catch (error) {
    if (error instanceof CalendarDestinationConflict) return res.status(409).json({ error: error.message });
    return res.status(503).json({ error: 'Collegamento non confermato. Riapri la procedura per verificare la destinazione salvata.' });
  }
});
