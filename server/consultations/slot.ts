import { DateTime } from "luxon";
import { toRomeDateTime } from "../utils/timezone.js";

/**
 * dataConsulenza may be a calendar day (public form) or an instant (stored
 * Timestamp). The day and wall-clock times always belong to Europe/Rome.
 * For the repeated autumn hour, preserve a saved instant when it matches the
 * requested time; otherwise consistently select the first occurrence.
 */
export function consultationSlot(date: Date | string, startTime: string, endTime: string, durationMinutes?: number) {
  const day = toRomeDateTime(date);
  if (!day.isValid) throw new RangeError("Data consulenza non valida");

  const atTime = (time: string): DateTime => {
    if (!/^\d{2}:\d{2}$/.test(time)) throw new RangeError("Orario consulenza non valido");
    const [hour, minute] = time.split(":").map(Number);
    const dt = day.startOf("day").set({ hour, minute, second: 0, millisecond: 0 });
    // Luxon normalizes a nonexistent spring time (02:30 → 03:30). Do not
    // silently save or email a different slot from the one the client chose.
    if (!dt.isValid || dt.toFormat("HH:mm") !== time) {
      throw new RangeError("Orario consulenza non valido nel fuso Europe/Rome");
    }
    if (day.toFormat("HH:mm") === time && day.second === 0 && day.millisecond === 0) return day;
    return dt.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis())[0];
  };

  const start = atTime(startTime);
  const parsedEnd = atTime(endTime);
  // On the autumn transition, an actual 30-minute slot can read 02:45–02:15.
  // Use elapsed duration where known; otherwise choose the first end occurrence
  // strictly after the selected start, never compare wall-clock strings.
  const durationEnd = durationMinutes && durationMinutes > 0 ? start.plus({ minutes: durationMinutes }) : null;
  const end = durationEnd?.toFormat("HH:mm") === endTime
    ? durationEnd
    : parsedEnd.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis()).find(candidate => candidate > start);
  if (!end) throw new RangeError("La fine consulenza deve essere successiva all'inizio");
  return { start: start.toJSDate(), end: end.toJSDate() };
}
