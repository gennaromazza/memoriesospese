"use strict";
/**
 * Gmail Email Service usando Replit Integration
 * Gestisce invio email tramite Gmail API OAuth2
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGmailClient = getGmailClient;
exports.sendGmailEmail = sendGmailEmail;
exports.createNewPhotosEmailHTML = createNewPhotosEmailHTML;
exports.createGalleryPasswordEmailHTML = createGalleryPasswordEmailHTML;
exports.createWelcomeEmailHTML = createWelcomeEmailHTML;
exports.createTestEmailHTML = createTestEmailHTML;
const googleapis_1 = require("googleapis");
const firebase_functions_1 = require("firebase-functions");
let connectionSettings;
/**
 * Ottiene access token dall'integrazione Replit Gmail
 */
async function getAccessToken() {
    if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
        return connectionSettings.settings.access_token;
    }
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
        ? 'repl ' + process.env.REPL_IDENTITY
        : process.env.WEB_REPL_RENEWAL
            ? 'depl ' + process.env.WEB_REPL_RENEWAL
            : null;
    if (!xReplitToken) {
        throw new Error('X_REPLIT_TOKEN not found for repl/depl');
    }
    connectionSettings = await fetch('https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail', {
        headers: {
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': xReplitToken
        }
    }).then(res => res.json()).then(data => data.items?.[0]);
    const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
    if (!connectionSettings || !accessToken) {
        throw new Error('Gmail not connected');
    }
    return accessToken;
}
/**
 * Crea client Gmail autenticato
 * IMPORTANTE: Non cachare questo client, access token scadono
 */
async function getGmailClient() {
    const accessToken = await getAccessToken();
    const oauth2Client = new googleapis_1.google.auth.OAuth2();
    oauth2Client.setCredentials({
        access_token: accessToken
    });
    return googleapis_1.google.gmail({ version: 'v1', auth: oauth2Client });
}
/**
 * Invia email tramite Gmail API
 */
async function sendGmailEmail(to, subject, htmlContent, from = 'Memorie Sospese <memoriesospese@gennaromazzacane.it>') {
    try {
        const gmail = await getGmailClient();
        // Prepara destinatari
        const recipients = Array.isArray(to) ? to.join(', ') : to;
        // Crea messaggio RFC2822
        const message = [
            `From: ${from}`,
            `To: ${recipients}`,
            `Subject: ${subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=utf-8',
            '',
            htmlContent
        ].join('\n');
        // Codifica in base64url
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        // Invia email
        await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage
            }
        });
        firebase_functions_1.logger.info(`📧 Email inviata via Gmail API a ${recipients}`);
    }
    catch (error) {
        firebase_functions_1.logger.error('❌ Errore invio email Gmail:', error);
        throw error;
    }
}
/**
 * Template HTML per email nuove foto
 */
function createNewPhotosEmailHTML(galleryName, uploaderName, newPhotosCount, galleryUrl) {
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
function createGalleryPasswordEmailHTML(galleryName, galleryCode, galleryPassword, firstName, lastName, galleryUrl) {
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
function createWelcomeEmailHTML(galleryName) {
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
function createTestEmailHTML() {
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
//# sourceMappingURL=gmail.js.map