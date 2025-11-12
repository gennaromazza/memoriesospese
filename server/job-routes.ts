/**
 * Job API Routes - Express.js
 * Gestisce endpoint per lavori fotografici
 */

import express from 'express';
import { getEvents } from './google-calendar.js';
import { db } from './firebase-admin.js';
import { Timestamp } from 'firebase-admin/firestore';

const router = express.Router();

/**
 * GET /api/jobs
 * Restituisce tutti i jobs da Firestore
 */
router.get('/', async (req, res) => {
  try {
    const jobsSnapshot = await db.collection('jobs').get();
    
    const jobs = jobsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`[GET /api/jobs] Returning ${jobs.length} jobs`);
    return res.json(jobs);
  } catch (error: any) {
    console.error('[GET /api/jobs] Error:', error);
    return res.status(500).json({ 
      error: 'Errore caricamento jobs',
      details: error.message 
    });
  }
});

/**
 * GET /api/jobs/check-calendar
 * Controlla conflitti su Google Calendar e bookings per una data/orario specifico
 * 
 * Query params:
 * - eventDate: string ISO (es. "2025-12-25")
 * - allDay: boolean (true se evento tutto il giorno)
 * - startTime: string HH:MM (opzionale, richiesto se !allDay)
 * - endTime: string HH:MM (opzionale, richiesto se !allDay)
 */
router.get('/check-calendar', async (req, res) => {
  try {
    const { eventDate, allDay, startTime, endTime } = req.query;
    
    // Validazione params
    if (!eventDate) {
      return res.status(400).json({ error: 'eventDate richiesta' });
    }
    
    const isAllDay = allDay === 'true';
    
    if (!isAllDay && (!startTime || !endTime)) {
      return res.status(400).json({ 
        error: 'startTime e endTime richiesti se non tutto il giorno' 
      });
    }
    
    // Parse eventDate
    const dateStr = eventDate as string;
    const [year, month, day] = dateStr.split('-').map(Number);
    
    let timeMin: Date;
    let timeMax: Date;
    
    if (isAllDay) {
      // Tutto il giorno: 00:00 → 23:59
      timeMin = new Date(year, month - 1, day, 0, 0, 0);
      timeMax = new Date(year, month - 1, day, 23, 59, 59);
    } else {
      // Orari specifici
      const [startHours, startMinutes] = (startTime as string).split(':').map(Number);
      const [endHours, endMinutes] = (endTime as string).split(':').map(Number);
      
      timeMin = new Date(year, month - 1, day, startHours, startMinutes, 0);
      timeMax = new Date(year, month - 1, day, endHours, endMinutes, 0);
    }
    
    // 1. Query Google Calendar
    let calendarEvents: any[] = [];
    try {
      const events = await getEvents('primary', timeMin, timeMax);
      calendarEvents = events.filter(e => e.summary).map(event => ({
        type: 'calendar',
        title: event.summary,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        allDay: !event.start?.dateTime && !!event.start?.date
      }));
    } catch (error) {
      console.error('[Check Calendar] Google Calendar error:', error);
      // Continue even if Calendar fails
    }
    
    // 2. Query Firestore bookings
    // NOTA: Firestore non permette inequality su campi diversi, quindi fetchiamo
    // tutti i bookings del giorno usando solo dataShootingInizio, poi filtriamo in-memory
    const dayStart = new Date(year, month - 1, day, 0, 0, 0);
    const dayEnd = new Date(year, month - 1, day, 23, 59, 59);
    
    const bookingsSnapshot = await db.collection('bookings')
      .where('dataShootingInizio', '>=', Timestamp.fromDate(dayStart))
      .where('dataShootingInizio', '<=', Timestamp.fromDate(dayEnd))
      .get();
    
    // Filter in-memory per overlap detection
    const bookingConflicts = bookingsSnapshot.docs
      .map(doc => {
        const data = doc.data();
        const start = data.dataShootingInizio?.toDate();
        const end = data.dataShootingFine?.toDate();
        
        return {
          start,
          end,
          data: {
            type: 'booking',
            title: `Booking: ${data.cliente?.nome || ''} ${data.cliente?.cognome || ''}`,
            start: start?.toISOString(),
            end: end?.toISOString(),
            allDay: false,
            bookingId: doc.id,
            clientName: `${data.cliente?.nome || ''} ${data.cliente?.cognome || ''}`.trim()
          }
        };
      })
      .filter(booking => {
        // Overlap check: booking overlaps if start < timeMax AND end > timeMin
        return booking.start && booking.end &&
               booking.start < timeMax && booking.end > timeMin;
      })
      .map(booking => booking.data);
    
    // 3. Combina conflicts
    const conflicts = [...calendarEvents, ...bookingConflicts];
    
    console.log(`[Check Calendar] Found ${conflicts.length} conflicts for ${dateStr} (${isAllDay ? 'all-day' : `${startTime}-${endTime}`})`);
    
    return res.json({ 
      conflicts,
      hasConflicts: conflicts.length > 0
    });
    
  } catch (error: any) {
    console.error('[Check Calendar] Error:', error);
    return res.status(500).json({ 
      error: 'Errore durante il controllo calendario',
      details: error.message 
    });
  }
});

export default router;
