/**
 * Email API Routes - Gestisce invio email tramite Replit Gmail Integration
 * Queste route girano sul server Replit che ha accesso a connectors-api.replit.com
 */

import { Router } from 'express';
import { google } from 'googleapis';
import admin from 'firebase-admin';

const router = Router();

// Inizializza Firebase Admin se non già fatto
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

// Firestore reference
const db = admin.firestore();

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
  if (cachedSettings && cachedSettings.expires_at && cachedSettings.expires_at > Date.now()) {
    console.log('🔄 Using cached Gmail access token');
    return cachedSettings.access_token;
  }

  // 2. Leggi credenziali da environment Replit
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME || 'connectors.replit.com';
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('Missing REPL_IDENTITY or WEB_REPL_RENEWAL');
  }

  console.log('🔐 Fetching fresh Gmail access token from Replit Connectors API');

  // 3. Fetch connection settings da Replit Connectors API
  try {
    const response = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-mail`,
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch Gmail credentials: ${response.status}`);
    }

    const data: any = await response.json();
    const connection = data.items?.[0];

    if (!connection || !connection.settings) {
      throw new Error('Gmail not connected in Replit Integration');
    }

    // 4. Estrai access token
    const accessToken = 
      connection.settings?.access_token || 
      connection.settings?.oauth?.credentials?.access_token;

    if (!accessToken) {
      throw new Error('Gmail access token not found');
    }

    // 5. Salva in cache
    const expiresAt = connection.settings?.expires_at 
      ? new Date(connection.settings.expires_at).getTime()
      : Date.now() + 3600 * 1000; // Default: 1 ora

    cachedSettings = {
      access_token: accessToken,
      expires_at: expiresAt
    };

    console.log('✅ Gmail access token obtained successfully');
    return accessToken;

  } catch (error) {
    console.error('❌ Error fetching Gmail credentials:', error);
    throw error;
  }
}

/**
 * Invia email tramite Gmail API
 */
async function sendGmailEmail(
  to: string | string[],
  subject: string,
  htmlContent: string,
  from: string = 'Memorie Sospese <memoriesospese@gennaromazzacane.it>'
): Promise<void> {
  try {
    // 1. Normalizza destinatari
    const toList = Array.isArray(to) ? to : [to];
    const recipients = toList.join(', ');

    console.log(`📧 Sending email to ${toList.length} recipient(s): ${recipients}`);

    // 2. Ottieni access token
    const accessToken = await getAccessToken();

    // 3. Crea client Gmail autenticato
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // 4. Crea messaggio RFC2822
    const message = [
      `From: ${from}`,
      `To: ${recipients}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlContent
    ].join('\n');

    // 5. Codifica in base64url
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // 6. Invia email
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    console.log(`✅ Email sent successfully via Gmail API to ${toList.length} recipient(s)`);
  } catch (error) {
    console.error('❌ Gmail send error:', error);
    throw error;
  }
}

/**
 * Template HTML per email nuove foto
 */
function createNewPhotosEmailHTML(
  galleryName: string,
  uploaderName: string,
  newPhotosCount: number,
  galleryUrl: string
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">🎉 Nuove foto disponibili!</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 10px;">
          <strong>${uploaderName}</strong> ha caricato <strong>${newPhotosCount}</strong> 
          nuova${newPhotosCount > 1 ? 'e' : ''} foto nella galleria 
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
      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px;">
        <p>Memorie Sospese - Wedding Gallery System</p>
      </div>
    </div>
  `;
}

/**
 * Middleware per autenticazione Firebase
 */
async function authenticateFirebase(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers.authorization || '';
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: { code: 'unauthenticated', message: 'Missing Authorization Bearer token' }
      });
    }

    const idToken = authHeader.replace('Bearer ', '').trim();
    
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      req.user = { uid: decoded.uid, email: decoded.email };
      console.log(`🔐 Authenticated user: ${decoded.email} (${decoded.uid})`);
      next();
    } catch (authError) {
      console.error('❌ Token verification failed:', authError);
      return res.status(401).json({
        error: { code: 'unauthenticated', message: 'Invalid or expired token' }
      });
    }
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    return res.status(500).json({
      error: { code: 'internal', message: 'Authentication error' }
    });
  }
}

/**
 * POST /api/email/notify-new-photos
 * Invia notifiche email per nuove foto caricate
 * RICHIEDE AUTENTICAZIONE: Bearer token Firebase
 * Recupera recipients SERVER-SIDE dalla collection subscriptions (no client input)
 */
router.post('/notify-new-photos', authenticateFirebase, async (req, res) => {
  try {
    const { galleryId, galleryName, newPhotosCount, uploaderName, galleryUrl } = req.body;
    
    console.log(`📧 Richiesta notifica da utente autenticato: ${req.user?.email}`);

    // Validazione
    if (!galleryId || !galleryName || !galleryUrl) {
      return res.status(400).json({
        error: { code: 'invalid-argument', message: 'Missing required fields: galleryId, galleryName, galleryUrl' }
      });
    }

    // AUTORIZZAZIONE: Verifica che l'utente sia proprietario della galleria o admin
    console.log(`🔒 Verifica autorizzazione per galleria ${galleryId}`);
    
    const galleryDoc = await db.collection('galleries').doc(galleryId).get();
    
    if (!galleryDoc.exists) {
      console.log(`❌ Galleria ${galleryId} non trovata`);
      return res.status(404).json({
        error: { code: 'not-found', message: 'Gallery not found' }
      });
    }

    const galleryData = galleryDoc.data();
    const galleryOwnerId = galleryData?.userId;
    const isOwner = galleryOwnerId === req.user.uid;
    
    // Lista admin hardcoded (come nel resto dell'app)
    const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];
    const isAdmin = ADMIN_EMAILS.includes(req.user.email || '');

    if (!isOwner && !isAdmin) {
      console.log(`❌ Utente ${req.user.email} non autorizzato per galleria ${galleryId}`);
      return res.status(403).json({
        error: { code: 'permission-denied', message: 'Not authorized to send notifications for this gallery' }
      });
    }

    console.log(`✅ Utente autorizzato: ${isOwner ? 'proprietario' : 'admin'}`);

    // RECUPERA RECIPIENTS SERVER-SIDE dalla collection subscriptions
    console.log(`🔍 Recupero subscribers per galleria: ${galleryId}`);
    
    const subscriptionsSnapshot = await db.collection('subscriptions')
      .where('galleryId', '==', galleryId)
      .where('active', '==', true)
      .get();

    const recipients = subscriptionsSnapshot.docs.map(doc => doc.data().email as string);

    if (recipients.length === 0) {
      console.log(`⚠️ Nessun subscriber attivo per galleria ${galleryId}`);
      return res.status(200).json({
        success: true,
        message: 'No active subscribers',
        notified: 0
      });
    }

    console.log(`📬 Trovati ${recipients.length} subscribers attivi`);

    // Crea HTML email
    const htmlContent = createNewPhotosEmailHTML(
      galleryName,
      uploaderName || 'Un ospite',
      newPhotosCount || 1,
      galleryUrl
    );

    const subject = `${newPhotosCount || 1} nuova${(newPhotosCount || 1) > 1 ? 'e' : ''} foto in "${galleryName}"`;

    // Invia email
    await sendGmailEmail(recipients, subject, htmlContent);

    console.log(`✉️ Notifica nuove foto inviata a ${recipients.length} destinatari per ${galleryName}`);

    res.status(200).json({
      success: true,
      message: 'Notification sent successfully',
      notified: recipients.length
    });
  } catch (error) {
    console.error('❌ Error notify-new-photos:', error);
    res.status(500).json({
      error: { code: 'internal', message: 'Failed to send notification email' }
    });
  }
});

/**
 * Template HTML per email password galleria
 */
function createGalleryPasswordEmailHTML(
  firstName: string,
  lastName: string,
  galleryName: string,
  galleryCode: string,
  password: string,
  galleryUrl: string
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">🔑 Password Galleria</h2>
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
            📸 Accedi alla Galleria
          </a>
        </div>
      </div>
      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px;">
        <p>Memorie Sospese - Wedding Gallery System</p>
      </div>
    </div>
  `;
}

/**
 * POST /api/email/send-gallery-password
 * Invia password galleria via email
 * NO AUTENTICAZIONE RICHIESTA (endpoint pubblico per recupero password)
 * SICUREZZA: Password recuperata server-side, security question validata server-side
 */
router.post('/send-gallery-password', async (req, res) => {
  try {
    const { 
      galleryId, 
      recipientEmail, 
      galleryName, 
      galleryCode,
      firstName,
      lastName,
      galleryUrl,
      securityAnswer 
    } = req.body;

    console.log(`🔑 Richiesta password per galleria ${galleryCode} (${galleryId})`);

    // Validazione campi obbligatori
    if (!galleryId || !recipientEmail || !galleryName || !galleryCode || !firstName || !lastName || !galleryUrl) {
      return res.status(400).json({
        error: { code: 'invalid-argument', message: 'Missing required fields' }
      });
    }

    // RECUPERA GALLERIA SERVER-SIDE da Firestore
    const galleryDoc = await db.collection('galleries').doc(galleryId).get();

    if (!galleryDoc.exists) {
      console.log(`❌ Galleria ${galleryId} non trovata`);
      return res.status(404).json({
        error: { code: 'not-found', message: 'Gallery not found' }
      });
    }

    const galleryData = galleryDoc.data();
    const password = galleryData?.password;

    if (!password) {
      console.error(`❌ Password non configurata per galleria ${galleryId}`);
      return res.status(500).json({
        error: { code: 'internal', message: 'Gallery password not configured' }
      });
    }

    // VALIDAZIONE SECURITY QUESTION SERVER-SIDE (se presente)
    const expectedAnswer = galleryData?.securityAnswer;
    if (expectedAnswer) {
      if (!securityAnswer) {
        console.log(`❌ Security question richiesta ma risposta non fornita`);
        return res.status(400).json({
          error: { code: 'invalid-argument', message: 'Security question answer required' }
        });
      }

      // Confronto case-insensitive
      const normalizedProvided = securityAnswer.trim().toLowerCase();
      const normalizedExpected = expectedAnswer.trim().toLowerCase();

      if (normalizedProvided !== normalizedExpected) {
        console.log(`❌ Risposta security question non corretta`);
        return res.status(403).json({
          error: { code: 'permission-denied', message: 'Incorrect security answer' }
        });
      }

      console.log(`✅ Security question validata correttamente`);
    }

    // INVIA EMAIL CON PASSWORD
    const htmlContent = createGalleryPasswordEmailHTML(
      firstName,
      lastName,
      galleryName,
      galleryCode,
      password,
      galleryUrl
    );

    const subject = `🔑 Password per la galleria "${galleryName}"`;

    await sendGmailEmail(recipientEmail, subject, htmlContent);

    console.log(`✅ Password inviata via email a ${recipientEmail} per galleria ${galleryCode}`);

    res.status(200).json({
      result: {
        success: true,
        message: 'Password email sent successfully'
      }
    });

  } catch (error) {
    console.error('❌ Errore send-gallery-password:', error);
    res.status(500).json({
      error: { code: 'internal', message: 'Failed to send password email' }
    });
  }
});

export default router;
