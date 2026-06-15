// NEW CALENDAR ENGINE V2 — Main entry point
// Centralized calendar logic for Booking, Consultations, and Native Calendar

// Export all timezone utilities
export {
  toRome,
  toUTC,
  createRomeDate,
  parseTime,
  formatTime,
  formatDate,
  isAllDay,
  startOfDay,
  endOfDay,
  getWeekday
} from './timezone';

// Export conflict detection
export {
  hasOverlap,
  hasConflict,
  filterConflictingSlots
} from './conflicts';

// Export slot generation
export {
  getAvailableSlotsForDate,
  hasAvailableSlots,
  getUnavailabilityReason,
  computeEarliestBookableDate
} from './slots';

// Export Google Calendar wrappers
export {
  checkGoogleCalendarBusyPeriods,
  getGoogleCalendarEvents,
  hasAllDayEvent,
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent
} from './google-sync';
