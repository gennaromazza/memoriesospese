// NEW CALENDAR ENGINE V2 — Unified types for centralized calendar logic
// Created to eliminate inconsistencies between Booking, Consultations, and Native Calendar

/**
 * Standardized configuration for availability calculation
 * Used by all modules (Booking, Consultations, Calendar) via adapters
 */
export interface AvailabilityConfig {
  /** Always Europe/Rome for consistency */
  timezone: "Europe/Rome";
  
  /** Duration of each slot in minutes */
  slotDurationMinutes: number;
  
  /** 
   * Working hours by weekday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
   * Each day can have multiple time ranges (e.g., morning and afternoon)
   */
  workingHoursByWeekday: {
    [weekday: number]: Array<{ 
      startTime: string;  // Format: "HH:mm" (e.g., "09:00")
      endTime: string;    // Format: "HH:mm" (e.g., "18:00")
    }>;
  };
  
  /** Weekdays that are always excluded (0-6) */
  excludedWeekdays?: number[];
  
  /** Specific dates that are excluded (format: "YYYY-MM-DD") */
  excludedDates?: string[];
  
  /** Buffer time before each slot (minutes) */
  bufferBeforeMinutes?: number;
  
  /** Buffer time after each slot (minutes) */
  bufferAfterMinutes?: number;
}

/**
 * Represents a time slot with start/end times
 */
export interface TimeSlot {
  /** Start time in UTC (for API responses) */
  start: Date;
  
  /** End time in UTC (for API responses) */
  end: Date;
  
  /** Human-readable label in Europe/Rome timezone (e.g., "09:00 - 10:00") */
  label: string;
  
  /** Whether this slot is available (not blocked by existing events) */
  available: boolean;
}

/**
 * Represents an existing event that may block slots
 * All Date objects MUST be JavaScript Date instances (not strings or Luxon DateTime)
 */
export interface CalendarEvent {
  /** Event start time as JavaScript Date */
  start: Date;
  
  /** Event end time as JavaScript Date */
  end: Date;
  
  /** Whether this is an all-day event */
  allDay: boolean;
  
  /** Event title/summary (optional, for debugging) */
  title?: string;
  
  /** Source of the event (consultation, booking, job, google-calendar) */
  source?: string;
}

/**
 * Response from slot availability endpoint
 */
export interface SlotsResponse {
  /** Date being queried (YYYY-MM-DD) */
  date: string;
  
  /** Array of available slots */
  slots: TimeSlot[];
  
  /** Reason why no slots are available (if applicable) */
  unavailableReason?: 'all-day-event' | 'day-closed' | 'all-booked' | 'excluded-date';
  
  /** User-friendly message explaining unavailability */
  message?: string;
}
