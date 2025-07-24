
/**
 * Firebase Cloud Functions per Wedding Gallery
 * Gestisce invio email tramite Brevo SMTP con supporto CORS
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import * as cors from 'cors';

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

// Import subscription functions
// Stripe functions imported from './stripe'
// Gallery ZIP and CSV export functions imported from their respective files

// Configurazione CORS per permettere richieste da gennaromazzacane.it
const corsHandler = cors({
  origin: [
    'https://gennaromazzacane.it',
    'https://www.gennaromazzacane.it',
    'http://localhost:3000',
    'http://localhost:5000',
    'https://localhost:3000',
    'https://localhost:5000'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});

// Configurazione SMTP Brevo - Email corretta
const smtpConfig = {
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: 'memoriesospese@gennaromazzacane.it',
    pass: 'sIBRNp2r1y6Y0WTZ'
  },
  tls: {
    rejectUnauthorized: false
  }
};

const transporter = nodemailer.createTransport(smtpConfig);

// Verifica configurazione SMTP al caricamento
transporter.verify((error, success) => {
  if (error) {
    logger.error('SMTP configuration error:', error);
  } else {
    logger.info('SMTP server ready for email sending');
  }
});

/**
 * Function per invio notifiche nuove foto - Con supporto CORS e validazione auth
 */
export const sendNewPhotosNotification = onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      // Gestione preflight OPTIONS
      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      // Validazione autenticazione Firebase
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      try {
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        
        // Solo admin o utenti autenticati possono inviare notifiche
        if (!decodedToken.uid) {
          res.status(403).json({ error: 'Invalid authentication token' });
          return;
        }
      } catch (error) {
        logger.error('Authentication verification failed:', error);
        res.status(401).json({ error: 'Authentication verification failed' });
        return;
      }

      const { galleryName, newPhotosCount, uploaderName, galleryUrl, recipients } = req.body;

      if (!recipients || recipients.length === 0) {
        res.status(400).json({ error: 'Recipients list is required' });
        return;
      }

      const mailOptions = {
        from: '"Memorie Sospese" <memoriesospese@gennaromazzacane.it>',
        to: recipients.join(','),
        subject: `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`,
        html: `
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
              <p>Wedding Gallery System - Powered by Firebase</p>
            </div>
          </div>
        `,
        headers: {
          'X-Mailer': 'Memorie Sospese Gallery System',
          'X-Priority': '3',
          'List-Unsubscribe': '<mailto:memoriesospese@gennaromazzacane.it?subject=Unsubscribe>',
          'Reply-To': 'memoriesospese@gennaromazzacane.it'
        }
      };

      await transporter.sendMail(mailOptions);
      logger.info(`New photos notification sent to ${recipients.length} recipients`);
      
      res.status(200).json({ success: true, message: 'Notification sent successfully' });
    } catch (error) {
      logger.error('Error sending new photos notification:', error);
      res.status(500).json({ error: 'Failed to send notification email' });
    }
  });
});

/**
 * Function per invio notifiche nuove foto - Versione onCall per compatibilità
 */
export const sendNewPhotosNotificationCall = onCall(async (request) => {
  try {
    const { galleryName, newPhotosCount, uploaderName, galleryUrl, recipients } = request.data;

    if (!recipients || recipients.length === 0) {
      throw new HttpsError('invalid-argument', 'Recipients list is required');
    }

    const mailOptions = {
      from: '"Memorie Sospese" <memoriesospese@gennaromazzacane.it>',
      to: recipients.join(','),
      subject: `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`,
      html: `
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
            <p>Wedding Gallery System - Powered by Firebase</p>
          </div>
        </div>
      `,
      headers: {
        'X-Mailer': 'Memorie Sospese Gallery System',
        'X-Priority': '3',
        'List-Unsubscribe': '<mailto:memoriesospese@gennaromazzacane.it?subject=Unsubscribe>',
        'Reply-To': 'memoriesospese@gennaromazzacane.it'
      }
    };

    await transporter.sendMail(mailOptions);
    logger.info(`New photos notification sent to ${recipients.length} recipients`);
    
    return { success: true, message: 'Notification sent successfully' };
  } catch (error) {
    logger.error('Error sending new photos notification:', error);
    throw new HttpsError('internal', 'Failed to send notification email');
  }
});

/**
 * Function per invio password galleria
 */
export const sendGalleryPassword = onCall(async (request) => {
  try {
    const { recipientEmail, galleryName, galleryCode, galleryPassword } = request.data;

    if (!recipientEmail || !galleryName || !galleryCode) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    const mailOptions = {
      from: '"Memorie Sospese" <memoriesospese@gennaromazzacane.it>',
      to: recipientEmail,
      subject: `🔑 Codice di accesso per "${galleryName}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #8b5a3c; text-align: center;">🔑 Accesso alla Galleria</h2>
          <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              Ecco i dati per accedere alla galleria <strong style="color: #8b5a3c;">${galleryName}</strong>:
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
            <p style="font-size: 14px; color: #666; text-align: center;">
              Usa questi dati per accedere alla galleria e visualizzare le foto.
            </p>
          </div>
          <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px;">
            <p>Wedding Gallery System - Powered by Firebase</p>
          </div>
        </div>
      `,
      headers: {
        'X-Mailer': 'Memorie Sospese Gallery System',
        'Reply-To': 'memoriesospese@gennaromazzacane.it'
      }
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Gallery password sent to ${recipientEmail}`);
    
    return { success: true, message: 'Gallery password sent successfully' };
  } catch (error) {
    logger.error('Error sending gallery password:', error);
    throw new HttpsError('internal', 'Failed to send gallery password email');
  }
});

/**
 * Function per test configurazione email
 */
export const testEmailConfiguration = onCall(async (request) => {
  try {
    const { testRecipient } = request.data;
    const recipient = testRecipient || 'gennaro.mazzacane@gmail.com';

    const mailOptions = {
      from: '"Wedding Gallery" <91c91c001@smtp-brevo.com>',
      to: recipient,
      subject: '✅ Test Configurazione Email - Wedding Gallery',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #8b5a3c; text-align: center;">✅ Test Email Configurazione</h2>
          <div style="background: #f9f7f4; padding: 20px; border-radius: 10px;">
            <p>Questo è un test per verificare che la configurazione email Brevo funzioni correttamente.</p>
            <p><strong>Data/Ora:</strong> ${new Date().toLocaleString('it-IT')}</p>
            <p><strong>Sistema:</strong> Firebase Cloud Functions + Brevo SMTP</p>
            <p><strong>Status:</strong> ✅ Configurazione funzionante!</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Test email sent to ${recipient}`);
    
    return { success: true, message: 'Test email sent successfully' };
  } catch (error) {
    logger.error('Error sending test email:', error);
    throw new HttpsError('internal', 'Failed to send test email');
  }
});

/**
 * Function per email di benvenuto
 */
export const sendWelcomeEmail = onCall(async (request) => {
  try {
    const { recipientEmail, galleryName } = request.data;

    if (!recipientEmail || !galleryName) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    const mailOptions = {
      from: '"Wedding Gallery" <91c91c001@smtp-brevo.com>',
      to: recipientEmail,
      subject: `✨ Benvenuto! Sei iscritto alle notifiche di "${galleryName}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #8b5a3c; text-align: center;">✨ Benvenuto nella Galleria!</h2>
          <div style="background: #f9f7f4; padding: 20px; border-radius: 10px;">
            <p>Ciao! Sei stato iscritto alle notifiche della galleria <strong>${galleryName}</strong>.</p>
            <p>Riceverai automaticamente una email ogni volta che verranno caricate nuove foto.</p>
            <p>Grazie per essere parte di questo momento speciale! 💕</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Welcome email sent to ${recipientEmail}`);
    
    return { success: true, message: 'Welcome email sent successfully' };
  } catch (error) {
    logger.error('Error sending welcome email:', error);
    throw new HttpsError('internal', 'Failed to send welcome email');
  }
});

// Import and re-export Stripe functions
import { createCheckoutSession, createPortalSession, stripeWebhook } from './stripe';
import { generateGalleryZip } from './gallery-zip';
import { exportGalleryAccessCSV } from './csv-export';

// Export all functions
export { createCheckoutSession, createPortalSession, stripeWebhook };
export { generateGalleryZip, exportGalleryAccessCSV };
