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
    bufferAfterMinutes: 0
  };
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
 * @param dayStart Start of day in Europe/Rome
 * @param dayEnd End of day in Europe/Rome
 * @param db Firestore database instance
 * @returns Array of CalendarEvents
 */
export async function getAllExistingEvents(
  dayStart: Date,
  dayEnd: Date,
  db: any
): Promise<Array<{ start: Date; end: Date; allDay: boolean; title?: string; source?: string }>> {
  const { Timestamp } = await import('firebase-admin/firestore');
  const { createEuropeRomeDate } = await import('../google-calendar.js');
  
  const existingEvents: Array<{ start: Date; end: Date; allDay: boolean; title?: string; source?: string }> = [];
  
  // 1. Load Google Calendar busy periods
  // CRITICAL: checkGoogleCalendarBusyPeriods uses getEventsWithDetailsAllCalendars
  // This ensures ALL valid Google Calendar events (including orphaned events) are loaded
  const { checkGoogleCalendarBusyPeriods } = await import('../calendar-engine/google-sync');
  const googleBusy = await checkGoogleCalendarBusyPeriods(dayStart, dayEnd);
  existingEvents.push(...googleBusy);
  
  console.log(`[Consultation Adapter] 📅 ${googleBusy.length} busy periods from Google Calendar (ALL valid events, orphans included)`);
  
  // 2. Load existing consultations
  const consultationsSnap = await db
    .collection('consultations')
    .where('dataConsulenza', '>=', Timestamp.fromDate(dayStart))
    .where('dataConsulenza', '<=', Timestamp.fromDate(dayEnd))
    .where('stato', 'in', ['in_attesa', 'confermata'])
    .get();
  
  for (const doc of consultationsSnap.docs) {
    const data = doc.data();
    const consultationDate = data.dataConsulenza.toDate();
    const year = consultationDate.getFullYear();
    const month = String(consultationDate.getMonth() + 1).padStart(2, '0');
    const day = String(consultationDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
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
  
  console.log(`[Consultation Adapter] 📋 ${consultationsSnap.size} existing consultations`);
  
  // 3. Load bookings (only confirmed)
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

  console.log(`[Consultation Adapter] 📸 ${bookingsSnap.size} confirmed bookings (blocking)`);
  
  // 4. Load jobs (only blocking statuses)
  const jobsSnap = await db
    .collection('jobs')
    .where('eventDate', '>=', Timestamp.fromDate(dayStart))
    .where('eventDate', '<=', Timestamp.fromDate(dayEnd))
    .get();
  
  const blockingStatuses = ['confermato', 'shooting_fatto', 'selezione_pending', 'produzione'];
  
  for (const doc of jobsSnap.docs) {
    const data = doc.data();
    
    if (!blockingStatuses.includes(data.stato)) {
      continue;
    }
    
    const eventDate = data.eventDate.toDate();
    
    if (data.allDay) {
      const start = new Date(eventDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(eventDate);
      end.setHours(23, 59, 59, 999);
      
      existingEvents.push({
        start,
        end,
        allDay: true,
        title: `Job ${data.nomeEvento || ''}`,
        source: 'job'
      });
    } else if (data.startTime && data.endTime) {
      const year = eventDate.getFullYear();
      const month = String(eventDate.getMonth() + 1).padStart(2, '0');
      const day = String(eventDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
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
  
  console.log(`[Consultation Adapter] 💼 ${existingEvents.filter(e => e.source === 'job').length} blocking jobs`);
  console.log(`[Consultation Adapter] 🎯 TOTAL: ${existingEvents.length} blocking events`);
  
  return existingEvents;
}
