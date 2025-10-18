"use strict";
/**
 * Firebase Cloud Functions per Wedding Gallery
 * Gestisce invio email tramite Gmail API con Replit Integration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportGalleryAccessCSV = exports.generateGalleryZip = exports.sendWelcomeEmail = exports.testEmailConfiguration = exports.sendGalleryPassword = exports.getGalleryMetadata = exports.sendNewPhotosNotificationCall = exports.sendNewPhotosNotification = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors");
const gmail_1 = require("./gmail");
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
            // Crea HTML email
            const htmlContent = (0, gmail_1.createNewPhotosEmailHTML)(galleryName, uploaderName, newPhotosCount, galleryUrl);
            const subject = `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`;
            // Invia email tramite Gmail API
            await (0, gmail_1.sendGmailEmail)(recipients, subject, htmlContent);
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
        // Crea HTML email
        const htmlContent = (0, gmail_1.createNewPhotosEmailHTML)(galleryName, uploaderName, newPhotosCount, galleryUrl);
        const subject = `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`;
        // Invia email tramite Gmail API
        await (0, gmail_1.sendGmailEmail)(recipients, subject, htmlContent);
        functions.logger.info(`New photos notification sent to ${recipients.length} recipients via Gmail API`);
        return { success: true, message: 'Notification sent successfully' };
    }
    catch (error) {
        functions.logger.error('Error sending new photos notification:', error);
        throw new functions.https.HttpsError('internal', 'Failed to send notification email');
    }
});
/**
 * Helper: Ottieni testo domanda di sicurezza
 */
function getSecurityQuestionText(galleryData) {
    const questionMap = {
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
exports.getGalleryMetadata = functions.https.onCall(async (data, context) => {
    try {
        const { galleryCode } = data;
        if (!galleryCode) {
            throw new functions.https.HttpsError('invalid-argument', 'galleryCode is required');
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
        }
        else {
            // Fallback: cerca per document ID
            galleryDoc = await admin.firestore().collection('galleries').doc(galleryCode).get();
            galleryId = galleryCode;
            if (!galleryDoc.exists) {
                functions.logger.warn(`Gallery not found for code: ${galleryCode}`);
                throw new functions.https.HttpsError('not-found', 'Gallery not found');
            }
        }
        const galleryData = galleryDoc.data();
        if (!galleryData) {
            throw new functions.https.HttpsError('internal', 'Gallery data is empty');
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
        functions.logger.info(`Gallery metadata retrieved for: ${galleryCode} (ID: ${galleryId}) - NO sensitive data exposed`);
        return metadata;
    }
    catch (error) {
        functions.logger.error('Error retrieving gallery metadata:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to retrieve gallery metadata');
    }
});
/**
 * Function per invio password galleria
 * SICUREZZA: Recupera la password direttamente da Firestore server-side
 * VALIDAZIONE: Security question validata server-side
 * Il client NON deve mai conoscere la password
 */
exports.sendGalleryPassword = functions.https.onCall(async (data, context) => {
    try {
        const { galleryId, recipientEmail, galleryName, galleryCode, firstName, lastName, galleryUrl, securityAnswer } = data;
        if (!galleryId || !recipientEmail || !galleryName || !galleryCode) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters: galleryId, recipientEmail, galleryName, galleryCode');
        }
        // SICUREZZA: Recupera password da Firestore server-side
        // Il client NON invia mai la password
        const galleryDoc = await admin.firestore().collection('galleries').doc(galleryId).get();
        if (!galleryDoc.exists) {
            functions.logger.error(`Gallery not found: ${galleryId}`);
            throw new functions.https.HttpsError('not-found', 'Gallery not found');
        }
        const galleryData = galleryDoc.data();
        const galleryPassword = galleryData?.password;
        if (!galleryPassword) {
            functions.logger.error(`Gallery password not found: ${galleryId}`);
            throw new functions.https.HttpsError('internal', 'Gallery password not configured');
        }
        // VALIDAZIONE SERVER-SIDE: Security question (se configurata)
        const hasSecurityQuestion = galleryData.requiresSecurityQuestion === true &&
            galleryData.securityQuestionType &&
            galleryData.securityAnswer;
        if (hasSecurityQuestion) {
            if (!securityAnswer) {
                functions.logger.warn(`Security answer required but not provided for gallery ${galleryId}`);
                throw new functions.https.HttpsError('invalid-argument', 'Security answer required');
            }
            const correctAnswer = galleryData.securityAnswer.toLowerCase().trim();
            const providedAnswer = securityAnswer.toLowerCase().trim();
            if (providedAnswer !== correctAnswer) {
                functions.logger.warn(`Incorrect security answer for gallery ${galleryId}`);
                throw new functions.https.HttpsError('permission-denied', 'Incorrect security answer');
            }
            functions.logger.info(`Security question validated successfully for gallery ${galleryId}`);
        }
        // Crea HTML email con parametri completi
        const htmlContent = (0, gmail_1.createGalleryPasswordEmailHTML)(galleryName, galleryCode, galleryPassword, firstName, lastName, galleryUrl);
        const subject = `🔑 Accesso autorizzato alla galleria "${galleryName}"`;
        // Invia email tramite Gmail API
        await (0, gmail_1.sendGmailEmail)(recipientEmail, subject, htmlContent);
        functions.logger.info(`Gallery password sent to ${recipientEmail} for gallery ${galleryName} (ID: ${galleryId}) via Gmail API`);
        return { success: true, message: 'Gallery password sent successfully', recipientEmail };
    }
    catch (error) {
        functions.logger.error('Error sending gallery password:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to send gallery password email');
    }
});
/**
 * Function per test configurazione email
 */
exports.testEmailConfiguration = functions.https.onCall(async (data, context) => {
    try {
        const { testRecipient } = data;
        const recipient = testRecipient || 'gennaro.mazzacane@gmail.com';
        // Crea HTML email
        const htmlContent = (0, gmail_1.createTestEmailHTML)();
        const subject = '✅ Test Configurazione Email - Wedding Gallery';
        // Invia email tramite Gmail API
        await (0, gmail_1.sendGmailEmail)(recipient, subject, htmlContent);
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
        // Crea HTML email
        const htmlContent = (0, gmail_1.createWelcomeEmailHTML)(galleryName);
        const subject = `✨ Benvenuto! Sei iscritto alle notifiche di "${galleryName}"`;
        // Invia email tramite Gmail API
        await (0, gmail_1.sendGmailEmail)(recipientEmail, subject, htmlContent);
        functions.logger.info(`Welcome email sent to ${recipientEmail} via Gmail API`);
        return { success: true, message: 'Welcome email sent successfully' };
    }
    catch (error) {
        functions.logger.error('Error sending welcome email:', error);
        throw new functions.https.HttpsError('internal', 'Failed to send welcome email');
    }
});
// Import altre funzioni
const gallery_zip_1 = require("./gallery-zip");
Object.defineProperty(exports, "generateGalleryZip", { enumerable: true, get: function () { return gallery_zip_1.generateGalleryZip; } });
const csv_export_1 = require("./csv-export");
Object.defineProperty(exports, "exportGalleryAccessCSV", { enumerable: true, get: function () { return csv_export_1.exportGalleryAccessCSV; } });
//# sourceMappingURL=index.js.map