/**
 * Job API Routes - Express.js
 * Gestisce endpoint per lavori fotografici
 */

import express from 'express';
import { getEvents } from './google-calendar.js';
import { db, Timestamp, FieldValue } from './firebase-admin.js';
import { sendGmailEmail, getStudioContactInfo } from './email-routes.js';

const router = express.Router();

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
    const templateDoc = await db.collection('consultation_templates').doc(templateId).get();
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
    
    // 4. Genera link consulenza pre-compilato
    const baseUrl = process.env.REPL_SLUG 
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : 'http://localhost:5000';
    
    const consultationLink = `${baseUrl}/consulenza/${templateId}?nome=${encodeURIComponent(cliente.nome)}&cognome=${encodeURIComponent(cliente.cognome)}&email=${encodeURIComponent(cliente.email)}&whatsapp=${encodeURIComponent(cliente.whatsapp || '')}&jobId=${id}`;
    
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
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #8b5a3c 0%, #6d4c3a 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #8b5a3c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📸 Prenota la tua consulenza</h1>
            </div>
            <div class="content">
              <p>Ciao <strong>${cliente.nome}</strong>,</p>
              <p>È arrivato il momento di organizzare la tua <strong>${template.data.nome}</strong> per il tuo evento <strong>${job.nomeEvento}</strong>!</p>
              <p>Clicca sul pulsante qui sotto per prenotare l'appuntamento che preferisci:</p>
              <div style="text-align: center;">
                <a href="${consultationLink}" class="button">Prenota Consulenza</a>
              </div>
              <p>Durante la consulenza potremo:</p>
              <ul>
                <li>Discutere i dettagli del tuo evento</li>
                <li>Pianificare insieme il servizio fotografico</li>
                <li>Rispondere a tutte le tue domande</li>
              </ul>
              <p>Non vedo l'ora di vederti!</p>
              <p>A presto,<br><strong>${studioInfo.name}</strong></p>
            </div>
            <div class="footer">
              <p>${studioInfo.name}<br>
              📧 ${studioInfo.email} | 📱 ${studioInfo.phone}</p>
            </div>
          </div>
        </body>
        </html>
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
    
    await db.collection('jobs').doc(id).update({
      workflowEvents: FieldValue.arrayUnion(timelineEvent),
      updatedAt: Timestamp.now()
    });
    
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
