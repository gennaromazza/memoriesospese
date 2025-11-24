/**
 * Bulk Email Routes - Sistema invio massivo email ai clienti
 * Rate limiting: 2,000 email/giorno (limite Gmail API)
 */

import { Router, Request, Response } from "express";
import { db } from './firebase-admin.js';
import { sendGmailEmail } from './email-routes.js';
import { FieldValue } from 'firebase-admin/firestore';

const router = Router();

// Rate limiting Gmail API
const GMAIL_DAILY_LIMIT = 2000;
const BATCH_SIZE = 50; // Invio in batch da 50
const DELAY_BETWEEN_BATCHES_MS = 2000; // 2 secondi tra batch

interface BulkEmailRecipient {
  email: string;
  nome: string;
  cognome: string;
  clientId?: string;
}

interface BulkEmailJob {
  id: string;
  subject: string;
  body: string;
  recipients: BulkEmailRecipient[];
  totalRecipients: number;
  quotaReserved: number; // Quota riservata all'inizio
  quotaConsumed: number; // Quota effettivamente consumata (sent emails)
  sentCount: number;
  failedCount: number;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  errors: Array<{ email: string; error: string }>;
  createdAt: Date;
  startedAt?: Date; // Quando worker ha iniziato esecuzione
  completedAt?: Date;
  lastHeartbeatAt: Date; // Timestamp ultimo aggiornamento (worker alive)
  createdBy: string;
}

// Constants per heartbeat timeout
const HEARTBEAT_TIMEOUT = 5 * 60 * 1000; // 5 minuti in ms

/**
 * Cleanup jobs stale (lastHeartbeatAt > HEARTBEAT_TIMEOUT) e rilascia quota
 * HEARTBEAT-AWARE: usa lastHeartbeatAt invece di createdAt
 */
export async function cleanupStaleJobs() {
  try {
    const heartbeatTimeout = new Date(Date.now() - HEARTBEAT_TIMEOUT);
    
    // Query jobs con heartbeat scaduto
    const staleJobs = await db.collection('bulkEmailJobs')
      .where('status', 'in', ['queued', 'in_progress'])
      .where('lastHeartbeatAt', '<', heartbeatTimeout)
      .get();

    if (staleJobs.empty) {
      return;
    }

    console.log(`🧹 Trovati ${staleJobs.size} jobs stale (heartbeat timeout), cleanup in corso...`);

    for (const jobDoc of staleJobs.docs) {
      // TRANSACTIONAL cleanup: re-verify stale before releasing quota
      await db.runTransaction(async (transaction) => {
        const freshDoc = await transaction.get(jobDoc.ref);
        if (!freshDoc.exists) return;

        const job = freshDoc.data();
        const lastHeartbeat = job?.lastHeartbeatAt?.toDate() || new Date(0);
        const isStillStale = lastHeartbeat < heartbeatTimeout;

        // Re-check: job potrebbe essere stato ripreso da dispatcher
        if (!isStillStale || !['queued', 'in_progress'].includes(job?.status)) {
          return; // Skip, non è più stale
        }

        const quotaReserved = job?.quotaReserved || 0;
        const quotaConsumed = job?.quotaConsumed || 0;

        // ALWAYS release reserved and confirm sent (anche se quotaConsumed === quotaReserved)
        if (quotaReserved > 0 && job?.quotaDate) {
          const quotaRef = db.collection('emailQuota').doc(job.quotaDate);
          transaction.update(quotaRef, {
            reserved: FieldValue.increment(-quotaReserved),
            sent: FieldValue.increment(quotaConsumed)
          });

          console.log(`🧹 Job ${jobDoc.id}: reserved -${quotaReserved}, sent +${quotaConsumed}`);
        }

        // Marca job come failed
        transaction.update(jobDoc.ref, {
          status: 'failed',
          errors: [{ email: 'system', error: 'Job timeout - heartbeat expired', retry: false }],
          completedAt: new Date()
        });
      });
    }

    console.log(`✅ Cleanup completato: ${staleJobs.size} jobs stale processati`);
  } catch (error: any) {
    console.error('❌ Errore cleanup stale jobs:', error.message);
  }
}

/**
 * Dispatcher Loop: Pull and execute queued/in_progress jobs
 * Gira in background in-process, riprende jobs dopo restart
 */
let dispatcherRunning = false;
let dispatcherInterval: NodeJS.Timeout | null = null;

export async function processNextBulkEmailJob() {
  if (dispatcherRunning) {
    // Già un job in esecuzione, skip per evitare concorrenza
    return;
  }

  try {
    dispatcherRunning = true;

    // Pull oldest queued job OR stale in_progress job (heartbeat scaduto)
    const now = new Date();
    const heartbeatGrace = new Date(now.getTime() - HEARTBEAT_TIMEOUT);

    const queuedJobs = await db.collection('bulkEmailJobs')
      .where('status', '==', 'queued')
      .orderBy('createdAt', 'asc')
      .limit(1)
      .get();

    const staleInProgressJobs = await db.collection('bulkEmailJobs')
      .where('status', '==', 'in_progress')
      .where('lastHeartbeatAt', '<', heartbeatGrace)
      .orderBy('lastHeartbeatAt', 'asc')
      .limit(1)
      .get();

    // Priorità: queued > stale in_progress
    const jobDoc = !queuedJobs.empty ? queuedJobs.docs[0] : 
                   !staleInProgressJobs.empty ? staleInProgressJobs.docs[0] : null;

    if (!jobDoc) {
      // Nessun job da processare
      return;
    }

    const job = jobDoc.data();
    const quotaDate = job?.quotaDate;

    if (!quotaDate) {
      console.error(`❌ Job ${jobDoc.id} senza quotaDate, skip`);
      return;
    }

    console.log(`📮 Dispatcher executing job ${jobDoc.id} (status: ${job?.status})`);

    // Esegui job
    await sendBulkEmails(jobDoc.id, quotaDate);

  } catch (error: any) {
    console.error('❌ Errore dispatcher:', error.message);
  } finally {
    dispatcherRunning = false;
  }
}

export function startBulkEmailDispatcher(intervalMs: number = 5000) {
  if (dispatcherInterval) {
    console.warn('⚠️  Dispatcher già avviato');
    return;
  }

  console.log(`📮 Starting bulk email dispatcher (interval: ${intervalMs}ms)`);
  
  // Esegui subito una volta
  processNextBulkEmailJob();

  // Poi ogni intervalMs
  dispatcherInterval = setInterval(processNextBulkEmailJob, intervalMs);
}

export function stopBulkEmailDispatcher() {
  if (dispatcherInterval) {
    clearInterval(dispatcherInterval);
    dispatcherInterval = null;
    console.log('🛑 Bulk email dispatcher stopped');
  }
}

/**
 * GET /api/bulk-email/recipients - Ottieni lista destinatari disponibili
 */
router.get('/recipients', async (req: Request, res: Response) => {
  try {
    const { filter } = req.query;

    // Query base: tutti i clienti
    let query = db.collection('clienti');

    // Applica filtri se presenti
    if (filter === 'anno_corrente') {
      const currentYear = new Date().getFullYear();
      query = query.where('anno', '==', currentYear);
    } else if (filter && filter.toString().startsWith('anno_')) {
      const year = parseInt(filter.toString().replace('anno_', ''));
      query = query.where('anno', '==', year);
    }

    const snapshot = await query.get();
    const recipients: BulkEmailRecipient[] = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.email) {
        recipients.push({
          email: data.email,
          nome: data.nome || '',
          cognome: data.cognome || '',
          clientId: doc.id
        });
      }
    });

    res.json({ 
      success: true, 
      recipients,
      total: recipients.length
    });

  } catch (error: any) {
    console.error('❌ Errore recupero destinatari:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/bulk-email/send - Invia email massiva con rate limiting
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { subject, body, recipients, senderId } = req.body;

    if (!subject || !body || !recipients || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Soggetto, corpo e destinatari sono obbligatori'
      });
    }

    // SINGLE ATOMIC TRANSACTION: Check quota + Reserve + Create Job
    // Elimina OGNI possibilità di leak (no window tra operations)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const quotaRef = db.collection('emailQuota').doc(today);
    const jobRef = db.collection('bulkEmailJobs').doc();

    const result = await db.runTransaction(async (transaction) => {
      // 1. Check quota disponibile (reserved + sent)
      const quotaDoc = await transaction.get(quotaRef);
      const data = quotaDoc.exists ? quotaDoc.data() : {};
      const currentReserved = data?.reserved || 0;
      const currentSent = data?.sent || 0;
      const totalUsed = currentReserved + currentSent;
      const remainingQuota = GMAIL_DAILY_LIMIT - totalUsed;

      if (recipients.length > remainingQuota) {
        throw new Error(`Quota giornaliera insufficiente. Usate ${totalUsed}/${GMAIL_DAILY_LIMIT} oggi (reserved: ${currentReserved}, sent: ${currentSent}). Rimanenti: ${remainingQuota}.`);
      }

      // 2. Reserve quota (atomic increment RESERVED, not SENT)
      transaction.set(quotaRef, {
        reserved: FieldValue.increment(recipients.length),
        date: today,
        lastUpdated: new Date()
      }, { merge: true });

      // 3. Create job document (atomically con quota reservation)
      // HEARTBEAT-AWARE: lastHeartbeatAt, quotaConsumed, status='queued'
      const job = {
        id: jobRef.id,
        subject,
        body,
        recipients, // PERSIST recipients list per recovery
        totalRecipients: recipients.length,
        quotaReserved: recipients.length,
        quotaConsumed: 0, // Inizialmente 0, incrementato dal worker
        quotaDate: today,
        sentCount: 0,
        failedCount: 0,
        status: 'queued', // Inizia come queued, dispatcher lo mette in_progress
        errors: [],
        createdAt: new Date(),
        lastHeartbeatAt: new Date(), // Inizializzato a createdAt
        createdBy: senderId || 'admin'
      };

      transaction.set(jobRef, job);

      return { jobId: jobRef.id, reserved: recipients.length };
    });

    // Transaction completata → quota riservata E job creato atomically
    // Job è in status='queued', verrà processato dal dispatcher loop

    res.json({
      success: true,
      jobId: result.jobId,
      message: `Job ${result.jobId} creato. Dispatcher lo processera' a breve.`
    });

  } catch (error: any) {
    console.error('❌ Errore avvio bulk email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/bulk-email/jobs/:jobId - Ottieni stato job
 */
router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const jobDoc = await db.collection('bulkEmailJobs').doc(jobId).get();

    if (!jobDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Job non trovato'
      });
    }

    res.json({
      success: true,
      job: jobDoc.data()
    });

  } catch (error: any) {
    console.error('❌ Errore recupero job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/bulk-email/jobs - Lista tutti i job
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const snapshot = await db.collection('bulkEmailJobs')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const jobs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      jobs
    });

  } catch (error: any) {
    console.error('❌ Errore recupero jobs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Funzione asincrona per invio batch con rate limiting e quota tracking
 * Legge recipients dal job doc per supportare recovery dopo crash
 */
async function sendBulkEmails(
  jobId: string,
  quotaDate: string
) {
  const jobRef = db.collection('bulkEmailJobs').doc(jobId);
  const quotaRef = db.collection('emailQuota').doc(quotaDate);

  let sentCount = 0;
  let failedCount = 0;
  const errors: Array<{ email: string; error: string; retry: boolean }> = [];

  try {
    // Leggi job doc per ottenere subject, body, recipients
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) {
      throw new Error('Job non trovato');
    }

    const jobData = jobDoc.data();
    const subject = jobData?.subject;
    const body = jobData?.body;
    const recipients = jobData?.recipients || [];

    if (!subject || !body || recipients.length === 0) {
      throw new Error('Job data incompleto');
    }

    // Aggiorna stato a in_progress con startedAt e heartbeat
    await jobRef.update({
      status: 'in_progress',
      startedAt: new Date(),
      lastHeartbeatAt: new Date()
    });

    // Dividi in batch per rate limiting
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      // Invia batch corrente
      for (const recipient of batch) {
        try {
          await sendSingleEmail(recipient, subject, body);
          sentCount++;

          // NON aggiornare quota qui - già riservata in transazione iniziale
          // Quota sarà confermata al completamento job

          // Aggiorna progress DOPO OGNI EMAIL (non ogni 10)
          await jobRef.update({
            sentCount,
            failedCount
          });

        } catch (error: any) {
          failedCount++;
          
          // Classifica errore (temporaneo vs permanente)
          const isTemporary = error.message.includes('timeout') || 
                             error.message.includes('rate') ||
                             error.message.includes('temporarily');
          
          errors.push({
            email: recipient.email,
            error: error.message,
            retry: isTemporary
          });

          // Aggiorna errors array (max 100 per non esplodere Firestore)
          if (errors.length <= 100) {
            await jobRef.update({
              failedCount,
              errors
            });
          }

          console.error(`❌ Errore invio a ${recipient.email}:`, error.message);

          // Retry se errore temporaneo (max 3 tentativi)
          if (isTemporary) {
            let retrySuccess = false;
            for (let retry = 1; retry <= 3; retry++) {
              try {
                console.log(`🔄 Retry ${retry}/3 per ${recipient.email}`);
                await new Promise(resolve => setTimeout(resolve, 1000 * retry)); // Backoff esponenziale
                await sendSingleEmail(recipient, subject, body);
                
                // Retry riuscito! Aggiorna stats
                sentCount++;
                failedCount--;
                retrySuccess = true;
                
                // Rimuovi l'errore dall'array (successo al retry)
                const errorIndex = errors.findIndex(e => e.email === recipient.email);
                if (errorIndex !== -1) {
                  errors.splice(errorIndex, 1);
                }

                // Aggiorna job con nuovo stato
                await jobRef.update({
                  sentCount,
                  failedCount,
                  errors: errors.slice(0, 100)
                });

                console.log(`✅ Retry riuscito per ${recipient.email}`);
                break;
              } catch (retryError: any) {
                if (retry === 3) {
                  console.error(`❌ Retry fallito definitivamente per ${recipient.email}`);
                }
              }
            }
          }
        }
      }

      // UPDATE HEARTBEAT dopo ogni batch (prova di vita per long-running jobs)
      await jobRef.update({
        sentCount,
        failedCount,
        quotaConsumed: sentCount, // quotaConsumed = email inviate con successo
        lastHeartbeatAt: new Date() // CRITICAL: aggiorna heartbeat ogni batch
      });

      // Delay tra batch per rispettare rate limiting
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    // Determina status finale
    const finalStatus = sentCount === 0 ? 'failed' : 'completed';

    // Completa job (quota accounting fatto nel finally block)
    await jobRef.update({
      status: finalStatus,
      sentCount,
      failedCount,
      quotaConsumed: sentCount, // Final update
      errors: errors.slice(0, 100), // Max 100 errori salvati
      completedAt: new Date()
    });

    console.log(`✅ Bulk email completato: ${sentCount}/${recipients.length} inviate, ${failedCount} fallite`);

  } catch (error: any) {
    console.error('❌ Errore fatale bulk email:', error);
    
    // Marca job come failed
    await jobRef.update({
      status: 'failed',
      sentCount,
      failedCount,
      errors: [{ email: 'system', error: error.message, retry: false }, ...errors.slice(0, 99)],
      completedAt: new Date()
    });
  } finally {
    // FINALLY BLOCK: Rilascia quota reserved, incrementa sent (anche in caso di crash/error)
    // Questo garantisce che quota accounting sia sempre corretto
    try {
      const jobDoc = await jobRef.get();
      const data = jobDoc.data();
      const quotaReserved = data?.quotaReserved || 0;
      const quotaConsumed = data?.quotaConsumed || sentCount;
      const quotaDate = data?.quotaDate;

      if (quotaDate && quotaReserved > 0) {
        const quotaRef = db.collection('emailQuota').doc(quotaDate);
        
        // Atomic update: -reserved, +sent
        await quotaRef.update({
          reserved: FieldValue.increment(-quotaReserved), // Rilascia tutto il reserved
          sent: FieldValue.increment(quotaConsumed) // Incrementa sent
        });
        
        console.log(`📊 Quota aggiornata (finally): reserved -${quotaReserved}, sent +${quotaConsumed}`);
      }
    } catch (releaseError: any) {
      // Log errore ma non propagare (evita loop infinito)
      console.error('❌ Errore rilascio quota in finally:', releaseError.message);
    }
  }
}

/**
 * Invia singola email tramite Gmail API usando sendGmailEmail esistente
 */
async function sendSingleEmail(
  recipient: BulkEmailRecipient,
  subject: string,
  body: string
): Promise<void> {
  try {
    // Personalizza corpo con nome destinatario se presente variabile
    let personalizedBody = body;
    if (recipient.nome) {
      personalizedBody = body
        .replace(/\{nome\}/g, recipient.nome)
        .replace(/\{cognome\}/g, recipient.cognome)
        .replace(/\{nome_completo\}/g, `${recipient.nome} ${recipient.cognome}`.trim());
    }

    const emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${personalizedBody}
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #666; font-size: 12px;">
          <p style="margin: 5px 0; font-weight: 600;">Memorie Sospese</p>
          <p style="margin: 5px 0;">Email: memoriesospese@gennaromazzacane.it</p>
          <p style="margin: 5px 0;">Tel: +39 334 7103142</p>
        </div>
      </div>
    `;

    // Usa la funzione esistente sendGmailEmail
    await sendGmailEmail(
      recipient.email,
      subject,
      emailHTML
    );

    console.log(`✅ Email inviata a ${recipient.email}`);

  } catch (error: any) {
    console.error(`❌ Errore invio email a ${recipient.email}:`, error);
    throw new Error(`Impossibile inviare email: ${error.message}`);
  }
}

export default router;
