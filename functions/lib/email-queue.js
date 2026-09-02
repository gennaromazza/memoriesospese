"use strict";
/**
 * Email Queue System con Rate Limiting per Gmail API
 * Gestisce invio massivo rispettando limiti Google
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailQueue = void 0;
const functions = require("firebase-functions");
const firebase_admin_1 = require("./firebase-admin");
const gmail_1 = require("./gmail");
// Limiti Gmail API
const RATE_LIMITS = {
    EMAILS_PER_MINUTE: 90, // Sicurezza: 90 invece di 100
    EMAILS_PER_DAY: 1800, // Sicurezza: 1800 invece di 2000
    BATCH_SIZE: 10, // Email per batch
    BATCH_DELAY_MS: 7000 // 7 secondi tra batch (safety margin)
};
class EmailQueue {
    /**
     * Acquisisci distributed lock per processare la queue
     * Previene processing concorrente su più istanze Cloud Functions
     */
    static async acquireLock() {
        const lockRef = firebase_admin_1.db.doc('locks/emailQueue');
        const lockDuration = 120000; // 2 minuti
        const now = Date.now();
        try {
            const lockDoc = await lockRef.get();
            if (lockDoc.exists) {
                const lockedUntil = lockDoc.data()?.lockedUntil || 0;
                if (lockedUntil > now) {
                    functions.logger.info('⏸️ Queue già in elaborazione da altra istanza');
                    return false;
                }
            }
            // Imposta lock atomico
            await lockRef.set({
                lockedUntil: now + lockDuration,
                lockedAt: new Date(),
                instanceId: process.env.K_SERVICE || 'unknown'
            });
            return true;
        }
        catch (error) {
            functions.logger.error('❌ Errore acquisizione lock:', error);
            return false;
        }
    }
    /**
     * Rilascia distributed lock
     */
    static async releaseLock() {
        try {
            await firebase_admin_1.db.doc('locks/emailQueue').delete();
            functions.logger.info('🔓 Lock rilasciato');
        }
        catch (error) {
            functions.logger.warn('⚠️ Errore rilascio lock:', error);
        }
    }
    /**
     * Aggiungi email alla queue
     */
    static async enqueue(params) {
        const toArray = Array.isArray(params.to) ? params.to : [params.to];
        // Validazione mittente (solo domini autorizzati)
        const allowedFromDomains = ['gennaromazzacane.it', 'memoriesospese.it'];
        const fromEmail = params.from || 'Memorie Sospese <memoriesospese@gennaromazzacane.it>';
        const fromDomain = fromEmail.match(/@([^>]+)/)?.[1];
        if (fromDomain && !allowedFromDomains.some(d => fromDomain.includes(d))) {
            functions.logger.warn(`⚠️ Mittente non autorizzato: ${fromEmail}, uso default`);
        }
        const queueItem = {
            to: toArray,
            subject: params.subject,
            htmlContent: params.htmlContent,
            from: fromEmail,
            priority: params.priority || 'normal',
            attempts: 0,
            maxAttempts: 3,
            createdAt: new Date(),
            scheduledFor: params.scheduledFor || new Date(),
            status: 'pending',
            metadata: params.metadata
        };
        const docRef = await firebase_admin_1.db.collection('emailQueue').add(queueItem);
        // Log dettagliato con metadata
        const metaInfo = params.metadata ?
            ` | type=${params.metadata.type} | galleryId=${params.metadata.galleryId || 'N/A'}` : '';
        functions.logger.info(`📬 Email enqueued: ${docRef.id} | recipients=${toArray.length} | priority=${params.priority}${metaInfo}`);
        return docRef.id;
    }
    /**
     * Compatibilità con i call-site legacy.
     *
     * I nuovi call-site devono usare enqueue(), che accetta un unico oggetto
     * e permette di specificare priorità, scheduling e metadata.
     */
    static async addEmailToQueue(to, subject, htmlContent) {
        return this.enqueue({ to, subject, htmlContent });
    }
    /**
     * Verifica se possiamo inviare email (controllo rate limit)
     */
    static async canSendEmail() {
        const now = new Date();
        const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        // Conta email inviate nell'ultimo minuto
        const minuteSnapshot = await firebase_admin_1.db.collection('emailQueue')
            .where('status', '==', 'sent')
            .where('processedAt', '>=', oneMinuteAgo)
            .get();
        // Conta email inviate nelle ultime 24 ore
        const daySnapshot = await firebase_admin_1.db.collection('emailQueue')
            .where('status', '==', 'sent')
            .where('processedAt', '>=', oneDayAgo)
            .get();
        const minuteCount = minuteSnapshot.size;
        const dayCount = daySnapshot.size;
        const allowed = minuteCount < RATE_LIMITS.EMAILS_PER_MINUTE &&
            dayCount < RATE_LIMITS.EMAILS_PER_DAY;
        return { allowed, minuteCount, dayCount };
    }
    /**
     * Processa queue (chiamato da Cloud Function schedulata)
     */
    static async processQueue() {
        // Acquisisci distributed lock
        const hasLock = await this.acquireLock();
        if (!hasLock) {
            return;
        }
        try {
            // Verifica rate limit
            const rateCheck = await this.canSendEmail();
            if (!rateCheck.allowed) {
                functions.logger.warn(`⚠️ Rate limit raggiunto: ${rateCheck.minuteCount}/min, ${rateCheck.dayCount}/day`);
                return;
            }
            // Recupera email da processare
            const snapshot = await firebase_admin_1.db.collection('emailQueue')
                .where('status', '==', 'pending')
                .where('scheduledFor', '<=', new Date())
                .orderBy('scheduledFor')
                .orderBy('priority', 'desc')
                .limit(RATE_LIMITS.BATCH_SIZE)
                .get();
            if (snapshot.empty) {
                functions.logger.info('📭 Queue vuota');
                return;
            }
            functions.logger.info(`📨 Processando ${snapshot.size} email dalla queue`);
            // Processa ogni email
            for (const doc of snapshot.docs) {
                const email = doc.data();
                try {
                    // Marca come processing
                    await doc.ref.update({ status: 'processing' });
                    // Invia email
                    await (0, gmail_1.sendGmailEmail)(email.to, email.subject, email.htmlContent, email.from);
                    // Marca come inviata
                    await doc.ref.update({
                        status: 'sent',
                        processedAt: new Date()
                    });
                    // Log dettagliato successo con metadata
                    const metaInfo = email.metadata ?
                        ` | type=${email.metadata.type} | galleryId=${email.metadata.galleryId || 'N/A'}` : '';
                    functions.logger.info(`✅ Email inviata: ${doc.id} | recipients=${email.to.length}${metaInfo}`);
                }
                catch (error) {
                    const newAttempts = email.attempts + 1;
                    // Log errore dettagliato
                    const metaInfo = email.metadata ?
                        ` | type=${email.metadata.type} | galleryId=${email.metadata.galleryId || 'N/A'}` : '';
                    functions.logger.error(`❌ Errore invio email ${doc.id} (attempt ${newAttempts}/${email.maxAttempts})${metaInfo}:`, error.message);
                    if (newAttempts >= email.maxAttempts) {
                        // Troppi tentativi, marca come failed
                        await doc.ref.update({
                            status: 'failed',
                            attempts: newAttempts,
                            errorMessage: error.message,
                            processedAt: new Date()
                        });
                        functions.logger.error(`❌ Email failed definitivamente: ${doc.id}`, error);
                    }
                    else {
                        // Retry dopo 5 minuti
                        const retryAt = new Date(Date.now() + 5 * 60 * 1000);
                        await doc.ref.update({
                            status: 'pending',
                            attempts: newAttempts,
                            scheduledFor: retryAt,
                            errorMessage: error.message
                        });
                        functions.logger.warn(`⚠️ Email retry schedulato: ${doc.id} (attempt ${newAttempts})`);
                    }
                }
                // Delay tra email per rispettare rate limit
                await new Promise(resolve => setTimeout(resolve, RATE_LIMITS.BATCH_DELAY_MS / RATE_LIMITS.BATCH_SIZE));
            }
        }
        finally {
            // Rilascia sempre il lock, anche in caso di errore
            await this.releaseLock();
        }
    }
    /**
     * Ottieni statistiche queue
     */
    static async getStats() {
        const [pendingSnap, processingSnap, sentSnap, failedSnap] = await Promise.all([
            firebase_admin_1.db.collection('emailQueue').where('status', '==', 'pending').get(),
            firebase_admin_1.db.collection('emailQueue').where('status', '==', 'processing').get(),
            firebase_admin_1.db.collection('emailQueue').where('status', '==', 'sent').get(),
            firebase_admin_1.db.collection('emailQueue').where('status', '==', 'failed').get()
        ]);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const todaySnap = await firebase_admin_1.db.collection('emailQueue')
            .where('status', '==', 'sent')
            .where('processedAt', '>=', oneDayAgo)
            .get();
        const lastHourSnap = await firebase_admin_1.db.collection('emailQueue')
            .where('status', '==', 'sent')
            .where('processedAt', '>=', oneHourAgo)
            .get();
        return {
            pending: pendingSnap.size,
            processing: processingSnap.size,
            sent: sentSnap.size,
            failed: failedSnap.size,
            todayCount: todaySnap.size,
            lastHourCount: lastHourSnap.size
        };
    }
}
exports.EmailQueue = EmailQueue;
//# sourceMappingURL=email-queue.js.map