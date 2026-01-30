/**
 * Booking Calendar Adapter
 * Converte le campaign di booking in AvailabilityConfig per Calendar Engine V2
 * Carica tutti gli eventi esistenti (Google Calendar + Firestore bookings) per conflict detection
 */

import { db } from '../firebase-admin.js';
import { DateTime } from 'luxon';
import type { AvailabilityConfig, CalendarEvent } from '../../shared/calendar-types.js';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Campaign data structure (partial - solo campi necessari per calendar)
 */
export interface BookingCampaign {
  id: string;
  nome: string;
  orarioApertura: string;
  orarioPausaInizio: string;
  orarioPausaFine: string;
  orarioChiusura: string;
  durataShootingMinuti: number;
  excludedDays?: number[];
  attiva: boolean;
}

/**
 * Valida che la campaign abbia tutti i campi necessari
 */
export function validateCampaign(campaign: any): campaign is BookingCampaign {
  if (!campaign) return false;
  
  const required = [
    'orarioApertura',
    'orarioPausaInizio',
    'orarioPausaFine',
    'orarioChiusura',
    'durataShootingMinuti'
  ];
  
  for (const field of required) {
    if (!campaign[field]) {
      console.error(`[validateCampaign] Campo mancante: ${field}`);
      return false;
    }
  }
  
  return true;
}

/**
 * Converte BookingCampaign in AvailabilityConfig per Calendar Engine V2
 * Segue lo stesso formato dell'adapter consultations
 * 
 * Gestisce sia campagne con pausa che senza pausa (single range)
 * @param isManualBooking - Se true, genera workingHours anche per i giorni esclusi
 */
export function campaignToAvailabilityConfig(campaign: BookingCampaign, isManualBooking: boolean = false): AvailabilityConfig {
  // Costruisci workingHoursByWeekday per tutti i giorni
  const workingHoursByWeekday: AvailabilityConfig['workingHoursByWeekday'] = {};
  const excludedDays = campaign.excludedDays || [];
  
  // Helper: verifica se pausa è valida (non vuota e crea durata positiva)
  const hasValidBreak = () => {
    if (!campaign.orarioPausaInizio || !campaign.orarioPausaFine) {
      return false;
    }
    
    // Verifica che pausa non sia uguale ad apertura/chiusura (break disabilitato)
    if (campaign.orarioPausaInizio === campaign.orarioChiusura || 
        campaign.orarioPausaFine === campaign.orarioApertura) {
      return false;
    }
    
    // Verifica che pausa crei durate positive
    const morningDuration = timeToMinutes(campaign.orarioPausaInizio) - timeToMinutes(campaign.orarioApertura);
    const afternoonDuration = timeToMinutes(campaign.orarioChiusura) - timeToMinutes(campaign.orarioPausaFine);
    
    return morningDuration > 0 && afternoonDuration > 0;
  };
  
  // Per ogni giorno della settimana (0-6)
  for (let day = 0; day <= 6; day++) {
    // Se è una prenotazione manuale, generiamo gli orari per TUTTI i giorni
    // Se non lo è, rispettiamo excludedDays
    if (isManualBooking || !excludedDays.includes(day)) {
      // Giorno attivo (o forzato da manual booking): crea 1 o 2 range a seconda della pausa
      if (hasValidBreak()) {
        // Con pausa: 2 range (mattina e pomeriggio)
        workingHoursByWeekday[day] = [
          {
            startTime: campaign.orarioApertura,
            endTime: campaign.orarioPausaInizio
          },
          {
            startTime: campaign.orarioPausaFine,
            endTime: campaign.orarioChiusura
          }
        ];
      } else {
        // Senza pausa: 1 range (apertura → chiusura)
        workingHoursByWeekday[day] = [
          {
            startTime: campaign.orarioApertura,
            endTime: campaign.orarioChiusura
          }
        ];
      }
    } else {
      // Giorno escluso (e non manual booking): array vuoto
      workingHoursByWeekday[day] = [];
    }
  }
  
  const config: AvailabilityConfig = {
    timezone: 'Europe/Rome',
    slotDurationMinutes: campaign.durataShootingMinuti,
    workingHoursByWeekday,
    excludedWeekdays: isManualBooking ? [] : excludedDays,
    excludedDates: [], // Bookings don't have specific excluded dates
    bufferBeforeMinutes: 0, // No buffer for bookings
    bufferAfterMinutes: 0
  };
  
  console.log('[campaignToAvailabilityConfig] ✅ Config generato:', {
    campaignId: campaign.id,
    slotDuration: config.slotDurationMinutes,
    excludedWeekdays: config.excludedWeekdays,
    workingDaysCount: Object.keys(workingHoursByWeekday).filter(k => workingHoursByWeekday[Number(k)].length > 0).length
  });
  
  return config;
}

/**
 * Helper: Converte orario HH:mm in minuti
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Carica tutti gli eventi esistenti (Google Calendar + Firestore bookings)
 * per una data range specificata.
 * 
 * Questo è l'equivalente di getAllExistingEvents per le consultations,
 * ma adattato per i bookings.
 * 
 * GESTIONE ERRORI:
 * - Se Google Calendar fallisce, logga warning ma continua con eventi Firestore
 * - Non blocca mai completamente lo slot generation
 * 
 * @param excludeBookingId - ID booking da escludere (opzionale, per approval flow)
 */
export async function getAllExistingBookingEvents(
  dayStart: Date,
  dayEnd: Date,
  firestoreDb: FirebaseFirestore.Firestore,
  excludeBookingId?: string
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  
  console.log('[getAllExistingBookingEvents] 🔍 Caricamento eventi da Google Calendar + Firestore bookings');
  
  // 1. Carica eventi Google Calendar (con gestione errori graceful)
  try {
    const { checkGoogleCalendarBusyPeriods } = await import('../calendar-engine/google-sync.js');
    const busyPeriods = await checkGoogleCalendarBusyPeriods(dayStart, dayEnd);
    
    // Converti busy periods in CalendarEvent
    for (const period of busyPeriods) {
      events.push({
        start: period.start,
        end: period.end,
        source: 'google_calendar',
        id: `gcal-${period.start.getTime()}`,
        allDay: period.allDay || false
      });
    }
    
    console.log(`[getAllExistingBookingEvents] ✅ ${busyPeriods.length} eventi da Google Calendar`);
  } catch (error: any) {
    // NON bloccare se Google Calendar fallisce - continua con eventi Firestore
    console.warn('[getAllExistingBookingEvents] ⚠️ Google Calendar non disponibile, usando solo Firestore:', error.message);
  }
  
  // 2. Carica booking Firestore con stato in_attesa o confermata
  // OTTIMIZZAZIONE: 2 query separate per evitare composite index complessi
  try {
    // Estendi range di ricerca per catturare booking che iniziano il giorno prima
    // ma potrebbero occupare slot del giorno richiesto
    // FIX: Usa Luxon per calcolo DST-safe
    const { DateTime } = await import('luxon');
    const dayStartDT = DateTime.fromJSDate(dayStart, { zone: 'Europe/Rome' });
    const searchStart = dayStartDT.minus({ days: 1 }).toJSDate();
    
    // Query separata per in_attesa
    const inAttesaSnap = await firestoreDb
      .collection('bookings')
      .where('stato', '==', 'in_attesa')
      .where('dataShootingInizio', '>=', Timestamp.fromDate(searchStart))
      .where('dataShootingInizio', '<=', Timestamp.fromDate(dayEnd))
      .get();
    
    // Query separata per confermata
    const confermataSnap = await firestoreDb
      .collection('bookings')
      .where('stato', '==', 'confermata')
      .where('dataShootingInizio', '>=', Timestamp.fromDate(searchStart))
      .where('dataShootingInizio', '<=', Timestamp.fromDate(dayEnd))
      .get();
    
    // Combina risultati
    const allDocs = [...inAttesaSnap.docs, ...confermataSnap.docs];
    
    for (const doc of allDocs) {
      // Skip booking da escludere (per approval flow)
      if (excludeBookingId && doc.id === excludeBookingId) {
        console.log(`[getAllExistingBookingEvents] ⏭️ Escluso booking ${excludeBookingId} dal conflict check`);
        continue;
      }
      
      const data = doc.data();
      
      // Converti Firestore Timestamp in Date
      const startTime = data.dataShootingInizio?.toDate?.() || new Date(data.dataShootingInizio);
      const endTime = data.dataShootingFine?.toDate?.() || new Date(data.dataShootingFine);
      
      // Double-check overlap (booking potrebbe iniziare giorno prima ma finire dopo dayStart)
      if (startTime <= dayEnd && endTime >= dayStart) {
        events.push({
          start: startTime,
          end: endTime,
          source: 'firestore_booking',
          id: doc.id,
          allDay: false
        });
      }
    }
    
    console.log(`[getAllExistingBookingEvents] ✅ ${allDocs.length} booking Firestore caricati (${inAttesaSnap.size} in_attesa + ${confermataSnap.size} confermata)`);
  } catch (error: any) {
    console.error('[getAllExistingBookingEvents] ❌ Errore caricamento bookings Firestore:', error.message);
    // Rilanciamo questo errore perché Firestore è critico per bookings
    throw error;
  }
  
  console.log(`[getAllExistingBookingEvents] 🏁 Totale: ${events.length} eventi caricati`);
  return events;
}
