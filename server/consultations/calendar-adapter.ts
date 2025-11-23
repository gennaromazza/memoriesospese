// NEW CALENDAR ENGINE V2 — Consultation Template → AvailabilityConfig adapter
// Converts existing consultation template structure to unified Calendar Engine format
// Does NOT modify existing logic

import { AvailabilityConfig } from '@/shared/calendar-types';
import { ConsultationTemplate, ConsultationWorkingHours } from '@/shared/consultation-types';

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
