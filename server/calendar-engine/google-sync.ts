// NEW CALENDAR ENGINE V2 — Google Calendar integration wrapper
// Wraps existing Google Calendar functions without modifying them

import { DateTime } from 'luxon';
import { CalendarEvent } from '@/shared/calendar-types';
import { 
  checkFreeBusyAllCalendars as originalCheckFreeBusy,
  getEvents as originalGetEvents,
  createEvent as originalCreateEvent,
  deleteEvent as originalDeleteEvent
} from '../google-calendar';

/**
 * Normalize a date/time value to JavaScript Date in Europe/Rome timezone
 * Handles: Date objects, ISO strings, Luxon DateTime, or any date-like input
 */
function normalizeToDate(input: any): Date {
  // If already a Date, convert to Rome timezone and back to ensure consistency
  if (input instanceof Date) {
    return DateTime.fromJSDate(input, { zone: 'Europe/Rome' }).toJSDate();
  }
  
  // If it's a string (ISO format), parse with Rome timezone
  if (typeof input === 'string') {
    return DateTime.fromISO(input, { zone: 'Europe/Rome' }).toJSDate();
  }
  
  // If it's a Luxon DateTime, convert to Rome timezone
  if (input && typeof input === 'object' && 'toJSDate' in input) {
    return input.setZone('Europe/Rome').toJSDate();
  }
  
  // Fallback: try to create a Date
  return new Date(input);
}

/**
 * Check all Google Calendar busy periods
 * Wrapper around existing checkFreeBusyAllCalendars function
 * 
 * CRITICAL: Normalizes all events to JavaScript Date objects in Europe/Rome timezone
 * This ensures .getTime() works correctly in conflict detection
 * 
 * @param timeMin Start of time range
 * @param timeMax End of time range
 * @returns Array of busy periods as CalendarEvents with normalized Date objects
 */
export async function checkGoogleCalendarBusyPeriods(
  timeMin: Date,
  timeMax: Date
): Promise<CalendarEvent[]> {
  try {
    // Call existing function - returns array directly, not {busyPeriods: [...]}
    const busyPeriods = await originalCheckFreeBusy(timeMin, timeMax);
    
    console.log(`[Calendar Engine V2] 📅 Received ${busyPeriods.length} busy periods from Google Calendar`);
    
    // Convert to CalendarEvent format with NORMALIZED Date objects
    return busyPeriods.map((period, idx) => {
      const startDate = normalizeToDate(period.start);
      const endDate = normalizeToDate(period.end);
      
      // Log first event for debugging
      if (idx === 0 && busyPeriods.length > 0) {
        console.log(`[Calendar Engine V2] 🔍 First busy period normalized:`, {
          original_start: period.start,
          original_end: period.end,
          normalized_start: startDate,
          normalized_end: endDate,
          start_type: typeof startDate,
          has_getTime: typeof startDate.getTime === 'function'
        });
      }
      
      return {
        start: startDate,
        end: endDate,
        allDay: false, // Busy periods are always time-specific, not all-day
        source: 'google-calendar'
      };
    });
  } catch (error: any) {
    console.error('[Calendar Engine V2] ⚠️ Error checking Google Calendar:', error.message);
    console.error('[Calendar Engine V2] Stack:', error.stack);
    return []; // Return empty array on error to not block slot generation
  }
}

/**
 * Get Google Calendar events for a specific calendar
 * Wrapper around existing getEvents function
 * 
 * @param calendarId Calendar ID or 'primary'
 * @param timeMin Start of time range
 * @param timeMax End of time range
 * @returns Array of calendar events
 */
export async function getGoogleCalendarEvents(
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<any[]> {
  try {
    return await originalGetEvents(calendarId, timeMin, timeMax);
  } catch (error: any) {
    console.error('[Calendar Engine V2] ⚠️ Error getting Google Calendar events:', error.message);
    return [];
  }
}

/**
 * Check if there are all-day events on a specific date
 * 
 * @param date Date to check (YYYY-MM-DD string)
 * @returns true if there's at least one all-day event
 */
export async function hasAllDayEvent(date: Date): Promise<boolean> {
  try {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    
    const events = await originalGetEvents('primary', dayStart, dayEnd);
    
    // Filter for all-day events
    const allDayEvents = events.filter(event => {
      const hasDateStart = event.start?.date && !event.start?.dateTime;
      const hasDateEnd = event.end?.date && !event.end?.dateTime;
      return hasDateStart || hasDateEnd;
    });
    
    return allDayEvents.length > 0;
  } catch (error: any) {
    console.error('[Calendar Engine V2] ⚠️ Error checking all-day events:', error.message);
    return false;
  }
}

/**
 * Create Google Calendar event
 * Wrapper around existing createEvent function
 */
export async function createGoogleCalendarEvent(
  calendarId: string,
  event: any
): Promise<any> {
  return originalCreateEvent(calendarId, event);
}

/**
 * Delete Google Calendar event
 * Wrapper around existing deleteEvent function
 */
export async function deleteGoogleCalendarEvent(
  calendarId: string,
  eventId: string
): Promise<void> {
  return originalDeleteEvent(calendarId, eventId);
}
