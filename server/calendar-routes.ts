/**
 * Calendar API Routes - Express.js
 * Gestisce endpoint per visualizzazione calendario unificato (Google Calendar + Consulenze + Jobs)
 * e creazione eventi Google Calendar con notifiche email opzionali
 */

import express from 'express';
import { getEvents, createEvent, updateEvent, getCalendarConnectionStatus, invalidateTokenCache } from './google-calendar.js';

import { db, Timestamp, FieldValue } from './firebase-admin.js';
import { authenticateFirebase, sendGmailEmail, createCalendarEventEmailHTML, getStudioContactInfo, generateGoogleCalendarLink } from './email-routes.js';
import { z } from 'zod';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

const router = express.Router();

const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

function requireAdmin(req: any, res: express.Response, next: express.NextFunction) {
  if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
    return res.status(403).json({ error: 'Accesso negato: solo admin' });
  }
  next();
}

/**
 * GET /api/calendar/status
 * Verifica stato connessione Google Calendar
 * Ritorna info su token, scadenza, e se serve riconnessione
 */
router.get('/status', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    const status = await getCalendarConnectionStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({
      connected: false,
      needsReconnection: true,
      error: error.message,
    });
  }
});

/**
 * POST /api/calendar/refresh-token
 * Forza reinizializzazione del client Service Account invalidando la cache
 */
router.post('/refresh-token', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    invalidateTokenCache();
    const status = await getCalendarConnectionStatus();
    res.json({
      success: true,
      message: 'Service Account auth cache invalidated, re-initialized',
      status,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DTO per evento unificato calendario
 */
interface CalendarEventDTO {
  id: string; // ID prefissato per display: g-xxx, c-xxx, j-xxx
  title: string;
  description?: string;
  start: string; // ISO date
  end: string;
  allDay?: boolean; // true per eventi "tutto il giorno" (Google start.date senza orario, o Job allDay)
  location?: string;
  type: 'google' | 'consulenza' | 'job';
  clientName?: string;
  clientEmail?: string;
  googleEventId?: string;
  entityStatus?: string; // Stato entità (consulenza/booking): in_attesa, confermata, rifiutata, annullata, etc
  entityId?: string; // ID puro dell'entità (senza prefix) per API delete
  // Associazione lavoro + preventivo firmato
  linkedJobId?: string; // ID del job collegato (google via linkedCalendarEventIds, consulenza via jobId, job = sé stesso)
  linkedJobName?: string; // Nome del lavoro collegato (per display)
  signedQuoteToken?: string; // publicToken del preventivo firmato collegato al job (se presente)
  hasSignedQuote?: boolean; // true se il job collegato ha un preventivo firmato
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
// In-memory cache for calendar events (keyed by startDate+endDate)
const calendarCache = new Map<string, { data: any; timestamp: number }>();
const CALENDAR_CACHE_TTL = 2 * 60 * 1000; // 2 minuti

router.get('/events', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, calendarId } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required query parameters: startDate, endDate'
      });
    }

    // Check cache
    const cacheKey = `${startDate}_${endDate}_${calendarId || 'primary'}`;
    const cached = calendarCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CALENDAR_CACHE_TTL) {
      return res.json(cached.data);
    }

    const events: CalendarEventDTO[] = [];
    const warnings: string[] = [];
    const timeMin = new Date(startDate as string);
    const timeMax = new Date(endDate as string);

    // Track Google Calendar event IDs for deduplication
    let googleEvents: any[] = [];
    let googleFetchFailed = false; // Track if Google fetch failed

    // 1. Google Calendar events
    try {
      console.log(`📅 Fetching Google Calendar events (${startDate} → ${endDate})`);
      
      googleEvents = await getEvents(
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
          allDay: !event.start?.dateTime && !!event.start?.date,
          location: event.location || undefined,
          type: 'google',
          googleEventId: event.id || undefined,
        });
      });

      console.log(`✅ Caricati ${googleEvents.length} eventi Google Calendar`);
    } catch (error: any) {
      googleFetchFailed = true; // Mark Google fetch as failed
      const errorMessage = error?.message || String(error);
      console.error('⚠️ Errore caricamento Google Calendar (continuiamo comunque):', errorMessage);
      warnings.push(`Google Calendar non disponibile: ${errorMessage}`);
    }

    // 2. Consulenze nel range di date (deduplicazione intelligente)
    // Carica solo consulenze che NON hanno evento Google corrispondente
    try {
      console.log(`🗓️ Fetching consulenze (${startDate} → ${endDate})`);
      
      const consultazioniSnap = await db.collection('consultations')
        .where('dataConsulenza', '>=', timeMin)
        .where('dataConsulenza', '<=', timeMax)
        .get();
      
      // Se Google fetch fallito, includi TUTTE le consulenze con nota offline
      if (googleFetchFailed) {
        console.log(`⚠️ Google Calendar offline - carico TUTTE le consulenze Firestore`);
        
        consultazioniSnap.forEach(doc => {
          const c = doc.data();
          const clienteNome = `${c.cliente?.nome || ''} ${c.cliente?.cognome || ''}`.trim() || 'Cliente';
          
          events.push({
            id: `c-${doc.id}`,
            title: `Consulenza: ${clienteNome}`,
            description: `⚠️ Google Calendar offline - impossibile verificare sincronizzazione\n\n${c.note || ''}`,
            start: c.dataConsulenza?.toDate?.()?.toISOString() || c.dataConsulenza,
            end: c.dataConsulenza?.toDate?.()?.toISOString() || c.dataConsulenza,
            type: 'consulenza',
            clientName: clienteNome,
            clientEmail: c.cliente?.email || undefined,
            entityStatus: c.stato || undefined,
            entityId: doc.id,
            googleEventId: c.googleCalendarEventId || undefined,
            linkedJobId: c.jobId || undefined,
          });
        });
        
        console.log(`✅ Consulenze (offline mode): ${consultazioniSnap.size} totali`);
      } else {
        // Google fetch OK - applica deduplicazione intelligente
        const googleEventIds = new Set(
          googleEvents?.map(e => e.id).filter(Boolean) || []
        );
        
        let sincronizzate = 0;
        let nonSincronizzate = 0;
        let orphaned = 0;
        
        consultazioniSnap.forEach(doc => {
          const c = doc.data();
          const hasGoogleId = !!c.googleCalendarEventId;
          const googleEventExists = hasGoogleId && googleEventIds.has(c.googleCalendarEventId);
          
          // Skippa SOLO se ha googleCalendarEventId E l'evento Google esiste davvero
          if (hasGoogleId && googleEventExists) {
            sincronizzate++;
            return; // Già presente negli eventi Google
          }
          
          // Includi se: non ha googleId OPPURE ha googleId ma evento Google mancante (orphan)
          const clienteNome = `${c.cliente?.nome || ''} ${c.cliente?.cognome || ''}`.trim() || 'Cliente';
          const isOrphan = hasGoogleId && !googleEventExists;
          
          if (isOrphan) orphaned++;
          else nonSincronizzate++;
          
          events.push({
            id: `c-${doc.id}`,
            title: `Consulenza: ${clienteNome}${isOrphan ? ' ⚠️' : ''}`,
            description: isOrphan 
              ? `⚠️ DESYNC: Evento Google eliminato o mancante\n\n${c.note || ''}`
              : c.note || undefined,
            start: c.dataConsulenza?.toDate?.()?.toISOString() || c.dataConsulenza,
            end: c.dataConsulenza?.toDate?.()?.toISOString() || c.dataConsulenza,
            type: 'consulenza',
            clientName: clienteNome,
            clientEmail: c.cliente?.email || undefined,
            entityStatus: c.stato || undefined,
            entityId: doc.id,
            googleEventId: c.googleCalendarEventId || undefined,
            linkedJobId: c.jobId || undefined,
          });
        });

        console.log(`✅ Consulenze: ${nonSincronizzate} non sync, ${sincronizzate} sincronizzate, ${orphaned} orphan/desync`);
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('⚠️ Errore caricamento consulenze (continuiamo comunque):', errorMessage);
      warnings.push(`Consulenze non disponibili: ${errorMessage}`);
    }

    // 3. Jobs con eventDate nel range (deduplicazione intelligente)
    // Carica solo jobs che NON hanno evento Google corrispondente
    try {
      console.log(`💼 Fetching jobs (${startDate} → ${endDate})`);
      
      const jobsSnap = await db.collection('jobs')
        .where('eventDate', '>=', timeMin)
        .where('eventDate', '<=', timeMax)
        .get();
      
      // Se Google fetch fallito, includi TUTTI i jobs con nota offline
      if (googleFetchFailed) {
        console.log(`⚠️ Google Calendar offline - carico TUTTI i jobs Firestore`);
        
        jobsSnap.forEach(doc => {
          const job = doc.data();
          const jobTitle = job.nomeEvento || job.jobType || 'Job';
          let clienteNome = job.clienteNome || 'Cliente';
          if (!job.clienteNome && job.clientiIds && job.clientiIds.length > 0) {
            clienteNome = job.clientiIds.length === 1 ? 'Cliente' : 'Clienti Multipli';
          }
          
          events.push({
            id: `j-${doc.id}`,
            title: `${jobTitle}: ${clienteNome}`,
            description: `⚠️ Google Calendar offline - impossibile verificare sincronizzazione\n\n${job.noteInterne || job.note || ''}`,
            start: job.eventDate?.toDate?.()?.toISOString() || job.eventDate,
            end: job.eventDate?.toDate?.()?.toISOString() || job.eventDate,
            allDay: job.allDay === true,
            type: 'job',
            entityId: doc.id,
            clientName: clienteNome,
            clientEmail: job.clienteEmail || undefined,
            googleEventId: job.googleCalendarEventId || undefined,
          });
        });
        
        console.log(`✅ Jobs (offline mode): ${jobsSnap.size} totali`);
      } else {
        // Google fetch OK - applica deduplicazione intelligente
        const googleEventIds = new Set(
          googleEvents?.map(e => e.id).filter(Boolean) || []
        );
        
        let sincronizzati = 0;
        let nonSincronizzati = 0;
        let orphaned = 0;
        
        jobsSnap.forEach(doc => {
          const job = doc.data();
          const hasGoogleId = !!job.googleCalendarEventId;
          const googleEventExists = hasGoogleId && googleEventIds.has(job.googleCalendarEventId);
          
          // Skippa SOLO se ha googleCalendarEventId E l'evento Google esiste davvero
          if (hasGoogleId && googleEventExists) {
            sincronizzati++;
            return; // Già presente negli eventi Google
          }
          
          // Includi se: non ha googleId OPPURE ha googleId ma evento Google mancante (orphan)
          const jobTitle = job.nomeEvento || job.jobType || 'Job';
          let clienteNome = job.clienteNome || 'Cliente';
          if (!job.clienteNome && job.clientiIds && job.clientiIds.length > 0) {
            clienteNome = job.clientiIds.length === 1 ? 'Cliente' : 'Clienti Multipli';
          }
          
          const isOrphan = hasGoogleId && !googleEventExists;
          
          if (isOrphan) orphaned++;
          else nonSincronizzati++;
          
          events.push({
            id: `j-${doc.id}`,
            title: `${jobTitle}: ${clienteNome}${isOrphan ? ' ⚠️' : ''}`,
            description: isOrphan 
              ? `⚠️ DESYNC: Evento Google eliminato o mancante\n\n${job.noteInterne || job.note || ''}`
              : job.noteInterne || job.note || undefined,
            start: job.eventDate?.toDate?.()?.toISOString() || job.eventDate,
            end: job.eventDate?.toDate?.()?.toISOString() || job.eventDate,
            allDay: job.allDay === true,
            type: 'job',
            entityId: doc.id,
            clientName: clienteNome,
            clientEmail: job.clienteEmail || undefined,
            googleEventId: job.googleCalendarEventId || undefined,
          });
        });

        console.log(`✅ Jobs: ${nonSincronizzati} non sync, ${sincronizzati} sincronizzati, ${orphaned} orphan/desync`);
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('⚠️ Errore caricamento jobs (continuiamo comunque):', errorMessage);
      warnings.push(`Jobs non disponibili: ${errorMessage}`);
    }

    console.log(`📋 Totale eventi caricati: ${events.length}`);
    if (warnings.length > 0) {
      console.log(`⚠️ Warnings: ${warnings.join(', ')}`);
    }

    // === Risoluzione associazioni lavoro + preventivo firmato ===
    // Best-effort: eventuali errori non bloccano la risposta del calendario
    try {
      // 1. Eventi Google → job collegato tramite job.linkedCalendarEventIds
      const googleEventIds = Array.from(new Set(
        events
          .filter(e => e.type === 'google' && e.googleEventId)
          .map(e => e.googleEventId as string)
      ));

      const googleIdToJobId = new Map<string, string>();
      for (let i = 0; i < googleEventIds.length; i += 10) {
        const chunk = googleEventIds.slice(i, i + 10);
        const snap = await db.collection('jobs')
          .where('linkedCalendarEventIds', 'array-contains-any', chunk)
          .get();
        snap.forEach(doc => {
          const linkedIds: string[] = doc.data().linkedCalendarEventIds || [];
          linkedIds.forEach(eid => {
            if (chunk.includes(eid) && !googleIdToJobId.has(eid)) {
              googleIdToJobId.set(eid, doc.id);
            }
          });
        });
      }

      // Imposta linkedJobId su ogni evento (google via mappa, job = sé stesso, consulenza già impostato al push)
      events.forEach(e => {
        if (e.type === 'google' && e.googleEventId) {
          const jid = googleIdToJobId.get(e.googleEventId);
          if (jid) e.linkedJobId = jid;
        } else if (e.type === 'job' && e.entityId) {
          e.linkedJobId = e.entityId;
        }
      });

      // 2. Carica i job collegati per nome + stato preventivo
      const linkedJobIds = Array.from(new Set(
        events.map(e => e.linkedJobId).filter((x): x is string => !!x)
      ));

      if (linkedJobIds.length > 0) {
        const jobRefs = linkedJobIds.map(id => db.collection('jobs').doc(id));
        const jobDocs = await db.getAll(...jobRefs);
        const jobInfoMap = new Map<string, { name: string; isSigned: boolean }>();
        jobDocs.forEach(doc => {
          if (doc.exists) {
            const job = doc.data() as any;
            jobInfoMap.set(doc.id, {
              name: job?.nomeEvento || job?.jobType || 'Lavoro',
              isSigned: !!job?.quoteStatus?.isSigned,
            });
          }
        });

        // 3. publicToken del preventivo firmato per i job con preventivo firmato
        const signedJobIds = linkedJobIds.filter(id => jobInfoMap.get(id)?.isSigned);
        const signedTokenMap = new Map<string, string>();
        for (let i = 0; i < signedJobIds.length; i += 10) {
          const chunk = signedJobIds.slice(i, i + 10);
          const qSnap = await db.collection('quotes')
            .where('jobId', 'in', chunk)
            .get();
          qSnap.forEach(doc => {
            const q = doc.data() as any;
            if (q?.status === 'firmato' && q?.publicToken && !signedTokenMap.has(q.jobId)) {
              signedTokenMap.set(q.jobId, q.publicToken);
            }
          });
        }

        // Annota gli eventi con nome lavoro + info preventivo firmato
        events.forEach(e => {
          if (!e.linkedJobId) return;
          const info = jobInfoMap.get(e.linkedJobId);
          if (!info) return;
          e.linkedJobName = info.name;
          e.hasSignedQuote = info.isSigned;
          const token = signedTokenMap.get(e.linkedJobId);
          if (token) e.signedQuoteToken = token;
        });
      }
    } catch (resolveErr: any) {
      console.error('⚠️ Errore risoluzione associazioni lavoro (continuiamo):', resolveErr?.message || resolveErr);
    }

    const responseData = { events, warnings };
    calendarCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    // Limita dimensione cache a 10 entry
    if (calendarCache.size > 10) {
      const firstKey = calendarCache.keys().next().value;
      if (firstKey) calendarCache.delete(firstKey);
    }
    
    res.json(responseData);
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
  jobId: z.string().optional(),
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

router.post('/create-event', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    calendarCache.clear();
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
    
    // 1b. Se collegato a un job, arricchisci la descrizione Google Calendar con i dati del lavoro
    let jobInfoBlock = '';
    if (data.jobId) {
      try {
        const jobDocForDesc = await db.collection('jobs').doc(data.jobId).get();
        if (jobDocForDesc.exists) {
          const j = jobDocForDesc.data();
          const lines: string[] = [];
          const jobName = j?.nomeEvento || j?.jobType;
          if (jobName) lines.push(`📋 Lavoro: ${jobName}${j?.jobType && j?.nomeEvento ? ` (${j.jobType})` : ''}`);
          const clienteNames = Array.isArray(j?.clienti)
            ? j.clienti.map((c: any) => `${c?.nome || ''} ${c?.cognome || ''}`.trim()).filter(Boolean).join(', ')
            : '';
          if (clienteNames) lines.push(`👤 Cliente: ${clienteNames}`);
          if (j?.dataEvento) {
            try {
              const d = typeof j.dataEvento?.toDate === 'function' ? j.dataEvento.toDate() : new Date(j.dataEvento);
              if (!isNaN(d.getTime())) lines.push(`📅 Data evento: ${format(d, 'd MMMM yyyy', { locale: it })}`);
            } catch { /* ignora date non parsabili */ }
          }
          if (lines.length > 0) jobInfoBlock = lines.join('\n');
        }
      } catch (jobDescError) {
        console.error('⚠️ Errore lettura job per descrizione evento:', jobDescError);
      }
    }

    // 2. Crea evento su Google Calendar
    // NOTA: non passare attendees - i Service Account non possono invitare partecipanti
    // senza Domain-Wide Delegation. La notifica al cliente avviene via Gmail API (step 3).
    const event = await createEvent('primary', {
      summary: data.title,
      description: [data.description, jobInfoBlock].filter(Boolean).join('\n\n') || undefined,
      start: data.isAllDay ? undefined : new Date(data.start),
      end: data.isAllDay ? undefined : new Date(data.end),
      location: data.location,
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

    // 4. Associa evento a job se richiesto
    if (data.jobId && event.id) {
      try {
        const jobRef = db.collection('jobs').doc(data.jobId);
        const jobDoc = await jobRef.get();
        
        if (jobDoc.exists) {
          const jobData = jobDoc.data();
          const existingEventIds: string[] = jobData?.linkedCalendarEventIds || [];
          
          // Aggiungi evento solo se non già presente
          if (!existingEventIds.includes(event.id)) {
            await jobRef.update({
              linkedCalendarEventIds: [...existingEventIds, event.id],
              updatedAt: Timestamp.now()
            });
            console.log(`📎 Evento ${event.id} collegato al job ${data.jobId}`);
          }
        } else {
          console.warn(`⚠️ Job ${data.jobId} non trovato per associazione evento`);
        }
      } catch (jobError) {
        console.error('⚠️ Errore associazione evento a job:', jobError);
        // Non bloccare - evento creato comunque
      }
    }

    // Invalida la cache calendario così il nuovo evento (e l'eventuale associazione) è subito visibile
    calendarCache.clear();

    res.json({ 
      success: true, 
      eventId: event.id,
      message: 'Evento creato con successo',
      linkedToJob: data.jobId ? true : false
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

/**
 * PATCH /api/calendar/events/:eventId
 * Aggiorna evento esistente - supporta Google Calendar, Consulenze e Jobs
 * 
 * Body: {
 *   title?: string,
 *   description?: string,
 *   start: string (ISO),
 *   end: string (ISO),
 *   location?: string,
 *   type: 'google' | 'consulenza' | 'job',
 *   entityId?: string (ID puro senza prefix per consulenza/job)
 * }
 */
const updateEventSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  start: z.string().min(1, 'Data inizio richiesta'),
  end: z.string().min(1, 'Data fine richiesta'),
  location: z.string().optional(),
  type: z.enum(['google', 'consulenza', 'job']),
  entityId: z.string().optional(),
  googleEventId: z.string().optional(),
  isAllDay: z.boolean().optional(),
  jobId: z.string().nullable().optional(), // Associazione a un lavoro (solo eventi google): id = collega, null = scollega
});

router.patch('/events/:eventId', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    const { eventId } = req.params;
    const data = updateEventSchema.parse(req.body);
    
    console.log(`📅 Modifica evento: ${eventId} (tipo: ${data.type})`);
    
    const startDate = new Date(data.start);
    const endDate = new Date(data.end);
    
    // Gestione per tipo di evento
    if (data.type === 'google') {
      // Evento Google Calendar puro - aggiorna direttamente
      const googleId = data.googleEventId || eventId.replace('g-', '');

      // Verifica esistenza del job target PRIMA di toccare Google Calendar,
      // così un jobId stale/non valido non modifica l'evento Google prima del 404
      if (data.jobId) {
        const targetJobDoc = await db.collection('jobs').doc(data.jobId).get();
        if (!targetJobDoc.exists) {
          return res.status(404).json({ error: 'Lavoro selezionato non trovato' });
        }
      }

      await updateEvent('primary', googleId, {
        summary: data.title,
        description: data.description,
        start: startDate,
        end: endDate,
        location: data.location,
        isAllDay: data.isAllDay,
      });
      
      console.log(`✅ Evento Google Calendar aggiornato: ${googleId}`);

      // Gestione associazione a un lavoro (solo se il campo jobId è presente nel payload)
      if (data.jobId !== undefined) {
        const batch = db.batch();
        // Rimuovi l'evento da eventuali job che lo collegano già (tranne il nuovo target)
        const prevSnap = await db.collection('jobs')
          .where('linkedCalendarEventIds', 'array-contains', googleId)
          .get();
        prevSnap.forEach(doc => {
          if (doc.id !== data.jobId) {
            batch.update(doc.ref, {
              linkedCalendarEventIds: FieldValue.arrayRemove(googleId),
              updatedAt: Timestamp.now(),
            });
          }
        });
        // Aggiungi l'associazione al nuovo job (se non null)
        if (data.jobId) {
          batch.update(db.collection('jobs').doc(data.jobId), {
            linkedCalendarEventIds: FieldValue.arrayUnion(googleId),
            updatedAt: Timestamp.now(),
          });
        }
        await batch.commit();
        console.log(`📎 Associazione evento ${googleId} aggiornata → lavoro: ${data.jobId || 'rimossa'}`);
      }

    } else if (data.type === 'consulenza') {
      // Consulenza - aggiorna Firestore + Google Calendar se sincronizzato
      const consultationId = data.entityId || eventId.replace('c-', '');
      
      const consultationDoc = await db.collection('consultations').doc(consultationId).get();
      if (!consultationDoc.exists) {
        return res.status(404).json({ error: 'Consulenza non trovata' });
      }
      
      const consultation = consultationDoc.data();
      
      // Prepara update Firestore con tutti i campi rilevanti
      const firestoreUpdate: Record<string, any> = {
        dataConsulenza: Timestamp.fromDate(startDate),
        dataConsulenzaFine: Timestamp.fromDate(endDate),
        updatedAt: Timestamp.now(),
      };
      
      if (data.description !== undefined) {
        firestoreUpdate.note = data.description;
      }
      if (data.location !== undefined) {
        firestoreUpdate.luogo = data.location;
      }
      
      await db.collection('consultations').doc(consultationId).update(firestoreUpdate);
      
      // Se ha evento Google Calendar, aggiorna anche quello
      if (consultation?.googleCalendarEventId) {
        try {
          await updateEvent('primary', consultation.googleCalendarEventId, {
            summary: data.title || `Consulenza: ${consultation.cliente?.nome || ''} ${consultation.cliente?.cognome || ''}`.trim(),
            description: data.description,
            start: startDate,
            end: endDate,
            location: data.location,
            isAllDay: data.isAllDay,
          });
          console.log(`✅ Evento Google Calendar sincronizzato: ${consultation.googleCalendarEventId}`);
        } catch (gcError: any) {
          console.error('⚠️ Errore aggiornamento Google Calendar (consulenza aggiornata comunque):', gcError.message);
        }
      }
      
      console.log(`✅ Consulenza aggiornata: ${consultationId}`);
      
    } else if (data.type === 'job') {
      // Job - aggiorna Firestore + Google Calendar se sincronizzato
      const jobId = data.entityId || eventId.replace('j-', '');
      
      const jobDoc = await db.collection('jobs').doc(jobId).get();
      if (!jobDoc.exists) {
        return res.status(404).json({ error: 'Job non trovato' });
      }
      
      const job = jobDoc.data();
      
      // Prepara update Firestore con tutti i campi rilevanti
      const firestoreUpdate: Record<string, any> = {
        eventDate: Timestamp.fromDate(startDate),
        eventEndDate: Timestamp.fromDate(endDate),
        updatedAt: Timestamp.now(),
      };
      
      if (data.description !== undefined) {
        firestoreUpdate.noteInterne = data.description;
      }
      if (data.location !== undefined) {
        firestoreUpdate.luogo = data.location;
      }
      
      await db.collection('jobs').doc(jobId).update(firestoreUpdate);
      
      // Se ha evento Google Calendar, aggiorna anche quello
      if (job?.googleCalendarEventId) {
        try {
          await updateEvent('primary', job.googleCalendarEventId, {
            summary: data.title || job.nomeEvento || job.jobType || 'Job',
            description: data.description,
            start: startDate,
            end: endDate,
            location: data.location,
            isAllDay: data.isAllDay,
          });
          console.log(`✅ Evento Google Calendar sincronizzato: ${job.googleCalendarEventId}`);
        } catch (gcError: any) {
          console.error('⚠️ Errore aggiornamento Google Calendar (job aggiornato comunque):', gcError.message);
        }
      }
      
      console.log(`✅ Job aggiornato: ${jobId}`);
    }

    // Invalida la cache calendario così le modifiche (incl. associazioni) sono subito visibili
    calendarCache.clear();

    res.json({ 
      success: true, 
      message: 'Evento aggiornato con successo' 
    });
  } catch (error: any) {
    console.error('❌ Error updating calendar event:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Dati non validi',
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Failed to update event', message: error.message });
  }
});

/**
 * GET /api/calendar/connection-status
 * Verifica stato connessione Google Calendar via Service Account
 * Con Service Account non ci sono token che scadono
 */
router.get('/connection-status', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    const status = await getCalendarConnectionStatus();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'non configurato';
    
    res.json({
      connected: status.connected,
      accountEmail: status.email || '',
      calendarId,
      authMethod: 'service_account',
      needsReconnect: false,
      error: status.error || undefined,
    });
  } catch (error: any) {
    console.error('❌ Error checking calendar status:', error);
    res.status(500).json({
      connected: false,
      error: error.message || 'Errore verifica stato calendario'
    });
  }
});

export default router;
