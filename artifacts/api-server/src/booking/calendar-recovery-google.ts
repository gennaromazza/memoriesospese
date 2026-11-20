import type { calendar_v3 } from 'googleapis';
import { getGoogleCalendarClient, getCalendarConnectionStatus, getEventById, createEvent, deleteEvent } from '../google-calendar.js';

export interface RecoveryCalendar {
  target(savedId?: string): Promise<string>;
  read(calendarId: string, eventId: string): Promise<calendar_v3.Schema$Event | null>;
  scan(calendarId: string, start: Date, end: Date): Promise<calendar_v3.Schema$Event[]>;
  create: typeof createEvent;
  remove: typeof deleteEvent;
}

/** No subscription insertion, test events, emails or other writes during inspection. */
export const recoveryCalendar: RecoveryCalendar = {
  async target(savedId) {
    let calendarId = savedId?.trim();
    if (!calendarId) {
      const status = await getCalendarConnectionStatus();
      if (!status.connected || !status.calendarId) throw new Error(status.error || 'Collega prima il calendario dello studio dalle Integrazioni.');
      calendarId = status.calendarId;
    }
    if (calendarId === 'primary') throw new Error('Serve un calendario di destinazione esplicito, non “primary”.');
    const api = await getGoogleCalendarClient();
    const check = await api.events.list({ calendarId, maxResults: 1, fields: 'accessRole' }, { timeout: 15000 });
    if (!['owner', 'writer'].includes(check.data.accessRole || '')) throw new Error('Mancano i permessi per creare appuntamenti sul calendario.');
    return calendarId;
  },
  read: getEventById,
  async scan(calendarId, start, end) {
    const api = await getGoogleCalendarClient();
    const events: calendar_v3.Schema$Event[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;
    do {
      const response = await api.events.list({
        calendarId, timeMin: start.toISOString(), timeMax: end.toISOString(),
        singleEvents: true, showDeleted: false, maxResults: 250, pageToken,
      }, { timeout: 15000 });
      events.push(...response.data.items || []);
      pageToken = response.data.nextPageToken || undefined;
      // An incomplete scan must never be mistaken for an empty calendar.
      if (pageToken && (seen.has(pageToken) || seen.size >= 100)) throw new Error('Scansione calendario incompleta. Nessun evento è stato creato.');
      if (pageToken) seen.add(pageToken);
    } while (pageToken);
    return events;
  },
  create: createEvent,
  remove: deleteEvent,
};
