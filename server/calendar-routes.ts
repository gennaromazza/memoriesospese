/**
 * Calendar API Routes - Express.js
 * Gestisce endpoint per visualizzazione calendario unificato (Google Calendar + Consulenze + Jobs)
 * e creazione eventi Google Calendar con notifiche email opzionali
 */

import express from 'express';
import { getEvents, createEvent } from './google-calendar.js';
import { db } from './firebase-admin.js';
import { authenticateFirebase, sendGmailEmail, createCalendarEventEmailHTML, getStudioContactInfo, generateGoogleCalendarLink } from './email-routes.js';
import { z } from 'zod';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

const router = express.Router();

/**
 * DTO per evento unificato calendario
 */
interface CalendarEventDTO {
  id: string; // ID prefissato per display: g-xxx, c-xxx, j-xxx
  title: string;
  description?: string;
  start: string; // ISO date
  end: string;
  location?: string;
  type: 'google' | 'consulenza' | 'job';
  clientName?: string;
  clientEmail?: string;
  googleEventId?: string;
  entityStatus?: string; // Stato entità (consulenza/booking): in_attesa, confermata, rifiutata, annullata, etc
  entityId?: string; // ID puro dell'entità (senza prefix) per API delete
}

/**
 * GET /api/calendar/events
 * Carica eventi da Google Calendar + Consulenze + Jobs
 * Ritorna array unificato per visualizzazione calendario frontend
 * 
 * Query params:
 * - startDate: string ISO (es. "2025-11-01T00:00:00Z")
 * - endDate: string ISO (es. "2025-11-30T23:59:59Z")
 * - calendarId: string (opzionale, default 'primary')
 */
router.get('/events', authenticateFirebase, async (req, res) => {
  try {
    const { startDate, endDate, calendarId } = req.query;
    
    // Validazione parametri
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required query parameters: startDate, endDate'
      });
    }

    const events: CalendarEventDTO[] = [];
    const warnings: string[] = [];
    const timeMin = new Date(startDate as string);
    const timeMax = new Date(endDate as string);

    // 1. Google Calendar events
    try {
      console.log(`📅 Fetching Google Calendar events (${startDate} → ${endDate})`);
      
      const googleEvents = await getEvents(
        (calendarId as string) || 'primary',
        timeMin,
        timeMax
      );

      googleEvents.forEach(event => {
        events.push({
          id: `g-${event.id}`,
          title: event.summary || 'Evento senza titolo',
          description: event.description || undefined,
          start: event.start?.dateTime || event.start?.date || '',
          end: event.end?.dateTime || event.end?.date || '',
          location: event.location || undefined,
          type: 'google',
          googleEventId: event.id || undefined,
        });
      });

      console.log(`✅ Caricati ${googleEvents.length} eventi Google Calendar`);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('⚠️ Errore caricamento Google Calendar (continuiamo comunque):', errorMessage);
      warnings.push(`Google Calendar non disponibile: ${errorMessage}`);
    }

    // 2. Consulenze nel range di date (tutte, incluse rifiutate per gestione cancellazione)
    try {
      console.log(`🗓️ Fetching consulenze (${startDate} → ${endDate})`);
      
      const consultazioniSnap = await db.collection('consultations')
        .where('dataConsulenza', '>=', timeMin)
        .where('dataConsulenza', '<=', timeMax)
        .get();
      
      consultazioniSnap.forEach(doc => {
        const c = doc.data();
        const clienteNome = `${c.cliente?.nome || ''} ${c.cliente?.cognome || ''}`.trim() || 'Cliente';
        
        events.push({
          id: `c-${doc.id}`, // ID prefissato per display
          title: `Consulenza: ${clienteNome}`,
          description: c.note || undefined,
          start: c.dataConsulenza?.toDate?.()?.toISOString() || c.dataConsulenza,
          end: c.dataConsulenza?.toDate?.()?.toISOString() || c.dataConsulenza,
          type: 'consulenza',
          clientName: clienteNome,
          clientEmail: c.cliente?.email || undefined,
          entityStatus: c.stato || undefined,
          entityId: doc.id, // ID puro per delete API
        });
      });

      console.log(`✅ Caricate ${consultazioniSnap.size} consulenze`);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('⚠️ Errore caricamento consulenze (continuiamo comunque):', errorMessage);
      warnings.push(`Consulenze non disponibili: ${errorMessage}`);
    }

    // 3. Jobs con eventDate nel range
    try {
      console.log(`💼 Fetching jobs attivi (${startDate} → ${endDate})`);
      
      const jobsSnap = await db.collection('jobs')
        .where('eventDate', '>=', timeMin)
        .where('eventDate', '<=', timeMax)
        .get();
      
      jobsSnap.forEach(doc => {
        const job = doc.data();
        
        // Recupera nome evento o tipo job
        const jobTitle = job.nomeEvento || job.jobType || 'Job';
        
        // Recupera nome cliente (può essere in clienteNome o costruito da clienti array)
        let clienteNome = job.clienteNome || 'Cliente';
        if (!job.clienteNome && job.clientiIds && job.clientiIds.length > 0) {
          // Se non c'è clienteNome ma ci sono clienti, usa "Cliente Multiplo"
          clienteNome = job.clientiIds.length === 1 ? 'Cliente' : 'Clienti Multipli';
        }
        
        events.push({
          id: `j-${doc.id}`,
          title: `${jobTitle}: ${clienteNome}`,
          description: job.noteInterne || job.note || undefined,
          start: job.eventDate?.toDate?.()?.toISOString() || job.eventDate,
          end: job.eventDate?.toDate?.()?.toISOString() || job.eventDate,
          type: 'job',
          clientName: clienteNome,
          clientEmail: job.clienteEmail || undefined,
        });
      });

      console.log(`✅ Caricati ${jobsSnap.size} jobs`);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('⚠️ Errore caricamento jobs (continuiamo comunque):', errorMessage);
      warnings.push(`Jobs non disponibili: ${errorMessage}`);
    }

    console.log(`📋 Totale eventi caricati: ${events.length}`);
    if (warnings.length > 0) {
      console.log(`⚠️ Warnings: ${warnings.join(', ')}`);
    }
    
    res.json({ events, warnings });
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    console.error('❌ Error fetching calendar events:', errorMessage);
    res.status(500).json({ error: 'Failed to fetch events', message: errorMessage });
  }
});

/**
 * POST /api/calendar/create-event
 * Crea evento Google Calendar + notifica email opzionale
 * 
 * Body: {
 *   title: string,
 *   description?: string,
 *   start: string (ISO),
 *   end: string (ISO),
 *   location?: string,
 *   clienteId?: string,
 *   notifyCliente?: boolean (default false)
 * }
 */
const createEventSchema = z.object({
  title: z.string().min(1, 'Titolo evento obbligatorio'),
  description: z.string().optional(),
  start: z.string().min(1, 'Data inizio richiesta'),
  end: z.string().min(1, 'Data fine richiesta'),
  location: z.string().optional(),
  clienteId: z.string().optional(),
  notifyCliente: z.boolean().default(false),
  isAllDay: z.boolean().default(false),
}).refine(
  (data) => {
    if (data.isAllDay) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      return dateRegex.test(data.start) && dateRegex.test(data.end);
    }
    return !isNaN(Date.parse(data.start)) && !isNaN(Date.parse(data.end));
  },
  {
    message: 'All-day events require YYYY-MM-DD format, timed events require valid ISO datetime',
  }
);

router.post('/create-event', authenticateFirebase, async (req, res) => {
  try {
    // Validazione input
    const data = createEventSchema.parse(req.body);
    
    console.log(`📅 Creazione evento Google Calendar: "${data.title}"`);
    
    // 1. Fetch cliente se necessario (per attendees Google Calendar)
    let clienteEmail: string | undefined;
    
    if (data.clienteId) {
      try {
        const clienteDoc = await db.collection('clienti').doc(data.clienteId).get();
        
        if (clienteDoc.exists) {
          const cliente = clienteDoc.data();
          clienteEmail = cliente?.email;
          console.log(`👤 Cliente trovato: ${cliente?.nome} ${cliente?.cognome} (${clienteEmail})`);
        } else {
          console.warn(`⚠️ Cliente ${data.clienteId} non trovato`);
        }
      } catch (clienteError) {
        console.error('⚠️ Errore fetch cliente:', clienteError);
      }
    }
    
    // 2. Crea evento su Google Calendar
    const attendees = (data.notifyCliente && clienteEmail) 
      ? [clienteEmail] 
      : undefined;
    
    const event = await createEvent('primary', {
      summary: data.title,
      description: data.description,
      start: data.isAllDay ? undefined : new Date(data.start),
      end: data.isAllDay ? undefined : new Date(data.end),
      location: data.location,
      attendees,
      isAllDay: data.isAllDay,
      startDateStr: data.isAllDay ? data.start : undefined,
      endDateStr: data.isAllDay ? data.end : undefined,
    });

    console.log(`✅ Evento creato su Google Calendar: ${event.id}`);
    
    // 3. Invia email notifica al cliente se richiesto
    if (data.notifyCliente && clienteEmail) {
      try {
        const clienteDoc = await db.collection('clienti').doc(data.clienteId!).get();
        const cliente = clienteDoc.data();
        const clienteName = `${cliente?.nome || ''} ${cliente?.cognome || ''}`.trim() || 'Cliente';
        
        const studioInfo = await getStudioContactInfo();
        
        // Format dates/times in Italian
        let eventDate: string;
        let eventTime: string;
        let eventEndTime: string;
        
        if (data.isAllDay) {
          const [year, month, day] = data.start.split('-').map(Number);
          const pureDate = new Date(year, month - 1, day);
          eventDate = format(pureDate, 'EEEE d MMMM yyyy', { locale: it });
          eventTime = 'Tutto il giorno';
          eventEndTime = '';
        } else {
          const startDate = new Date(data.start);
          const endDate = new Date(data.end);
          eventDate = format(startDate, 'EEEE d MMMM yyyy', { locale: it });
          eventTime = format(startDate, 'HH:mm', { locale: it });
          eventEndTime = format(endDate, 'HH:mm', { locale: it });
        }
        
        // Generate Google Calendar "Add to Calendar" link
        const calendarLink = generateGoogleCalendarLink({
          title: data.title,
          description: `${data.description || ''}\n\n${studioInfo.name}\nTel: ${studioInfo.phone}`,
          location: data.location || studioInfo.address,
          startDate: data.start,
          endDate: data.end,
          isAllDay: data.isAllDay
        });
        
        const htmlContent = createCalendarEventEmailHTML(
          clienteName,
          data.title,
          eventDate,
          eventTime,
          eventEndTime,
          data.location,
          data.description,
          studioInfo,
          calendarLink
        );
        
        const subject = `Nuovo Appuntamento: ${data.title}`;
        
        await sendGmailEmail(clienteEmail, subject, htmlContent);
        
        console.log(`✅ Email notifica inviata a ${clienteEmail}`);
      } catch (emailError) {
        console.error('⚠️ Errore invio email notifica (evento creato comunque):', emailError);
      }
    }

    res.json({ 
      success: true, 
      eventId: event.id,
      message: 'Evento creato con successo' 
    });
  } catch (error: any) {
    console.error('❌ Error creating calendar event:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Dati non validi',
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Failed to create event' });
  }
});

export default router;
