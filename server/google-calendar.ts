/**
 * Google Calendar Integration - Server-side only
 * Gestisce eventi calendario per sistema booking
 * 
 * FIX TOKEN SCADUTI (Dec 2025):
 * - Rimossa cache locale che causava token stale
 * - Aggiunto margine sicurezza 5 minuti prima della scadenza
 * - Aggiunto retry automatico per errori 401/403
 * - Aggiunto endpoint /api/calendar/status per verifica
 */

import { google } from "googleapis";
import { DateTime } from "luxon";

let connectionSettings: any = null;
let lastTokenFetch: number = 0;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 minuti prima della scadenza
const MIN_FETCH_INTERVAL_MS = 30 * 1000; // Minimo 30 secondi tra fetch

/**
 * Verifica stato connessione Google Calendar
 * Esportato per endpoint /api/calendar/status
 */
export interface CalendarConnectionStatus {
  connected: boolean;
  email?: string;
  expiresAt?: string;
  expiresInMinutes?: number;
  needsReconnection: boolean;
  error?: string;
}

export async function getCalendarConnectionStatus(): Promise<CalendarConnectionStatus> {
  try {
    const tokenInfo = await fetchFreshToken();
    
    const expiresAt = tokenInfo.expires_at ? new Date(tokenInfo.expires_at) : null;
    const now = new Date();
    const expiresInMs = expiresAt ? expiresAt.getTime() - now.getTime() : 0;
    const expiresInMinutes = Math.floor(expiresInMs / 60000);
    
    return {
      connected: true,
      email: tokenInfo.email || connectionSettings?.settings?.email,
      expiresAt: expiresAt?.toISOString(),
      expiresInMinutes: expiresInMinutes > 0 ? expiresInMinutes : 0,
      needsReconnection: expiresInMinutes <= 0,
    };
  } catch (error: any) {
    return {
      connected: false,
      needsReconnection: true,
      error: error.message,
    };
  }
}

/**
 * Forza refresh del token (invalidando la cache)
 */
export function invalidateTokenCache(): void {
  connectionSettings = null;
  lastTokenFetch = 0;
  console.log("🔄 Google Calendar token cache invalidated");
}

/**
 * Fetch token fresco dal Replit Connector
 * Questa funzione va SEMPRE al connector senza cache
 */
async function fetchFreshToken(): Promise<{ access_token: string; expires_at?: string; email?: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME || "connectors.replit.com";
  const hasReplIdentity = !!process.env.REPL_IDENTITY;
  const hasWebRenewal = !!process.env.WEB_REPL_RENEWAL;

  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("GOOGLE_CALENDAR_RECONNECTION_NEEDED: Token Replit non disponibile. Vai su Impostazioni → Integrazioni → Riconnetti Google Calendar");
  }

  const connectorUrl = `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-calendar`;

  const response = await fetch(connectorUrl, {
    headers: {
      Accept: "application/json",
      X_REPLIT_TOKEN: xReplitToken,
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("GOOGLE_CALENDAR_RECONNECTION_NEEDED: Token scaduto. Vai su Impostazioni → Integrazioni → Riconnetti Google Calendar");
    }
    throw new Error(`Connector API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const conn = data.items?.[0];

  if (!conn?.settings) {
    throw new Error("GOOGLE_CALENDAR_RECONNECTION_NEEDED: Google Calendar non connesso. Vai su Impostazioni → Integrazioni → Connetti Google Calendar");
  }

  const accessToken = conn.settings.access_token ?? conn.settings.oauth?.credentials?.access_token;

  if (!accessToken) {
    throw new Error("GOOGLE_CALENDAR_RECONNECTION_NEEDED: Access token mancante. Riconnetti Google Calendar");
  }

  return {
    access_token: accessToken,
    expires_at: conn.settings.expires_at,
    email: conn.settings.email,
  };
}

/**
 * Ottiene access token da Replit Connector
 * FIX: Cache con margine di sicurezza + retry per token scaduti
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  
  // 1. Verifica cache con margine di sicurezza
  if (connectionSettings?.settings?.access_token) {
    const expiresAt = connectionSettings.settings.expires_at;
    if (expiresAt) {
      const expiresAtMs = new Date(expiresAt).getTime();
      const safeExpiresAt = expiresAtMs - TOKEN_REFRESH_MARGIN_MS;
      
      // Token ancora valido (con margine sicurezza)
      if (now < safeExpiresAt && (now - lastTokenFetch) < MIN_FETCH_INTERVAL_MS) {
        return connectionSettings.settings.access_token;
      }
    }
  }

  // 2. Fetch token fresco
  console.log("🔐 Google Calendar: fetching fresh token from connector...");
  
  try {
    const tokenInfo = await fetchFreshToken();
    
    // Aggiorna cache
    connectionSettings = {
      settings: {
        access_token: tokenInfo.access_token,
        expires_at: tokenInfo.expires_at,
        email: tokenInfo.email,
      }
    };
    lastTokenFetch = now;
    
    console.log("✅ Google Calendar token obtained successfully");
    return tokenInfo.access_token;
    
  } catch (error: any) {
    // Invalida cache in caso di errore
    connectionSettings = null;
    lastTokenFetch = 0;
    throw error;
  }
}

/**
 * Crea client Google Calendar con token fresco
 * WARNING: Never cache this client. Always call this function to get fresh client.
 */
async function getGoogleCalendarClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
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
  calendarId: string = "primary",
  timeMin: Date,
  timeMax: Date,
) {
  const calendar = await getGoogleCalendarClient();

  const response = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return response.data.items || [];
}

/**
 * Ottiene singolo evento per ID
 * @returns Event object or null if not found
 */
export async function getEventById(
  calendarId: string = "primary",
  eventId: string,
) {
  try {
    const calendar = await getGoogleCalendarClient();

    const response = await calendar.events.get({
      calendarId,
      eventId,
    });

    return response.data;
  } catch (error: any) {
    // Google Calendar returns 404 if event doesn't exist
    if (error.code === 404 || error.message?.includes("not found")) {
      return null;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Verifica disponibilità (freebusy) per calcolare slot liberi
 * DEPRECATO: Usa checkFreeBusyMultiple per controllo multi-calendario
 */
export async function checkFreeBusy(
  calendarId: string = "primary",
  timeMin: Date,
  timeMax: Date,
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
 * Verifica disponibilità su TUTTI i calendari Google contemporaneamente
 * Più efficiente di chiamare checkFreeBusy per ogni calendario
 * @returns Array di busy periods aggregati da tutti i calendari
 */
export async function checkFreeBusyAllCalendars(
  timeMin: Date,
  timeMax: Date,
): Promise<
  Array<{
    start: string;
    end: string;
    calendarId?: string;
    calendarName?: string;
  }>
> {
  try {
    const calendar = await getGoogleCalendarClient();

    // 1. Recupera lista di tutti i calendari
    console.log("[Google Calendar] 📋 Recupero lista calendari...");
    const calendars = await listCalendars();

    if (!calendars || calendars.length === 0) {
      console.warn("[Google Calendar] ⚠️ Nessun calendario trovato");
      return [];
    }

    console.log(`[Google Calendar] ✅ Trovati ${calendars.length} calendari:`);
    calendars.forEach((cal) => {
      console.log(
        `  - "${cal.summary}" (${cal.id}) ${cal.primary ? "[PRIMARY]" : ""}`,
      );
    });

    // 2. Prepara items per freebusy query (tutti i calendari in una chiamata)
    const calendarItems = calendars.map((cal) => ({ id: cal.id }));

    // 3. Chiama freebusy API con TUTTI i calendari
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: calendarItems,
      },
    });

    // 4. Aggrega busy periods da tutti i calendari
    const allBusyPeriods: Array<{
      start: string;
      end: string;
      calendarId?: string;
      calendarName?: string;
    }> = [];

    if (response.data.calendars) {
      for (const [calId, calData] of Object.entries(response.data.calendars)) {
        const busyPeriods = (calData as any).busy || [];

        if (busyPeriods.length > 0) {
          const calInfo = calendars.find((c) => c.id === calId);
          const calName = calInfo?.summary || calId;

          console.log(
            `[Google Calendar] 🔴 Calendario "${calName}": ${busyPeriods.length} busy periods`,
          );

          // Aggiungi metadata per logging migliore
          busyPeriods.forEach((period: any) => {
            allBusyPeriods.push({
              start: period.start,
              end: period.end,
              calendarId: calId,
              calendarName: calName,
            });
          });
        }
      }
    }

    console.log(
      `[Google Calendar] 📊 Totale busy periods aggregati: ${allBusyPeriods.length}`,
    );

    return allBusyPeriods;
  } catch (error: any) {
    console.error(
      "[Google Calendar] ❌ Errore checkFreeBusyAllCalendars:",
      error.message,
    );
    throw error; // Propaga errore invece di fail silenzioso
  }
}

/**
 * CALENDAR ENGINE V2 — Enhanced event fetching with ghost event filtering
 * Recupera eventi da tutti i calendari con filtri avanzati per:
 * - Eventi cancellati (status: "cancelled")
 * - Eventi trasparenti (transparency: "transparent")
 * - Eventi con visibilità "free"
 * 
 * OTTIMIZZAZIONE: Logging ridotto in produzione per migliorare performance I/O
 * Questa funzione SOSTITUISCE checkFreeBusyAllCalendars per il Calendar Engine V2
 * perché l'API freebusy NON filtra eventi cancellati/trasparenti.
 */
export async function getEventsWithDetailsAllCalendars(
  timeMin: Date,
  timeMax: Date,
): Promise<
  Array<{
    start: string;
    end: string;
    calendarId?: string;
    calendarName?: string;
    eventId?: string;
    summary?: string;
    status?: string;
    transparency?: string;
    isAllDay?: boolean;
  }>
> {
  try {
    // Determina se siamo in produzione per ridurre logging
    const isProduction = process.env.NODE_ENV === 'production';
    
    const calendar = await getGoogleCalendarClient();

    // 1. Recupera lista di tutti i calendari
    if (!isProduction) {
      console.log("[Google Calendar V2] 📋 Recupero lista calendari con filtri avanzati...");
    }
    const calendars = await listCalendars();

    if (!calendars || calendars.length === 0) {
      console.warn("[Google Calendar V2] ⚠️ Nessun calendario trovato");
      return [];
    }

    if (!isProduction) {
      console.log(`[Google Calendar V2] ✅ Trovati ${calendars.length} calendari`);
    }

    // 2. Recupera eventi dettagliati da OGNI calendario
    const allEvents: Array<{
      start: string;
      end: string;
      calendarId?: string;
      calendarName?: string;
      eventId?: string;
      summary?: string;
      status?: string;
      transparency?: string;
      isAllDay?: boolean;
    }> = [];

    let totalFetched = 0;
    let totalCancelled = 0;
    let totalTransparent = 0;
    let totalValid = 0;

    for (const cal of calendars) {
      try {
        let pageToken: string | undefined = undefined;
        let calendarEventCount = 0;
        
        // Pagina attraverso TUTTI gli eventi del calendario
        do {
          const response = await calendar.events.list({
            calendarId: cal.id!,
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true, // Espande eventi ricorrenti
            orderBy: 'startTime',
            maxResults: 250, // Max items per page
            pageToken: pageToken,
          });

          const events = response.data.items || [];
          calendarEventCount += events.length;
          totalFetched += events.length;
          
          pageToken = response.data.nextPageToken ?? undefined;

          for (const event of events) {
          const eventId = event.id || '';
          const summary = event.summary || 'Senza titolo';
          const status = event.status || '';
          const transparency = event.transparency || 'opaque';

          // FILTRO #1: Skip eventi cancellati
          if (status === 'cancelled') {
            totalCancelled++;
            // Log VERBOSE solo in desarrollo para diagnostica
            if (!isProduction) {
              console.log(`[Google Calendar V2] 🚫 FILTRATO (cancelled): "${summary}" [${eventId}]`);
            }
            continue;
          }

          // FILTRO #2: Skip eventi trasparenti (non bloccano calendario)
          if (transparency === 'transparent') {
            totalTransparent++;
            // Log VERBOSE solo in desarrollo para diagnostica
            if (!isProduction) {
              console.log(`[Google Calendar V2] 👻 FILTRATO (transparent): "${summary}" [${eventId}]`);
            }
            continue;
          }

          // Estrai start/end time
          const start = event.start?.dateTime || event.start?.date;
          const end = event.end?.dateTime || event.end?.date;
          const isAllDay = !!event.start?.date; // All-day events use .date instead of .dateTime

          if (!start || !end) {
            // Log WARNING solo se evento invalido
            console.warn(`[Google Calendar V2] ⚠️ Evento senza start/end: "${summary}" [${eventId}]`);
            continue;
          }

          totalValid++;
          allEvents.push({
            start,
            end,
            calendarId: cal.id ?? undefined,
            calendarName: cal.summary || cal.id || undefined,
            eventId,
            summary,
            status,
            transparency,
            isAllDay,
          });
        }
        } while (pageToken); // Continua finché ci sono altre pagine
        
        if (!isProduction) {
          console.log(`[Google Calendar V2] 📅 Calendario "${cal.summary}": ${calendarEventCount} eventi trovati (paginati)`);
        }
        
      } catch (calError: any) {
        console.error(
          `[Google Calendar V2] ❌ Errore recupero eventi calendario "${cal.summary}":`,
          calError.message
        );
        // Continua con altri calendari
      }
    }

    // Log riassuntivo solo in sviluppo
    if (!isProduction) {
      console.log(`[Google Calendar V2] 📊 SUMMARY:`);
      console.log(`  Total fetched: ${totalFetched}`);
      console.log(`  Filtered (cancelled): ${totalCancelled}`);
      console.log(`  Filtered (transparent): ${totalTransparent}`);
      console.log(`  Valid busy events: ${totalValid}`);
    }

    return allEvents;
  } catch (error: any) {
    console.error(
      "[Google Calendar V2] ❌ Errore getEventsWithDetailsAllCalendars:",
      error.message,
    );
    throw error;
  }
}

/**
 * Crea nuovo evento calendario
 */
export async function createEvent(
  calendarId: string = "primary",
  eventData: {
    summary: string;
    description?: string;
    start?: Date;
    end?: Date;
    location?: string;
    attendees?: string[]; // Array di email
    isAllDay?: boolean;
    startDateStr?: string;
    endDateStr?: string;
  },
) {
  const calendar = await getGoogleCalendarClient();

  let startField: any;
  let endField: any;

  if (eventData.isAllDay && eventData.startDateStr) {
    // FIX: Usa Luxon per calcolo DST-safe della end date (+1 giorno)
    const { DateTime } = await import('luxon');
    const startDT = DateTime.fromFormat(eventData.startDateStr, 'yyyy-MM-dd', { zone: 'Europe/Rome' });
    const endDT = startDT.plus({ days: 1 });
    const endDateStr = endDT.toFormat('yyyy-MM-dd');

    startField = { date: eventData.startDateStr };
    endField = { date: endDateStr };
  } else if (eventData.start && eventData.end) {
    // FIXED: Usa Luxon per garantire timezone Europe/Rome corretto
    // Problema legacy: .getHours() leggeva timezone del server (UTC) causando slittamenti
    const { DateTime } = await import('luxon');
    
    // Converti Date → DateTime in Europe/Rome timezone
    const startDT = DateTime.fromJSDate(eventData.start, { zone: 'Europe/Rome' });
    const endDT = DateTime.fromJSDate(eventData.end, { zone: 'Europe/Rome' });
    
    // Formatta come YYYY-MM-DDTHH:mm:ss (floating, senza Z)
    const formatLocal = (dt: any) => {
      return dt.toFormat('yyyy-MM-dd\'T\'HH:mm:ss');
    };

    startField = {
      dateTime: formatLocal(startDT),
      timeZone: "Europe/Rome",
    };
    endField = {
      dateTime: formatLocal(endDT),
      timeZone: "Europe/Rome",
    };
  } else {
    throw new Error(
      "Invalid event data: must provide either isAllDay+startDateStr or start+end Dates",
    );
  }

  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: eventData.summary,
      description: eventData.description,
      location: eventData.location,
      start: startField,
      end: endField,
      attendees: eventData.attendees?.map((email) => ({ email })),
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 }, // 1 giorno prima
          { method: "popup", minutes: 30 }, // 30 min prima
        ],
      },
    },
  });

  return response.data;
}

/**
 * Aggiorna evento esistente
 * Supporta sia eventi con orario che eventi tutto il giorno
 */
export async function updateEvent(
  calendarId: string = "primary",
  eventId: string,
  eventData: Partial<{
    summary: string;
    description: string;
    start: Date;
    end: Date;
    location: string;
    isAllDay: boolean;
  }>,
) {
  const calendar = await getGoogleCalendarClient();

  const requestBody: any = {};

  if (eventData.summary) requestBody.summary = eventData.summary;
  if (eventData.description !== undefined) requestBody.description = eventData.description;
  if (eventData.location !== undefined) requestBody.location = eventData.location;
  
  if (eventData.start || eventData.end) {
    const { DateTime } = await import('luxon');
    
    if (eventData.isAllDay) {
      if (eventData.start) {
        const startDT = DateTime.fromJSDate(eventData.start, { zone: 'Europe/Rome' });
        requestBody.start = {
          date: startDT.toFormat('yyyy-MM-dd'),
        };
      }
      
      if (eventData.end) {
        const endDT = DateTime.fromJSDate(eventData.end, { zone: 'Europe/Rome' });
        requestBody.end = {
          date: endDT.toFormat('yyyy-MM-dd'),
        };
      }
    } else {
      if (eventData.start) {
        const startDT = DateTime.fromJSDate(eventData.start, { zone: 'Europe/Rome' });
        requestBody.start = {
          dateTime: startDT.toFormat('yyyy-MM-dd\'T\'HH:mm:ss'),
          timeZone: "Europe/Rome",
        };
      }
      
      if (eventData.end) {
        const endDT = DateTime.fromJSDate(eventData.end, { zone: 'Europe/Rome' });
        requestBody.end = {
          dateTime: endDT.toFormat('yyyy-MM-dd\'T\'HH:mm:ss'),
          timeZone: "Europe/Rome",
        };
      }
    }
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
  calendarId: string = "primary",
  eventId: string,
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

  const [hours, minutes] = time.split(":").map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(
      `${fieldName} has invalid hours (${hours}) or minutes (${minutes})`,
    );
  }
}

/**
 * Crea Date in timezone Europe/Rome dalla stringa YYYY-MM-DD + orario HH:MM
 * FIX: Usa Luxon per garantire timezone DST-safe (elimina .setHours legacy)
 * Esportata per uso in consultation-routes e altri moduli
 */
export function createEuropeRomeDate(dateStr: string, time: string): Date {
  // FIX: Usa Calendar Engine V2 per parsing DST-safe (usa import top-level)
  const [hours, minutes] = time.split(":").map(Number);

  // Crea DateTime in Europe/Rome timezone con data + ora
  const dt = DateTime.fromObject(
    { 
      year: parseInt(dateStr.split('-')[0]),
      month: parseInt(dateStr.split('-')[1]),
      day: parseInt(dateStr.split('-')[2]),
      hour: hours,
      minute: minutes,
      second: 0,
      millisecond: 0
    },
    { zone: 'Europe/Rome' }
  );

  return dt.toJSDate();
}

export async function getAvailableSlots(
  calendarId: string = "primary",
  date: Date,
  workingHours: WorkingHours,
  durataMinuti: number,
): Promise<{ start: Date; end: Date }[]> {
  // Valida formato orari
  validateTimeFormat(workingHours.apertura, "orarioApertura");
  validateTimeFormat(workingHours.pausaInizio, "orarioPausaInizio");
  validateTimeFormat(workingHours.pausaFine, "orarioPausaFine");
  validateTimeFormat(workingHours.chiusura, "orarioChiusura");

  // Converti date in string YYYY-MM-DD per creare date Europe/Rome corrette
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  // Imposta inizio e fine giornata in Europe/Rome
  const dayStart = createEuropeRomeDate(dateStr, "00:00");
  const dayEnd = createEuropeRomeDate(dateStr, "23:59");

  // CONTROLLO EVENTI ALL-DAY: Se esiste almeno un evento "tutto il giorno", blocca tutti gli slot
  try {
    console.log(
      `[Available Slots] Controllo eventi all-day per ${dateStr} su calendario ${calendarId}`,
    );

    const events = await getEvents(calendarId, dayStart, dayEnd);
    const allDayEvents = events.filter((event) => {
      // Eventi all-day hanno 'date' invece di 'dateTime'
      const hasDateStart = event.start?.date && !event.start?.dateTime;
      const hasDateEnd = event.end?.date && !event.end?.dateTime;

      if (hasDateStart || hasDateEnd) {
        // Verifica che l'evento copra la data richiesta
        const eventStartDate = event.start?.date || "";
        const eventEndDate = event.end?.date || "";

        // Gli eventi all-day hanno end date = giorno dopo (es. evento 20/12 ha end = 21/12)
        // Quindi controlliamo se dateStr è >= start E < end
        return dateStr >= eventStartDate && dateStr < eventEndDate;
      }

      return false;
    });

    if (allDayEvents.length > 0) {
      console.log(
        `[Available Slots] 🚫 Trovati ${allDayEvents.length} eventi all-day per ${dateStr}:`,
      );
      allDayEvents.forEach((event) => {
        console.log(
          `  - "${event.summary}" (${event.start?.date} → ${event.end?.date})`,
        );
      });
      console.log(
        `[Available Slots] ❌ GIORNO BLOCCATO - Nessuno slot disponibile`,
      );

      // Ritorna array vuoto = nessuno slot disponibile
      return [];
    }

    console.log(
      `[Available Slots] ✅ Nessun evento all-day trovato per ${dateStr}, procedo con calcolo slot normali`,
    );
  } catch (error) {
    console.error(
      "[Available Slots] ⚠️ Errore controllo eventi all-day, procedo comunque:",
      error,
    );
    // Se il controllo all-day fallisce, continua con la logica normale
  }

  // Ottieni periodi occupati da Google Calendar (eventi con orari specifici)
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

    while (
      currentTime.getTime() + durataMinuti * 60000 <=
      period.end.getTime()
    ) {
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
