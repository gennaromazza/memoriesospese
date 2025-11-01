/**
 * Google Calendar Integration - Server-side only
 * Gestisce eventi calendario per sistema booking
 */

import { google } from 'googleapis';

let connectionSettings: any;

/**
 * Ottiene access token da Replit Connector
 * IMPORTANTE: Access token scade, quindi chiama sempre getGoogleCalendarClient()
 */
async function getAccessToken(): Promise<string> {
  // 1. Controlla cache
  if (
    connectionSettings &&
    connectionSettings.settings?.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    console.log('🔄 Using cached Google Calendar access token');
    return connectionSettings.settings.access_token;
  }

  // 2. Leggi credenziali da Replit Connector
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME || 'connectors.replit.com';
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  
  return accessToken;
}

/**
 * Crea client Google Calendar con token fresco
 * WARNING: Never cache this client. Always call this function to get fresh client.
 */
async function getGoogleCalendarClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Ottiene lista calendari disponibili
 */
export async function listCalendars() {
  const calendar = await getGoogleCalendarClient();
  const response = await calendar.calendarList.list();
  return response.data.items || [];
}

/**
 * Ottiene eventi da un calendario in un range di date
 */
export async function getEvents(
  calendarId: string = 'primary',
  timeMin: Date,
  timeMax: Date
) {
  const calendar = await getGoogleCalendarClient();
  
  const response = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}

/**
 * Verifica disponibilità (freebusy) per calcolare slot liberi
 */
export async function checkFreeBusy(
  calendarId: string = 'primary',
  timeMin: Date,
  timeMax: Date
) {
  const calendar = await getGoogleCalendarClient();
  
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    },
  });

  const calendarBusy = response.data.calendars?.[calendarId];
  return calendarBusy?.busy || [];
}

/**
 * Crea nuovo evento calendario
 */
export async function createEvent(
  calendarId: string = 'primary',
  eventData: {
    summary: string;
    description?: string;
    start: Date;
    end: Date;
    location?: string;
    attendees?: string[]; // Array di email
  }
) {
  const calendar = await getGoogleCalendarClient();
  
  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: eventData.summary,
      description: eventData.description,
      location: eventData.location,
      start: {
        dateTime: eventData.start.toISOString(),
        timeZone: 'Europe/Rome',
      },
      end: {
        dateTime: eventData.end.toISOString(),
        timeZone: 'Europe/Rome',
      },
      attendees: eventData.attendees?.map(email => ({ email })),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 giorno prima
          { method: 'popup', minutes: 30 }, // 30 min prima
        ],
      },
    },
  });

  return response.data;
}

/**
 * Aggiorna evento esistente
 */
export async function updateEvent(
  calendarId: string = 'primary',
  eventId: string,
  eventData: Partial<{
    summary: string;
    description: string;
    start: Date;
    end: Date;
    location: string;
  }>
) {
  const calendar = await getGoogleCalendarClient();
  
  const requestBody: any = {};
  
  if (eventData.summary) requestBody.summary = eventData.summary;
  if (eventData.description) requestBody.description = eventData.description;
  if (eventData.location) requestBody.location = eventData.location;
  if (eventData.start) {
    requestBody.start = {
      dateTime: eventData.start.toISOString(),
      timeZone: 'Europe/Rome',
    };
  }
  if (eventData.end) {
    requestBody.end = {
      dateTime: eventData.end.toISOString(),
      timeZone: 'Europe/Rome',
    };
  }

  const response = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody,
  });

  return response.data;
}

/**
 * Elimina evento calendario
 */
export async function deleteEvent(
  calendarId: string = 'primary',
  eventId: string
) {
  const calendar = await getGoogleCalendarClient();
  
  await calendar.events.delete({
    calendarId,
    eventId,
  });

  return true;
}

/**
 * Calcola slot disponibili considerando:
 * - Orari lavorativi (apertura, pausa pranzo, chiusura)
 * - Eventi esistenti su Google Calendar
 * - Durata shooting
 */
export interface WorkingHours {
  apertura: string; // "09:00"
  pausaInizio: string; // "13:00"
  pausaFine: string; // "14:30"
  chiusura: string; // "19:00"
}

export async function getAvailableSlots(
  calendarId: string = 'primary',
  date: Date,
  workingHours: WorkingHours,
  durataMinuti: number
): Promise<{ start: Date; end: Date }[]> {
  // Imposta inizio e fine giornata
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // Ottieni periodi occupati da Google Calendar
  const busyPeriods = await checkFreeBusy(calendarId, dayStart, dayEnd);

  // Converti orari lavorativi in Date
  const [aperturaH, aperturaM] = workingHours.apertura.split(':').map(Number);
  const [pausaInizioH, pausaInizioM] = workingHours.pausaInizio.split(':').map(Number);
  const [pausaFineH, pausaFineM] = workingHours.pausaFine.split(':').map(Number);
  const [chiusuraH, chiusuraM] = workingHours.chiusura.split(':').map(Number);

  const apertura = new Date(date);
  apertura.setHours(aperturaH, aperturaM, 0, 0);

  const pausaInizio = new Date(date);
  pausaInizio.setHours(pausaInizioH, pausaInizioM, 0, 0);

  const pausaFine = new Date(date);
  pausaFine.setHours(pausaFineH, pausaFineM, 0, 0);

  const chiusura = new Date(date);
  chiusura.setHours(chiusuraH, chiusuraM, 0, 0);

  // Periodi lavorativi (mattina + pomeriggio)
  const workingPeriods = [
    { start: apertura, end: pausaInizio },
    { start: pausaFine, end: chiusura },
  ];

  // Calcola slot disponibili
  const availableSlots: { start: Date; end: Date }[] = [];

  for (const period of workingPeriods) {
    let currentTime = new Date(period.start);

    while (currentTime.getTime() + durataMinuti * 60000 <= period.end.getTime()) {
      const slotEnd = new Date(currentTime.getTime() + durataMinuti * 60000);

      // Verifica se slot è libero (non si sovrappone con eventi)
      const isFree = !busyPeriods.some((busy: any) => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        
        // Controllo sovrapposizione
        return (
          (currentTime >= busyStart && currentTime < busyEnd) ||
          (slotEnd > busyStart && slotEnd <= busyEnd) ||
          (currentTime <= busyStart && slotEnd >= busyEnd)
        );
      });

      if (isFree) {
        availableSlots.push({
          start: new Date(currentTime),
          end: new Date(slotEnd),
        });
      }

      // Incrementa di 30 minuti (slot granularity)
      currentTime = new Date(currentTime.getTime() + 30 * 60000);
    }
  }

  return availableSlots;
}
