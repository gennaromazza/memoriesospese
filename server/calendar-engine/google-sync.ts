// NEW CALENDAR ENGINE V2 — Google Calendar integration wrapper
// Wraps existing Google Calendar functions without modifying them

import { DateTime } from "luxon";
import { CalendarEvent } from "@/shared/calendar-types";
import {
  checkFreeBusyAllCalendars as originalCheckFreeBusy,
  getEvents as originalGetEvents,
  createEvent as originalCreateEvent,
  deleteEvent as originalDeleteEvent,
} from "../google-calendar.js";

/**
 * Normalize any timestamp-like value to a proper JavaScript Date
 * Handles: ISO strings, Firestore Timestamps, Luxon DateTime, Date objects
 */
function normalizeToDate(value: any): Date {
  if (!value) {
    throw new Error("Cannot normalize null/undefined to Date");
  }

  // Already a Date
  if (value instanceof Date) {
    return value;
  }

  // ISO string
  if (typeof value === "string") {
    return new Date(value);
  }

  // Firestore Timestamp (has seconds/nanoseconds)
  if (typeof value === "object" && "seconds" in value) {
    return new Date(value.seconds * 1000);
  }

  // Luxon DateTime (has toJSDate method)
  if (typeof value === "object" && typeof value.toJSDate === "function") {
    return value.toJSDate();
  }

  // Try to construct Date from whatever we have
  return new Date(value);
}

/**
 * Normalize Google Calendar event to CalendarEvent format
 * Handles both all-day events (with date field) and timed events (with dateTime field)
 *
 * @param rawEvent Raw event from Google Calendar API
 * @returns Normalized CalendarEvent with proper Date objects
 */
function normalizeGoogleEvent(rawEvent: any): CalendarEvent {
  let start: Date;
  let end: Date;
  let allDay = false;

  // All-day event (has date field instead of dateTime)
  if (rawEvent.start?.date && !rawEvent.start?.dateTime) {
    allDay = true;
    // Parse date as YYYY-MM-DD in Europe/Rome timezone at midnight
    const startDate = DateTime.fromISO(rawEvent.start.date, {
      zone: "Europe/Rome",
    });
    start = startDate.startOf("day").toJSDate();

    // End date for all-day events is exclusive (e.g., event on 2025-01-20 has end: 2025-01-21)
    const endDate = rawEvent.end?.date
      ? DateTime.fromISO(rawEvent.end.date, { zone: "Europe/Rome" })
      : startDate.plus({ days: 1 });
    end = endDate.startOf("day").toJSDate();
  }
  // Timed event (has dateTime field)
  else if (rawEvent.start?.dateTime) {
    allDay = false;
    // Parse as ISO with timezone awareness
    start = DateTime.fromISO(rawEvent.start.dateTime)
      .setZone("Europe/Rome")
      .toJSDate();
    end = DateTime.fromISO(rawEvent.end.dateTime)
      .setZone("Europe/Rome")
      .toJSDate();
  }
  // Fallback: try to parse whatever we have
  else {
    console.warn(
      "[normalizeGoogleEvent] Unknown event format, falling back:",
      rawEvent,
    );
    start = normalizeToDate(rawEvent.start);
    end = normalizeToDate(rawEvent.end);
    allDay = false;
  }

  return {
    start,
    end,
    allDay,
    title: rawEvent.summary,
    source: "google-calendar",
  };
}

/**
 * Normalize a date/time value to JavaScript Date in Europe/Rome timezone
 * Handles: Date objects, ISO strings, Luxon DateTime, or any date-like input
 */
function normalizeToDateRome(input: any): Date {
  // If already a Date, convert to Rome timezone and back to ensure consistency
  if (input instanceof Date) {
    return DateTime.fromJSDate(input, { zone: "Europe/Rome" }).toJSDate();
  }

  // If it's a string (ISO format), parse with Rome timezone
  if (typeof input === "string") {
    return DateTime.fromISO(input, { zone: "Europe/Rome" }).toJSDate();
  }

  // If it's a Luxon DateTime, convert to Rome timezone
  if (input && typeof input === "object" && "toJSDate" in input) {
    return input.setZone("Europe/Rome").toJSDate();
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
  timeMax: Date,
): Promise<CalendarEvent[]> {
  try {
    // Call existing function - returns array directly, not {busyPeriods: [...]}
    const busyPeriods = await originalCheckFreeBusy(timeMin, timeMax);

    console.log(
      `[Calendar Engine V2] 📅 Received ${busyPeriods.length} busy periods from Google Calendar`,
    );

    // Convert to CalendarEvent format with NORMALIZED Date objects
    return busyPeriods.map((period, idx) => {
      const startDate = normalizeToDateRome(period.start);
      const endDate = normalizeToDateRome(period.end);

      // Log first event for debugging
      if (idx === 0 && busyPeriods.length > 0) {
        console.log(`[Calendar Engine V2] 🔍 First busy period normalized:`, {
          original_start: period.start,
          original_end: period.end,
          normalized_start: startDate,
          normalized_end: endDate,
          start_type: typeof startDate,
          has_getTime: typeof startDate.getTime === "function",
        });
      }

      return {
        start: startDate,
        end: endDate,
        allDay: false, // Busy periods are always time-specific, not all-day
        source: "google-calendar",
      };
    });
  } catch (error: any) {
    console.error(
      "[Calendar Engine V2] ⚠️ Error checking Google Calendar:",
      error.message,
    );
    console.error("[Calendar Engine V2] Stack:", error.stack);
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
  timeMax: Date,
): Promise<CalendarEvent[]> {
  try {
    const rawEvents = await originalGetEvents(calendarId, timeMin, timeMax);

    // Normalize EVERY Google Calendar event
    return rawEvents.map(normalizeGoogleEvent);
  } catch (error: any) {
    console.error(
      "[Calendar Engine V2] ⚠️ Error getting Google Calendar events:",
      error.message,
    );
    return [];
  }
}

/**
 * Check if there are any all-day events on the specified date
 * All-day events block the entire day from slot availability
 *
 * @param date Date to check (will be normalized to Europe/Rome day boundaries)
 * @returns true if any all-day event exists on this date
 */
export async function hasAllDayEvent(date: Date): Promise<boolean> {
  try {
    const dateRome = DateTime.fromJSDate(date).setZone("Europe/Rome");
    const dayStart = dateRome.startOf("day").toJSDate();
    const dayEnd = dateRome.endOf("day").toJSDate();

    console.log(
      `[Calendar Engine V2] 🔍 Checking for all-day events on ${dateRome.toFormat("yyyy-MM-dd")}`,
    );

    // Get all events for the day and normalize them
    const rawEvents = await originalGetEvents("primary", dayStart, dayEnd);
    const normalizedEvents = rawEvents.map(normalizeGoogleEvent);

    // Filter for all-day events
    const allDayEvents = normalizedEvents.filter(
      (event) => event.allDay === true,
    );

    if (allDayEvents.length > 0) {
      console.log(
        `[Calendar Engine V2] 🚫 Found ${allDayEvents.length} all-day event(s):`,
        allDayEvents.map((e) => e.title || "Untitled"),
      );
      return true;
    }

    console.log(`[Calendar Engine V2] ✅ No all-day events found`);
    return false;
  } catch (error: any) {
    console.error(
      "[Calendar Engine V2] ⚠️ Error checking all-day events:",
      error.message,
    );
    return false; // Don't block slots on error
  }
}

/**
 * Create Google Calendar event
 * Wrapper around existing createEvent function
 */
export async function createGoogleCalendarEvent(
  calendarId: string,
  event: any,
): Promise<any> {
  return originalCreateEvent(calendarId, event);
}

/**
 * Delete Google Calendar event
 * Wrapper around existing deleteEvent function
 */
export async function deleteGoogleCalendarEvent(
  calendarId: string,
  eventId: string,
): Promise<void> {
  return originalDeleteEvent(calendarId, eventId);
}
