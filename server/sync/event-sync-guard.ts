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
import type { Consultation } from "@/shared/consultation-types";
import type { Booking } from "@/shared/booking-types";

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
 */
async function getAllGoogleCalendarEvents(): Promise<Set<string>> {
  console.log('[EVENT SYNC GUARD] 🔍 Fetching all events from Google Calendar...');
  
  try {
    const events = await getEventsWithDetailsAllCalendars();
    
    // Estrai solo gli ID degli eventi validi
    const eventIds = new Set<string>();
    
    events.forEach((event: any) => {
      if (event.id) {
        eventIds.add(event.id);
      }
    });
    
    console.log(`[EVENT SYNC GUARD] ✅ Found ${eventIds.size} valid events in Google Calendar`);
    return eventIds;
    
  } catch (error) {
    console.error('[EVENT SYNC GUARD] ❌ Error fetching Google Calendar events:', error);
    throw error;
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
 */
async function repairConsultation(consultation: Consultation): Promise<RepairAction> {
  console.log(`[EVENT SYNC GUARD] 🔧 Repairing Consultation ${consultation.id}...`);
  
  const updateData: any = {
    googleCalendarEventId: null,
  };
  
  // Se era confermata, torna in attesa
  if (consultation.stato === 'confermata') {
    updateData.stato = 'in_attesa';
    console.log(`[EVENT SYNC GUARD]    ↳ Status: confermata → in_attesa`);
  }
  
  await db.collection('consultations').doc(consultation.id).update(updateData);
  
  const action = `Removed missing GCAL event ${consultation.googleCalendarEventId}${
    updateData.stato ? `, reset status to ${updateData.stato}` : ''
  }`;
  
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
 */
async function repairBooking(booking: Booking): Promise<RepairAction> {
  console.log(`[EVENT SYNC GUARD] 🔧 Repairing Booking ${booking.id}...`);
  
  const updateData: any = {
    googleCalendarEventId: null,
  };
  
  // Se era confermato, torna a pending o richiesta
  if (booking.stato === 'confermata') {
    updateData.stato = 'pending';
    console.log(`[EVENT SYNC GUARD]    ↳ Status: confermata → pending`);
  }
  
  await db.collection('bookings').doc(booking.id).update(updateData);
  
  const action = `Removed missing GCAL event ${booking.googleCalendarEventId}${
    updateData.stato ? `, reset status to ${updateData.stato}` : ''
  }`;
  
  console.log(`[EVENT SYNC GUARD] ✅ Booking ${booking.id} repaired — ${action}`);
  
  return {
    id: booking.id,
    type: 'missing_gcal_event',
    action,
    googleCalendarEventId: booking.googleCalendarEventId,
  };
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
    
    // 2. Carica records da Firestore
    console.log('[EVENT SYNC GUARD] 📚 Loading Firestore records...');
    const [consultations, bookings] = await Promise.all([
      getConsultationsWithGoogleEvents(),
      getBookingsWithGoogleEvents(),
    ]);
    
    console.log(`[EVENT SYNC GUARD] ✅ Found ${consultations.length} consultations with Google events`);
    console.log(`[EVENT SYNC GUARD] ✅ Found ${bookings.length} bookings with Google events`);
    
    // 3. Confronta e ripara
    console.log('\n[EVENT SYNC GUARD] 🔍 Analyzing inconsistencies...\n');
    
    const repairs: SyncReport['repairs'] = {
      consultations: [],
      bookings: [],
    };
    
    // Ripara consultations con eventi mancanti
    for (const consultation of consultations) {
      if (consultation.googleCalendarEventId && !googleEventIds.has(consultation.googleCalendarEventId)) {
        const repair = await repairConsultation(consultation);
        repairs.consultations.push(repair);
      }
    }
    
    // Ripara bookings con eventi mancanti
    for (const booking of bookings) {
      if (booking.googleCalendarEventId && !googleEventIds.has(booking.googleCalendarEventId)) {
        const repair = await repairBooking(booking);
        repairs.bookings.push(repair);
      }
    }
    
    // 4. Report finale
    const duration = Date.now() - startTime;
    const report: SyncReport = {
      timestamp: new Date(),
      duration,
      googleCalendarEvents: googleEventIds.size,
      firestoreRecords: {
        consultations: consultations.length,
        bookings: bookings.length,
      },
      repairs,
      orphanedGoogleEvents: [], // TODO: implementare cleanup eventi orfani se necessario
    };
    
    console.log('\n========================================');
    console.log('[EVENT SYNC GUARD] 📊 SYNC REPORT');
    console.log('========================================');
    console.log(`Duration: ${duration}ms`);
    console.log(`Google Calendar events: ${googleEventIds.size}`);
    console.log(`Firestore records: ${consultations.length + bookings.length}`);
    console.log(`Repairs performed: ${repairs.consultations.length + repairs.bookings.length}`);
    
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
    
    if (repairs.consultations.length === 0 && repairs.bookings.length === 0) {
      console.log('\n✅ No inconsistencies found — system is in sync!');
    }
    
    console.log('========================================\n');
    
    return report;
    
  } catch (error) {
    console.error('[EVENT SYNC GUARD] ❌ Sync failed:', error);
    throw error;
  }
}

// ========================================
// WORKER SCHEDULER
// ========================================

let syncInterval: NodeJS.Timeout | null = null;

/**
 * Avvia il worker schedulato
 * @param intervalMinutes Intervallo in minuti (default: 10)
 */
export function startEventSyncWorker(intervalMinutes: number = 10): void {
  if (syncInterval) {
    console.log('[EVENT SYNC GUARD] ⚠️  Worker already running');
    return;
  }
  
  const intervalMs = intervalMinutes * 60 * 1000;
  
  console.log(`[EVENT SYNC GUARD] ⏰ Starting worker (interval: ${intervalMinutes} minutes)`);
  
  // Esegui subito la prima sincronizzazione
  runEventSyncGuard().catch(err => {
    console.error('[EVENT SYNC GUARD] Worker error:', err);
  });
  
  // Poi schedulala periodicamente
  syncInterval = setInterval(() => {
    runEventSyncGuard().catch(err => {
      console.error('[EVENT SYNC GUARD] Worker error:', err);
    });
  }, intervalMs);
  
  console.log('[EVENT SYNC GUARD] ✅ Worker started successfully');
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
