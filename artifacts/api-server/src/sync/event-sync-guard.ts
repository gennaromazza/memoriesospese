/**
 * EVENT SYNC GUARD
 * Sistema di sincronizzazione e auto-riparazione tra Google Calendar e Firestore
 * 
 * Elimina il problema degli eventi fantasma garantendo coerenza bidirezionale tra:
 * - Google Calendar (sorgente eventi)
 * - Firestore collections (consultations, bookings)
 * 
 * Features:
 * - Recupero completo eventi da Google Calendar via events.list()
 * - Confronto automatico con Firestore
 * - Auto-riparazione stato inconsistente
 * - Logging dettagliato
 * - Schedulazione automatica ogni 5-10 minuti
 */

import { db } from "../firebase-admin.js";
import { getEventsWithDetailsAllCalendars } from "../google-calendar.js";
import type { Consultation } from "../../shared/consultation-types.js";
import type { Booking } from "../../shared/booking-types.js";
import { nowRomeDate } from "../utils/timezone.js";

// ========================================
// TYPES
// ========================================

interface SyncReport {
  timestamp: Date;
  duration: number;
  googleCalendarEvents: number;
  firestoreRecords: {
    consultations: number;
    bookings: number;
  };
  repairs: {
    consultations: RepairAction[];
    bookings: RepairAction[];
    jobs: { id: string; action: string }[];
  };
  orphanedGoogleEvents: string[]; // Eventi GCAL senza riferimento in Firestore
}

interface RepairAction {
  id: string;
  type: 'missing_gcal_event' | 'orphaned_firestore_ref';
  action: string;
  googleCalendarEventId?: string;
}

// ========================================
// CORE SYNC LOGIC
// ========================================

/**
 * Recupera TUTTI gli eventi da Google Calendar
 * Usa events.list() invece di freebusy per accedere ai dettagli completi
 * Range OTTIMIZZATO: ultimi 30 giorni + prossimi 90 giorni (4 mesi totali)
 * 
 * IMPORTANTE: Un worker NON deve MAI propagare errori fatali.
 * In caso di errore, restituisce un Set vuoto e continua a vivere.
 */
async function getAllGoogleCalendarEvents(): Promise<Set<string> | null> {
  console.log('[EVENT SYNC GUARD] 🔍 Fetching all events from Google Calendar (optimized range)...');
  
  try {
    // FIX: Usa Luxon per calcoli timezone-safe
    const { DateTime } = await import('luxon');
    const nowRome = DateTime.now().setZone('Europe/Rome');
    const timeMin = nowRome.minus({ days: 30 }).startOf('day').toJSDate();
    const timeMax = nowRome.plus({ days: 90 }).endOf('day').toJSDate();
    
    console.log(`[EVENT SYNC GUARD] 📅 Range OTTIMIZZATO: ${timeMin.toISOString()} -> ${timeMax.toISOString()}`);
    
    const events = await getEventsWithDetailsAllCalendars(timeMin, timeMax);
    
    // Estrai solo gli ID degli eventi validi
    const eventIds = new Set<string>();
    
    events.forEach((event: any) => {
      if (event.eventId) {
        eventIds.add(event.eventId);
      }
    });
    
    console.log(`[EVENT SYNC GUARD] ✅ Found ${eventIds.size} valid events in Google Calendar`);
    return eventIds;
    
  } catch (error: any) {
    // ✅ MAI throw da un worker! Assorbi l'errore ma segnala "calendario non disponibile":
    // ritornare un Set vuoto farebbe credere alla sync che TUTTI gli eventi Firestore
    // siano spariti da Google → cancellerebbe i riferimenti googleCalendarEventId validi.
    console.error('[EVENT SYNC GUARD] ❌ Error fetching Google Calendar events (absorbed):', error?.message || error);
    return null; // null = Google non leggibile → la sync salta il confronto/riparazioni
  }
}

/**
 * Carica tutte le consultations da Firestore che hanno googleCalendarEventId
 */
async function getConsultationsWithGoogleEvents(): Promise<Consultation[]> {
  const snapshot = await db.collection('consultations')
    .where('googleCalendarEventId', '!=', null)
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Consultation));
}

/**
 * Carica tutti i bookings da Firestore che hanno googleCalendarEventId
 */
async function getBookingsWithGoogleEvents(): Promise<Booking[]> {
  const snapshot = await db.collection('bookings')
    .where('googleCalendarEventId', '!=', null)
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
}

/**
 * Ripara una consultation che ha perso il suo evento Google Calendar
 * 
 * IMPORTANTE: NON resettare lo stato a 'in_attesa' per consultation già confermate!
 * Le consultation confermate hanno già passato il controllo e l'evento Calendar potrebbe
 * essere stato cancellato manualmente dall'admin. Mantenere lo stato confermato.
 * Solo rimuovere il riferimento all'evento Calendar.
 */
async function repairConsultation(consultation: Consultation): Promise<RepairAction> {
  console.log(`[EVENT SYNC GUARD] 🔧 Repairing Consultation ${consultation.id}...`);
  
  // NON resettare lo stato - mantenere quello esistente
  // L'evento Calendar potrebbe essere stato cancellato manualmente
  const updateData: any = {
    googleCalendarEventId: null,
  };
  
  // Log warning se era confermata (senza cambiare stato)
  if (consultation.stato === 'confermata') {
    console.log(`[EVENT SYNC GUARD]    ⚠️ Consultation was 'confermata' - keeping status, only removing GCAL ref`);
  }
  
  await db.collection('consultations').doc(consultation.id).update(updateData);
  
  const action = `Removed missing GCAL event ${consultation.googleCalendarEventId} (status kept: ${consultation.stato})`;
  
  console.log(`[EVENT SYNC GUARD] ✅ Consultation ${consultation.id} repaired — ${action}`);
  
  return {
    id: consultation.id,
    type: 'missing_gcal_event',
    action,
    googleCalendarEventId: consultation.googleCalendarEventId,
  };
}

/**
 * Ripara un booking che ha perso il suo evento Google Calendar
 * 
 * IMPORTANTE: NON resettare lo stato a 'in_attesa' per booking già confermati!
 * I booking confermati hanno già passato il controllo e l'evento Calendar potrebbe
 * essere stato cancellato manualmente dall'admin. Mantenere lo stato confermato.
 * Solo rimuovere il riferimento all'evento Calendar.
 */
async function repairBooking(booking: Booking): Promise<RepairAction> {
  console.log(`[EVENT SYNC GUARD] 🔧 Repairing Booking ${booking.id}...`);
  
  // NON resettare lo stato - mantenere quello esistente
  // L'evento Calendar potrebbe essere stato cancellato manualmente
  const updateData: any = {
    googleCalendarEventId: null,
  };
  
  // Log warning se era confermata (senza cambiare stato)
  if (booking.stato === 'confermata') {
    console.log(`[EVENT SYNC GUARD]    ⚠️ Booking was 'confermata' - keeping status, only removing GCAL ref`);
  }
  
  await db.collection('bookings').doc(booking.id).update(updateData);
  
  const action = `Removed missing GCAL event ${booking.googleCalendarEventId} (status kept: ${booking.stato})`;
  
  console.log(`[EVENT SYNC GUARD] ✅ Booking ${booking.id} repaired — ${action}`);
  
  return {
    id: booking.id,
    type: 'missing_gcal_event',
    action,
    googleCalendarEventId: booking.googleCalendarEventId,
  };
}

/**
 * Trova e ripara job con preventivo firmato ma status ancora "lead" o "in-trattativa".
 * Questo accade quando la chiamata post-signature fallisce lato client (es. errore di rete su mobile).
 */
async function repairSignedQuoteJobs(): Promise<{ id: string; action: string }[]> {
  const repairs: { id: string; action: string }[] = [];

  const jobsSnap = await db.collection('jobs')
    .where('status', 'in', ['lead', 'in-trattativa'])
    .get();

  if (jobsSnap.empty) return repairs;

  for (const jobDoc of jobsSnap.docs) {
    const job = { id: jobDoc.id, ...jobDoc.data() } as any;
    if (!job.quoteIds || job.quoteIds.length === 0) continue;

    let hasSignedQuote = false;
    let signedQuoteTotal = 0;

    for (const quoteId of job.quoteIds) {
      try {
        const quoteDoc = await db.collection('quotes').doc(quoteId).get();
        if (quoteDoc.exists) {
          const quote = quoteDoc.data()!;
          if (quote.status === 'firmato' || quote.signature?.signedAt) {
            hasSignedQuote = true;
            signedQuoteTotal = quote.totaleSelezionato || quote.totalAfterDiscount || quote.totalAmount || 0;
            break;
          }
        }
      } catch {}
    }

    if (!hasSignedQuote) continue;

    try {
      const updateData: any = {
        status: 'confermato',
        updatedAt: nowRomeDate(),
      };
      if (signedQuoteTotal > 0) {
        updateData['financials.totalePreventivato'] = signedQuoteTotal;
      }
      await db.collection('jobs').doc(job.id).update(updateData);

      // Aggiungi timeline event se mancante
      const existingTimeline = await db.collection('jobTimeline')
        .where('jobId', '==', job.id)
        .where('tipo', '==', 'preventivo_firmato')
        .limit(1)
        .get();

      if (existingTimeline.empty) {
        await db.collection('jobTimeline').add({
          jobId: job.id,
          tipo: 'preventivo_firmato',
          descrizione: 'Preventivo firmato (recuperato automaticamente da Event Sync Guard)',
          data: nowRomeDate(),
        });
      }

      // Sync Google Calendar
      try {
        const { ensureJobCalendarEvent } = await import('../job-routes.js');
        await ensureJobCalendarEvent(job.id);
      } catch (calErr: any) {
        console.warn(`[EVENT SYNC GUARD] ⚠️ Sync Calendar fallito per job ${job.id}:`, calErr?.message);
      }

      const action = `Job aveva preventivo firmato ma status era "${job.status}". Aggiornato a "confermato".`;
      repairs.push({ id: job.id, action });
      console.log(`[EVENT SYNC GUARD] 🔧 JOB REPAIR: ${job.id} - ${action}`);
    } catch (err: any) {
      console.error(`[EVENT SYNC GUARD] ❌ Impossibile riparare job ${job.id}:`, err?.message);
    }
  }

  return repairs;
}

/**
 * Esegue la sincronizzazione completa
 */
export async function runEventSyncGuard(): Promise<SyncReport> {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('[EVENT SYNC GUARD] 🚀 Starting synchronization...');
  console.log('========================================\n');
  
  try {
    // 1. Recupera tutti gli eventi da Google Calendar
    const googleEventIds = await getAllGoogleCalendarEvents();

    // FAIL-SAFE: se Google Calendar non è leggibile, NON confrontare con un set
    // vuoto (rimuoverebbe riferimenti validi). Salta l'intera riconciliazione.
    if (googleEventIds === null) {
      console.warn('[EVENT SYNC GUARD] ⏭️ Google Calendar non disponibile: sync SALTATA (nessuna riparazione eseguita)');
      return {
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        googleEventsCount: 0,
        firestoreRecordsCount: 0,
        repairs: { consultations: [], bookings: [], jobs: [] },
        orphanedGoogleEvents: [],
        skipped: true,
        skippedReason: 'CALENDAR_UNAVAILABLE',
      } as any;
    }
    
    // 2. Carica records da Firestore
    console.log('[EVENT SYNC GUARD] 📚 Loading Firestore records...');
    const [consultations, bookings] = await Promise.all([
      getConsultationsWithGoogleEvents(),
      getBookingsWithGoogleEvents(),
    ]);
    
    console.log(`[EVENT SYNC GUARD] ✅ Found ${consultations.length} consultations with Google events`);
    console.log(`[EVENT SYNC GUARD] ✅ Found ${bookings.length} bookings with Google events`);
    
    // 3. Crea un Set di tutti gli eventi "noti" in Firestore
    const knownEventIds = new Set<string>();
    consultations.forEach(c => {
      if (c.googleCalendarEventId) knownEventIds.add(c.googleCalendarEventId);
    });
    bookings.forEach(b => {
      if (b.googleCalendarEventId) knownEventIds.add(b.googleCalendarEventId);
    });
    
    console.log(`[EVENT SYNC GUARD] 📋 Total known events in Firestore: ${knownEventIds.size}`);
    
    // 4. Confronta e ripara
    console.log('\n[EVENT SYNC GUARD] 🔍 Analyzing inconsistencies...\n');
    
    const repairs: SyncReport['repairs'] = {
      consultations: [],
      bookings: [],
      jobs: [],
    };
    
    // Ripara consultations con eventi mancanti - PARALLELO per velocità
    const consultationsToRepair = consultations.filter(
      c => c.googleCalendarEventId && !googleEventIds.has(c.googleCalendarEventId)
    );
    if (consultationsToRepair.length > 0) {
      const consultationResults = await Promise.allSettled(
        consultationsToRepair.map(c => repairConsultation(c))
      );
      consultationResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          repairs.consultations.push(result.value);
        } else {
          console.error(`[EVENT SYNC GUARD] ⚠️ Failed to repair consultation ${consultationsToRepair[idx].id}:`, result.reason);
        }
      });
    }
    
    // Ripara bookings con eventi mancanti - PARALLELO per velocità
    const bookingsToRepair = bookings.filter(
      b => b.googleCalendarEventId && !googleEventIds.has(b.googleCalendarEventId)
    );
    if (bookingsToRepair.length > 0) {
      const bookingResults = await Promise.allSettled(
        bookingsToRepair.map(b => repairBooking(b))
      );
      bookingResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          repairs.bookings.push(result.value);
        } else {
          console.error(`[EVENT SYNC GUARD] ⚠️ Failed to repair booking ${bookingsToRepair[idx].id}:`, result.reason);
        }
      });
    }
    
    // 5. Ripara job con preventivo firmato ma status non aggiornato
    console.log('\n[EVENT SYNC GUARD] 🔍 Checking jobs with signed quotes...');
    try {
      const jobRepairs = await repairSignedQuoteJobs();
      repairs.jobs.push(...jobRepairs);
      if (jobRepairs.length === 0) {
        console.log('[EVENT SYNC GUARD] ✅ Nessun job da riparare (quote firmate OK)');
      }
    } catch (err: any) {
      console.error('[EVENT SYNC GUARD] ⚠️ Errore check job firmati (non critico):', err?.message);
    }

    // 6. Identifica eventi orfani in Google Calendar
    const orphanedEvents: string[] = [];
    for (const gcalEventId of googleEventIds) {
      if (!knownEventIds.has(gcalEventId)) {
        orphanedEvents.push(gcalEventId);
      }
    }
    
    if (orphanedEvents.length > 0) {
      console.log(`\n[EVENT SYNC GUARD] 👻 Found ${orphanedEvents.length} orphaned Google Calendar events`);
      console.log('[EVENT SYNC GUARD] ℹ️  These events exist in Google Calendar but have no Firestore reference');
      console.log('[EVENT SYNC GUARD] ℹ️  Consider manual cleanup if these are CRM-created events');
      orphanedEvents.slice(0, 10).forEach(id => {
        console.log(`   - Event ID: ${id}`);
      });
      if (orphanedEvents.length > 10) {
        console.log(`   ... and ${orphanedEvents.length - 10} more`);
      }
    }
    
    // 6. Report finale
    const duration = Date.now() - startTime;
    const report: SyncReport = {
      timestamp: nowRomeDate(),
      duration,
      googleCalendarEvents: googleEventIds.size,
      firestoreRecords: {
        consultations: consultations.length,
        bookings: bookings.length,
      },
      repairs,
      orphanedGoogleEvents: orphanedEvents,
    };
    
    console.log('\n========================================');
    console.log('[EVENT SYNC GUARD] 📊 SYNC REPORT');
    console.log('========================================');
    console.log(`Duration: ${duration}ms`);
    console.log(`Google Calendar events: ${googleEventIds.size}`);
    console.log(`Firestore records: ${consultations.length + bookings.length}`);
    console.log(`Repairs performed: ${repairs.consultations.length + repairs.bookings.length + repairs.jobs.length}`);
    
    if (repairs.consultations.length > 0) {
      console.log(`\n🔧 Consultations repaired: ${repairs.consultations.length}`);
      repairs.consultations.forEach(r => {
        console.log(`   - ${r.id}: ${r.action}`);
      });
    }
    
    if (repairs.bookings.length > 0) {
      console.log(`\n🔧 Bookings repaired: ${repairs.bookings.length}`);
      repairs.bookings.forEach(r => {
        console.log(`   - ${r.id}: ${r.action}`);
      });
    }
    
    if (repairs.jobs.length > 0) {
      console.log(`\n🔧 Jobs riparati (preventivo firmato non processato): ${repairs.jobs.length}`);
      repairs.jobs.forEach(r => {
        console.log(`   - ${r.id}: ${r.action}`);
      });
    }

    if (repairs.consultations.length === 0 && repairs.bookings.length === 0 && repairs.jobs.length === 0) {
      console.log('\n✅ No Firestore inconsistencies found!');
    }
    
    if (orphanedEvents.length > 0) {
      console.log(`\n⚠️  ${orphanedEvents.length} orphaned Google Calendar events detected`);
      console.log('   These require manual review/cleanup');
    } else {
      console.log('\n✅ No orphaned Google Calendar events');
    }
    
    console.log('========================================\n');
    
    return report;
    
  } catch (error: any) {
    // ✅ MAI throw da un worker! Assorbi l'errore e restituisci report vuoto
    console.error('[EVENT SYNC GUARD] ❌ Sync failed (absorbed):', error?.message || error);
    return {
      timestamp: nowRomeDate(),
      duration: Date.now() - startTime,
      googleCalendarEvents: 0,
      firestoreRecords: { consultations: 0, bookings: 0 },
      repairs: { consultations: [], bookings: [], jobs: [] },
      orphanedGoogleEvents: [],
    };
  }
}

// ========================================
// WORKER SCHEDULER
// ========================================

let syncInterval: NodeJS.Timeout | null = null;

/**
 * Avvia il worker schedulato
 * @param intervalMinutes Intervallo in minuti (default: 10)
 * 
 * IMPORTANTE: NON eseguire la sincronizzazione immediatamente all'avvio!
 * Questo può bloccare il deploy se le API esterne (Google Calendar) non rispondono.
 * La prima sincronizzazione viene ritardata di 60 secondi per permettere al server
 * di avviarsi correttamente e passare l'health check di Replit.
 */
export function startEventSyncWorker(intervalMinutes: number = 10): void {
  if (syncInterval) {
    console.log('[EVENT SYNC GUARD] ⚠️  Worker already running');
    return;
  }
  
  const intervalMs = intervalMinutes * 60 * 1000;
  const startupDelayMs = 60 * 1000; // 60 secondi di ritardo iniziale
  
  console.log(`[EVENT SYNC GUARD] ⏰ Starting worker (interval: ${intervalMinutes} minutes, first run in 60s)`);
  
  // RITARDA la prima sincronizzazione per non bloccare lo startup
  setTimeout(() => {
    console.log('[EVENT SYNC GUARD] 🔄 Running first sync after startup delay...');
    runEventSyncGuard().catch(err => {
      console.error('[EVENT SYNC GUARD] Worker error:', err);
    });
    
    // Poi schedulala periodicamente
    syncInterval = setInterval(() => {
      runEventSyncGuard().catch(err => {
        console.error('[EVENT SYNC GUARD] Worker error:', err);
      });
    }, intervalMs);
  }, startupDelayMs);
  
  console.log('[EVENT SYNC GUARD] ✅ Worker scheduled (non-blocking)');
}

/**
 * Ferma il worker schedulato
 */
export function stopEventSyncWorker(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[EVENT SYNC GUARD] 🛑 Worker stopped');
  }
}
