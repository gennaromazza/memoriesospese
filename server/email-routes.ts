/**
 * Email API Routes - Gestisce invio email tramite Replit Gmail Integration
 * Queste route girano sul server Replit che ha accesso a connectors-api.replit.com
 */

import { Router, Request, Response, NextFunction } from "express";
import { google } from "googleapis";

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
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("Missing REPL_IDENTITY or WEB_REPL_RENEWAL");
  }

  console.log(
    "🔐 Fetching fresh Gmail access token from Replit Connectors API",
  );

  // 3. Fetch connection settings da Replit Connectors API
  try {
    const response = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-mail`,
      {
        headers: {
          Accept: "application/json",
          X_REPLIT_TOKEN: xReplitToken,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch Gmail credentials: ${response.status}`);
    }

    const data: any = await response.json();
    const connection = data.items?.[0];

    if (!connection || !connection.settings) {
      throw new Error("Gmail not connected in Replit Integration");
    }

    // 4. Estrai access token
    const accessToken =
      connection.settings?.access_token ||
      connection.settings?.oauth?.credentials?.access_token;

    if (!accessToken) {
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
 */
async function authenticateFirebase(
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

    // RECUPERA GALLERIA SERVER-SIDE da Firestore
    const galleryDoc = await getFirestoreDocument(`galleries/${galleryId}`);

    if (!galleryDoc) {
      console.log(`❌ Galleria ${galleryId} non trovata`);
      return res.status(404).json({
        error: { code: "not-found", message: "Gallery not found" },
      });
    }

    const password = galleryDoc.fields?.password?.stringValue;

    if (!password) {
      console.error(`❌ Password non configurata per galleria ${galleryId}`);
      return res.status(500).json({
        error: { code: "internal", message: "Gallery password not configured" },
      });
    }

    // VALIDAZIONE SECURITY QUESTION SERVER-SIDE (se presente)
    const expectedAnswer = galleryDoc.fields?.securityAnswer?.stringValue;
    if (expectedAnswer) {
      if (!securityAnswer) {
        console.log(`❌ Security question richiesta ma risposta non fornita`);
        return res.status(400).json({
          error: {
            code: "invalid-argument",
            message: "Security question answer required",
          },
        });
      }

      // Confronto case-insensitive
      const normalizedProvided = securityAnswer.trim().toLowerCase();
      const normalizedExpected = expectedAnswer.trim().toLowerCase();

      if (normalizedProvided !== normalizedExpected) {
        console.log(`❌ Risposta security question non corretta`);
        return res.status(403).json({
          error: {
            code: "permission-denied",
            message: "Incorrect security answer",
          },
        });
      }

      console.log(`✅ Security question validata correttamente`);
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

export default router;
