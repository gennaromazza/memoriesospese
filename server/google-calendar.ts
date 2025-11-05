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
  const hasReplIdentity = !!process.env.REPL_IDENTITY;
  const hasWebRenewal = !!process.env.WEB_REPL_RENEWAL;
  
  console.log(`🔐 Google Calendar Auth - Environment:`, {
    hostname,
    hasReplIdentity,
    hasWebRenewal,
    mode: hasReplIdentity ? 'DEVELOPMENT' : hasWebRenewal ? 'PRODUCTION' : 'UNKNOWN'
  });
  
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    console.error('❌ Google Calendar - No token available:', { hasReplIdentity, hasWebRenewal });
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  try {
    const connectorUrl = 'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar';
    console.log('📞 Fetching Google Calendar connection from:', connectorUrl);
    
    const response = await fetch(connectorUrl, {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    });
    
    if (!response.ok) {
      console.error('❌ Google Calendar connector fetch failed:', {
        status: response.status,
        statusText: response.statusText
      });
      throw new Error(`Connector API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    connectionSettings = data.items?.[0];
    
    console.log('📦 Google Calendar connection response:', {
      hasItems: !!data.items,
      itemsLength: data.items?.length || 0,
      hasSettings: !!connectionSettings?.settings,
      hasAccessToken: !!connectionSettings?.settings?.access_token
    });
  } catch (error) {
    console.error('❌ Google Calendar connector fetch error:', error);
    throw error;
  }

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    console.error('❌ Google Calendar not connected or missing access token:', {
      hasConnectionSettings: !!connectionSettings,
      hasAccessToken: !!accessToken
    });
    throw new Error('Google Calendar not connected');
  }
  
  console.log('✅ Google Calendar access token obtained successfully');
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

/**
 * Valida formato HH:MM per orari
 */
function validateTimeFormat(time: string, fieldName: string): void {
  const timeRegex = /^\d{2}:\d{2}$/;
  if (!timeRegex.test(time)) {
    throw new Error(`${fieldName} must be in HH:MM format (e.g., "09:00")`);
  }
  
  const [hours, minutes] = time.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`${fieldName} has invalid hours (${hours}) or minutes (${minutes})`);
  }
}

/**
 * Crea Date in timezone Europe/Rome dalla stringa YYYY-MM-DD + orario HH:MM
 * NOTA: Gestisce correttamente timezone per evitare shift UTC
 */
function createEuropeRomeDate(dateStr: string, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  
  // Parse date in formato YYYY-MM-DD
  const [year, month, day] = dateStr.split('-').map(Number);
  
  // Crea date string completo con timezone Europe/Rome
  // Format: 2025-11-01T09:00:00.000+01:00 (winter) o +02:00 (summer)
  const dateTimeStr = `${dateStr}T${time}:00.000`;
  
  // Usa toLocaleString per garantire interpretazione Europe/Rome
  const date = new Date(dateTimeStr);
  
  // Verifica che non ci sia shift UTC applicando offset manualmente
  date.setFullYear(year, month - 1, day);
  date.setHours(hours, minutes, 0, 0);
  
  return date;
}

export async function getAvailableSlots(
  calendarId: string = 'primary',
  date: Date,
  workingHours: WorkingHours,
  durataMinuti: number
): Promise<{ start: Date; end: Date }[]> {
  // Valida formato orari
  validateTimeFormat(workingHours.apertura, 'orarioApertura');
  validateTimeFormat(workingHours.pausaInizio, 'orarioPausaInizio');
  validateTimeFormat(workingHours.pausaFine, 'orarioPausaFine');
  validateTimeFormat(workingHours.chiusura, 'orarioChiusura');
  
  // Converti date in string YYYY-MM-DD per creare date Europe/Rome corrette
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  // Imposta inizio e fine giornata in Europe/Rome
  const dayStart = createEuropeRomeDate(dateStr, '00:00');
  const dayEnd = createEuropeRomeDate(dateStr, '23:59');

  // Ottieni periodi occupati da Google Calendar
  const busyPeriods = await checkFreeBusy(calendarId, dayStart, dayEnd);

  // Converti orari lavorativi in Date usando Europe/Rome timezone
  const apertura = createEuropeRomeDate(dateStr, workingHours.apertura);
  const pausaInizio = createEuropeRomeDate(dateStr, workingHours.pausaInizio);
  const pausaFine = createEuropeRomeDate(dateStr, workingHours.pausaFine);
  const chiusura = createEuropeRomeDate(dateStr, workingHours.chiusura);

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
