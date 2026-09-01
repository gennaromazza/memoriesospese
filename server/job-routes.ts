/**
 * Job API Routes - Express.js
 * Gestisce endpoint per lavori fotografici
 */

import express from 'express';
import { DateTime } from 'luxon';
import { getEvents, createEvent, updateEvent, createEuropeRomeDate, getEventById } from './google-calendar.js';
import { db, Timestamp, FieldValue } from './firebase-admin.js';
import { sendGmailEmail, getStudioContactInfo, getSiteBaseUrl, authenticateFirebase } from './email-routes.js';
import { formatPhoneForWhatsApp } from '../shared/phone-utils.js';
import { recomputeJobAggregates } from './job-aggregates.js';

const router = express.Router();

const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

function requireAdmin(req: any, res: express.Response, next: express.NextFunction) {
  if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
    return res.status(403).json({ error: 'Accesso negato: solo admin' });
  }
  next();
}

function getJobCalendarColorId(status: string, hasSignedQuote: boolean): string {
  if (hasSignedQuote || status === 'confermato') return '2';
  if (status === 'lead' || status === 'preventivo_inviato') return '6';
  if (status === 'consegnato') return '10';
  if (status === 'archiviato') return '4';
  if (status === 'shooting_fatto') return '3';
  if (status === 'selezione_pending') return '5';
  if (status === 'produzione') return '9';
  return '8';
}

async function buildCalendarDescription(jobId: string, job: any): Promise<{ summary: string; description: string; colorId: string }> {
  let clientiNomi: string[] = [];
  if (job.clientiIds && job.clientiIds.length > 0) {
    const clientiPromises = job.clientiIds.map(async (clienteId: string) => {
      try {
        const clienteDoc = await db.collection('clienti').doc(clienteId).get();
        if (clienteDoc.exists) {
          const c = clienteDoc.data();
          return c?.nome && c?.cognome ? `${c.nome} ${c.cognome}` : (c?.nome || c?.cognome || clienteId);
        }
      } catch (e) { /* ignore */ }
      return null;
    });
    const results = await Promise.all(clientiPromises);
    clientiNomi = results.filter((n): n is string => n !== null);
  }

  let signedQuoteUrl: string | null = null;
  let hasSignedQuote = false;
  if (job.quoteIds && job.quoteIds.length > 0) {
    const baseUrl = getSiteBaseUrl();
    for (const quoteId of job.quoteIds) {
      try {
        const quoteDoc = await db.collection('quotes').doc(quoteId).get();
        if (quoteDoc.exists) {
          const quote = quoteDoc.data();
          if (quote?.status === 'firmato' || quote?.signature?.signedAt) {
            signedQuoteUrl = quote?.publicToken
              ? `${baseUrl}/quote/${quote.publicToken}`
              : `${baseUrl}/preventivo/${quoteId}`;
            hasSignedQuote = true;
            break;
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  const descriptionParts: string[] = [];

  if (clientiNomi.length > 0) {
    descriptionParts.push(`👥 Clienti: ${clientiNomi.join(', ')}`);
  }

  if (job.startTime && job.endTime) {
    descriptionParts.push(`⏰ Orario: ${job.startTime} - ${job.endTime}`);
  }

  if (job.eventLocation) {
    descriptionParts.push(`📍 Location: ${job.eventLocation}`);
  }

  if (job.rituLocation) {
    const rituInfo = job.rituTime ? `${job.rituLocation} (${job.rituTime})` : job.rituLocation;
    descriptionParts.push(`⛪ Rito: ${rituInfo}`);
  }

  if (job.appuntamentiClienti && job.appuntamentiClienti.length > 0) {
    const appuntamentiStr = job.appuntamentiClienti.map((app: any) => {
      const dataApp = app.data?.toDate ? DateTime.fromJSDate(app.data.toDate(), { zone: 'Europe/Rome' }).toFormat('dd/MM/yyyy') : '';
      return `${app.titolo || 'Appuntamento'}: ${dataApp}${app.ora ? ` ${app.ora}` : ''}${app.luogo ? ` - ${app.luogo}` : ''}`;
    }).join('\n  ');
    descriptionParts.push(`📅 Appuntamenti:\n  ${appuntamentiStr}`);
  }

  if (signedQuoteUrl) {
    descriptionParts.push(`📄 Preventivo firmato: ${signedQuoteUrl}`);
  }

  const statusLabel = hasSignedQuote ? 'Contratto firmato' : (job.status || 'N/A');
  descriptionParts.push(`\n---\nJob ID: ${jobId}\nStatus: ${statusLabel}\nProvenienza: ${job.provenance || 'N/A'}`);

  const statusPrefix = hasSignedQuote || job.status === 'confermato'
    ? '✅'
    : job.status === 'lead'
      ? '⏳ LEAD -'
      : '📸';

  const summary = `${statusPrefix} ${job.nomeEvento} (${job.jobType})`;
  const description = descriptionParts.join('\n');
  const colorId = getJobCalendarColorId(job.status, hasSignedQuote);

  return { summary, description, colorId };
}

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
    
    let job = jobDoc.data()!;
    
    // 2. Validation: job deve avere eventDate e non essere in fase di trattativa
    if (job.dataNonDefinita) {
      return { success: false, error: 'Job in trattativa - data non definita, impossibile sincronizzare con Calendar' };
    }
    if (!job.eventDate) {
      return { success: false, error: 'Job senza eventDate' };
    }
    
    // 3. Se ha googleCalendarEventId, verifica se esiste ancora su Calendar
    let hadStaleId = false;  // Flag per distinguere 'recreated' vs 'created'
    
    if (job.googleCalendarEventId) {
      console.log(`ℹ️  Job ${jobId} ha Calendar ID ${job.googleCalendarEventId}, verifico esistenza...`);
      
      const existingEvent = await getEventById('primary', job.googleCalendarEventId);
      
      if (existingEvent) {
        console.log(`📝 Calendar event ${job.googleCalendarEventId} esiste - aggiorno descrizione...`);
        const { summary, description, colorId } = await buildCalendarDescription(jobId, job);
        try {
          await updateEvent('primary', job.googleCalendarEventId, {
            summary,
            description,
            location: job.eventLocation,
            colorId,
          });
          console.log(`✅ Calendar event ${job.googleCalendarEventId} aggiornato con descrizione corrente`);
        } catch (updateError: any) {
          console.warn(`⚠️ Errore aggiornamento descrizione Calendar (non critico):`, updateError.message);
        }
        return {
          success: true,
          eventId: job.googleCalendarEventId,
          action: 'verified'
        };
      }
      
      console.warn(`⚠️  Calendar event ${job.googleCalendarEventId} NON esiste più - stale ID, ricreo...`);
      hadStaleId = true;
      
      await db.collection('jobs').doc(jobId).update({
        googleCalendarEventId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    
    // 4. Crea nuovo evento Calendar
    const eventDateJs = job.eventDate.toDate();
    const romeDate = DateTime.fromJSDate(eventDateJs, { zone: 'Europe/Rome' });
    const year = romeDate.year;
    const month = String(romeDate.month).padStart(2, '0');
    const day = String(romeDate.day).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const { summary, description, colorId } = await buildCalendarDescription(jobId, job);
    
    let createdEvent;
    
    if (job.allDay) {
      createdEvent = await createEvent('primary', {
        summary,
        description,
        isAllDay: true,
        startDateStr: dateStr,
        location: job.eventLocation,
        attendees: [],
        colorId,
      });
    } else {
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
        attendees: [],
        colorId,
      });
    }
    
    // 5. Update job con nuovo googleCalendarEventId
    await db.collection('jobs').doc(jobId).update({
      googleCalendarEventId: createdEvent.id,
      updatedAt: FieldValue.serverTimestamp()
    });
    
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
      eventId: createdEvent.id ?? undefined,
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
 * GET /api/jobs/notifications
 * Recupera notifiche (booking e consulenze non visualizzate)
 * NOTA: Questa route DEVE essere definita PRIMA di /:id per evitare conflitti
 */
// In-memory cache for notifications
let notificationsCache: { data: any[]; timestamp: number } | null = null;
const NOTIFICATIONS_CACHE_TTL = 60 * 1000; // 1 minuto

router.get('/notifications', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    // Serve da cache se ancora valida
    if (notificationsCache && (Date.now() - notificationsCache.timestamp) < NOTIFICATIONS_CACHE_TTL) {
      return res.json({ notifications: notificationsCache.data });
    }

    const notifications: any[] = [];
    
    // Fetch bookings non visualizzati
    const bookingsSnap = await db.collection('bookings')
      .where('stato', 'in', ['in_attesa', 'confermata'])
      .get();
    
    bookingsSnap.docs
      .filter(doc => !doc.data().dataVisualizzazione)
      .forEach(doc => {
        const data = doc.data();
        const dataInizio = data.dataShootingInizio?.toDate ? data.dataShootingInizio.toDate() : null;
        const dataStr = dataInizio ? new Date(dataInizio).toLocaleDateString('it-IT') : 'Data non disponibile';
        
        notifications.push({
          id: `booking-${doc.id}`,
          type: 'booking',
          title: 'Nuova Prenotazione',
          description: `${data.cliente?.cognome || ''} ${data.cliente?.nome || ''} - ${dataStr}`,
          createdAt: data.createdAt || null,
          isRead: false,
          resourceId: doc.id,
          deepLink: `/admin/dashboard?tab=prenotazioni&booking=${doc.id}`
        });
      });
    
    // Fetch consulenze non visualizzate
    const consultationsSnap = await db.collection('consultations')
      .where('stato', 'in', ['in_attesa', 'confermata'])
      .get();
    
    consultationsSnap.docs
      .filter(doc => !doc.data().dataVisualizzazione)
      .forEach(doc => {
        const data = doc.data();
        const statoLabel = data.stato === 'confermata' ? ' ✅' : '';
        
        notifications.push({
          id: `consultation-${doc.id}`,
          type: 'consultation',
          title: `Nuova Consulenza${statoLabel}`,
          description: `${data.cliente?.cognome || ''} ${data.cliente?.nome || ''} - ${data.jobType || 'Servizio non specificato'}`,
          createdAt: data.createdAt || null,
          isRead: false,
          resourceId: doc.id,
          deepLink: `/admin/dashboard?tab=consulenze&consultation=${doc.id}`
        });
      });
    
    // Fetch admin notifications (preventivi rapidi)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const adminNotifSnap = await db.collection('adminNotifications')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    adminNotifSnap.docs.forEach(doc => {
      const data = doc.data();
      const createdDate = data.createdAt?.toDate ? data.createdAt.toDate() : null;
      if (!createdDate || createdDate < sevenDaysAgo) return;

      notifications.push({
        id: `quick-quote-${doc.id}`,
        type: 'quick_quote',
        title: data.title || 'Preventivo Rapido',
        description: data.description || '',
        createdAt: data.createdAt || null,
        isRead: data.isRead || false,
        resourceId: data.jobId || doc.id,
        deepLink: data.deepLink || '/admin/dashboard?tab=lavori',
      });
    });

    // Ordina per data creazione (più recenti prima)
    notifications.sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
      return dateB.getTime() - dateA.getTime();
    });
    
    // Aggiorna cache
    notificationsCache = { data: notifications, timestamp: Date.now() };
    
    res.json({ success: true, notifications });
  } catch (error: any) {
    console.error('❌ Errore get notifications:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jobs/notifications/:id/dismiss
 * Segna una notifica admin come letta
 */
router.post('/notifications/:id/dismiss', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    await db.collection('adminNotifications').doc(id).update({
      isRead: true,
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ Errore dismiss notification:', error);
    res.status(500).json({ error: error.message });
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
 * 
 * IMPORTANTE: Questo route DEVE stare prima di /:id per evitare che Express
 * catturi "check-calendar" come parametro :id.
 */
router.get('/check-calendar', authenticateFirebase, requireAdmin, async (req: any, res) => {
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
    
    let timeMin: Date;
    let timeMax: Date;
    
    if (isAllDay) {
      timeMin = createEuropeRomeDate(dateStr, '00:00');
      timeMax = createEuropeRomeDate(dateStr, '23:59');
    } else {
      timeMin = createEuropeRomeDate(dateStr, startTime as string);
      timeMax = createEuropeRomeDate(dateStr, endTime as string);
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
    const dayStart = createEuropeRomeDate(dateStr, '00:00');
    const dayEnd = createEuropeRomeDate(dateStr, '23:59');
    
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
 * GET /api/jobs/list-aggregates
 * Aggregati leggeri per la pagina "Lista Lavori":
 *  - transactionCounts: jobId -> numero totale transazioni sugli ordini collegati
 *  - quotesStatus: jobId -> { hasQuote, isSigned, isEmailSent }
 *  - financialsByJob: jobId -> { totalePagato (incassato), saldoResiduo (da incassare) }
 * transactionCount/quoteStatus sono letti dai campi denormalizzati sui 'jobs' (aggiornati
 * sui write-path), così non si scorrono le intere collezioni 'orders'/'quotes'; gli incassi
 * reali sono sommati dai 'paymentSchedules' (fonte di verità per gli importi pagati).
 * DEVE restare definita PRIMA di GET '/:id'.
 */
router.get('/list-aggregates', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    // Legge i campi denormalizzati dai 'jobs' (quoteStatus, transactionCount, financials)
    // — niente scan di 'orders'/'quotes' — e somma gli incassi reali dai 'paymentSchedules'
    // (una sola collezione, fonte di verità per gli importi pagati).
    const [jobsSnap, schedulesSnap] = await Promise.all([
      db.collection('jobs').select('quoteStatus', 'transactionCount', 'financials').get(),
      db.collection('paymentSchedules').select('jobId', 'payments').get(),
    ]);

    // jobId -> totale realmente incassato dai payment schedules (somma di importoPagato).
    // È la stessa fonte usata da useJobFinancials: gestisce schedule duplicati e pagamenti
    // parziali. Tracciamo anche quali job hanno almeno uno schedule, per distinguere
    // "schedule con 0 incassato" (usa 0) da "nessuno schedule" (fallback denormalizzato).
    const paidByJob: Record<string, number> = {};
    const jobsWithSchedule = new Set<string>();
    schedulesSnap.docs.forEach(doc => {
      const data = doc.data() as any;
      const jobId = data.jobId;
      if (!jobId) return;
      jobsWithSchedule.add(jobId);
      const paid = (Array.isArray(data.payments) ? data.payments : []).reduce(
        (sum: number, p: any) => sum + (typeof p?.importoPagato === 'number' && p.importoPagato > 0 ? p.importoPagato : 0),
        0
      );
      paidByJob[jobId] = (paidByJob[jobId] || 0) + paid;
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;

    // jobId -> numero totale transazioni sugli ordini collegati
    const transactionCounts: Record<string, number> = {};
    // jobId -> stato preventivo aggregato
    const quotesStatus: Record<string, { hasQuote: boolean; isSigned: boolean; isEmailSent: boolean }> = {};
    // jobId -> { totalePagato (incassato), saldoResiduo (da incassare) }
    const financialsByJob: Record<string, { totalePagato: number; saldoResiduo: number }> = {};

    jobsSnap.docs.forEach(doc => {
      const data = doc.data() as any;
      if (typeof data.transactionCount === 'number' && data.transactionCount > 0) {
        transactionCounts[doc.id] = data.transactionCount;
      }
      if (data.quoteStatus && data.quoteStatus.hasQuote) {
        quotesStatus[doc.id] = {
          hasQuote: !!data.quoteStatus.hasQuote,
          isSigned: !!data.quoteStatus.isSigned,
          isEmailSent: !!data.quoteStatus.isEmailSent,
        };
      }

      // Incassato: se il job ha payment schedules usa SEMPRE la loro somma (anche se 0),
      // altrimenti fallback al campo denormalizzato (job legacy senza schedule).
      // Da incassare = max(0, preventivato - incassato) (clamp per overpayment).
      const fin = data.financials || {};
      const prev = typeof fin.totalePreventivato === 'number' ? fin.totalePreventivato : 0;
      const totalePagato = jobsWithSchedule.has(doc.id)
        ? (paidByJob[doc.id] || 0)
        : Math.max(0, typeof fin.totalePagato === 'number' ? fin.totalePagato : 0);
      const saldoResiduo = Math.max(0, prev - totalePagato);
      // Emette un record quando c'è incassato/residuo, e SEMPRE per i job con schedule
      // (anche 0/0): così il client non fa fallback al totalePagato denormalizzato stale
      // per un job che ha invece uno schedule (fonte di verità).
      if (totalePagato > 0 || saldoResiduo > 0 || jobsWithSchedule.has(doc.id)) {
        financialsByJob[doc.id] = { totalePagato: round2(totalePagato), saldoResiduo: round2(saldoResiduo) };
      }
    });

    res.json({ success: true, transactionCounts, quotesStatus, financialsByJob });
  } catch (error: any) {
    console.error('❌ Errore get job list aggregates:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jobs/:id/recompute-aggregates
 * Ricalcola gli aggregati denormalizzati (quoteStatus + transactionCount) del job.
 * Chiamato dai write-path lato client (Web SDK) dopo che hanno modificato quotes/orders,
 * così la logica di aggregazione resta centralizzata server-side. DEVE restare definita
 * PRIMA di GET '/:id' per non essere catturata dalla rotta dinamica.
 */
router.post('/:id/recompute-aggregates', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    await recomputeJobAggregates(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ Errore recompute job aggregates:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/jobs/:id
 * Recupera un singolo lavoro per ID (con verifica admin)
 */
router.get('/:id', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    
    const jobDoc = await db.collection('jobs').doc(id).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: 'Lavoro non trovato' });
    }
    
    const jobData = jobDoc.data();
    
    // Salta jobs eliminati
    if (jobData?.deleted === true) {
      return res.status(404).json({ error: 'Lavoro non trovato' });
    }
    
    res.json({
      success: true,
      job: {
        id: jobDoc.id,
        ...jobData
      }
    });
  } catch (error: any) {
    console.error('❌ Errore recupero job:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/jobs/:id/timeline
 * Recupera la timeline di un lavoro
 */
router.get('/:id/timeline', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    
    const timelineSnapshot = await db.collection('jobTimeline')
      .where('jobId', '==', id)
      .orderBy('data', 'desc')
      .get();
    
    const events = timelineSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({ success: true, events });
  } catch (error: any) {
    console.error('❌ Errore recupero timeline:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/jobs/:id/calendar-event
 * Elimina evento Google Calendar associato a un job
 * Usato quando: job viene eliminato, dataNonDefinita attivato, status annullato
 */
router.delete('/:id/calendar-event', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const jobDoc = await db.collection('jobs').doc(id).get();
    
    if (!jobDoc.exists) {
      return res.status(404).json({ error: 'Job non trovato' });
    }
    
    const job = jobDoc.data();
    const calendarEventId = job?.googleCalendarEventId;
    
    if (!calendarEventId) {
      return res.json({ success: true, deleted: false, reason: 'Nessun evento Calendar associato' });
    }
    
    try {
      const { deleteEvent } = await import('./google-calendar.js');
      await deleteEvent('primary', calendarEventId);
      console.log(`✅ Evento Calendar ${calendarEventId} eliminato per Job ${id}`);
    } catch (deleteError: any) {
      if (deleteError?.code === 404 || deleteError?.message?.includes('not found')) {
        console.log(`ℹ️  Evento Calendar ${calendarEventId} già inesistente per Job ${id}`);
      } else {
        console.warn(`⚠️ Errore eliminazione evento Calendar ${calendarEventId}:`, deleteError?.message);
      }
    }
    
    await db.collection('jobs').doc(id).update({
      googleCalendarEventId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp()
    });
    
    res.json({ success: true, deleted: true, eventId: calendarEventId });
  } catch (error: any) {
    console.error(`❌ Errore eliminazione Calendar event per Job:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint per sincronizzare il calendario di un lavoro
 */
router.post('/:id/sync-calendar', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const result = await ensureJobCalendarEvent(id);
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/consultation-templates?jobType=Matrimonio
 * Recupera tutti i template di consulenza attivi per un jobType specifico
 */
router.get('/consultation-templates', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const { jobType } = req.query;
    
    if (!jobType) {
      return res.status(400).json({ error: 'jobType query parameter richiesto' });
    }
    
    const templatesSnapshot = await db.collection('consultationTemplates')
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
 * POST /api/jobs/:id/calendar-event
 * Crea/aggiorna evento Google Calendar per Job (quando diventa confermato, etc.)
 * Blocca slot per prenotazioni/consultations
 * Verifica esistenza evento esistente, ricrea se stale
 * Query params: force=true per forzare ricreazione (elimina evento esistente)
 */
router.post('/:id/calendar-event', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';
    
    // Se force=true, elimina prima l'evento esistente
    if (force) {
      const jobDoc = await db.collection('jobs').doc(id).get();
      if (jobDoc.exists) {
        const job = jobDoc.data();
        if (job?.googleCalendarEventId) {
          console.log(`🔄 Force recreation: eliminando evento ${job.googleCalendarEventId}...`);
          try {
            const { deleteEvent } = await import('./google-calendar.js');
            await deleteEvent('primary', job.googleCalendarEventId);
            console.log(`✅ Evento ${job.googleCalendarEventId} eliminato`);
          } catch (deleteError) {
            console.warn(`⚠️ Impossibile eliminare evento:`, deleteError);
          }
          // Rimuovi ID dal job
          await db.collection('jobs').doc(id).update({
            googleCalendarEventId: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp()
          });
        }
      }
    }
    
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
router.post('/:id/send-consultation-request', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { channel, templateId, dateFrom, dateTo } = req.body;
    // force=true → reinvio deliberato dell'admin: salta il lock anti-race (vedi sotto).
    const force = req.body.force === true;
    
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
    const baseUrl = getSiteBaseUrl(req);

    // Route corretto: /consulenze/:tipo/:id/prenota con parametri opzionali dateFrom/dateTo
    const { buildConsultationLink } = await import('./consultations/consultation-invite.js');
    const consultationLink = buildConsultationLink({
      baseUrl,
      jobType: job.jobType,
      templateId,
      jobId: id,
      dateFrom,
      dateTo,
    });
    
    // 5. Invia notifica
    let eventMetadata: any = {
      templateId,
      templateNome: template.data.nome,
      channel,
      consultationLink
    };
    
    let emailSubject: string | null = null;
    let emailHtml: string | null = null;

    if (channel === 'email') {
      // Prepara email (l'invio avviene DOPO aver scritto il record di dedup, vedi sotto)
      const studioInfo = await getStudioContactInfo();
      
      emailSubject = `Prenota la tua consulenza - ${template.data.nome}`;
      emailHtml = `
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
      
      eventMetadata.emailSent = true;
    } else {
      // WhatsApp - usa whatsapp, cellulare1 o cellulare2 come fallback
      const message = `Ciao ${cliente.nome}! 📸\n\nÈ arrivato il momento di prenotare la tua ${template.data.nome} per ${job.nomeEvento}.\n\nClicca qui per scegliere l'appuntamento: ${consultationLink}`;
      const phoneToUse = cliente.whatsapp || cliente.cellulare1 || cliente.cellulare2;
      const whatsappNumber = formatPhoneForWhatsApp(phoneToUse);
      
      if (!whatsappNumber) {
        return res.status(400).json({ error: 'Cliente senza numero WhatsApp o cellulare' });
      }
      
      eventMetadata.whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    }
    
    // 6. Crea evento timeline (funge anche da record di dedup per lo scheduler auto-invito)
    const timelineEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      jobId: id,
      tipo: 'consulenza_inviata',
      descrizione: `Richiesta consulenza "${template.data.nome}" inviata tramite ${channel}`,
      data: Timestamp.now(),
      metadata: eventMetadata
    };
    
    // IDEMPOTENZA + ANTI-RACE: il record di dedup (workflowEvent consulenza_inviata)
    // va scritto su job.workflowEvents PRIMA dell'invio email — è ciò che lo scheduler
    // auto-invito (reminder-routes.ts) ricontrolla nella sua transazione di lock.
    // Per il template con invito automatico (autoInvioVisioneAttivo) il PRIMO invio
    // manuale usa una transazione sullo STESSO job doc condivisa con lo scheduler:
    // scrive il record SOLO se né il marker auto (visioneAutoInviteSentAt) né un invio
    // precedente esistono già. Così manuale e scheduler si serializzano sul documento ed
    // esattamente UNO invia, anche se partono nello stesso istante. Un reinvio deliberato
    // dell'admin (force=true, pulsante "Rinvia invito") salta il controllo e invia comunque.
    const isVisioneAutoTemplate = templateData.autoInvioVisioneAttivo === true;
    const useRaceLock = isVisioneAutoTemplate && !force;

    if (useRaceLock) {
      let claimed = false;
      try {
        claimed = await db.runTransaction(async (tx: any) => {
          const fresh = await tx.get(db.collection('jobs').doc(id));
          if (!fresh.exists) return false;
          const data: any = fresh.data() || {};
          // Lo scheduler ha già impostato il marker (auto in corso/inviato) → non doppiare.
          if (data.visioneAutoInviteSentAt) return false;
          // Invito (auto o manuale) già registrato per questo template → non doppiare.
          const events: any[] = Array.isArray(data.workflowEvents) ? data.workflowEvents : [];
          const already = events.some(
            (e) => e?.tipo === 'consulenza_inviata' && e?.metadata?.templateId === templateId
          );
          if (already) return false;
          tx.update(db.collection('jobs').doc(id), {
            workflowEvents: FieldValue.arrayUnion(timelineEvent),
            updatedAt: Timestamp.now()
          });
          return true;
        });
      } catch (lockError: any) {
        console.error(`[Send Consultation Request] ❌ Lock fallito per job ${id}:`, lockError.message);
        return res.status(500).json({
          error: 'Errore durante invio richiesta consulenza',
          details: lockError.message
        });
      }
      if (!claimed) {
        // Lo scheduler (o un invio precedente) ha già "vinto": evita il doppio invito.
        return res.status(409).json({
          error: 'Invito consulenza già inviato',
          details: 'L\'invito alla consulenza risulta già inviato (automaticamente o manualmente). Aggiorna la pagina per vedere lo stato; usa "Rinvia invito" per inviarlo di nuovo.',
          alreadySent: true
        });
      }
    } else {
      // Reinvio forzato o template senza invito automatico: nessuna corsa con lo
      // scheduler, ma scrivi comunque il record di dedup PRIMA dell'invio email.
      await db.collection('jobs').doc(id).update({
        workflowEvents: FieldValue.arrayUnion(timelineEvent),
        updatedAt: Timestamp.now()
      });
    }
    
    if (channel === 'email') {
      try {
        await sendGmailEmail(cliente.email, emailSubject!, emailHtml!);
      } catch (emailError: any) {
        // Invio fallito DOPO la scrittura del record di dedup: rollback così lo scheduler
        // potrà riprovare l'invio automatico al ciclo successivo (meglio un invio mancato
        // e ritentabile che un doppio invio al cliente).
        try {
          await db.collection('jobs').doc(id).update({
            workflowEvents: FieldValue.arrayRemove(timelineEvent),
            updatedAt: Timestamp.now()
          });
        } catch (rollbackError: any) {
          console.error(`[Send Consultation Request] ⚠️ Rollback workflowEvent fallito per job ${id}:`, rollbackError.message);
        }
        console.error(`[Send Consultation Request] ❌ Invio email fallito per job ${id}:`, emailError.message);
        return res.status(500).json({
          error: 'Errore durante invio email consulenza',
          details: emailError.message
        });
      }
    }
    
    // Persistenza accessoria in jobTimeline (per "Attività Recenti"): best-effort, un suo
    // fallimento NON causa rollback né errore (il record di dedup è già su job.workflowEvents).
    try {
      await db.collection('jobTimeline').add(timelineEvent);
    } catch (timelineError: any) {
      console.error(`[Send Consultation Request] ⚠️ jobTimeline non salvata per job ${id} (record dedup già presente):`, timelineError.message);
    }
    
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
router.post('/:id/timeline-events', authenticateFirebase, requireAdmin, async (req: any, res) => {
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

/**
 * GET /api/jobs
 * Recupera tutti i lavori con filtri opzionali
 */
router.get('/', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const { status, jobType, clienteId, searchQuery, dateFrom, dateTo } = req.query;
    
    // Fetch all jobs and filter server-side to avoid complex index requirements
    const [snapshot, clientiSnapshot] = await Promise.all([
      db.collection('jobs').get(),
      db.collection('clienti').select('nome', 'cognome').get(),
    ]);

    const clientNamesById = new Map<string, string>();
    clientiSnapshot.docs.forEach((doc) => {
      const cliente = doc.data();
      const name = `${cliente.nome || ''} ${cliente.cognome || ''}`.trim();
      if (name) clientNamesById.set(doc.id, name);
    });
    
    let jobs = snapshot.docs
      .filter(doc => doc.data().deleted !== true && !doc.data().deletedAt) // Escludi eliminati (hard flag + soft-delete deletedAt)
      .map(doc => {
        const data = doc.data();
        const clientIds = Array.isArray(data.clientiIds) && data.clientiIds.length > 0
          ? data.clientiIds
          : data.clienteId
            ? [data.clienteId]
            : [];
        return {
          id: doc.id,
          ...data,
          clientNames: clientIds
            .map((id: string) => clientNamesById.get(id))
            .filter((name: string | undefined): name is string => !!name),
        };
      });
    
    // Filtri server-side
    const statusArray = status ? (Array.isArray(status) ? status : [status]) : null;
    if (statusArray && statusArray.length > 0) {
      jobs = jobs.filter((job: any) => statusArray.includes(job.status));
    }
    
    const jobTypeArray = jobType ? (Array.isArray(jobType) ? jobType : [jobType]) : null;
    if (jobTypeArray && jobTypeArray.length > 0) {
      jobs = jobs.filter((job: any) => jobTypeArray.includes(job.jobType));
    }
    
    if (clienteId) {
      jobs = jobs.filter((job: any) => 
        job.clientiIds && job.clientiIds.includes(clienteId)
      );
    }
    
    // Filtro date
    if (dateFrom) {
      const fromDate = new Date(dateFrom as string);
      jobs = jobs.filter((job: any) => {
        const eventDate = job.eventDate?.toDate ? job.eventDate.toDate() : new Date(job.eventDate);
        return eventDate >= fromDate;
      });
    }
    if (dateTo) {
      const toDate = new Date(dateTo as string);
      jobs = jobs.filter((job: any) => {
        const eventDate = job.eventDate?.toDate ? job.eventDate.toDate() : new Date(job.eventDate);
        return eventDate <= toDate;
      });
    }
    
    // Ricerca testuale
    if (searchQuery) {
      const query = (searchQuery as string).toLowerCase();
      jobs = jobs.filter((job: any) => 
        job.nomeEvento?.toLowerCase().includes(query) ||
        job.clientNames?.some((name: string) => name.toLowerCase().includes(query)) ||
        job.eventLocation?.toLowerCase().includes(query) ||
        job.noteInterne?.toLowerCase().includes(query)
      );
    }
    
    // Ordina per data evento decrescente
    jobs.sort((a: any, b: any) => {
      const dateA = a.eventDate?.toDate ? a.eventDate.toDate() : new Date(a.eventDate || 0);
      const dateB = b.eventDate?.toDate ? b.eventDate.toDate() : new Date(b.eventDate || 0);
      return dateB.getTime() - dateA.getTime();
    });
    
    res.json({ success: true, jobs });
  } catch (error: any) {
    console.error('❌ Errore get all jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jobs/sync-all-calendar
 * Sync batch di tutti i jobs con Google Calendar (aggiorna titoli, colori, descrizioni)
 */
router.post('/sync-all-calendar', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const jobsSnap = await db.collection('jobs')
      .where('deletedAt', '==', null)
      .get();
    
    const allJobs = jobsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const jobsWithDate = allJobs.filter((j: any) => j.eventDate && !j.dataNonDefinita);
    
    const results = {
      total: jobsWithDate.length,
      synced: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };
    
    for (const job of jobsWithDate as any[]) {
      try {
        const result = await ensureJobCalendarEvent(job.id);
        if (result.success) {
          results.synced++;
          if (result.action === 'created' || result.action === 'recreated') {
            results.created++;
          } else {
            results.updated++;
          }
        } else {
          results.skipped++;
          if (result.error) {
            results.errors.push(`${job.id} (${job.nomeEvento}): ${result.error}`);
          }
        }
      } catch (err: any) {
        results.skipped++;
        results.errors.push(`${job.id} (${job.nomeEvento}): ${err.message}`);
      }
    }
    
    // Cerca anche jobs senza deletedAt field (legacy)
    const jobsNoDeletedSnap = await db.collection('jobs').get();
    const legacyJobs = jobsNoDeletedSnap.docs
      .filter(doc => {
        const data = doc.data();
        return data.eventDate && !data.dataNonDefinita && !data.deletedAt && 
               !jobsWithDate.some((j: any) => j.id === doc.id);
      })
      .map(doc => ({ id: doc.id, ...doc.data() }));
    
    for (const job of legacyJobs as any[]) {
      try {
        const result = await ensureJobCalendarEvent(job.id);
        if (result.success) {
          results.synced++;
          results.total++;
          if (result.action === 'created' || result.action === 'recreated') {
            results.created++;
          } else {
            results.updated++;
          }
        }
      } catch (err: any) {
        results.total++;
        results.skipped++;
        results.errors.push(`${job.id} (${job.nomeEvento}): ${err.message}`);
      }
    }
    
    console.log(`✅ Sync Calendar completata: ${results.synced}/${results.total} sincronizzati, ${results.created} creati, ${results.updated} aggiornati`);
    
    res.json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error('❌ Errore sync-all-calendar:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
