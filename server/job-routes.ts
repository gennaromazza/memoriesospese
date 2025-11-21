/**
 * Job API Routes - Express.js
 * Gestisce endpoint per lavori fotografici
 */

import express from 'express';
import { getEvents, createEvent, createEuropeRomeDate, getEventById } from './google-calendar.js';
import { db, Timestamp, FieldValue } from './firebase-admin.js';
import { sendGmailEmail, getStudioContactInfo } from './email-routes.js';

const router = express.Router();

/**
 * HELPER: Ensure job has valid Calendar event
 * Verifica se evento esiste su Calendar, ricrea se stale/missing
 * @returns { success, eventId, action: 'created' | 'verified' | 'recreated' }
 */
export async function ensureJobCalendarEvent(jobId: string): Promise<{
  success: boolean;
  eventId?: string;
  action?: 'created' | 'verified' | 'recreated';
  error?: string;
}> {
  try {
    // 1. Fetch job da Firestore
    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return { success: false, error: 'Job non trovato' };
    }
    
    let job = jobDoc.data();
    
    // 2. Validation: job deve avere eventDate
    if (!job.eventDate) {
      return { success: false, error: 'Job senza eventDate' };
    }
    
    // 3. Se ha googleCalendarEventId, verifica se esiste ancora su Calendar
    let hadStaleId = false;  // Flag per distinguere 'recreated' vs 'created'
    
    if (job.googleCalendarEventId) {
      console.log(`ℹ️  Job ${jobId} ha Calendar ID ${job.googleCalendarEventId}, verifico esistenza...`);
      
      const existingEvent = await getEventById('primary', job.googleCalendarEventId);
      
      if (existingEvent) {
        console.log(`✅ Calendar event ${job.googleCalendarEventId} esiste - verified`);
        return {
          success: true,
          eventId: job.googleCalendarEventId,
          action: 'verified'
        };
      }
      
      // Evento non esiste più (cancellato manualmente) - rimuovi stale ID
      console.warn(`⚠️  Calendar event ${job.googleCalendarEventId} NON esiste più - stale ID, ricreo...`);
      hadStaleId = true;  // Salva flag PRIMA di delete
      
      await db.collection('jobs').doc(jobId).update({
        googleCalendarEventId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    
    // 4. Crea nuovo evento Calendar
    const eventDate = job.eventDate.toDate();
    const year = eventDate.getFullYear();
    const month = String(eventDate.getMonth() + 1).padStart(2, '0');
    const day = String(eventDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const summary = `📸 ${job.nomeEvento} (${job.jobType})`;
    const description = `Job ID: ${jobId}\nStatus: ${job.status}\nProvenienza: ${job.provenance}${job.eventLocation ? `\nLocation: ${job.eventLocation}` : ''}`;
    
    let createdEvent;
    
    if (job.allDay) {
      // All-day event
      createdEvent = await createEvent('primary', {
        summary,
        description,
        isAllDay: true,
        startDateStr: dateStr,
        location: job.eventLocation,
        attendees: []
      });
    } else {
      // Time-bound event
      if (!job.startTime || !job.endTime) {
        return { 
          success: false,
          error: 'Job non all-day deve avere startTime e endTime' 
        };
      }
      
      const startDateTime = createEuropeRomeDate(dateStr, job.startTime);
      const endDateTime = createEuropeRomeDate(dateStr, job.endTime);
      
      createdEvent = await createEvent('primary', {
        summary,
        description,
        start: startDateTime,
        end: endDateTime,
        location: job.eventLocation,
        attendees: []
      });
    }
    
    // 5. Update job con nuovo googleCalendarEventId
    await db.collection('jobs').doc(jobId).update({
      googleCalendarEventId: createdEvent.id,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    // 6. Verifica che update sia stato salvato (critical: evita success senza ID persistito)
    const updatedJobDoc = await db.collection('jobs').doc(jobId).get();
    const updatedJob = updatedJobDoc.data();
    
    if (!updatedJob || updatedJob.googleCalendarEventId !== createdEvent.id) {
      console.error(`❌ CRITICAL: Firestore update failed - googleCalendarEventId non salvato per Job ${jobId}`);
      return {
        success: false,
        error: 'Firestore update failed - Calendar event creato ma ID non salvato'
      };
    }
    
    const action = hadStaleId ? 'recreated' : 'created';
    console.log(`✅ Calendar event ${action} per Job ${jobId}: ${createdEvent.id}`);
    
    return {
      success: true,
      eventId: createdEvent.id,
      action
    };
    
  } catch (error: any) {
    console.error(`❌ Errore ensureJobCalendarEvent per Job ${jobId}:`, error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * GET /api/consultation-templates?jobType=Matrimonio
 * Recupera tutti i template di consulenza attivi per un jobType specifico
 */
router.get('/consultation-templates', async (req, res) => {
  try {
    const { jobType } = req.query;
    
    if (!jobType) {
      return res.status(400).json({ error: 'jobType query parameter richiesto' });
    }
    
    const templatesSnapshot = await db.collection('consultation_templates')
      .where('jobType', '==', jobType)
      .where('attiva', '==', true)
      .get();
    
    const templates = templatesSnapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .sort((a: any, b: any) => (a.ordine || 0) - (b.ordine || 0));
    
    res.json(templates);
  } catch (error: any) {
    console.error('[Get Consultation Templates] Error:', error);
    res.status(500).json({ 
      error: 'Errore durante recupero template consulenza',
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

/**
 * POST /api/jobs/:id/calendar-event
 * Crea/aggiorna evento Google Calendar per Job (quando diventa confermato, etc.)
 * Blocca slot per prenotazioni/consultations
 * Verifica esistenza evento esistente, ricrea se stale
 */
router.post('/:id/calendar-event', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await ensureJobCalendarEvent(id);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.error || 'Errore durante la gestione Calendar event' 
      });
    }
    
    res.json({
      success: true,
      eventId: result.eventId,
      action: result.action,
      alreadyExists: result.action === 'verified'
    });
    
  } catch (error: any) {
    console.error(`❌ Errore endpoint Calendar event per Job:`, error);
    res.status(500).json({
      error: 'Errore durante la gestione dell\'evento Calendar',
      details: error.message
    });
  }
});

/**
 * POST /api/jobs/:id/send-consultation-request
 * Genera link consulenza pre-compilato e invia notifica al cliente
 * 
 * Body:
 * - channel: 'email' | 'whatsapp'
 */
router.post('/:id/send-consultation-request', async (req, res) => {
  try {
    const { id } = req.params;
    const { channel, templateId } = req.body;
    
    if (!channel || !['email', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ error: 'channel richiesto (email | whatsapp)' });
    }
    
    if (!templateId) {
      return res.status(400).json({ error: 'templateId richiesto' });
    }
    
    // 1. Recupera job
    const jobDoc = await db.collection('jobs').doc(id).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: 'Job non trovato' });
    }
    
    const job: any = { id: jobDoc.id, ...jobDoc.data() };
    
    // 2. Recupera primo cliente
    if (!job.clientiIds || job.clientiIds.length === 0) {
      return res.status(400).json({ error: 'Job senza clienti associati' });
    }
    
    const clienteDoc = await db.collection('clienti').doc(job.clientiIds[0]).get();
    if (!clienteDoc.exists) {
      return res.status(404).json({ error: 'Cliente non trovato' });
    }
    
    const cliente: any = clienteDoc.data();
    if (!cliente) {
      return res.status(404).json({ error: 'Dati cliente non trovati' });
    }
    
    // 3. Recupera template consulenza tramite ID
    const templateDoc = await db.collection('consultationTemplates').doc(templateId).get();
    if (!templateDoc.exists) {
      return res.status(404).json({ error: 'Template consulenza non trovato' });
    }
    
    const templateData = templateDoc.data();
    if (!templateData) {
      return res.status(404).json({ error: 'Dati template consulenza non trovati' });
    }
    
    // Validazione sicurezza: template deve essere attivo e del tipo giusto
    if (!templateData.attiva) {
      return res.status(400).json({ 
        error: 'Template consulenza non attivo',
        details: 'Il template selezionato è stato disattivato' 
      });
    }
    
    if (templateData.jobType !== job.jobType) {
      return res.status(400).json({ 
        error: 'Template consulenza non compatibile',
        details: `Template per "${templateData.jobType}" non compatibile con job tipo "${job.jobType}"` 
      });
    }
    
    const template = {
      id: templateDoc.id,
      data: templateData
    };
    
    // 4. Genera link consulenza con dominio corretto (sviluppo/produzione)
    let baseUrl = 'https://memoriesospese.gennaromazzacane.it';
    
    if (process.env.REPLIT_DOMAINS) {
      try {
        let primaryDomain: string;
        
        // REPLIT_DOMAINS può essere JSON array (es. '["abc.replit.dev"]') o CSV (es. 'abc.com,backup.com')
        if (process.env.REPLIT_DOMAINS.trim().startsWith('[')) {
          // Parse JSON array
          const domains = JSON.parse(process.env.REPLIT_DOMAINS);
          primaryDomain = Array.isArray(domains) && domains.length > 0 ? domains[0] : '';
        } else {
          // Parse CSV - prende il primo dominio (sviluppo o produzione)
          const domains = process.env.REPLIT_DOMAINS.split(',');
          primaryDomain = domains[0].trim();
        }
        
        // Valida e usa il dominio se non vuoto
        if (primaryDomain && primaryDomain.length > 0) {
          baseUrl = `https://${primaryDomain}`;
        }
      } catch (error) {
        console.warn('⚠️ Errore parsing REPLIT_DOMAINS, uso fallback:', error);
        // Usa fallback di default
      }
    }
    
    // Route corretto: /consulenze/:tipo/:id/prenota (senza parametri URL - il cliente li inserisce nel form)
    const consultationLink = `${baseUrl}/consulenze/${encodeURIComponent(job.jobType)}/${templateId}/prenota`;
    
    // 5. Invia notifica
    let eventMetadata: any = {
      templateId,
      templateNome: template.data.nome,
      channel,
      consultationLink
    };
    
    if (channel === 'email') {
      // Invia email
      const studioInfo = await getStudioContactInfo();
      
      const subject = `Prenota la tua consulenza - ${template.data.nome}`;
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #8b5a3c; text-align: center;">📸 Prenota la tua Consulenza</h2>
          <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <p style="font-size: 16px; margin-bottom: 15px;">
              Ciao <strong>${cliente.nome}</strong>,
            </p>
            <p style="font-size: 16px; margin-bottom: 20px;">
              È arrivato il momento di organizzare la tua <strong style="color: #8b5a3c;">${template.data.nome}</strong> 
              per il tuo evento <strong>${job.nomeEvento}</strong>!
            </p>
            
            <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">💬 Cosa faremo insieme</h3>
              <p style="margin: 8px 0;">✨ Discutere i dettagli del tuo evento</p>
              <p style="margin: 8px 0;">📸 Pianificare insieme il servizio fotografico</p>
              <p style="margin: 8px 0;">❓ Rispondere a tutte le tue domande</p>
              <p style="margin: 8px 0;"><strong>⏱️ Durata:</strong> ${template.data.durataMinuti} minuti</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${consultationLink}" 
                 style="display: inline-block; background: #8b5a3c; color: white; padding: 15px 30px; 
                        text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                📅 Prenota Consulenza
              </a>
            </div>

            <p style="font-size: 14px; color: #666; margin-top: 20px;">
              Non vedo l'ora di vederti! Se hai domande, non esitare a contattarmi.
            </p>

            <p style="font-size: 14px; margin-top: 20px;">
              A presto,<br>
              <strong>${studioInfo.name}</strong>
            </p>
          </div>
          
          <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
            <p style="margin: 5px 0; font-weight: 600;">${studioInfo.name}</p>
            ${studioInfo.address ? `<p style="margin: 5px 0;">${studioInfo.address}</p>` : ''}
            <p style="margin: 5px 0;">Email: ${studioInfo.email}</p>
            <p style="margin: 5px 0;">Tel: ${studioInfo.phone}</p>
          </div>
        </div>
      `;
      
      await sendGmailEmail(
        cliente.email,
        subject,
        htmlContent
      );
      
      eventMetadata.emailSent = true;
    } else {
      // WhatsApp
      const message = `Ciao ${cliente.nome}! 📸\n\nÈ arrivato il momento di prenotare la tua ${template.data.nome} per ${job.nomeEvento}.\n\nClicca qui per scegliere l'appuntamento: ${consultationLink}`;
      const whatsappNumber = cliente.whatsapp?.replace(/[^0-9]/g, '') || '';
      
      if (!whatsappNumber) {
        return res.status(400).json({ error: 'Cliente senza numero WhatsApp' });
      }
      
      eventMetadata.whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    }
    
    // 6. Salva evento timeline
    const timelineEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      jobId: id,
      tipo: 'consulenza_inviata',
      descrizione: `Richiesta consulenza "${template.data.nome}" inviata tramite ${channel}`,
      data: Timestamp.now(),
      metadata: eventMetadata
    };
    
    // Salva in job.workflowEvents
    await db.collection('jobs').doc(id).update({
      workflowEvents: FieldValue.arrayUnion(timelineEvent),
      updatedAt: Timestamp.now()
    });
    
    // Salva anche in jobTimeline collection (per "Attività Recenti")
    await db.collection('jobTimeline').add(timelineEvent);
    
    console.log(`✅ [Job ${id}] Richiesta consulenza inviata via ${channel}`);
    
    res.json({ 
      success: true,
      channel,
      consultationLink,
      whatsappLink: eventMetadata.whatsappLink,
      event: timelineEvent
    });
    
  } catch (error: any) {
    console.error('[Send Consultation Request] Error:', error);
    return res.status(500).json({ 
      error: 'Errore durante invio richiesta consulenza',
      details: error.message 
    });
  }
});

/**
 * POST /api/jobs/:id/timeline-events
 * Aggiunge evento generico alla timeline job
 * 
 * Body:
 * - tipo: string (es. 'appuntamento_creato')
 * - descrizione: string
 * - metadata: object (opzionale)
 */
router.post('/:id/timeline-events', async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, descrizione, metadata } = req.body;
    
    if (!tipo || !descrizione) {
      return res.status(400).json({ error: 'tipo e descrizione richiesti' });
    }
    
    // Verifica che job esista
    const jobDoc = await db.collection('jobs').doc(id).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: 'Job non trovato' });
    }
    
    // Crea evento timeline
    const timelineEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      jobId: id,
      tipo,
      descrizione,
      data: Timestamp.now(),
      metadata: metadata || {}
    };
    
    // Salva in Firestore
    await db.collection('jobs').doc(id).update({
      workflowEvents: FieldValue.arrayUnion(timelineEvent),
      updatedAt: Timestamp.now()
    });
    
    console.log(`✅ [Job ${id}] Evento timeline aggiunto: ${tipo}`);
    
    res.json({ 
      success: true,
      event: timelineEvent
    });
    
  } catch (error: any) {
    console.error('[Add Timeline Event] Error:', error);
    return res.status(500).json({ 
      error: 'Errore durante aggiunta evento timeline',
      details: error.message 
    });
  }
});

export default router;
