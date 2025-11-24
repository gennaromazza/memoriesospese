/**
 * Bulk Email Routes - Sistema invio massivo email ai clienti
 * Rate limiting: 2,000 email/giorno (limite Gmail API)
 */

import { Router, Request, Response } from "express";
import { db } from './firebase-admin.js';
import { sendGmailEmail } from './email-routes.js';

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

    // Verifica limite giornaliero
    if (recipients.length > GMAIL_DAILY_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `Limite giornaliero Gmail superato. Max ${GMAIL_DAILY_LIMIT} email/giorno.`
      });
    }

    // Crea job in Firestore per tracking
    const jobRef = db.collection('bulkEmailJobs').doc();
    const job: BulkEmailJob = {
      id: jobRef.id,
      subject,
      body,
      recipients,
      totalRecipients: recipients.length,
      sentCount: 0,
      failedCount: 0,
      status: 'pending',
      errors: [],
      createdAt: new Date(),
      createdBy: senderId || 'admin'
    };

    await jobRef.set(job);

    // Avvia invio asincrono (non bloccare la risposta)
    sendBulkEmails(jobRef.id, subject, body, recipients);

    res.json({
      success: true,
      jobId: jobRef.id,
      message: `Invio di ${recipients.length} email avviato`
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
 * Funzione asincrona per invio batch con rate limiting
 */
async function sendBulkEmails(
  jobId: string,
  subject: string,
  body: string,
  recipients: BulkEmailRecipient[]
) {
  const jobRef = db.collection('bulkEmailJobs').doc(jobId);

  try {
    // Aggiorna stato a in_progress
    await jobRef.update({ status: 'in_progress' });

    let sentCount = 0;
    let failedCount = 0;
    const errors: Array<{ email: string; error: string }> = [];

    // Dividi in batch per rate limiting
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      // Invia batch corrente
      for (const recipient of batch) {
        try {
          await sendSingleEmail(recipient, subject, body);
          sentCount++;

          // Aggiorna progress ogni 10 email
          if (sentCount % 10 === 0) {
            await jobRef.update({
              sentCount,
              failedCount,
              errors
            });
          }

        } catch (error: any) {
          failedCount++;
          errors.push({
            email: recipient.email,
            error: error.message
          });
          console.error(`❌ Errore invio a ${recipient.email}:`, error.message);
        }
      }

      // Delay tra batch per rispettare rate limiting
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    // Completa job
    await jobRef.update({
      status: 'completed',
      sentCount,
      failedCount,
      errors,
      completedAt: new Date()
    });

    console.log(`✅ Bulk email completato: ${sentCount}/${recipients.length} inviate`);

  } catch (error: any) {
    console.error('❌ Errore fatale bulk email:', error);
    await jobRef.update({
      status: 'failed',
      errors: [{ email: 'system', error: error.message }],
      completedAt: new Date()
    });
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
