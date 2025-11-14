/**
 * CONSULTATION API ROUTES - Express.js
 * Gestisce endpoint per modulo Consulenze (templates e prenotazioni)
 */

import express, { Request, Response } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import * as consultationService from './services/consultations.js';
import { authenticateFirebase } from './email-routes.js';
import { 
  InsertConsultationTemplateSchema, 
  UpdateConsultationTemplateSchema,
  InsertConsultationSchema,
  UpdateConsultationSchema,
  type ConsultationStatus
} from '../shared/consultation-types.js';
import { db, Timestamp, FieldValue, storage } from './firebase-admin.js';
import { createEvent, deleteEvent } from './google-calendar.js';
import multer from 'multer';

const router = express.Router();

/**
 * ========================================
 * AUTH MIDDLEWARE
 * ========================================
 */

interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
  };
}

/**
 * Admin emails (consistente con email-routes.ts)
 */
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

/**
 * Helper: Normalizza Firestore Timestamp in Date
 * Gestisce: { seconds, nanoseconds }, .toDate(), ISO string, Date object
 */
function normalizeTimestampToDate(timestamp: any): Date {
  if (!timestamp) {
    throw new Error('Timestamp is null or undefined');
  }
  
  // Firestore Timestamp serializzato come { seconds, nanoseconds }
  if (typeof timestamp === 'object' && 'seconds' in timestamp) {
    return new Date(timestamp.seconds * 1000);
  }
  
  // Firestore Timestamp con metodo .toDate()
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  
  // ISO string o Date object
  return new Date(timestamp);
}

/**
 * Multer setup per upload immagini template
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max per immagine
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo immagini JPEG, PNG o WebP sono consentite'));
    }
  },
});

/**
 * ========================================
 * TEMPLATE ENDPOINTS (Admin only)
 * ========================================
 */

/**
 * GET /api/consultations/templates
 * Ottiene tutti i template consulenze (admin)
 */
router.get('/templates', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono accedere ai template' });
    }

    const templates = await consultationService.getAllTemplates();
    res.json(templates);
  } catch (error: any) {
    console.error('[GET /templates] Errore:', error.message);
    res.status(500).json({ error: 'Errore recupero template' });
  }
});

/**
 * GET /api/consultations/templates/:id
 * Ottiene template singolo per ID (pubblico per booking flow)
 */
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const template = await consultationService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({ error: 'Template non trovato' });
    }

    res.json(template);
  } catch (error: any) {
    console.error('[GET /templates/:id] Errore:', error.message);
    res.status(500).json({ error: 'Errore recupero template' });
  }
});

/**
 * GET /api/consultations/templates/by-job-type/:jobType
 * Ottiene template attivi per tipo lavoro (pubblico)
 */
router.get('/templates/by-job-type/:jobType', async (req, res) => {
  try {
    const { jobType } = req.params;
    const templates = await consultationService.getActiveTemplatesByJobType(jobType);
    res.json(templates);
  } catch (error: any) {
    console.error('[GET /templates/by-job-type] Errore:', error.message);
    res.status(500).json({ error: 'Errore recupero template' });
  }
});

/**
 * GET /api/consultations/job-types
 * Ottiene lista tipi lavoro con template attivi (pubblico)
 */
router.get('/job-types', async (req, res) => {
  try {
    const jobTypes = await consultationService.getJobTypesWithActiveTemplates();
    res.json(jobTypes);
  } catch (error: any) {
    console.error('[GET /job-types] Errore:', error.message);
    res.status(500).json({ error: 'Errore recupero tipi lavoro' });
  }
});

/**
 * POST /api/consultations/templates
 * Crea nuovo template (admin only)
 */
router.post('/templates', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono creare template' });
    }

    // Validazione Zod
    const validatedData = InsertConsultationTemplateSchema.parse(req.body);

    const templateId = await consultationService.createTemplate(validatedData);

    res.status(201).json({ 
      id: templateId,
      message: 'Template creato con successo'
    });
  } catch (error: any) {
    console.error('[POST /templates] Errore:', error.message);

    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Dati non validi', 
        details: error.errors 
      });
    }

    res.status(500).json({ error: 'Errore creazione template' });
  }
});

/**
 * PATCH /api/consultations/templates/:id
 * Aggiorna template esistente (admin only)
 */
router.patch('/templates/:id', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono modificare template' });
    }

    const { id } = req.params;

    // Validazione Zod
    const validatedData = UpdateConsultationTemplateSchema.parse(req.body);

    await consultationService.updateTemplate(id, validatedData);

    res.json({ message: 'Template aggiornato con successo' });
  } catch (error: any) {
    console.error('[PATCH /templates/:id] Errore:', error.message);

    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Dati non validi', 
        details: error.errors 
      });
    }

    if (error.message.includes('non trovato')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: 'Errore aggiornamento template' });
  }
});

/**
 * DELETE /api/consultations/templates/:id
 * Elimina template (admin only)
 */
router.delete('/templates/:id', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono eliminare template' });
    }

    const { id } = req.params;

    await consultationService.deleteTemplate(id);

    res.json({ message: 'Template eliminato con successo' });
  } catch (error: any) {
    console.error('[DELETE /templates/:id] Errore:', error.message);

    if (error.message.includes('consultations attive')) {
      return res.status(409).json({ 
        error: 'Impossibile eliminare template con consultations attive' 
      });
    }

    res.status(500).json({ error: 'Errore eliminazione template' });
  }
});

/**
 * ========================================
 * CONSULTATION ENDPOINTS
 * ========================================
 */

/**
 * GET /api/consultations
 * Ottiene tutte le consultations con filtri opzionali (admin)
 */
router.get('/', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono accedere alle consultations' });
    }

    const { stato, jobType, templateId, dateFrom, dateTo } = req.query;

    const filters: any = {};

    if (stato) {
      // Supporta sia singolo che multipli stati (comma-separated)
      filters.stato = typeof stato === 'string' 
        ? stato.split(',') as ConsultationStatus[]
        : stato as ConsultationStatus[];
    }

    if (jobType) {
      filters.jobType = jobType as string;
    }

    if (templateId) {
      filters.templateId = templateId as string;
    }

    if (dateFrom) {
      filters.dateFrom = new Date(dateFrom as string);
    }

    if (dateTo) {
      filters.dateTo = new Date(dateTo as string);
    }

    const consultations = await consultationService.getAllConsultations(filters);
    res.json(consultations);
  } catch (error: any) {
    console.error('[GET /consultations] Errore:', error.message);
    res.status(500).json({ error: 'Errore recupero consultations' });
  }
});

/**
 * GET /api/consultations/:id
 * Ottiene consultation singola per ID
 */
router.get('/:id', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono accedere alle consultations' });
    }

    const { id } = req.params;
    const consultation = await consultationService.getConsultationById(id);

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation non trovata' });
    }

    res.json(consultation);
  } catch (error: any) {
    console.error('[GET /consultations/:id] Errore:', error.message);
    res.status(500).json({ error: 'Errore recupero consultation' });
  }
});

/**
 * POST /api/consultations/available-slots
 * Calcola slot disponibili per data e template
 */
router.post('/available-slots', async (req, res) => {
  try {
    console.log('[POST /available-slots] Request body:', req.body);
    const { date, templateId } = req.body;

    if (!date || !templateId) {
      console.log('[POST /available-slots] Parametri mancanti:', { date, templateId });
      return res.status(400).json({ 
        error: 'Parametri mancanti (date, templateId richiesti)' 
      });
    }

    // Recupera template per durata
    console.log('[POST /available-slots] Recupero template:', templateId);
    const template = await consultationService.getTemplateById(templateId);

    if (!template) {
      console.log('[POST /available-slots] Template non trovato:', templateId);
      return res.status(404).json({ error: 'Template non trovato' });
    }

    if (!template.attiva) {
      console.log('[POST /available-slots] Template non attivo:', templateId);
      return res.status(400).json({ error: 'Template non attivo' });
    }

    console.log('[POST /available-slots] Calcolo slot per date:', date, 'durata:', template.durataMinuti);
    const slots = await consultationService.getAvailableSlotsForDate(
      new Date(date),
      template.durataMinuti,
      undefined, // workingHours - usa template customWorkingHours se presente
      template   // passa template per excludedDays e customWorkingHours
    );

    console.log('[POST /available-slots] Slot calcolati:', slots.length);
    res.json({ slots });
  } catch (error: any) {
    console.error('[POST /available-slots] Errore completo:', error);
    console.error('[POST /available-slots] Stack:', error.stack);
    res.status(500).json({ error: 'Errore calcolo slot disponibili' });
  }
});

/**
 * POST /api/consultations/create
 * Crea nuova consultation (pubblico)
 */
router.post('/create', async (req, res) => {
  try {
    // Validazione base dati
    const { templateId, cliente, dataConsulenza, orarioInizio, orarioFine, jobDataCollected, note } = req.body;

    // Validazione Zod (dataConsulenza coerced ISO string → Date in schema)
    const validatedData = InsertConsultationSchema.parse({
      templateId,
      cliente,
      dataConsulenza,  // z.coerce.date() converts string → Date automatically
      orarioInizio,
      orarioFine,
      jobDataCollected: jobDataCollected || {},
      note: note || '',
    });

    // Recupera template
    const template = await consultationService.getTemplateById(templateId);

    if (!template) {
      return res.status(404).json({ error: 'Template non trovato' });
    }

    if (!template.attiva) {
      return res.status(400).json({ error: 'Template non attivo' });
    }

    // Validazione durata slot (deve matchare template durataMinuti)
    const [startH, startM] = validatedData.orarioInizio.split(':').map(Number);
    const [endH, endM] = validatedData.orarioFine.split(':').map(Number);

    const slotStartMinutes = startH * 60 + startM;
    const slotEndMinutes = endH * 60 + endM;
    const slotDuration = slotEndMinutes - slotStartMinutes;

    if (slotDuration !== template.durataMinuti) {
      return res.status(400).json({ 
        error: 'Durata slot non valida',
        message: `Lo slot deve avere durata ${template.durataMinuti} minuti (ricevuto: ${slotDuration} minuti)`
      });
    }

    // Verifica disponibilità slot (conflict detection)
    const isAvailable = await consultationService.isSlotAvailable(
      validatedData.dataConsulenza,
      validatedData.orarioInizio,
      validatedData.orarioFine
    );

    if (!isAvailable) {
      return res.status(409).json({ 
        error: 'Slot non disponibile',
        message: 'Lo slot selezionato non è più disponibile. Scegli un altro orario.'
      });
    }

    // Crea consultation
    // Note: validatedData has Date from z.coerce.date(), service layer expects Date
    const consultationId = await consultationService.createConsultation(
      validatedData as any,  // Type assertion needed: InsertConsultation (string) vs validated (Date)
      template
    );

    // Invia email conferma ricezione (task 13)
    let emailStatus = 'sent';
    try {
      const { sendGmailEmail, getStudioContactInfo, createConsultationReceivedEmailHTML, createAdminNotificationEmailHTML } = await import('./email-routes.js');
      const studioInfo = await getStudioContactInfo();

      const clienteName = `${validatedData.cliente.nome} ${validatedData.cliente.cognome}`;
      const formattedDate = validatedData.dataConsulenza.toLocaleDateString('it-IT', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // 1. Email cliente
      const htmlContent = createConsultationReceivedEmailHTML(
        clienteName,
        template.jobType,
        formattedDate,
        `${validatedData.orarioInizio} - ${validatedData.orarioFine}`,
        studioInfo,
        undefined  // No calendarLink for pending consultations
      );

      await sendGmailEmail(
        validatedData.cliente.email,
        `Richiesta Consulenza Ricevuta - ${template.jobType}`,
        htmlContent
      );

      console.log(`✅ Email "Consulenza Ricevuta" inviata a ${validatedData.cliente.email}`);
      
      // 2. Email notifica admin (nuova richiesta consulenza)
      try {
        const adminEmail = studioInfo.email; // Email admin dallo studio
        const adminEmailHTML = createAdminNotificationEmailHTML(
          clienteName,
          validatedData.cliente.email,
          validatedData.cliente.whatsapp,
          template.jobType,
          formattedDate,
          `${validatedData.orarioInizio} - ${validatedData.orarioFine}`,
          null, // productName (non applicabile per consulenze)
          validatedData.note,
          studioInfo
        );
        
        await sendGmailEmail(
          adminEmail,
          `Nuova Richiesta Consulenza - ${template.jobType}`,
          adminEmailHTML
        );
        
        console.log(`✅ Email notifica admin consulenza inviata a ${adminEmail}`);
      } catch (adminEmailError) {
        console.error('⚠️ Errore invio email notifica admin consulenza:', adminEmailError);
        // Non bloccare la creazione se email admin fallisce
      }
    } catch (emailError: any) {
      console.error('⚠️ Errore invio email consulenza ricevuta:', emailError.message);
      emailStatus = 'failed';
    }

    res.status(201).json({ 
      id: consultationId,
      message: 'Consultation creata con successo',
      emailStatus
    });
  } catch (error: any) {
    console.error('[POST /create] Errore:', error.message);

    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Dati non validi', 
        details: error.errors 
      });
    }

    res.status(500).json({ error: 'Errore creazione consultation' });
  }
});

/**
 * PATCH /api/consultations/:id/approve
 * Approva consultation e crea evento Google Calendar (admin only)
 */
router.patch('/:id/approve', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono approvare consultations' });
    }

    const { id } = req.params;

    const consultation = await consultationService.getConsultationById(id);

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation non trovata' });
    }

    if (consultation.stato !== 'in_attesa') {
      return res.status(400).json({ 
        error: 'Consultation già processata',
        stato: consultation.stato
      });
    }

    // Crea evento Google Calendar
    const consultationDate = normalizeTimestampToDate(consultation.dataConsulenza);
    const [startHour, startMin] = consultation.orarioInizio.split(':').map(Number);
    const [endHour, endMin] = consultation.orarioFine.split(':').map(Number);

    const startDateTime = new Date(consultationDate);
    startDateTime.setHours(startHour, startMin, 0, 0);

    const endDateTime = new Date(consultationDate);
    endDateTime.setHours(endHour, endMin, 0, 0);

    const calendarEvent = await createEvent('primary', {
      summary: `Consulenza ${consultation.jobType} - ${consultation.cliente.nome} ${consultation.cliente.cognome}`,
      description: `Template: ${consultation.templateNome}\nCliente: ${consultation.cliente.nome} ${consultation.cliente.cognome}\nEmail: ${consultation.cliente.email}\nWhatsApp: ${consultation.cliente.whatsapp}\nNote: ${consultation.note || 'Nessuna'}`,
      start: startDateTime,
      end: endDateTime,
      attendees: [consultation.cliente.email],
    });

    const eventId = calendarEvent.id;

    // Aggiorna consultation con compensating transaction (rollback Calendar su errore)
    try {
      // Prepara updates (ometti googleCalendarEventId se null/undefined)
      const consultationUpdates: any = {
        stato: 'confermata',
      };
      if (eventId) {
        consultationUpdates.googleCalendarEventId = eventId;
      }

      await consultationService.updateConsultation(id, consultationUpdates);

      // Aggiorna metadata conferma
      await db.collection('consultations').doc(id).update({
        confermataDa: req.body.userId || 'admin', // TODO: Auth middleware
        confermatail: Timestamp.now(),
      });
    } catch (updateError: any) {
      // Rollback completo: elimina evento Calendar E revert consultation a stato in_attesa
      console.error('[approve] Errore update Firestore, eseguo rollback completo:', updateError.message);
      try {
        // Step 1: Elimina evento Google Calendar appena creato
        if (eventId) {
          await deleteEvent('primary', eventId);
          console.log(`[approve] Rollback step 1 - evento Calendar ${eventId} eliminato`);
        }

        // Step 2: Revert consultation a stato in_attesa (annulla updateConsultation)
        await consultationService.updateConsultation(id, {
          stato: 'in_attesa',
        });

        // Step 3: Clear googleCalendarEventId usando FieldValue.delete()
        await db.collection('consultations').doc(id).update({
          googleCalendarEventId: FieldValue.delete(),
        });
        console.log(`[approve] Rollback step 2-3 - consultation ${id} ripristinata a stato in_attesa`);

      } catch (rollbackError: any) {
        console.error('[approve] ERRORE CRITICO: Fallito rollback completo', rollbackError.message);
      }

      return res.status(500).json({ 
        error: 'Errore approvazione',
        message: 'Impossibile salvare la conferma. L\'evento Calendar è stato cancellato e la consultation è stata ripristinata.'
      });
    }

    // Invia email conferma (task 13)
    let emailStatus = 'sent';
    try {
      const { sendGmailEmail, getStudioContactInfo, createConsultationApprovedEmailHTML, generateGoogleCalendarLink } = await import('./email-routes.js');
      const studioInfo = await getStudioContactInfo();

      const clienteName = `${consultation.cliente.nome} ${consultation.cliente.cognome}`;
      const formattedDate = consultationDate.toLocaleDateString('it-IT', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // Generate Google Calendar "Add to Calendar" link
      const calendarLink = generateGoogleCalendarLink({
        title: `Consulenza ${consultation.jobType} - ${clienteName}`,
        description: `Consulenza per ${consultation.jobType}\nCliente: ${clienteName}\n\n${studioInfo.name}\nTel: ${studioInfo.phone}`,
        location: studioInfo.address,
        startDate: startDateTime,
        endDate: endDateTime,
        isAllDay: false
      });

      const htmlContent = createConsultationApprovedEmailHTML(
        clienteName,
        consultation.jobType,
        formattedDate,
        `${consultation.orarioInizio} - ${consultation.orarioFine}`,
        null, // meetingLink
        studioInfo,
        calendarLink
      );

      await sendGmailEmail(
        consultation.cliente.email,
        `Consulenza Confermata - ${consultation.jobType}`,
        htmlContent
      );

      console.log(`✅ Email "Consulenza Approvata" inviata a ${consultation.cliente.email}`);
    } catch (emailError: any) {
      console.error('⚠️ Errore invio email consulenza approvata:', emailError.message);
      emailStatus = 'failed';
    }

    res.json({ 
      message: 'Consultation approvata con successo',
      googleCalendarEventId: eventId,
      emailStatus
    });
  } catch (error: any) {
    console.error('[PATCH /:id/approve] Errore:', error.message);
    res.status(500).json({ error: 'Errore approvazione consultation' });
  }
});

/**
 * PATCH /api/consultations/:id/reject
 * Rifiuta consultation (admin only)
 */
router.patch('/:id/reject', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono rifiutare consultations' });
    }

    const { id } = req.params;
    const { motivo } = req.body;

    const consultation = await consultationService.getConsultationById(id);

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation non trovata' });
    }

    if (consultation.stato !== 'in_attesa') {
      return res.status(400).json({ 
        error: 'Consultation già processata',
        stato: consultation.stato
      });
    }

    // Aggiorna stato
    await consultationService.updateConsultation(id, {
      stato: 'annullata',
      note: consultation.note + `\n[RIFIUTATA] ${motivo || 'Nessun motivo specificato'}`,
    });

    // Invia email rifiuto (task 13)
    let emailStatus = 'sent';
    try {
      const { sendGmailEmail, getStudioContactInfo, createConsultationRejectedEmailHTML } = await import('./email-routes.js');
      const studioInfo = await getStudioContactInfo();

      const clienteName = `${consultation.cliente.nome} ${consultation.cliente.cognome}`;
      const rawDate = normalizeTimestampToDate(consultation.dataConsulenza);
      const formattedDate = rawDate.toLocaleDateString('it-IT', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      const htmlContent = createConsultationRejectedEmailHTML(
        clienteName,
        consultation.jobType,
        formattedDate,
        `${consultation.orarioInizio} - ${consultation.orarioFine}`,
        motivo || null,
        studioInfo
      );

      await sendGmailEmail(
        consultation.cliente.email,
        `Aggiornamento Consulenza - ${consultation.jobType}`,
        htmlContent
      );

      console.log(`✅ Email "Consulenza Rifiutata" inviata a ${consultation.cliente.email}`);
    } catch (emailError: any) {
      console.error('⚠️ Errore invio email consulenza rifiutata:', emailError.message);
      emailStatus = 'failed';
    }

    res.json({ 
      message: 'Consultation rifiutata con successo',
      emailStatus
    });
  } catch (error: any) {
    console.error('[PATCH /:id/reject] Errore:', error.message);
    res.status(500).json({ error: 'Errore rifiuto consultation' });
  }
});

/**
 * PATCH /api/consultations/:id/complete
 * Marca consultation come completata (admin only)
 */
router.patch('/:id/complete', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono completare consultations' });
    }

    const { id } = req.params;

    const consultation = await consultationService.getConsultationById(id);

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation non trovata' });
    }

    if (consultation.stato !== 'confermata') {
      return res.status(400).json({ 
        error: 'Solo consultations confermate possono essere completate'
      });
    }

    await consultationService.updateConsultation(id, {
      stato: 'completata',
    });

    res.json({ message: 'Consultation completata con successo' });
  } catch (error: any) {
    console.error('[PATCH /:id/complete] Errore:', error.message);
    res.status(500).json({ error: 'Errore completamento consultation' });
  }
});

/**
 * POST /api/consultations/:id/convert-to-job
 * Converte consultation in job (admin only)
 */
router.post('/:id/convert-to-job', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono convertire consultations in job' });
    }

    const { id } = req.params;

    const consultation = await consultationService.getConsultationById(id);

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation non trovata' });
    }

    if (consultation.jobCreated) {
      return res.status(400).json({ 
        error: 'Consultation già convertita in job',
        jobId: consultation.jobId
      });
    }

    // Campi standard mappabili consultation → job
    const STANDARD_FIELD_KEYS = ['eventDate', 'eventLocation', 'rituLocation', 'rituTime', 'startTime', 'endTime', 'allDay'];
    
    // Mappa campi standard da jobDataCollected
    const eventDate = consultation.jobDataCollected.eventDate 
      ? new Date(consultation.jobDataCollected.eventDate as string)
      : (() => {
          // Fallback: data consulenza + 3 mesi
          const estimatedDate = normalizeTimestampToDate(consultation.dataConsulenza);
          estimatedDate.setMonth(estimatedDate.getMonth() + 3);
          return estimatedDate;
        })();

    const allDay = !consultation.jobDataCollected.startTime;
    
    // Costruisci noteInterne solo con campi EXTRA (non mappati)
    const extraFields: Record<string, any> = {};
    for (const [key, value] of Object.entries(consultation.jobDataCollected || {})) {
      if (!STANDARD_FIELD_KEYS.includes(key)) {
        extraFields[key] = value;
      }
    }
    
    const noteParts = [`Creato da consulenza #${id}`];
    if (Object.keys(extraFields).length > 0) {
      noteParts.push(`\nDati aggiuntivi raccolti durante consulenza:\n${JSON.stringify(extraFields, null, 2)}`);
    }
    if (consultation.note) {
      noteParts.push(`\nNote consulenza:\n${consultation.note}`);
    }

    // Prepara dati job da consultation
    const jobData: any = {
      nomeEvento: `${consultation.jobType} - ${consultation.cliente.nome} ${consultation.cliente.cognome}`,
      clientiIds: consultation.clienteId ? [consultation.clienteId] : [],
      jobType: consultation.jobType,
      provenance: 'consulenza',
      eventDate,
      allDay,
      startTime: consultation.jobDataCollected.startTime as string || undefined,
      endTime: consultation.jobDataCollected.endTime as string || undefined,
      eventLocation: consultation.jobDataCollected.eventLocation as string || undefined,
      rituLocation: consultation.jobDataCollected.rituLocation as string || undefined,
      rituTime: consultation.jobDataCollected.rituTime as string || undefined,
      noteInterne: noteParts.join('\n'),
    };

    // Crea job (riutilizza logica jobs esistente)
    const jobRef = await db.collection('jobs').add({
      ...jobData,
      consultationId: id, // Riferimento bidirezionale per cleanup
      status: 'lead',
      financials: {
        totalePreventivato: 0,
        totaleOrdini: 0,
        totalePagato: 0,
        saldoResiduo: 0,
      },
      pdfs: [],
      costi: [],
      orderIds: [],
      galleryIds: [],
      quoteIds: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: req.body.userId || 'admin', // TODO: Auth middleware
      jobSource: 'consultation',
    });

    // Aggiorna consultation con job ID
    await consultationService.updateConsultation(id, {
      jobCreated: true,
      jobId: jobRef.id,
    });

    res.json({ 
      message: 'Consultation convertita in job con successo',
      jobId: jobRef.id
    });
  } catch (error: any) {
    console.error('[POST /:id/convert-to-job] Errore:', error.message);
    res.status(500).json({ error: 'Errore conversione consultation in job' });
  }
});

/**
 * DELETE /api/consultations/:id
 * Elimina consultation (admin può eliminare in qualsiasi stato)
 * Se confermata, invia email di cancellazione al cliente
 * 
 * Query params opzionali:
 * - cancellationReason: motivo della cancellazione (mostrato in email)
 */
router.delete('/:id', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono eliminare consultations' });
    }

    const { id } = req.params;
    const { cancellationReason } = req.query;

    const consultation = await consultationService.getConsultationById(id);

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation non trovata' });
    }

    // Se consultation confermata, invia email di cancellazione al cliente
    if (consultation.stato === 'confermata') {
      try {
        // Recupera template per nome jobType
        const template = await consultationService.getTemplateById(consultation.templateId);
        
        // Formatta data e orario per email
        let dataConsulenza: Date;
        if (consultation.dataConsulenza && typeof consultation.dataConsulenza === 'object' && 'seconds' in consultation.dataConsulenza) {
          dataConsulenza = new Date((consultation.dataConsulenza as any).seconds * 1000);
        } else {
          dataConsulenza = new Date(consultation.dataConsulenza as any);
        }
        
        const consultationDate = format(dataConsulenza, 'dd MMMM yyyy', { locale: it });
        const consultationTime = `${consultation.orarioInizio} - ${consultation.orarioFine}`;

        // Invia email cancellazione (fire-and-forget, non blocca eliminazione)
        axios.post(`${process.env.BASE_URL || 'http://localhost:5000'}/api/email/send-consultation-cancelled`, {
          recipientEmail: consultation.cliente.email,
          clienteName: `${consultation.cliente.nome} ${consultation.cliente.cognome}`,
          jobType: template?.nome || 'Consulenza',
          consultationDate,
          consultationTime,
          cancellationReason: cancellationReason || null
        }).catch((emailError) => {
          console.warn('[DELETE] Errore invio email cancellazione (non bloccante):', emailError.message);
        });
        
        console.log(`📧 Email cancellazione inviata a ${consultation.cliente.email}`);
      } catch (emailError: any) {
        console.warn('[DELETE] Errore preparazione email cancellazione:', emailError.message);
        // Continua comunque con eliminazione
      }
    }

    // Elimina evento Google Calendar se presente
    if (consultation.googleCalendarEventId) {
      try {
        await deleteEvent('primary', consultation.googleCalendarEventId);
        console.log(`📅 Evento Google Calendar ${consultation.googleCalendarEventId} eliminato`);
      } catch (calError: any) {
        console.warn('[DELETE] Errore eliminazione evento Calendar:', calError.message);
        // Continua comunque con eliminazione consultation
      }
    }

    // FIX #1: Cleanup riferimento bidirezionale job → consultation
    if (consultation.jobCreated && consultation.jobId) {
      try {
        const jobRef = db.collection('jobs').doc(consultation.jobId);
        const jobSnap = await jobRef.get();
        
        if (jobSnap.exists) {
          // Rimuovi consultationId dal job
          await jobRef.update({
            consultationId: FieldValue.delete(),
            updatedAt: Timestamp.now(),
          });
          console.log(`✅ Riferimento consultationId rimosso dal job ${consultation.jobId}`);
        } else {
          console.warn(`⚠️ Job ${consultation.jobId} non trovato per cleanup`);
        }
      } catch (jobError: any) {
        console.warn('[DELETE] Errore cleanup job reference:', jobError.message);
        // Continua comunque con eliminazione consultation
      }
    }

    // Elimina consultation da Firestore
    await consultationService.deleteConsultation(id);

    res.json({ 
      message: 'Consultation eliminata con successo',
      emailSent: consultation.stato === 'confermata'
    });
  } catch (error: any) {
    console.error('[DELETE /:id] Errore:', error.message);
    res.status(500).json({ error: 'Errore eliminazione consultation' });
  }
});

/**
 * PATCH /api/consultations/:id/mark-viewed
 * Marca consultation come visualizzata da admin
 */
router.patch('/:id/mark-viewed', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono marcare consultations come visualizzate' });
    }

    const { id } = req.params;

    const consultation = await consultationService.getConsultationById(id);

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation non trovata' });
    }

    if (!consultation.dataVisualizzazione) {
      await db.collection('consultations').doc(id).update({
        dataVisualizzazione: Timestamp.now(),
      });
    }

    res.json({ message: 'Consultation marcata come visualizzata' });
  } catch (error: any) {
    console.error('[PATCH /:id/mark-viewed] Errore:', error.message);
    res.status(500).json({ error: 'Errore aggiornamento consultation' });
  }
});

/**
 * ========================================
 * TEMPLATE IMAGE UPLOAD ENDPOINTS
 * ========================================
 */

/**
 * POST /api/consultations/templates/:id/upload-image
 * Upload immagine per template (admin only, max 10 immagini)
 */
router.post('/templates/:id/upload-image', authenticateFirebase, upload.single('image'), async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono caricare immagini' });
    }

    const { id } = req.params;

    // Verifica template esistente
    const template = await consultationService.getTemplateById(id);
    if (!template) {
      return res.status(404).json({ error: 'Template non trovato' });
    }

    // Limite 10 immagini per template
    const currentImages = template.imageUrls || [];
    if (currentImages.length >= 10) {
      return res.status(400).json({ 
        error: 'Limite raggiunto', 
        message: 'Massimo 10 immagini per template' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nessun file caricato' });
    }

    const bucket = storage.bucket();
    const timestamp = Date.now();
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `consultation-templates/${id}/${timestamp}_${safeName}`;
    
    const file = bucket.file(storagePath);

    // Upload immagine (privata con signed URL)
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
        metadata: {
          uploadedAt: new Date().toISOString(),
          originalName: req.file.originalname,
          templateId: id,
        },
      },
    });

    // Genera signed URL (5 anni validità)
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 5 * 365 * 24 * 60 * 60 * 1000, // 5 anni
    });

    // Aggiorna template con nuovo URL
    await consultationService.updateTemplate(id, {
      imageUrls: [...currentImages, signedUrl],
    });

    console.log(`✅ Immagine caricata per template ${id}: ${req.file.originalname}`);

    res.json({ 
      message: 'Immagine caricata con successo',
      imageUrl: signedUrl
    });
  } catch (error: any) {
    console.error('[POST /templates/:id/upload-image] Errore:', error.message);
    
    if (error.message.includes('Solo immagini')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Errore upload immagine' });
  }
});

/**
 * DELETE /api/consultations/templates/:id/images
 * Elimina immagine da template (admin only)
 */
router.delete('/templates/:id/images', authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono eliminare immagini' });
    }

    const { id } = req.params;
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl obbligatorio nel body' });
    }

    // Verifica template esistente
    const template = await consultationService.getTemplateById(id);
    if (!template) {
      return res.status(404).json({ error: 'Template non trovato' });
    }

    const currentImages = template.imageUrls || [];
    
    if (!currentImages.includes(imageUrl)) {
      return res.status(404).json({ error: 'Immagine non trovata nel template' });
    }

    // Estrai storage path da signed URL (pattern: consultation-templates/{id}/{filename})
    // Gli signed URL hanno formato: https://storage.googleapis.com/{bucket}/consultation-templates/...
    const pathMatch = imageUrl.match(/consultation-templates\/[^?]+/);
    
    if (pathMatch) {
      const storagePath = pathMatch[0];
      
      try {
        const bucket = storage.bucket();
        await bucket.file(storagePath).delete();
        console.log(`✅ File eliminato da Storage: ${storagePath}`);
      } catch (storageError: any) {
        console.warn('[DELETE] Errore eliminazione file Storage:', storageError.message);
        // Continua comunque con rimozione da Firestore
      }
    }

    // Rimuovi URL da template
    const updatedImages = currentImages.filter(url => url !== imageUrl);
    await consultationService.updateTemplate(id, {
      imageUrls: updatedImages,
    });

    res.json({ message: 'Immagine eliminata con successo' });
  } catch (error: any) {
    console.error('[DELETE /templates/:id/images] Errore:', error.message);
    res.status(500).json({ error: 'Errore eliminazione immagine' });
  }
});

export default router;