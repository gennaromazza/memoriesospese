/**
 * Cache condivisa degli eventi dell'Agenda interna.
 *
 * Le creazioni/associazioni fatte da rotte diverse da calendar-routes devono
 * poter invalidare gli stessi risultati, altrimenti l'Agenda può restare
 * vuota fino alla scadenza del TTL.
 */

export const calendarEventCache = new Map<string, { data: unknown; timestamp: number }>();

export const CALENDAR_EVENT_CACHE_TTL = 2 * 60 * 1000;

export function clearCalendarEventCache(): void {
  calendarEventCache.clear();
}