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
  sentCount: number;
  failedCount: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  errors: Array<{ email: string; error: string }>;
  createdAt: Date;
  completedAt?: Date;
  createdBy: string;
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

    // Verifica E RISERVA quota giornaliera atomicamente con per-job metadata
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const quotaRef = db.collection('emailQuota').doc(today);

    // Transaction per check + atomic increment
    const reservationResult = await db.runTransaction(async (transaction) => {
      const quotaDoc = await transaction.get(quotaRef);
      const currentSent = quotaDoc.exists ? (quotaDoc.data()?.sent || 0) : 0;
      const remainingQuota = GMAIL_DAILY_LIMIT - currentSent;

      if (recipients.length > remainingQuota) {
        throw new Error(`Quota giornaliera insufficiente. Inviate ${currentSent}/${GMAIL_DAILY_LIMIT} oggi. Rimanenti: ${remainingQuota}.`);
      }

      // Atomic increment (no overwrite risk)
      transaction.set(quotaRef, {
        sent: FieldValue.increment(recipients.length),
        date: today,
        lastUpdated: new Date()
      }, { merge: true });

      return { currentSent, reserved: recipients.length };
    });

    // Se transazione fallisce, ritorna errore
    if (!reservationResult) {
      return res.status(400).json({
        success: false,
        error: 'Errore riserva quota. Riprova.'
      });
    }

    // Crea job in Firestore per tracking con per-job quota metadata
    const jobRef = db.collection('bulkEmailJobs').doc();
    const job: Omit<BulkEmailJob, 'recipients'> & { 
      totalRecipients: number;
      quotaReserved: number; // Quota riservata per QUESTO job
      quotaDate: string; // Data quota (per recovery)
    } = {
      id: jobRef.id,
      subject,
      body,
      totalRecipients: recipients.length,
      quotaReserved: reservationResult.reserved, // Salva quanto riservato
      quotaDate: today, // Salva data per recovery
      sentCount: 0,
      failedCount: 0,
      status: 'pending',
      errors: [],
      createdAt: new Date(),
      createdBy: senderId || 'admin'
    };

    let jobCreated = false;
    try {
      await jobRef.set(job);
      jobCreated = true;

      // Avvia invio asincrono (non bloccare la risposta)
      sendBulkEmails(jobRef.id, subject, body, recipients, today);

      res.json({
        success: true,
        jobId: jobRef.id,
        message: `Invio di ${recipients.length} email avviato`
      });

    } catch (jobError: any) {
      // Job creation failed → rilascia quota riservata
      if (!jobCreated) {
        console.error('❌ Job creation fallita, rilascio quota:', jobError.message);
        
        // Rilascia quota atomicamente
        await quotaRef.update({
          sent: FieldValue.increment(-reservationResult.reserved)
        });
      }
      
      throw jobError; // Propaga errore
    }

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
 */
async function sendBulkEmails(
  jobId: string,
  subject: string,
  body: string,
  recipients: BulkEmailRecipient[],
  quotaDate: string
) {
  const jobRef = db.collection('bulkEmailJobs').doc(jobId);
  const quotaRef = db.collection('emailQuota').doc(quotaDate);

  let sentCount = 0;
  let failedCount = 0;
  const errors: Array<{ email: string; error: string; retry: boolean }> = [];

  try {
    // Aggiorna stato a in_progress
    await jobRef.update({ status: 'in_progress' });

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

      // Delay tra batch per rispettare rate limiting
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    // Determina status finale
    const finalStatus = sentCount === 0 ? 'failed' : 'completed';

    // Completa job
    await jobRef.update({
      status: finalStatus,
      sentCount,
      failedCount,
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
    // SEMPRE rilascia quota inutilizzata (anche in caso di crash/error)
    try {
      const jobDoc = await jobRef.get();
      const quotaReserved = jobDoc.data()?.quotaReserved || 0;
      const unusedQuota = quotaReserved - sentCount;

      if (unusedQuota > 0) {
        // Rilascia quota inutilizzata con atomic decrement
        await quotaRef.update({
          sent: FieldValue.increment(-unusedQuota),
          lastUpdated: new Date()
        });
        console.log(`📊 Quota rilasciata (finally): ${unusedQuota} email non inviate`);
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
