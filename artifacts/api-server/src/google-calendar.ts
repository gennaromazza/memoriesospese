/**
 * Google Calendar Integration - Server-side only
 * Gestisce eventi calendario per sistema booking
 * 
 * SERVICE ACCOUNT AUTH (Feb 2026):
 * - Usa Google Service Account con JWT (nessuna scadenza token)
 * - Non richiede più Replit Connector o OAuth refresh
 * - Il service account deve avere accesso al calendario target
 */

import { randomBytes } from "node:crypto";
import { google, type calendar_v3 } from "googleapis";
import { DateTime } from "luxon";
import {
  CONSULTATION_TIME_ZONE,
  createConsultationDateTime,
} from "./services/consultation-datetime.js";
import { safeErrorMessage } from "./utils/safe-logging.js";

let cachedAuthClient: any = null;

/**
 * Verifica stato connessione Google Calendar
 * Con Service Account, la connessione non scade mai
 */
export interface CalendarConnectionStatus {
  connected: boolean;
  email?: string;
  accountEmail?: string;
  calendarId?: string;
  expiresAt?: string;
  expiresInMinutes?: number;
  needsReconnection: boolean;
  error?: string;
  authMethod?: string;
}

export async function getCalendarConnectionStatus(): Promise<CalendarConnectionStatus> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
  let serviceEmail = '';
  try {
    if (!calendarId || calendarId === 'primary') {
      throw new Error("Calendario di destinazione non configurato: imposta GOOGLE_CALENDAR_ID con l’ID del calendario dello studio.");
    }
    const client = await getServiceAccountAuth();
    serviceEmail = client.email || '';
    const calendar = google.calendar({ version: 'v3', auth: client });
    // Una lettura reale verifica destinazione e permessi senza creare eventi
    // di prova né richiedere che il calendario sia già nella calendarList.
    const response = await withCalendarRetry(() => calendar.events.list({
      calendarId,
      maxResults: 1,
      fields: 'accessRole',
    }, { timeout: CALENDAR_REQUEST_TIMEOUT_MS }));
    if (!['writer', 'owner'].includes(response.data.accessRole || '')) {
      throw new Error("Il calendario è accessibile ma mancano i permessi per creare appuntamenti. Condividilo con il Service Account con il permesso “Apportare modifiche agli eventi”.");
    }
    
    return {
      connected: true,
      email: serviceEmail,
      accountEmail: serviceEmail,
      calendarId,
      needsReconnection: false,
      authMethod: 'service_account',
    };
  } catch (error: any) {
    return {
      connected: false,
      email: serviceEmail,
      accountEmail: serviceEmail,
      calendarId,
      needsReconnection: false,
      error: Number(error?.response?.status ?? error?.code) === 404
        ? "Calendario non trovato o non condiviso con il Service Account. Verifica GOOGLE_CALENDAR_ID e la condivisione del calendario."
        : Number(error?.response?.status ?? error?.code) === 403
          ? "Accesso al calendario negato. Verifica i permessi del Service Account e che Google Calendar API sia abilitata."
          : safeErrorMessage(error, "Impossibile verificare il calendario. Riprova tra poco."),
      authMethod: 'service_account',
    };
  }
}

/**
 * Invalida cache auth client (per forzare re-init se necessario)
 */
export function invalidateTokenCache(): void {
  cachedAuthClient = null;
  console.log("🔄 Google Calendar Service Account auth cache invalidated");
}

/**
 * Crea e restituisce un client JWT autenticato con Service Account
 * Il JWT viene rinnovato automaticamente dalla libreria googleapis
 */
/**
 * Fallback: usa le credenziali FIREBASE_ADMIN_CREDENTIALS (JSON puro o base64)
 * per Google Calendar. Introdotto quando la chiave dedicata GOOGLE_CALENDAR_*
 * è stata revocata da Google (invalid_grant: account not found) — il service
 * account Firebase funziona per Calendar purché il calendario sia condiviso
 * con la sua email (client_email).
 */
function parseFirebaseAdminCredentials(): { email: string; key: string } | null {
  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!raw) return null;
  try {
    let creds: any;
    try {
      creds = JSON.parse(raw);
    } catch {
      creds = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    }
    if (creds?.client_email && creds?.private_key) {
      return { email: creds.client_email, key: creds.private_key };
    }
  } catch {}
  return null;
}

function parseServiceAccountCredentials(): { email: string; key: string } {
  const rawEmail = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_CALENDAR_PRIVATE_KEY;

  if (!rawKey) {
    const fallback = parseFirebaseAdminCredentials();
    if (fallback) {
      console.log("📋 Service Account Calendar: uso credenziali FIREBASE_ADMIN_CREDENTIALS (fallback)");
      return fallback;
    }
    throw new Error(
      "GOOGLE_CALENDAR_CONFIG_MISSING: Manca GOOGLE_CALENDAR_PRIVATE_KEY nei secrets"
    );
  }

  const trimmedKey = rawKey.trim();

  try {
    const json = JSON.parse(trimmedKey);
    if (json.private_key && json.client_email) {
      console.log("📋 Service Account: credenziali estratte dal JSON completo");
      return { email: json.client_email, key: json.private_key };
    }
  } catch {}

  if (!rawEmail) {
    throw new Error(
      "GOOGLE_CALENDAR_CONFIG_MISSING: Manca GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL nei secrets"
    );
  }

  let email = rawEmail.trim();
  if (email.startsWith('"') && email.endsWith('"')) {
    email = email.slice(1, -1);
  }
  const emailMatch = email.match(/[\w.-]+@[\w.-]+\.iam\.gserviceaccount\.com/);
  if (emailMatch) {
    email = emailMatch[0];
  }

  let key = trimmedKey;
  if (key.includes('"private_key"')) {
    const cleanedLine = key.replace(/,\s*$/, '');
    try {
      const parsed = JSON.parse(`{${cleanedLine}}`);
      if (parsed.private_key) key = parsed.private_key;
    } catch {
      const beginIdx = key.indexOf('-----BEGIN PRIVATE KEY-----');
      const endMarker = '-----END PRIVATE KEY-----';
      const endIdx = key.lastIndexOf(endMarker);
      if (beginIdx !== -1 && endIdx !== -1) {
        key = key.substring(beginIdx, endIdx + endMarker.length);
      }
    }
  }

  key = key.replace(/\\n/g, '\n');

  if (!key.includes('-----BEGIN')) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----\n`;
  }

  return { email, key };
}

async function getServiceAccountAuth() {
  if (cachedAuthClient) {
    return cachedAuthClient;
  }

  // Prova prima le credenziali dedicate, poi il fallback Firebase.
  // Un errore di parsing/config delle dedicate NON deve impedire il fallback.
  const candidates: Array<{ label: string; email: string; key: string }> = [];
  try {
    const primary = parseServiceAccountCredentials();
    candidates.push({ label: "dedicated", ...primary });
  } catch (parseError: any) {
    console.error("⚠️ Credenziali GOOGLE_CALENDAR_* non utilizzabili:", parseError.message);
  }
  const fallback = parseFirebaseAdminCredentials();
  if (fallback && !candidates.some((c) => c.email === fallback.email)) {
    candidates.push({ label: "firebase-admin", ...fallback });
  }
  if (candidates.length === 0) {
    throw new Error("GOOGLE_CALENDAR_CONFIG_MISSING: nessuna credenziale service account disponibile");
  }

  let lastError: any = null;
  for (const cand of candidates) {
    const auth = new google.auth.JWT({
      email: cand.email,
      key: cand.key,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    try {
      await auth.authorize();
      console.log(`✅ Google Calendar Service Account autenticato (${cand.label})`);
      cachedAuthClient = auth;
      return auth;
    } catch (authError: any) {
      lastError = authError;
      console.error(
        `❌ Google Calendar auth failed (${cand.label}):`,
        safeErrorMessage(authError, "autenticazione non riuscita"),
      );
    }
  }

  cachedAuthClient = null;
  // Avvisa l'admin (throttled, fire-and-forget): nessuna credenziale funziona
  try {
    const { notifyCalendarUnavailable } = await import("./system-alerts.js");
    notifyCalendarUnavailable(
      `Autenticazione Google Calendar fallita per tutte le credenziali: ${lastError?.message || "sconosciuto"}`,
    );
  } catch {}
  throw lastError || new Error("GOOGLE_CALENDAR_AUTH_FAILED");
}

/**
 * Crea client Google Calendar con Service Account
 * Il client JWT rinnova automaticamente i token - no scadenza
 */
async function getGoogleCalendarClient() {
  const auth = await getServiceAccountAuth();
  return google.calendar({ version: "v3", auth });
}

/**
 * Risolve calendarId: se "primary" lo sostituisce con GOOGLE_CALENDAR_ID
 * Con Service Account, "primary" punta al calendario del SA (vuoto),
 * quindi va sempre risolto al calendario reale dell'utente
 */
export function resolveCalendarId(calendarId: string): string {
  if (calendarId === 'primary' || !calendarId) {
    return process.env.GOOGLE_CALENDAR_ID || 'primary';
  }
  return calendarId;
}

/**
 * Flag per evitare di ripetere l'inserimento del calendario nella lista del SA.
 * Quando un utente condivide un calendario con un Service Account, il SA deve
 * "inserirlo" nella propria calendarList prima di poterlo vedere con calendarList.list().
 */
let calendarEnsured = false;

/** Timeout per singola chiamata a Google Calendar (ms). */
const CALENDAR_REQUEST_TIMEOUT_MS = 15_000;
/** Attese tra i tentativi: 3 tentativi totali (300 ms, poi 900 ms). */
const CALENDAR_RETRY_DELAYS_MS = [300, 900];

const TRANSIENT_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ECONNREFUSED',
]);

/**
 * Errori che vale la pena ritentare: rate limit (429, ma Google usa anche 403 con
 * reason rateLimitExceeded), errori 5xx e problemi di rete/timeout.
 * 400/401/403 (permessi)/404 sono permanenti: ritentarli non serve.
 */
export function isTransientCalendarError(err: any): boolean {
  const status = Number(err?.response?.status ?? err?.status ?? err?.code);
  if (TRANSIENT_HTTP_STATUS.has(status)) return true;
  if (status === 403) {
    const reasons: unknown[] = [
      ...(Array.isArray(err?.errors) ? err.errors : []),
      ...(Array.isArray(err?.response?.data?.error?.errors) ? err.response.data.error.errors : []),
    ].map((e: any) => e?.reason);
    return reasons.some((r) => r === 'rateLimitExceeded' || r === 'userRateLimitExceeded');
  }
  return typeof err?.code === 'string' && TRANSIENT_NETWORK_CODES.has(err.code);
}

const calendarSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withCalendarRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const delay = CALENDAR_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isTransientCalendarError(err)) throw err;
      await calendarSleep(delay);
    }
  }
}

/**
 * Assicura che il calendario configurato sia nella calendarList del Service Account.
 * Necessario perché calendari condivisi non appaiono automaticamente nella lista SA.
 * Il flag viene alzato solo se il calendario risulta davvero presente: dopo un
 * errore si riprova alla chiamata successiva invece di fidarsi di un esito fallito.
 */
async function ensureCalendarInList(calendar: calendar_v3.Calendar) {
  if (calendarEnsured) return;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId || calendarId === 'primary') { calendarEnsured = true; return; }
  try {
    await withCalendarRetry(() => calendar.calendarList.get({ calendarId }, { timeout: CALENDAR_REQUEST_TIMEOUT_MS }));
    calendarEnsured = true;
  } catch (err: any) {
    if (err.code === 404) {
      try {
        await calendar.calendarList.insert({ requestBody: { id: calendarId } }, { timeout: CALENDAR_REQUEST_TIMEOUT_MS });
        console.log(`✅ Calendario ${calendarId} aggiunto alla lista del Service Account`);
        calendarEnsured = true;
      } catch (addErr: any) {
        console.error(`⚠️ Impossibile aggiungere calendario alla lista SA:`, addErr.message);
      }
    } else {
      console.error(`⚠️ Verifica calendario nella lista SA non riuscita:`, err.message);
    }
  }
}

/**
 * Ottiene lista calendari disponibili
 */
export async function listCalendars() {
  const calendar = await getGoogleCalendarClient();
  await ensureCalendarInList(calendar);
  const response = await withCalendarRetry(() => calendar.calendarList.list({}, { timeout: CALENDAR_REQUEST_TIMEOUT_MS }));
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
  const resolvedId = resolveCalendarId(calendarId);

  const response = await calendar.events.list({
    calendarId: resolvedId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return response.data.items || [];
}

/** 404 (mai esistito / non trovato) e 410 (gia' eliminato): l'evento non c'e' piu'. */
export function isCalendarEventGone(err: any): boolean {
  const status = Number(err?.response?.status ?? err?.status ?? err?.code);
  return status === 404 || status === 410;
}

/**
 * Ottiene singolo evento per ID
 * @returns Event object or null if not found (404) or already deleted (410)
 */
export async function getEventById(
  calendarId: string = "primary",
  eventId: string,
) {
  try {
    const calendar = await getGoogleCalendarClient();
    const resolvedId = resolveCalendarId(calendarId);

    const response = await withCalendarRetry(() => calendar.events.get({
      calendarId: resolvedId,
      eventId,
    }, { timeout: CALENDAR_REQUEST_TIMEOUT_MS }));

    return response.data;
  } catch (error: any) {
    // Google Calendar returns 404 if event doesn't exist, 410 if it was deleted
    if (isCalendarEventGone(error) || error.message?.includes("not found")) {
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
  const resolvedId = resolveCalendarId(calendarId);

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: resolvedId }],
    },
  });

  const calendarBusy = response.data.calendars?.[resolvedId];
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
/**
 * Pure classification of a raw Google Calendar event for busy/conflict
 * computation. Extracted so the filtering rules can be unit-tested in isolation
 * (the surrounding fetch loop needs the live Google API).
 *
 * Rules:
 *  - cancelled events are dropped;
 *  - `isAllDay` is computed BEFORE the transparency check (Google all-day events
 *    use `start.date` instead of `start.dateTime`);
 *  - transparent ("Libero") events are dropped ONLY when they are NOT all-day.
 *    Google all-day events default to transparency:'transparent', so a blanket
 *    transparency filter would silently discard full-day blocks — the photographer
 *    expects ANY all-day event to occupy the day.
 */
export function classifyCalendarEvent(event: {
  status?: string | null;
  transparency?: string | null;
  start?: { date?: string | null; dateTime?: string | null } | null;
}): { include: boolean; reason?: 'cancelled' | 'transparent'; isAllDay: boolean } {
  const status = event.status || '';
  const transparency = event.transparency || 'opaque';

  // FILTRO #1: eventi cancellati
  if (status === 'cancelled') {
    return { include: false, reason: 'cancelled', isAllDay: false };
  }

  // Determina se è un evento "tutto il giorno" PRIMA del filtro trasparenza.
  const isAllDay = !!event.start?.date;

  // FILTRO #2: eventi trasparenti ("Libero") SOLO se NON sono all-day.
  if (transparency === 'transparent' && !isAllDay) {
    return { include: false, reason: 'transparent', isAllDay };
  }

  return { include: true, isAllDay };
}

type CalendarEventDetail = {
  start: string;
  end: string;
  calendarId?: string;
  calendarName?: string;
  eventId?: string;
  summary?: string;
  status?: string;
  transparency?: string;
  isAllDay?: boolean;
  /** Tipo CRM impostato alla creazione (extendedProperties.private.crmKind), se presente. */
  crmKind?: string;
  created?: string;
};

/**
 * Legge gli eventi di TUTTI i calendari visibili al service account.
 *
 * FAIL-CLOSED (audit 19/11/2026): se un calendario non e' leggibile (dopo i retry sugli
 * errori transitori) o la lista calendari e' vuota, lancia. Restituire un elenco
 * parziale farebbe risultare liberi slot occupati e porterebbe a doppie prenotazioni.
 * `options.strict` e' mantenuto solo per compatibilita': il comportamento e' sempre strict.
 */
export async function getEventsWithDetailsAllCalendars(
  timeMin: Date,
  timeMax: Date,
  _options?: { strict?: boolean },
): Promise<CalendarEventDetail[]> {
  try {
    // Determina se siamo in produzione per ridurre logging
    const isProduction = process.env.NODE_ENV === 'production';

    const calendar = await getGoogleCalendarClient();

    // 1. Recupera lista di tutti i calendari (include ensureCalendarInList)
    if (!isProduction) {
      console.log("[Google Calendar V2] 📋 Recupero lista calendari con filtri avanzati...");
    }
    const calendars = await listCalendars();

    if (!calendars || calendars.length === 0) {
      throw new Error('Nessun calendario Google disponibile: impossibile verificare gli slot');
    }

    if (!isProduction) {
      console.log(`[Google Calendar V2] ✅ Trovati ${calendars.length} calendari`);
    }

    // 2. Recupera eventi dettagliati da OGNI calendario, in parallelo
    const counters = { fetched: 0, cancelled: 0, transparent: 0, valid: 0 };

    const readCalendar = async (cal: calendar_v3.Schema$CalendarListEntry): Promise<CalendarEventDetail[]> => {
      const found: CalendarEventDetail[] = [];
      let pageToken: string | undefined = undefined;
      let calendarEventCount = 0;

      // Pagina attraverso TUTTI gli eventi del calendario
      do {
        const token: string | undefined = pageToken;
        const response: any = await withCalendarRetry(() => calendar.events.list({
          calendarId: cal.id!,
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: true, // Espande eventi ricorrenti
          orderBy: 'startTime',
          maxResults: 250, // Max items per page
          pageToken: token,
        }, { timeout: CALENDAR_REQUEST_TIMEOUT_MS }));

        const events = response.data.items || [];
        calendarEventCount += events.length;
        counters.fetched += events.length;

        pageToken = response.data.nextPageToken ?? undefined;

        for (const event of events) {
          const eventId = event.id || '';
          const summary = event.summary || 'Senza titolo';
          const status = event.status || '';
          const transparency = event.transparency || 'opaque';

          // Classificazione pura (cancelled / transparent / all-day) — vedi
          // classifyCalendarEvent per le regole (unit-testata in isolamento).
          const classification = classifyCalendarEvent(event);
          const isAllDay = classification.isAllDay;

          if (!classification.include) {
            if (classification.reason === 'cancelled') {
              counters.cancelled++;
              if (!isProduction) {
                console.log(`[Google Calendar V2] 🚫 FILTRATO (cancelled): "${summary}" [${eventId}]`);
              }
            } else if (classification.reason === 'transparent') {
              counters.transparent++;
              if (!isProduction) {
                console.log(`[Google Calendar V2] 👻 FILTRATO (transparent): "${summary}" [${eventId}]`);
              }
            }
            continue;
          }

          // Estrai start/end time
          const start = event.start?.dateTime || event.start?.date;
          const end = event.end?.dateTime || event.end?.date;

          if (!start || !end) {
            console.warn(`[Google Calendar V2] ⚠️ Evento senza start/end: "${summary}" [${eventId}]`);
            continue;
          }

          counters.valid++;
          found.push({
            start,
            end,
            calendarId: cal.id ?? undefined,
            calendarName: cal.summary || cal.id || undefined,
            eventId,
            summary,
            status,
            transparency,
            isAllDay,
            crmKind: event.extendedProperties?.private?.crmKind ?? undefined,
            created: event.created ?? undefined,
          });
        }
      } while (pageToken); // Continua finché ci sono altre pagine

      if (!isProduction) {
        console.log(`[Google Calendar V2] 📅 Calendario "${cal.summary}": ${calendarEventCount} eventi trovati (paginati)`);
      }
      return found;
    };

    const results = await Promise.allSettled(calendars.map(readCalendar));

    const failures = results.flatMap((r, i) => r.status === 'rejected'
      ? [`"${calendars[i].summary || calendars[i].id}": ${r.reason?.message || r.reason}`]
      : []);
    if (failures.length > 0) {
      throw new Error(`Calendario Google non leggibile (${failures.join('; ')})`);
    }

    // Log riassuntivo solo in sviluppo
    if (!isProduction) {
      console.log(`[Google Calendar V2] 📊 SUMMARY:`);
      console.log(`  Total fetched: ${counters.fetched}`);
      console.log(`  Filtered (cancelled): ${counters.cancelled}`);
      console.log(`  Filtered (transparent): ${counters.transparent}`);
      console.log(`  Valid busy events: ${counters.valid}`);
    }

    return results.flatMap((r) => (r as PromiseFulfilledResult<CalendarEventDetail[]>).value);
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
/** RFC3339 with an explicit offset keeps the repeated autumn hour unambiguous. */
export function toGoogleTimedBoundary(date: Date) {
  const dt = DateTime.fromJSDate(date, { zone: "Europe/Rome" });
  if (!dt.isValid) throw new RangeError("Invalid Calendar date");
  return {
    dateTime: dt.toISO({ suppressMilliseconds: true })!,
    timeZone: "Europe/Rome",
  };
}

export type CalendarEventKind = 'booking' | 'consultation' | 'job' | 'manual';

export async function createEvent(
  calendarId: string = "primary",
  eventData: {
    summary: string;
    description?: string;
    start?: Date;
    end?: Date;
    location?: string;
    attendees?: string[];
    isAllDay?: boolean;
    startDateStr?: string;
    endDateStr?: string;
    colorId?: string;
    id?: string;
    /** Tipo CRM: salvato nelle proprieta' private dell'evento per riconoscere gli orfani. */
    kind?: CalendarEventKind;
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
    startField = toGoogleTimedBoundary(eventData.start);
    endField = toGoogleTimedBoundary(eventData.end);
  } else {
    throw new Error(
      "Invalid event data: must provide either isAllDay+startDateStr or start+end Dates",
    );
  }

  const requestBody: any = {
    summary: eventData.summary,
    description: eventData.description,
    location: eventData.location,
    start: startField,
    end: endField,
    attendees: eventData.attendees?.map((email) => ({ email })),
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 30 },
      ],
    },
  };
  if (eventData.colorId) {
    requestBody.colorId = eventData.colorId;
  }
  if (eventData.kind) requestBody.extendedProperties = { private: { crmKind: eventData.kind } };
  // Id sempre presente: i tentativi successivi a un timeout usano lo stesso id, quindi un
  // inserimento gia' riuscito non puo' diventare un secondo evento (409 = esiste gia').
  const explicitId = eventData.id;
  const eventId = explicitId ?? randomBytes(16).toString('hex');
  requestBody.id = eventId;

  const resolvedId = resolveCalendarId(calendarId);
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await calendar.events.insert({
        calendarId: resolvedId,
        requestBody,
      }, { timeout: CALENDAR_REQUEST_TIMEOUT_MS });
      return response.data;
    } catch (err: any) {
      const status = Number(err?.response?.status ?? err?.status ?? err?.code);
      if (status === 409 && attempt > 0 && !explicitId) {
        // Un tentativo precedente e' andato a buon fine (risposta persa): recupera quell'evento.
        const existing = await withCalendarRetry(() => calendar.events.get({
          calendarId: resolvedId,
          eventId,
        }, { timeout: CALENDAR_REQUEST_TIMEOUT_MS }));
        return existing.data;
      }
      const delay = CALENDAR_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isTransientCalendarError(err)) throw err;
      await calendarSleep(delay);
    }
  }
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
    colorId: string;
  }>,
) {
  const calendar = await getGoogleCalendarClient();
  const resolvedId = resolveCalendarId(calendarId);

  const requestBody: any = {};

  if (eventData.summary) requestBody.summary = eventData.summary;
  if (eventData.description !== undefined) requestBody.description = eventData.description;
  if (eventData.location !== undefined) requestBody.location = eventData.location;
  if (eventData.colorId) requestBody.colorId = eventData.colorId;
  
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
        requestBody.start = toGoogleTimedBoundary(eventData.start);
      }
      
      if (eventData.end) {
        requestBody.end = toGoogleTimedBoundary(eventData.end);
      }
    }
  }

  const response = await withCalendarRetry(() => calendar.events.patch({
    calendarId: resolvedId,
    eventId,
    requestBody,
  }, { timeout: CALENDAR_REQUEST_TIMEOUT_MS }));

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
  const resolvedId = resolveCalendarId(calendarId);

  try {
    await withCalendarRetry(() => calendar.events.delete({
      calendarId: resolvedId,
      eventId,
    }, { timeout: CALENDAR_REQUEST_TIMEOUT_MS }));
  } catch (error: any) {
    // Gia' eliminato (404/410): lo stato desiderato e' raggiunto, non e' un errore.
    // Senza questo i flussi di annullamento restavano in "cancellation_pending".
    if (!isCalendarEventGone(error)) throw error;
  }

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
  const dateTime = createConsultationDateTime(dateStr, time);
  if (!dateTime.isValid) {
    throw new Error(
      `Invalid local date/time "${dateStr} ${time}" in ${CONSULTATION_TIME_ZONE}: ${dateTime.invalidReason || "invalid value"}`,
    );
  }

  return dateTime.toJSDate();
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
  // CRITICAL: Use Luxon to extract date in Europe/Rome timezone (server runs in UTC)
  const romeDate = DateTime.fromJSDate(date, { zone: 'Europe/Rome' });
  const dateStr = romeDate.toFormat('yyyy-MM-dd');

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
