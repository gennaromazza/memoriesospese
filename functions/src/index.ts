/**
 * Firebase Cloud Functions per Wedding Gallery
 * Gestisce invio email tramite Gmail API con Replit Integration
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already done
if (!admin.apps?.length) {
  admin.initializeApp();
}

// Re-export della funzione isolata (no heavy dependencies)
export { getGalleryMetadata } from './metadata';

/**
 * HTTP Function DISABILITATA - Problemi IAM 403 irrisolvibili da Replit
 * Usare sendNewPhotosNotificationCall (callable) invece
 */
// export const sendNewPhotosNotification = functions.https.onRequest(...);

/**
 * Function per invio notifiche nuove foto - CALLABLE (legacy, non più usata dal frontend web)
 */
export const sendNewPhotosNotificationCall = functions
  .runWith({ secrets: ['REPL_IDENTITY'] })
  .https.onCall(async (data, context) => {
  try {
    functions.logger.info('📧 sendNewPhotosNotificationCall invoked with data:', JSON.stringify(data));

    const { galleryName, newPhotosCount, uploaderName, galleryUrl, recipients } = data;

    // Validazioni dettagliate
    if (!galleryName) {
      throw new functions.https.HttpsError('invalid-argument', 'galleryName is required');
    }
    if (!galleryUrl) {
      throw new functions.https.HttpsError('invalid-argument', 'galleryUrl is required');
    }
    if (!recipients || !Array.isArray(recipients)) {
      throw new functions.https.HttpsError('invalid-argument', 'recipients must be an array');
    }
    if (recipients.length === 0) {
      functions.logger.warn('⚠️ No recipients provided, skipping email');
      return { success: true, message: 'No recipients to notify', notified: 0 };
    }

    functions.logger.info(`📨 Preparing to send notification to ${recipients.length} recipient(s)`);

    const { sendGmailEmail, createNewPhotosEmailHTML } = await import('./gmail');
    const htmlContent = createNewPhotosEmailHTML(galleryName, uploaderName || 'Un ospite', newPhotosCount || 1, galleryUrl);
    const subject = `${newPhotosCount || 1} nuova${(newPhotosCount || 1) > 1 ? 'e' : ''} foto in "${galleryName}"`;

    functions.logger.info(`📧 Sending email with subject: "${subject}"`);
    await sendGmailEmail(recipients, subject, htmlContent);

    functions.logger.info(`✅ New photos notification sent to ${recipients.length} recipients via Gmail API`);

    return { 
      success: true, 
      message: 'Notification sent successfully',
      notified: recipients.length 
    };
  } catch (error: any) {
    functions.logger.error('❌ Error sending new photos notification:', {
      error: error?.message || error,
      stack: error?.stack,
      code: error?.code
    });

    // Ritorna errore più dettagliato
    const errorMessage = error?.message || 'Failed to send notification email';
    throw new functions.https.HttpsError('internal', errorMessage, {
      originalError: error?.message,
      code: error?.code
    });
  }
});

/**
 * ✅ VERSIONE PUBBLICA HTTP (CORS-enabled)
 * Endpoint HTTP pubblico per notifiche email nuove foto
 * Supporta CORS da qualsiasi origine (anche Replit)
 * DEPLOYED: questo endpoint è attivo e accessibile via HTTPS
 */
export const sendNewPhotosNotificationPublic = functions
  .runWith({ secrets: ['REPL_IDENTITY'] })
  .https.onRequest(async (req, res) => {
    // CORS - Identico a sendGalleryPasswordV2
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://gennaromazzacane.it',
      'https://www.gennaromazzacane.it'
    ];

    const origin = req.headers.origin || '';
    const isAllowedOrigin = allowedOrigins.some(allowed => allowed === origin) ||
                           origin.includes('.replit.dev') ||
                           origin.includes('replit.app');

    if (isAllowedOrigin) {
      res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '3600');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({
        error: { code: 'method-not-allowed', message: 'Only POST allowed' }
      });
      return;
    }

    try {
      // AUTENTICAZIONE Firebase
      const authHeader = req.headers.authorization || '';
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: { code: 'unauthenticated', message: 'Missing Authorization Bearer token' }
        });
        return;
      }

      const idToken = authHeader.replace('Bearer ', '').trim();
      let uid = '';
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
        functions.logger.info(`🔐 sendNewPhotosNotificationPublic called by uid=${uid}`);
      } catch (authError) {
        functions.logger.error('Auth verification failed:', authError);
        res.status(401).json({
          error: { code: 'unauthenticated', message: 'Invalid token' }
        });
        return;
      }

      // LETTURA DATI DAL BODY
      const data = req.body.data || req.body;
      const {
        galleryName,
        newPhotosCount,
        uploaderName,
        galleryUrl,
        recipients
      } = data || {};

      // VALIDAZIONI
      if (!galleryName || !galleryUrl) {
        res.status(400).json({
          error: { code: 'invalid-argument', message: 'Missing galleryName or galleryUrl' }
        });
        return;
      }

      if (!Array.isArray(recipients) || recipients.length === 0) {
        res.status(400).json({
          error: { code: 'invalid-argument', message: 'recipients must be a non-empty array' }
        });
        return;
      }

      // INVIO EMAIL
      const { sendGmailEmail, createNewPhotosEmailHTML } = await import('./gmail');

      const htmlContent = createNewPhotosEmailHTML(
        galleryName,
        uploaderName,
        newPhotosCount,
        galleryUrl
      );

      const subject = `${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`;

      await sendGmailEmail(recipients, subject, htmlContent);

      functions.logger.info(
        `✉️ Notifica nuove foto inviata a ${recipients.length} destinatari per ${galleryName} da uid=${uid}`
      );

      res.status(200).json({
        result: {
          success: true,
          message: 'Notification sent successfully',
          notified: recipients.length
        }
      });
    } catch (error) {
      functions.logger.error('❌ Error sendNewPhotosNotificationPublic:', error);
      res.status(500).json({
        error: { code: 'internal', message: 'Failed to send notification email' }
      });
    }
  });

/**
 * Function per invio password galleria (HTTP endpoint - NO AUTH REQUIRED)
 * SICUREZZA: Recupera la password direttamente da Firestore server-side
 * VALIDAZIONE: Security question validata server-side
 * Il client NON deve mai conoscere la password
 * SECRETS: Usa Firebase secrets (REPL_IDENTITY) e config per accesso Gmail API
 */
export const sendGalleryPasswordV2 = functions
  .runWith({ secrets: ['REPL_IDENTITY'] })
  .https.onRequest(async (req, res) => {
    // CORS per domini autorizzati
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://gennaromazzacane.it',
      'https://www.gennaromazzacane.it'
    ];

    const origin = req.headers.origin || '';
    const isAllowedOrigin = allowedOrigins.some(allowed => allowed === origin) ||
                           origin.includes('.replit.dev') || // Tutti i domini Replit
                           origin.includes('replit.app');    // Replit deployments

    if (isAllowedOrigin) {
      res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    try {
      const data = req.body.data || req.body;
      const { galleryId, recipientEmail, galleryName, galleryCode, firstName, lastName, galleryUrl, securityAnswer } = data;

      functions.logger.info(`📧 Password request received for gallery ${galleryCode} (${galleryId})`);

      if (!galleryId || !recipientEmail || !galleryName || !galleryCode) {
        functions.logger.error('Missing required parameters');
        res.status(400).json({ 
          error: { code: 'invalid-argument', message: 'Missing required parameters' }
        });
        return;
      }

      // SICUREZZA: Recupera password da Firestore server-side
      const galleryDoc = await admin.firestore().collection('galleries').doc(galleryId).get();

      if (!galleryDoc.exists) {
        functions.logger.error(`Gallery not found: ${galleryId}`);
        res.status(404).json({ 
          error: { code: 'not-found', message: 'Gallery not found' }
        });
        return;
      }

      const galleryData = galleryDoc.data();
      const galleryPassword = galleryData?.password;

      if (!galleryPassword) {
        functions.logger.error(`Gallery password not found: ${galleryId}`);
        res.status(500).json({ 
          error: { code: 'internal', message: 'Gallery password not configured' }
        });
        return;
      }

      // VALIDAZIONE SERVER-SIDE: Security question (se configurata)
      const hasSecurityQuestion = galleryData.requiresSecurityQuestion === true && 
                                 galleryData.securityQuestionType && 
                                 galleryData.securityAnswer;

      if (hasSecurityQuestion) {
        if (!securityAnswer) {
          functions.logger.warn(`Security answer required but not provided for gallery ${galleryId}`);
          res.status(400).json({ 
            error: { code: 'invalid-argument', message: 'Security answer required' }
          });
          return;
        }

        const correctAnswer = galleryData.securityAnswer.toLowerCase().trim();
        const providedAnswer = securityAnswer.toLowerCase().trim();

        if (providedAnswer !== correctAnswer) {
          functions.logger.warn(`Incorrect security answer for gallery ${galleryId}`);
          res.status(403).json({ 
            error: { code: 'permission-denied', message: 'Incorrect security answer' }
          });
          return;
        }

        functions.logger.info(`Security question validated successfully for gallery ${galleryId}`);
      }

      // Lazy import di gmail
      const { sendGmailEmail, createGalleryPasswordEmailHTML } = await import('./gmail');

      // Crea HTML email
      const htmlContent = createGalleryPasswordEmailHTML(
        galleryName, 
        galleryCode, 
        galleryPassword,
        firstName,
        lastName,
        galleryUrl
      );
      const subject = `Accesso autorizzato alla galleria "${galleryName}"`;

      // Invia email tramite Gmail API
      await sendGmailEmail(recipientEmail, subject, htmlContent);
      functions.logger.info(`✅ Gallery password sent to ${recipientEmail} for gallery ${galleryName}`);

      res.status(200).json({ 
        result: { success: true, message: 'Gallery password sent successfully', recipientEmail }
      });
    } catch (error) {
      functions.logger.error('❌ Error sending gallery password:', error);
      res.status(500).json({ 
        error: { code: 'internal', message: 'Failed to send gallery password email' }
      });
    }
  });

/**
 * Cloud Function per invio email "Prenotazione Ricevuta"
 * Inviata automaticamente dopo che il cliente crea una booking
 */
export const sendBookingReceivedEmail = functions
  .runWith({ secrets: ['REPL_IDENTITY'] })
  .https.onRequest(async (req, res) => {
    // CORS
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://gennaromazzacane.it',
      'https://www.gennaromazzacane.it'
    ];

    const origin = req.headers.origin || '';
    const isAllowedOrigin = allowedOrigins.some(allowed => allowed === origin) ||
                           origin.includes('.replit.dev') ||
                           origin.includes('replit.app');

    if (isAllowedOrigin) {
      res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '3600');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({
        error: { code: 'method-not-allowed', message: 'Only POST allowed' }
      });
      return;
    }

    try {
      // AUTENTICAZIONE Firebase (opzionale per booking - guest users)
      const authHeader = req.headers.authorization || '';
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.replace('Bearer ', '').trim();
        try {
          const decoded = await admin.auth().verifyIdToken(idToken);
          functions.logger.info(`🔐 sendBookingReceivedEmail called by uid=${decoded.uid}`);
        } catch (authError) {
          // Log ma non bloccare (guest booking)
          functions.logger.warn('Auth token provided but invalid:', authError);
        }
      }

      // LETTURA DATI DAL BODY
      const data = req.body.data || req.body;
      const {
        recipientEmail,
        clienteNome,
        clienteCognome,
        campaignNome,
        dataShootingInizio,
        dataShootingFine,
        prodottoNome,
        note
      } = data || {};

      // VALIDAZIONI
      if (!recipientEmail || !clienteNome || !clienteCognome || !campaignNome || !dataShootingInizio || !dataShootingFine) {
        res.status(400).json({
          error: { code: 'invalid-argument', message: 'Missing required booking details' }
        });
        return;
      }

      // INVIO EMAIL
      const { sendGmailEmail, createBookingReceivedEmailHTML } = await import('./gmail');

      const htmlContent = createBookingReceivedEmailHTML({
        clienteNome,
        clienteCognome,
        campaignNome,
        dataShootingInizio,
        dataShootingFine,
        prodottoNome,
        note: note || ''
      });

      const subject = `Prenotazione Ricevuta - ${campaignNome}`;

      await sendGmailEmail(recipientEmail, subject, htmlContent);

      functions.logger.info(
        `✉️ Email "Prenotazione Ricevuta" inviata a ${recipientEmail} per campagna ${campaignNome}`
      );

      res.status(200).json({
        result: {
          success: true,
          message: 'Booking received email sent successfully',
          recipientEmail
        }
      });
    } catch (error) {
      functions.logger.error('❌ Error sendBookingReceivedEmail:', error);
      res.status(500).json({
        error: { code: 'internal', message: 'Failed to send booking received email' }
      });
    }
  });

/**
 * Cloud Function per invio email "Prenotazione Confermata"
 * Inviata dopo che l'admin approva la booking
 */
export const sendBookingConfirmedEmail = functions
  .runWith({ secrets: ['REPL_IDENTITY'] })
  .https.onRequest(async (req, res) => {
    // CORS
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://gennaromazzacane.it',
      'https://www.gennaromazzacane.it'
    ];

    const origin = req.headers.origin || '';
    const isAllowedOrigin = allowedOrigins.some(allowed => allowed === origin) ||
                           origin.includes('.replit.dev') ||
                           origin.includes('replit.app');

    if (isAllowedOrigin) {
      res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '3600');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({
        error: { code: 'method-not-allowed', message: 'Only POST allowed' }
      });
      return;
    }

    try {
      // AUTENTICAZIONE Firebase (opzionale - chiamata server-side da Express)
      const authHeader = req.headers.authorization || '';
      let uid = 'server';
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.replace('Bearer ', '').trim();
        try {
          const decoded = await admin.auth().verifyIdToken(idToken);
          uid = decoded.uid;
          functions.logger.info(`🔐 sendBookingConfirmedEmail called by uid=${uid}`);
        } catch (authError) {
          // Log ma non bloccare (chiamata server-side)
          functions.logger.warn('Auth token provided but invalid:', authError);
        }
      }

      // LETTURA DATI DAL BODY
      const data = req.body.data || req.body;
      const {
        recipientEmail,
        clienteNome,
        clienteCognome,
        campaignNome,
        dataShootingInizio,
        dataShootingFine,
        prodottoNome,
        note
      } = data || {};

      // VALIDAZIONI
      if (!recipientEmail || !clienteNome || !clienteCognome || !campaignNome || !dataShootingInizio || !dataShootingFine) {
        res.status(400).json({
          error: { code: 'invalid-argument', message: 'Missing required booking details' }
        });
        return;
      }

      // INVIO EMAIL
      const { sendGmailEmail, createBookingConfirmedEmailHTML } = await import('./gmail');

      const htmlContent = createBookingConfirmedEmailHTML({
        clienteNome,
        clienteCognome,
        campaignNome,
        dataShootingInizio,
        dataShootingFine,
        prodottoNome,
        note: note || ''
      });

      const subject = `✅ Prenotazione Confermata - ${campaignNome}`;

      await sendGmailEmail(recipientEmail, subject, htmlContent);

      functions.logger.info(
        `✉️ Email "Prenotazione Confermata" inviata a ${recipientEmail} per campagna ${campaignNome} da admin uid=${uid}`
      );

      res.status(200).json({
        result: {
          success: true,
          message: 'Booking confirmed email sent successfully',
          recipientEmail
        }
      });
    } catch (error) {
      functions.logger.error('❌ Error sendBookingConfirmedEmail:', error);
      res.status(500).json({
        error: { code: 'internal', message: 'Failed to send booking confirmed email' }
      });
    }
  });

/**
 * Function per test configurazione email
 */
export const testEmailConfiguration = functions.https.onCall(async (data, context) => {
  try {
    const { testRecipient } = data;
    const recipient = testRecipient || 'gennaro.mazzacane@gmail.com';

    // Lazy import di gmail (solo quando necessario)
    const { sendGmailEmail, createTestEmailHTML } = await import('./gmail');

    // Crea HTML email
    const htmlContent = createTestEmailHTML();
    const subject = 'Test Configurazione Email - Wedding Gallery';

    // Invia email tramite Gmail API
    await sendGmailEmail(recipient, subject, htmlContent);
    functions.logger.info(`Test email sent to ${recipient} via Gmail API`);

    return { success: true, message: 'Test email sent successfully' };
  } catch (error) {
    functions.logger.error('Error sending test email:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send test email');
  }
});

/**
 * Function per email di benvenuto
 */
export const sendWelcomeEmail = functions.https.onCall(async (data, context) => {
  try {
    const { recipientEmail, galleryName } = data;

    if (!recipientEmail || !galleryName) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
    }

    // Lazy import di gmail (solo quando necessario)
    const { sendGmailEmail, createWelcomeEmailHTML } = await import('./gmail');

    // Crea HTML email
    const htmlContent = createWelcomeEmailHTML(galleryName);
    const subject = `Benvenuto! Sei iscritto alle notifiche di "${galleryName}"`;

    // Invia email tramite Gmail API
    await sendGmailEmail(recipientEmail, subject, htmlContent);
    functions.logger.info(`Welcome email sent to ${recipientEmail} via Gmail API`);

    return { success: true, message: 'Welcome email sent successfully' };
  } catch (error) {
    functions.logger.error('Error sending welcome email:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send welcome email');
  }
});

// Import altre funzioni - TEMPORANEAMENTE DISABILITATI PER DEBUG
// import { exportGalleryAccessCSV } from './csv-export';

// Export functions
// export { exportGalleryAccessCSV };