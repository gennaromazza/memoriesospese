// NEW CALENDAR ENGINE V2 — Centralized timezone handling
// All date/time operations must go through these functions to ensure Europe/Rome consistency

import { DateTime } from 'luxon';
import { Timestamp } from 'firebase-admin/firestore';

const TIMEZONE = 'Europe/Rome';

/**
 * Convert any input to Luxon DateTime in Europe/Rome timezone
 * Handles: Date, Firestore Timestamp, ISO string, YYYY-MM-DD string
 */
export function toRome(input: Date | Timestamp | string | { _seconds: number; _nanoseconds: number }): DateTime {
  // Handle Firestore Timestamp (SDK format)
  if (input instanceof Timestamp) {
    return DateTime.fromMillis(input.toMillis(), { zone: TIMEZONE });
  }
  
  // Handle Firestore Timestamp (HTTP serialized format)
  if (typeof input === 'object' && '_seconds' in input) {
    const millis = input._seconds * 1000 + Math.floor(input._nanoseconds / 1000000);
    return DateTime.fromMillis(millis, { zone: TIMEZONE });
  }
  
  // Handle native Date
  if (input instanceof Date) {
    return DateTime.fromJSDate(input, { zone: TIMEZONE });
  }
  
  // Handle ISO string (e.g., "2025-11-27T10:00:00Z")
  if (typeof input === 'string' && input.includes('T')) {
    return DateTime.fromISO(input, { zone: TIMEZONE });
  }
  
  // Handle date-only string (e.g., "2025-11-27")
  if (typeof input === 'string') {
    return DateTime.fromFormat(input, 'yyyy-MM-dd', { zone: TIMEZONE });
  }
  
  throw new Error(`Unsupported input type for toRome: ${typeof input}`);
}

/**
 * Convert Luxon DateTime to UTC JavaScript Date
 * Used for API responses and Firestore storage
 */
export function toUTC(dt: DateTime): Date {
  return dt.toUTC().toJSDate();
}

/**
 * Create a DateTime in Europe/Rome from date components
 * @param year 
 * @param month 1-12 (not 0-11 like JS Date)
 * @param day 
 * @param hour 24-hour format (optional, default 0)
 * @param minute (optional, default 0)
 */
export function createRomeDate(
  year: number, 
  month: number, 
  day: number, 
  hour: number = 0, 
  minute: number = 0
): DateTime {
  return DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone: TIMEZONE }
  );
}

/**
 * Parse time string (HH:mm) and return { hour, minute }
 */
export function parseTime(timeStr: string): { hour: number; minute: number } {
  const [hourStr, minuteStr] = timeStr.split(':');
  return {
    hour: parseInt(hourStr, 10),
    minute: parseInt(minuteStr, 10)
  };
}

/**
 * Format DateTime to HH:mm string
 */
export function formatTime(dt: DateTime): string {
  return dt.toFormat('HH:mm');
}

/**
 * Format DateTime to YYYY-MM-DD string
 */
export function formatDate(dt: DateTime): string {
  return dt.toFormat('yyyy-MM-dd');
}

/**
 * Check if a DateTime is an all-day event (has no time component)
 */
export function isAllDay(dt: DateTime): boolean {
  return dt.hour === 0 && dt.minute === 0 && dt.second === 0 && dt.millisecond === 0;
}

/**
 * Get start of day in Europe/Rome timezone
 */
export function startOfDay(dt: DateTime): DateTime {
  return dt.startOf('day');
}

/**
 * Get end of day in Europe/Rome timezone
 */
export function endOfDay(dt: DateTime): DateTime {
  return dt.endOf('day');
}

/**
 * Get weekday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 * Luxon uses 1 = Monday, 7 = Sunday, so we convert
 */
export function getWeekday(dt: DateTime): number {
  const luxonWeekday = dt.weekday; // 1 = Mon, 7 = Sun
  return luxonWeekday === 7 ? 0 : luxonWeekday;
}
