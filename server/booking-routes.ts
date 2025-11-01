/**
 * Booking API Routes - Express.js
 * Gestisce endpoint per slot disponibili Google Calendar
 * NOTA: Validazione campagna fatta lato client, server gestisce solo Google Calendar
 */

import express from 'express';
import { getAvailableSlots, type WorkingHours } from './google-calendar.js';

const router = express.Router();

/**
 * POST /api/booking/available-slots
 * Ottiene slot disponibili da Google Calendar
 * 
 * Body: {
 *   date: "YYYY-MM-DD",
 *   workingHours: { apertura, pausaInizio, pausaFine, chiusura },
 *   durataMinuti: number,
 *   calendarId?: string (opzionale, default 'primary')
 * }
 */
router.post('/available-slots', async (req, res) => {
  try {
    const { date, workingHours, durataMinuti, calendarId } = req.body;

    // Validazione parametri
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ 
        error: 'Parametro date mancante o invalido (formato: YYYY-MM-DD)' 
      });
    }

    if (!workingHours || typeof workingHours !== 'object') {
      return res.status(400).json({ 
        error: 'Parametro workingHours mancante' 
      });
    }

    if (!durataMinuti || typeof durataMinuti !== 'number') {
      return res.status(400).json({ 
        error: 'Parametro durataMinuti mancante o invalido' 
      });
    }

    // Validazione formato data
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ 
        error: 'Formato data invalido. Usa YYYY-MM-DD' 
      });
    }

    // Validazione working hours
    const { apertura, pausaInizio, pausaFine, chiusura } = workingHours;
    if (!apertura || !pausaInizio || !pausaFine || !chiusura) {
      return res.status(400).json({ 
        error: 'Working hours incompleti. Richiesti: apertura, pausaInizio, pausaFine, chiusura' 
      });
    }
    
    // Validazione formato HH:MM
    const timeRegex = /^\d{2}:\d{2}$/;
    const invalidTimes = [];
    if (!timeRegex.test(apertura)) invalidTimes.push('apertura');
    if (!timeRegex.test(pausaInizio)) invalidTimes.push('pausaInizio');
    if (!timeRegex.test(pausaFine)) invalidTimes.push('pausaFine');
    if (!timeRegex.test(chiusura)) invalidTimes.push('chiusura');
    
    if (invalidTimes.length > 0) {
      return res.status(400).json({ 
        error: `Formato orario invalido per: ${invalidTimes.join(', ')}. Usa HH:MM (es. "09:00")` 
      });
    }

    // Calcola slot disponibili usando Google Calendar
    const slots = await getAvailableSlots(
      calendarId || 'primary',
      new Date(date),
      {
        apertura,
        pausaInizio,
        pausaFine,
        chiusura,
      } as WorkingHours,
      durataMinuti
    );

    // Formatta slot per risposta JSON
    const formattedSlots = slots.map(slot => ({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      startTime: slot.start.toLocaleTimeString('it-IT', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Europe/Rome'
      }),
      endTime: slot.end.toLocaleTimeString('it-IT', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Europe/Rome'
      }),
    }));

    return res.json({
      date,
      durataMinuti,
      slots: formattedSlots,
      totalSlots: formattedSlots.length,
    });

  } catch (error) {
    console.error('[Booking API] Errore calcolo slot:', error);
    
    // Gestione errori specifici Google Calendar
    if (error instanceof Error) {
      if (error.message.includes('Google Calendar not connected')) {
        return res.status(503).json({ 
          error: 'Google Calendar non configurato',
          details: 'Contatta l\'amministratore per configurare il calendario' 
        });
      }
      
      if (error.message.includes('access_token') || error.message.includes('X_REPLIT_TOKEN')) {
        return res.status(503).json({ 
          error: 'Errore autenticazione Google Calendar',
          details: 'Token scaduto o non valido' 
        });
      }
    }

    return res.status(500).json({ 
      error: 'Errore interno del server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto' 
    });
  }
});

/**
 * GET /api/booking/health
 * Health check per booking API
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'booking-api',
    timestamp: new Date().toISOString() 
  });
});

export default router;
