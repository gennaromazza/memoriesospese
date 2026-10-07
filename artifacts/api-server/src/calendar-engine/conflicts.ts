// NEW CALENDAR ENGINE V2 — Centralized conflict detection
// Millisecond-precision overlap detection for all calendar events

/**
 * Check if two time ranges overlap
 * Uses millisecond precision for accuracy
 * 
 * @param startA Start of first range
 * @param endA End of first range
 * @param startB Start of second range
 * @param endB End of second range
 * @returns true if ranges overlap, false otherwise
 * 
 * Examples:
 * - A: 09:00-10:00, B: 10:00-11:00 → false (touching but not overlapping)
 * - A: 09:00-10:00, B: 09:30-10:30 → true (overlapping)
 * - A: 09:00-11:00, B: 09:30-10:00 → true (B inside A)
 * - A: 09:30-10:00, B: 09:00-11:00 → true (A inside B)
 */
export function hasOverlap(
  startA: Date | number,
  endA: Date | number,
  startB: Date | number,
  endB: Date | number
): boolean {
  const startAMs = typeof startA === 'number' ? startA : startA.getTime();
  const endAMs = typeof endA === 'number' ? endA : endA.getTime();
  const startBMs = typeof startB === 'number' ? startB : startB.getTime();
  const endBMs = typeof endB === 'number' ? endB : endB.getTime();
  
  // Ranges overlap if:
  // - A starts before B ends AND
  // - B starts before A ends
  return startAMs < endBMs && startBMs < endAMs;
}

/**
 * Check if a slot overlaps with any existing events
 * 
 * @param slotStart Slot start time
 * @param slotEnd Slot end time
 * @param events Array of existing events
 * @returns true if slot overlaps with any event, false otherwise
 */
export function hasConflict(
  slotStart: Date,
  slotEnd: Date,
  events: Array<{ start: Date; end: Date }>
): boolean {
  return events.some(event => 
    hasOverlap(slotStart, slotEnd, event.start, event.end)
  );
}

/**
 * Filter out slots that conflict with existing events
 * 
 * @param slots Array of candidate slots
 * @param events Array of existing events
 * @returns Array of slots that don't conflict
 */
export function filterConflictingSlots(
  slots: Array<{ start: Date; end: Date }>,
  events: Array<{ start: Date; end: Date }>
): Array<{ start: Date; end: Date }> {
  return slots.filter(slot => !hasConflict(slot.start, slot.end, events));
}
