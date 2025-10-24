/**
 * Gmail Email Service usando Replit Integration
 * Gestisce invio email tramite Gmail API OAuth2
 * VERSIONE RISCRITTA - Gestione uniforme credenziali REPL_IDENTITY
 */

import { google } from 'googleapis';
import * as functions from 'firebase-functions';

// Cache per access token (evita troppe chiamate al connector)
let cachedSettings: {
  access_token: string;
  expires_at: number;
} | null = null;

/**
 * Ottiene access token dall'integrazione Replit Gmail
 * USA SOLO process.env.REPL_IDENTITY (Firebase secret)
 */
async function getAccessToken(): Promise<string> {
  // 1. Controlla cache
  if (cachedSettings && cachedSettings.expires_at && cachedSettings.expires_at > Date.now()) {
    functions.logger.info('🔄 Using cached Gmail access token');
    return cachedSettings.access_token;
  }

  // 2. Leggi credenziali da environment (Firebase secret)
  const replIdentity = process.env.REPL_IDENTITY;
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME || 'connectors-api.replit.com';

  if (!replIdentity) {
    functions.logger.error('❌ Missing REPL_IDENTITY secret');
    throw new Error('Missing REPL_IDENTITY - Gmail API credentials not configured');
  }

  functions.logger.info('🔐 Fetching fresh Gmail access token from Replit Connectors API');

  // 3. Costruisci header autenticazione
  const xReplitToken = 'repl ' + replIdentity;

  // 4. Fetch connection settings da Replit Connectors API
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
      functions.logger.error('❌ Replit Connectors API error:', response.status, response.statusText);
      throw new Error(`Failed to fetch Gmail credentials: ${response.status}`);
    }

    const data: any = await response.json();
    const connection = data.items?.[0];

    if (!connection || !connection.settings) {
      functions.logger.error('❌ No Gmail connection found in Replit');
      throw new Error('Gmail not connected in Replit Integration');
    }

    // 5. Estrai access token (supporta vari formati)
    const accessToken = 
      connection.settings?.access_token || 
      connection.settings?.oauth?.credentials?.access_token;

    if (!accessToken) {
      functions.logger.error('❌ No access_token in Gmail connection settings');
      throw new Error('Gmail access token not found');
    }

    // 6. Salva in cache
    const expiresAt = connection.settings?.expires_at 
      ? new Date(connection.settings.expires_at).getTime()
      : Date.now() + 3600 * 1000; // Default: 1 ora

    cachedSettings = {
      access_token: accessToken,
      expires_at: expiresAt
    };

    functions.logger.info('✅ Gmail access token obtained successfully');
    return accessToken;

  } catch (error) {
    functions.logger.error('❌ Error fetching Gmail credentials:', error);
    throw error;
  }
}

/**
 * Crea client Gmail autenticato
 * IMPORTANTE: Non cachare questo client, access token scadono
 */
export async function getGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Invia email tramite Gmail API
 * @param to - Singolo destinatario (string) o array di destinatari (string[])
 * @param subject - Oggetto email
 * @param htmlContent - Contenuto HTML dell'email
 * @param from - Mittente (default: Memorie Sospese)
 */
export async function sendGmailEmail(
  to: string | string[],
  subject: string,
  htmlContent: string,
  from: string = 'Memorie Sospese <memoriesospese@gennaromazzacane.it>'
): Promise<void> {
  try {
    // 1. Normalizza destinatari (supporta sia string che array)
    const toList = Array.isArray(to) ? to : [to];
    const recipients = toList.join(', ');

    // 2. Log pre-invio
    functions.logger.info(
      `📧 Sending email to ${toList.length} recipient(s): ${recipients} | subject="${subject}"`
    );

    // 3. Ottieni client Gmail autenticato
    const gmail = await getGmailClient();
    
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

    // 5. Codifica in base64url (formato richiesto da Gmail API)
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

    functions.logger.info(`✅ Email sent successfully via Gmail API to ${toList.length} recipient(s)`);
  } catch (error) {
    functions.logger.error('❌ Gmail send error:', error);
    throw error;
  }
}

/**
 * Template HTML per email nuove foto
 */
export function createNewPhotosEmailHTML(
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
 * Template HTML per email password galleria
 */
export function createGalleryPasswordEmailHTML(
  galleryName: string,
  galleryCode: string,
  galleryPassword?: string,
  firstName?: string,
  lastName?: string,
  galleryUrl?: string
): string {
  const greeting = firstName ? `Ciao ${firstName}${lastName ? ' ' + lastName : ''},` : 'Ciao,';
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">🔑 Accesso alla Galleria Autorizzato</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 10px;">
          ${greeting}
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          La tua richiesta di accesso è stata approvata! Ecco i dati per accedere alla galleria 
          <strong style="color: #8b5a3c;">${galleryName}</strong>:
        </p>
        <div style="background: white; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #666;">Codice Galleria:</p>
          <h3 style="margin: 5px 0; color: #8b5a3c; font-size: 24px; font-family: monospace;">
            ${galleryCode}
          </h3>
          ${galleryPassword ? `
            <p style="margin: 15px 0 0 0; font-size: 14px; color: #666;">Password:</p>
            <h3 style="margin: 5px 0; color: #8b5a3c; font-size: 20px; font-family: monospace;">
              ${galleryPassword}
            </h3>
          ` : ''}
        </div>
        ${galleryUrl ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${galleryUrl}" 
             style="background: #8b5a3c; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
            📸 Accedi alla Galleria
          </a>
        </div>
        ` : ''}
        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 20px;">
          Conserva questa email per accedere alla galleria in qualsiasi momento.
        </p>
      </div>
      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px;">
        <p>Memorie Sospese - Wedding Gallery System</p>
        <p style="margin-top: 10px;">Questa email contiene informazioni riservate.</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per email di benvenuto
 */
export function createWelcomeEmailHTML(galleryName: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">✨ Benvenuto nella Galleria!</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px;">
        <p>Ciao! Sei stato iscritto alle notifiche della galleria <strong>${galleryName}</strong>.</p>
        <p>Riceverai automaticamente una email ogni volta che verranno caricate nuove foto.</p>
        <p>Grazie per essere parte di questo momento speciale! 💕</p>
      </div>
      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px;">
        <p>Memorie Sospese - Wedding Gallery System</p>
      </div>
    </div>
  `;
}

/**
 * Template HTML per test configurazione
 */
export function createTestEmailHTML(): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">✅ Test Email Configurazione</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px;">
        <p>Questo è un test per verificare che la configurazione email Gmail funzioni correttamente.</p>
        <p><strong>Data/Ora:</strong> ${new Date().toLocaleString('it-IT')}</p>
        <p><strong>Sistema:</strong> Firebase Cloud Functions + Gmail API</p>
        <p><strong>Status:</strong> ✅ Configurazione funzionante!</p>
      </div>
    </div>
  `;
}
