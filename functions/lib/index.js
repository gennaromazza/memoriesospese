"use strict";
/**
 * Firebase Cloud Functions per Wedding Gallery
 * Gestisce invio email tramite Gmail API con Replit Integration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWelcomeEmail = exports.testEmailConfiguration = exports.sendGalleryPasswordV2 = exports.sendNewPhotosNotificationCall = exports.sendNewPhotosNotification = exports.getGalleryMetadata = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors");
// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
    admin.initializeApp();
}
// Re-export della funzione isolata (no heavy dependencies)
var metadata_1 = require("./metadata");
Object.defineProperty(exports, "getGalleryMetadata", { enumerable: true, get: function () { return metadata_1.getGalleryMetadata; } });
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
exports.sendNewPhotosNotification = functions.https.onRequest(async (req, res) => {
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
            }
            catch (error) {
                functions.logger.error('Authentication verification failed:', error);
                res.status(401).json({ error: 'Authentication verification failed' });
                return;
            }
            const { galleryName, newPhotosCount, uploaderName, galleryUrl, recipients } = req.body;
            if (!recipients || recipients.length === 0) {
                res.status(400).json({ error: 'Recipients list is required' });
                return;
            }
            // Lazy import di gmail (solo quando necessario)
            const { sendGmailEmail, createNewPhotosEmailHTML } = await Promise.resolve().then(() => require('./gmail'));
            // Crea HTML email
            const htmlContent = createNewPhotosEmailHTML(galleryName, uploaderName, newPhotosCount, galleryUrl);
            const subject = `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`;
            // Invia email tramite Gmail API
            await sendGmailEmail(recipients, subject, htmlContent);
            functions.logger.info(`New photos notification sent to ${recipients.length} recipients via Gmail API`);
            res.status(200).json({ success: true, message: 'Notification sent successfully' });
        }
        catch (error) {
            functions.logger.error('Error sending new photos notification:', error);
            res.status(500).json({ error: 'Failed to send notification email' });
        }
    });
});
/**
 * Function per invio notifiche nuove foto - Versione onCall per compatibilità
 */
exports.sendNewPhotosNotificationCall = functions.https.onCall(async (data, context) => {
    try {
        const { galleryName, newPhotosCount, uploaderName, galleryUrl, recipients } = data;
        if (!recipients || recipients.length === 0) {
            throw new functions.https.HttpsError('invalid-argument', 'Recipients list is required');
        }
        // Lazy import di gmail (solo quando necessario)
        const { sendGmailEmail, createNewPhotosEmailHTML } = await Promise.resolve().then(() => require('./gmail'));
        // Crea HTML email
        const htmlContent = createNewPhotosEmailHTML(galleryName, uploaderName, newPhotosCount, galleryUrl);
        const subject = `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`;
        // Invia email tramite Gmail API
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
        const subject = `🔑 Accesso autorizzato alla galleria "${galleryName}"`;
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
        const subject = '✅ Test Configurazione Email - Wedding Gallery';
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
        const subject = `✨ Benvenuto! Sei iscritto alle notifiche di "${galleryName}"`;
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