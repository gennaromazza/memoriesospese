
import express from 'express';
import { getEvents, createEvent } from './google-calendar.js';

const router = express.Router();

/**
 * GET /api/calendar/events
 * Ottiene eventi da Google Calendar per range date
 */
router.post('/events', async (req, res) => {
  try {
    const { timeMin, timeMax } = req.body;

    if (!timeMin || !timeMax) {
      return res.status(400).json({ error: 'timeMin e timeMax sono obbligatori' });
    }

    const events = await getEvents(
      'primary',
      new Date(timeMin),
      new Date(timeMax)
    );

    res.json(events);
  } catch (error: any) {
    console.error('❌ Errore caricamento eventi calendario:', error);
    res.status(500).json({ error: error.message || 'Errore caricamento eventi' });
  }
});

/**
 * POST /api/calendar/create-event
 * Crea nuovo evento su Google Calendar
 */
router.post('/create-event', async (req, res) => {
  try {
    const { summary, description, location, start, end, attendees = [] } = req.body;

    if (!summary || !start || !end) {
      return res.status(400).json({ error: 'summary, start e end sono obbligatori' });
    }

    const event = await createEvent('primary', {
      summary,
      description,
      location,
      start: new Date(start),
      end: new Date(end),
      attendees,
    });

    res.json(event);
  } catch (error: any) {
    console.error('❌ Errore creazione evento:', error);
    res.status(500).json({ error: error.message || 'Errore creazione evento' });
  }
});

export default router;
