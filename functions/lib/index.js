"use strict";
/**
 * Firebase Cloud Functions per Wedding Gallery
 * Gestisce invio email tramite Gmail API con Replit Integration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWelcomeEmail = exports.testEmailConfiguration = exports.sendGalleryPasswordV2 = exports.sendNewPhotosNotificationPublic = exports.sendNewPhotosNotificationCall = exports.getGalleryMetadata = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
    admin.initializeApp();
}
// Re-export della funzione isolata (no heavy dependencies)
var metadata_1 = require("./metadata");
Object.defineProperty(exports, "getGalleryMetadata", { enumerable: true, get: function () { return metadata_1.getGalleryMetadata; } });
/**
 * HTTP Function DISABILITATA - Problemi IAM 403 irrisolvibili da Replit
 * Usare sendNewPhotosNotificationCall (callable) invece
 */
// export const sendNewPhotosNotification = functions.https.onRequest(...);
/**
 * Function per invio notifiche nuove foto - CALLABLE (legacy, non più usata dal frontend web)
 */
exports.sendNewPhotosNotificationCall = functions
    .runWith({ secrets: ['REPL_IDENTITY'] })
    .https.onCall(async (data, context) => {
    try {
        const { galleryName, newPhotosCount, uploaderName, galleryUrl, recipients } = data;
        if (!recipients || recipients.length === 0) {
            throw new functions.https.HttpsError('invalid-argument', 'Recipients list is required');
        }
        const { sendGmailEmail, createNewPhotosEmailHTML } = await Promise.resolve().then(() => require('./gmail'));
        const htmlContent = createNewPhotosEmailHTML(galleryName, uploaderName, newPhotosCount, galleryUrl);
        const subject = `${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`;
        await sendGmailEmail(recipients, subject, htmlContent);
        functions.logger.info(`New photos notification sent to ${recipients.length} recipients via Gmail API`);
        return { success: true, message: 'Notification sent successfully' };
    }
    catch (error) {
        functions.logger.error('Error sending new photos notification:', error);
        throw new functions.https.HttpsError('internal', 'Failed to send notification email');
    }
});
/**
 * Function per invio notifiche nuove foto - HTTP PUBLIC (funzione principale)
 * CORS gestito manualmente, identico a sendGalleryPasswordV2
 * AUTENTICAZIONE richiesta via Firebase Bearer token
 * SECRETS: REPL_IDENTITY per accesso Gmail API
 */
exports.sendNewPhotosNotificationPublic = functions
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
        }
        catch (authError) {
            functions.logger.error('Auth verification failed:', authError);
            res.status(401).json({
                error: { code: 'unauthenticated', message: 'Invalid token' }
            });
            return;
        }
        // LETTURA DATI DAL BODY
        const data = req.body.data || req.body;
        const { galleryName, newPhotosCount, uploaderName, galleryUrl, recipients } = data || {};
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
        const { sendGmailEmail, createNewPhotosEmailHTML } = await Promise.resolve().then(() => require('./gmail'));
        const htmlContent = createNewPhotosEmailHTML(galleryName, uploaderName, newPhotosCount, galleryUrl);
        const subject = `${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`;
        await sendGmailEmail(recipients, subject, htmlContent);
        functions.logger.info(`✉️ Notifica nuove foto inviata a ${recipients.length} destinatari per ${galleryName} da uid=${uid}`);
        res.status(200).json({
            result: {
                success: true,
                message: 'Notification sent successfully',
                notified: recipients.length
            }
        });
    }
    catch (error) {
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
exports.sendGalleryPasswordV2 = functions
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
        origin.includes('replit.app'); // Replit deployments
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
        const { sendGmailEmail, createGalleryPasswordEmailHTML } = await Promise.resolve().then(() => require('./gmail'));
        // Crea HTML email
        const htmlContent = createGalleryPasswordEmailHTML(galleryName, galleryCode, galleryPassword, firstName, lastName, galleryUrl);
        const subject = `Accesso autorizzato alla galleria "${galleryName}"`;
        // Invia email tramite Gmail API
        await sendGmailEmail(recipientEmail, subject, htmlContent);
        functions.logger.info(`✅ Gallery password sent to ${recipientEmail} for gallery ${galleryName}`);
        res.status(200).json({
            result: { success: true, message: 'Gallery password sent successfully', recipientEmail }
        });
    }
    catch (error) {
        functions.logger.error('❌ Error sending gallery password:', error);
        res.status(500).json({
            error: { code: 'internal', message: 'Failed to send gallery password email' }
        });
    }
});
/**
 * Function per test configurazione email
 */
exports.testEmailConfiguration = functions.https.onCall(async (data, context) => {
    try {
        const { testRecipient } = data;
        const recipient = testRecipient || 'gennaro.mazzacane@gmail.com';
        // Lazy import di gmail (solo quando necessario)
        const { sendGmailEmail, createTestEmailHTML } = await Promise.resolve().then(() => require('./gmail'));
        // Crea HTML email
        const htmlContent = createTestEmailHTML();
        const subject = 'Test Configurazione Email - Wedding Gallery';
        // Invia email tramite Gmail API
        await sendGmailEmail(recipient, subject, htmlContent);
        functions.logger.info(`Test email sent to ${recipient} via Gmail API`);
        return { success: true, message: 'Test email sent successfully' };
    }
    catch (error) {
        functions.logger.error('Error sending test email:', error);
        throw new functions.https.HttpsError('internal', 'Failed to send test email');
    }
});
/**
 * Function per email di benvenuto
 */
exports.sendWelcomeEmail = functions.https.onCall(async (data, context) => {
    try {
        const { recipientEmail, galleryName } = data;
        if (!recipientEmail || !galleryName) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
        }
        // Lazy import di gmail (solo quando necessario)
        const { sendGmailEmail, createWelcomeEmailHTML } = await Promise.resolve().then(() => require('./gmail'));
        // Crea HTML email
        const htmlContent = createWelcomeEmailHTML(galleryName);
        const subject = `Benvenuto! Sei iscritto alle notifiche di "${galleryName}"`;
        // Invia email tramite Gmail API
        await sendGmailEmail(recipientEmail, subject, htmlContent);
        functions.logger.info(`Welcome email sent to ${recipientEmail} via Gmail API`);
        return { success: true, message: 'Welcome email sent successfully' };
    }
    catch (error) {
        functions.logger.error('Error sending welcome email:', error);
        throw new functions.https.HttpsError('internal', 'Failed to send welcome email');
    }
});
// Import altre funzioni - TEMPORANEAMENTE DISABILITATI PER DEBUG
// import { exportGalleryAccessCSV } from './csv-export';
// Export functions
// export { exportGalleryAccessCSV };
//# sourceMappingURL=index.js.map