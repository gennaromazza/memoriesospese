/**
 * Firebase Cloud Functions per Wedding Gallery
 * Gestisce invio email tramite Gmail API con Replit Integration
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as cors from 'cors';
import { 
  sendGmailEmail, 
  createNewPhotosEmailHTML,
  createGalleryPasswordEmailHTML,
  createWelcomeEmailHTML,
  createTestEmailHTML
} from './gmail';

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

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

      // Crea HTML email
      const htmlContent = createNewPhotosEmailHTML(galleryName, uploaderName, newPhotosCount, galleryUrl);
      const subject = `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`;

      // Invia email tramite Gmail API
      await sendGmailEmail(recipients, subject, htmlContent);
      logger.info(`New photos notification sent to ${recipients.length} recipients via Gmail API`);
      
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

    // Crea HTML email
    const htmlContent = createNewPhotosEmailHTML(galleryName, uploaderName, newPhotosCount, galleryUrl);
    const subject = `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`;

    // Invia email tramite Gmail API
    await sendGmailEmail(recipients, subject, htmlContent);
    logger.info(`New photos notification sent to ${recipients.length} recipients via Gmail API`);
    
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

    // Crea HTML email
    const htmlContent = createGalleryPasswordEmailHTML(galleryName, galleryCode, galleryPassword);
    const subject = `🔑 Codice di accesso per "${galleryName}"`;

    // Invia email tramite Gmail API
    await sendGmailEmail(recipientEmail, subject, htmlContent);
    logger.info(`Gallery password sent to ${recipientEmail} via Gmail API`);
    
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

    // Crea HTML email
    const htmlContent = createTestEmailHTML();
    const subject = '✅ Test Configurazione Email - Wedding Gallery';

    // Invia email tramite Gmail API
    await sendGmailEmail(recipient, subject, htmlContent);
    logger.info(`Test email sent to ${recipient} via Gmail API`);
    
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

    // Crea HTML email
    const htmlContent = createWelcomeEmailHTML(galleryName);
    const subject = `✨ Benvenuto! Sei iscritto alle notifiche di "${galleryName}"`;

    // Invia email tramite Gmail API
    await sendGmailEmail(recipientEmail, subject, htmlContent);
    logger.info(`Welcome email sent to ${recipientEmail} via Gmail API`);
    
    return { success: true, message: 'Welcome email sent successfully' };
  } catch (error) {
    logger.error('Error sending welcome email:', error);
    throw new HttpsError('internal', 'Failed to send welcome email');
  }
});

import { generateGalleryZip } from './gallery-zip';
import { exportGalleryAccessCSV } from './csv-export';

// Export functions
export { generateGalleryZip, exportGalleryAccessCSV };
