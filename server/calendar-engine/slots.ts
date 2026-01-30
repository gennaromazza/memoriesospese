// NEW CALENDAR ENGINE V2 — Centralized slot generation
// Unified logic for generating available time slots across all modules

import { DateTime } from 'luxon';
import { AvailabilityConfig, TimeSlot, CalendarEvent } from '../../shared/calendar-types.js';
import { 
  toRome, 
  toUTC, 
  parseTime, 
  formatTime, 
  formatDate, 
  startOfDay, 
  endOfDay,
  getWeekday 
} from './timezone';
import { hasConflict } from './conflicts';

/**
 * Generate available slots for a specific date
 * 
 * @param date The date to generate slots for
 * @param config Availability configuration
 * @param existingEvents Array of existing events that may block slots
 * @returns Array of available time slots in UTC
 */
export async function getAvailableSlotsForDate(
  date: Date | string,
  config: AvailabilityConfig,
  existingEvents: CalendarEvent[]
): Promise<TimeSlot[]> {
  // Step 1: Convert input date to Europe/Rome timezone
  const romeDate = toRome(date);
  const dateStr = formatDate(romeDate);
  
  console.log(`[Calendar Engine V2] 🔍 Generating slots for ${dateStr}`);
  console.log(`[Calendar Engine V2] 📋 Config:`, {
    slotDuration: config.slotDurationMinutes,
    bufferBefore: config.bufferBeforeMinutes || 0,
    bufferAfter: config.bufferAfterMinutes || 0,
    excludedDates: config.excludedDates?.length || 0,
    existingEvents: existingEvents.length
  });
  
  // Step 2: Check if date is excluded
  if (config.excludedDates?.includes(dateStr)) {
    console.log(`[Calendar Engine V2] ❌ Date ${dateStr} is in excludedDates list`);
    return [];
  }
  
  // Step 3: Check if weekday is excluded
  const weekday = getWeekday(romeDate);
  if (config.excludedWeekdays?.includes(weekday)) {
    console.log(`[Calendar Engine V2] ❌ Weekday ${weekday} is excluded`);
    return [];
  }
  
  // Step 4: Get working hours for this weekday
  const workingHours = config.workingHoursByWeekday[weekday];
  if (!workingHours || workingHours.length === 0) {
    console.log(`[Calendar Engine V2] ❌ No working hours configured for weekday ${weekday}`);
    return [];
  }
  
  console.log(`[Calendar Engine V2] ✅ Found ${workingHours.length} working hour ranges for weekday ${weekday}`);
  
  // Step 5: Generate all possible slots
  const candidateSlots: Array<{ start: Date; end: Date; label: string }> = [];
  
  for (const range of workingHours) {
    const { hour: startHour, minute: startMinute } = parseTime(range.startTime);
    const { hour: endHour, minute: endMinute } = parseTime(range.endTime);
    
    let current = romeDate.set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
    const rangeEnd = romeDate.set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });
    
    console.log(`[Calendar Engine V2] 🕐 Generating slots from ${range.startTime} to ${range.endTime}`);
    
    while (current < rangeEnd) {
      const slotEnd = current.plus({ minutes: config.slotDurationMinutes });
      
      // Don't create slots that extend beyond working hours
      if (slotEnd > rangeEnd) {
        break;
      }
      
      const label = `${formatTime(current)} - ${formatTime(slotEnd)}`;
      
      candidateSlots.push({
        start: toUTC(current),
        end: toUTC(slotEnd),
        label
      });
      
      // Move to next slot
      current = current.plus({ minutes: config.slotDurationMinutes });
    }
  }
  
  console.log(`[Calendar Engine V2] 📊 Generated ${candidateSlots.length} candidate slots`);
  
  // Step 6: Apply buffers to existing events
  const bufferedEvents = existingEvents.map(event => {
    const bufferBefore = config.bufferBeforeMinutes || 0;
    const bufferAfter = config.bufferAfterMinutes || 0;
    
    const start = new Date(event.start.getTime() - bufferBefore * 60000);
    const end = new Date(event.end.getTime() + bufferAfter * 60000);
    
    return { start, end };
  });
  
  if (bufferedEvents.length > 0) {
    console.log(`[Calendar Engine V2] 🛡️ Applied buffers (before: ${config.bufferBeforeMinutes || 0}min, after: ${config.bufferAfterMinutes || 0}min) to ${bufferedEvents.length} events`);
  }
  
  // Step 7: Filter out conflicting slots
  const availableSlots: TimeSlot[] = candidateSlots
    .map(slot => ({
      ...slot,
      available: !hasConflict(slot.start, slot.end, bufferedEvents)
    }))
    .filter(slot => slot.available);
  
  console.log(`[Calendar Engine V2] ✅ ${availableSlots.length} available slots after filtering conflicts`);
  
  return availableSlots;
}

/**
 * Check if a specific date has any available slots
 */
export async function hasAvailableSlots(
  date: Date | string,
  config: AvailabilityConfig,
  existingEvents: CalendarEvent[]
): Promise<boolean> {
  const slots = await getAvailableSlotsForDate(date, config, existingEvents);
  return slots.length > 0;
}

/**
 * Get user-friendly unavailability reason
 */
export function getUnavailabilityReason(
  date: Date | string,
  config: AvailabilityConfig,
  hasAllDayEvent: boolean
): { reason: 'all-day-event' | 'day-closed' | 'excluded-date' | null; message: string | null } {
  const romeDate = toRome(date);
  const dateStr = formatDate(romeDate);
  const weekday = getWeekday(romeDate);
  
  // Check all-day event
  if (hasAllDayEvent) {
    return {
      reason: 'all-day-event',
      message: 'Lo studio è chiuso per un evento che dura tutta la giornata'
    };
  }
  
  // Check excluded date
  if (config.excludedDates?.includes(dateStr)) {
    return {
      reason: 'excluded-date',
      message: 'Lo studio è chiuso in questa data'
    };
  }
  
  // Check weekday closed
  const workingHours = config.workingHoursByWeekday[weekday];
  if (!workingHours || workingHours.length === 0 || config.excludedWeekdays?.includes(weekday)) {
    return {
      reason: 'day-closed',
      message: 'Lo studio è chiuso in questo giorno della settimana'
    };
  }
  
  return {
    reason: null,
    message: null
  };
}
