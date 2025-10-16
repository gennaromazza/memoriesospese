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
 * Helper: Ottieni testo domanda di sicurezza
 */
function getSecurityQuestionText(galleryData: any): string | undefined {
  const questionMap: Record<string, string> = {
    'groomName': 'Nome dello sposo',
    'brideName': 'Nome della sposa',
    'weddingDate': 'Data del matrimonio (gg/mm/aaaa)',
    'weddingLocation': 'Luogo del matrimonio',
    'custom': galleryData.customSecurityQuestion || 'Domanda personalizzata'
  };
  
  return galleryData.securityQuestionType ? questionMap[galleryData.securityQuestionType] : undefined;
}

/**
 * Function per recuperare metadata galleria (SICURI - senza password/securityAnswer)
 * SICUREZZA: Ritorna SOLO dati non-sensibili, MAI password o securityAnswer
 */
export const getGalleryMetadata = onCall(async (request) => {
  try {
    const { galleryCode } = request.data;

    if (!galleryCode) {
      throw new HttpsError('invalid-argument', 'galleryCode is required');
    }

    // Cerca galleria per code field
    const galleriesByCode = await admin.firestore()
      .collection('galleries')
      .where('code', '==', galleryCode)
      .limit(1)
      .get();

    let galleryDoc;
    let galleryId;

    if (!galleriesByCode.empty) {
      galleryDoc = galleriesByCode.docs[0];
      galleryId = galleryDoc.id;
    } else {
      // Fallback: cerca per document ID
      galleryDoc = await admin.firestore().collection('galleries').doc(galleryCode).get();
      galleryId = galleryCode;
      
      if (!galleryDoc.exists) {
        logger.warn(`Gallery not found for code: ${galleryCode}`);
        throw new HttpsError('not-found', 'Gallery not found');
      }
    }

    const galleryData = galleryDoc.data();
    if (!galleryData) {
      throw new HttpsError('internal', 'Gallery data is empty');
    }

    // Verifica se ha domanda di sicurezza
    const hasSecurityQuestion = galleryData.requiresSecurityQuestion === true && 
                               galleryData.securityQuestionType && 
                               galleryData.securityAnswer;

    // SICUREZZA: Ritorna SOLO metadata non-sensibili
    // ❌ NO password
    // ❌ NO securityAnswer
    const metadata = {
      id: galleryId,
      name: galleryData.name,
      code: galleryData.code || galleryCode,
      requiresSecurityQuestion: hasSecurityQuestion,
      securityQuestion: hasSecurityQuestion ? getSecurityQuestionText(galleryData) : undefined
    };

    logger.info(`Gallery metadata retrieved for: ${galleryCode} (ID: ${galleryId}) - NO sensitive data exposed`);
    return metadata;
    
  } catch (error) {
    logger.error('Error retrieving gallery metadata:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to retrieve gallery metadata');
  }
});

/**
 * Function per invio password galleria
 * SICUREZZA: Recupera la password direttamente da Firestore server-side
 * VALIDAZIONE: Security question validata server-side
 * Il client NON deve mai conoscere la password
 */
export const sendGalleryPassword = onCall(async (request) => {
  try {
    const { galleryId, recipientEmail, galleryName, galleryCode, firstName, lastName, galleryUrl, securityAnswer } = request.data;

    if (!galleryId || !recipientEmail || !galleryName || !galleryCode) {
      throw new HttpsError('invalid-argument', 'Missing required parameters: galleryId, recipientEmail, galleryName, galleryCode');
    }

    // SICUREZZA: Recupera password da Firestore server-side
    // Il client NON invia mai la password
    const galleryDoc = await admin.firestore().collection('galleries').doc(galleryId).get();
    
    if (!galleryDoc.exists) {
      logger.error(`Gallery not found: ${galleryId}`);
      throw new HttpsError('not-found', 'Gallery not found');
    }
    
    const galleryData = galleryDoc.data();
    const galleryPassword = galleryData?.password;
    
    if (!galleryPassword) {
      logger.error(`Gallery password not found: ${galleryId}`);
      throw new HttpsError('internal', 'Gallery password not configured');
    }

    // VALIDAZIONE SERVER-SIDE: Security question (se configurata)
    const hasSecurityQuestion = galleryData.requiresSecurityQuestion === true && 
                               galleryData.securityQuestionType && 
                               galleryData.securityAnswer;
    
    if (hasSecurityQuestion) {
      if (!securityAnswer) {
        logger.warn(`Security answer required but not provided for gallery ${galleryId}`);
        throw new HttpsError('invalid-argument', 'Security answer required');
      }
      
      const correctAnswer = galleryData.securityAnswer.toLowerCase().trim();
      const providedAnswer = securityAnswer.toLowerCase().trim();
      
      if (providedAnswer !== correctAnswer) {
        logger.warn(`Incorrect security answer for gallery ${galleryId}`);
        throw new HttpsError('permission-denied', 'Incorrect security answer');
      }
      
      logger.info(`Security question validated successfully for gallery ${galleryId}`);
    }

    // Crea HTML email con parametri completi
    const htmlContent = createGalleryPasswordEmailHTML(
      galleryName, 
      galleryCode, 
      galleryPassword,
      firstName,
      lastName,
      galleryUrl
    );
    const subject = `🔑 Accesso autorizzato alla galleria "${galleryName}"`;

    // Invia email tramite Gmail API
    await sendGmailEmail(recipientEmail, subject, htmlContent);
    logger.info(`Gallery password sent to ${recipientEmail} for gallery ${galleryName} (ID: ${galleryId}) via Gmail API`);
    
    return { success: true, message: 'Gallery password sent successfully', recipientEmail };
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
