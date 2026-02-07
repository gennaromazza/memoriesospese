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

const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

interface CacheEntry {
  data: StudioSuggestionsResponse;
  timestamp: number;
}
const suggestionsCache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 60 * 1000;

function getCachedSuggestions(cacheKey: string): StudioSuggestionsResponse | null {
  const entry = suggestionsCache.get(cacheKey);
  if (!entry) return null;
  
  const isExpired = Date.now() - entry.timestamp > CACHE_TTL_MS;
  if (isExpired) {
    suggestionsCache.delete(cacheKey);
    return null;
  }
  
  return entry.data;
}

function setCachedSuggestions(cacheKey: string, data: StudioSuggestionsResponse): void {
  suggestionsCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
}

export function invalidateSuggestionsCache(): void {
  suggestionsCache.clear();
  console.log('🗑️ Studio Assistant cache invalidata');
}

async function batchFetchDocs(collectionName: string, ids: string[]): Promise<Map<string, FirebaseFirestore.DocumentData>> {
  const map = new Map();
  if (ids.length === 0) return map;
  const chunks = [];
  for (let i = 0; i < ids.length; i += 100) {
    chunks.push(ids.slice(i, i + 100));
  }
  for (const chunk of chunks) {
    const refs = chunk.map(id => db.collection(collectionName).doc(id));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (doc.exists) {
        map.set(doc.id, doc.data()!);
      }
    }
  }
  return map;
}

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

function formatDateIT(date: Date): string {
  return date.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long'
  });
}

function toDate(value: any): Date | null {
  if (!value) return null;
  
  if (typeof value.toDate === 'function') {
    return value.toDate();
  }
  
  if (value instanceof Date) {
    return value;
  }
  
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  
  if (typeof value === 'number') {
    return new Date(value);
  }
  
  return null;
}

async function calculateWeeklyLoads(weeksAhead: number = 4): Promise<WeeklyLoad[]> {
  const loads: WeeklyLoad[] = [];
  const today = new Date();
  
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - today.getDay() + 1);
  currentMonday.setHours(0, 0, 0, 0);
  
  for (let week = 0; week < weeksAhead; week++) {
    const weekStart = new Date(currentMonday);
    weekStart.setDate(weekStart.getDate() + (week * 7));
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    const consultationsSnapshot = await db.collection('consultations')
      .where('dataConsulenza', '>=', weekStart)
      .where('dataConsulenza', '<=', weekEnd)
      .where('status', 'in', ['confermata', 'in_attesa'])
      .get();
    
    let totalWeight = 0;
    for (const doc of consultationsSnapshot.docs) {
      const data = doc.data();
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

async function findOptimalDateRange(
  templateId: string,
  weeksAhead: number = 4
): Promise<{ from: string; to: string } | null> {
  const loads = await calculateWeeklyLoads(weeksAhead);
  
  let prepDays = 0;
  try {
    const templateDoc = await db.collection('consultation_templates').doc(templateId).get();
    if (templateDoc.exists) {
      prepDays = templateDoc.data()?.giorniPreparazione || 0;
    }
  } catch (e) {
    console.warn('⚠️ Template non trovato per date range:', templateId);
  }
  
  const availableWeek = loads.find(w => !w.isFull);
  
  if (!availableWeek) {
    const leastBusy = loads.reduce((min, w) => 
      w.totalWeight < min.totalWeight ? w : min, loads[0]);
    
    const fromDate = new Date(leastBusy.weekStart);
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

router.get('/suggestions', verifyAdmin, async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { jobId, skipCache } = req.query;
    const cacheKey = `suggestions-${jobId || 'all'}`;
    
    if (!skipCache) {
      const cached = getCachedSuggestions(cacheKey);
      if (cached) {
        console.log(`⚡ Studio Assistant: Cache HIT (${Date.now() - startTime}ms)`);
        return res.json(cached);
      }
    }
    
    console.log('📊 Studio Assistant: Cache MISS, calcolo suggerimenti...');
    const now = new Date();
    
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
    
    // Batch-fetch jobs and clients for quotes
    const quoteJobIds = quotesSnapshot.docs.map(d => d.data().jobId).filter(Boolean);
    const uniqueQuoteJobIds = [...new Set(quoteJobIds)] as string[];
    const quoteJobsMap = await batchFetchDocs('jobs', uniqueQuoteJobIds);
    
    const quoteClientiIds: string[] = [];
    for (const [, jobData] of quoteJobsMap) {
      if (jobData.clientiIds?.length > 0) quoteClientiIds.push(jobData.clientiIds[0]);
    }
    const uniqueQuoteClientiIds = [...new Set(quoteClientiIds)];
    const quoteClientiMap = await batchFetchDocs('clienti', uniqueQuoteClientiIds);
    
    for (const quoteDoc of quotesSnapshot.docs) {
      const quote = quoteDoc.data();
      
      if (jobId && quote.jobId !== jobId) continue;

      if (quote.jobId) {
        const jobData = quoteJobsMap.get(quote.jobId);
        if (jobData) {
          const jobStatus = jobData.status;
          if (jobData.deleted === true || jobStatus === 'consegnato' || jobStatus === 'archiviato') {
            continue;
          }
        } else {
          continue;
        }
      }
      
      const sentAt = toDate(quote.sentAt) || toDate(quote.createdAt);
      if (!sentAt) continue;
      
      const daysSinceSent = Math.floor((now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24));
      
      let clientName = '';
      let clientPhone = '';
      let jobName = '';
      
      if (quote.jobId) {
        const jobData = quoteJobsMap.get(quote.jobId);
        if (jobData) {
          jobName = jobData.nomeEvento || '';
          
          if (jobData.clientiIds?.length > 0) {
            const cliente = quoteClientiMap.get(jobData.clientiIds[0]);
            if (cliente) {
              clientName = `${cliente.nome || ''} ${cliente.cognome || ''}`.trim();
              clientPhone = cliente.cellulare1 || cliente.cellulare2 || '';
            }
          }
        }
      }
      
      const followUpCount = quote.followUpCount || 0;
      const messageVariant = getMessageVariant(followUpCount);
      const priority = calculatePriority('unsigned_quote', daysSinceSent, followUpCount);
      
      const whatsappMessage = WHATSAPP_MESSAGES.unsignedQuote[messageVariant](
        clientName || 'Cliente',
        jobName || 'il tuo evento'
      );
      
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
    
    // Batch-fetch jobs and galleries for orders
    const orderJobIds = ordersSnapshot.docs.map(d => d.data().jobId).filter(Boolean);
    const orderGalleryIds = ordersSnapshot.docs.map(d => d.data().galleryId).filter(Boolean);
    const uniqueOrderJobIds = [...new Set(orderJobIds)] as string[];
    const uniqueOrderGalleryIds = [...new Set(orderGalleryIds)] as string[];
    const [orderJobsMap, orderGalleriesMap] = await Promise.all([
      batchFetchDocs('jobs', uniqueOrderJobIds),
      batchFetchDocs('galleries', uniqueOrderGalleryIds)
    ]);
    
    for (const orderDoc of ordersSnapshot.docs) {
      const order = orderDoc.data();
      
      if (jobId && order.jobId !== jobId) continue;

      if (order.stato === 'completato' || order.stato === 'consegnato') continue;

      if (order.jobId) {
        const jobData = orderJobsMap.get(order.jobId);
        if (jobData) {
          const jobStatus = jobData.status;
          if (jobData.deleted === true || jobStatus === 'consegnato' || jobStatus === 'archiviato') {
            continue;
          }
        } else {
          continue;
        }
      }

      if (order.statoWorkflow === 'consegnato' || order.statoWorkflow === 'pronto_ritiro') {
        continue;
      }

      if (order.galleryId) {
        const galleryData = orderGalleriesMap.get(order.galleryId);
        if (galleryData) {
          if (galleryData.workflowState === 'consegnato' || galleryData.workflowState === 'pronto_ritiro') {
            continue;
          }
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

    // Batch-fetch jobs and galleries for bookings
    const bookingJobIds = bookingsSnapshot.docs.map(d => d.data().jobId).filter(Boolean);
    const bookingGalleryIds = bookingsSnapshot.docs.map(d => d.data().specialGalleryId).filter(Boolean);
    const uniqueBookingJobIds = [...new Set(bookingJobIds)] as string[];
    const uniqueBookingGalleryIds = [...new Set(bookingGalleryIds)] as string[];
    const [bookingJobsMap, bookingGalleriesMap] = await Promise.all([
      batchFetchDocs('jobs', uniqueBookingJobIds),
      batchFetchDocs('galleries', uniqueBookingGalleryIds)
    ]);

    for (const bookingDoc of bookingsSnapshot.docs) {
      const booking = bookingDoc.data();
      
      if (jobId && booking.jobId !== jobId) continue;

      if (booking.jobId) {
        const jobData = bookingJobsMap.get(booking.jobId);
        if (jobData) {
          const jobStatus = jobData.status;
          if (jobData.deleted === true || jobStatus === 'consegnato' || jobStatus === 'archiviato') {
            continue;
          }
        } else {
          continue;
        }
      }

      if (booking.stato === 'completata' || booking.statoWorkflow === 'consegnato' || booking.statoWorkflow === 'pronto_ritiro') {
        continue;
      }

      if (booking.specialGalleryId) {
        const galleryData = bookingGalleriesMap.get(booking.specialGalleryId);
        if (galleryData) {
          if (galleryData.workflowState === 'consegnato' || galleryData.workflowState === 'pronto_ritiro') {
            continue;
          }
        }
      }

      const shootingDate = toDate(booking.dataShootingInizio);
      if (!shootingDate || shootingDate > now) continue;

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
    
    // Batch-fetch clients for jobs section
    const jobClientiIds: string[] = [];
    for (const jobDoc of jobsSnapshot.docs) {
      const job = jobDoc.data();
      if (job.deleted === true) continue;
      if (job.clientiIds?.length > 0) jobClientiIds.push(job.clientiIds[0]);
    }
    const uniqueJobClientiIds = [...new Set(jobClientiIds)];
    const jobClientiMap = await batchFetchDocs('clienti', uniqueJobClientiIds);
    
    for (const jobDoc of jobsSnapshot.docs) {
      const job = jobDoc.data();
      
      if (job.deleted === true) continue;
      
      if (jobId && jobDoc.id !== jobId) continue;
      
      const eventDate = toDate(job.eventDate);
      if (!eventDate) continue;
      
      if (eventDate > now) continue;
      
      const monthsSinceEvent = Math.floor((now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
      
      if (monthsSinceEvent < 3) continue;
      
      let clientName = '';
      let clientPhone = '';
      
      if (job.clientiIds?.length > 0) {
        const cliente = jobClientiMap.get(job.clientiIds[0]);
        if (cliente) {
          clientName = `${cliente.nome || ''} ${cliente.cognome || ''}`.trim();
          clientPhone = cliente.cellulare1 || cliente.cellulare2 || '';
        }
      }
      
      const priority = calculatePriority('pending_delivery', monthsSinceEvent);
      
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
    
    const allSuggestions = [
      ...unsignedQuotes, 
      ...pendingDeliveries, 
      ...consultations, 
      ...needsWorkJobs, 
      ...pendingOrders, 
      ...pendingBookings
    ];
    const highPriority = allSuggestions.filter(s => s.priority === 'high').length;
    
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
    
    setCachedSuggestions(cacheKey, response);
    console.log(`📊 Studio Assistant: Calcolo completato in ${Date.now() - startTime}ms, salvato in cache`);
    
    return res.json(response);
    
  } catch (error) {
    console.error('❌ Errore calcolo suggerimenti:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

router.post('/suggestions/:id/action', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, pendingReason, jobId } = req.body;
    const adminEmail = (req as any).adminEmail;
    
    const [type, docId] = id.split('_');
    
    if (type === 'quote' && action === 'contacted') {
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
      const targetJobId = jobId || docId;
      await db.collection('jobs').doc(targetJobId).update({
        status: 'consegnato',
        needsWork: false,
        pendingReason: FieldValue.delete(),
        needsWorkSince: FieldValue.delete(),
        updatedAt: new Date()
      });
    }
    
    if (action === 'archived') {
      await db.collection('dismissedSuggestions').doc(id).set({
        suggestionId: id,
        type,
        docId,
        dismissedAt: new Date(),
        dismissedBy: adminEmail,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
    }
    
    invalidateSuggestionsCache();
    
    return res.json({ success: true });
    
  } catch (error) {
    console.error('❌ Errore azione suggerimento:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

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
      updateData.pendingReason = FieldValue.delete();
      updateData.needsWorkSince = FieldValue.delete();
      updateData.status = 'consegnato';
    }
    
    await db.collection('jobs').doc(id).update(updateData);
    
    invalidateSuggestionsCache();
    
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
