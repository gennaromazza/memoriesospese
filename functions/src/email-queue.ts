
/**
 * Email Queue System con Rate Limiting per Gmail API
 * Gestisce invio massivo rispettando limiti Google
 */

import * as functions from 'firebase-functions';
import { randomUUID } from 'node:crypto';
import { db } from './firebase-admin';
import { sendGmailEmail } from './gmail';

// Limiti Gmail API
const RATE_LIMITS = {
  EMAILS_PER_MINUTE: 90, // Sicurezza: 90 invece di 100
  EMAILS_PER_DAY: 1800,  // Sicurezza: 1800 invece di 2000
  BATCH_SIZE: 10,        // Email per batch
  BATCH_DELAY_MS: 7000   // 7 secondi tra batch (safety margin)
};

// Deve essere più lungo del timeout massimo della Cloud Function (9 minuti).
// In questo modo un worker ancora attivo non può perdere la proprietà
// dell'email mentre sta aspettando Gmail.
const PROCESSING_LEASE_MS = 15 * 60 * 1000;

interface EmailQueueItem {
  id?: string;
  to: string[];
  subject: string;
  htmlContent: string;
  from?: string;
  priority: 'high' | 'normal' | 'low';
  attempts: number;
  maxAttempts: number;
  createdAt: any;
  scheduledFor: any;
  processedAt?: any;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  errorMessage?: string;
  processingStartedAt?: any;
  processingLeaseUntil?: any;
  processingWorkerId?: string;
  processingRecoveredAt?: any;
  processingRecoveryReason?: string;
  metadata?: {
    galleryId?: string;
    type?: string;
  };
}

type EnqueueEmailParams = {
  to: string | string[];
  subject: string;
  htmlContent: string;
  from?: string;
  priority?: 'high' | 'normal' | 'low';
  scheduledFor?: Date;
  metadata?: any;
};

export class EmailQueue {
  /**
   * Converte in millisecondi sia Date sia Timestamp dell'Admin SDK.
   * I dati esistenti possono avere uno dei due formati.
   */
  private static timestampToMillis(value: any): number | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value.toMillis === 'function') {
      return value.toMillis();
    }

    if (typeof value.seconds === 'number') {
      return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1_000_000);
    }

    if (typeof value === 'number') {
      return value;
    }

    return null;
  }

  /**
   * Recupera le email lasciate in processing da un worker terminato.
   *
   * La query intenzionalmente filtra solo per status: così funziona anche
   * senza un indice composto e consente di gestire i documenti legacy privi
   * dei campi di lease. Per i documenti legacy usiamo createdAt come
   * riferimento conservativo; un documento senza alcun riferimento temporale
   * non viene toccato.
   */
  private static async recoverStaleProcessing(now: number): Promise<number> {
    const snapshot = await db.collection('emailQueue')
      .where('status', '==', 'processing')
      .get();

    let recoveredCount = 0;

    for (const doc of snapshot.docs) {
      const email = doc.data() as EmailQueueItem;
      const leaseUntil = this.timestampToMillis(email.processingLeaseUntil);
      const startedAt = this.timestampToMillis(email.processingStartedAt);
      const createdAt = this.timestampToMillis(email.createdAt);
      const safeLeaseUntil = leaseUntil ??
        (startedAt !== null ? startedAt + PROCESSING_LEASE_MS : null) ??
        (createdAt !== null ? createdAt + PROCESSING_LEASE_MS : null);

      // Non reclamare documenti senza una data: non possiamo distinguere un
      // vecchio arresto da un worker attivo, quindi è più sicuro lasciarli
      // osservabili che rischiare un doppio invio.
      if (safeLeaseUntil === null || safeLeaseUntil > now) {
        continue;
      }

      await doc.ref.update({
        status: 'pending',
        scheduledFor: new Date(now),
        processingStartedAt: null,
        processingLeaseUntil: null,
        processingWorkerId: null,
        processingRecoveredAt: new Date(now),
        processingRecoveryReason: 'worker lease expired'
      });
      recoveredCount++;

      functions.logger.warn(
        `♻️ Email recuperata dopo lease scaduta: ${doc.id} ` +
        `(leaseUntil=${new Date(safeLeaseUntil).toISOString()})`
      );
    }

    if (recoveredCount > 0) {
      functions.logger.info(`♻️ Recuperate ${recoveredCount} email bloccate`);
    }

    return recoveredCount;
  }

  /**
   * Acquisisci distributed lock per processare la queue
   * Previene processing concorrente su più istanze Cloud Functions
   */
  private static async acquireLock(): Promise<string | null> {
    const lockRef = db.doc('locks/emailQueue');
    const lockDuration = 120000; // 2 minuti
    const now = Date.now();
    const lockId = randomUUID();

    try {
      const acquired = await db.runTransaction(async (transaction: any) => {
        const lockDoc = await transaction.get(lockRef);

        if (lockDoc.exists) {
          const lockedUntil = lockDoc.data()?.lockedUntil || 0;
          if (lockedUntil > now) {
            return false;
          }
        }

        transaction.set(lockRef, {
          lockedUntil: now + lockDuration,
          lockedAt: new Date(),
          lockId,
          instanceId: process.env.K_SERVICE || 'unknown'
        });

        return true;
      });

      if (!acquired) {
        functions.logger.info('⏸️ Queue già in elaborazione da altra istanza');
        return null;
      }

      return lockId;
    } catch (error) {
      functions.logger.error('❌ Errore acquisizione lock:', error);
      return null;
    }
  }

  /**
   * Rilascia distributed lock
   */
  private static async releaseLock(lockId: string): Promise<void> {
    try {
      const lockRef = db.doc('locks/emailQueue');
      await db.runTransaction(async (transaction: any) => {
        const lockDoc = await transaction.get(lockRef);
        if (lockDoc.exists && lockDoc.data()?.lockId === lockId) {
          transaction.delete(lockRef);
        }
      });
      functions.logger.info('🔓 Lock rilasciato');
    } catch (error) {
      functions.logger.warn('⚠️ Errore rilascio lock:', error);
    }
  }

  /**
   * Aggiungi email alla queue
   */
  static async enqueue(params: EnqueueEmailParams): Promise<string> {
    const toArray = Array.isArray(params.to) ? params.to : [params.to];
    
    // Validazione mittente (solo domini autorizzati)
    const allowedFromDomains = ['gennaromazzacane.it', 'memoriesospese.it'];
    const fromEmail = params.from || 'Memorie Sospese <memoriesospese@gennaromazzacane.it>';
    const fromDomain = fromEmail.match(/@([^>]+)/)?.[1];
    
    if (fromDomain && !allowedFromDomains.some(d => fromDomain.includes(d))) {
      functions.logger.warn(`⚠️ Mittente non autorizzato: ${fromEmail}, uso default`);
    }

    const queueItem: EmailQueueItem = {
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

    const docRef = await db.collection('emailQueue').add(queueItem);
    
    // Log dettagliato con metadata
    const metaInfo = params.metadata ? 
      ` | type=${params.metadata.type} | galleryId=${params.metadata.galleryId || 'N/A'}` : '';
    
    functions.logger.info(
      `📬 Email enqueued: ${docRef.id} | recipients=${toArray.length} | priority=${params.priority}${metaInfo}`
    );
    
    return docRef.id;
  }

  /**
   * Compatibilità con i call-site legacy.
   *
   * I nuovi call-site devono usare enqueue(), che accetta un unico oggetto
   * e permette di specificare priorità, scheduling e metadata.
   */
  static async addEmailToQueue(
    to: string | string[],
    subject: string,
    htmlContent: string
  ): Promise<string> {
    return this.enqueue({ to, subject, htmlContent });
  }

  /**
   * Verifica se possiamo inviare email (controllo rate limit)
   */
  static async canSendEmail(): Promise<{
    allowed: boolean;
    minuteCount: number;
    dayCount: number;
  }> {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Conta email inviate nell'ultimo minuto
    const minuteSnapshot = await db.collection('emailQueue')
      .where('status', '==', 'sent')
      .where('processedAt', '>=', oneMinuteAgo)
      .get();

    // Conta email inviate nelle ultime 24 ore
    const daySnapshot = await db.collection('emailQueue')
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
  static async processQueue(): Promise<void> {
    // Acquisisci distributed lock
    const lockId = await this.acquireLock();
    if (!lockId) {
      return;
    }

    try {
      // Prima di selezionare i pending, riporta in coda solo le email la cui
      // lease è scaduta. Una lease ancora valida indica che il worker
      // proprietario potrebbe essere ancora dentro sendGmailEmail.
      await this.recoverStaleProcessing(Date.now());

      // Verifica rate limit
      const rateCheck = await this.canSendEmail();
      
      if (!rateCheck.allowed) {
        functions.logger.warn(`⚠️ Rate limit raggiunto: ${rateCheck.minuteCount}/min, ${rateCheck.dayCount}/day`);
        return;
      }

      // Recupera email da processare
      const snapshot = await db.collection('emailQueue')
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
        const email = doc.data() as EmailQueueItem;
        
        try {
          // Marca come processing
          const processingStartedAt = new Date();
          await doc.ref.update({
            status: 'processing',
            processingStartedAt,
            processingLeaseUntil: new Date(processingStartedAt.getTime() + PROCESSING_LEASE_MS),
            processingWorkerId: lockId
          });

          // Invia email
          await sendGmailEmail(
            email.to,
            email.subject,
            email.htmlContent,
            email.from
          );

          // Marca come inviata
          await doc.ref.update({
            status: 'sent',
            processedAt: new Date(),
            processingStartedAt: null,
            processingLeaseUntil: null,
            processingWorkerId: null
          });

          // Log dettagliato successo con metadata
          const metaInfo = email.metadata ? 
            ` | type=${email.metadata.type} | galleryId=${email.metadata.galleryId || 'N/A'}` : '';
          
          functions.logger.info(
            `✅ Email inviata: ${doc.id} | recipients=${email.to.length}${metaInfo}`
          );

        } catch (error: any) {
          const newAttempts = email.attempts + 1;
          
          // Log errore dettagliato
          const metaInfo = email.metadata ? 
            ` | type=${email.metadata.type} | galleryId=${email.metadata.galleryId || 'N/A'}` : '';
          
          functions.logger.error(
            `❌ Errore invio email ${doc.id} (attempt ${newAttempts}/${email.maxAttempts})${metaInfo}:`,
            error.message
          );
          
          if (newAttempts >= email.maxAttempts) {
            // Troppi tentativi, marca come failed
            await doc.ref.update({
              status: 'failed',
              attempts: newAttempts,
              errorMessage: error.message,
              processedAt: new Date(),
              processingStartedAt: null,
              processingLeaseUntil: null,
              processingWorkerId: null
            });
            
            functions.logger.error(`❌ Email failed definitivamente: ${doc.id}`, error);
          } else {
            // Retry dopo 5 minuti
            const retryAt = new Date(Date.now() + 5 * 60 * 1000);
            await doc.ref.update({
              status: 'pending',
              attempts: newAttempts,
              scheduledFor: retryAt,
              errorMessage: error.message,
              processingStartedAt: null,
              processingLeaseUntil: null,
              processingWorkerId: null
            });
            
            functions.logger.warn(`⚠️ Email retry schedulato: ${doc.id} (attempt ${newAttempts})`);
          }
        }

        // Delay tra email per rispettare rate limit
        await new Promise(resolve => setTimeout(resolve, RATE_LIMITS.BATCH_DELAY_MS / RATE_LIMITS.BATCH_SIZE));
      }

    } finally {
      // Rilascia sempre il lock, anche in caso di errore
      await this.releaseLock(lockId);
    }
  }

  /**
   * Ottieni statistiche queue
   */
  static async getStats(): Promise<{
    pending: number;
    processing: number;
    sent: number;
    failed: number;
    todayCount: number;
    lastHourCount: number;
  }> {
    const [pendingSnap, processingSnap, sentSnap, failedSnap] = await Promise.all([
      db.collection('emailQueue').where('status', '==', 'pending').get(),
      db.collection('emailQueue').where('status', '==', 'processing').get(),
      db.collection('emailQueue').where('status', '==', 'sent').get(),
      db.collection('emailQueue').where('status', '==', 'failed').get()
    ]);

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const todaySnap = await db.collection('emailQueue')
      .where('status', '==', 'sent')
      .where('processedAt', '>=', oneDayAgo)
      .get();

    const lastHourSnap = await db.collection('emailQueue')
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
