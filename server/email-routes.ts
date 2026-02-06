/**
 * Email API Routes - Gestisce invio email tramite Replit Gmail Integration
 * Queste route girano sul server Replit che ha accesso a connectors-api.replit.com
 */

import { Router, Request, Response, NextFunction } from "express";
import { google } from "googleapis";
import { db } from './firebase-admin.js';
import { DateTime } from 'luxon';
import { FieldValue } from 'firebase-admin/firestore';
import { formatPhoneForWhatsApp } from '../shared/phone-utils.js';

const router = Router();

/**
 * Email Log Entry Interface
 */
interface EmailLogEntry {
  to: string | string[];
  subject: string;
  type: string;
  status: 'sent' | 'failed';
  sentAt: FirebaseFirestore.FieldValue;
  senderEmail?: string;
  relatedDocId?: string;
  relatedDocType?: string;
  clientName?: string;
  errorMessage?: string;
}

/**
 * Helper: Salva log email in Firestore
 */
async function logEmailSent(entry: Omit<EmailLogEntry, 'sentAt'>): Promise<string | null> {
  try {
    // Filtra campi undefined (Firestore non li accetta)
    const cleanEntry: Record<string, any> = {
      to: entry.to,
      subject: entry.subject,
      type: entry.type,
      status: entry.status,
      sentAt: FieldValue.serverTimestamp(),
    };
    if (entry.relatedDocId) cleanEntry.relatedDocId = entry.relatedDocId;
    if (entry.relatedDocType) cleanEntry.relatedDocType = entry.relatedDocType;
    if (entry.clientName) cleanEntry.clientName = entry.clientName;
    if (entry.errorMessage) cleanEntry.errorMessage = entry.errorMessage;
    
    const logRef = await db.collection('emailLogs').add(cleanEntry);
    console.log(`📝 Email log saved: ${logRef.id} - ${entry.type} to ${Array.isArray(entry.to) ? entry.to.join(', ') : entry.to}`);
    return logRef.id;
  } catch (error) {
    console.error('❌ Failed to save email log:', error);
    return null;
  }
}

// Firebase Project ID per Firestore REST API
const FIREBASE_PROJECT_ID = "wedding-gallery-397b6";

/**
 * Helper: Ottiene l'URL base del sito in modo dinamico
 * Priorità: SITE_URL env > x-forwarded-host > host header > fallback production URL
 */
export function getSiteBaseUrl(req?: Request): string {
  // 1. Usa variabile d'ambiente se impostata
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, ''); // Rimuove trailing slash
  }
  
  // 2. Se abbiamo la request, usa gli header
  if (req) {
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const host = req.get('x-forwarded-host') || req.get('host');
    if (host) {
      return `${protocol}://${host}`;
    }
  }
  
  // 3. Fallback: URL di produzione (dominio ufficiale)
  return 'https://imagestudiofotografico.replit.app';
}

/**
 * Email template: Collaborator Assignment Notification
 * Inviata al collaboratore quando gli viene assegnato un nuovo lavoro/task
 */
export function createCollaboratorAssignmentEmailHTML(
  collaboratorName: string,
  jobTitle: string,
  jobDescription: string,
  dueDate: string,
  jobLink: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">🔔 Nuovo Lavoro Assegnato!</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${collaboratorName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Ti è stato assegnato un nuovo lavoro: <strong style="color: #8b5a3c;">${jobTitle}</strong>.
        </p>

        <div style="background: #e7f3ff; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0;">
          <h3 style="color: #0056b3; margin-top: 0; margin-bottom: 10px;">Dettagli Lavoro</h3>
          <p style="margin: 8px 0;"><strong>Descrizione:</strong> ${jobDescription}</p>
          <p style="margin: 8px 0;"><strong>Scadenza:</strong> ${dueDate}</p>
        </div>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #e0e0e0;">
          <p style="margin: 0; font-size: 14px; color: #666;">
            Puoi visualizzare tutti i dettagli del lavoro e aggiornare il suo stato tramite il link qui sotto.
          </p>
        </div>

        <div style="text-align: center; margin: 25px 0;">
          <a href="${jobLink}" 
             style="background: #8b5a3c; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
            ▶️ Vai al Lavoro
          </a>
        </div>

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
          Grazie per il tuo contributo!
        </p>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template precompilati disponibili
 */
const TEMPLATES = {
  CONSULTATION_CONFIRMATION: 'consultation_confirmation',
  CONSULTATION_CANCELLATION: 'consultation_cancellation',
  RECEIPT: 'receipt',
  BOOKING_CONFIRMATION: 'booking_confirmation',
  COLLABORATOR_ASSIGNMENT: 'collaborator_assignment' // Aggiunto per notifica assegnazione collaboratore
};

/**
 * Accesso diretto a Firestore tramite REST API (no admin SDK)
 */
async function getFirestoreDocument(path: string): Promise<any> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  return data;
}

/**
 * Recupera dati contatto studio da Firestore
 * ESPORTATA per uso in booking-routes.ts
 */
export async function getStudioContactInfo(): Promise<{
  name: string;
  email: string;
  phone: string;
  address: string;
}> {
  try {
    const studioDoc = await getFirestoreDocument("settings/studio");

    if (studioDoc?.fields) {
      return {
        name: studioDoc.fields.name?.stringValue || "Image Studio Fotografico",
        email: studioDoc.fields.email?.stringValue || "image.studio.fotografico@gmail.com",
        phone: studioDoc.fields.phone?.stringValue || "+39 334 7103142",
        address: studioDoc.fields.address?.stringValue || ""
      };
    }
  } catch (error) {
    console.error("⚠️ Errore recupero dati studio:", error);
  }

  // Fallback ai valori di default
  return {
    name: "Image Studio Fotografico",
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };
}

/**
 * Genera link "Aggiungi al Calendario" per Google Calendar
 * ESPORTATA per uso in booking-routes.ts, consultation-routes.ts, calendar-routes.ts
 * 
 * @param params.title - Titolo evento (obbligatorio)
 * @param params.description - Descrizione evento (opzionale, max 200 chars)
 * @param params.location - Luogo evento (opzionale)
 * @param params.startDate - Data/ora inizio (Date, string ISO, o YYYY-MM-DD per all-day)
 * @param params.endDate - Data/ora fine (Date, string ISO, o YYYY-MM-DD per all-day)
 * @param params.isAllDay - Se true, usa formato YYYYMMDD senza orario (default: false)
 * @returns URL Google Calendar o stringa vuota se parsing fallisce
 */
export function generateGoogleCalendarLink(params: {
  title: string;
  description?: string;
  location?: string;
  startDate: Date | string;
  endDate: Date | string;
  isAllDay?: boolean;
}): string {
  try {
    const { title, description, location, startDate, endDate, isAllDay = false } = params;

    // Validazione title obbligatorio
    if (!title || title.trim() === '') {
      console.warn('⚠️ generateGoogleCalendarLink: title mancante');
      return '';
    }

    // Converti date in Date objects se necessario
    let start: Date;
    let end: Date;

    if (typeof startDate === 'string') {
      start = new Date(startDate);
    } else {
      start = startDate;
    }

    if (typeof endDate === 'string') {
      end = new Date(endDate);
    } else {
      end = endDate;
    }

    // Validazione date valide
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.warn('⚠️ generateGoogleCalendarLink: date non valide', { startDate, endDate });
      return '';
    }

    // Formatta date secondo formato Google Calendar
    let datesParam: string;

    if (isAllDay) {
      // All-day: YYYYMMDD/YYYYMMDD (end date exclusive)
      // CRITICAL: Use Luxon for correct Europe/Rome timezone extraction (server runs in UTC)
      const formatYYYYMMDD = (date: Date): string => {
        const romeDate = DateTime.fromJSDate(date, { zone: 'Europe/Rome' });
        return romeDate.toFormat('yyyyMMdd');
      };

      const startFormatted = formatYYYYMMDD(start);

      // Google Calendar richiede end date esclusivo (+1 giorno dall'ultimo giorno dell'evento)
      // Se start === end (stesso giorno), aggiungi +1 per renderlo esclusivo
      // Se end > start (già esclusivo), usa così com'è
      const startDay = start.toDateString();
      const endDay = end.toDateString();

      let endFormatted: string;
      if (startDay === endDay) {
        // Single-day event: end deve essere start+1 (esclusivo)
        // FIX: Usa Luxon per calcolo DST-safe (usa import top-level)
        const endDT = DateTime.fromJSDate(end, { zone: 'Europe/Rome' });
        const endPlusOne = endDT.plus({ days: 1 }).toJSDate();
        endFormatted = formatYYYYMMDD(endPlusOne);
      } else {
        // Multi-day event: end è già esclusivo, usa così com'è
        endFormatted = formatYYYYMMDD(end);
      }

      datesParam = `${startFormatted}/${endFormatted}`;
    } else {
      // Timed event: YYYYMMDDTHHmmssZ (UTC format)
      const formatUTC = (date: Date): string => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
      };

      datesParam = `${formatUTC(start)}/${formatUTC(end)}`;
    }

    // Costruisci URL Google Calendar
    const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';

    // URL-encode parametri
    const params_url = new URLSearchParams();
    params_url.append('text', title);
    params_url.append('dates', datesParam);

    // Aggiungi description (tronca a 200 chars, rimuovi HTML se presente)
    if (description && description.trim() !== '') {
      const cleanDescription = description
        .replace(/<[^>]*>/g, '') // Rimuovi tag HTML
        .trim()
        .substring(0, 200); // Max 200 chars

      if (cleanDescription) {
        params_url.append('details', cleanDescription);
      }
    }

    // Aggiungi location se presente
    if (location && location.trim() !== '') {
      params_url.append('location', location.trim());
    }

    // Aggiungi timezone per eventi con orario (migliora UX per utenti italiani)
    if (!isAllDay) {
      params_url.append('ctz', 'Europe/Rome');
    }

    const finalUrl = `${baseUrl}&${params_url.toString()}`;

    console.log(`📅 Generato Google Calendar link: ${title} (${isAllDay ? 'all-day' : 'timed'})`);
    return finalUrl;

  } catch (error) {
    console.error('❌ Errore generateGoogleCalendarLink:', error);
    return ''; // Graceful degradation: ritorna stringa vuota
  }
}

/**
 * Query Firestore tramite REST API
 */
async function queryFirestore(
  collectionPath: string,
  where?: any,
): Promise<any[]> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;

  const query: any = {
    structuredQuery: {
      from: [{ collectionId: collectionPath.split("/").pop() }],
      where: where,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });

  if (!response.ok) return [];
  const data = await response.json();
  return data;
}

// Cache per access token (evita troppe chiamate al connector)
let cachedSettings: {
  access_token: string;
  expires_at: number;
} | null = null;

/**
 * Ottiene access token dall'integrazione Replit Gmail
 * FUNZIONA SOLO su Replit (non su Cloud Functions deployate)
 */
async function getAccessToken(): Promise<string> {
  // 1. Controlla cache
  if (
    cachedSettings &&
    cachedSettings.expires_at &&
    cachedSettings.expires_at > Date.now()
  ) {
    console.log("🔄 Using cached Gmail access token");
    return cachedSettings.access_token;
  }

  // 2. Leggi credenziali da environment Replit
  const hostname =
    process.env.REPLIT_CONNECTORS_HOSTNAME || "connectors.replit.com";
  const hasReplIdentity = !!process.env.REPL_IDENTITY;
  const hasWebRenewal = !!process.env.WEB_REPL_RENEWAL;

  console.log(`🔐 Gmail Auth - Environment:`, {
    hostname,
    hasReplIdentity,
    hasWebRenewal,
    mode: hasReplIdentity ? 'DEVELOPMENT' : hasWebRenewal ? 'PRODUCTION' : 'UNKNOWN'
  });

  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    console.error('❌ Gmail - No token available:', { hasReplIdentity, hasWebRenewal });
    throw new Error("Missing REPL_IDENTITY or WEB_REPL_RENEWAL");
  }

  console.log(
    "📞 Fetching Gmail connection from Replit Connectors API",
  );

  // 3. Fetch connection settings da Replit Connectors API
  try {
    const connectorUrl = `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-mail`;
    console.log('📞 Fetching Gmail connection from:', connectorUrl);

    const response = await fetch(connectorUrl, {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    });

    if (!response.ok) {
      console.error('❌ Gmail connector fetch failed:', {
        status: response.status,
        statusText: response.statusText
      });
      throw new Error(`Gmail connector API returned ${response.status}: ${response.statusText}`);
    }

    const data: any = await response.json();
    const connection = data.items?.[0];

    console.log('📦 Gmail connection response:', {
      hasItems: !!data.items,
      itemsLength: data.items?.length || 0,
      hasSettings: !!connection?.settings,
      hasAccessToken: !!connection?.settings?.access_token
    });

    if (!connection || !connection.settings) {
      console.error('❌ Gmail not connected or missing settings');
      throw new Error("Gmail not connected in Replit Integration");
    }

    // 4. Estrai access token
    const accessToken =
      connection?.settings?.access_token ??
      connection?.settings?.oauth?.credentials?.access_token;

    if (!accessToken) {
      console.error('❌ Gmail access token not found in connection settings');
      throw new Error("Gmail access token not found");
    }

    // 5. Salva in cache
    const expiresAt = connection.settings?.expires_at
      ? new Date(connection.settings.expires_at).getTime()
      : Date.now() + 3600 * 1000; // Default: 1 ora

    cachedSettings = {
      access_token: accessToken,
      expires_at: expiresAt,
    };

    console.log("✅ Gmail access token obtained successfully");
    return accessToken;
  } catch (error) {
    console.error("❌ Error fetching Gmail credentials:", error);
    throw error;
  }
}

/**
 * Invia email tramite Gmail API CON LOGGING AUTOMATICO
 * ESPORTATA per uso diretto da altri moduli (booking-routes.ts)
 * 
 * Il tipo di email viene determinato automaticamente dal subject se non specificato.
 * Tutte le email inviate vengono salvate nella collezione emailLogs di Firestore.
 */
export async function sendGmailEmail(
  to: string | string[],
  subject: string,
  htmlContent: string,
  from: string = "Image Studio Fotografico <image.studio.fotografico@gmail.com>",
  logOptions?: {
    type?: string;
    relatedDocId?: string;
    relatedDocType?: string;
    clientName?: string;
    skipLog?: boolean;
  }
): Promise<void> {
  const toList = Array.isArray(to) ? to : [to];
  const recipients = toList.join(", ");
  
  // Determina automaticamente il tipo di email dal subject se non specificato
  const emailType = logOptions?.type || detectEmailType(subject);
  
  try {
    console.log(
      `📧 Sending email to ${toList.length} recipient(s): ${recipients}`,
    );

    // 1. Ottieni access token
    const accessToken = await getAccessToken();

    // 2. Crea client Gmail autenticato
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // 3. Crea messaggio RFC2822
    const message = [
      `From: ${from}`,
      `To: ${recipients}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      htmlContent,
    ].join("\n");

    // 4. Codifica in base64url
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // 5. Invia email
    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log(
      `✅ Email sent successfully via Gmail API to ${toList.length} recipient(s)`,
    );
    
    // 6. Log automatico (a meno che non sia esplicitamente disabilitato)
    if (!logOptions?.skipLog) {
      await logEmailSent({
        to,
        subject,
        type: emailType,
        status: 'sent',
        relatedDocId: logOptions?.relatedDocId,
        relatedDocType: logOptions?.relatedDocType,
        clientName: logOptions?.clientName,
      });
    }
  } catch (error: any) {
    console.error("❌ Gmail send error:", error);
    
    // Log anche le email fallite
    if (!logOptions?.skipLog) {
      await logEmailSent({
        to,
        subject,
        type: emailType,
        status: 'failed',
        errorMessage: error.message || 'Unknown error',
        relatedDocId: logOptions?.relatedDocId,
        relatedDocType: logOptions?.relatedDocType,
        clientName: logOptions?.clientName,
      });
    }
    
    throw error;
  }
}

/**
 * Rileva automaticamente il tipo di email dal subject
 */
function detectEmailType(subject: string): string {
  const subjectLower = subject.toLowerCase();
  
  if (subjectLower.includes('promemoria') && subjectLower.includes('shooting')) return 'booking_reminder';
  if (subjectLower.includes('promemoria') && subjectLower.includes('consulenza')) return 'consultation_reminder';
  if (subjectLower.includes('conferma') && subjectLower.includes('prenotazione')) return 'booking_confirmation';
  if (subjectLower.includes('conferma') && subjectLower.includes('consulenza')) return 'consultation_confirmation';
  if (subjectLower.includes('preventivo')) return 'quote';
  if (subjectLower.includes('ordine')) return 'order';
  if (subjectLower.includes('pagamento')) return 'payment';
  if (subjectLower.includes('galleria')) return 'gallery';
  if (subjectLower.includes('selezione')) return 'selection';
  if (subjectLower.includes('questionario')) return 'questionnaire';
  if (subjectLower.includes('collaboratore') || subjectLower.includes('collaboratori')) return 'collaborator';
  if (subjectLower.includes('annullat') || subjectLower.includes('cancellat')) return 'cancellation';
  if (subjectLower.includes('rifiutat')) return 'rejection';
  if (subjectLower.includes('ricevuta')) return 'receipt';
  if (subjectLower.includes('contratto')) return 'contract';
  
  return 'general';
}

/**
 * @deprecated Usa sendGmailEmail direttamente - ora include logging automatico
 * Wrapper legacy mantenuto per retrocompatibilità
 */
export async function sendGmailEmailWithLog(
  to: string | string[],
  subject: string,
  htmlContent: string,
  logInfo: {
    type: string;
    relatedDocId?: string;
    relatedDocType?: string;
    clientName?: string;
  },
  from: string = "Image Studio Fotografico <image.studio.fotografico@gmail.com>",
): Promise<void> {
  // Delega a sendGmailEmail che ora include logging automatico
  await sendGmailEmail(to, subject, htmlContent, from, {
    type: logInfo.type,
    relatedDocId: logInfo.relatedDocId,
    relatedDocType: logInfo.relatedDocType,
    clientName: logInfo.clientName,
  });
}

// Estendi Request per includere user
interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
  };
}

/**
 * Middleware per autenticazione Firebase
 * ESPORTATA per uso in altri moduli (calendar-routes.ts, etc.)
 */
export async function authenticateFirebase(
  req: any,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: {
          code: "unauthenticated",
          message: "Missing Authorization Bearer token",
        },
      });
    }

    const idToken = authHeader.replace("Bearer ", "").trim();

    try {
      // Verifica token usando Firebase REST API - getAccountInfo verifica ID tokens
      const firebaseApiKey =
        process.env.VITE_FIREBASE_API_KEY ||
        "AIzaSyA4mw3dKOvcDBxgIJOo-r-4yUmyv0knxME";
      const verifyUrl = `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=${firebaseApiKey}`;

      console.log("🔍 Verificando token Firebase...");

      const verifyResponse = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json().catch(() => ({}));
        console.error("❌ Firebase token verification failed:", errorData);
        throw new Error("Invalid token");
      }

      const userData = await verifyResponse.json();
      const user = userData.users?.[0];

      if (!user) {
        throw new Error("User not found");
      }

      req.user = {
        uid: user.localId,
        email: user.email,
      };

      console.log(`🔐 Authenticated user: ${user.email} (${user.localId})`);
      next();
    } catch (authError) {
      console.error("❌ Token verification failed:", authError);
      return res.status(401).json({
        error: { code: "unauthenticated", message: "Invalid or expired token" },
      });
    }
  } catch (error) {
    console.error("❌ Auth middleware error:", error);
    return res.status(500).json({
      error: { code: "internal", message: "Authentication error" },
    });
  }
}

/**
 * Template HTML per email nuove foto
 */
function createNewPhotosEmailHTML(
  galleryName: string,
  uploaderName: string,
  newPhotosCount: number,
  galleryUrl: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">Nuove foto disponibili!</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 10px;">
          <strong>${uploaderName}</strong> ha caricato <strong>${newPhotosCount}</strong> 
          nuova${newPhotosCount > 1 ? "e" : ""} foto nella galleria 
          <strong style="color: #8b5a3c;">${galleryName}</strong>.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${galleryUrl}" 
             style="background: #8b5a3c; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 5px; font-weight: bold;">
            📸 Visualizza la Galleria
          </a>
        </div>
      </div>
      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
        <p style="font-size: 10px; margin-top: 10px; opacity: 0.7;">
          Hai ricevuto questa email perché sei iscritto alle notifiche di questa galleria.
        </p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email password galleria
 */
function createGalleryPasswordEmailHTML(
  firstName: string,
  lastName: string,
  galleryName: string,
  galleryCode: string,
  password: string,
  galleryUrl: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">Password Galleria</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 10px;">
          Ciao <strong>${firstName} ${lastName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 10px;">
          Ecco la password per accedere alla galleria 
          <strong style="color: #8b5a3c;">${galleryName}</strong> (codice: ${galleryCode}):
        </p>
        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;">
          <p style="font-size: 14px; color: #666; margin-bottom: 5px;">Password:</p>
          <p style="font-size: 24px; font-weight: bold; color: #8b5a3c; margin: 0; letter-spacing: 2px;">
            ${password}
          </p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${galleryUrl}" 
             style="background: #8b5a3c; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 5px; font-weight: bold;">
            Accedi alla Galleria
          </a>
        </div>
      </div>
      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * POST /api/email/notify-new-photos
 * Invia notifiche email per nuove foto caricate
 * RICHIEDE AUTENTICAZIONE: Bearer token Firebase (solo admin/owner)
 * Recupera recipients SERVER-SIDE dalla collection subscriptions
 */
router.post(
  "/notify-new-photos",
  authenticateFirebase,
  async (req: any, res: Response) => {
    try {
      const {
        galleryId,
        galleryName,
        newPhotosCount,
        uploaderName,
        galleryUrl,
      } = req.body;

      console.log(
        `📧 Richiesta notifica nuove foto da utente: ${req.user?.email}`,
      );

      // Validazione campi obbligatori
      if (!galleryId || !galleryName || !galleryUrl) {
        return res.status(400).json({
          error: {
            code: "invalid-argument",
            message:
              "Missing required fields: galleryId, galleryName, galleryUrl",
          },
        });
      }

      // AUTORIZZAZIONE: Verifica che l'utente sia proprietario della galleria o admin
      console.log(`🔒 Verifica autorizzazione per galleria ${galleryId}`);

      const galleryDoc = await getFirestoreDocument(`galleries/${galleryId}`);

      if (!galleryDoc) {
        console.log(`❌ Galleria ${galleryId} non trovata`);
        return res.status(404).json({
          error: { code: "not-found", message: "Gallery not found" },
        });
      }

      const galleryOwnerId = galleryDoc.fields?.userId?.stringValue;
      const isOwner = galleryOwnerId === req.user.uid;

      // Lista admin hardcoded (come nel resto dell'app)
      const ADMIN_EMAILS = ["gennaro.mazzacane@gmail.com"];
      const isAdmin = ADMIN_EMAILS.includes(req.user.email || "");

      if (!isOwner && !isAdmin) {
        console.log(
          `❌ Utente ${req.user.email} non autorizzato per galleria ${galleryId}`,
        );
        return res.status(403).json({
          error: {
            code: "permission-denied",
            message: "Not authorized to send notifications for this gallery",
          },
        });
      }

      console.log(
        `✅ Utente autorizzato: ${isOwner ? "proprietario" : "admin"}`,
      );

      // RECUPERA RECIPIENTS SERVER-SIDE dalla collection subscriptions
      console.log(`🔍 Recupero subscribers per galleria: ${galleryId}`);

      // Query Firestore REST API per subscribers attivi
      const subscriptionsUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;

      const subscriptionsQuery = {
        structuredQuery: {
          from: [{ collectionId: "subscriptions" }],
          where: {
            compositeFilter: {
              op: "AND",
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: "galleryId" },
                    op: "EQUAL",
                    value: { stringValue: galleryId },
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: "active" },
                    op: "EQUAL",
                    value: { booleanValue: true },
                  },
                },
              ],
            },
          },
        },
      };

      const subscriptionsResponse = await fetch(subscriptionsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscriptionsQuery),
      });

      if (!subscriptionsResponse.ok) {
        console.error(
          `❌ Firestore query failed: ${subscriptionsResponse.status} ${subscriptionsResponse.statusText}`,
        );
        return res.status(500).json({
          error: {
            code: "internal",
            message: "Failed to query subscriptions",
          },
        });
      }

      const subscriptionsData = await subscriptionsResponse.json();

      // Estrai email dai risultati Firestore REST API
      const recipients = (
        Array.isArray(subscriptionsData) ? subscriptionsData : []
      )
        .filter((result: any) => result.document)
        .map((result: any) => result.document.fields.email?.stringValue || "")
        .filter((email: string) => email);

      if (recipients.length === 0) {
        console.log(`⚠️ Nessun subscriber attivo per galleria ${galleryId}`);
        return res.status(200).json({
          success: true,
          message: "No active subscribers",
          notified: 0,
        });
      }

      console.log(`📬 Trovati ${recipients.length} subscribers attivi`);

      // Recupera dati contatto studio
      const studioInfo = await getStudioContactInfo();

      // Crea HTML email
      const htmlContent = createNewPhotosEmailHTML(
        galleryName,
        uploaderName || "Admin",
        newPhotosCount || 1,
        galleryUrl,
        studioInfo
      );

      const subject = `${newPhotosCount || 1} nuova${(newPhotosCount || 1) > 1 ? "e" : ""} foto in "${galleryName}"`;

      // Invia email tramite Gmail API
      // OPZIONE 1: Invio diretto (per pochi destinatari)
      if (recipients.length <= 5) {
        await sendGmailEmail(recipients, subject, htmlContent);
      } else {
        // OPZIONE 2: Usa queue per invio massivo (>5 destinatari)
        // Chiama Firebase Function per enqueue
        const baseUrl = process.env.FIREBASE_FUNCTIONS_URL || 'https://us-central1-wedding-gallery-397b6.cloudfunctions.net';

        await fetch(`${baseUrl}/enqueueEmail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipients,
            subject,
            htmlContent,
            priority: 'high',
            metadata: {
              galleryId,
              type: 'new_photos'
            }
          })
        });

        console.log(`📬 ${recipients.length} email enqueued for async processing`);
      }

      console.log(
        `✉️ Notifiche inviate a ${recipients.length} destinatari per ${galleryName}`,
      );

      res.status(200).json({
        success: true,
        message: "Notifications sent successfully",
        notified: recipients.length,
      });
    } catch (error) {
      console.error("❌ Error notify-new-photos:", error);
      res.status(500).json({
        error: {
          code: "internal",
          message: "Failed to send notification email",
        },
      });
    }
  },
);

/**
 * POST /api/email/send-gallery-password
 * Invia password galleria via email
 * NO AUTENTICAZIONE RICHIESTA (endpoint pubblico per recupero password)
 * SICUREZZA: Password recuperata server-side, security question validata server-side
 */
router.post("/send-gallery-password", async (req, res) => {
  try {
    const {
      galleryId,
      recipientEmail,
      galleryName,
      galleryCode,
      firstName,
      lastName,
      galleryUrl,
      securityAnswer,
    } = req.body;

    console.log(
      `🔑 Richiesta password per galleria ${galleryCode} (${galleryId})`,
    );

    // Validazione campi obbligatori
    if (
      !galleryId ||
      !recipientEmail ||
      !galleryName ||
      !galleryCode ||
      !firstName ||
      !lastName ||
      !galleryUrl
    ) {
      return res.status(400).json({
        error: { code: "invalid-argument", message: "Missing required fields" },
      });
    }

    // VERIFICA ESISTENZA GALLERIA (documento pubblico)
    const galleryDoc = await getFirestoreDocument(`galleries/${galleryId}`);
    if (!galleryDoc) {
      console.log(`❌ Galleria ${galleryId} non trovata`);
      return res.status(404).json({
        error: { code: "not-found", message: "Gallery not found" },
      });
    }

    // RECUPERA PASSWORD con fallback automatico per backward compatibility
    // 1. Prima prova con collection protetta `gallerySecrets` (Firebase Admin SDK)
    // 2. Se non esiste, fallback a `galleries.password` (gallerie legacy)
    // 3. Se trova password legacy, la migra automaticamente a gallerySecrets
    let password: string | undefined;

    const secretsDoc = await db.collection('gallerySecrets').doc(galleryId).get();

    if (secretsDoc.exists && secretsDoc.data()?.password) {
      // Caso 1: Password trovata in gallerySecrets (nuova architettura)
      password = secretsDoc.data()?.password;
      console.log(`✅ Password recuperata da gallerySecrets per galleria ${galleryId}`);
    } else {
      // Caso 2: Fallback a galleries.password (gallerie legacy)
      console.log(`⚠️ gallerySecrets non trovato, tentativo fallback a galleries.password per ${galleryId}`);

      const legacyPassword = galleryDoc.password;

      if (legacyPassword) {
        password = legacyPassword;
        console.log(`✅ Password recuperata da galleries.password (legacy) per galleria ${galleryId}`);

        // Migrazione automatica a gallerySecrets
        try {
          await db.collection('gallerySecrets').doc(galleryId).set({
            password: legacyPassword,
            migratedAt: new Date().toISOString(),
            migratedFrom: 'galleries.password'
          }, { merge: true });
          console.log(`✅ Password migrata automaticamente a gallerySecrets per galleria ${galleryId}`);
        } catch (migrationError) {
          console.error(`⚠️ Errore migrazione automatica password per ${galleryId}:`, migrationError);
          // Non bloccare l'invio email se la migrazione fallisce
        }
      }
    }

    if (!password) {
      console.error(`❌ Password non trovata né in gallerySecrets né in galleries.password per galleria ${galleryId}`);
      return res.status(500).json({
        error: { 
          code: "internal", 
          message: "Configurazione password non trovata. Contatta l'amministratore." 
        },
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    // INVIA EMAIL CON PASSWORD
    const htmlContent = createGalleryPasswordEmailHTML(
      firstName,
      lastName,
      galleryName,
      galleryCode,
      password,
      galleryUrl,
      studioInfo
    );

    const subject = `Password per la galleria "${galleryName}"`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Password inviata via email a ${recipientEmail} per galleria ${galleryCode}`,
    );

    res.status(200).json({
      result: {
        success: true,
        message: "Password email sent successfully",
      },
    });
  } catch (error) {
    console.error("❌ Errore send-gallery-password:", error);
    res.status(500).json({
      error: { code: "internal", message: "Failed to send password email" },
    });
  }
});

/**
 * Interface per prodotti con bundle
 */
interface ProductWithBundle {
  prodottoNome: string;
  prodottoPrezzo?: number;
  prodottoNumeroFoto?: number;
  quantita?: number;
  isBundle?: boolean;
  bundleItems?: Array<{
    prodottoNome: string;
    quantita: number;
    numeroFoto: number;
  }>;
}

/**
 * Helper: Formatta prodotti per email HTML (supporta bundle)
 * Mostra ogni prodotto con numero foto e, se bundle, elenca i prodotti inclusi
 */
function formatProductsForEmail(products: ProductWithBundle[]): string {
  if (!products || products.length === 0) return '';
  
  let html = '<div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">';
  html += '<h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">📦 Prodotti Selezionati</h3>';
  
  for (const product of products) {
    const qty = product.quantita || 1;
    const qtyStr = qty > 1 ? ` x${qty}` : '';
    
    // Calcola foto totali: per bundle somma bundleItems, altrimenti usa prodottoNumeroFoto
    let totalPhotos = 0;
    if (product.isBundle && product.bundleItems && product.bundleItems.length > 0) {
      totalPhotos = product.bundleItems.reduce((sum, bi) => sum + (bi.numeroFoto || 0) * (bi.quantita || 1), 0);
    } else {
      totalPhotos = product.prodottoNumeroFoto || 0;
    }
    
    const photoStr = totalPhotos > 0 ? ` (${totalPhotos} foto)` : '';
    const bundleIcon = product.isBundle ? ' 📦' : '';
    
    html += `<p style="margin: 8px 0; font-weight: 500;">• ${product.prodottoNome}${qtyStr}${photoStr}${bundleIcon}</p>`;
    
    // Se è un bundle, elenca i prodotti inclusi
    if (product.isBundle && product.bundleItems && product.bundleItems.length > 0) {
      html += '<div style="margin-left: 20px; padding: 10px; background: #f8f5f0; border-radius: 5px; margin-bottom: 10px;">';
      html += '<p style="margin: 0 0 8px 0; font-size: 13px; color: #666; font-style: italic;">Prodotti inclusi nel bundle:</p>';
      for (const item of product.bundleItems) {
        const itemQty = item.quantita > 1 ? ` x${item.quantita}` : '';
        const itemPhotos = item.numeroFoto > 0 ? ` (${item.numeroFoto * item.quantita} foto)` : '';
        html += `<p style="margin: 4px 0; font-size: 13px; color: #555;">  └ ${item.prodottoNome}${itemQty}${itemPhotos}</p>`;
      }
      html += '</div>';
    }
  }
  
  html += '</div>';
  return html;
}

/**
 * Helper: Formatta prodotto singolo per email (legacy + bundle support)
 * Usato quando si passa un singolo prodotto invece di un array
 */
function formatSingleProductForEmail(
  productName?: string, 
  products?: ProductWithBundle[]
): string {
  // Se abbiamo prodotti multipli, usa il formatter avanzato
  if (products && products.length > 0) {
    return formatProductsForEmail(products);
  }
  
  // Fallback: prodotto singolo legacy
  if (productName) {
    return `<p style="margin: 8px 0;"><strong>📦 Pacchetto:</strong> ${productName}</p>`;
  }
  
  return '';
}

/**
 * Template HTML per email prenotazione ricevuta (in_attesa)
 */
export function createBookingReceivedEmailHTML(
  clienteName: string,
  campaignName: string,
  bookingDate: string,
  bookingTime: string,
  duration: number,
  productName?: string,
  studioInfo?: { name: string; email: string; phone: string; address: string },
  calendarLink?: string,
  products?: ProductWithBundle[]
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  // Usa la nuova funzione per formattare i prodotti (supporta bundle)
  const productsHtml = formatSingleProductForEmail(productName, products);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">Richiesta Prenotazione Ricevuta!</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Grazie per aver prenotato uno shooting fotografico! Abbiamo ricevuto la tua richiesta per <strong style="color: #8b5a3c;">${campaignName}</strong>.
        </p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">📋 Dettagli Prenotazione</h3>
          <p style="margin: 8px 0;"><strong>📅 Data:</strong> ${bookingDate}</p>
          <p style="margin: 8px 0;"><strong>🕐 Orario:</strong> ${bookingTime}</p>
          <p style="margin: 8px 0;"><strong>⏱️ Durata:</strong> ${duration} minuti</p>
        </div>

        ${productsHtml}

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #856404;">
            <strong>⏳ In Attesa di Conferma</strong><br>
            La tua prenotazione è stata presa in carico. Riceverai una <strong>email di conferma</strong> 
            non appena il fotografo approverà la tua richiesta.
          </p>
        </div>

        <p style="font-size: 14px; color: #666; margin-top: 20px;">
          Ti contatteremo a breve per confermare tutti i dettagli. Nel frattempo, se hai domande o necessiti di modifiche, 
          non esitare a contattarci via WhatsApp.
        </p>
      </div>

      ${calendarLink ? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${calendarLink}" 
           style="display: inline-block; background: #8b5a3c; color: white; padding: 15px 30px; 
                  text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;
                  transition: background 0.3s ease;">
          📅 Aggiungi al Calendario
        </a>
        <p style="font-size: 12px; color: #888; margin-top: 12px;">
          Compatibile con Google Calendar, Outlook, Apple Calendar
        </p>
      </div>
      ` : ''}

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * POST /api/email/send-booking-received
 * Invia email "Prenotazione Ricevuta" dopo creazione booking
 */
router.post("/send-booking-received", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteNome,
      clienteCognome,
      campaignNome,
      dataShootingInizio,
      dataShootingFine,
      prodottoNome,
      note
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteNome || !clienteCognome || !campaignNome || !dataShootingInizio || !dataShootingFine) {
      return res.status(400).json({
        error: "Parametri mancanti per invio email prenotazione ricevuta"
      });
    }

    const clienteName = `${clienteNome} ${clienteCognome}`;

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createBookingReceivedEmailHTML(
      clienteName,
      campaignNome,
      dataShootingInizio,
      dataShootingFine,
      0, // duration non usata nel template attuale
      prodottoNome,
      studioInfo
    );

    const subject = `Prenotazione Ricevuta - ${campaignNome}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Prenotazione Ricevuta" inviata a ${recipientEmail} per campagna ${campaignNome}`
    );

    res.status(200).json({
      success: true,
      message: "Booking received email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore send-booking-received:", error);
    res.status(500).json({
      error: "Errore invio email prenotazione ricevuta"
    });
  }
});

/**
 * POST /api/email/send-booking-confirmed
 * Invia email "Prenotazione Confermata" dopo approvazione admin
 */
router.post("/send-booking-confirmed", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteNome,
      clienteCognome,
      campaignNome,
      dataShootingInizio,
      dataShootingFine,
      prodottoNome,
      note
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteNome || !clienteCognome || !campaignNome || !dataShootingInizio || !dataShootingFine) {
      return res.status(400).json({
        error: "Parametri mancanti per invio email prenotazione confermata"
      });
    }

    const clienteName = `${clienteNome} ${clienteCognome}`;

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createBookingConfirmedEmailHTML(
      clienteName,
      campaignNome,
      dataShootingInizio,
      dataShootingFine,
      0, // duration non usata nel template attuale
      prodottoNome,
      note,
      studioInfo
    );

    const subject = `Prenotazione Confermata - ${campaignNome}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Prenotazione Confermata" inviata a ${recipientEmail} per campagna ${campaignNome}`
    );

    res.status(200).json({
      success: true,
      message: "Booking confirmed email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore send-booking-confirmed:", error);
    res.status(500).json({
      error: "Errore invio email prenotazione confermata"
    });
  }
});

/**
 * POST /api/email/send-booking-cancelled
 * Invia email "Prenotazione Annullata" quando admin cancella una prenotazione confermata
 */
router.post("/send-booking-cancelled", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteNome,
      clienteCognome,
      campaignNome,
      bookingDate
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteNome || !clienteCognome || !campaignNome || !bookingDate) {
      return res.status(400).json({
        error: "Parametri mancanti per invio email prenotazione annullata"
      });
    }

    const clienteName = `${clienteNome} ${clienteCognome}`;

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createBookingCancelledEmailHTML(
      clienteName,
      campaignNome,
      bookingDate,
      studioInfo
    );

    const subject = `Prenotazione Annullata - ${campaignNome}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Prenotazione Annullata" inviata a ${recipientEmail} per campagna ${campaignNome}`
    );

    res.status(200).json({
      success: true,
      message: "Booking cancelled email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore send-booking-cancelled:", error);
    res.status(500).json({
      error: "Errore invio email prenotazione annullata"
    });
  }
});

/**
 * Template HTML per email prenotazione confermata (approvata da admin)
 */
export function createBookingConfirmedEmailHTML(
  clienteName: string,
  campaignName: string,
  bookingDate: string,
  bookingTime: string,
  duration: number,
  productName?: string,
  notes?: string,
  studioInfo?: { name: string; email: string; phone: string; address: string },
  calendarLink?: string,
  products?: ProductWithBundle[]
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  // Usa la nuova funzione per formattare i prodotti (supporta bundle)
  const productsHtml = formatSingleProductForEmail(productName, products);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #28a745; text-align: center;">Prenotazione Confermata!</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Ottima notizia! La tua prenotazione per <strong style="color: #8b5a3c;">${campaignName}</strong> 
          è stata <strong style="color: #28a745;">confermata</strong>! 🎉
        </p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">📋 Riepilogo Shooting</h3>
          <p style="margin: 8px 0;"><strong>📅 Data:</strong> ${bookingDate}</p>
          <p style="margin: 8px 0;"><strong>🕐 Orario:</strong> ${bookingTime}</p>
          <p style="margin: 8px 0;"><strong>⏱️ Durata:</strong> ${duration} minuti</p>
          ${notes ? `<p style="margin: 8px 0;"><strong>📝 Note:</strong> ${notes}</p>` : ''}
        </div>

        ${productsHtml}

        <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #155724;">
            <strong>✅ Tutto Pronto!</strong><br>
            Ti aspettiamo in studio all'orario concordato. Se hai bisogno di modificare la prenotazione 
            o hai domande, contattaci via WhatsApp.
          </p>
        </div>

        <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h4 style="color: #0056b3; margin-top: 0; margin-bottom: 10px;">💡 Suggerimenti per lo Shooting</h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #333;">
            <li>Arriva 5-10 minuti prima per prepararti con calma</li>
            <li>Porta abiti o accessori che desideri includere nelle foto</li>
            <li>Comunica eventuali preferenze o idee creative</li>
          </ul>
        </div>

        ${calendarLink ? `
        <div style="text-align: center; margin: 25px 0; padding: 20px; background: #f9f7f4; border-radius: 12px;">
          <p style="font-size: 16px; color: #333; margin-bottom: 8px; font-weight: 600;">
            📅 Non dimenticare il tuo appuntamento!
          </p>
          <p style="font-size: 14px; color: #666; margin-bottom: 18px; line-height: 1.5;">
            Aggiungi questo evento al tuo calendario per ricevere un promemoria automatico. Basta un click!
          </p>
          <a href="${calendarLink}" 
             style="display: inline-block; background: #8b5a3c; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;
                    transition: background 0.3s ease;">
            📅 Aggiungi al Calendario
          </a>
          <p style="font-size: 12px; color: #888; margin-top: 12px; line-height: 1.4;">
            Compatibile con Google Calendar, Outlook, Apple Calendar
          </p>
        </div>
        ` : ''}

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
          Non vediamo l'ora di immortalare i tuoi momenti speciali!
        </p>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per notifica admin - nuova prenotazione ricevuta
 * ESPORTATA per uso in booking-routes.ts
 */
export function createAdminNotificationEmailHTML(
  clienteName: string,
  clienteEmail: string,
  clienteWhatsApp: string,
  campaignName: string,
  bookingDate: string,
  bookingTime: string,
  productName?: string,
  notes?: string,
  studioInfo?: { name: string; email: string; phone: string; address: string },
  products?: ProductWithBundle[]
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  // Usa la nuova funzione per formattare i prodotti (supporta bundle)
  const productsHtml = formatSingleProductForEmail(productName, products);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc3545; text-align: center;">🔔 Nuova Prenotazione Ricevuta!</h2>
      <div style="background: #fff3cd; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #ffc107;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          <strong>Attenzione Admin!</strong>
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          È stata ricevuta una <strong>nuova richiesta di prenotazione</strong> per <strong style="color: #8b5a3c;">${campaignName}</strong>.
        </p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">👤 Dati Cliente</h3>
          <p style="margin: 8px 0;"><strong>Nome:</strong> ${clienteName}</p>
          <p style="margin: 8px 0;"><strong>📧 Email:</strong> <a href="mailto:${clienteEmail}">${clienteEmail}</a></p>
          <p style="margin: 8px 0;"><strong>📱 WhatsApp:</strong> <a href="https://wa.me/${formatPhoneForWhatsApp(clienteWhatsApp)}">${clienteWhatsApp}</a></p>
        </div>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">📋 Dettagli Prenotazione</h3>
          <p style="margin: 8px 0;"><strong>📅 Data:</strong> ${bookingDate}</p>
          <p style="margin: 8px 0;"><strong>🕐 Orario:</strong> ${bookingTime}</p>
          ${notes ? `<p style="margin: 8px 0;"><strong>📝 Note:</strong> ${notes}</p>` : ''}
        </div>

        ${productsHtml}

        <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #0c5460;">
            <strong>⏰ Azione Richiesta</strong><br>
            Accedi alla dashboard admin per <strong>approvare o gestire</strong> questa prenotazione. 
            Il cliente ha ricevuto una email di conferma ricezione e attende la tua approvazione.
          </p>
        </div>

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
          Gestisci questa prenotazione dalla dashboard admin.
        </p>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email cambio stato: COMPLETATA
 * ESPORTATA per uso in booking-routes.ts
 */
export function createBookingCompletedEmailHTML(
  clienteName: string,
  campaignName: string,
  bookingDate: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #17a2b8; text-align: center;">📸 Shooting Completato!</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Grazie per aver partecipato allo shooting fotografico <strong style="color: #8b5a3c;">${campaignName}</strong>!
        </p>

        <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #0c5460;">
            <strong>✅ Stato: Completato</strong><br>
            Il tuo shooting si è svolto il <strong>${bookingDate}</strong> ed è ora completato. 
            Ti contatteremo presto per la consegna delle foto e per eventuali pacchetti aggiuntivi.
          </p>
        </div>

        <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h4 style="color: #0056b3; margin-top: 0; margin-bottom: 10px;">💡 Prossimi Passi</h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #333;">
            <li>Riceverai una notifica quando le foto saranno pronte</li>
            <li>Potrai visualizzare e selezionare le tue foto preferite</li>
            <li>Ti invieremo tutte le info per il ritiro o la consegna</li>
          </ul>
        </div>

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
          Grazie per aver scelto i nostri servizi! ❤️
        </p>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email cambio stato: ANNULLATA
 * ESPORTATA per uso in booking-routes.ts
 */
export function createBookingCancelledEmailHTML(
  clienteName: string,
  campaignName: string,
  bookingDate: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #6c757d; text-align: center;">Prenotazione Annullata</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Ti informiamo che la tua prenotazione per <strong style="color: #8b5a3c;">${campaignName}</strong> 
          è stata <strong>annullata</strong>.
        </p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 8px 0;"><strong>📅 Data originale:</strong> ${bookingDate}</p>
          <p style="margin: 8px 0;"><strong>❌ Stato:</strong> Annullata</p>
        </div>

        <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #721c24;">
            Se hai domande o desideri prenotare un nuovo shooting, non esitare a contattarci via email o WhatsApp. 
            Saremo felici di aiutarti!
          </p>
        </div>

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
          Ci auguriamo di poterti servire in futuro.
        </p>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email RIFIUTO prenotazione
 * ESPORTATA per uso in booking-routes.ts
 */
export function createBookingRejectedEmailHTML(
  clienteName: string,
  campaignName: string,
  bookingDate: string,
  bookingUrl: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc3545; text-align: center;">Prenotazione Non Disponibile</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Ci dispiace informarti che <strong>non è possibile eseguire lo shooting</strong> 
          per <strong style="color: #8b5a3c;">${campaignName}</strong> nella data che hai richiesto.
        </p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 8px 0;"><strong>📅 Data richiesta:</strong> ${bookingDate}</p>
          <p style="margin: 8px 0;"><strong>❌ Stato:</strong> Non disponibile</p>
        </div>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #856404;">
            <strong>💡 Prenota per un altro giorno</strong>
          </p>
          <p style="margin: 0 0 15px 0; font-size: 14px; color: #856404;">
            Abbiamo molte altre date disponibili! Puoi scegliere un altro giorno che fa per te.
          </p>
          <div style="text-align: center;">
            <a href="${bookingUrl}" 
               style="display: inline-block; background: #8b5a3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
              📅 Prenota un altro giorno
            </a>
          </div>
        </div>

        <div style="background: #e7f3ff; border-left: 4px solid #0dcaf0; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #055160;">
            <strong>Hai domande?</strong><br>
            Contattaci via email o WhatsApp. Siamo qui per aiutarti a trovare la data perfetta per il tuo shooting!
          </p>
        </div>

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
          Ti aspettiamo! ❤️
        </p>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">WhatsApp: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email conferma acconto ricevuto
 * ESPORTATA per uso in order management (acconti multipli)
 */
export function createOrderAccontoRicevutoEmailHTML(
  clienteName: string,
  prodottoNome: string,
  accontoImporto: number,
  accontoTotale: number,
  saldoRimanente: number,
  metodo: string,
  note?: string,
  studioInfo?: { name: string; email: string; phone: string; address: string },
  totaleOrdine?: number,
  transactions?: Array<{ tipo: 'acconto' | 'saldo'; importo: number; metodo: string; data: any; note?: string }>
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatMethod = (method: string) => {
    const methods: Record<string, string> = {
      'contante': 'Contante',
      'carta': 'Carta',
      'bonifico': 'Bonifico',
      'paypal': 'PayPal'
    };
    return methods[method.toLowerCase()] || method;
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #28a745; text-align: center;">✅ Acconto Ricevuto</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Abbiamo ricevuto con successo il tuo acconto per l'ordine <strong style="color: #8b5a3c;">${prodottoNome}</strong>. 
          Grazie per la tua fiducia!
        </p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #28a745; margin-top: 0; margin-bottom: 15px;">✅ Dettagli Pagamento</h3>
          <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 10px 0;">
            <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #155724;">
              Acconto ricevuto: ${formatCurrency(accontoImporto)}
            </p>
            <p style="margin: 0; font-size: 14px; color: #155724;">
              Metodo: ${formatMethod(metodo)}
            </p>
            ${note ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #666; font-style: italic;">${note}</p>` : ''}
          </div>
        </div>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <h4 style="color: #856404; margin-top: 0; margin-bottom: 10px;">💰 Riepilogo Ordine</h4>
          <table style="width: 100%; font-size: 14px; color: #333; border-collapse: collapse;">
            ${totaleOrdine ? `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 8px 0; font-weight: bold;">Costo totale servizio:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold; font-size: 16px; color: #8b5a3c;">${formatCurrency(totaleOrdine)}</td>
            </tr>
            ` : ''}
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 8px 0;">Acconto totale versato:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #28a745;">${formatCurrency(accontoTotale)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 8px 0;">Saldo rimanente:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #856404;">${formatCurrency(saldoRimanente)}</td>
            </tr>
          </table>
        </div>

        ${transactions && transactions.length > 0 ? `
        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #e0e0e0;">
          <h4 style="color: #333; margin-top: 0; margin-bottom: 15px;">📋 Cronologia Pagamenti</h4>
          <table style="width: 100%; font-size: 13px; color: #333; border-collapse: collapse;">
            <thead>
              <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                <th style="padding: 10px; text-align: left;">Data</th>
                <th style="padding: 10px; text-align: left;">Tipo</th>
                <th style="padding: 10px; text-align: right;">Importo</th>
                <th style="padding: 10px; text-align: left;">Metodo</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.map((t, index) => {
                // Helper robusto per parsing date - gestisce Firestore Timestamp, ISO string, millisecondi
                let date: Date;
                if (!t.data) {
                  date = new Date(); // Fallback
                } else if (t.data.toDate && typeof t.data.toDate === 'function') {
                  date = t.data.toDate(); // Firestore Timestamp
                } else if (typeof t.data === 'string') {
                  date = new Date(t.data); // ISO string
                } else if (typeof t.data === 'number') {
                  date = new Date(t.data); // Milliseconds
                } else if (t.data instanceof Date) {
                  date = t.data; // Already a Date
                } else {
                  date = new Date(); // Fallback sicuro
                }

                const dateStr = date.toLocaleDateString('it-IT', { 
                  day: '2-digit', 
                  month: 'long', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return `
                  <tr style="border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 10px; font-size: 12px;">${dateStr}</td>
                    <td style="padding: 10px;">
                      <span style="background: ${t.tipo === 'acconto' ? '#cfe2ff' : '#d1e7dd'}; color: ${t.tipo === 'acconto' ? '#084298' : '#0f5132'}; padding: 4px 8px; border-radius: 3px; font-size: 11px; font-weight: bold;">
                        ${t.tipo === 'acconto' ? 'Acconto' : 'Saldo'}
                      </span>
                    </td>
                    <td style="padding: 10px; text-align: right; font-weight: bold; color: #28a745;">${formatCurrency(t.importo)}</td>
                    <td style="padding: 10px; font-size: 12px;">${formatMethod(t.metodo)}</td>
                  </tr>
                  ${t.note ? `
                  <tr>
                    <td colspan="4" style="padding: 5px 10px; font-size: 11px; color: #666; font-style: italic; border-bottom: 1px solid #e0e0e0;">
                      Note: ${t.note}
                    </td>
                  </tr>
                  ` : ''}
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${saldoRimanente > 0 ? `
        <div style="background: #e7f3ff; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0;">
          <h4 style="color: #0056b3; margin-top: 0; margin-bottom: 10px;">📸 Prossimi Passi</h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #0c5460;">
            <li>Se desideri versare un ulteriore acconto, contattaci via email o WhatsApp</li>
            <li>Il saldo finale dovrà essere completato prima della consegna</li>
            <li>Ti informeremo quando l'ordine sarà pronto</li>
          </ul>
        </div>
        ` : `
        <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 16px; font-weight: bold; color: #0f5132;">
            🎉 Ordine completamente saldato! Procederemo con la lavorazione e ti contatteremo appena pronto.
          </p>
        </div>
        `}

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
          Grazie per aver scelto Image Studio Fotografico! ❤️
        </p>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML generico per email pagamento ricevuto (acconto o saldo)
 * ESPORTATA per uso in order-routes.ts
 */
export function createOrderPaymentReceivedEmailHTML(
  clienteName: string,
  nomeEvento: string,
  paymentType: 'acconto' | 'saldo',
  paymentAmount: number,
  paymentMethod: string,
  formattedDate: string,
  remainingBalance: number,
  nextPaymentDate?: string,
  notes?: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio", 
    email: "info@imagestudiofotografico.com",
    phone: "+39 334 7103142",
    address: ""
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatMethod = (method: string) => {
    const methods: Record<string, string> = {
      'contante': 'Contante',
      'carta': 'Carta',
      'bonifico': 'Bonifico',
      'paypal': 'PayPal'
    };
    return methods[method.toLowerCase()] || method;
  };

  const isAcconto = paymentType === 'acconto';
  const titleColor = isAcconto ? '#28a745' : '#0d6efd';
  const titleText = isAcconto ? '✅ Acconto Ricevuto' : '🎉 Saldo Finale Ricevuto';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: ${titleColor}; text-align: center;">${titleText}</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          ${isAcconto 
            ? `Abbiamo ricevuto con successo il tuo acconto per <strong style="color: #8b5a3c;">${nomeEvento}</strong>. Grazie per la tua fiducia!`
            : `Abbiamo ricevuto il saldo finale per <strong style="color: #8b5a3c;">${nomeEvento}</strong>. Il pagamento è stato completato con successo! 🎉`
          }
        </p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: ${titleColor}; margin-top: 0; margin-bottom: 15px;">💰 Dettagli Pagamento</h3>
          <div style="background: ${isAcconto ? '#d4edda' : '#cfe2ff'}; border-left: 4px solid ${titleColor}; padding: 15px; margin: 10px 0;">
            <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: bold; color: ${isAcconto ? '#155724' : '#084298'};">
              ${formatCurrency(paymentAmount)}
            </p>
            <p style="margin: 0 0 4px 0; font-size: 14px; color: #666;">
              <strong>Metodo:</strong> ${formatMethod(paymentMethod)}
            </p>
            <p style="margin: 0; font-size: 14px; color: #666;">
              <strong>Data:</strong> ${formattedDate}
            </p>
            ${notes ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #666; font-style: italic;">${notes}</p>` : ''}
          </div>
        </div>

        ${remainingBalance > 0 ? `
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <h4 style="color: #856404; margin-top: 0; margin-bottom: 10px;">📋 Saldo Rimanente</h4>
          <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #856404;">
            ${formatCurrency(remainingBalance)}
          </p>
          ${nextPaymentDate ? `
            <p style="margin: 0; font-size: 14px; color: #856404;">
              Prossima scadenza: ${nextPaymentDate}
            </p>
          ` : ''}
        </div>
        ` : `
        <div style="background: #d1e7dd; border-left: 4px solid #0f5132; padding: 15px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; font-size: 16px; font-weight: bold; color: #0f5132;">
            ✅ Pagamento Completato
          </p>
          <p style="margin: 8px 0 0 0; font-size: 14px; color: #0f5132;">
            Non ci sono importi residui da saldare.
          </p>
        </div>
        `}

        <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #0056b3; text-align: center;">
            ${isAcconto 
              ? 'Grazie per il tuo pagamento! Ti contatteremo presto per i prossimi passi.'
              : 'Grazie per aver scelto Image Studio! È stato un piacere lavorare con te.'
            }
          </p>
        </div>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email ordine creato
 * Inviata al cliente quando viene creato un nuovo ordine
 */
function createOrderCreatedEmailHTML(
  clienteName: string,
  prodottoNome: string,
  totale: number,
  acconto: number,
  saldo: number,
  prodotti: Array<{ nome: string; prezzo: number; quantita: number }>,
  studioInfo?: { name: string; email: string; phone: string; address: string },
  sconto?: number
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">Ordine Creato con Successo</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Grazie per averci scelto! Il tuo ordine per <strong style="color: #8b5a3c;">${prodottoNome}</strong> 
          è stato creato con successo.
        </p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">Dettagli Ordine</h3>
          <table style="width: 100%; font-size: 14px; color: #333; border-collapse: collapse;">
            ${prodotti.map(p => `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;">${p.nome}${p.quantita > 1 ? ` (x${p.quantita})` : ''}</td>
                <td style="padding: 8px 0; text-align: right;">${formatCurrency(p.prezzo * p.quantita)}</td>
              </tr>
            `).join('')}
            ${sconto && sconto > 0 ? `
            <tr style="border-top: 1px solid #ddd;">
              <td style="padding: 8px 0;">Subtotale:</td>
              <td style="padding: 8px 0; text-align: right;">${formatCurrency(totale + sconto)}</td>
            </tr>
            <tr style="color: #28a745;">
              <td style="padding: 8px 0;">Sconto applicato:</td>
              <td style="padding: 8px 0; text-align: right;">-${formatCurrency(sconto)}</td>
            </tr>
            ` : ''}
            <tr style="border-top: 2px solid #8b5a3c; font-weight: bold;">
              <td style="padding: 12px 0;">Totale:</td>
              <td style="padding: 12px 0; text-align: right; color: #8b5a3c; font-size: 18px;">${formatCurrency(totale)}</td>
            </tr>
          </table>
        </div>

        ${acconto > 0 ? `
        <div style="background: #e7f3ff; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0;">
          <h4 style="color: #0056b3; margin-top: 0; margin-bottom: 10px;">Pagamenti</h4>
          <table style="width: 100%; font-size: 14px; color: #333;">
            <tr>
              <td>Acconto richiesto:</td>
              <td style="text-align: right; font-weight: bold;">${formatCurrency(acconto)}</td>
            </tr>
            <tr>
              <td>Saldo rimanente:</td>
              <td style="text-align: right; font-weight: bold;">${formatCurrency(saldo)}</td>
            </tr>
          </table>
        </div>
        ` : ''}

        <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0;">
          <h4 style="color: #0c5460; margin-top: 0; margin-bottom: 10px;">Prossimi Passi</h4>
          <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #0c5460;">
            <li>Ti contatteremo a breve per confermare i dettagli</li>
            ${acconto > 0 ? '<li>Procederemo con la richiesta di acconto per iniziare la lavorazione</li>' : ''}
            <li>Ti terremo aggiornato sullo stato dell'ordine</li>
          </ol>
        </div>

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
          Per qualsiasi domanda, contattaci via email o telefono!
        </p>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * POST /api/email/order-created
 * Invia email al cliente quando viene creato un nuovo ordine
 */
router.post("/order-created", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteName,
      prodottoNome,
      totale,
      acconto,
      saldo,
      prodotti,
      sconto
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteName || !prodottoNome || totale === undefined || acconto === undefined || saldo === undefined || !prodotti) {
      return res.status(400).json({
        error: "Parametri mancanti per email creazione ordine"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createOrderCreatedEmailHTML(
      clienteName,
      prodottoNome,
      totale,
      acconto,
      saldo,
      prodotti,
      studioInfo,
      sconto
    );

    const subject = `Nuovo Ordine Creato - ${prodottoNome}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Ordine Creato" inviata a ${recipientEmail} per ordine ${prodottoNome}`
    );

    res.status(200).json({
      success: true,
      message: "Order created email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore order-created email:", error);
    res.status(500).json({
      error: "Errore invio email creazione ordine"
    });
  }
});

/**
 * POST /api/email/acconto-cancelled
 * Invia email al cliente quando un acconto viene cancellato
 */
router.post("/acconto-cancelled", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteName,
      prodottoNome,
      accontoImporto,
      nuovoAccontoTotale,
      nuovoSaldo,
      motivo
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteName || !prodottoNome || accontoImporto === undefined || nuovoAccontoTotale === undefined || nuovoSaldo === undefined) {
      return res.status(400).json({
        error: "Parametri mancanti per email cancellazione acconto"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createAccontoCancelledEmailHTML(
      clienteName,
      prodottoNome,
      accontoImporto,
      nuovoAccontoTotale,
      nuovoSaldo,
      motivo,
      studioInfo
    );

    const subject = `Acconto Annullato - ${prodottoNome}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Acconto Annullato" inviata a ${recipientEmail} per ordine ${prodottoNome}`
    );

    res.status(200).json({
      success: true,
      message: "Acconto cancelled email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore acconto-cancelled email:", error);
    res.status(500).json({
      error: "Errore invio email cancellazione acconto"
    });
  }
});

/**
 * POST /api/email/saldo-received
 * Invia email al cliente quando viene registrato il saldo finale
 */
router.post("/saldo-received", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteName,
      prodottoNome,
      saldoAmount,
      totaleOrdine,
      transactions
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteName || !prodottoNome || saldoAmount === undefined) {
      return res.status(400).json({
        error: "Parametri mancanti per email saldo ricevuto"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createOrderSaldoPendenteEmailHTML(
      clienteName,
      prodottoNome,
      saldoAmount,
      studioInfo,
      totaleOrdine,
      transactions
    );

    const subject = `Saldo Completato - ${prodottoNome}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Saldo Completato" inviata a ${recipientEmail} per ordine ${prodottoNome}`
    );

    res.status(200).json({
      success: true,
      message: "Saldo received email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore saldo-received email:", error);
    res.status(500).json({
      error: "Errore invio email saldo ricevuto"
    });
  }
});

/**
 * POST /api/email/special-gallery-pin-notification
 * Invia email al cliente con PIN di accesso alla galleria speciale
 * Include: nome galleria, tema, PIN, link di accesso, istruzioni
 */
router.post("/special-gallery-pin-notification", async (req, res) => {
  try {
    const { galleryId, clientEmail, clientName } = req.body;

    if (!galleryId || !clientEmail) {
      return res.status(400).json({
        error: "Missing required fields: galleryId, clientEmail"
      });
    }

    console.log(`📧 Invio notifica PIN galleria speciale a: ${clientEmail}`);

    // Costruisci URL assoluto usando helper centralizzato
    const baseUrl = getSiteBaseUrl(req);
    const galleryUrl = `${baseUrl}/special-gallery`;

    console.log(`🔗 URL galleria costruito sul server: ${galleryUrl}`);

    // Inizializza Firebase Admin per recuperare dati galleria


    // Recupera dati galleria
    const galleryDoc = await db.collection('galleries').doc(galleryId).get();
    if (!galleryDoc.exists) {
      return res.status(404).json({ error: "Gallery not found" });
    }

    const galleryData = galleryDoc.data();
    const galleryCode = galleryData?.code || galleryId;
    const galleryName = galleryData?.name || "Galleria Speciale";
    const specialTheme = galleryData?.specialTheme;

    // Recupera PIN da collection protetta
    const secretsDoc = await db.collection('gallerySecrets').doc(galleryId).get();
    if (!secretsDoc.exists || !secretsDoc.data()?.specialPin) {
      return res.status(400).json({ error: "PIN not configured for this gallery" });
    }

    const pin = secretsDoc.data()?.specialPin;

    // Mappa tema a emoji/nome
    const themeInfo: Record<string, { emoji: string; name: string }> = {
      natale: { emoji: "🎄", name: "Natale" },
      carnevale: { emoji: "🎭", name: "Carnevale" },
      sanvalentino: { emoji: "💕", name: "San Valentino" },
      pasqua: { emoji: "🐰", name: "Pasqua" },
      halloween: { emoji: "🎃", name: "Halloween" }
    };

    const theme = specialTheme ? themeInfo[specialTheme] || { emoji: "✨", name: "Speciale" } : { emoji: "✨", name: "Speciale" };

    // Recupera info studio
    const studioInfo = await getStudioContactInfo();

    // Componi email HTML con stile coerente con resto app
    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">${theme.emoji} Accesso Galleria Speciale ${theme.name}</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao${clientName ? ` <strong>${clientName}</strong>` : ''},
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          La tua galleria speciale <strong style="color: #8b5a3c;">${galleryName}</strong> è pronta!
        </p>

        <div style="background: #e7f3ff; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0;">
          <h3 style="color: #0056b3; margin-top: 0; margin-bottom: 10px;">Come accedere:</h3>
          <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #0c5460; line-height: 1.8;">
            <li>Clicca sul pulsante "Accedi alla Galleria" qui sotto</li>
            <li>Inserisci il PIN di accesso quando richiesto</li>
            <li>Goditi la tua galleria speciale!</li>
          </ol>
        </div>

        <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; border: 2px solid #8b5a3c;">
          <p style="font-size: 14px; color: #666; margin-bottom: 10px;">Il tuo PIN di accesso:</p>
          <p style="font-size: 28px; font-weight: bold; color: #8b5a3c; margin: 10px 0; letter-spacing: 4px; font-family: 'Courier New', monospace;">
            ${pin}
          </p>
          <p style="font-size: 12px; color: #999; margin-top: 10px;">Conserva questo PIN in modo sicuro</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${galleryUrl}" 
             style="background: #8b5a3c; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
            Accedi alla Galleria
          </a>
        </div>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #856404;">
            <strong>Nota:</strong> Il PIN è personale e ti permette di accedere in qualsiasi momento alla tua galleria speciale.
          </p>
        </div>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studioInfo.name}</p>
        ${studioInfo.address ? `<p style="margin: 5px 0;">${studioInfo.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studioInfo.email}</p>
        <p style="margin: 5px 0;">Tel: ${studioInfo.phone}</p>
      </div>
    </div>
    `;

    // Invia email tramite funzione sendGmailEmail già disponibile (SENZA emoji nel subject)
    const subject = `Accesso alla Galleria Speciale ${theme.name} - ${galleryName}`;
    await sendGmailEmail(clientEmail, subject, htmlContent);

    console.log(`✅ Email PIN inviata con successo a: ${clientEmail}`);

    res.status(200).json({
      success: true,
      message: "PIN notification email sent successfully",
      recipientEmail: clientEmail
    });

  } catch (error) {
    console.error("❌ Errore invio email PIN:", error);
    res.status(500).json({
      error: "Errore invio email notifica PIN"
    });
  }
});

/**
 * POST /api/email/gallery-password-notification
 * Invia email al cliente con password di accesso alla galleria
 * Può essere chiamato automaticamente alla creazione o manualmente dall'admin
 */
router.post("/gallery-password-notification", async (req, res) => {
  try {
    const { galleryId, clientEmail, clientName } = req.body;

    if (!galleryId || !clientEmail) {
      return res.status(400).json({
        error: "Missing required fields: galleryId, clientEmail"
      });
    }

    console.log(`📧 Invio notifica password galleria a: ${clientEmail}`);

    // Costruisci URL assoluto
    const baseUrl = getSiteBaseUrl(req);

    // Recupera dati galleria
    const galleryDoc = await db.collection('galleries').doc(galleryId).get();
    if (!galleryDoc.exists) {
      return res.status(404).json({ error: "Gallery not found" });
    }

    const galleryData = galleryDoc.data();
    const galleryCode = galleryData?.code || galleryId;
    const galleryName = galleryData?.name || "Galleria";
    const galleryUrl = `${baseUrl}/gallery/${galleryCode}`;

    console.log(`🔗 URL galleria: ${galleryUrl}`);

    // Recupera password da collection protetta
    const secretsDoc = await db.collection('gallerySecrets').doc(galleryId).get();
    if (!secretsDoc.exists || !secretsDoc.data()?.password) {
      return res.status(400).json({ error: "Password not configured for this gallery" });
    }

    const password = secretsDoc.data()?.password;

    // Recupera info studio
    const studioInfo = await getStudioContactInfo();

    // Import template
    const { generateGalleryPasswordEmail, generateGalleryPasswordSubject } = await import('./email-templates/gallery-password-notification');
    
    const htmlContent = generateGalleryPasswordEmail({
      clientName,
      galleryName,
      galleryUrl,
      password,
      studioName: studioInfo.name,
      studioPhone: studioInfo.phone,
      studioEmail: studioInfo.email
    });

    const subject = generateGalleryPasswordSubject(galleryName);

    // Invia email (senza emoji nel subject per compatibilità)
    await sendGmailEmail(clientEmail, subject.replace(/[^\x00-\x7F]/g, ''), htmlContent);

    console.log(`✅ Email password inviata con successo a: ${clientEmail}`);

    res.status(200).json({
      success: true,
      message: "Password notification email sent successfully",
      recipientEmail: clientEmail
    });

  } catch (error) {
    console.error("❌ Errore invio email password:", error);
    res.status(500).json({
      error: "Errore invio email notifica password"
    });
  }
});

/**
 * GET /api/email/get-gallery-secrets/:galleryId
 * Recupera password e PIN per una galleria (ADMIN ONLY)
 * Usato da EditGalleryModal per caricare i secrets quando si apre il modal
 * RICHIEDE AUTENTICAZIONE: Bearer token Firebase (solo admin)
 */
router.get("/get-gallery-secrets/:galleryId", authenticateFirebase, async (req: any, res) => {
  try {
    const { galleryId } = req.params;

    if (!galleryId) {
      return res.status(400).json({
        error: { code: "invalid-argument", message: "Missing galleryId" }
      });
    }

    // CONTROLLO ADMIN: Solo admin possono accedere ai secrets
    const ADMIN_EMAILS = ["gennaro.mazzacane@gmail.com"];
    const isAdmin = ADMIN_EMAILS.includes(req.user.email || "");

    if (!isAdmin) {
      console.log(`❌ Utente ${req.user.email} non autorizzato a leggere secrets`);
      return res.status(403).json({
        error: {
          code: "permission-denied",
          message: "Admin access required"
        }
      });
    }

    console.log(`🔍 Recupero secrets per galleria: ${galleryId} (utente admin: ${req.user.email})`);

    // Inizializza Firebase Admin


    // Leggi secrets dalla collection protetta
    const secretsDoc = await db.collection('gallerySecrets').doc(galleryId).get();

    if (!secretsDoc.exists) {
      // Nessun secrets salvato per questa galleria
      return res.status(200).json({
        password: null,
        specialPin: null
      });
    }

    const secretsData = secretsDoc.data();

    res.status(200).json({
      password: secretsData?.password || null,
      specialPin: secretsData?.specialPin || null
    });

  } catch (error) {
    console.error("❌ Errore recupero gallery secrets:", error);
    res.status(500).json({
      error: { code: "internal", message: "Errore recupero secrets" }
    });
  }
});

/**
 * POST /api/email/verify-special-pin
 * Verifica PIN galleria speciale SERVER-SIDE senza esporlo al client
 * SICURO: legge PIN da collection protetta `gallerySecrets` (admin-only)
 * Ritorna anche l'ID e il code della galleria associata
 */
router.post("/verify-special-pin", async (req, res) => {
  try {
    const { pin } = req.body;

    // Validazione parametri
    if (!pin) {
      return res.status(400).json({
        error: { code: "invalid-argument", message: "Missing PIN" }
      });
    }

    console.log(`🔍 Verifica PIN speciale: ${pin.substring(0, 2)}***`);

    // OTTIMIZZAZIONE: Cerca direttamente in gallerySecrets per PIN match
    // Questo è più veloce che scansionare tutte le gallerie speciali
    const secretsSnapshot = await db.collection('gallerySecrets').get();
    
    console.log(`📊 Trovati ${secretsSnapshot.size} documenti in gallerySecrets`);

    for (const secretDoc of secretsSnapshot.docs) {
      const secretData = secretDoc.data();
      const correctPin = secretData?.specialPin;

      // Verifica PIN
      if (correctPin && correctPin.trim() === pin.trim()) {
        const galleryId = secretDoc.id;
        
        // Recupera dati galleria
        const galleryDoc = await db.collection('galleries').doc(galleryId).get();
        
        if (galleryDoc.exists) {
          const galleryData = galleryDoc.data();
          
          // Verifica che sia una galleria speciale
          if (galleryData?.specialTheme) {
            const galleryCode = galleryData.code || galleryId;
            const galleryName = galleryData.name || "Galleria Speciale";

            console.log(`✅ PIN corretto per galleria ${galleryCode}`);
            return res.status(200).json({
              result: { 
                valid: true, 
                galleryId,
                galleryCode,
                galleryName,
                message: "PIN correct" 
              }
            });
          }
        }
      }
    }

    // Nessuna galleria trovata con questo PIN
    console.log("❌ PIN non valido");
    return res.status(200).json({
      result: { valid: false, message: "Invalid PIN" }
    });
  } catch (error) {
    console.error("❌ Errore verify-special-pin:", error);
    res.status(500).json({
      error: { code: "internal", message: "Failed to verify PIN" }
    });
  }
});

/**
 * POST /api/email/check-pin-unique
 * Verifica se un PIN è già in uso da un'altra galleria speciale
 * SICURO: usa Firebase Admin SDK per query gallerySecrets
 */
router.post("/check-pin-unique", async (req, res) => {
  try {
    const { pin, currentGalleryId } = req.body;

    if (!pin) {
      return res.status(400).json({
        error: { code: "invalid-argument", message: "Missing PIN" }
      });
    }

    console.log(`🔍 Verifica unicità PIN per galleria: ${currentGalleryId}`);

    // Inizializza Firebase Admin


    // Query tutti i gallerySecrets con specialPin
    const secretsSnapshot = await db.collection('gallerySecrets').get();

    for (const secretDoc of secretsSnapshot.docs) {
      const galleryId = secretDoc.id;
      const secretData = secretDoc.data();

      // Skip la galleria corrente (permetti di salvare lo stesso PIN sulla stessa galleria)
      if (galleryId === currentGalleryId) {
        continue;
      }

      // Verifica se questo PIN è già usato
      if (secretData?.specialPin && secretData.specialPin.trim() === pin.trim()) {
        // PIN duplicato trovato - recupera info galleria
        const galleryDoc = await db.collection('galleries').doc(galleryId).get();
        const galleryData = galleryDoc.exists ? galleryDoc.data() : {};

        console.log(`❌ PIN duplicato trovato in galleria: ${galleryData?.code || galleryId}`);

        return res.status(200).json({
          unique: false,
          usedByGallery: galleryData?.code || galleryId,
          usedByGalleryName: galleryData?.name || 'Galleria Sconosciuta'
        });
      }
    }

    console.log('✅ PIN unico, nessun duplicato trovato');
    return res.status(200).json({
      unique: true
    });

  } catch (error) {
    console.error("❌ Errore check-pin-unique:", error);
    res.status(500).json({
      error: { code: "internal", message: "Failed to check PIN uniqueness" }
    });
  }
});

/**
 * POST /api/email/verify-gallery-password
 * Verifica password galleria SERVER-SIDE senza esporla al client
 * SICURO: legge password da collection protetta `gallerySecrets` tramite Admin SDK
 */
router.post("/verify-gallery-password", async (req, res) => {
  try {
    const { galleryId, password } = req.body;

    // Validazione parametri
    if (!galleryId || !password) {
      return res.status(400).json({
        error: { code: "invalid-argument", message: "Missing galleryId or password" }
      });
    }

    // VERIFICA ESISTENZA GALLERIA usando Admin SDK
    const galleryDoc = await db.collection('galleries').doc(galleryId).get();
    if (!galleryDoc.exists) {
      console.log(`❌ Galleria ${galleryId} non trovata`);
      return res.status(404).json({
        error: { code: "not-found", message: "Gallery not found" }
      });
    }

    // RECUPERA PASSWORD da collection protetta `gallerySecrets` tramite Admin SDK
    const secretDoc = await db.collection('gallerySecrets').doc(galleryId).get();
    const secretData = secretDoc.exists ? secretDoc.data() : null;

    // Se non esiste documento secrets O non ha password, verifica anche vecchio campo password su galleria
    const correctPassword = secretData?.password;
    
    // BACKWARD COMPATIBILITY: se non c'è in gallerySecrets, prova il vecchio campo password nella galleria
    const galleryData = galleryDoc.data();
    const legacyPassword = galleryData?.password;
    
    const passwordToCheck = correctPassword || legacyPassword;
    
    if (!passwordToCheck) {
      console.log(`✅ Galleria ${galleryId} senza password, accesso libero`);
      return res.status(200).json({
        result: { valid: true, message: "Gallery has no password, access granted" }
      });
    }

    // Verifica password (case-sensitive)
    const isValid = password.trim() === String(passwordToCheck).trim();

    if (isValid) {
      console.log(`✅ Password corretta per galleria ${galleryId}`);
      return res.status(200).json({
        result: { valid: true, message: "Password correct" }
      });
    } else {
      console.log(`❌ Password errata per galleria ${galleryId}`);
      return res.status(200).json({
        result: { valid: false, message: "Password incorrect" }
      });
    }
  } catch (error) {
    console.error("❌ Errore verify-gallery-password:", error);
    res.status(500).json({
      error: { code: "internal", message: "Failed to verify password" }
    });
  }
});

/**
 * POST /api/email/shooting-completed
 * Invia email "Shooting Completato" quando admin cambia stato a "shooting_svolto"
 */
router.post("/shooting-completed", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteName,
      campaignName,
      bookingDate
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteName || !campaignName || !bookingDate) {
      return res.status(400).json({
        error: "Parametri mancanti per email shooting completato"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createShootingCompletedEmailHTML(
      clienteName,
      campaignName,
      bookingDate,
      studioInfo
    );

    const subject = `Shooting Completato - ${campaignName}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Shooting Completato" inviata a ${recipientEmail}`
    );

    res.status(200).json({
      success: true,
      message: "Shooting completed email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore shooting-completed email:", error);
    res.status(500).json({
      error: "Errore invio email shooting completato"
    });
  }
});

/**
 * POST /api/email/order-processing
 * Invia email "Ordine in Lavorazione" quando admin cambia stato a "inizio_lavorazione"
 */
router.post("/order-processing", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteName,
      prodottoNome
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteName || !prodottoNome) {
      return res.status(400).json({
        error: "Parametri mancanti per email ordine in lavorazione"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createOrderProcessingEmailHTML(
      clienteName,
      prodottoNome,
      studioInfo
    );

    const subject = `Il tuo ordine è in lavorazione - ${prodottoNome}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Ordine in Lavorazione" inviata a ${recipientEmail} per ${prodottoNome}`
    );

    res.status(200).json({
      success: true,
      message: "Order processing email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore order-processing email:", error);
    res.status(500).json({
      error: "Errore invio email ordine in lavorazione"
    });
  }
});

/**
 * POST /api/email/order-ready
 * Invia email "Ordine Pronto per Consegna" quando admin cambia stato a "pronto_consegna"
 */
router.post("/order-ready", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteName,
      prodottoNome
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteName || !prodottoNome) {
      return res.status(400).json({
        error: "Parametri mancanti per email ordine pronto"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createOrderReadyEmailHTML(
      clienteName,
      prodottoNome,
      studioInfo
    );

    const subject = `Il tuo ordine è pronto - ${prodottoNome}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Ordine Pronto" inviata a ${recipientEmail} per ${prodottoNome}`
    );

    res.status(200).json({
      success: true,
      message: "Order ready email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore order-ready email:", error);
    res.status(500).json({
      error: "Errore invio email ordine pronto"
    });
  }
});

/**
 * Template HTML per email shooting completato
 */
function createShootingCompletedEmailHTML(
  clienteName: string,
  campaignName: string,
  bookingDate: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">Shooting Completato! 📸</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Grazie per aver partecipato al nostro shooting <strong style="color: #8b5a3c;">${campaignName}</strong> 
          del ${bookingDate}. È stato un piacere fotografarti! 🎉
        </p>

        <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #1b5e20;">
            <strong>✨ Prossimi Passi</strong><br>
            Le tue foto saranno elaborate nei prossimi giorni. Riceverai una notifica via email 
            non appena la galleria sarà pronta per la visualizzazione e selezione.
          </p>
        </div>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #e0e0e0;">
          <p style="margin: 0; font-size: 14px; color: #666;">
            <strong style="color: #333;">💡 Lo sapevi?</strong><br>
            Ogni foto viene curata con attenzione per garantire il miglior risultato possibile. 
            Ti contatteremo presto per mostrarti il lavoro finale!
          </p>
        </div>

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
          Per qualsiasi domanda, siamo sempre disponibili! 😊
        </p>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email ordine in lavorazione
 */
function createOrderProcessingEmailHTML(
  clienteName: string,
  prodottoNome: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #ff9800; text-align: center;">Il tuo ordine è in lavorazione! 🎨</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Siamo entusiasti di comunicarti che abbiamo iniziato a lavorare al tuo ordine 
          <strong style="color: #8b5a3c;">${prodottoNome}</strong>! 🚀
        </p>

        <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #e65100;">
            <strong>🎯 Stato Attuale: In Lavorazione</strong><br>
            Il tuo progetto è nelle nostre mani esperte. Stiamo curando ogni dettaglio 
            per garantire un risultato eccellente che supererà le tue aspettative.
          </p>
        </div>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #e0e0e0;">
          <h4 style="color: #8b5a3c; margin-top: 0;">⏱️ Tempi di Consegna</h4>
          <p style="margin: 0; font-size: 14px; color: #666;">
            Riceverai una notifica non appena il tuo ordine sarà completato e pronto per il ritiro. 
            La cura nei dettagli richiede tempo, ma il risultato ne varrà la pena!
          </p>
        </div>

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
          Hai domande? Contattaci in qualsiasi momento! 📞
        </p>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email ordine pronto per consegna
 */
function createOrderReadyEmailHTML(
  clienteName: string,
  prodottoNome: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #4caf50; text-align: center;">Il tuo ordine è pronto</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 18px; margin-bottom: 20px; font-weight: 600; color: #4caf50;">
          Fantastica notizia!
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Il tuo ordine <strong style="color: #8b5a3c;">${prodottoNome}</strong> è stato completato 
          ed è pronto per il ritiro! Non vediamo l'ora di mostrartelo!
        </p>

        <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #1b5e20;">
            <strong>Ordine Completato</strong><br>
            Abbiamo curato ogni dettaglio per garantire che il risultato finale sia esattamente 
            come lo immaginavi. Il tuo lavoro ti sta aspettando!
          </p>
        </div>

        <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border: 2px solid #4caf50;">
          <h4 style="color: #4caf50; margin-top: 0; text-align: center;">Come Ritirare il tuo Ordine</h4>
          <p style="margin: 10px 0; font-size: 14px; color: #333; text-align: center;">
            <strong>Contattaci per concordare l'orario di ritiro:</strong>
          </p>
          <div style="text-align: center; margin: 15px 0;">
            <a href="tel:${studio.phone.replace(/\s/g, '')}" 
               style="display: inline-block; background: #4caf50; color: white; padding: 12px 25px; 
                      text-decoration: none; border-radius: 5px; font-weight: bold; margin: 5px;">
              ${studio.phone}
            </a>
            <a href="mailto:${studio.email}" 
               style="display: inline-block; background: #8b5a3c; color: white; padding: 12px 25px; 
                      text-decoration: none; border-radius: 5px; font-weight: bold; margin: 5px;">
              Email
            </a>
          </div>
        </div>

        <div style="background: #fff9c4; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 13px; color: #f57f17; text-align: center;">
            <strong>Suggerimento:</strong> Contattaci in anticipo per evitare attese e garantire 
            la disponibilità del nostro staff per mostrarti il lavoro nel dettaglio!
          </p>
        </div>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email Consulenza Ricevuta
 */
export function createConsultationReceivedEmailHTML(
  clienteName: string,
  jobType: string,
  consultationDate: string,
  consultationTime: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio", 
    email: "info@imagestudiofotografico.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">Richiesta Consulenza Ricevuta!</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Grazie per aver richiesto una consulenza pre-lavoro! Abbiamo ricevuto la tua richiesta per <strong style="color: #8b5a3c;">${jobType}</strong>.
        </p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">📋 Dettagli Richiesta</h3>
          <p style="margin: 8px 0;"><strong>📅 Data preferita:</strong> ${consultationDate}</p>
          <p style="margin: 8px 0;"><strong>🕐 Orario preferito:</strong> ${consultationTime}</p>
          <p style="margin: 8px 0;"><strong>📸 Tipo servizio:</strong> ${jobType}</p>
        </div>

        <div style="background: #fff9c4; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 13px; color: #f57f17; text-align: center;">
            <strong>In attesa di conferma:</strong> Riceverai una email di conferma non appena il nostro team avrà verificato la disponibilità.
          </p>
        </div>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email Consulenza Approvata
 */
export function createConsultationApprovedEmailHTML(
  clienteName: string,
  jobType: string,
  consultationDate: string,
  consultationTime: string,
  meetingLink: string | null,
  studioInfo?: { name: string; email: string; phone: string; address: string },
  calendarLink?: string
): string {
  const studio = studioInfo || { 
    name: "Image Studio", 
    email: "info@imagestudiofotografico.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #28a745; text-align: center;">✅ Consulenza Confermata!</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Ottima notizia! La tua consulenza per <strong style="color: #8b5a3c;">${jobType}</strong> 
          è stata <strong style="color: #28a745;">confermata</strong>! 🎉
        </p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">📋 Riepilogo Consulenza</h3>
          <p style="margin: 8px 0;"><strong>📅 Data:</strong> ${consultationDate}</p>
          <p style="margin: 8px 0;"><strong>🕐 Orario:</strong> ${consultationTime}</p>
          <p style="margin: 8px 0;"><strong>📸 Tipo servizio:</strong> ${jobType}</p>
        </div>

        ${meetingLink ? `
        <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;">
          <h4 style="color: #0056b3; margin-top: 0; margin-bottom: 10px;">🔗 Link Incontro</h4>
          <a href="${meetingLink}" style="display: inline-block; background: #0056b3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">
            Unisciti alla consulenza
          </a>
        </div>
        ` : ''}

        ${calendarLink ? `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${calendarLink}" style="display: inline-block; background: #8b5a3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            📅 Aggiungi al Calendario
          </a>
        </div>
        ` : ''}

        <div style="background: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h4 style="color: #155724; margin-top: 0; margin-bottom: 10px;">💡 Cosa Aspettarsi</h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #333;">
            <li>Discussione delle tue esigenze fotografiche</li>
            <li>Presentazione dei nostri servizi e pacchetti</li>
            <li>Chiarimento di eventuali dubbi</li>
            <li>Pianificazione dei prossimi passi</li>
          </ul>
        </div>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email Consulenza Rifiutata
 */
export function createConsultationRejectedEmailHTML(
  clienteName: string,
  jobType: string,
  consultationDate: string,
  consultationTime: string,
  rejectionReason: string | null,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio", 
    email: "info@imagestudiofotografico.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc3545; text-align: center;">Aggiornamento Consulenza</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Ci dispiace informarti che non siamo riusciti a confermare la consulenza per <strong>${jobType}</strong> nella data richiesta (${consultationDate} alle ${consultationTime}).
        </p>

        ${rejectionReason ? `
        <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #721c24;">
            <strong>Motivo:</strong> ${rejectionReason}
          </p>
        </div>
        ` : ''}

        <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #0056b3; text-align: center;">
            Se desideri riprogrammare, contattaci direttamente.
          </p>
        </div>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email Reminder Consulenza (24h prima)
 * Palette October Mist: sage #8b9a7d, terracotta #c17f59, cream #f5f0e8, blue-gray #6b7d8a
 */
export function createConsultationReminderEmailHTML(
  clienteName: string,
  jobType: string,
  consultationDate: string,
  consultationTime: string,
  studioInfo?: { name: string; email: string; phone: string; address: string },
  calendarLink?: string
): string {
  const studio = studioInfo || { 
    name: "Image Studio", 
    email: "info@imagestudiofotografico.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #faf8f5;">
      <div style="background: linear-gradient(135deg, #8b9a7d 0%, #a8c5b5 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 26px; font-weight: 600;">Promemoria Consulenza</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Il tuo appuntamento è domani</p>
      </div>
      
      <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.08);">
        <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        
        <div style="background: #f5f0e8; border-left: 4px solid #c17f59; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
          <h3 style="color: #c17f59; margin: 0 0 10px 0; font-size: 18px;">Consulenza tra 24 ore</h3>
          <p style="color: #555; margin: 0; font-size: 14px; line-height: 1.5;">
            Ti ricordiamo che <strong>domani</strong> hai la consulenza per <strong style="color: #8b9a7d;">${jobType}</strong>.
          </p>
        </div>

        <div style="background: #faf8f5; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #e8e4de;">
          <h3 style="color: #6b7d8a; margin: 0 0 15px 0; font-size: 18px;">Dettagli Appuntamento</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7d8a; font-size: 14px; width: 30%;">Data:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${consultationDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7d8a; font-size: 14px;">Orario:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${consultationTime}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7d8a; font-size: 14px;">Servizio:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${jobType}</td>
            </tr>
            ${studio.address ? `
            <tr>
              <td style="padding: 8px 0; color: #6b7d8a; font-size: 14px;">Luogo:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${studio.address}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        ${calendarLink ? `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${calendarLink}" style="display: inline-block; background: #8b9a7d; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Aggiungi al Calendario
          </a>
        </div>
        ` : ''}

        <div style="background: #f0f5f2; padding: 15px 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #d4e0d8;">
          <h4 style="color: #6b7d8a; margin: 0 0 12px 0; font-size: 15px;">Suggerimenti</h4>
          <ul style="margin: 0; padding-left: 20px; color: #555; font-size: 14px; line-height: 1.8;">
            <li>Prepara eventuali domande o richieste specifiche</li>
            <li>Se hai foto di riferimento, portale con te</li>
            <li>Arriva qualche minuto in anticipo</li>
            <li>In caso di impedimento, contattaci il prima possibile</li>
          </ul>
        </div>

        <div style="background: #f5f0e8; padding: 15px 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
          <p style="margin: 0; font-size: 14px; color: #555;">
            <strong>Hai bisogno di modificare l'appuntamento?</strong><br>
            Chiamaci al ${studio.phone} o rispondi a questa email
          </p>
        </div>
      </div>

      <div style="text-align: center; color: #6b7d8a; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e8e4de;">
        <p style="margin: 5px 0; font-weight: 600; color: #555;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email Consulenza Cancellata
 */
export function createConsultationCancelledEmailHTML(
  clienteName: string,
  jobType: string,
  consultationDate: string,
  consultationTime: string,
  cancellationReason: string | null,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio", 
    email: "info@imagestudiofotografico.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc3545; text-align: center;">Consulenza Cancellata</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Ti informiamo che la consulenza per <strong>${jobType}</strong> prevista il ${consultationDate} alle ${consultationTime} è stata cancellata.
        </p>

        ${cancellationReason ? `
        <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #721c24;">
            <strong>Motivo:</strong> ${cancellationReason}
          </p>
        </div>
        ` : ''}

        <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #0056b3; text-align: center;">
            Se desideri riprogrammare, contattaci direttamente.
          </p>
        </div>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email notifica evento calendario creato
 * ESPORTATA per uso in calendar-routes.ts
 */
export function createCalendarEventEmailHTML(
  clienteName: string,
  eventTitle: string,
  eventDate: string,
  eventTime: string,
  eventEndTime: string,
  eventLocation?: string,
  eventDescription?: string,
  studioInfo?: { name: string; email: string; phone: string; address: string },
  calendarLink?: string
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">📅 Nuovo Evento in Calendario</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Hai un nuovo appuntamento confermato con <strong>${studio.name}</strong>.
        </p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">📋 Dettagli Appuntamento</h3>
          <p style="margin: 8px 0;"><strong>📝 Titolo:</strong> ${eventTitle}</p>
          <p style="margin: 8px 0;"><strong>📅 Data:</strong> ${eventDate}</p>
          <p style="margin: 8px 0;"><strong>🕐 Orario:</strong> ${eventTime}${eventEndTime ? ` - ${eventEndTime}` : ''}</p>
          ${eventLocation ? `<p style="margin: 8px 0;"><strong>📍 Luogo:</strong> ${eventLocation}</p>` : ''}
          ${eventDescription ? `<p style="margin: 8px 0;"><strong>📝 Note:</strong> ${eventDescription}</p>` : ''}
        </div>

        <div style="background: #d1ecf1; border-left: 4px solid #0c5460; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #0c5460;">
            <strong>✅ Appuntamento Confermato</strong><br>
            Segna questo appuntamento sul tuo calendario personale. Ti aspettiamo!
          </p>
        </div>

        <p style="font-size: 14px; color: #666; margin-top: 20px;">
          Se hai bisogno di modificare o annullare l'appuntamento, contattaci via WhatsApp o email.
        </p>
      </div>

      ${calendarLink ? `
      <div style="text-align: center; margin: 30px 0; padding: 20px; background: #f9f7f4; border-radius: 12px;">
        <p style="font-size: 16px; color: #333; margin-bottom: 8px; font-weight: 600;">
          📅 Non dimenticare l'appuntamento!
        </p>
        <p style="font-size: 14px; color: #666; margin-bottom: 18px; line-height: 1.5;">
          Salvalo nel tuo calendario con un click.
        </p>
        <a href="${calendarLink}" 
           style="display: inline-block; background: #8b5a3c; color: white; padding: 15px 30px; 
                  text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
          📅 Aggiungi al Calendario
        </a>
        <p style="font-size: 12px; color: #888; margin-top: 12px;">
          Compatibile con Google Calendar, Outlook, Apple Calendar
        </p>
      </div>
      ` : ''}

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email contratto firmato (Modulo di Prenotazione)
 * ESPORTATA per uso in quote management
 */
export function createQuoteSignedEmailHTML(
  clienteName: string,
  quoteType: string,
  jobName: string,
  totaleSelezionato: number,
  signatureDate: Date,
  portalLink: string,
  nextPayment?: { importo: number; dataScadenza: Date; descrizione: string },
  payments?: Array<{ importo: number; dataScadenza: Date; descrizione: string }>,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio", 
    email: "info@imagestudiofotografico.com",
    phone: "+39 334 7103142",
    address: ""
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('it-IT', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #0d6efd; text-align: center;">✅ Contratto Firmato con Successo</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Il tuo preventivo per <strong style="color: #0d6efd;">${jobName}</strong> è stato firmato con successo! 
          Grazie per la tua fiducia. 🎉
        </p>

        <div style="background: #cfe2ff; border-left: 4px solid #0d6efd; padding: 15px; margin: 20px 0;">
          <h3 style="color: #084298; margin-top: 0; margin-bottom: 15px;">📋 Riepilogo Contratto</h3>
          <table style="width: 100%; font-size: 14px; color: #333; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #b6d4fe;">
              <td style="padding: 8px 0;">Tipo preventivo:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold;">${quoteType === 'fisso' ? 'Pacchetto Fisso' : 'A Consumo'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #b6d4fe;">
              <td style="padding: 8px 0;">Totale selezionato:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold; font-size: 18px; color: #0d6efd;">${formatCurrency(totaleSelezionato)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">Data firma:</td>
              <td style="padding: 8px 0; text-align: right;">${formatDate(signatureDate)}</td>
            </tr>
          </table>
        </div>

        ${nextPayment ? `
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <h4 style="color: #856404; margin-top: 0; margin-bottom: 10px;">💰 Prossima Scadenza</h4>
          <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #856404;">
            ${nextPayment.descrizione}: ${formatCurrency(nextPayment.importo)}
          </p>
          <p style="margin: 0; font-size: 14px; color: #856404;">
            Scadenza: ${formatDate(nextPayment.dataScadenza)}
          </p>
        </div>
        ` : ''}

        ${payments && payments.length > 0 ? `
        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #e0e0e0;">
          <h4 style="color: #333; margin-top: 0; margin-bottom: 15px;">📅 Piano Pagamenti</h4>
          <table style="width: 100%; font-size: 13px; color: #333; border-collapse: collapse;">
            <thead>
              <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                <th style="padding: 10px; text-align: left;">Descrizione</th>
                <th style="padding: 10px; text-align: right;">Importo</th>
                <th style="padding: 10px; text-align: right;">Scadenza</th>
              </tr>
            </thead>
            <tbody>
              ${payments.map((p, i) => `
                <tr style="border-bottom: 1px solid #e0e0e0;">
                  <td style="padding: 10px;">${p.descrizione}</td>
                  <td style="padding: 10px; text-align: right; font-weight: bold;">${formatCurrency(p.importo)}</td>
                  <td style="padding: 10px; text-align: right;">${formatDate(p.dataScadenza)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        <div style="text-align: center; margin: 25px 0;">
          <a href="${portalLink}" style="display: inline-block; background-color: #0d6efd; color: white; padding: 14px 35px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
            🔗 Visualizza Contratto e Pagamenti
          </a>
        </div>

        <div style="background: #d1ecf1; border-left: 4px solid #0dcaf0; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #055160;">
            <strong>💡 Portale Cliente</strong><br>
            Puoi visualizzare il contratto firmato, lo stato dei pagamenti e tutti i dettagli del tuo servizio 
            accedendo al portale tramite il link qui sopra. Salvalo tra i preferiti!
          </p>
        </div>

        <p style="font-size: 16px; margin-top: 20px;">
          A presto! ❤️
        </p>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">WhatsApp: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email promemoria pagamento
 * Inviata al cliente X giorni prima della scadenza
 * ESPORTATA per uso in quote-routes.ts e payment-schedule-routes.ts
 */
export function createPaymentReminderEmailHTML(
  clienteName: string,
  nomeEvento: string,
  paymentAmount: number,
  paymentDueDate: string,
  paymentType: string,
  daysUntilDue: number,
  isOverdue: boolean,
  portalUrl?: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  // Urgency colors: red (overdue), orange (<=7 days), sage (normal)
  const urgencyColor = isOverdue ? '#dc3545' : daysUntilDue <= 7 ? '#ff8c42' : '#8b9a8e';
  const urgencyGradient = isOverdue 
    ? 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)' 
    : daysUntilDue <= 7 
      ? 'linear-gradient(135deg, #ff8c42 0%, #ffa726 100%)'
      : 'linear-gradient(135deg, #8b9a8e 0%, #a8b5a8 100%)';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">

      <!-- Hero Header - Dynamic Urgency -->
      <div style="background: ${urgencyGradient}; padding: 50px 30px; text-align: center;">
        <div style="background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 30px;">
          <h1 style="color: #ffffff; font-size: 32px; font-weight: 300; margin: 0 0 15px 0; letter-spacing: 2px; text-transform: uppercase;">
            ${isOverdue ? 'Pagamento Scaduto' : 'Promemoria Pagamento'}
          </h1>
          <div style="width: 60px; height: 2px; background: rgba(255,255,255,0.6); margin: 0 auto 20px auto;"></div>
          <p style="color: rgba(255,255,255,0.95); font-size: 18px; margin: 0; font-weight: 300; line-height: 1.6;">
            ${isOverdue 
              ? 'Il pagamento ha superato la scadenza prevista' 
              : daysUntilDue <= 7 
                ? `Mancano ${daysUntilDue} giorni alla scadenza` 
                : 'Promemoria gentile per pagamento in programma'
            }
          </p>
        </div>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 30px;">

        <!-- Greeting -->
        <p style="font-size: 18px; color: #333333; line-height: 1.8; margin-bottom: 25px;">
          Gentile <strong style="color: #8b5a3c;">${clienteName}</strong>,
        </p>

        <p style="font-size: 16px; color: #666666; line-height: 1.8; margin-bottom: 35px;">
          ${isOverdue 
            ? `Ti ricordiamo che è scaduto un pagamento relativo a <strong style="color: #8b5a3c;">${nomeEvento}</strong>. Ti chiediamo cortesemente di regolarizzare al più presto.`
            : `Con la presente ti ricordiamo un pagamento ${daysUntilDue <= 7 ? 'in imminente scadenza' : 'programmato'} per <strong style="color: #8b5a3c;">${nomeEvento}</strong>.`
          }
        </p>

        <!-- Payment Details Card -->
        <div style="background: linear-gradient(to right, #f9f7f4, #ffffff); border: 2px solid #e8d5c4; border-left: 4px solid ${urgencyColor}; border-radius: 12px; padding: 30px; margin: 35px 0; box-shadow: 0 4px 12px rgba(139, 90, 60, 0.08);">
          <div style="text-align: center; margin-bottom: 25px;">
            <div style="display: inline-block; background: ${urgencyColor}; color: white; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
              Dettagli Pagamento
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
            <tr>
              <td style="padding: 15px 0; border-bottom: 1px solid #e8d5c4; color: #666;">
                <span style="font-weight: 600;">Tipo Pagamento</span>
              </td>
              <td style="padding: 15px 0; border-bottom: 1px solid #e8d5c4; text-align: right; color: #333; font-weight: 500;">
                ${paymentType}
              </td>
            </tr>
            <tr>
              <td style="padding: 15px 0; border-bottom: 1px solid #e8d5c4; color: #666;">
                <span style="font-weight: 600;">Importo Dovuto</span>
              </td>
              <td style="padding: 15px 0; border-bottom: 1px solid #e8d5c4; text-align: right; color: ${urgencyColor}; font-weight: 700; font-size: 20px;">
                ${formatCurrency(paymentAmount)}
              </td>
            </tr>
            <tr>
              <td style="padding: 15px 0; border-bottom: 1px solid #e8d5c4; color: #666;">
                <span style="font-weight: 600;">Data Scadenza</span>
              </td>
              <td style="padding: 15px 0; border-bottom: 1px solid #e8d5c4; text-align: right; color: #333; font-weight: 600;">
                ${paymentDueDate}
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 0 5px 0; color: #666;">
                <span style="font-weight: 600;">${isOverdue ? 'Giorni di Ritardo' : 'Giorni Rimanenti'}</span>
              </td>
              <td style="padding: 20px 0 5px 0; text-align: right; color: ${urgencyColor}; font-weight: 700; font-size: 22px;">
                ${Math.abs(daysUntilDue)}
              </td>
            </tr>
          </table>
        </div>

        ${portalUrl ? `
        <!-- CTA Button -->
        <div style="text-align: center; margin: 40px 0;">
          <a href="${portalUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #8b5a3c 0%, #c9a961 100%); 
                    color: white; padding: 16px 40px; text-decoration: none; border-radius: 50px; 
                    font-weight: 600; font-size: 15px; letter-spacing: 0.5px; text-transform: uppercase;
                    box-shadow: 0 4px 15px rgba(139, 90, 60, 0.3);">
            Visualizza Dettagli Pagamento
          </a>
        </div>
        ` : ''}

        <!-- Info Box -->
        <div style="background: #f5f8f5; border-radius: 8px; padding: 25px; margin: 35px 0;">
          <h4 style="color: #8b9a8e; font-size: 14px; font-weight: 700; margin: 0 0 15px 0; letter-spacing: 1px; text-transform: uppercase;">
            ${isOverdue ? 'Cosa Fare Ora' : 'Come Procedere'}
          </h4>

          <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.8;">
            ${isOverdue 
              ? 'Se hai già effettuato il pagamento, ti preghiamo di inviarci la ricevuta via email per conferma. In caso contrario, ti chiediamo gentilmente di provvedere al più presto per evitare eventuali ritardi nella lavorazione.'
              : 'Per effettuare il pagamento o per qualsiasi chiarimento riguardo alle modalità, siamo a tua completa disposizione. Puoi contattarci via email o telefono.'
            }
          </p>
        </div>

        <!-- Closing Message -->
        <div style="text-align: center; margin: 40px 0 30px 0; padding: 25px; border-top: 1px solid #e8d5c4; border-bottom: 1px solid #e8d5c4;">
          <p style="font-size: 16px; color: #8b5a3c; font-style: italic; line-height: 1.8; margin: 0;">
            ${isOverdue 
              ? 'Grazie per la tua comprensione e collaborazione' 
              : 'Grazie per la tua puntualità e collaborazione'
            }
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div style="background: #f9f7f4; padding: 30px; text-align: center; border-top: 3px solid #c9a961;">
        <p style="margin: 0 0 8px 0; font-weight: 700; font-size: 15px; color: #8b5a3c; letter-spacing: 1px;">
          ${studio.name}
        </p>
        ${studio.address ? `<p style="margin: 0 0 5px 0; font-size: 13px; color: #999;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0; font-size: 13px; color: #666;">
          <a href="mailto:${studio.email}" style="color: #8b5a3c; text-decoration: none;">${studio.email}</a>
        </p>
        <p style="margin: 5px 0; font-size: 13px; color: #666;">${studio.phone}</p>
      </div>
    </div>
  `;
}

function createAdminQuoteSignedNotificationHTML(
  clienteName: string,
  quoteType: 'fisso' | 'variabile',
  nomeEvento: string,
  totalAmount: number,
  signatureDate: Date,
  quoteUrl: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || {
    name: "Image Studio",
    email: "info@imagestudiofotografico.com",
    phone: "+39 334 7103142",
    address: ""
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatDate = (date: Date) =>
    date.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2e7d32; text-align: center;">🎉 Nuovo Contratto Firmato!</h2>
      <div style="background: #f1f8e9; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #2e7d32;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Il cliente <strong>${clienteName}</strong> ha firmato il preventivo per <strong style="color: #2e7d32;">${nomeEvento}</strong>.
        </p>
        <table style="width: 100%; font-size: 14px; color: #333; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #c8e6c9;">
            <td style="padding: 8px 0;">Cliente:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${clienteName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #c8e6c9;">
            <td style="padding: 8px 0;">Evento:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${nomeEvento}</td>
          </tr>
          <tr style="border-bottom: 1px solid #c8e6c9;">
            <td style="padding: 8px 0;">Tipo preventivo:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${quoteType === 'fisso' ? 'Pacchetto Fisso' : 'A Consumo'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #c8e6c9;">
            <td style="padding: 8px 0;">Totale:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; font-size: 18px; color: #2e7d32;">${formatCurrency(totalAmount)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">Data firma:</td>
            <td style="padding: 8px 0; text-align: right;">${formatDate(signatureDate)}</td>
          </tr>
        </table>
      </div>
      ${quoteUrl && quoteUrl !== '#' ? `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${quoteUrl}" style="display: inline-block; background: #2e7d32; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Visualizza Preventivo
          </a>
        </div>
      ` : ''}
      <div style="background: #f9f7f4; padding: 20px; text-align: center; border-top: 3px solid #c9a961; border-radius: 0 0 10px 10px;">
        <p style="margin: 0 0 8px 0; font-weight: 700; font-size: 15px; color: #8b5a3c;">${studio.name}</p>
        <p style="margin: 5px 0; font-size: 13px; color: #666;">${studio.email}</p>
      </div>
    </div>
  `;
}

function createAccontoCancelledEmailHTML(
  clienteName: string,
  prodottoNome: string,
  accontoImporto: number,
  nuovoAccontoTotale: number,
  nuovoSaldo: number,
  motivo: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || {
    name: "Image Studio",
    email: "info@imagestudiofotografico.com",
    phone: "+39 334 7103142",
    address: ""
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #e65100; text-align: center;">⚠️ Acconto Annullato</h2>
      <div style="background: #fff3e0; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #e65100;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 15px; margin-bottom: 15px;">
          Ti informiamo che un acconto di <strong style="color: #e65100;">${formatCurrency(accontoImporto)}</strong>
          relativo a <strong>${prodottoNome}</strong> è stato annullato.
        </p>
        ${motivo ? `<p style="font-size: 14px; color: #666; margin-bottom: 15px;"><em>Motivo: ${motivo}</em></p>` : ''}
        <table style="width: 100%; font-size: 14px; color: #333; border-collapse: collapse; margin-top: 10px;">
          <tr style="border-bottom: 1px solid #ffe0b2;">
            <td style="padding: 8px 0;">Acconto annullato:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #e65100;">${formatCurrency(accontoImporto)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ffe0b2;">
            <td style="padding: 8px 0;">Totale acconti aggiornato:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatCurrency(nuovoAccontoTotale)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">Saldo residuo:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #e65100;">${formatCurrency(nuovoSaldo)}</td>
          </tr>
        </table>
      </div>
      <p style="font-size: 14px; color: #666; text-align: center;">
        Per qualsiasi domanda, non esitare a contattarci.
      </p>
      <div style="background: #f9f7f4; padding: 20px; text-align: center; border-top: 3px solid #c9a961; border-radius: 0 0 10px 10px;">
        <p style="margin: 0 0 8px 0; font-weight: 700; font-size: 15px; color: #8b5a3c;">${studio.name}</p>
        ${studio.phone ? `<p style="margin: 5px 0; font-size: 13px; color: #666;">Tel: ${studio.phone}</p>` : ''}
        <p style="margin: 5px 0; font-size: 13px; color: #666;">${studio.email}</p>
      </div>
    </div>
  `;
}

function createOrderSaldoPendenteEmailHTML(
  clienteName: string,
  prodottoNome: string,
  saldoAmount: number,
  studioInfo?: { name: string; email: string; phone: string; address: string },
  totaleOrdine?: number,
  transactions?: Array<{ importo: number; tipo: string; data: string }>
): string {
  const studio = studioInfo || {
    name: "Image Studio",
    email: "info@imagestudiofotografico.com",
    phone: "+39 334 7103142",
    address: ""
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2e7d32; text-align: center;">✅ Saldo Completato</h2>
      <div style="background: #f1f8e9; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #2e7d32;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 15px; margin-bottom: 15px;">
          Il saldo per <strong>${prodottoNome}</strong> è stato completato con successo!
        </p>
        <table style="width: 100%; font-size: 14px; color: #333; border-collapse: collapse; margin-top: 10px;">
          <tr style="border-bottom: 1px solid #c8e6c9;">
            <td style="padding: 8px 0;">Saldo pagato:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #2e7d32; font-size: 18px;">${formatCurrency(saldoAmount)}</td>
          </tr>
          ${totaleOrdine !== undefined ? `
          <tr style="border-bottom: 1px solid #c8e6c9;">
            <td style="padding: 8px 0;">Totale ordine:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatCurrency(totaleOrdine)}</td>
          </tr>
          ` : ''}
          <tr>
            <td colspan="2" style="padding: 15px 0 0; text-align: center;">
              <span style="color: #2e7d32; font-size: 16px; font-weight: 600;">✓ Pagamento completato</span>
            </td>
          </tr>
        </table>
      </div>
      ${transactions && transactions.length > 0 ? `
        <div style="margin: 20px 0;">
          <h3 style="font-size: 15px; color: #333; margin-bottom: 10px;">Riepilogo Pagamenti</h3>
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            ${transactions.map(t => `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 6px 0; color: #666;">${t.tipo || 'Pagamento'}</td>
                <td style="padding: 6px 0; color: #666;">${t.data || ''}</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">${formatCurrency(t.importo)}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      ` : ''}
      <p style="font-size: 14px; color: #666; text-align: center;">
        Grazie per la tua fiducia!
      </p>
      <div style="background: #f9f7f4; padding: 20px; text-align: center; border-top: 3px solid #c9a961; border-radius: 0 0 10px 10px;">
        <p style="margin: 0 0 8px 0; font-weight: 700; font-size: 15px; color: #8b5a3c;">${studio.name}</p>
        ${studio.phone ? `<p style="margin: 5px 0; font-size: 13px; color: #666;">Tel: ${studio.phone}</p>` : ''}
        <p style="margin: 5px 0; font-size: 13px; color: #666;">${studio.email}</p>
      </div>
    </div>
  `;
}

/**
 * POST /api/email/admin-quote-signed-notification
 *Invia notifica admin quando il cliente firma il preventivo
 */
router.post("/admin-quote-signed-notification", async (req, res) => {
  try {
    const {
      recipientEmail, // Email dell'admin (di solito studioInfo.email)
      clienteName,
      nomeEvento,
      totalAmount,
      signatureDate,
      quoteType,
      quoteUrl
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteName || !nomeEvento || totalAmount === undefined || !signatureDate || !quoteType) {
      return res.status(400).json({
        error: "Missing required fields for admin quote signed notification"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    // Converti signatureDate in Date se è una stringa
    const signedAt = typeof signatureDate === 'string' ? new Date(signatureDate) : signatureDate;

    const htmlContent = createAdminQuoteSignedNotificationHTML(
      clienteName,
      quoteType as 'fisso' | 'variabile',
      nomeEvento,
      totalAmount,
      signedAt,
      quoteUrl || '#',
      studioInfo
    );

    const subject = `Nuovo Contratto Firmato - ${nomeEvento} (${clienteName})`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Admin Quote Signed Notification" inviata a ${recipientEmail} per evento ${nomeEvento}`
    );

    res.status(200).json({
      success: true,
      message: "Admin quote signed notification email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore admin-quote-signed-notification email:", error);
    res.status(500).json({
      error: "Errore invio notifica admin contratto firmato"
    });
  }
});

/**
 * POST /api/email/send-consultation-received
 * Invia email "Consulenza Ricevuta" dopo creazione consulenza
 */
router.post("/send-consultation-received", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteName,
      jobType,
      consultationDate,
      consultationTime
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteName || !jobType || !consultationDate || !consultationTime) {
      return res.status(400).json({
        error: "Parametri mancanti per invio email consulenza ricevuta"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createConsultationReceivedEmailHTML(
      clienteName,
      jobType,
      consultationDate,
      consultationTime,
      studioInfo
    );

    const subject = `Richiesta Consulenza Ricevuta - ${jobType}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Consulenza Ricevuta" inviata a ${recipientEmail} per ${jobType}`
    );

    res.status(200).json({
      success: true,
      message: "Consultation received email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore send-consultation-received:", error);
    res.status(500).json({
      error: "Errore invio email consulenza ricevuta"
    });
  }
});

/**
 * POST /api/email/send-consultation-approved
 * Invia email "Consulenza Approvata" dopo approvazione admin
 */
router.post("/send-consultation-approved", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteName,
      jobType,
      consultationDate,
      consultationTime,
      meetingLink
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteName || !jobType || !consultationDate || !consultationTime) {
      return res.status(400).json({
        error: "Parametri mancanti per invio email consulenza approvata"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createConsultationApprovedEmailHTML(
      clienteName,
      jobType,
      consultationDate,
      consultationTime,
      meetingLink || null,
      studioInfo
    );

    const subject = `Consulenza Confermata - ${jobType}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Consulenza Approvata" inviata a ${recipientEmail} per ${jobType}`
    );

    res.status(200).json({
      success: true,
      message: "Consultation approved email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore send-consultation-approved:", error);
    res.status(500).json({
      error: "Errore invio email consulenza approvata"
    });
  }
});

/**
 * POST /api/email/send-consultation-rejected
 * Invia email "Consulenza Rifiutata" dopo rifiuto admin
 */
router.post("/send-consultation-rejected", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteName,
      jobType,
      consultationDate,
      consultationTime,
      rejectionReason
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteName || !jobType || !consultationDate || !consultationTime) {
      return res.status(400).json({
        error: "Parametri mancanti per invio email consulenza rifiutata"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createConsultationRejectedEmailHTML(
      clienteName,
      jobType,
      consultationDate,
      consultationTime,
      rejectionReason || null,
      studioInfo
    );

    const subject = `Aggiornamento Consulenza - ${jobType}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Consulenza Rifiutata" inviata a ${recipientEmail} per ${jobType}`
    );

    res.status(200).json({
      success: true,
      message: "Consultation rejected email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore send-consultation-rejected:", error);
    res.status(500).json({
      error: "Errore invio email consulenza rifiutata"
    });
  }
});

/**
 * POST /api/email/send-consultation-cancelled
 * Invia email "Consulenza Cancellata" dopo cancellazione admin
 */
router.post("/send-consultation-cancelled", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteName,
      jobType,
      consultationDate,
      consultationTime,
      cancellationReason
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteName || !jobType || !consultationDate || !consultationTime) {
      return res.status(400).json({
        error: "Parametri mancanti per invio email consulenza cancellata"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createConsultationCancelledEmailHTML(
      clienteName,
      jobType,
      consultationDate,
      consultationTime,
      cancellationReason || null,
      studioInfo
    );

    const subject = `Consulenza Cancellata - ${jobType}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Consulenza Cancellata" inviata a ${recipientEmail} per ${jobType}`
    );

    res.status(200).json({
      success: true,
      message: "Consultation cancelled email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore send-consultation-cancelled:", error);
    res.status(500).json({
      error: "Errore invio email consulenza cancellata"
    });
  }
});

/**
 * Template HTML per email preventivo inviato
 * ESPORTATA per uso in quote-routes.ts
 */
export function createQuoteSentEmailHTML(
  clienteName: string,
  quoteType: 'fisso' | 'variabile',
  nomeEvento: string,
  totalAfterDiscount: number,
  quoteUrl: string,
  expiresAt?: Date,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  const expiryText = expiresAt 
    ? `Questo preventivo è valido fino al <strong>${expiresAt.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>.`
    : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">📋 Preventivo Personalizzato</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Abbiamo preparato un preventivo personalizzato per il tuo evento <strong>${nomeEvento}</strong>.
        </p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">💰 Dettagli Preventivo</h3>
          <p style="margin: 8px 0;"><strong>Tipo:</strong> ${quoteType === 'fisso' ? 'Preventivo Fisso' : 'Preventivo Variabile'}</p>
          <p style="margin: 8px 0;"><strong>Totale:</strong> €${totalAfterDiscount.toFixed(2)}</p>
          ${expiryText ? `<p style="margin: 8px 0; color: #666;">${expiryText}</p>` : ''}
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${quoteUrl}" 
             style="display: inline-block; background: #8b5a3c; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            📄 Visualizza Preventivo
          </a>
        </div>

        <div style="background: #d1ecf1; border-left: 4px solid #0c5460; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #0c5460;">
            <strong>✅ Prossimi Passi</strong><br>
            ${quoteType === 'fisso' 
              ? 'Rivedi il preventivo e firmalo online per confermare il servizio.'
              : 'Seleziona i prodotti che desideri e firma il preventivo per procedere.'}
          </p>
        </div>

        <p style="font-size: 14px; color: #666; margin-top: 20px;">
          Per qualsiasi domanda o modifica, non esitare a contattarci.
        </p>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * POST /api/email/collaborator-assignment
 * Invia email notifica al collaboratore quando gli viene assegnato un lavoro
 */
router.post("/collaborator-assignment", async (req, res) => {
  try {
    const {
      collaboratoreEmail,
      collaboratoreNome,
      jobNome,
      jobData,
      ruolo,
      compenso,
      noteAdmin,
      dashboardToken
    } = req.body;

    if (!collaboratoreEmail || !collaboratoreNome || !jobNome) {
      return res.status(400).json({
        error: "Dati mancanti: collaboratoreEmail, collaboratoreNome, jobNome sono obbligatori"
      });
    }

    console.log(`📧 Invio email assegnazione lavoro a ${collaboratoreEmail}...`);

    const studioInfo = await getStudioContactInfo();
    const siteUrl = getSiteBaseUrl(req);
    
    const ruoliLabels: Record<string, string> = {
      fotografo_secondario: 'Fotografo Secondario',
      videomaker: 'Videomaker',
      assistente: 'Assistente',
      photo_editor: 'Photo Editor',
      album_designer: 'Album Designer',
      altro: 'Altro'
    };

    const ruoloLabel = ruoliLabels[ruolo] || ruolo || 'Collaboratore';
    const compensoFormatted = compenso ? `€${compenso.toLocaleString('it-IT')}` : 'Da definire';
    const dataFormatted = jobData || 'Data da confermare';
    
    const dashboardUrl = dashboardToken 
      ? `${siteUrl}/collaboratori/dashboard/${dashboardToken}`
      : null;

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background: #ffffff;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #8b5a3c 0%, #6b4a2c 100%); padding: 30px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
            🎯 Nuovo Lavoro Assegnato
          </h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">
            ${studioInfo.name}
          </p>
        </div>
        
        <!-- Body -->
        <div style="padding: 30px 25px;">
          
          <!-- Saluto -->
          <p style="font-size: 18px; color: #333; margin: 0 0 25px 0;">
            Ciao <strong style="color: #8b5a3c;">${collaboratoreNome}</strong>,
          </p>
          
          <p style="font-size: 16px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
            Ti è stato assegnato un nuovo lavoro. Di seguito trovi tutti i dettagli:
          </p>
          
          <!-- Card Lavoro -->
          <div style="background: #f8f5f2; border-radius: 12px; padding: 25px; margin-bottom: 25px; border-left: 4px solid #8b5a3c;">
            <h2 style="color: #8b5a3c; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">
              📸 ${jobNome}
            </h2>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; width: 120px;">📅 Data:</td>
                <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${dataFormatted}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">👤 Ruolo:</td>
                <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${ruoloLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">💰 Compenso:</td>
                <td style="padding: 8px 0; color: #28a745; font-size: 14px; font-weight: 600;">${compensoFormatted}</td>
              </tr>
              ${noteAdmin ? `
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; vertical-align: top;">📝 Note:</td>
                <td style="padding: 8px 0; color: #333; font-size: 14px;">${noteAdmin}</td>
              </tr>
              ` : ''}
            </table>
          </div>
          
          ${dashboardUrl ? `
          <!-- Call to Action -->
          <div style="background: #e8f4f8; border-radius: 12px; padding: 25px; margin-bottom: 25px; text-align: center;">
            <p style="font-size: 16px; color: #333; margin: 0 0 20px 0;">
              <strong>Accedi alla tua dashboard</strong> per accettare o rifiutare questo lavoro:
            </p>
            
            <a href="${dashboardUrl}" 
               style="display: inline-block; background: linear-gradient(135deg, #8b5a3c 0%, #a06b4c 100%); 
                      color: #ffffff; padding: 16px 40px; text-decoration: none; 
                      border-radius: 8px; font-weight: 600; font-size: 16px;
                      box-shadow: 0 4px 15px rgba(139, 90, 60, 0.3);">
              ▶️ Vai alla Dashboard
            </a>
            
            <p style="font-size: 12px; color: #666; margin: 15px 0 0 0;">
              Link diretto: <a href="${dashboardUrl}" style="color: #8b5a3c;">${dashboardUrl}</a>
            </p>
          </div>
          ` : `
          <!-- Messaggio senza dashboard -->
          <div style="background: #fff3cd; border-radius: 8px; padding: 15px; margin-bottom: 25px;">
            <p style="font-size: 14px; color: #856404; margin: 0;">
              ⚠️ Per accettare o rifiutare questo lavoro, contatta direttamente lo studio.
            </p>
          </div>
          `}
          
          <!-- Info Risposta -->
          <div style="background: #d1ecf1; border-left: 4px solid #0c5460; padding: 15px; margin-bottom: 25px; border-radius: 0 8px 8px 0;">
            <p style="margin: 0; font-size: 14px; color: #0c5460;">
              <strong>📌 Importante:</strong> Rispondi il prima possibile per confermare la tua disponibilità.
            </p>
          </div>
          
          <!-- Firma -->
          <p style="font-size: 14px; color: #666; margin: 25px 0 0 0;">
            Grazie per la collaborazione!<br>
            <strong style="color: #8b5a3c;">${studioInfo.name}</strong>
          </p>
          
        </div>
        
        <!-- Footer -->
        <div style="background: #f5f5f5; padding: 20px 25px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #333;">${studioInfo.name}</p>
          ${studioInfo.address ? `<p style="margin: 0 0 5px 0; font-size: 12px; color: #666;">${studioInfo.address}</p>` : ''}
          <p style="margin: 0 0 5px 0; font-size: 12px; color: #666;">📧 ${studioInfo.email}</p>
          <p style="margin: 0; font-size: 12px; color: #666;">📱 ${studioInfo.phone}</p>
        </div>
        
      </div>
    `;

    await sendGmailEmail(
      collaboratoreEmail,
      `🎯 Nuovo Lavoro Assegnato: ${jobNome} | ${studioInfo.name}`,
      htmlContent
    );

    console.log(`✅ Email assegnazione inviata con successo a ${collaboratoreEmail}`);

    return res.json({
      success: true,
      message: `Email assegnazione inviata a ${collaboratoreEmail}`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("❌ Errore invio email assegnazione:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Errore invio email assegnazione"
    });
  }
});

/**
 * POST /api/email/send-test
 * Invia email di test per verificare funzionamento Gmail API
 */
router.post("/send-test", async (req, res) => {
  try {
    const { recipientEmail } = req.body;
    
    if (!recipientEmail) {
      return res.status(400).json({ error: "recipientEmail richiesto" });
    }
    
    console.log(`📧 Invio email di test a ${recipientEmail}...`);
    
    const studioInfo = await getStudioContactInfo();
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #8b5a3c; text-align: center;">✅ Test Email - Sistema Funzionante!</h2>
        <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <p style="font-size: 16px; margin-bottom: 15px;">
            Questa è un'email di test inviata dal sistema di notifiche di <strong>${studioInfo.name}</strong>.
          </p>
          <p style="font-size: 14px; color: #666;">
            Se stai ricevendo questa email, significa che il sistema di invio email funziona correttamente.
          </p>
          <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #155724;">
              <strong>✅ Connessione Gmail API:</strong> Attiva<br>
              <strong>✅ Invio Email:</strong> Funzionante<br>
              <strong>📅 Data Test:</strong> ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
            </p>
          </div>
        </div>
        <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
          <p style="margin: 5px 0; font-weight: 600;">${studioInfo.name}</p>
          ${studioInfo.address ? `<p style="margin: 5px 0;">${studioInfo.address}</p>` : ''}
          <p style="margin: 5px 0;">Email: ${studioInfo.email}</p>
          <p style="margin: 5px 0;">Tel: ${studioInfo.phone}</p>
        </div>
      </div>
    `;
    
    await sendGmailEmail(
      recipientEmail,
      `✅ Test Email - ${studioInfo.name}`,
      htmlContent
    );
    
    console.log(`✅ Email di test inviata con successo a ${recipientEmail}`);
    
    return res.json({ 
      success: true, 
      message: `Email di test inviata a ${recipientEmail}`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("❌ Errore invio email di test:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Errore invio email di test"
    });
  }
});

/**
 * GET /api/email/test-connection
 * Test Gmail API connection (admin only)
 */
router.get("/test-connection", async (req, res) => {
  try {
    console.log("🔍 Testing Gmail API connection...");
    
    const accessToken = await getAccessToken();
    
    if (accessToken) {
      console.log("✅ Gmail API connection successful");
      return res.json({ 
        success: true, 
        message: "Gmail API connection OK",
        tokenPreview: accessToken.substring(0, 20) + "..."
      });
    } else {
      console.error("❌ Gmail API: No access token");
      return res.status(500).json({ 
        success: false, 
        error: "No access token available" 
      });
    }
  } catch (error: any) {
    console.error("❌ Gmail API test failed:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Connection test failed"
    });
  }
});

/**
 * GET /api/email/logs
 * Recupera storico email inviate (admin only)
 * Query params: limit (default 50), type (optional filter)
 */
router.get("/logs", authenticateFirebase, async (req: any, res) => {
  try {
    const adminEmails = ['gennaro.mazzacane@gmail.com'];
    if (!req.user || !adminEmails.includes(req.user.email)) {
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const type = req.query.type as string;
    const startAfter = req.query.startAfter as string;

    let query = db.collection('emailLogs')
      .orderBy('sentAt', 'desc')
      .limit(limit);

    if (type) {
      query = db.collection('emailLogs')
        .where('type', '==', type)
        .orderBy('sentAt', 'desc')
        .limit(limit);
    }

    const snapshot = await query.get();
    
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      sentAt: doc.data().sentAt?.toDate?.()?.toISOString() || null
    }));

    // Conta totale per statistiche
    const statsSnapshot = await db.collection('emailLogs').count().get();
    const totalCount = statsSnapshot.data().count;

    return res.json({
      success: true,
      logs,
      total: totalCount,
      hasMore: logs.length === limit
    });
  } catch (error: any) {
    console.error("❌ Errore recupero log email:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Errore recupero log email"
    });
  }
});

/**
 * GET /api/email/logs/stats
 * Statistiche email inviate (admin only)
 */
router.get("/logs/stats", authenticateFirebase, async (req: any, res) => {
  try {
    const adminEmails = ['gennaro.mazzacane@gmail.com'];
    if (!req.user || !adminEmails.includes(req.user.email)) {
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }

    // Statistiche ultime 24 ore
    // CRITICAL: Use Luxon for correct timezone handling
    const nowRome = DateTime.now().setZone('Europe/Rome');
    const yesterday = nowRome.minus({ days: 1 }).toJSDate();

    const last24hSnapshot = await db.collection('emailLogs')
      .where('sentAt', '>=', yesterday)
      .count()
      .get();

    // Statistiche ultimi 7 giorni
    const lastWeek = nowRome.minus({ days: 7 }).toJSDate();

    const last7dSnapshot = await db.collection('emailLogs')
      .where('sentAt', '>=', lastWeek)
      .count()
      .get();

    // Statistiche totali
    const totalSnapshot = await db.collection('emailLogs').count().get();

    // Email fallite
    const failedSnapshot = await db.collection('emailLogs')
      .where('status', '==', 'failed')
      .count()
      .get();

    return res.json({
      success: true,
      stats: {
        last24h: last24hSnapshot.data().count,
        last7d: last7dSnapshot.data().count,
        total: totalSnapshot.data().count,
        failed: failedSnapshot.data().count
      }
    });
  } catch (error: any) {
    console.error("❌ Errore recupero statistiche email:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Errore recupero statistiche"
    });
  }
});

/**
 * POST /api/email/admin/migrate-legacy-secrets
 * Migra password e specialPin dalla collection galleries a gallerySecrets
 * Admin only - operazione una tantum
 */
router.post("/admin/migrate-legacy-secrets", authenticateFirebase, async (req: any, res) => {
  try {
    const adminEmails = ['gennaro.mazzacane@gmail.com'];
    if (!req.user || !adminEmails.includes(req.user.email)) {
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }

    console.log('🔄 Inizio migrazione secrets legacy...');

    // Recupera tutte le gallerie
    const galleriesSnapshot = await db.collection('galleries').get();
    
    const results = {
      total: galleriesSnapshot.size,
      withLegacyPassword: 0,
      withLegacyPin: 0,
      migrated: 0,
      alreadyMigrated: 0,
      errors: [] as string[]
    };

    for (const galleryDoc of galleriesSnapshot.docs) {
      const galleryData = galleryDoc.data();
      const galleryId = galleryDoc.id;
      
      // Controlla se ha password o specialPin nel documento principale
      const hasLegacyPassword = galleryData.password && typeof galleryData.password === 'string' && galleryData.password.trim();
      const hasLegacyPin = galleryData.specialPin && typeof galleryData.specialPin === 'string' && galleryData.specialPin.trim();
      
      if (hasLegacyPassword) results.withLegacyPassword++;
      if (hasLegacyPin) results.withLegacyPin++;
      
      if (!hasLegacyPassword && !hasLegacyPin) {
        continue; // Nessun secret legacy, salta
      }

      try {
        // Controlla se esiste già in gallerySecrets
        const secretsRef = db.collection('gallerySecrets').doc(galleryId);
        const secretsDoc = await secretsRef.get();
        
        const existingSecrets = secretsDoc.exists ? secretsDoc.data() : {};
        
        // Prepara i dati da migrare
        const migrateData: any = {
          migratedAt: new Date(),
          migratedFrom: 'galleries'
        };
        
        // Migra password solo se non esiste già in secrets
        if (hasLegacyPassword && !existingSecrets?.password) {
          migrateData.password = galleryData.password.trim();
          console.log(`📋 Migrazione password per galleria ${galleryId} (${galleryData.name})`);
        }
        
        // Migra PIN solo se non esiste già in secrets
        if (hasLegacyPin && !existingSecrets?.specialPin) {
          migrateData.specialPin = galleryData.specialPin.trim();
          console.log(`📋 Migrazione PIN per galleria ${galleryId} (${galleryData.name})`);
        }
        
        // Se c'è qualcosa da migrare, salva in gallerySecrets
        if (migrateData.password || migrateData.specialPin) {
          await secretsRef.set(migrateData, { merge: true });
          
          // Rimuovi i campi legacy dalla galleria principale
          const removeFields: any = {};
          if (hasLegacyPassword) removeFields.password = FieldValue.delete();
          if (hasLegacyPin) removeFields.specialPin = FieldValue.delete();
          
          await db.collection('galleries').doc(galleryId).update(removeFields);
          
          results.migrated++;
          console.log(`✅ Migrazione completata per galleria ${galleryId}`);
        } else {
          results.alreadyMigrated++;
          console.log(`ℹ️ Galleria ${galleryId} già migrata, rimuovo solo campi legacy`);
          
          // Rimuovi comunque i campi legacy se presenti
          const removeFields: any = {};
          if (hasLegacyPassword) removeFields.password = FieldValue.delete();
          if (hasLegacyPin) removeFields.specialPin = FieldValue.delete();
          
          if (Object.keys(removeFields).length > 0) {
            await db.collection('galleries').doc(galleryId).update(removeFields);
          }
        }
        
      } catch (error: any) {
        console.error(`❌ Errore migrazione galleria ${galleryId}:`, error);
        results.errors.push(`${galleryId}: ${error.message}`);
      }
    }

    console.log('✅ Migrazione secrets completata:', results);

    return res.json({
      success: true,
      message: 'Migrazione completata',
      results
    });

  } catch (error: any) {
    console.error("❌ Errore migrazione secrets:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Errore migrazione secrets"
    });
  }
});

/**
 * GET /api/email/admin/check-legacy-secrets
 * Verifica quante gallerie hanno ancora secrets nel formato legacy
 * Admin only - per audit
 */
router.get("/admin/check-legacy-secrets", authenticateFirebase, async (req: any, res) => {
  try {
    const adminEmails = ['gennaro.mazzacane@gmail.com'];
    if (!req.user || !adminEmails.includes(req.user.email)) {
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }

    console.log('🔍 Controllo secrets legacy...');

    const galleriesSnapshot = await db.collection('galleries').get();
    
    const legacyGalleries: Array<{
      id: string;
      name: string;
      hasPassword: boolean;
      hasPin: boolean;
    }> = [];

    for (const galleryDoc of galleriesSnapshot.docs) {
      const galleryData = galleryDoc.data();
      
      const hasLegacyPassword = galleryData.password && typeof galleryData.password === 'string' && galleryData.password.trim();
      const hasLegacyPin = galleryData.specialPin && typeof galleryData.specialPin === 'string' && galleryData.specialPin.trim();
      
      if (hasLegacyPassword || hasLegacyPin) {
        legacyGalleries.push({
          id: galleryDoc.id,
          name: galleryData.name || 'Senza nome',
          hasPassword: !!hasLegacyPassword,
          hasPin: !!hasLegacyPin
        });
      }
    }

    console.log(`🔍 Trovate ${legacyGalleries.length} gallerie con secrets legacy`);

    return res.json({
      success: true,
      totalGalleries: galleriesSnapshot.size,
      legacyCount: legacyGalleries.length,
      legacyGalleries
    });

  } catch (error: any) {
    console.error("❌ Errore controllo secrets legacy:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Errore controllo secrets"
    });
  }
});

/**
 * POST /api/email/gallery-photos-ready
 * Notifica al cliente che la galleria è pronta con foto caricate
 * Inviata automaticamente dopo upload foto o manualmente da admin
 */
router.post("/gallery-photos-ready", authenticateFirebase, async (req: any, res) => {
  try {
    const { galleryId, photoCount } = req.body;

    if (!galleryId) {
      return res.status(400).json({
        error: "Missing required field: galleryId"
      });
    }

    console.log(`📧 Richiesta notifica galleria pronta con foto: ${galleryId}`);

    // Recupera dati galleria
    const galleryDoc = await db.collection('galleries').doc(galleryId).get();
    if (!galleryDoc.exists) {
      return res.status(404).json({ error: "Gallery not found" });
    }

    const galleryData = galleryDoc.data();
    const galleryName = galleryData?.name || "Galleria";
    const galleryCode = galleryData?.code || galleryId;
    const clienteId = galleryData?.clienteId;
    
    // Priorità: clienteId dalla galleria, poi clientEmail legacy
    let clientEmail = galleryData?.clientEmail;
    let clientName = galleryData?.clientName || "Cliente";
    
    // Se c'è clienteId, recupera email e nome dal cliente
    if (clienteId) {
      const clienteDoc = await db.collection('clienti').doc(clienteId).get();
      if (clienteDoc.exists) {
        const clienteData = clienteDoc.data();
        clientEmail = clienteData?.email || clientEmail;
        clientName = `${clienteData?.nome || ''} ${clienteData?.cognome || ''}`.trim() || clientName;
        console.log(`📧 Recuperato cliente ${clienteId}: ${clientName} (${clientEmail})`);
      }
    }
    
    if (!clientEmail) {
      return res.status(400).json({
        error: "No client email associated with this gallery"
      });
    }

    // Costruisci URL galleria
    const baseUrl = getSiteBaseUrl(req);
    const isSpecialGallery = !!galleryData?.specialTheme;
    const galleryUrl = isSpecialGallery 
      ? `${baseUrl}/special-gallery` 
      : `${baseUrl}/g/${galleryCode}`;
    
    const actualPhotoCount = photoCount || galleryData?.photoCount || 0;
    const hasSelection = galleryData?.selectionEnabled;
    const deadline = galleryData?.selectionDeadline;
    
    // Recupera info studio per email
    const studioInfo = await getStudioContactInfo();
    
    // Genera HTML email con stile October Mist
    const htmlContent = createGalleryPhotosReadyEmailHTML({
      clientName,
      galleryName,
      galleryUrl,
      photoCount: actualPhotoCount,
      hasSelection,
      deadline: deadline?.toDate?.() || null,
      studioInfo
    });
    
    // Invia email usando sendGmailEmail esistente (NO emoji nell'oggetto)
    await sendGmailEmail(
      clientEmail,
      `La tua galleria "${galleryName}" e pronta`,
      htmlContent,
      undefined, // usa default from
      { 
        type: 'gallery_ready',
        relatedDocId: galleryId, 
        relatedDocType: 'gallery', 
        clientName 
      }
    );

    console.log(`✅ Email galleria pronta inviata a ${clientEmail}`);

    return res.json({
      success: true,
      message: `Notifica inviata a ${clientEmail}`,
      galleryName,
      photoCount: actualPhotoCount
    });

  } catch (error: any) {
    console.error("❌ Errore invio notifica galleria pronta:", error);
    return res.status(500).json({ 
      error: error.message || "Errore invio email"
    });
  }
});

/**
 * Template HTML per email "Galleria Pronta con Foto"
 * Stile October Mist: sage #8b9a7d, terracotta #c17f59, cream #f5f0e8, blue-gray #6b7d8a, mint #a8c5b5, off-white #faf8f5
 */
function createGalleryPhotosReadyEmailHTML(params: {
  clientName: string;
  galleryName: string;
  galleryUrl: string;
  photoCount: number;
  hasSelection?: boolean;
  deadline?: Date | null;
  studioInfo?: { name: string; email: string; phone: string; address: string };
}): string {
  const { clientName, galleryName, galleryUrl, photoCount, hasSelection, deadline, studioInfo } = params;
  
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };
  
  const deadlineText = deadline 
    ? `<p style="margin: 8px 0; color: #c17f59;"><strong>Scadenza selezione:</strong> ${deadline.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>`
    : '';
    
  const selectionInfo = hasSelection 
    ? `
      <div style="background: #f5f0e8; border-left: 4px solid #c17f59; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
        <h4 style="color: #c17f59; margin-top: 0; margin-bottom: 10px; font-size: 16px;">Selezione Foto Richiesta</h4>
        <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.5;">
          Per questa galleria ti è richiesto di selezionare le foto preferite. 
          Accedi alla galleria e segui le istruzioni per completare la selezione.
        </p>
        ${deadlineText}
      </div>
    ` 
    : '';

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #faf8f5;">
      <div style="background: linear-gradient(135deg, #8b9a7d 0%, #a8c5b5 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 26px; font-weight: 600;">La tua Galleria è Pronta</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">${galleryName}</p>
      </div>
      
      <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.08);">
        <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
          Ciao <strong>${clientName}</strong>,
        </p>
        <p style="font-size: 16px; color: #555; margin-bottom: 25px; line-height: 1.6;">
          Siamo felici di informarti che la tua galleria fotografica è pronta per essere visualizzata.
        </p>

        <div style="background: #faf8f5; padding: 25px; border-radius: 8px; margin: 25px 0; text-align: center; border: 1px solid #e8e4de;">
          <p style="font-size: 14px; color: #6b7d8a; margin-bottom: 8px;">Foto disponibili</p>
          <p style="font-size: 42px; font-weight: bold; color: #8b9a7d; margin: 10px 0;">${photoCount}</p>
        </div>

        ${selectionInfo}

        <div style="text-align: center; margin: 35px 0;">
          <a href="${galleryUrl}" 
             style="background: linear-gradient(135deg, #8b9a7d 0%, #6b8a6d 100%); color: white; padding: 16px 40px; 
                    text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;
                    font-size: 16px; box-shadow: 0 4px 12px rgba(139,154,125,0.3);">
            Visualizza la Galleria
          </a>
        </div>

        <div style="background: #f5f0e8; padding: 15px 20px; border-radius: 8px; margin: 25px 0;">
          <p style="margin: 0; font-size: 14px; color: #6b7d8a; line-height: 1.5;">
            <strong>Suggerimento:</strong> Prenditi il tempo necessario per sfogliare tutte le foto 
            con calma. Puoi accedere alla galleria in qualsiasi momento.
          </p>
        </div>
      </div>

      <div style="text-align: center; color: #6b7d8a; font-size: 12px; margin-top: 25px; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600; color: #8b9a7d;">${studio.name}</p>
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
      </div>
    </div>
  `;
}

/**
 * POST /api/email/selection-copy
 * Invia copia email delle foto selezionate al cliente (Selezione Libera)
 */
router.post("/selection-copy", async (req, res) => {
  try {
    const { recipientEmail, galleryName, galleryCode, selectedPhotos } = req.body;

    if (!recipientEmail || !galleryName || !selectedPhotos) {
      return res.status(400).json({ 
        error: "Missing required fields: recipientEmail, galleryName, selectedPhotos" 
      });
    }

    const photoCount = selectedPhotos.length;
    const galleryUrl = `${getSiteBaseUrl(req)}/gallery/${galleryCode}`;

    // Genera griglia HTML con thumbnails (max 30 per email leggera)
    const maxPhotos = Math.min(photoCount, 30);
    const photosToShow = selectedPhotos.slice(0, maxPhotos);
    
    const thumbnailsHtml = photosToShow.map((photo: { url: string; name?: string }, index: number) => `
      <div style="display: inline-block; width: 80px; height: 80px; margin: 4px; border-radius: 6px; overflow: hidden; border: 2px solid #e8e4de;">
        <img src="${photo.url}" alt="Foto ${index + 1}" style="width: 100%; height: 100%; object-fit: cover;" />
      </div>
    `).join('');

    const morePhotosText = photoCount > maxPhotos 
      ? `<p style="text-align: center; color: #6b7d8a; font-size: 13px; margin-top: 15px;">...e altre ${photoCount - maxPhotos} foto</p>` 
      : '';

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #faf8f5;">
        <div style="background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Le tue Foto Selezionate</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Galleria: ${galleryName}</p>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.08);">
          <p style="font-size: 16px; color: #333; margin-bottom: 15px;">
            Ecco il riepilogo delle foto che hai selezionato:
          </p>

          <div style="background: #faf8f5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; border: 1px solid #e8e4de;">
            <p style="font-size: 14px; color: #6b7d8a; margin-bottom: 8px;">Foto selezionate</p>
            <p style="font-size: 42px; font-weight: bold; color: #9333ea; margin: 10px 0;">${photoCount}</p>
          </div>

          <div style="background: #faf5ff; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #e9d5ff;">
            <p style="font-size: 14px; color: #6b21a8; margin-bottom: 15px; font-weight: 600;">Anteprima foto:</p>
            <div style="text-align: center;">
              ${thumbnailsHtml}
            </div>
            ${morePhotosText}
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${galleryUrl}" 
               style="background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%); color: white; padding: 14px 35px; 
                      text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;
                      font-size: 15px; box-shadow: 0 4px 12px rgba(147,51,234,0.3);">
              Visualizza la Galleria
            </a>
          </div>

          <div style="background: #f5f0e8; padding: 15px 20px; border-radius: 8px; margin: 25px 0;">
            <p style="margin: 0; font-size: 13px; color: #6b7d8a; line-height: 1.5;">
              <strong>Nota:</strong> Questa email è una copia di conferma della tua selezione. 
              Le foto in alta risoluzione sono disponibili nella galleria online.
            </p>
          </div>
        </div>

        <div style="text-align: center; color: #6b7d8a; font-size: 12px; margin-top: 25px; padding-top: 20px;">
          <p style="margin: 5px 0; font-weight: 600; color: #8b9a7d;">Image Studio Fotografico</p>
          <p style="margin: 5px 0;">Email: image.studio.fotografico@gmail.com</p>
        </div>
      </div>
    `;

    const subject = `Le tue ${photoCount} foto selezionate - ${galleryName}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    // Log email
    await logEmailSent({
      to: recipientEmail,
      subject,
      type: 'selection_copy',
      status: 'sent',
      relatedDocType: 'gallery',
    });

    console.log(`✅ Selection copy email sent to ${recipientEmail} - ${photoCount} photos`);
    res.json({ success: true, message: "Email inviata con successo" });

  } catch (error: any) {
    console.error("❌ Error sending selection copy email:", error);
    res.status(500).json({ error: error.message || "Failed to send email" });
  }
});

/**
 * POST /api/email/booking-cancelled
 * Invia email al cliente quando una prenotazione viene cancellata
 */
router.post("/booking-cancelled", async (req, res) => {
  try {
    const { clientEmail, clientName, prodottoNome, dataPrenotazione, cancelReason } = req.body;

    if (!clientEmail || !clientName) {
      return res.status(400).json({ 
        error: "Missing required fields: clientEmail, clientName" 
      });
    }

    // Formatta la data se presente
    let formattedDate = "Data non specificata";
    if (dataPrenotazione) {
      try {
        const date = new Date(dataPrenotazione);
        formattedDate = date.toLocaleDateString('it-IT', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (e) {
        formattedDate = dataPrenotazione;
      }
    }

    // Sezione motivo (opzionale)
    const reasonSection = cancelReason ? `
      <div style="background: #fff8e6; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; font-size: 14px; color: #92400e; font-weight: 600; margin-bottom: 8px;">📝 Motivazione:</p>
        <p style="margin: 0; font-size: 15px; color: #78350f; line-height: 1.6;">${cancelReason}</p>
      </div>
    ` : '';

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #faf8f5;">
        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Prenotazione Annullata</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Image Studio Fotografico</p>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.08);">
          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
            Gentile <strong>${clientName}</strong>,
          </p>
          
          <p style="font-size: 15px; color: #555; margin-bottom: 20px; line-height: 1.6;">
            Ti informiamo che la tua prenotazione è stata annullata.
          </p>

          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fee2e2;">
            <p style="font-size: 14px; color: #6b7d8a; margin-bottom: 8px;">Dettagli prenotazione annullata:</p>
            <p style="font-size: 16px; color: #333; margin: 5px 0;"><strong>Servizio:</strong> ${prodottoNome || 'Servizio fotografico'}</p>
            <p style="font-size: 16px; color: #333; margin: 5px 0;"><strong>Data prevista:</strong> ${formattedDate}</p>
          </div>

          ${reasonSection}

          <div style="background: #f5f0e8; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <p style="margin: 0; font-size: 14px; color: #6b7d8a; line-height: 1.6;">
              Se desideri prenotare un nuovo appuntamento o hai domande, non esitare a contattarci.
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${getSiteBaseUrl(req)}/prenota" 
               style="background: linear-gradient(135deg, #8b9a7d 0%, #6b7d5a 100%); color: white; padding: 14px 35px; 
                      text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;
                      font-size: 15px; box-shadow: 0 4px 12px rgba(139,154,125,0.3);">
              Prenota un Nuovo Appuntamento
            </a>
          </div>
        </div>

        <div style="text-align: center; color: #6b7d8a; font-size: 12px; margin-top: 25px; padding-top: 20px;">
          <p style="margin: 5px 0; font-weight: 600; color: #8b9a7d;">Image Studio Fotografico</p>
          <p style="margin: 5px 0;">Email: image.studio.fotografico@gmail.com</p>
          <p style="margin: 5px 0;">Tel: +39 334 7103142</p>
        </div>
      </div>
    `;

    const subject = `Prenotazione Annullata - ${prodottoNome || 'Servizio fotografico'}`;

    await sendGmailEmail(clientEmail, subject, htmlContent);

    // Log email
    await logEmailSent({
      to: clientEmail,
      subject,
      type: 'booking_cancelled',
      status: 'sent',
      clientName,
      relatedDocType: 'booking',
    });

    console.log(`✅ Booking cancelled email sent to ${clientEmail}`);
    res.json({ success: true, message: "Email inviata con successo" });

  } catch (error: any) {
    console.error("❌ Error sending booking cancelled email:", error);
    res.status(500).json({ error: error.message || "Failed to send email" });
  }
});

/**
 * POST /api/email/order-confirmation-walkin
 * Invia email di conferma per ordini walk-in (vendita diretta in studio)
 * RICHIEDE AUTENTICAZIONE: Bearer token Firebase (solo admin)
 */
router.post("/order-confirmation-walkin", authenticateFirebase, async (req: any, res) => {
  try {
    const { orderId, clientEmail, clientName, prodotti, totale, acconto, saldo, stato } = req.body;

    console.log(`🛍️ Richiesta conferma ordine walk-in da utente: ${req.user?.email}`);

    // Validazione campi obbligatori
    if (!clientEmail || !clientName || !prodotti || prodotti.length === 0) {
      return res.status(400).json({
        error: {
          code: "invalid-argument",
          message: "Campi obbligatori mancanti: clientEmail, clientName, prodotti"
        }
      });
    }

    // AUTORIZZAZIONE: Solo admin può inviare queste notifiche
    const ADMIN_EMAILS = ["gennaro.mazzacane@gmail.com"];
    const isAdmin = ADMIN_EMAILS.includes(req.user?.email || "");

    if (!isAdmin) {
      console.log(`❌ Utente ${req.user?.email} non autorizzato per conferma ordine walk-in`);
      return res.status(403).json({
        error: { code: "permission-denied", message: "Solo gli admin possono inviare conferme ordini" }
      });
    }

    // Genera HTML prodotti
    const prodottiHtml = prodotti.map((p: any) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e8e4de;">
          ${p.prodottoNome} ${p.isCustom ? '<span style="color: #f59e0b; font-size: 11px;">(Custom)</span>' : ''}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #e8e4de; text-align: center;">${p.quantita}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e8e4de; text-align: right;">€${(p.prodottoPrezzo * p.quantita).toFixed(2)}</td>
      </tr>
    `).join('');

    // Stato badge
    const statoBadge = stato === 'completato' 
      ? '<span style="background: #22c55e; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">✓ Completato</span>'
      : stato === 'in_lavorazione'
        ? '<span style="background: #3b82f6; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">In Lavorazione</span>'
        : '<span style="background: #f59e0b; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">In Attesa</span>';

    // Sezione pagamento
    const pagamentoHtml = acconto > 0 ? `
      <div style="background: #f5f0e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: #666;">Acconto versato:</span>
          <span style="color: #22c55e; font-weight: 600;">€${acconto.toFixed(2)}</span>
        </div>
        ${saldo > 0 ? `
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #666;">Saldo da pagare:</span>
            <span style="color: #f59e0b; font-weight: 600;">€${saldo.toFixed(2)}</span>
          </div>
        ` : '<p style="color: #22c55e; margin: 0; font-weight: 600;">✓ Pagamento completato</p>'}
      </div>
    ` : '';

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #faf8f5;">
        <div style="background: linear-gradient(135deg, #8b9a7d 0%, #6b7d5a 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Conferma Ordine</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Image Studio Fotografico</p>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.08);">
          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
            Gentile <strong>${clientName}</strong>,
          </p>
          
          <p style="font-size: 15px; color: #555; margin-bottom: 20px; line-height: 1.6;">
            Grazie per il tuo ordine! Ecco il riepilogo:
          </p>

          <div style="margin: 20px 0;">
            ${statoBadge}
          </div>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #f5f0e8;">
                <th style="padding: 10px; text-align: left; font-size: 13px; color: #666;">Prodotto</th>
                <th style="padding: 10px; text-align: center; font-size: 13px; color: #666;">Qtà</th>
                <th style="padding: 10px; text-align: right; font-size: 13px; color: #666;">Prezzo</th>
              </tr>
            </thead>
            <tbody>
              ${prodottiHtml}
            </tbody>
            <tfoot>
              <tr style="background: #8b9a7d;">
                <td colspan="2" style="padding: 12px; color: white; font-weight: 600;">Totale</td>
                <td style="padding: 12px; text-align: right; color: white; font-weight: 600; font-size: 18px;">€${totale.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          ${pagamentoHtml}

          <div style="background: #e7f3ff; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 0; font-size: 14px; color: #0056b3; line-height: 1.6;">
              📍 Ti contatteremo quando l'ordine sarà pronto per il ritiro.
            </p>
          </div>
        </div>

        <div style="text-align: center; color: #6b7d8a; font-size: 12px; margin-top: 25px; padding-top: 20px;">
          <p style="margin: 5px 0; font-weight: 600; color: #8b9a7d;">Image Studio Fotografico</p>
          <p style="margin: 5px 0;">Email: image.studio.fotografico@gmail.com</p>
          <p style="margin: 5px 0;">Tel: +39 334 7103142</p>
        </div>
      </div>
    `;

    const subject = `Conferma Ordine - Image Studio Fotografico`;

    await sendGmailEmail(clientEmail, subject, htmlContent);

    // Log email
    await logEmailSent({
      to: clientEmail,
      subject,
      type: 'order_confirmation_walkin',
      status: 'sent',
      clientName,
      relatedDocId: orderId,
      relatedDocType: 'order',
    });

    console.log(`✅ Walk-in order confirmation email sent to ${clientEmail} for order ${orderId}`);
    res.json({ success: true, message: "Email conferma ordine inviata con successo" });

  } catch (error: any) {
    console.error("❌ Error sending walk-in order confirmation email:", error);
    
    // Log email fallita
    if (req.body.clientEmail) {
      await logEmailSent({
        to: req.body.clientEmail,
        subject: `Conferma Ordine - Image Studio Fotografico`,
        type: 'order_confirmation_walkin',
        status: 'failed',
        errorMessage: error.message,
        relatedDocType: 'order',
      });
    }

    res.status(500).json({ error: error.message || "Errore invio email" });
  }
});

/**
 * POST /api/email/send-payment-receipt
 * Invia ricevuta di pagamento al cliente
 * RICHIEDE AUTENTICAZIONE: Bearer token Firebase (solo admin)
 */
router.post("/send-payment-receipt", authenticateFirebase, async (req: any, res) => {
  try {
    const {
      recipientEmail,
      clientName,
      eventName,
      paymentType, // acconto, rata, saldo
      paymentAmount,
      paymentDate,
      totalPaid,
      remainingBalance,
      jobId
    } = req.body;

    console.log(`💰 Richiesta invio ricevuta pagamento da utente: ${req.user?.email}`);

    // Validazione campi obbligatori
    if (!recipientEmail || !clientName || !paymentType || !paymentAmount || !paymentDate) {
      return res.status(400).json({
        error: {
          code: "invalid-argument",
          message: "Campi obbligatori mancanti: recipientEmail, clientName, paymentType, paymentAmount, paymentDate"
        }
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    // Formatta tipo pagamento
    const paymentTypeLabels: Record<string, string> = {
      acconto: 'Acconto',
      rata: 'Rata',
      saldo: 'Saldo'
    };
    const paymentTypeLabel = paymentTypeLabels[paymentType] || paymentType;

    // Template email ricevuta
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ricevuta Pagamento</title>
</head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;background-color:#faf8f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#8b5a3c 0%,#a67c5b 100%);padding:40px 40px 30px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-family:'Georgia',serif;font-size:28px;font-weight:normal;">
                Ricevuta Pagamento
              </h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.9);font-size:16px;">
                ${eventName || 'Il tuo servizio fotografico'}
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;font-size:18px;color:#333;">
                Gentile <strong>${clientName}</strong>,
              </p>
              <p style="margin:0 0 30px;font-size:16px;color:#555;line-height:1.6;">
                Ti confermiamo di aver ricevuto correttamente il tuo pagamento. Di seguito trovi i dettagli della transazione.
              </p>

              <!-- Payment Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f6f3;border-radius:8px;margin-bottom:30px;">
                <tr>
                  <td style="padding:25px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e8e4df;">
                          <span style="color:#666;font-size:14px;">Tipo Pagamento:</span>
                        </td>
                        <td style="padding:8px 0;border-bottom:1px solid #e8e4df;text-align:right;">
                          <strong style="color:#333;font-size:14px;">${paymentTypeLabel}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e8e4df;">
                          <span style="color:#666;font-size:14px;">Data Pagamento:</span>
                        </td>
                        <td style="padding:8px 0;border-bottom:1px solid #e8e4df;text-align:right;">
                          <strong style="color:#333;font-size:14px;">${paymentDate}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0;border-bottom:1px solid #e8e4df;">
                          <span style="color:#666;font-size:16px;font-weight:600;">Importo Pagato:</span>
                        </td>
                        <td style="padding:12px 0;border-bottom:1px solid #e8e4df;text-align:right;">
                          <strong style="color:#2e7d32;font-size:20px;">€${Number(paymentAmount).toFixed(2)}</strong>
                        </td>
                      </tr>
                      ${totalPaid !== undefined ? `
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e8e4df;">
                          <span style="color:#666;font-size:14px;">Totale Pagato:</span>
                        </td>
                        <td style="padding:8px 0;border-bottom:1px solid #e8e4df;text-align:right;">
                          <strong style="color:#333;font-size:14px;">€${Number(totalPaid).toFixed(2)}</strong>
                        </td>
                      </tr>
                      ` : ''}
                      ${remainingBalance !== undefined && remainingBalance > 0 ? `
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#666;font-size:14px;">Saldo Residuo:</span>
                        </td>
                        <td style="padding:8px 0;text-align:right;">
                          <strong style="color:#e65100;font-size:14px;">€${Number(remainingBalance).toFixed(2)}</strong>
                        </td>
                      </tr>
                      ` : `
                      <tr>
                        <td colspan="2" style="padding:15px 0 0;text-align:center;">
                          <span style="color:#2e7d32;font-size:16px;font-weight:600;">✓ Pagamento completato</span>
                        </td>
                      </tr>
                      `}
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 15px;font-size:15px;color:#555;line-height:1.6;">
                Grazie per la fiducia! Per qualsiasi domanda o chiarimento, non esitare a contattarci.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f6f3;padding:30px 40px;text-align:center;border-top:1px solid #e8e4df;">
              <p style="margin:0 0 10px;font-size:14px;color:#8b5a3c;font-weight:600;">
                ${studioInfo.name || 'Studio Fotografico'}
              </p>
              ${studioInfo.phone ? `<p style="margin:0 0 5px;font-size:13px;color:#666;">Tel: ${studioInfo.phone}</p>` : ''}
              ${studioInfo.email ? `<p style="margin:0;font-size:13px;color:#666;">Email: ${studioInfo.email}</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const subject = `Ricevuta ${paymentTypeLabel} - ${eventName || 'Il tuo servizio fotografico'}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(`✅ Ricevuta pagamento inviata a ${recipientEmail} per ${eventName || 'servizio'}`);

    // Log audit
    try {
      await db.collection('emailLogs').add({
        type: 'payment_receipt',
        recipientEmail,
        clientName,
        eventName,
        paymentType,
        paymentAmount,
        jobId,
        sentAt: FieldValue.serverTimestamp(),
        sentBy: req.user?.email,
        success: true,
      });
    } catch (logError) {
      console.warn('⚠️ Errore logging email ricevuta:', logError);
    }

    res.status(200).json({
      success: true,
      message: "Ricevuta pagamento inviata con successo",
      recipientEmail
    });

  } catch (error: any) {
    console.error("❌ Errore send-payment-receipt:", error);
    res.status(500).json({
      error: error.message || "Errore invio ricevuta pagamento"
    });
  }
});

/**
 * POST /api/email/notify-youtube-video
 * Invia notifica email al cliente quando vengono aggiunti video YouTube alla galleria
 * RICHIEDE AUTENTICAZIONE: Bearer token Firebase (solo admin)
 */
router.post("/notify-youtube-video", authenticateFirebase, async (req: any, res) => {
  try {
    const { clientEmail, clientName, galleryName, galleryCode, videoCount } = req.body;

    console.log(`📹 Richiesta notifica video YouTube da utente: ${req.user?.email}`);

    // Validazione campi obbligatori
    if (!clientEmail || !galleryName || !galleryCode || !videoCount) {
      return res.status(400).json({
        error: {
          code: "invalid-argument",
          message: "Campi obbligatori mancanti: clientEmail, galleryName, galleryCode, videoCount"
        }
      });
    }

    // AUTORIZZAZIONE: Solo admin può inviare queste notifiche
    const ADMIN_EMAILS = ["gennaro.mazzacane@gmail.com"];
    const isAdmin = ADMIN_EMAILS.includes(req.user?.email || "");

    if (!isAdmin) {
      console.log(`❌ Utente ${req.user?.email} non autorizzato per notifica video`);
      return res.status(403).json({
        error: { code: "permission-denied", message: "Solo gli admin possono inviare notifiche video" }
      });
    }

    // Importa template email
    const { createYouTubeVideoNotificationEmailHTML, getYouTubeVideoNotificationSubject } = 
      await import('./email-templates/youtube-video-notification.js');

    // Recupera info studio
    const studioInfo = await getStudioContactInfo();

    // Genera URL galleria
    const galleryUrl = `${getSiteBaseUrl(req)}/gallery/${galleryCode}`;

    // Crea contenuto email
    const htmlContent = createYouTubeVideoNotificationEmailHTML({
      clientName: clientName || "Cliente",
      galleryName,
      videoCount,
      galleryUrl,
      studioInfo
    });

    const subject = getYouTubeVideoNotificationSubject(galleryName, videoCount);

    // Invia email
    await sendGmailEmail(clientEmail, subject, htmlContent);

    // Log email
    await logEmailSent({
      to: clientEmail,
      subject,
      type: 'youtube_video_notification',
      status: 'sent',
      clientName: clientName || "Cliente",
      relatedDocType: 'gallery',
    });

    console.log(`✅ YouTube video notification email sent to ${clientEmail} for gallery ${galleryName}`);
    res.json({ success: true, message: "Email notifica video inviata con successo" });

  } catch (error: any) {
    console.error("❌ Error sending YouTube video notification email:", error);
    
    // Log email fallita
    if (req.body.clientEmail) {
      await logEmailSent({
        to: req.body.clientEmail,
        subject: `Nuovi video - ${req.body.galleryName || 'Galleria'}`,
        type: 'youtube_video_notification',
        status: 'failed',
        errorMessage: error.message,
        relatedDocType: 'gallery',
      });
    }

    res.status(500).json({ error: error.message || "Errore invio email" });
  }
});

/**
 * POST /api/email/daily-job-reminder
 * Invia email riepilogo lavori del giorno successivo a admin e collaboratori
 * Chiamato da cron job giornaliero (es. alle 18:00 del giorno prima)
 * PROTETTO: richiede autenticazione admin
 */
router.post("/daily-job-reminder", authenticateFirebase, async (req: any, res) => {
  // Verifica che sia admin
  const adminEmails = ['gennaro.mazzacane@gmail.com'];
  if (!adminEmails.includes(req.user?.email)) {
    return res.status(403).json({ 
      error: { code: "permission-denied", message: "Solo gli admin possono inviare promemoria giornalieri" }
    });
  }
  try {
    console.log("🔔 Starting daily job reminder email process...");
    
    const { targetDate: targetDateParam } = req.body;
    
    // Se non specificato, usa domani
    const targetDate = targetDateParam 
      ? DateTime.fromISO(targetDateParam, { zone: 'Europe/Rome' })
      : DateTime.now().setZone('Europe/Rome').plus({ days: 1 });
    
    const startOfDay = targetDate.startOf('day');
    const endOfDay = targetDate.endOf('day');
    
    console.log(`📅 Looking for jobs on: ${targetDate.toFormat('dd/MM/yyyy')}`);
    
    // Trova tutti i job con eventDate = domani
    const jobsSnapshot = await db.collection('jobs')
      .where('eventDate', '>=', startOfDay.toJSDate())
      .where('eventDate', '<=', endOfDay.toJSDate())
      .get();
    
    if (jobsSnapshot.empty) {
      console.log(`ℹ️ No jobs found for ${targetDate.toFormat('dd/MM/yyyy')}`);
      return res.json({ 
        success: true, 
        message: `Nessun lavoro per ${targetDate.toFormat('dd/MM/yyyy')}`,
        jobsProcessed: 0 
      });
    }
    
    const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`📋 Found ${jobs.length} jobs for ${targetDate.toFormat('dd/MM/yyyy')}`);
    
    const studioInfo = await getStudioContactInfo();
    const adminEmail = 'gennaro.mazzacane@gmail.com';
    let totalEmailsSent = 0;
    
    for (const job of jobs) {
      try {
        // Raccolta destinatari email
        const recipients: string[] = [adminEmail];
        
        // Aggiungi collaboratori accettati
        const collaboratoriAssegnati = (job as any).collaboratoriAssegnati || [];
        for (const collab of collaboratoriAssegnati) {
          if (collab.status === 'accettato' && collab.collaboratoreId) {
            try {
              const collabDoc = await db.collection('collaboratori').doc(collab.collaboratoreId).get();
              if (collabDoc.exists) {
                const email = collabDoc.data()?.email;
                if (email && !recipients.includes(email)) {
                  recipients.push(email);
                }
              }
            } catch (err) {
              console.warn(`⚠️ Could not fetch collaborator ${collab.collaboratoreId}:`, err);
            }
          }
        }
        
        // Fetch dettagli clienti
        const clientiDetails: Array<{
          nome: string;
          cognome: string;
          telefono?: string;
          email?: string;
          indirizzo?: string;
          citta?: string;
          cap?: string;
        }> = [];
        
        const clientiIds = (job as any).clientiIds || [];
        for (const clienteId of clientiIds) {
          try {
            const clienteDoc = await db.collection('clienti').doc(clienteId).get();
            if (clienteDoc.exists) {
              const data = clienteDoc.data();
              clientiDetails.push({
                nome: data?.nome || '',
                cognome: data?.cognome || '',
                telefono: data?.cellulare1 || data?.cellulare2 || '',
                email: data?.email || '',
                indirizzo: data?.via || '',
                citta: data?.citta || '',
                cap: data?.cap || '',
              });
            }
          } catch (err) {
            console.warn(`⚠️ Could not fetch client ${clienteId}:`, err);
          }
        }
        
        // Fetch dettagli collaboratori per l'email
        const collaboratoriDetails: Array<{ nome: string; telefono?: string }> = [];
        for (const collab of collaboratoriAssegnati) {
          if (collab.status === 'accettato' && collab.collaboratoreId) {
            try {
              const collabDoc = await db.collection('collaboratori').doc(collab.collaboratoreId).get();
              if (collabDoc.exists) {
                const data = collabDoc.data();
                collaboratoriDetails.push({
                  nome: data?.nome || data?.email || 'Collaboratore',
                  telefono: data?.telefono,
                });
              }
            } catch (err) { /* skip */ }
          }
        }
        
        // Genera HTML email
        const eventDate = (job as any).eventDate?.toDate?.() || new Date((job as any).eventDate);
        const htmlContent = generateDailyJobReminderHTML({
          nomeEvento: (job as any).nomeEvento || 'Lavoro',
          jobType: (job as any).jobType || '',
          eventDate: DateTime.fromJSDate(eventDate).setZone('Europe/Rome'),
          rituTime: (job as any).rituTime,
          rituLocation: (job as any).rituLocation,
          eventLocation: (job as any).eventLocation,
          clienti: clientiDetails,
          collaboratori: collaboratoriDetails,
          noteInterne: (job as any).noteInterne,
          studioInfo,
          jobId: job.id,
          baseUrl: getSiteBaseUrl(req),
        });
        
        const subject = `📸 Promemoria: ${(job as any).nomeEvento} - ${targetDate.toFormat('dd MMMM yyyy', { locale: 'it' })}`;
        
        // Invia email a tutti i destinatari
        await sendGmailEmail(recipients.join(','), subject, htmlContent);
        totalEmailsSent++;
        
        // Log
        await logEmailSent({
          to: recipients,
          subject,
          type: 'daily_job_reminder',
          status: 'sent',
          relatedDocId: job.id,
          relatedDocType: 'job',
        });
        
        console.log(`✅ Daily reminder sent for job ${job.id} to ${recipients.join(', ')}`);
        
      } catch (jobError: any) {
        console.error(`❌ Error processing job ${job.id}:`, jobError);
      }
    }
    
    console.log(`🎉 Daily job reminder completed: ${totalEmailsSent} emails sent for ${jobs.length} jobs`);
    
    res.json({
      success: true,
      message: `Inviate ${totalEmailsSent} email per ${jobs.length} lavori del ${targetDate.toFormat('dd/MM/yyyy')}`,
      jobsProcessed: jobs.length,
      emailsSent: totalEmailsSent,
    });
    
  } catch (error: any) {
    console.error("❌ Error in daily job reminder:", error);
    res.status(500).json({ error: error.message || "Errore invio promemoria giornaliero" });
  }
});

/**
 * Helper: Genera HTML per email promemoria giornaliero
 */
function generateDailyJobReminderHTML(data: {
  nomeEvento: string;
  jobType: string;
  eventDate: DateTime;
  rituTime?: string;
  rituLocation?: string;
  eventLocation?: string;
  clienti: Array<{
    nome: string;
    cognome: string;
    telefono?: string;
    email?: string;
    indirizzo?: string;
    citta?: string;
    cap?: string;
  }>;
  collaboratori: Array<{ nome: string; telefono?: string }>;
  noteInterne?: string;
  studioInfo: any;
  jobId: string;
  baseUrl: string;
}): string {
  const { nomeEvento, jobType, eventDate, rituTime, rituLocation, eventLocation, clienti, collaboratori, noteInterne, studioInfo, jobId, baseUrl } = data;
  
  const generateMapsLink = (address: string) => 
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  
  const clientiHtml = clienti.map(c => {
    const fullAddress = [c.indirizzo, c.cap, c.citta].filter(Boolean).join(', ');
    return `
      <div style="background: #f8f9fa; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
        <p style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">
          ${c.nome} ${c.cognome}
        </p>
        ${c.telefono ? `
          <p style="margin: 4px 0;">
            📞 <a href="tel:${c.telefono.replace(/\s/g, '')}" style="color: #059669;">${c.telefono}</a>
          </p>
        ` : ''}
        ${c.email ? `
          <p style="margin: 4px 0;">
            ✉️ <a href="mailto:${c.email}" style="color: #2563eb;">${c.email}</a>
          </p>
        ` : ''}
        ${fullAddress ? `
          <p style="margin: 4px 0;">
            🏠 <a href="${generateMapsLink(fullAddress)}" target="_blank" style="color: #7c3aed;">${fullAddress}</a>
          </p>
        ` : ''}
      </div>
    `;
  }).join('');
  
  const collaboratoriHtml = collaboratori.length > 0 
    ? collaboratori.map(c => `
        <span style="display: inline-block; background: #e0e7ff; color: #4338ca; padding: 4px 12px; border-radius: 16px; margin: 4px; font-size: 14px;">
          ${c.nome}
          ${c.telefono ? `<a href="tel:${c.telefono.replace(/\s/g, '')}" style="color: #4338ca; margin-left: 4px;">📞</a>` : ''}
        </span>
      `).join('')
    : '<p style="color: #6b7280; font-style: italic;">Nessun collaboratore assegnato</p>';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f3f4f6;">
      <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 16px; padding: 24px; margin-bottom: 20px;">
        <h1 style="margin: 0 0 8px 0; color: #92400e; font-size: 24px;">📸 Promemoria Lavoro</h1>
        <p style="margin: 0; color: #b45309; font-size: 16px;">
          ${eventDate.toFormat('EEEE d MMMM yyyy', { locale: 'it' })}
        </p>
      </div>
      
      <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 20px; border-bottom: 2px solid #fbbf24; padding-bottom: 8px;">
          ${nomeEvento}
          ${jobType ? `<span style="font-size: 14px; color: #6b7280; font-weight: normal;"> (${jobType})</span>` : ''}
        </h2>
        
        ${rituTime || rituLocation ? `
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin-bottom: 16px; border-radius: 0 8px 8px 0;">
            <p style="margin: 0; font-weight: 600; color: #92400e;">⛪ Cerimonia</p>
            ${rituTime ? `<p style="margin: 4px 0 0 0; color: #78350f;">🕐 Ore ${rituTime}</p>` : ''}
            ${rituLocation ? `<p style="margin: 4px 0 0 0;"><a href="${generateMapsLink(rituLocation)}" target="_blank" style="color: #b45309;">📍 ${rituLocation}</a></p>` : ''}
          </div>
        ` : ''}
        
        ${eventLocation ? `
          <div style="background: #d1fae5; border-left: 4px solid #10b981; padding: 12px; margin-bottom: 16px; border-radius: 0 8px 8px 0;">
            <p style="margin: 0; font-weight: 600; color: #065f46;">🎉 Location Evento</p>
            <p style="margin: 4px 0 0 0;"><a href="${generateMapsLink(eventLocation)}" target="_blank" style="color: #047857;">📍 ${eventLocation}</a></p>
          </div>
        ` : ''}
      </div>
      
      <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h3 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px;">👥 Clienti</h3>
        ${clientiHtml || '<p style="color: #6b7280;">Nessun cliente associato</p>'}
      </div>
      
      <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h3 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px;">🤝 Team</h3>
        ${collaboratoriHtml}
      </div>
      
      ${noteInterne ? `
        <div style="background: #fef9c3; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #854d0e; font-size: 14px;">📝 Note</h3>
          <p style="margin: 0; color: #78350f; white-space: pre-wrap;">${noteInterne}</p>
        </div>
      ` : ''}
      
      <div style="text-align: center; margin-top: 24px;">
        <a href="${baseUrl}/admin/jobs/${jobId}" 
           style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Vedi Dettagli Lavoro
        </a>
      </div>
      
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
        <p style="margin: 0;">
          ${studioInfo?.name || 'Image Studio Fotografico'}<br>
          ${studioInfo?.phone ? `📞 ${studioInfo.phone}` : ''}
        </p>
      </div>
    </body>
    </html>
  `;
}

export default router;