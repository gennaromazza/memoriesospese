/**
 * STUDIO ASSISTANT ROUTES
 * Endpoint per il sistema suggerimenti intelligenti
 */

import { Router, Request, Response } from 'express';
import { db, FieldValue } from './firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import type { 
  StudioSuggestion, 
  StudioSuggestionsResponse,
  SuggestionType,
  SuggestionPriority,
  QuoteFollowUpStatus,
  MessageVariant,
  PendingReason,
  WeeklyLoad
} from '../shared/studio-assistant-types';
import { WHATSAPP_MESSAGES, calculatePriority, getMessageVariant } from '../shared/studio-assistant-types';

const router = Router();

// Lista admin autorizzati
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

/**
 * Middleware verifica admin
 */
async function verifyAdmin(req: Request, res: Response, next: Function) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token mancante' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    
    if (!ADMIN_EMAILS.includes(decodedToken.email || '')) {
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }
    
    (req as any).adminEmail = decodedToken.email;
    next();
  } catch (error) {
    console.error('❌ Errore verifica admin:', error);
    return res.status(401).json({ error: 'Token non valido' });
  }
}

/**
 * Helper: Calcola giorni lavorativi tra due date
 */
function addWorkingDays(date: Date, days: number): Date {
  const result = new Date(date);
  let addedDays = 0;
  
  while (addedDays < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      addedDays++;
    }
  }
  
  return result;
}

/**
 * Helper: Formatta data per visualizzazione
 */
function formatDateIT(date: Date): string {
  return date.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long'
  });
}

/**
 * Helper: Converte un valore Firestore in Date (gestisce Timestamp, stringa, Date)
 */
function toDate(value: any): Date | null {
  if (!value) return null;
  
  // Firestore Timestamp
  if (typeof value.toDate === 'function') {
    return value.toDate();
  }
  
  // Già una Date
  if (value instanceof Date) {
    return value;
  }
  
  // Stringa ISO o altro formato
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  
  // Numero (timestamp Unix)
  if (typeof value === 'number') {
    return new Date(value);
  }
  
  return null;
}

/**
 * Helper: Calcola carico settimanale consulenze
 */
async function calculateWeeklyLoads(weeksAhead: number = 4): Promise<WeeklyLoad[]> {
  const loads: WeeklyLoad[] = [];
  const today = new Date();
  
  // Trova lunedì corrente
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - today.getDay() + 1);
  currentMonday.setHours(0, 0, 0, 0);
  
  for (let week = 0; week < weeksAhead; week++) {
    const weekStart = new Date(currentMonday);
    weekStart.setDate(weekStart.getDate() + (week * 7));
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    // Cerca consulenze in questa settimana
    const consultationsSnapshot = await db.collection('consultations')
      .where('dataConsulenza', '>=', weekStart)
      .where('dataConsulenza', '<=', weekEnd)
      .where('status', 'in', ['confermata', 'in_attesa'])
      .get();
    
    let totalWeight = 0;
    for (const doc of consultationsSnapshot.docs) {
      const data = doc.data();
      // Cerca il template per ottenere il peso
      if (data.templateId) {
        const templateDoc = await db.collection('consultation_templates').doc(data.templateId).get();
        const templateWeight = templateDoc.exists ? (templateDoc.data()?.weight || 1) : 1;
        totalWeight += templateWeight;
      } else {
        totalWeight += 1;
      }
    }
    
    loads.push({
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      totalWeight,
      consultationsCount: consultationsSnapshot.size,
      isFull: totalWeight >= 8
    });
  }
  
  return loads;
}

/**
 * Helper: Trova range date ottimale per consulenza
 */
async function findOptimalDateRange(
  templateId: string,
  weeksAhead: number = 4
): Promise<{ from: string; to: string } | null> {
  const loads = await calculateWeeklyLoads(weeksAhead);
  
  // Ottieni giorni preparazione dal template
  let prepDays = 0;
  try {
    const templateDoc = await db.collection('consultation_templates').doc(templateId).get();
    if (templateDoc.exists) {
      prepDays = templateDoc.data()?.giorniPreparazione || 0;
    }
  } catch (e) {
    console.warn('⚠️ Template non trovato per date range:', templateId);
  }
  
  // Trova prima settimana non piena
  const availableWeek = loads.find(w => !w.isFull);
  
  if (!availableWeek) {
    // Tutte le settimane piene, suggerisci comunque la meno impegnata
    const leastBusy = loads.reduce((min, w) => 
      w.totalWeight < min.totalWeight ? w : min, loads[0]);
    
    const fromDate = new Date(leastBusy.weekStart);
    // Aggiungi giorni preparazione
    const adjustedFrom = addWorkingDays(fromDate, prepDays);
    
    return {
      from: adjustedFrom.toISOString().split('T')[0],
      to: leastBusy.weekEnd
    };
  }
  
  const fromDate = new Date(availableWeek.weekStart);
  const adjustedFrom = addWorkingDays(fromDate, prepDays);
  
  return {
    from: adjustedFrom.toISOString().split('T')[0],
    to: availableWeek.weekEnd
  };
}

/**
 * GET /api/studio-assistant/suggestions
 * Calcola e restituisce tutti i suggerimenti
 */
router.get('/suggestions', verifyAdmin, async (req: Request, res: Response) => {
  console.log('📊 Studio Assistant: Inizio calcolo suggerimenti');
  try {
    const { jobId } = req.query;
    const now = new Date();
    console.log('📊 Studio Assistant: jobId =', jobId || 'tutti');
    
    // Carica suggerimenti ignorati (non scaduti)
    const dismissedSnapshot = await db.collection('dismissedSuggestions')
      .where('expiresAt', '>', now)
      .get();
    const dismissedIds = new Set(dismissedSnapshot.docs.map(d => d.id));
    console.log('📊 Studio Assistant: suggerimenti ignorati =', dismissedIds.size);
    
    const unsignedQuotes: StudioSuggestion[] = [];
    const pendingDeliveries: StudioSuggestion[] = [];
    const consultations: StudioSuggestion[] = [];
    const needsWorkJobs: StudioSuggestion[] = [];
    const pendingOrders: StudioSuggestion[] = [];
    const pendingBookings: StudioSuggestion[] = [];
    
    // 1. Preventivi non firmati (inviati o visionati da più di 7 giorni)
    const quotesSnapshot = await db.collection('quotes')
      .where('status', 'in', ['inviato', 'visionato'])
      .get();
    
    console.log('📊 Studio Assistant: preventivi trovati con status inviato/visionato =', quotesSnapshot.docs.length);
    
    for (const quoteDoc of quotesSnapshot.docs) {
      const quote = quoteDoc.data();
      
      // Filtra per jobId se specificato
      if (jobId && quote.jobId !== jobId) continue;

      // Salta se il preventivo è legato a un lavoro già consegnato o archiviato
      if (quote.jobId) {
        try {
          const jobDoc = await db.collection('jobs').doc(quote.jobId).get();
          if (jobDoc.exists) {
            const jobStatus = jobDoc.data()?.status;
            if (jobStatus === 'consegnato' || jobStatus === 'archiviato') {
              continue;
            }
          }
        } catch (e) {
          console.warn('⚠️ Errore controllo status job per quote:', quoteDoc.id);
        }
      }
      
      const sentAt = toDate(quote.sentAt) || toDate(quote.createdAt);
      if (!sentAt) continue;
      
      const daysSinceSent = Math.floor((now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24));
      
      // Recupera dati cliente
      let clientName = '';
      let clientPhone = '';
      let jobName = '';
      
      if (quote.jobId) {
        try {
          const jobDoc = await db.collection('jobs').doc(quote.jobId).get();
          if (jobDoc.exists) {
            const jobData = jobDoc.data();
            if (jobData) {
              jobName = jobData.nomeEvento || '';
              
              if (jobData.clientiIds?.length > 0) {
                const clienteDoc = await db.collection('clienti').doc(jobData.clientiIds[0]).get();
                if (clienteDoc.exists) {
                  const cliente = clienteDoc.data();
                  clientName = `${cliente?.nome || ''} ${cliente?.cognome || ''}`.trim();
                  clientPhone = cliente?.cellulare1 || cliente?.cellulare2 || '';
                }
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ Errore recupero dati job/cliente per quote:', quoteDoc.id);
        }
      }
      
      // Determina variante messaggio
      const followUpCount = quote.followUpCount || 0;
      const messageVariant = getMessageVariant(followUpCount);
      const priority = calculatePriority('unsigned_quote', daysSinceSent, followUpCount);
      
      // Genera messaggio WhatsApp
      const whatsappMessage = WHATSAPP_MESSAGES.unsignedQuote[messageVariant](
        clientName || 'Cliente',
        jobName || 'il tuo evento'
      );
      
      // Salta se ignorato
      const suggestionId = `quote_${quoteDoc.id}`;
      if (dismissedIds.has(suggestionId)) continue;
      
      unsignedQuotes.push({
        id: suggestionId,
        type: 'unsigned_quote',
        quoteId: quoteDoc.id,
        jobId: quote.jobId,
        jobName,
        clientName,
        clientPhone,
        priority,
        createdAt: quote.createdAt,
        daysSinceQuoteSent: daysSinceSent,
        followUpStatus: followUpCount === 0 ? 'never_contacted' : 
                       followUpCount === 1 ? 'contacted_once' : 
                       followUpCount >= 2 ? 'contacted_twice' : 'never_contacted',
        followUpCount,
        messageVariant,
        whatsappMessage,
        reason: `📝 Preventivo inviato ${daysSinceSent} giorni fa`
      });
    }

    // 4. Ordini non completati (walk-in e normali)
    const ordersSnapshot = await db.collection('orders')
      .where('stato', 'in', ['bozza', 'in_lavorazione'])
      .get();
    
    for (const orderDoc of ordersSnapshot.docs) {
      const order = orderDoc.data();
      
      // Filtra per jobId se specificato
      if (jobId && order.jobId !== jobId) continue;

      // Salta se l'ordine è completato o consegnato (già filtrato da query, ma per sicurezza se cambiano gli stati)
      if (order.stato === 'completato' || order.stato === 'consegnato') continue;

      // Salta se l'ordine è legato a un lavoro già consegnato o archiviato
      if (order.jobId) {
        try {
          const jobDoc = await db.collection('jobs').doc(order.jobId).get();
          if (jobDoc.exists) {
            const jobStatus = jobDoc.data()?.status;
            if (jobStatus === 'consegnato' || jobStatus === 'archiviato') {
              continue;
            }
          }
        } catch (e) {
          console.warn('⚠️ Errore controllo status job per ordine:', orderDoc.id);
        }
      }

      // Controllo WorkflowState per ordini/gallerie
      if (order.statoWorkflow === 'consegnato' || order.statoWorkflow === 'completato') {
        continue;
      }

      // Controllo galleria associata (se presente)
      if (order.galleryId) {
        try {
          const galleryDoc = await db.collection('galleries').doc(order.galleryId).get();
          if (galleryDoc.exists) {
            const galleryData = galleryDoc.data();
            if (galleryData?.workflowState === 'consegnato' || galleryData?.workflowState === 'completato') {
              continue;
            }
          }
        } catch (e) {
          console.warn('⚠️ Errore controllo gallery status per ordine:', orderDoc.id);
        }
      }

      const createdAt = toDate(order.createdAt) || now;
      const daysSinceCreated = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      
      const suggestionId = `order_${orderDoc.id}`;
      if (dismissedIds.has(suggestionId)) continue;

      pendingOrders.push({
        id: suggestionId,
        type: 'pending_order',
        orderId: orderDoc.id,
        jobId: order.jobId,
        clientName: order.nomeCliente || 'Cliente',
        orderTotal: order.totale || 0,
        orderStatus: order.stato,
        isWalkIn: !order.bookingId,
        priority: daysSinceCreated > 7 ? 'high' : 'medium',
        createdAt: order.createdAt,
        daysSinceOrderCreated: daysSinceCreated,
        reason: `📦 Ordine ${order.stato === 'bozza' ? 'in bozza' : 'in lavorazione'} da ${daysSinceCreated} giorni`
      });
    }

    // 5. Prenotazioni non completate
    const bookingsSnapshot = await db.collection('bookings')
      .where('stato', 'in', ['in_attesa', 'confermata'])
      .get();

    for (const bookingDoc of bookingsSnapshot.docs) {
      const booking = bookingDoc.data();
      
      // Filtra per jobId se specificato
      if (jobId && booking.jobId !== jobId) continue;

      // Salta se la prenotazione è legata a un lavoro già consegnato o archiviato
      if (booking.jobId) {
        try {
          const jobDoc = await db.collection('jobs').doc(booking.jobId).get();
          if (jobDoc.exists) {
            const jobStatus = jobDoc.data()?.status;
            if (jobStatus === 'consegnato' || jobStatus === 'archiviato') {
              continue;
            }
          }
        } catch (e) {
          console.warn('⚠️ Errore controllo status job per booking:', bookingDoc.id);
        }
      }

      // Controllo WorkflowState e Stato Prenotazione
      if (booking.stato === 'completata' || booking.statoWorkflow === 'consegnato' || booking.statoWorkflow === 'completato') {
        continue;
      }

      // Controllo galleria speciale allegata
      if (booking.specialGalleryId) {
        try {
          const galleryDoc = await db.collection('galleries').doc(booking.specialGalleryId).get();
          if (galleryDoc.exists) {
            const galleryData = galleryDoc.data();
            if (galleryData?.workflowState === 'consegnato' || galleryData?.workflowState === 'completato') {
              continue;
            }
          }
        } catch (e) {
          console.warn('⚠️ Errore controllo special gallery per booking:', bookingDoc.id);
        }
      }

      const shootingDate = toDate(booking.dataShootingInizio);
      if (!shootingDate || shootingDate > now) continue; // Solo se data passata

      const daysSinceBooking = Math.floor((now.getTime() - shootingDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const suggestionId = `booking_${bookingDoc.id}`;
      if (dismissedIds.has(suggestionId)) continue;

      pendingBookings.push({
        id: suggestionId,
        type: 'pending_booking',
        bookingId: bookingDoc.id,
        clientName: `${booking.cliente?.nome || ''} ${booking.cliente?.cognome || ''}`.trim(),
        bookingStatus: booking.stato,
        bookingDate: shootingDate.toISOString(),
        priority: daysSinceBooking > 2 ? 'high' : 'medium',
        createdAt: booking.createdAt,
        daysSinceBooking: daysSinceBooking,
        reason: `📅 Prenotazione ${booking.stato === 'in_attesa' ? 'da confermare' : 'da completare'} (data passata: ${formatDateIT(shootingDate)})`
      });
    }

    // 2. Lavori da consegnare (evento passato da più di 3 mesi, non consegnati)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const jobsSnapshot = await db.collection('jobs')
      .where('status', 'not-in', ['consegnato', 'archiviato'])
      .get();
    
    for (const jobDoc of jobsSnapshot.docs) {
      const job = jobDoc.data();
      
      // Filtra per jobId se specificato
      if (jobId && jobDoc.id !== jobId) continue;
      
      const eventDate = toDate(job.eventDate);
      if (!eventDate) continue;
      
      // Solo eventi passati
      if (eventDate > now) continue;
      
      const monthsSinceEvent = Math.floor((now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
      
      // Suggerisci solo se passati almeno 3 mesi
      if (monthsSinceEvent < 3) continue;
      
      // Recupera nome cliente
      let clientName = '';
      let clientPhone = '';
      
      if (job.clientiIds?.length > 0) {
        try {
          const clienteDoc = await db.collection('clienti').doc(job.clientiIds[0]).get();
          if (clienteDoc.exists) {
            const cliente = clienteDoc.data();
            clientName = `${cliente?.nome || ''} ${cliente?.cognome || ''}`.trim();
            clientPhone = cliente?.cellulare1 || cliente?.cellulare2 || '';
          }
        } catch (e) {
          console.warn('⚠️ Errore recupero cliente per job:', jobDoc.id);
        }
      }
      
      const priority = calculatePriority('pending_delivery', monthsSinceEvent);
      
      // Se già flaggato come needsWork, aggiungi a quella lista
      if (job.needsWork) {
        const suggestionId = `needswork_${jobDoc.id}`;
        if (dismissedIds.has(suggestionId)) continue;
        
        needsWorkJobs.push({
          id: suggestionId,
          type: 'pending_delivery',
          jobId: jobDoc.id,
          jobName: job.nomeEvento,
          clientName,
          clientPhone,
          eventDate: eventDate.toISOString(),
          jobType: job.jobType,
          priority,
          createdAt: job.createdAt,
          monthsSinceEvent,
          pendingReason: job.pendingReason,
          reason: (() => {
            const workSince = toDate(job.needsWorkSince);
            return workSince 
              ? `📌 Marcato come 'da lavorare' ${Math.floor((now.getTime() - workSince.getTime()) / (1000 * 60 * 60 * 24))} giorni fa`
              : `⏰ Evento di ${monthsSinceEvent} mesi fa`;
          })()
        });
      } else {
        const deliveryId = `delivery_${jobDoc.id}`;
        if (dismissedIds.has(deliveryId)) continue;
        
        pendingDeliveries.push({
          id: deliveryId,
          type: 'pending_delivery',
          jobId: jobDoc.id,
          jobName: job.nomeEvento,
          clientName,
          clientPhone,
          eventDate: eventDate.toISOString(),
          jobType: job.jobType,
          priority,
          createdAt: job.createdAt,
          monthsSinceEvent,
          reason: `⏰ Evento di ${monthsSinceEvent} mesi fa – non ancora consegnato`
        });
      }
    }
    
    // 3. Consulenze suggerite (jobs in stati specifici senza consulenze recenti)
    // TODO: Implementare logica consulenze basata su template e stato job
    
    // Calcola statistiche
    const allSuggestions = [
      ...unsignedQuotes, 
      ...pendingDeliveries, 
      ...consultations, 
      ...pendingOrders, 
      ...pendingBookings
    ];
    const highPriority = allSuggestions.filter(s => s.priority === 'high').length;
    
    // Stima tempo: 2 min per azione
    const estimatedMinutes = allSuggestions.length * 2;
    
    console.log('📊 Studio Assistant: Risultati finali:', {
      unsignedQuotes: unsignedQuotes.length,
      pendingDeliveries: pendingDeliveries.length,
      consultations: consultations.length,
      needsWorkJobs: needsWorkJobs.length,
      pendingOrders: pendingOrders.length,
      pendingBookings: pendingBookings.length
    });
    
    const response: StudioSuggestionsResponse = {
      success: true,
      data: {
        unsignedQuotes,
        pendingDeliveries,
        consultations,
        needsWorkJobs,
        pendingOrders,
        pendingBookings
      },
      stats: {
        totalActions: allSuggestions.length,
        estimatedMinutes,
        highPriority
      }
    };
    
    return res.json(response);
    
  } catch (error) {
    console.error('❌ Errore calcolo suggerimenti:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * POST /api/studio-assistant/suggestions/:id/action
 * Esegue azione su suggerimento
 */
router.post('/suggestions/:id/action', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, pendingReason, jobId } = req.body;
    const adminEmail = (req as any).adminEmail;
    
    // Parse ID per capire il tipo
    const [type, docId] = id.split('_');
    
    if (type === 'quote' && action === 'contacted') {
      // Incrementa contatore follow-up sul preventivo
      const quoteRef = db.collection('quotes').doc(docId);
      const quoteDoc = await quoteRef.get();
      
      if (quoteDoc.exists) {
        const currentCount = quoteDoc.data()?.followUpCount || 0;
        await quoteRef.update({
          followUpCount: currentCount + 1,
          lastFollowUpAt: new Date(),
          updatedAt: new Date()
        });
      }
    }
    
    if ((type === 'delivery' || type === 'needswork') && action === 'completed') {
      // Marca job come consegnato
      const targetJobId = jobId || docId;
      await db.collection('jobs').doc(targetJobId).update({
        status: 'consegnato',
        needsWork: false,
        pendingReason: FieldValue.delete(),
        needsWorkSince: FieldValue.delete(),
        updatedAt: new Date()
      });
    }
    
    // Gestione azione "archived" (ignora suggerimento)
    if (action === 'archived') {
      // Salva suggerimento ignorato per non mostrarlo di nuovo
      await db.collection('dismissedSuggestions').doc(id).set({
        suggestionId: id,
        type,
        docId,
        dismissedAt: new Date(),
        dismissedBy: adminEmail,
        // Scade automaticamente dopo 30 giorni
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
    }
    
    return res.json({ success: true });
    
  } catch (error) {
    console.error('❌ Errore azione suggerimento:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * PATCH /api/jobs/:id/work-status
 * Aggiorna stato lavorazione job
 */
router.patch('/jobs/:id/work-status', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { needsWork, pendingReason } = req.body;
    
    const updateData: any = {
      needsWork,
      updatedAt: new Date()
    };
    
    if (needsWork) {
      updateData.pendingReason = pendingReason || 'other';
      updateData.needsWorkSince = new Date();
    } else {
      // Rimuovi campi se non più "da lavorare"
      updateData.pendingReason = FieldValue.delete();
      updateData.needsWorkSince = FieldValue.delete();
      updateData.status = 'consegnato';
    }
    
    await db.collection('jobs').doc(id).update(updateData);
    
    return res.json({ success: true });
    
  } catch (error) {
    console.error('❌ Errore aggiornamento work-status:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

export default router;
