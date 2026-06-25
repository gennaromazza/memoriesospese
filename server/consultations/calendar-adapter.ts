// NEW CALENDAR ENGINE V2 — Consultation Template → AvailabilityConfig adapter
// Converts existing consultation template structure to unified Calendar Engine format
// Does NOT modify existing logic

import type { AvailabilityConfig } from "../../shared/calendar-types.js";
import type { ConsultationTemplate } from "../../shared/consultation-types.js";

/**
 * Convert consultation template to unified AvailabilityConfig
 * Maps customWorkingHours structure to standardized format
 * 
 * @param template Consultation template from Firestore
 * @returns Standardized AvailabilityConfig for Calendar Engine
 */
export function consultationTemplateToAvailabilityConfig(
  template: ConsultationTemplate
): AvailabilityConfig {
  // Convert customWorkingHours to workingHoursByWeekday format
  const workingHoursByWeekday: AvailabilityConfig['workingHoursByWeekday'] = {};
  
  if (template.customWorkingHours && template.customWorkingHours.length > 0) {
    for (const dayConfig of template.customWorkingHours) {
      if (!dayConfig.attivo) {
        // Inactive days have no working hours
        workingHoursByWeekday[dayConfig.giornoSettimana] = [];
        continue;
      }
      
      const ranges: Array<{ startTime: string; endTime: string }> = [];
      
      // If there's a break, split into morning and afternoon
      if (dayConfig.pausaInizio && dayConfig.pausaFine) {
        // Morning slot: apertura → pausaInizio
        ranges.push({
          startTime: dayConfig.apertura,
          endTime: dayConfig.pausaInizio
        });
        
        // Afternoon slot: pausaFine → chiusura
        ranges.push({
          startTime: dayConfig.pausaFine,
          endTime: dayConfig.chiusura
        });
      } else {
        // No break: apertura → chiusura
        ranges.push({
          startTime: dayConfig.apertura,
          endTime: dayConfig.chiusura
        });
      }
      
      workingHoursByWeekday[dayConfig.giornoSettimana] = ranges;
    }
  }
  
  // Determine excluded weekdays (days not in customWorkingHours or marked inactive)
  const excludedWeekdays: number[] = [];
  for (let day = 0; day <= 6; day++) {
    if (!workingHoursByWeekday[day] || workingHoursByWeekday[day].length === 0) {
      excludedWeekdays.push(day);
    }
  }
  
  // Convert excludedDays to excluded weekdays if template has legacy excludedDays
  const additionalExcludedDays = template.excludedDays || [];
  for (const day of additionalExcludedDays) {
    if (!excludedWeekdays.includes(day)) {
      excludedWeekdays.push(day);
    }
  }
  
  return {
    timezone: 'Europe/Rome',
    slotDurationMinutes: template.durataMinuti || 60,
    workingHoursByWeekday,
    excludedWeekdays,
    excludedDates: [], // Consultations don't have specific excluded dates
    bufferBeforeMinutes: 0, // No buffer for consultations
    bufferAfterMinutes: 0,
    // Auto-invito consulenza visione: lead postproduzione + blocco giorno dopo all-day
    minLeadWorkingDays: template.giorniPostproduzione && template.giorniPostproduzione > 0
      ? template.giorniPostproduzione
      : undefined,
    blockDayAfterAllDayEvent: template.bloccaGiornoDopoEventoGiornataIntera === true
  };
}

/**
 * Build a Set of "yyyy-MM-dd" (Europe/Rome) for every day that has at least one
 * all-day event in [rangeStart, rangeEnd]. Aggregates Google Calendar all-day
 * events and CRM all-day Jobs (consultations/bookings are never all-day).
 *
 * Used to compute the postproduction lead (which skips all-day days) and to
 * detect the day-after-all-day block.
 */
export async function getAllDayDatesInRange(
  rangeStart: Date,
  rangeEnd: Date,
  db: any
): Promise<Set<string>> {
  const { DateTime } = await import('luxon');
  const events = await getAllExistingEvents(rangeStart, rangeEnd, db, {
    includeConsultations: false,
    includeBookings: false,
    includeJobs: true
  });

  const allDayDates = new Set<string>();
  for (const event of events) {
    if (!event.allDay) continue;
    let cursor = DateTime.fromJSDate(event.start).setZone('Europe/Rome').startOf('day');
    const endExclusive = DateTime.fromJSDate(event.end).setZone('Europe/Rome');
    // Google all-day events end at next-day midnight (exclusive); CRM all-day jobs
    // end at endOf('day') (same day) → loop runs exactly once.
    let guard = 0;
    while (cursor < endExclusive && guard < 366) {
      allDayDates.add(cursor.toFormat('yyyy-MM-dd'));
      cursor = cursor.plus({ days: 1 });
      guard++;
    }
  }

  return allDayDates;
}

/**
 * Calcola, per un intervallo di date, quali giorni NON hanno alcuno slot consulenza
 * disponibile. Riusa la stessa logica del Calendar Engine V2 del singolo giorno
 * (POST /v2/available-slots) ma carica gli eventi Google + Firestore UNA sola volta
 * per l'intero intervallo (e per la finestra di lead post-produzione, se attiva),
 * invece di una chiamata per giorno.
 *
 * Un giorno è considerato NON disponibile se:
 *  - è nel passato (prima di oggi, Europe/Rome);
 *  - cade prima della prima data prenotabile (lead di post-produzione);
 *  - è il giorno successivo a un evento all-day (se il template lo blocca);
 *  - non produce alcuno slot: giorno chiuso, escluso, evento all-day (Google o Job
 *    CRM) che copre il giorno, oppure tutti gli slot già occupati (sold-out).
 *
 * @returns Array di stringhe "yyyy-MM-dd" (Europe/Rome) dei giorni NON disponibili.
 */
export async function getConsultationUnavailableDates(
  template: ConsultationTemplate,
  rangeStartStr: string, // "yyyy-MM-dd" (Europe/Rome) inclusivo
  rangeEndStr: string,   // "yyyy-MM-dd" (Europe/Rome) inclusivo
  db: any
): Promise<string[]> {
  const { DateTime } = await import('luxon');
  const { getAvailableSlotsForDate, computeEarliestBookableDate } = await import('../calendar-engine/index.js');

  const config = consultationTemplateToAvailabilityConfig(template);

  const rangeStart = DateTime.fromISO(rangeStartStr, { zone: 'Europe/Rome' }).startOf('day');
  const rangeEnd = DateTime.fromISO(rangeEndStr, { zone: 'Europe/Rome' }).endOf('day');
  const nowRome = DateTime.now().setZone('Europe/Rome');
  const todayStart = nowRome.startOf('day');

  const hasLead = !!(config.minLeadWorkingDays && config.minLeadWorkingDays > 0);

  // Finestra di fetch = unione di:
  //  - [rangeStart - 1 giorno, rangeEnd]  (il -1 serve alla regola "giorno dopo all-day")
  //  - [oggi, oggi + lead*2 + 21]         (solo se è configurato un lead post-produzione)
  let fetchStartDT = rangeStart.minus({ days: 1 });
  let fetchEndDT = rangeEnd;
  if (hasLead) {
    const leadEnd = nowRome.plus({ days: config.minLeadWorkingDays! * 2 + 21 }).endOf('day');
    if (todayStart < fetchStartDT) fetchStartDT = todayStart;
    if (leadEnd > fetchEndDT) fetchEndDT = leadEnd;
  }

  // UNA sola chiamata Google + Firestore per tutta la finestra
  const allEvents = await getAllExistingEvents(fetchStartDT.toJSDate(), fetchEndDT.toJSDate(), db);

  // Insieme dei giorni coperti da un evento all-day (Google all-day + Job CRM all-day),
  // usato sia per la regola "giorno dopo all-day" sia per il calcolo del lead.
  const allDayDates = new Set<string>();
  for (const ev of allEvents) {
    if (!ev.allDay) continue;
    let cursor = DateTime.fromJSDate(ev.start).setZone('Europe/Rome').startOf('day');
    const endExclusive = DateTime.fromJSDate(ev.end).setZone('Europe/Rome');
    let guard = 0;
    while (cursor < endExclusive && guard < 366) {
      allDayDates.add(cursor.toFormat('yyyy-MM-dd'));
      cursor = cursor.plus({ days: 1 });
      guard++;
    }
  }

  // Prima data prenotabile (lead post-produzione), se configurato
  const earliest = hasLead
    ? computeEarliestBookableDate(nowRome.toJSDate(), config.minLeadWorkingDays!, allDayDates)
    : null;

  const unavailable: string[] = [];
  let day = rangeStart.startOf('day');
  const lastDay = rangeEnd.startOf('day');
  let guard = 0;
  while (day <= lastDay && guard < 400) {
    guard++;
    const dayStr = day.toFormat('yyyy-MM-dd');

    // (a) Giorno passato
    if (day < todayStart) {
      unavailable.push(dayStr);
      day = day.plus({ days: 1 });
      continue;
    }

    // (b) Prima della prima data prenotabile (lead post-produzione)
    if (earliest && day < earliest) {
      unavailable.push(dayStr);
      day = day.plus({ days: 1 });
      continue;
    }

    // (c) Giorno successivo a un evento all-day (se il template lo blocca)
    if (config.blockDayAfterAllDayEvent) {
      const prevStr = day.minus({ days: 1 }).toFormat('yyyy-MM-dd');
      if (allDayDates.has(prevStr)) {
        unavailable.push(dayStr);
        day = day.plus({ days: 1 });
        continue;
      }
    }

    // (d) Generazione slot: copre giorno chiuso/escluso, eventi all-day che coprono il
    //     giorno (via rilevamento conflitti) e sold-out. Gli eventi non sovrapposti al
    //     giorno semplicemente non generano conflitti.
    const slots = await getAvailableSlotsForDate(day.toJSDate(), config, allEvents as any);
    if (slots.length === 0) {
      unavailable.push(dayStr);
    }

    day = day.plus({ days: 1 });
  }

  return unavailable;
}

/**
 * Validate that a consultation template has required fields for Calendar Engine
 * 
 * @param template Consultation template
 * @returns true if template is valid, false otherwise
 */
export function validateConsultationTemplate(template: ConsultationTemplate): boolean {
  if (!template.durataMinuti || template.durataMinuti <= 0) {
    console.error(`[Consultation Adapter] Template "${template.nome}" has invalid durataMinuti: ${template.durataMinuti}`);
    return false;
  }
  
  if (!template.customWorkingHours || template.customWorkingHours.length === 0) {
    console.error(`[Consultation Adapter] Template "${template.nome}" has no customWorkingHours configured`);
    return false;
  }
  
  return true;
}

/**
 * Load all existing events for a specific date
 * Centralizes event loading logic from consultations, bookings, jobs
 * 
 * CRITICAL FILTERING OPTIONS:
 * - Google Calendar events are ALWAYS included (100% source of truth)
 * - Firestore consultations can be excluded via includeConsultations: false
 * - This ensures /available-slots and /approve use identical blocking events
 * 
 * @param dayStart Start of day in Europe/Rome
 * @param dayEnd End of day in Europe/Rome
 * @param db Firestore database instance
 * @param options Filtering options for Firestore data sources
 * @returns Array of CalendarEvents
 */
export async function getAllExistingEvents(
  dayStart: Date,
  dayEnd: Date,
  db: any,
  options?: {
    includeConsultations?: boolean; // default: true (for backwards compatibility)
    includeJobs?: boolean;          // default: true
    includeBookings?: boolean;      // default: true
  }
): Promise<Array<{ start: Date; end: Date; allDay: boolean; title?: string; source?: string }>> {
  const { Timestamp } = await import('firebase-admin/firestore');
  const { createEuropeRomeDate } = await import('../google-calendar.js');
  
  // Apply default options (all true for backwards compatibility)
  const {
    includeConsultations = true,
    includeJobs = true,
    includeBookings = true
  } = options || {};
  
  const existingEvents: Array<{ start: Date; end: Date; allDay: boolean; title?: string; source?: string }> = [];
  
  // 1. Load Google Calendar busy periods
  // CRITICAL: checkGoogleCalendarBusyPeriods uses getEventsWithDetailsAllCalendars
  // This ensures ALL valid Google Calendar events (including orphaned events) are loaded
  // Google Calendar events are ALWAYS included (100% source of truth)
  const { checkGoogleCalendarBusyPeriods } = await import('../calendar-engine/google-sync');
  const googleBusy = await checkGoogleCalendarBusyPeriods(dayStart, dayEnd);
  existingEvents.push(...googleBusy);
  
  console.log(`[Consultation Adapter] 📅 ${googleBusy.length} busy periods from Google Calendar (ALL valid events, orphans included)`);
  
  // 2. Load existing consultations (OPTIONAL - can be excluded via options)
  if (includeConsultations) {
    const consultationsSnap = await db
      .collection('consultations')
      .where('dataConsulenza', '>=', Timestamp.fromDate(dayStart))
      .where('dataConsulenza', '<=', Timestamp.fromDate(dayEnd))
      .where('stato', 'in', ['in_attesa', 'confermata'])
      .get();
    
    for (const doc of consultationsSnap.docs) {
      const data = doc.data();
      const consultationDate = data.dataConsulenza.toDate();
      // CRITICAL: Use Luxon for correct timezone extraction (server runs in UTC)
      const { DateTime } = await import('luxon');
      const romeDate = DateTime.fromJSDate(consultationDate, { zone: 'Europe/Rome' });
      const dateStr = romeDate.toFormat('yyyy-MM-dd');
      
      const start = createEuropeRomeDate(dateStr, data.orarioInizio);
      const end = createEuropeRomeDate(dateStr, data.orarioFine);
      
      existingEvents.push({
        start,
        end,
        allDay: false,
        title: `Consultation ${data.cliente?.nome || ''}`,
        source: 'consultation'
      });
    }
    
    console.log(`[Consultation Adapter] 📋 ${consultationsSnap.size} Firestore consultations (included)`);
  } else {
    console.log(`[Consultation Adapter] 🚫 Firestore consultations EXCLUDED from blocking events`);
  }
  
  // 3. Load bookings (only confirmed) (OPTIONAL - can be excluded via options)
  if (includeBookings) {
    const bookingsSnap = await db
      .collection('bookings')
      .where('stato', '==', 'confermata')
      .where('dataShootingInizio', '>=', Timestamp.fromDate(dayStart))
      .where('dataShootingInizio', '<=', Timestamp.fromDate(dayEnd))
      .get();

    for (const doc of bookingsSnap.docs) {
      const data = doc.data();
      const startDate = data.dataShootingInizio.toDate();
      const endDate = data.dataShootingFine?.toDate?.() || startDate;

      existingEvents.push({
        start: startDate,
        end: endDate,
        allDay: false,
        title: `Booking ${data.clienteNome || ''}`,
        source: 'booking'
      });
    }

    console.log(`[Consultation Adapter] 📸 ${bookingsSnap.size} confirmed bookings (included)`);
  } else {
    console.log(`[Consultation Adapter] 🚫 Bookings EXCLUDED from blocking events`);
  }
  
  // 4. Load jobs (only blocking statuses) (OPTIONAL - can be excluded via options)
  if (includeJobs) {
    const jobsSnap = await db
      .collection('jobs')
      .where('eventDate', '>=', Timestamp.fromDate(dayStart))
      .where('eventDate', '<=', Timestamp.fromDate(dayEnd))
      .get();
    
    const blockingStatuses = ['confermato', 'shooting_fatto', 'selezione_pending', 'produzione'];
    
    for (const doc of jobsSnap.docs) {
      const data = doc.data();
      
      // FIX: il campo corretto sul Job è `status` (non `stato`).
      // Prima si leggeva `data.stato` (undefined) → ogni job veniva saltato,
      // quindi i Job bloccanti (anche all-day) non bloccavano mai gli slot.
      if (!blockingStatuses.includes(data.status)) {
        continue;
      }
      
      const eventDate = data.eventDate.toDate();
      
      if (data.allDay) {
        // FIX: Usa Calendar Engine V2 per day boundaries DST-safe
        const { toRome, toUTC } = await import('../calendar-engine/timezone.js');
        const eventDT = toRome(eventDate);
        const start = toUTC(eventDT.startOf('day'));
        const end = toUTC(eventDT.endOf('day'));
        
        existingEvents.push({
          start,
          end,
          allDay: true,
          title: `Job ${data.nomeEvento || ''}`,
          source: 'job'
        });
      } else if (data.startTime && data.endTime) {
        // CRITICAL: Use Luxon for correct timezone extraction (server runs in UTC)
        const { DateTime } = await import('luxon');
        const romeDate = DateTime.fromJSDate(eventDate, { zone: 'Europe/Rome' });
        const dateStr = romeDate.toFormat('yyyy-MM-dd');
        
        const start = createEuropeRomeDate(dateStr, data.startTime);
        const end = createEuropeRomeDate(dateStr, data.endTime);
        
        existingEvents.push({
          start,
          end,
          allDay: false,
          title: `Job ${data.nomeEvento || ''}`,
          source: 'job'
        });
      }
    }
    
    console.log(`[Consultation Adapter] 💼 ${existingEvents.filter(e => e.source === 'job').length} blocking jobs (included)`);
  } else {
    console.log(`[Consultation Adapter] 🚫 Jobs EXCLUDED from blocking events`);
  }
  
  console.log(`[Consultation Adapter] 🎯 TOTAL: ${existingEvents.length} blocking events (Google: always, Firestore: ${includeConsultations ? 'consultations✓' : 'consultations✗'} ${includeBookings ? 'bookings✓' : 'bookings✗'} ${includeJobs ? 'jobs✓' : 'jobs✗'})`);
  
  return existingEvents;
}
