// NEW CALENDAR ENGINE V2 — Google Calendar integration wrapper
// Wraps existing Google Calendar functions without modifying them

import { CalendarEvent } from '@/shared/calendar-types';
import { 
  checkFreeBusyAllCalendars as originalCheckFreeBusy,
  getEvents as originalGetEvents,
  createEvent as originalCreateEvent,
  deleteEvent as originalDeleteEvent
} from '../google-calendar';

/**
 * Check all Google Calendar busy periods
 * Wrapper around existing checkFreeBusyAllCalendars function
 * 
 * @param timeMin Start of time range
 * @param timeMax End of time range
 * @returns Array of busy periods as CalendarEvents
 */
export async function checkGoogleCalendarBusyPeriods(
  timeMin: Date,
  timeMax: Date
): Promise<CalendarEvent[]> {
  try {
    // Call existing function - returns array directly, not {busyPeriods: [...]}
    const busyPeriods = await originalCheckFreeBusy(timeMin, timeMax);
    
    // Convert to CalendarEvent format
    return busyPeriods.map(period => ({
      start: period.start,
      end: period.end,
      source: 'google-calendar'
    }));
  } catch (error: any) {
    console.error('[Calendar Engine V2] ⚠️ Error checking Google Calendar:', error.message);
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
