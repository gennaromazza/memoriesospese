"use strict";
/**
 * Gmail Email Service usando Replit Integration
 * Gestisce invio email tramite Gmail API OAuth2
 * VERSIONE RISCRITTA - Gestione uniforme credenziali REPL_IDENTITY
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGmailClient = getGmailClient;
exports.sendGmailEmail = sendGmailEmail;
exports.createNewPhotosEmailHTML = createNewPhotosEmailHTML;
exports.createGalleryPasswordEmailHTML = createGalleryPasswordEmailHTML;
exports.createWelcomeEmailHTML = createWelcomeEmailHTML;
exports.createTestEmailHTML = createTestEmailHTML;
exports.createBookingReceivedEmailHTML = createBookingReceivedEmailHTML;
exports.createBookingConfirmedEmailHTML = createBookingConfirmedEmailHTML;
const googleapis_1 = require("googleapis");
const functions = require("firebase-functions");
// Cache per access token (evita troppe chiamate al connector)
let cachedSettings = null;
/**
 * Ottiene access token dall'integrazione Replit Gmail
 * USA SOLO process.env.REPL_IDENTITY (Firebase secret)
 */
async function getAccessToken() {
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
        const response = await fetch(`https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-mail`, {
            headers: {
                'Accept': 'application/json',
                'X_REPLIT_TOKEN': xReplitToken
            }
        });
        if (!response.ok) {
            functions.logger.error('❌ Replit Connectors API error:', response.status, response.statusText);
            throw new Error(`Failed to fetch Gmail credentials: ${response.status}`);
        }
        const data = await response.json();
        const connection = data.items?.[0];
        if (!connection || !connection.settings) {
            functions.logger.error('❌ No Gmail connection found in Replit');
            throw new Error('Gmail not connected in Replit Integration');
        }
        // 5. Estrai access token (supporta vari formati)
        const accessToken = connection.settings?.access_token ||
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
    }
    catch (error) {
        functions.logger.error('❌ Error fetching Gmail credentials:', error);
        throw error;
    }
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
 * @param to - Singolo destinatario (string) o array di destinatari (string[])
 * @param subject - Oggetto email
 * @param htmlContent - Contenuto HTML dell'email
 * @param from - Mittente (default: Memorie Sospese)
 */
async function sendGmailEmail(to, subject, htmlContent, from = 'Memorie Sospese <memoriesospese@gennaromazzacane.it>') {
    try {
        // 1. Normalizza destinatari (supporta sia string che array)
        const toList = Array.isArray(to) ? to : [to];
        const recipients = toList.join(', ');
        // 2. Log pre-invio
        functions.logger.info(`📧 Sending email to ${toList.length} recipient(s): ${recipients} | subject="${subject}"`);
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
    }
    catch (error) {
        functions.logger.error('❌ Gmail send error:', error);
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
/**
 * Template HTML email "Prenotazione Ricevuta" (dopo creazione booking)
 */
function createBookingReceivedEmailHTML(bookingDetails) {
    const { clienteNome, clienteCognome, campaignNome, dataShootingInizio, dataShootingFine, prodottoNome, note } = bookingDetails;
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #8b5a3c 0%, #6b4530 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">📸 Prenotazione Ricevuta</h1>
        </div>

        <!-- Contenuto -->
        <div style="padding: 30px;">
          <p style="font-size: 16px; color: #333; margin-bottom: 10px;">
            Ciao <strong>${clienteNome} ${clienteCognome}</strong>,
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Abbiamo ricevuto la tua richiesta di prenotazione per il servizio fotografico 
            <strong style="color: #8b5a3c;">${campaignNome}</strong>.
          </p>

          <!-- Box In Attesa -->
          <div style="background: #fff8e1; border-left: 4px solid #ffa726; padding: 20px; margin: 25px 0; border-radius: 8px;">
            <h3 style="color: #e65100; margin: 0 0 10px 0; font-size: 18px;">⏳ In Attesa di Conferma</h3>
            <p style="color: #555; margin: 0; font-size: 14px; line-height: 1.5;">
              La tua prenotazione è stata registrata con successo! Riceverai una <strong>email di conferma</strong> 
              non appena avremo verificato la disponibilità dello slot richiesto.
            </p>
          </div>

          <!-- Dettagli Prenotazione -->
          <div style="background: #f9f7f4; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="color: #8b5a3c; margin: 0 0 15px 0; font-size: 18px;">📋 Riepilogo Prenotazione</h3>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; width: 40%;">📅 Data e Orario:</td>
                <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">
                  ${dataShootingInizio} - ${dataShootingFine}
                </td>
              </tr>
              ${prodottoNome ? `
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">📦 Pacchetto:</td>
                <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${prodottoNome}</td>
              </tr>
              ` : ''}
              ${note ? `
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; vertical-align: top;">💬 Note:</td>
                <td style="padding: 8px 0; color: #555; font-size: 14px; line-height: 1.5;">${note}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          <!-- Messaggio Rassicurante -->
          <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 20px 0;">
            Ti confermeremo al più presto la disponibilità. Nel frattempo, se hai domande o necessiti 
            di modifiche, non esitare a contattarci!
          </p>

          <!-- Contatti WhatsApp -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://wa.me/393347103142" 
               style="background: #25D366; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 25px; font-weight: 600; 
                      display: inline-block; font-size: 15px;">
              💬 Contattaci su WhatsApp
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f9f7f4; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="color: #666; font-size: 12px; margin: 5px 0;">Memorie Sospese - Wedding Gallery System</p>
          <p style="color: #999; font-size: 11px; margin: 5px 0;">Servizi fotografici professionali</p>
        </div>
      </div>
    </div>
  `;
}
/**
 * Template HTML email "Prenotazione Confermata" (dopo approvazione admin)
 */
function createBookingConfirmedEmailHTML(bookingDetails) {
    const { clienteNome, clienteCognome, campaignNome, dataShootingInizio, dataShootingFine, prodottoNome, note } = bookingDetails;
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">✅ Prenotazione Confermata!</h1>
        </div>

        <!-- Contenuto -->
        <div style="padding: 30px;">
          <p style="font-size: 16px; color: #333; margin-bottom: 10px;">
            Ciao <strong>${clienteNome} ${clienteCognome}</strong>,
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Ottima notizia! La tua prenotazione per il servizio fotografico 
            <strong style="color: #4caf50;">${campaignNome}</strong> è stata <strong>confermata</strong>.
          </p>

          <!-- Box Confermato -->
          <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 20px; margin: 25px 0; border-radius: 8px;">
            <h3 style="color: #2e7d32; margin: 0 0 10px 0; font-size: 18px;">🎉 Tutto Pronto!</h3>
            <p style="color: #555; margin: 0; font-size: 14px; line-height: 1.5;">
              Il tuo slot è <strong>confermato e riservato</strong>. Ti aspettiamo alla data e orario indicati. 
              Preparati a vivere un'esperienza fotografica indimenticabile!
            </p>
          </div>

          <!-- Dettagli Shooting -->
          <div style="background: #f9f7f4; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="color: #8b5a3c; margin: 0 0 15px 0; font-size: 18px;">📋 Dettagli Shooting</h3>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; width: 40%;">📅 Data e Orario:</td>
                <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">
                  ${dataShootingInizio} - ${dataShootingFine}
                </td>
              </tr>
              ${prodottoNome ? `
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">📦 Pacchetto:</td>
                <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${prodottoNome}</td>
              </tr>
              ` : ''}
              ${note ? `
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; vertical-align: top;">💬 Note:</td>
                <td style="padding: 8px 0; color: #555; font-size: 14px; line-height: 1.5;">${note}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          <!-- Suggerimenti Utili -->
          <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="color: #ef6c00; margin: 0 0 15px 0; font-size: 18px;">💡 Suggerimenti per lo Shooting</h3>
            <ul style="margin: 0; padding-left: 20px; color: #555; font-size: 14px; line-height: 1.8;">
              <li>Arriva 10-15 minuti prima dell'orario previsto</li>
              <li>Porta eventuali accessori o abiti che desideri includere</li>
              <li>Assicurati che il cellulare sia carico per eventuali preview</li>
              <li>Rilassati e goditi l'esperienza! 📸</li>
            </ul>
          </div>

          <!-- Messaggio Finale -->
          <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 20px 0; text-align: center;">
            Non vediamo l'ora di immortalare i tuoi momenti speciali! Per qualsiasi domanda, 
            siamo sempre disponibili su WhatsApp.
          </p>

          <!-- Contatti WhatsApp -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://wa.me/393347103142" 
               style="background: #25D366; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 25px; font-weight: 600; 
                      display: inline-block; font-size: 15px;">
              💬 Contattaci su WhatsApp
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f9f7f4; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="color: #666; font-size: 12px; margin: 5px 0;">Memorie Sospese - Wedding Gallery System</p>
          <p style="color: #999; font-size: 11px; margin: 5px 0;">Servizi fotografici professionali</p>
        </div>
      </div>
    </div>
  `;
}
//# sourceMappingURL=gmail.js.map