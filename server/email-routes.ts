/**
 * Email API Routes - Gestisce invio email tramite Replit Gmail Integration
 * Queste route girano sul server Replit che ha accesso a connectors-api.replit.com
 */

import { Router, Request, Response, NextFunction } from "express";
import { google } from "googleapis";
import { db } from './firebase-admin.js';

const router = Router();

// Firebase Project ID per Firestore REST API
const FIREBASE_PROJECT_ID = "wedding-gallery-397b6";

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
        name: studioDoc.fields.name?.stringValue || "Memorie Sospese",
        email: studioDoc.fields.email?.stringValue || "memoriesospese@gennaromazzacane.it",
        phone: studioDoc.fields.phone?.stringValue || "+39 334 7103142",
        address: studioDoc.fields.address?.stringValue || ""
      };
    }
  } catch (error) {
    console.error("⚠️ Errore recupero dati studio:", error);
  }
  
  // Fallback ai valori di default
  return {
    name: "Memorie Sospese",
    email: "memoriesospese@gennaromazzacane.it",
    phone: "+39 334 7103142",
    address: ""
  };
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
 * Invia email tramite Gmail API
 * ESPORTATA per uso diretto da altri moduli (booking-routes.ts)
 */
export async function sendGmailEmail(
  to: string | string[],
  subject: string,
  htmlContent: string,
  from: string = "Memorie Sospese <memoriesospese@gennaromazzacane.it>",
): Promise<void> {
  try {
    // 1. Normalizza destinatari
    const toList = Array.isArray(to) ? to : [to];
    const recipients = toList.join(", ");

    console.log(
      `📧 Sending email to ${toList.length} recipient(s): ${recipients}`,
    );

    // 2. Ottieni access token
    const accessToken = await getAccessToken();

    // 3. Crea client Gmail autenticato
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // 4. Crea messaggio RFC2822
    const message = [
      `From: ${from}`,
      `To: ${recipients}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      htmlContent,
    ].join("\n");

    // 5. Codifica in base64url
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // 6. Invia email
    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log(
      `✅ Email sent successfully via Gmail API to ${toList.length} recipient(s)`,
    );
  } catch (error) {
    console.error("❌ Gmail send error:", error);
    throw error;
  }
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
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
      await sendGmailEmail(recipients, subject, htmlContent);

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
 * Template HTML per email prenotazione ricevuta (in_attesa)
 */
export function createBookingReceivedEmailHTML(
  clienteName: string,
  campaignName: string,
  bookingDate: string,
  bookingTime: string,
  duration: number,
  productName?: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
    phone: "+39 334 7103142",
    address: ""
  };
  
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
          ${productName ? `<p style="margin: 8px 0;"><strong>📦 Pacchetto:</strong> ${productName}</p>` : ''}
        </div>

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
  bookingId?: string
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
    phone: "+39 334 7103142",
    address: ""
  };
  
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
          ${productName ? `<p style="margin: 8px 0;"><strong>📦 Pacchetto:</strong> ${productName}</p>` : ''}
          ${notes ? `<p style="margin: 8px 0;"><strong>📝 Note:</strong> ${notes}</p>` : ''}
        </div>

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

        ${bookingId ? `
        <div style="text-align: center; margin: 25px 0; padding: 20px; background: linear-gradient(135deg, #f5f7fa 0%, #e8eef7 100%); border-radius: 12px;">
          <p style="font-size: 16px; color: #333; margin-bottom: 8px; font-weight: 600;">
            📅 Non dimenticare il tuo appuntamento!
          </p>
          <p style="font-size: 14px; color: #666; margin-bottom: 18px; line-height: 1.5;">
            Aggiungi questo evento al tuo calendario per ricevere un promemoria automatico 24 ore prima dello shooting. Basta un click!
          </p>
          <a href="${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000'}/api/booking/calendar/${bookingId}" 
             style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; padding: 16px 32px; text-decoration: none; border-radius: 10px; 
                    font-weight: 600; font-size: 16px; box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
                    transition: all 0.3s ease;">
            📲 Aggiungi al Calendario
          </a>
          <p style="font-size: 12px; color: #888; margin-top: 12px; line-height: 1.4;">
            Funziona su tutti i dispositivi: iPhone, Android, PC, Mac<br>
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
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
    phone: "+39 334 7103142",
    address: ""
  };
  
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
          <p style="margin: 8px 0;"><strong>📱 WhatsApp:</strong> <a href="https://wa.me/${clienteWhatsApp}">${clienteWhatsApp}</a></p>
        </div>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">📋 Dettagli Prenotazione</h3>
          <p style="margin: 8px 0;"><strong>📅 Data:</strong> ${bookingDate}</p>
          <p style="margin: 8px 0;"><strong>🕐 Orario:</strong> ${bookingTime}</p>
          ${productName ? `<p style="margin: 8px 0;"><strong>📦 Prodotto:</strong> ${productName}</p>` : ''}
          ${notes ? `<p style="margin: 8px 0;"><strong>📝 Note:</strong> ${notes}</p>` : ''}
        </div>

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
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
          <p style="margin: 0; font-size: 14px; color: #0c5460; font-weight: bold;">
            🎉 Ordine completamente saldato! Procederemo con la lavorazione e ti contatteremo appena pronto.
          </p>
        </div>
        `}

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
          Grazie per aver scelto Memorie Sospese! ❤️
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
 * Template HTML per email saldo pendente (ordine completato)
 * ESPORTATA per uso in order management
 */
export function createOrderSaldoPendenteEmailHTML(
  clienteName: string,
  prodottoNome: string,
  saldoAmount: number,
  studioInfo?: { name: string; email: string; phone: string; address: string },
  totaleOrdine?: number,
  transactions?: Array<{ tipo: 'acconto' | 'saldo'; importo: number; metodo: string; data: any; note?: string }>
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
      <h2 style="color: #28a745; text-align: center;">Pagamento Completato</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Siamo felici di informarti che il tuo ordine per <strong style="color: #8b5a3c;">${prodottoNome}</strong> 
          è stato <strong>completato</strong> e il pagamento è stato ricevuto con successo!
        </p>
        
        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #28a745; margin-top: 0; margin-bottom: 15px;">✅ Pagamento Completato</h3>
          <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 10px 0;">
            <p style="margin: 0 0 10px 0; font-size: 18px; font-weight: bold; color: #155724;">
              Saldo finale pagato: ${formatCurrency(saldoAmount)}
            </p>
            ${totaleOrdine ? `
            <p style="margin: 10px 0 0 0; font-size: 14px; color: #155724;">
              Costo totale servizio: ${formatCurrency(totaleOrdine)}
            </p>
            ` : ''}
            <p style="margin: 10px 0 0 0; font-size: 16px; color: #155724; font-weight: bold;">
              Saldo rimanente: €0,00 🎉
            </p>
          </div>
        </div>

        ${transactions && transactions.length > 0 ? `
        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #e0e0e0;">
          <h4 style="color: #333; margin-top: 0; margin-bottom: 15px;">📋 Cronologia Completa Pagamenti</h4>
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

        <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0;">
          <h4 style="color: #0c5460; margin-top: 0; margin-bottom: 10px;">📸 Prossimi Passi</h4>
          <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #0c5460;">
            <li>Il tuo ordine è ora completamente pagato</li>
            <li>Procederemo con la preparazione e consegna finale</li>
            <li>Riceverai le tue foto nel formato concordato</li>
          </ol>
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
 * Template HTML per email "Galleria Pronta" con selezione foto
 * ESPORTATA per uso diretto da NewGalleryModal
 */
export function createGalleryReadyEmailHTML(
  clienteName: string,
  galleryName: string,
  galleryUrl: string,
  requiredPhotoCount: number,
  selectionDeadline?: string,
  photoCount?: number,
  studioInfo?: { name: string; email: string; phone: string; address: string },
  productRequirements?: Array<{ prodottoNome: string; prodottoNumeroFoto: number }>
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
    phone: "+39 334 7103142",
    address: ""
  };
  
  // Logica dinamica: se galleria vuota, messaggio temporaneo
  const isGalleryEmpty = photoCount === 0;
  
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      
      <!-- Hero Header -->
      <div style="background: linear-gradient(135deg, #8b5a3c 0%, #c9a961 100%); padding: 50px 30px; text-align: center;">
        <div style="background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 30px;">
          <h1 style="color: #ffffff; font-size: 32px; font-weight: 300; margin: 0 0 15px 0; letter-spacing: 2px; text-transform: uppercase;">
            ${isGalleryEmpty ? 'Galleria in Preparazione' : 'La Tua Galleria è Pronta'}
          </h1>
          <div style="width: 60px; height: 2px; background: #c9a961; margin: 0 auto 20px auto;"></div>
          <p style="color: rgba(255,255,255,0.95); font-size: 18px; margin: 0; font-weight: 300; line-height: 1.6;">
            ${isGalleryEmpty ? 'Stiamo caricando le tue foto' : `${galleryName} - Seleziona le tue preferite`}
          </p>
        </div>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 30px;">
        
        <!-- Greeting -->
        <p style="font-size: 18px; color: #333333; line-height: 1.8; margin-bottom: 25px;">
          Gentile <strong style="color: #8b5a3c;">${clienteName}</strong>,
        </p>
        
        ${isGalleryEmpty ? `
        <!-- Empty Gallery State -->
        <p style="font-size: 16px; color: #666666; line-height: 1.8; margin-bottom: 35px;">
          La tua galleria fotografica è stata creata con successo. Stiamo attualmente caricando le foto del tuo shooting e saranno disponibili a breve.
        </p>

        <!-- Loading Info Card -->
        <div style="background: linear-gradient(135deg, #fff8e7 0%, #ffffff 100%); border-left: 4px solid #c9a961; border-radius: 12px; padding: 30px; margin: 35px 0;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="display: inline-block; background: #ff8c42; color: white; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
              Caricamento in Corso
            </div>
          </div>
          
          <p style="margin: 15px 0; font-size: 15px; color: #555; line-height: 1.8; text-align: center;">
            <strong style="color: #8b5a3c;">Ti consigliamo di tornare tra 10-15 minuti</strong> per iniziare a selezionare le tue <strong>${requiredPhotoCount} foto</strong> preferite
          </p>
          
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px dashed #e8d5c4; text-align: center;">
            <p style="margin: 0; font-size: 13px; color: #999; line-height: 1.6;">
              Riceverai una notifica quando le foto saranno completamente caricate
            </p>
          </div>
        </div>

        <!-- Early Access CTA -->
        <div style="text-align: center; margin: 40px 0;">
          <p style="font-size: 14px; color: #666; margin-bottom: 20px;">
            Nel frattempo, puoi salvare questo link per accedere rapidamente:
          </p>
          <a href="${galleryUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #8b5a3c 0%, #c9a961 100%); 
                    color: white; padding: 16px 40px; text-decoration: none; border-radius: 50px; 
                    font-weight: 600; font-size: 15px; letter-spacing: 0.5px; text-transform: uppercase;
                    box-shadow: 0 4px 15px rgba(139, 90, 60, 0.3);">
            Vai alla Galleria
          </a>
        </div>
        
        ` : `
        <!-- Gallery Ready State -->
        <p style="font-size: 16px; color: #666666; line-height: 1.8; margin-bottom: 35px;">
          Le tue foto sono online e pronte per essere visualizzate! È il momento di selezionare le immagini che diventeranno i tuoi ricordi indelebili.
        </p>

        ${productRequirements && productRequirements.length > 0 ? `
        <!-- Multi-Product Selection -->
        <div style="background: linear-gradient(to right, #f9f7f4, #ffffff); border: 2px solid #e8d5c4; border-radius: 12px; padding: 30px; margin: 35px 0;">
          <div style="text-align: center; margin-bottom: 25px;">
            <div style="display: inline-block; background: #8b9a8e; color: white; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
              Seleziona per Prodotti
            </div>
          </div>
          
          <h3 style="color: #8b5a3c; font-size: 16px; font-weight: 600; margin: 0 0 20px 0; letter-spacing: 0.5px;">
            Prodotti da Completare
          </h3>
          
          <ul style="margin: 0 0 20px 0; padding-left: 0; list-style: none;">
            ${productRequirements.map((prod, idx) => `
            <div style="margin: 12px 0; padding: 12px; background: #f5f8f5; border-radius: 6px; display: flex; align-items: center;">
              <span style="display: inline-block; width: 22px; height: 22px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 22px; font-size: 12px; font-weight: 700; margin-right: 12px;">${idx + 1}</span>
              <span style="flex: 1; font-size: 14px; color: #555;">
                <strong style="color: #333;">${prod.prodottoNome}:</strong> ${prod.prodottoNumeroFoto} foto
              </span>
            </div>
            `).join('')}
          </ul>
          
          <div style="background: #fff8e7; border-radius: 6px; padding: 15px; margin-top: 20px;">
            <p style="margin: 0; font-size: 13px; color: #856404; line-height: 1.6;">
              <strong>Nota:</strong> Puoi riutilizzare la stessa foto per più prodotti. Ad esempio, una foto può essere selezionata sia per l'album che per le stampe.
            </p>
          </div>
          
          ${selectionDeadline ? `
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e8d5c4;">
            <p style="margin: 0; font-size: 14px; color: #dc3545; text-align: center;">
              <strong>Scadenza Selezione:</strong> ${selectionDeadline}
            </p>
          </div>
          ` : ''}
        </div>
        ` : `
        <!-- Single-Product Selection -->
        <div style="background: linear-gradient(to right, #f9f7f4, #ffffff); border: 2px solid #e8d5c4; border-radius: 12px; padding: 30px; margin: 35px 0; text-align: center;">
          <div style="margin-bottom: 25px;">
            <div style="display: inline-block; background: #8b9a8e; color: white; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
              Obiettivo Selezione
            </div>
          </div>
          
          <p style="margin: 20px 0; font-size: 18px; color: #555;">
            Seleziona le tue <strong style="color: #8b5a3c; font-size: 24px;">${requiredPhotoCount} foto</strong> preferite per l'album
          </p>
          
          ${selectionDeadline ? `
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px dashed #e8d5c4;">
            <p style="margin: 0; font-size: 14px; color: #dc3545;">
              <strong>Scadenza:</strong> ${selectionDeadline}
            </p>
          </div>
          ` : ''}
        </div>
        `}

        <!-- How It Works -->
        <div style="background: #f5f8f5; border-radius: 8px; padding: 25px; margin: 35px 0;">
          <h4 style="color: #8b9a8e; font-size: 14px; font-weight: 700; margin: 0 0 18px 0; letter-spacing: 1px; text-transform: uppercase;">
            Come Funziona la Selezione
          </h4>
          
          <div style="position: relative; padding-left: 0;">
            <div style="margin-bottom: 15px; padding-left: 30px; position: relative;">
              <span style="position: absolute; left: 0; top: 2px; width: 20px; height: 20px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700;">1</span>
              <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
                Apri la galleria cliccando il pulsante qui sotto
              </p>
            </div>
            
            <div style="margin-bottom: 15px; padding-left: 30px; position: relative;">
              <span style="position: absolute; left: 0; top: 2px; width: 20px; height: 20px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700;">2</span>
              <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
                Sfoglia con calma tutte le foto del tuo shooting
              </p>
            </div>
            
            <div style="margin-bottom: 15px; padding-left: 30px; position: relative;">
              <span style="position: absolute; left: 0; top: 2px; width: 20px; height: 20px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700;">3</span>
              <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
                Clicca sul cuore sulle tue ${requiredPhotoCount} foto preferite
              </p>
            </div>
            
            <div style="margin-bottom: 15px; padding-left: 30px; position: relative;">
              <span style="position: absolute; left: 0; top: 2px; width: 20px; height: 20px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700;">4</span>
              <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
                Monitora il contatore in alto (es. 15/${requiredPhotoCount}) mentre selezioni
              </p>
            </div>
            
            <div style="padding-left: 30px; position: relative;">
              <span style="position: absolute; left: 0; top: 2px; width: 20px; height: 20px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700;">5</span>
              <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
                Quando hai finito, clicca su "Conferma Selezione"
              </p>
            </div>
          </div>
        </div>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 40px 0;">
          <a href="${galleryUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #8b5a3c 0%, #c9a961 100%); 
                    color: white; padding: 18px 45px; text-decoration: none; border-radius: 50px; 
                    font-weight: 600; font-size: 16px; letter-spacing: 0.5px; text-transform: uppercase;
                    box-shadow: 0 4px 15px rgba(139, 90, 60, 0.3);">
            Inizia a Selezionare le Foto
          </a>
        </div>

        <!-- Closing Message -->
        <div style="text-align: center; margin: 40px 0 30px 0; padding: 25px; border-top: 1px solid #e8d5c4; border-bottom: 1px solid #e8d5c4;">
          <p style="font-size: 16px; color: #8b5a3c; font-style: italic; line-height: 1.8; margin: 0;">
            Prenditi il tempo necessario per scegliere le foto che ami di più - saranno i ricordi che guarderai per sempre
          </p>
        </div>
        `}
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

/**
 * POST /api/email/gallery-ready
 * Invia email "Galleria Pronta" al cliente dopo creazione galleria con selezione foto
 */
router.post("/gallery-ready", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteNome,
      galleryName,
      galleryUrl,
      requiredPhotoCount,
      selectionDeadline,
      photoCount,
      productRequirements
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteNome || !galleryName || !galleryUrl || !requiredPhotoCount) {
      return res.status(400).json({
        error: "Parametri mancanti per invio email galleria pronta"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createGalleryReadyEmailHTML(
      clienteNome,
      galleryName,
      galleryUrl,
      requiredPhotoCount,
      selectionDeadline,
      photoCount || 0,
      studioInfo,
      productRequirements
    );

    const subject = `La tua galleria è pronta - Seleziona le ${requiredPhotoCount} foto!`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Galleria Pronta" inviata a ${recipientEmail} per galleria ${galleryName}`
    );

    res.status(200).json({
      success: true,
      message: "Gallery ready email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore gallery-ready email:", error);
    res.status(500).json({
      error: "Errore invio email galleria pronta"
    });
  }
});

/**
 * Email template: Selection Completed (Task 16)
 * Notifica admin quando cliente completa selezione foto
 */
export function createSelectionCompletedEmailHTML(
  galleryName: string,
  clienteName: string,
  photoCount: number,
  workspaceUrl: string,
  studioInfo?: { name: string; email: string; phone: string; address: string },
  productAssignments?: Array<{ prodottoNome: string; assignedCount: number; requiredCount: number }>
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
    phone: "+39 334 7103142",
    address: ""
  };
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">✅ Selezione Foto Completata!</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 16px; font-weight: bold; color: #155724;">
            🎉 Grande notizia! Il cliente ha completato la selezione!
          </p>
        </div>
        
        ${productAssignments && productAssignments.length > 0 ? `
        <!-- Multi-Product Assignments -->
        <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 10px 0; font-size: 14px;">
            <strong>Galleria:</strong> ${galleryName}
          </p>
          <p style="margin: 10px 0; font-size: 14px;">
            <strong>Cliente:</strong> ${clienteName}
          </p>
          <p style="margin: 15px 0 10px 0; font-size: 14px; font-weight: bold; color: #8b5a3c;">
            📊 Assegnazioni per Prodotto:
          </p>
          <ul style="margin: 10px 0; padding-left: 20px; font-size: 14px;">
            ${productAssignments.map(prod => {
              const isComplete = prod.assignedCount >= prod.requiredCount;
              return `<li style="margin: 5px 0;">
                ${isComplete ? '✓' : '⚠️'} <strong>${prod.prodottoNome}:</strong> 
                <span style="color: ${isComplete ? '#28a745' : '#ffc107'}; font-weight: bold;">
                  ${prod.assignedCount}/${prod.requiredCount} foto
                </span>
              </li>`;
            }).join('')}
          </ul>
        </div>
        ` : `
        <!-- Legacy Single-Product -->
        <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 10px 0; font-size: 14px;">
            <strong>Galleria:</strong> ${galleryName}
          </p>
          <p style="margin: 10px 0; font-size: 14px;">
            <strong>Cliente:</strong> ${clienteName}
          </p>
          <p style="margin: 10px 0; font-size: 14px;">
            <strong>Foto selezionate:</strong> <span style="color: #8b5a3c; font-size: 18px; font-weight: bold;">${photoCount} foto</span>
          </p>
        </div>
        `}

        <p style="font-size: 16px; margin-bottom: 20px;">
          Il cliente ha confermato la selezione delle foto per il suo album. 
          Puoi visualizzare le foto selezionate e i nomi file per Lightroom nel workspace dedicato.
        </p>

        <div style="text-align: center; margin: 25px 0;">
          <a href="${workspaceUrl}" style="display: inline-block; background: #8b5a3c; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
            📋 Vai al Workspace Galleria
          </a>
        </div>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-top: 20px;">
          <p style="margin: 0; font-size: 14px; color: #856404;">
            💡 <strong>Prossimi passi:</strong><br>
            1. Visualizza le foto selezionate nel tab "Selezioni Cliente"<br>
            2. Copia i nomi file per importare in Lightroom<br>
            3. Procedi con la preparazione dell'album
          </p>
        </div>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
      </div>
    </div>
  `;
}

/**
 * POST /api/email/selection-completed (Task 17)
 * Invia notifica admin quando cliente completa selezione
 */
router.post("/selection-completed", async (req, res) => {
  try {
    const {
      galleryId,
      galleryName,
      clienteName,
      photoCount,
      workspaceUrl,
      productAssignments
    } = req.body;

    // Validazioni
    if (!galleryId || !galleryName || !clienteName || !photoCount || !workspaceUrl) {
      return res.status(400).json({
        error: "Parametri mancanti per email selection completed"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();
    
    // Email sempre a admin
    const adminEmail = studioInfo.email;

    const htmlContent = createSelectionCompletedEmailHTML(
      galleryName,
      clienteName,
      photoCount,
      workspaceUrl,
      studioInfo,
      productAssignments
    );

    const subject = `Selezione Completata - ${galleryName} (${clienteName})`;

    await sendGmailEmail(adminEmail, subject, htmlContent);

    console.log(
      `✅ Email "Selection Completed" inviata a admin per galleria ${galleryName}`
    );

    res.status(200).json({
      success: true,
      message: "Selection completed email sent to admin",
      recipientEmail: adminEmail
    });
  } catch (error) {
    console.error("❌ Errore selection-completed email:", error);
    res.status(500).json({
      error: "Errore invio email selection completed"
    });
  }
});

/**
 * Email template: Request Selection Modification
 * Cliente richiede modifica selezione foto già completata
 */
export function createRequestModificationEmailHTML(
  galleryName: string,
  galleryCode: string,
  userName: string,
  userEmail: string,
  requiredPhotoCount: number,
  currentSelectionCount: number,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
    phone: "+39 334 7103142",
    address: ""
  };
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">✏️ Richiesta Modifica Selezione Foto</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 16px; font-weight: bold; color: #856404;">
            📧 Un cliente ha richiesto di modificare la sua selezione foto
          </p>
        </div>
        
        <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 10px 0; font-size: 14px;">
            <strong>Galleria:</strong> ${galleryName} (${galleryCode})
          </p>
          <p style="margin: 10px 0; font-size: 14px;">
            <strong>Cliente:</strong> ${userName}
          </p>
          <p style="margin: 10px 0; font-size: 14px;">
            <strong>Email Cliente:</strong> <a href="mailto:${userEmail}" style="color: #8b5a3c;">${userEmail}</a>
          </p>
          <p style="margin: 10px 0; font-size: 14px;">
            <strong>Selezione attuale:</strong> ${currentSelectionCount}/${requiredPhotoCount} foto confermate
          </p>
        </div>

        <p style="font-size: 16px; margin-bottom: 20px;">
          Il cliente ha richiesto di poter modificare la selezione delle foto già confermate. 
          Contatta il cliente per comprendere le sue esigenze e gestire la richiesta.
        </p>

        <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin-top: 20px;">
          <p style="margin: 0; font-size: 14px; color: #0c5460;">
            💡 <strong>Azioni suggerite:</strong><br>
            1. Contatta il cliente via email o telefono<br>
            2. Comprendi quali foto desidera cambiare<br>
            3. Se necessario, riabilita la selezione dall'admin panel<br>
            4. Conferma le modifiche con il cliente
          </p>
        </div>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
      </div>
    </div>
  `;
}

/**
 * POST /api/email/request-selection-modification
 * Invia notifica admin quando cliente richiede modifica selezione
 */
router.post("/request-selection-modification", async (req, res) => {
  try {
    const {
      galleryId,
      galleryCode,
      galleryName,
      userEmail,
      userName,
      requiredPhotoCount,
      currentSelectionCount
    } = req.body;

    // Validazioni
    if (!galleryId || !galleryName || !userEmail || !userName) {
      return res.status(400).json({
        error: "Parametri mancanti per richiesta modifica selezione"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();
    
    // Email sempre a admin
    const adminEmail = studioInfo.email;

    const htmlContent = createRequestModificationEmailHTML(
      galleryName,
      galleryCode || galleryId,
      userName,
      userEmail,
      requiredPhotoCount || 0,
      currentSelectionCount || 0,
      studioInfo
    );

    const subject = `Richiesta Modifica Selezione - ${galleryName} (${userName})`;

    await sendGmailEmail(adminEmail, subject, htmlContent);

    console.log(
      `✅ Email "Request Modification" inviata a admin per galleria ${galleryName}`
    );

    res.status(200).json({
      success: true,
      message: "Request modification email sent to admin",
      recipientEmail: adminEmail
    });
  } catch (error) {
    console.error("❌ Errore request-modification email:", error);
    res.status(500).json({
      error: "Errore invio email richiesta modifica"
    });
  }
});

/**
 * Email template: Selection Deadline Reminder (Task 18)
 * Reminder 1 giorno prima scadenza selezione
 */
export function createSelectionDeadlineReminderEmailHTML(
  clienteName: string,
  galleryName: string,
  galleryUrl: string,
  requiredPhotoCount: number,
  selectedPhotoCount: number,
  deadlineDate: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
    phone: "+39 334 7103142",
    address: ""
  };
  
  const remainingPhotos = requiredPhotoCount - selectedPhotoCount;
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">⏰ Reminder: Scadenza Selezione Foto</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 16px; font-weight: bold; color: #856404;">
            ⏰ La scadenza per selezionare le foto è domani: <strong>${deadlineDate}</strong>
          </p>
        </div>

        <p style="font-size: 16px; margin-bottom: 20px;">
          Questo è un gentile promemoria per la selezione delle foto della galleria "<strong style="color: #8b5a3c;">${galleryName}</strong>".
        </p>

        <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border: 2px solid #8b5a3c;">
          <p style="text-align: center; margin: 10px 0;">
            <span style="font-size: 14px; color: #666;">Stato attuale selezione:</span>
          </p>
          <p style="text-align: center; margin: 0;">
            <span style="font-size: 36px; font-weight: bold; color: #8b5a3c;">${selectedPhotoCount} / ${requiredPhotoCount}</span>
          </p>
          <p style="text-align: center; margin: 10px 0; font-size: 14px; color: #666;">
            ${remainingPhotos > 0 
              ? `Mancano ancora <strong style="color: #d9534f;">${remainingPhotos} foto</strong> da selezionare` 
              : '✅ Hai selezionato tutte le foto! Ricordati di confermare la selezione.'}
          </p>
        </div>

        ${remainingPhotos > 0 ? `
          <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #0c5460;">
              💡 <strong>Come completare la selezione:</strong><br>
              1. Apri la galleria con il bottone qui sotto<br>
              2. Clicca sul cuore ❤️ sulle tue ${remainingPhotos} foto preferite rimanenti<br>
              3. Clicca su "Conferma Selezione" quando hai finito
            </p>
          </div>
        ` : `
          <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #155724;">
              ✅ <strong>Hai selezionato tutte le ${requiredPhotoCount} foto!</strong><br>
              Non dimenticare di cliccare su "<strong>Conferma Selezione</strong>" per finalizzare la tua scelta.
            </p>
          </div>
        `}

        <div style="text-align: center; margin: 25px 0;">
          <a href="${galleryUrl}" style="display: inline-block; background: #8b5a3c; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
            📸 Vai alla Galleria
          </a>
        </div>

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px; font-style: italic;">
          Serve aiuto? Contattaci! Siamo qui per assisterti. 😊
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
 * POST /api/email/acconto-received
 * Invia email al cliente quando viene registrato un acconto
 */
router.post("/acconto-received", async (req, res) => {
  try {
    const {
      recipientEmail,
      clienteName,
      prodottoNome,
      accontoImporto,
      accontoTotale,
      saldoRimanente,
      metodo,
      note,
      totaleOrdine,
      transactions
    } = req.body;

    // Validazioni
    if (!recipientEmail || !clienteName || !prodottoNome || accontoImporto === undefined || accontoTotale === undefined || saldoRimanente === undefined || !metodo) {
      return res.status(400).json({
        error: "Parametri mancanti per email acconto ricevuto"
      });
    }

    // Recupera dati contatto studio
    const studioInfo = await getStudioContactInfo();

    const htmlContent = createOrderAccontoRicevutoEmailHTML(
      clienteName,
      prodottoNome,
      accontoImporto,
      accontoTotale,
      saldoRimanente,
      metodo,
      note,
      studioInfo,
      totaleOrdine,
      transactions
    );

    const subject = `Acconto Ricevuto - ${prodottoNome}`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(
      `✅ Email "Acconto Ricevuto" inviata a ${recipientEmail} per ordine ${prodottoNome}`
    );

    res.status(200).json({
      success: true,
      message: "Acconto received email sent successfully",
      recipientEmail
    });
  } catch (error) {
    console.error("❌ Errore acconto-received email:", error);
    res.status(500).json({
      error: "Errore invio email acconto ricevuto"
    });
  }
});

/**
 * Template HTML per email creazione ordine
 * Inviata al cliente quando viene creato un nuovo ordine
 */
function createOrderCreatedEmailHTML(
  clienteName: string,
  prodottoNome: string,
  totale: number,
  acconto: number,
  saldo: number,
  prodotti: Array<{ nome: string; prezzo: number; quantita: number }>,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
                <td style="padding: 8px 0;">${p.nome} (x${p.quantita})</td>
                <td style="padding: 8px 0; text-align: right;">${formatCurrency(p.prezzo * p.quantita)}</td>
              </tr>
            `).join('')}
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
 * Template HTML per email invio preventivo
 * Inviata al cliente quando viene creato e inviato un preventivo
 * ESPORTATA per uso in quote-routes.ts
 */
export function createQuoteSentEmailHTML(
  clienteName: string,
  nomeEvento: string,
  quoteType: 'fisso' | 'variabile',
  totalAmount: number,
  productsCount: number,
  quoteUrl: string,
  eventDate?: string,
  eventLocation?: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      
      <!-- Hero Header -->
      <div style="background: linear-gradient(135deg, #8b5a3c 0%, #c9a961 100%); padding: 50px 30px; text-align: center;">
        <div style="background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 30px;">
          <h1 style="color: #ffffff; font-size: 32px; font-weight: 300; margin: 0 0 15px 0; letter-spacing: 2px; text-transform: uppercase;">
            Preventivo Personalizzato
          </h1>
          <div style="width: 60px; height: 2px; background: #c9a961; margin: 0 auto 20px auto;"></div>
          <p style="color: rgba(255,255,255,0.95); font-size: 18px; margin: 0; font-weight: 300; line-height: 1.6;">
            La tua proposta dedicata per ${nomeEvento}
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
          Abbiamo preparato con cura un preventivo personalizzato per <strong style="color: #8b5a3c;">${nomeEvento}</strong>. 
          Ogni dettaglio è stato pensato per soddisfare le tue esigenze.
        </p>

        ${eventDate || eventLocation ? `
        <!-- Event Details -->
        <div style="background: linear-gradient(to right, #f9f7f4, #ffffff); border: 2px solid #e8d5c4; border-radius: 12px; padding: 25px; margin: 30px 0;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="display: inline-block; background: #8b9a8e; color: white; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
              Dettagli Evento
            </div>
          </div>
          ${eventDate ? `
          <div style="margin: 12px 0; font-size: 15px; color: #555;">
            <span style="font-weight: 600; color: #666;">Data:</span> 
            <span style="float: right; color: #333; font-weight: 500;">${eventDate}</span>
          </div>
          ` : ''}
          ${eventLocation ? `
          <div style="margin: 12px 0; font-size: 15px; color: #555; ${eventDate ? 'border-top: 1px solid #e8d5c4; padding-top: 12px;' : ''}">
            <span style="font-weight: 600; color: #666;">Location:</span> 
            <span style="float: right; color: #333; font-weight: 500;">${eventLocation}</span>
          </div>
          ` : ''}
        </div>
        ` : ''}

        <!-- Quote Summary -->
        <div style="background: linear-gradient(to right, #f9f7f4, #ffffff); border: 2px solid #e8d5c4; border-radius: 12px; padding: 30px; margin: 35px 0; box-shadow: 0 4px 12px rgba(139, 90, 60, 0.08);">
          <div style="text-align: center; margin-bottom: 25px;">
            <div style="display: inline-block; background: #8b9a8e; color: white; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
              Riepilogo Preventivo
            </div>
          </div>
          
          <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
            <tr>
              <td style="padding: 15px 0; border-bottom: 1px solid #e8d5c4; color: #666;">
                <span style="font-weight: 600;">Tipologia</span>
              </td>
              <td style="padding: 15px 0; border-bottom: 1px solid #e8d5c4; text-align: right; color: #333; font-weight: 500;">
                ${quoteType === 'fisso' ? 'Prezzo Fisso' : 'Preventivo Variabile'}
              </td>
            </tr>
            <tr>
              <td style="padding: 15px 0; border-bottom: 1px solid #e8d5c4; color: #666;">
                <span style="font-weight: 600;">Prodotti/Servizi</span>
              </td>
              <td style="padding: 15px 0; border-bottom: 1px solid #e8d5c4; text-align: right; color: #333; font-weight: 500;">
                ${productsCount}
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 0 5px 0; color: #666;">
                <span style="font-weight: 600;">${quoteType === 'fisso' ? 'Totale' : 'Importo Base'}</span>
              </td>
              <td style="padding: 20px 0 5px 0; text-align: right; color: #8b5a3c; font-weight: 700; font-size: 22px;">
                ${formatCurrency(totalAmount)}
              </td>
            </tr>
          </table>
        </div>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 40px 0;">
          <a href="${quoteUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #8b5a3c 0%, #c9a961 100%); 
                    color: white; padding: 16px 40px; text-decoration: none; border-radius: 50px; 
                    font-weight: 600; font-size: 15px; letter-spacing: 0.5px; text-transform: uppercase;
                    box-shadow: 0 4px 15px rgba(139, 90, 60, 0.3);">
            Visualizza e Firma Preventivo
          </a>
        </div>

        <!-- Next Steps -->
        <div style="background: #f5f8f5; border-radius: 8px; padding: 25px; margin: 35px 0;">
          <h4 style="color: #8b9a8e; font-size: 14px; font-weight: 700; margin: 0 0 18px 0; letter-spacing: 1px; text-transform: uppercase;">
            I Prossimi Passi
          </h4>
          
          <div style="position: relative; padding-left: 0;">
            <div style="margin-bottom: 15px; padding-left: 30px; position: relative;">
              <span style="position: absolute; left: 0; top: 2px; width: 20px; height: 20px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700;">1</span>
              <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
                Clicca sul pulsante sopra per visualizzare il preventivo completo
              </p>
            </div>
            
            ${quoteType === 'variabile' ? `
            <div style="margin-bottom: 15px; padding-left: 30px; position: relative;">
              <span style="position: absolute; left: 0; top: 2px; width: 20px; height: 20px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700;">2</span>
              <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
                Seleziona i prodotti e servizi che desideri includere
              </p>
            </div>
            ` : ''}
            
            <div style="margin-bottom: 15px; padding-left: 30px; position: relative;">
              <span style="position: absolute; left: 0; top: 2px; width: 20px; height: 20px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700;">${quoteType === 'variabile' ? '3' : '2'}</span>
              <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
                Leggi attentamente le condizioni contrattuali
              </p>
            </div>
            
            <div style="padding-left: 30px; position: relative;">
              <span style="position: absolute; left: 0; top: 2px; width: 20px; height: 20px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700;">${quoteType === 'variabile' ? '4' : '3'}</span>
              <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
                Firma digitalmente per confermare l'accettazione
              </p>
            </div>
          </div>
        </div>

        <!-- Closing Message -->
        <div style="text-align: center; margin: 40px 0 30px 0; padding: 25px; border-top: 1px solid #e8d5c4; border-bottom: 1px solid #e8d5c4;">
          <p style="font-size: 16px; color: #8b5a3c; font-style: italic; line-height: 1.8; margin: 0;">
            Per qualsiasi domanda o chiarimento, siamo a tua completa disposizione
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

/**
 * Template HTML per email conferma firma preventivo
 * Inviata al cliente quando firma il preventivo
 * ESPORTATA per uso in quote-routes.ts
 */
export function createQuoteAcceptedEmailHTML(
  clienteName: string,
  nomeEvento: string,
  totalAmount: number,
  signedAt: string,
  nextPaymentAmount?: number,
  nextPaymentDate?: string,
  portalUrl?: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      
      <!-- Hero Header - Luxury Design -->
      <div style="background: linear-gradient(135deg, #8b5a3c 0%, #c9a961 100%); padding: 50px 30px; text-align: center;">
        <div style="background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 30px; backdrop-filter: blur(10px);">
          <h1 style="color: #ffffff; font-size: 32px; font-weight: 300; margin: 0 0 15px 0; letter-spacing: 2px; text-transform: uppercase;">
            Contratto Firmato
          </h1>
          <div style="width: 60px; height: 2px; background: #c9a961; margin: 0 auto 20px auto;"></div>
          <p style="color: rgba(255,255,255,0.95); font-size: 18px; margin: 0; font-weight: 300; line-height: 1.6;">
            Il tuo viaggio fotografico inizia qui
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
          È con grande piacere che confermiamo l'accettazione del preventivo per 
          <strong style="color: #8b5a3c;">${nomeEvento}</strong>. 
          Il nostro team è entusiasta di collaborare con te per creare ricordi indimenticabili.
        </p>

        <!-- Contract Summary Card -->
        <div style="background: linear-gradient(to right, #f9f7f4, #ffffff); border: 2px solid #e8d5c4; border-radius: 12px; padding: 30px; margin: 35px 0; box-shadow: 0 4px 12px rgba(139, 90, 60, 0.08);">
          <div style="text-align: center; margin-bottom: 25px;">
            <div style="display: inline-block; background: #8b9a8e; color: white; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
              Dettagli Contratto
            </div>
          </div>
          
          <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
            <tr>
              <td style="padding: 15px 0; border-bottom: 1px solid #e8d5c4; color: #666;">
                <span style="font-weight: 600;">Data Firma</span>
              </td>
              <td style="padding: 15px 0; border-bottom: 1px solid #e8d5c4; text-align: right; color: #333; font-weight: 500;">
                ${signedAt}
              </td>
            </tr>
            <tr>
              <td style="padding: 15px 0; color: #666;">
                <span style="font-weight: 600;">Importo Totale</span>
              </td>
              <td style="padding: 15px 0; text-align: right; color: #8b5a3c; font-weight: 700; font-size: 20px;">
                ${formatCurrency(totalAmount)}
              </td>
            </tr>
          </table>
        </div>

        ${nextPaymentAmount && nextPaymentDate ? `
        <!-- Next Payment Section -->
        <div style="background: linear-gradient(135deg, #fff8e7 0%, #ffffff 100%); border-left: 4px solid #c9a961; border-radius: 8px; padding: 25px; margin: 30px 0;">
          <h3 style="color: #8b5a3c; font-size: 16px; font-weight: 600; margin: 0 0 20px 0; letter-spacing: 0.5px; text-transform: uppercase;">
            Prossimo Pagamento
          </h3>
          
          <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
            <tr>
              <td style="padding: 10px 0; color: #666;">Importo Dovuto</td>
              <td style="padding: 10px 0; text-align: right; color: #8b5a3c; font-weight: 700; font-size: 18px;">
                ${formatCurrency(nextPaymentAmount)}
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #666;">Scadenza</td>
              <td style="padding: 10px 0; text-align: right; color: #333; font-weight: 600;">
                ${nextPaymentDate}
              </td>
            </tr>
          </table>
          
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e8d5c4;">
            <p style="margin: 0; font-size: 13px; color: #999; line-height: 1.6;">
              Riceverai una comunicazione separata con le modalità di pagamento
            </p>
          </div>
        </div>
        ` : ''}

        ${portalUrl ? `
        <!-- CTA Button -->
        <div style="text-align: center; margin: 40px 0;">
          <a href="${portalUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #8b5a3c 0%, #c9a961 100%); 
                    color: white; padding: 16px 40px; text-decoration: none; border-radius: 50px; 
                    font-weight: 600; font-size: 15px; letter-spacing: 0.5px; text-transform: uppercase;
                    box-shadow: 0 4px 15px rgba(139, 90, 60, 0.3); transition: all 0.3s ease;">
            Visualizza Contratto Firmato
          </a>
        </div>
        ` : ''}

        <!-- Next Steps -->
        <div style="background: #f5f8f5; border-radius: 8px; padding: 25px; margin: 35px 0;">
          <h4 style="color: #8b9a8e; font-size: 14px; font-weight: 700; margin: 0 0 18px 0; letter-spacing: 1px; text-transform: uppercase;">
            I Prossimi Passi
          </h4>
          
          <div style="position: relative; padding-left: 0;">
            <div style="margin-bottom: 15px; padding-left: 30px; position: relative;">
              <span style="position: absolute; left: 0; top: 2px; width: 20px; height: 20px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700;">1</span>
              <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
                Ti contatteremo a breve per confermare tutti i dettagli organizzativi
              </p>
            </div>
            
            ${nextPaymentAmount ? `
            <div style="margin-bottom: 15px; padding-left: 30px; position: relative;">
              <span style="position: absolute; left: 0; top: 2px; width: 20px; height: 20px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700;">2</span>
              <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
                Riceverai le istruzioni per il pagamento dell'acconto
              </p>
            </div>
            ` : ''}
            
            <div style="margin-bottom: 15px; padding-left: 30px; position: relative;">
              <span style="position: absolute; left: 0; top: 2px; width: 20px; height: 20px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700;">${nextPaymentAmount ? '3' : '2'}</span>
              <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
                Resteremo in contatto con aggiornamenti regolari sul progetto
              </p>
            </div>
            
            <div style="padding-left: 30px; position: relative;">
              <span style="position: absolute; left: 0; top: 2px; width: 20px; height: 20px; background: #8b9a8e; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 700;">${nextPaymentAmount ? '4' : '3'}</span>
              <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
                Siamo sempre disponibili per qualsiasi domanda o necessità
              </p>
            </div>
          </div>
        </div>

        <!-- Closing Message -->
        <div style="text-align: center; margin: 40px 0 30px 0; padding: 25px; border-top: 1px solid #e8d5c4; border-bottom: 1px solid #e8d5c4;">
          <p style="font-size: 16px; color: #8b5a3c; font-style: italic; line-height: 1.8; margin: 0;">
            Non vediamo l'ora di iniziare questo viaggio fotografico insieme a te
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
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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

/**
 * Template HTML per email conferma pagamento ricevuto (ordini semplici acconto/saldo)
 * Inviata al cliente quando admin registra un pagamento ordine
 * ESPORTATA per uso in server order routes (diversa da createPaymentReceivedEmailHTML per payment schedules)
 */
export function createOrderPaymentReceivedEmailHTML(
  clienteName: string,
  nomeEvento: string,
  paymentType: 'acconto' | 'saldo',
  paymentAmount: number,
  paymentMethod: string,
  paymentDate: string,
  remainingBalance?: number,
  nextPaymentDate?: string,
  notes?: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
    phone: "+39 334 7103142",
    address: ""
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };
  
  const paymentTypeLabel = paymentType === 'acconto' ? 'Acconto' : 'Saldo Finale';
  const methodLabel = {
    'contante': 'Contante',
    'carta': 'Carta di Credito',
    'bonifico': 'Bonifico Bancario',
    'paypal': 'PayPal'
  }[paymentMethod] || paymentMethod;
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #28a745; text-align: center;">Pagamento Ricevuto</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Ti confermiamo di aver ricevuto il tuo <strong style="color: #28a745;">${paymentTypeLabel}</strong> 
          per <strong style="color: #8b5a3c;">${nomeEvento}</strong>!
        </p>
        
        <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
          <h3 style="color: #28a745; margin-top: 0; margin-bottom: 15px;">Dettagli Pagamento</h3>
          <table style="width: 100%; font-size: 14px; color: #333;">
            <tr>
              <td style="padding: 8px 0;">Tipo:</td>
              <td style="text-align: right; font-weight: bold;">${paymentTypeLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">Importo:</td>
              <td style="text-align: right; font-weight: bold; color: #28a745; font-size: 18px;">
                ${formatCurrency(paymentAmount)}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">Metodo:</td>
              <td style="text-align: right; font-weight: bold;">${methodLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">Data:</td>
              <td style="text-align: right; font-weight: bold;">${paymentDate}</td>
            </tr>
            ${notes ? `
            <tr>
              <td colspan="2" style="padding-top: 12px; border-top: 1px solid #ddd;">
                <p style="margin: 8px 0; font-size: 13px; font-style: italic; color: #666;">
                  <strong>Note:</strong> ${notes}
                </p>
              </td>
            </tr>
            ` : ''}
          </table>
        </div>

        ${remainingBalance && remainingBalance > 0 ? `
        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #e0e0e0;">
          <h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">Saldo Rimanente</h3>
          <table style="width: 100%; font-size: 14px; color: #333;">
            <tr>
              <td style="padding: 8px 0;">Da saldare:</td>
              <td style="text-align: right; font-weight: bold; color: #8b5a3c; font-size: 16px;">
                ${formatCurrency(remainingBalance)}
              </td>
            </tr>
            ${nextPaymentDate ? `
            <tr>
              <td style="padding: 8px 0;">Scadenza prevista:</td>
              <td style="text-align: right; font-weight: bold;">${nextPaymentDate}</td>
            </tr>
            ` : ''}
          </table>
        </div>
        ` : `
        <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #0c5460; text-align: center; font-weight: 600;">
            Pagamento completato! Nessun saldo residuo.
          </p>
        </div>
        `}

        <div style="background: #e7f3ff; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0;">
          <h4 style="color: #0056b3; margin-top: 0; margin-bottom: 10px;">Prossimi Passi</h4>
          <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #0c5460;">
            ${remainingBalance && remainingBalance > 0 
              ? '<li>Riceverai un promemoria per il saldo finale prima della scadenza</li>'
              : '<li>Procederemo con la lavorazione del tuo progetto</li>'
            }
            <li>Ti terremo aggiornato sullo stato dei lavori via email</li>
            <li>Per qualsiasi domanda, non esitare a contattarci!</li>
          </ol>
        </div>

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
          Grazie per la tua fiducia! Siamo entusiasti di lavorare al tuo progetto.
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
 * Template HTML per email cancellazione acconto
 * Inviata al cliente quando un acconto viene cancellato/stornato
 */
function createAccontoCancelledEmailHTML(
  clienteName: string,
  prodottoNome: string,
  accontoImporto: number,
  nuovoAccontoTotale: number,
  nuovoSaldo: number,
  motivo?: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
      <h2 style="color: #6c757d; text-align: center;">Acconto Annullato</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Ti informiamo che un acconto per l'ordine <strong style="color: #8b5a3c;">${prodottoNome}</strong> 
          è stato <strong>annullato</strong>.
        </p>
        
        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #dc3545; margin-top: 0; margin-bottom: 15px;">Dettagli Annullamento</h3>
          <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 10px 0;">
            <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #721c24;">
              Acconto annullato: ${formatCurrency(accontoImporto)}
            </p>
            ${motivo ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #721c24; font-style: italic;">Motivo: ${motivo}</p>` : ''}
          </div>
        </div>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <h4 style="color: #856404; margin-top: 0; margin-bottom: 10px;">Saldo Aggiornato</h4>
          <table style="width: 100%; font-size: 14px; color: #333; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 8px 0;">Acconto totale:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatCurrency(nuovoAccontoTotale)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 8px 0;">Saldo rimanente:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #856404;">${formatCurrency(nuovoSaldo)}</td>
            </tr>
          </table>
        </div>

        <div style="background: #e7f3ff; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #0c5460;">
            Se hai domande riguardo questa modifica, non esitare a contattarci via email o telefono. 
            Saremo felici di chiarire ogni dubbio.
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
      prodotti
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
      studioInfo
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
    
    // Costruisci URL assoluto direttamente sul server per evitare problemi con Gmail
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const host = req.get('x-forwarded-host') || req.get('host') || 'memoriesospese.replit.app';
    const galleryUrl = `${protocol}://${host}/special-gallery`;
    
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

    // Inizializza Firebase Admin


    // QUERY TUTTE LE GALLERIE CON TEMA SPECIALE (usando Firebase Admin SDK)
    const galleriesSnapshot = await db.collection('galleries')
      .where('specialTheme', '!=', null)
      .get();

    if (galleriesSnapshot.empty) {
      console.log("❌ Nessuna galleria speciale trovata");
      return res.status(200).json({
        result: { valid: false, message: "No special galleries found" }
      });
    }

    // Cerca galleria con PIN corrispondente nella collection protetta
    for (const galleryDoc of galleriesSnapshot.docs) {
      const galleryId = galleryDoc.id;
      const galleryData = galleryDoc.data();
      
      // Recupera PIN da collection protetta
      const secretsDoc = await db.collection('gallerySecrets').doc(galleryId).get();
      
      if (secretsDoc.exists) {
        const secretData = secretsDoc.data();
        const correctPin = secretData?.specialPin;

        // Verifica PIN
        if (correctPin && correctPin.trim() === pin.trim()) {
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
 * SICURO: legge password da collection protetta `gallerySecrets` (admin-only)
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

    // VERIFICA ESISTENZA GALLERIA (documento pubblico)
    const galleryDoc = await getFirestoreDocument(`galleries/${galleryId}`);
    if (!galleryDoc) {
      console.log(`❌ Galleria ${galleryId} non trovata`);
      return res.status(404).json({
        error: { code: "not-found", message: "Gallery not found" }
      });
    }

    // RECUPERA PASSWORD da collection protetta `gallerySecrets` (admin-only access)
    const secretDoc = await getFirestoreDocument(`gallerySecrets/${galleryId}`);
    
    // Se non esiste documento secrets O non ha password, accesso libero
    const correctPassword = secretDoc?.fields?.password?.stringValue;
    if (!correctPassword) {
      console.log(`✅ Galleria ${galleryId} senza password, accesso libero`);
      return res.status(200).json({
        result: { valid: true, message: "Gallery has no password, access granted" }
      });
    }

    // Verifica password (case-sensitive)
    const isValid = password.trim() === correctPassword.trim();

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
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
          <h4 style="color: #084298; margin-top: 0; margin-bottom: 10px;">📋 Riepilogo Contratto</h4>
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
 * Template HTML per email pagamento ricevuto (piano rate)
 * ESPORTATA per uso in payment schedule management
 */
export function createPaymentReceivedEmailHTML(
  clienteName: string,
  jobName: string,
  paymentDescription: string,
  paymentAmount: number,
  paymentMethod: string,
  paymentDate: Date,
  remainingBalance: number,
  nextPayment?: { importo: number; dataScadenza: Date; descrizione: string },
  allPayments?: Array<{ 
    importo: number; 
    dataScadenza: Date; 
    descrizione: string; 
    stato: 'pending' | 'paid' | 'overdue';
    dataPagamento?: Date;
  }>,
  portalLink?: string,
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

  const formatMethod = (method: string) => {
    const methods: Record<string, string> = {
      'contante': 'Contante',
      'carta': 'Carta',
      'bonifico': 'Bonifico',
      'paypal': 'PayPal',
      'stripe': 'Carta (Stripe)'
    };
    return methods[method.toLowerCase()] || method;
  };

  const getStatusBadge = (stato: string) => {
    const badges = {
      'paid': { bg: '#d1e7dd', color: '#0f5132', text: '✓ Pagato' },
      'pending': { bg: '#fff3cd', color: '#856404', text: '⏳ In attesa' },
      'overdue': { bg: '#f8d7da', color: '#842029', text: '⚠️ Scaduto' }
    };
    const badge = badges[stato as keyof typeof badges] || badges.pending;
    return `<span style="background: ${badge.bg}; color: ${badge.color}; padding: 4px 8px; border-radius: 3px; font-size: 11px; font-weight: bold;">${badge.text}</span>`;
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #28a745; text-align: center;">✅ Pagamento Ricevuto</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Abbiamo ricevuto con successo il tuo pagamento per <strong style="color: #28a745;">${jobName}</strong>. 
          Grazie! 🎉
        </p>
        
        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #28a745;">
          <h3 style="color: #28a745; margin-top: 0; margin-bottom: 15px;">✅ Dettagli Pagamento</h3>
          <div style="background: #d1e7dd; border-left: 4px solid #28a745; padding: 15px; margin: 10px 0;">
            <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: bold; color: #0f5132;">
              ${paymentDescription}: ${formatCurrency(paymentAmount)}
            </p>
            <p style="margin: 0; font-size: 14px; color: #0f5132;">
              Metodo: ${formatMethod(paymentMethod)} • Data: ${formatDate(paymentDate)}
            </p>
          </div>
        </div>

        ${remainingBalance > 0 ? `
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <h4 style="color: #856404; margin-top: 0; margin-bottom: 10px;">💰 Saldo Rimanente</h4>
          <p style="margin: 0 0 15px 0; font-size: 20px; font-weight: bold; color: #856404;">
            ${formatCurrency(remainingBalance)}
          </p>
          ${nextPayment ? `
            <div style="background: rgba(255,255,255,0.5); padding: 10px; border-radius: 3px;">
              <p style="margin: 0 0 5px 0; font-size: 13px; color: #856404;">
                <strong>Prossima scadenza:</strong>
              </p>
              <p style="margin: 0; font-size: 14px; font-weight: bold; color: #856404;">
                ${nextPayment.descrizione}: ${formatCurrency(nextPayment.importo)} - ${formatDate(nextPayment.dataScadenza)}
              </p>
            </div>
          ` : ''}
        </div>
        ` : `
        <div style="background: #d1e7dd; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 16px; font-weight: bold; color: #0f5132;">
            🎉 Tutti i pagamenti completati! Grazie!
          </p>
        </div>
        `}

        ${allPayments && allPayments.length > 0 ? `
        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #e0e0e0;">
          <h4 style="color: #333; margin-top: 0; margin-bottom: 15px;">📋 Stato Pagamenti</h4>
          <table style="width: 100%; font-size: 13px; color: #333; border-collapse: collapse;">
            <thead>
              <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                <th style="padding: 10px; text-align: left;">Rata</th>
                <th style="padding: 10px; text-align: right;">Importo</th>
                <th style="padding: 10px; text-align: center;">Stato</th>
                <th style="padding: 10px; text-align: right;">Scadenza</th>
              </tr>
            </thead>
            <tbody>
              ${allPayments.map((p, i) => `
                <tr style="border-bottom: 1px solid #e0e0e0;">
                  <td style="padding: 10px;">${p.descrizione}</td>
                  <td style="padding: 10px; text-align: right; font-weight: bold;">${formatCurrency(p.importo)}</td>
                  <td style="padding: 10px; text-align: center;">${getStatusBadge(p.stato)}</td>
                  <td style="padding: 10px; text-align: right;">
                    ${p.stato === 'paid' && p.dataPagamento ? formatDate(p.dataPagamento) : formatDate(p.dataScadenza)}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${portalLink ? `
        <div style="text-align: center; margin: 25px 0;">
          <a href="${portalLink}" style="display: inline-block; background-color: #0d6efd; color: white; padding: 14px 35px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
            🔗 Visualizza Stato Pagamenti
          </a>
        </div>
        ` : ''}

        <div style="background: #d1ecf1; border-left: 4px solid #0dcaf0; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #055160;">
            <strong>💡 Ricevuta</strong><br>
            Questa email serve come conferma di pagamento. Conservala per i tuoi archivi.
          </p>
        </div>

        <p style="font-size: 16px; margin-top: 20px;">
          Grazie per la tua fiducia! ❤️
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
 * =============================
 * CONSULENZE EMAIL TEMPLATES
 * =============================
 */

/**
 * Template HTML email: Consulenza Ricevuta
 */
function createConsultationReceivedEmailHTML(
  clienteName: string,
  jobType: string,
  consultationDate: string,
  consultationTime: string,
  studio: any
): string {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 8px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7C9885; font-size: 28px; margin: 0 0 10px 0;">Richiesta Consulenza Ricevuta</h1>
        <p style="color: #8B7355; font-size: 16px; margin: 0;">Grazie per aver scelto ${studio.name}</p>
      </div>

      <div style="background-color: #F5F3EF; padding: 25px; border-radius: 8px; margin-bottom: 25px;">
        <p style="font-size: 16px; color: #333; margin: 0 0 15px 0;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        
        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 20px 0;">
          Abbiamo ricevuto la tua richiesta di consulenza per <strong>${jobType}</strong>. 
          La tua prenotazione è in attesa di conferma.
        </p>

        <div style="background-color: #ffffff; padding: 20px; border-left: 4px solid #C9A87C; border-radius: 4px;">
          <h3 style="color: #7C9885; font-size: 18px; margin: 0 0 15px 0;">📅 Dettagli Consulenza</h3>
          <p style="margin: 8px 0; font-size: 15px; color: #333;">
            <strong>Tipo di lavoro:</strong> ${jobType}
          </p>
          <p style="margin: 8px 0; font-size: 15px; color: #333;">
            <strong>Data:</strong> ${consultationDate}
          </p>
          <p style="margin: 8px 0; font-size: 15px; color: #333;">
            <strong>Orario:</strong> ${consultationTime}
          </p>
        </div>

        <div style="background-color: #FFF9F0; padding: 15px; border-radius: 4px; margin-top: 20px;">
          <p style="font-size: 14px; color: #8B7355; margin: 0;">
            ⏳ <strong>Cosa succede ora?</strong><br>
            Riceverai un'email di conferma non appena approveremo la tua richiesta. 
            Ti contatteremo a breve per tutti i dettagli!
          </p>
        </div>
      </div>

      <p style="font-size: 14px; color: #666; text-align: center;">
        Per qualsiasi domanda, contattaci su WhatsApp al ${studio.phone}
      </p>
      
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
 * Template HTML email: Consulenza Approvata
 */
function createConsultationApprovedEmailHTML(
  clienteName: string,
  jobType: string,
  consultationDate: string,
  consultationTime: string,
  meetingLink: string | null,
  studio: any
): string {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 8px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7C9885; font-size: 28px; margin: 0 0 10px 0;">✅ Consulenza Confermata!</h1>
        <p style="color: #8B7355; font-size: 16px; margin: 0;">La tua consulenza è stata approvata</p>
      </div>

      <div style="background-color: #F0F7F4; padding: 25px; border-radius: 8px; margin-bottom: 25px; border: 2px solid #7C9885;">
        <p style="font-size: 16px; color: #333; margin: 0 0 15px 0;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        
        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 20px 0;">
          Ottima notizia! La tua consulenza per <strong>${jobType}</strong> è stata confermata. 
          Non vediamo l'ora di conoscerti e parlare del tuo progetto!
        </p>

        <div style="background-color: #ffffff; padding: 20px; border-left: 4px solid #7C9885; border-radius: 4px;">
          <h3 style="color: #7C9885; font-size: 18px; margin: 0 0 15px 0;">📅 Appuntamento Confermato</h3>
          <p style="margin: 8px 0; font-size: 15px; color: #333;">
            <strong>Tipo di lavoro:</strong> ${jobType}
          </p>
          <p style="margin: 8px 0; font-size: 15px; color: #333;">
            <strong>Data:</strong> ${consultationDate}
          </p>
          <p style="margin: 8px 0; font-size: 15px; color: #333;">
            <strong>Orario:</strong> ${consultationTime}
          </p>
          ${meetingLink ? `
          <p style="margin: 8px 0; font-size: 15px; color: #333;">
            <strong>Link incontro:</strong> <a href="${meetingLink}" style="color: #7C9885;">${meetingLink}</a>
          </p>
          ` : ''}
        </div>

        <div style="background-color: #FFF9F0; padding: 15px; border-radius: 4px; margin-top: 20px;">
          <p style="font-size: 14px; color: #8B7355; margin: 0;">
            💡 <strong>Preparati per l'incontro:</strong><br>
            Porta con te eventuali idee, ispirazioni o domande. Insieme creeremo qualcosa di speciale!
          </p>
        </div>
      </div>

      <div style="text-align: center; margin-top: 25px;">
        <p style="font-size: 14px; color: #666;">
          L'appuntamento è stato aggiunto al nostro calendario.<br>
          Ti aspettiamo!
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
 * Template HTML email: Consulenza Rifiutata
 */
function createConsultationRejectedEmailHTML(
  clienteName: string,
  jobType: string,
  consultationDate: string,
  consultationTime: string,
  rejectionReason: string | null,
  studio: any
): string {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 8px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #8B7355; font-size: 28px; margin: 0 0 10px 0;">Aggiornamento Consulenza</h1>
        <p style="color: #666; font-size: 16px; margin: 0;">${studio.name}</p>
      </div>

      <div style="background-color: #F5F3EF; padding: 25px; border-radius: 8px; margin-bottom: 25px;">
        <p style="font-size: 16px; color: #333; margin: 0 0 15px 0;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        
        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 20px 0;">
          Purtroppo non possiamo confermare la consulenza per <strong>${jobType}</strong> 
          nella data e orario richiesti.
        </p>

        <div style="background-color: #ffffff; padding: 20px; border-left: 4px solid #C9A87C; border-radius: 4px;">
          <h3 style="color: #8B7355; font-size: 18px; margin: 0 0 15px 0;">📅 Dettagli Richiesta</h3>
          <p style="margin: 8px 0; font-size: 15px; color: #333;">
            <strong>Tipo di lavoro:</strong> ${jobType}
          </p>
          <p style="margin: 8px 0; font-size: 15px; color: #333;">
            <strong>Data richiesta:</strong> ${consultationDate}
          </p>
          <p style="margin: 8px 0; font-size: 15px; color: #333;">
            <strong>Orario richiesto:</strong> ${consultationTime}
          </p>
          ${rejectionReason ? `
          <div style="background-color: #FFF9F0; padding: 12px; border-radius: 4px; margin-top: 12px;">
            <p style="margin: 0; font-size: 14px; color: #8B7355;">
              <strong>Motivo:</strong> ${rejectionReason}
            </p>
          </div>
          ` : ''}
        </div>

        <div style="background-color: #E8F4F8; padding: 15px; border-radius: 4px; margin-top: 20px;">
          <p style="font-size: 14px; color: #555; margin: 0;">
            📞 <strong>Non preoccuparti!</strong><br>
            Contattaci direttamente per trovare insieme una nuova data che vada bene a entrambi. 
            Siamo sempre disponibili a organizzare la tua consulenza.
          </p>
        </div>
      </div>

      <div style="text-align: center; margin-top: 25px;">
        <p style="font-size: 15px; color: #333; margin-bottom: 15px;">
          <strong>Contattaci su WhatsApp:</strong>
        </p>
        <a href="https://wa.me/${studio.phone.replace(/[^0-9]/g, '')}" 
           style="display: inline-block; background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          💬 Scrivici su WhatsApp
        </a>
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
 * Template HTML email: Consulenza Cancellata
 */
function createConsultationCancelledEmailHTML(
  clienteName: string,
  jobType: string,
  consultationDate: string,
  consultationTime: string,
  cancellationReason: string | null,
  studio: any
): string {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 8px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #8B7355; font-size: 28px; margin: 0 0 10px 0;">Consulenza Cancellata</h1>
        <p style="color: #666; font-size: 16px; margin: 0;">${studio.name}</p>
      </div>

      <div style="background-color: #FFF5F5; padding: 25px; border-radius: 8px; margin-bottom: 25px; border: 2px solid #FCA5A5;">
        <p style="font-size: 16px; color: #333; margin: 0 0 15px 0;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        
        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 20px 0;">
          Ti informiamo che la consulenza per <strong>${jobType}</strong> precedentemente confermata è stata cancellata.
        </p>

        <div style="background-color: #ffffff; padding: 20px; border-left: 4px solid #EF4444; border-radius: 4px;">
          <h3 style="color: #DC2626; font-size: 18px; margin: 0 0 15px 0;">📅 Dettagli Consulenza Cancellata</h3>
          <p style="margin: 8px 0; font-size: 15px; color: #333;">
            <strong>Tipo di lavoro:</strong> ${jobType}
          </p>
          <p style="margin: 8px 0; font-size: 15px; color: #333;">
            <strong>Data:</strong> ${consultationDate}
          </p>
          <p style="margin: 8px 0; font-size: 15px; color: #333;">
            <strong>Orario:</strong> ${consultationTime}
          </p>
          ${cancellationReason ? `
          <div style="background-color: #FEF3C7; padding: 12px; border-radius: 4px; margin-top: 12px;">
            <p style="margin: 0; font-size: 14px; color: #92400E;">
              <strong>Motivo cancellazione:</strong> ${cancellationReason}
            </p>
          </div>
          ` : ''}
        </div>

        <div style="background-color: #E0F2FE; padding: 15px; border-radius: 4px; margin-top: 20px;">
          <p style="font-size: 14px; color: #075985; margin: 0;">
            📞 <strong>Vuoi riprogrammare?</strong><br>
            Ci dispiace per l'inconveniente. Se desideri riprogrammare la consulenza, contattaci direttamente. 
            Saremo felici di trovare insieme una nuova data!
          </p>
        </div>
      </div>

      <div style="text-align: center; margin-top: 25px;">
        <p style="font-size: 15px; color: #333; margin-bottom: 15px;">
          <strong>Contattaci su WhatsApp:</strong>
        </p>
        <a href="https://wa.me/${studio.phone.replace(/[^0-9]/g, '')}" 
           style="display: inline-block; background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          💬 Scrivici su WhatsApp
        </a>
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
 * Template HTML per email notifica evento calendario creato
 */
function createCalendarEventEmailHTML(
  clienteName: string,
  eventTitle: string,
  eventDate: string,
  eventTime: string,
  eventEndTime: string,
  eventLocation?: string,
  eventDescription?: string,
  studioInfo?: { name: string; email: string; phone: string; address: string }
): string {
  const studio = studioInfo || { 
    name: "Memorie Sospese", 
    email: "memoriesospese@gennaromazzacane.it",
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
      
      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

export default router;
export { 
  createConsultationReceivedEmailHTML,
  createConsultationApprovedEmailHTML,
  createConsultationRejectedEmailHTML,
  createConsultationCancelledEmailHTML,
  createCalendarEventEmailHTML
};
