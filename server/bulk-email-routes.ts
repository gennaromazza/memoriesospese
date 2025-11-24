/**
 * Bulk Email Routes - Sistema invio massivo email ai clienti
 * Ottimizzato per: Performance Firestore, Crash Recovery, Atomic Locking
 */

import { Router, Request, Response } from "express";
import { db } from "./firebase-admin.js";
import { sendGmailEmail } from "./email-routes.js";
import { FieldValue } from "firebase-admin/firestore";

const router = Router();

// --- CONFIGURAZIONE ---
const GMAIL_DAILY_LIMIT = 2000;
const BATCH_SIZE = 50; // Aggiornamento DB ogni 50 email
const CONCURRENCY_LIMIT = 5; // Invii paralleli a Gmail (max 5 alla volta)
const DELAY_BETWEEN_BATCHES_MS = 2000; // Rate limiting passivo
const HEARTBEAT_TIMEOUT = 5 * 60 * 1000; // 5 minuti

// --- INTERFACCE ---
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
  quotaReserved: number;
  quotaConsumed: number;
  sentCount: number;
  failedCount: number;
  status: "queued" | "in_progress" | "completed" | "failed";
  errors: Array<{ email: string; error: string }>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  lastHeartbeatAt: Date;
  createdBy: string;
  quotaDate: string;
}

// --- VARIABILI GLOBALI ---
let dispatcherRunning = false;
let dispatcherInterval: NodeJS.Timeout | null = null;

// ============================================================================
// CORE LOGIC: CLEANUP & DISPATCHER
// ============================================================================

/**
 * Cleanup Jobs Stale
 * Rilascia quota e marca come failed i jobs che non danno segni di vita (heartbeat) da 5 min
 */
export async function cleanupStaleJobs() {
  try {
    const heartbeatTimeout = new Date(Date.now() - HEARTBEAT_TIMEOUT);

    // Trova jobs in_progress fermi da troppo tempo
    const staleJobs = await db
      .collection("bulkEmailJobs")
      .where("status", "==", "in_progress")
      .where("lastHeartbeatAt", "<", heartbeatTimeout)
      .get();

    if (staleJobs.empty) return;

    console.log(
      `🧹 Trovati ${staleJobs.size} jobs bloccati/stale. Avvio recovery...`,
    );

    for (const jobDoc of staleJobs.docs) {
      await db.runTransaction(async (t) => {
        const freshDoc = await t.get(jobDoc.ref);
        if (!freshDoc.exists) return;

        const job = freshDoc.data();
        // Controllo paranoico: assicuriamoci che sia ancora stale
        if (
          job?.status !== "in_progress" ||
          job?.lastHeartbeatAt.toDate() > heartbeatTimeout
        ) {
          return;
        }

        const reserved = job.quotaReserved || 0;
        const consumed = job.quotaConsumed || 0;

        // Rilascio quota safe
        if (reserved > 0 && job.quotaDate) {
          const quotaRef = db.collection("emailQuota").doc(job.quotaDate);
          t.update(quotaRef, {
            reserved: FieldValue.increment(-reserved),
            sent: FieldValue.increment(consumed),
          });
          // Azzera reserved sul job per evitare doppi rilasci
          t.update(jobDoc.ref, { quotaReserved: 0 });
        }

        // Marca come failed
        t.update(jobDoc.ref, {
          status: "failed",
          errors: FieldValue.arrayUnion({
            email: "system",
            error: "Job crashed/timeout (Heartbeat expired)",
            retry: false,
          }),
          completedAt: new Date(),
        });
      });
    }
    console.log(`✅ Cleanup completato.`);
  } catch (error: any) {
    console.error("❌ Errore cleanup stale jobs:", error.message);
  }
}

/**
 * Dispatcher Loop
 * Prende il prossimo job in coda in modo ATOMICO (evita conflitti tra server)
 */
export async function processNextBulkEmailJob() {
  if (dispatcherRunning) return;

  try {
    dispatcherRunning = true;

    // 1. Cerca il job più vecchio in coda
    const queuedSnapshot = await db
      .collection("bulkEmailJobs")
      .where("status", "==", "queued")
      .orderBy("createdAt", "asc")
      .limit(1)
      .get();

    if (queuedSnapshot.empty) return; // Nessun lavoro da fare

    const potentialJobRef = queuedSnapshot.docs[0].ref;

    // 2. ATOMIC LOCK: Tenta di reclamare il job
    const claimedJobData = await db.runTransaction(async (t) => {
      const doc = await t.get(potentialJobRef);
      if (!doc.exists) throw new Error("Job sparito");

      const data = doc.data();
      if (data?.status !== "queued") {
        throw new Error("Già preso"); // Qualcun altro lo sta elaborando
      }

      // Lock immediato
      t.update(potentialJobRef, {
        status: "in_progress",
        startedAt: new Date(),
        lastHeartbeatAt: new Date(),
      });

      return { id: doc.id, quotaDate: data?.quotaDate };
    });

    console.log(`🚀 Dispatcher ha avviato il job: ${claimedJobData.id}`);

    // 3. Esegui l'invio (fuori dalla transazione)
    await sendBulkEmails(claimedJobData.id, claimedJobData.quotaDate);
  } catch (error: any) {
    if (error.message !== "Già preso" && error.message !== "Job sparito") {
      console.error("❌ Errore Dispatcher:", error.message);
    }
  } finally {
    dispatcherRunning = false;
  }
}

// Start/Stop Dispatcher Helpers
export function startBulkEmailDispatcher(intervalMs: number = 5000) {
  if (dispatcherInterval) return;
  console.log(`📮 Dispatcher avviato (poll ogni ${intervalMs}ms)`);
  processNextBulkEmailJob(); // Run immediato
  dispatcherInterval = setInterval(processNextBulkEmailJob, intervalMs);
}

export function stopBulkEmailDispatcher() {
  if (dispatcherInterval) {
    clearInterval(dispatcherInterval);
    dispatcherInterval = null;
    console.log("🛑 Dispatcher fermato");
  }
}

// ============================================================================
// CORE LOGIC: SENDING ENGINE (Optimized)
// ============================================================================

async function sendBulkEmails(jobId: string, quotaDate: string) {
  const jobRef = db.collection("bulkEmailJobs").doc(jobId);

  let sentCount = 0;
  let failedCount = 0;
  let currentErrors: Array<{ email: string; error: string; retry: boolean }> =
    [];

  try {
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) throw new Error("Job non trovato");
    const jobData = jobDoc.data();

    const recipients = jobData?.recipients || [];
    const subject = jobData?.subject;
    const body = jobData?.body;

    // --- LOOP BATCH (es. 0..50, 50..100) ---
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      // Parallelismo Controllato all'interno del batch (chunks di 5)
      for (let j = 0; j < batch.length; j += CONCURRENCY_LIMIT) {
        const chunk = batch.slice(j, j + CONCURRENCY_LIMIT);

        // Esegui chunk in parallelo
        const results = await Promise.all(
          chunk.map((recipient) =>
            sendSingleEmailWrapper(recipient, subject, body),
          ),
        );

        // Raccogli risultati in memoria
        for (const res of results) {
          if (res.success) {
            sentCount++;
          } else {
            failedCount++;
            currentErrors.push({
              email: res.email,
              error: res.error || "Unknown",
              retry: false,
            });
          }
        }
      }

      // --- AGGIORNAMENTO FIRESTORE (Solo 1 volta per Batch!) ---
      // Aggiorna contatori e Heartbeat per evitare timeout
      await jobRef.update({
        sentCount,
        failedCount,
        quotaConsumed: sentCount, // Aggiorniamo il consumato reale
        errors:
          currentErrors.length > 0
            ? FieldValue.arrayUnion(...currentErrors)
            : undefined,
        lastHeartbeatAt: new Date(), // <--- CRITICO: tiene vivo il job
      });

      // Pulisci buffer errori
      currentErrors = [];

      // Rate Limiting
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS),
        );
      }
    }

    // --- COMPLETAMENTO ---
    const finalStatus =
      sentCount === 0 && recipients.length > 0 ? "failed" : "completed";
    await jobRef.update({
      status: finalStatus,
      sentCount,
      failedCount,
      quotaConsumed: sentCount,
      completedAt: new Date(),
      lastHeartbeatAt: new Date(),
    });

    console.log(
      `✅ Job ${jobId} completato. Inviate: ${sentCount}, Fallite: ${failedCount}`,
    );
  } catch (error: any) {
    console.error(`❌ Errore fatale job ${jobId}:`, error);
    await jobRef.update({
      status: "failed",
      errors: FieldValue.arrayUnion({ email: "system", error: error.message }),
      completedAt: new Date(),
    });
  } finally {
    // RILASCIO QUOTA FINALE (Always run)
    await releaseQuotaAtomic(jobId, quotaDate, sentCount);
  }
}

/**
 * Wrapper per gestire errori su singola email senza rompere il Promise.all
 */
async function sendSingleEmailWrapper(
  recipient: BulkEmailRecipient,
  subject: string,
  body: string,
) {
  try {
    await sendSingleEmail(recipient, subject, body);
    return { success: true, email: recipient.email };
  } catch (e: any) {
    // Retry veloce (opzionale)
    const isTemp = e.message.includes("timeout") || e.message.includes("rate");
    if (isTemp) {
      try {
        await new Promise((r) => setTimeout(r, 1000));
        await sendSingleEmail(recipient, subject, body);
        return { success: true, email: recipient.email };
      } catch (retryErr) {}
    }
    return { success: false, email: recipient.email, error: e.message };
  }
}

/**
 * Helper per Rilascio Quota Atomico
 * Calcola (Reserved - Consumed) e restituisce la differenza al pool giornaliero
 */
async function releaseQuotaAtomic(
  jobId: string,
  quotaDate: string,
  finalSentCount: number,
) {
  try {
    const jobRef = db.collection("bulkEmailJobs").doc(jobId);
    const quotaRef = db.collection("emailQuota").doc(quotaDate);

    await db.runTransaction(async (t) => {
      const jobDoc = await t.get(jobRef);
      if (!jobDoc.exists) return;

      const data = jobDoc.data();
      const reserved = data?.quotaReserved || 0;
      // Se il job è crashato prima di aggiornare il DB, usiamo finalSentCount locale, altrimenti quello su DB
      const consumed = Math.max(data?.quotaConsumed || 0, finalSentCount);

      if (reserved > 0) {
        // Aggiorna Quota Globale
        t.update(quotaRef, {
          reserved: FieldValue.increment(-reserved), // Rimuovi prenotazione
          sent: FieldValue.increment(consumed), // Aggiungi invii reali
        });

        // Imposta reserved a 0 sul job per impedire rilasci futuri doppi
        t.update(jobRef, { quotaReserved: 0 });

        console.log(
          `📊 Quota Rilasciata: Liberati ${reserved}, Confermati ${consumed}`,
        );
      }
    });
  } catch (e) {
    console.error("❌ Errore rilascio quota:", e);
  }
}

// ============================================================================
// API ROUTES
// ============================================================================

router.get("/recipients", async (req: Request, res: Response) => {
  try {
    const { filter } = req.query;
    let query = db.collection("clienti");

    if (filter === "anno_corrente") {
      const currentYear = new Date().getFullYear();
      query = query.where("anno", "==", currentYear);
    } else if (filter && filter.toString().startsWith("anno_")) {
      const year = parseInt(filter.toString().replace("anno_", ""));
      query = query.where("anno", "==", year);
    }

    const snapshot = await query.get();
    const recipients: BulkEmailRecipient[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.email) {
        recipients.push({
          email: data.email,
          nome: data.nome || "",
          cognome: data.cognome || "",
          clientId: doc.id,
        });
      }
    });

    res.json({ success: true, recipients, total: recipients.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/send", async (req: Request, res: Response) => {
  try {
    const { subject, body, recipients, senderId } = req.body;

    if (!subject || !body || !recipients || recipients.length === 0) {
      return res.status(400).json({ success: false, error: "Dati mancanti" });
    }

    const today = new Date().toISOString().split("T")[0];
    const quotaRef = db.collection("emailQuota").doc(today);
    const jobRef = db.collection("bulkEmailJobs").doc();

    const result = await db.runTransaction(async (transaction) => {
      // 1. Check Quota
      const quotaDoc = await transaction.get(quotaRef);
      const data = quotaDoc.exists ? quotaDoc.data() : {};
      const currentReserved = data?.reserved || 0;
      const currentSent = data?.sent || 0;
      const totalUsed = currentReserved + currentSent;

      if (totalUsed + recipients.length > GMAIL_DAILY_LIMIT) {
        throw new Error(
          `Quota insufficiente. Usati: ${totalUsed}/${GMAIL_DAILY_LIMIT}`,
        );
      }

      // 2. Reserve Quota
      transaction.set(
        quotaRef,
        {
          reserved: FieldValue.increment(recipients.length),
          date: today,
          lastUpdated: new Date(),
        },
        { merge: true },
      );

      // 3. Create Job
      const job: BulkEmailJob = {
        id: jobRef.id,
        subject,
        body,
        recipients,
        totalRecipients: recipients.length,
        quotaReserved: recipients.length,
        quotaConsumed: 0,
        quotaDate: today,
        sentCount: 0,
        failedCount: 0,
        status: "queued",
        errors: [],
        createdAt: new Date(),
        lastHeartbeatAt: new Date(),
        createdBy: senderId || "admin",
      };

      transaction.set(jobRef, job);
      return { jobId: jobRef.id };
    });

    res.json({ success: true, jobId: result.jobId, message: "Job in coda" });
  } catch (error: any) {
    console.error("❌ Errore POST /send:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/jobs", async (req: Request, res: Response) => {
  try {
    const snapshot = await db
      .collection("bulkEmailJobs")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    const jobs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, jobs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/jobs/:jobId", async (req: Request, res: Response) => {
  try {
    const doc = await db
      .collection("bulkEmailJobs")
      .doc(req.params.jobId)
      .get();
    if (!doc.exists)
      return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, job: doc.data() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// EMAIL HELPER
// ============================================================================

async function sendSingleEmail(
  recipient: BulkEmailRecipient,
  subject: string,
  body: string,
): Promise<void> {
  let personalizedBody = body;
  if (recipient.nome) {
    personalizedBody = body
      .replace(/\{nome\}/g, recipient.nome)
      .replace(/\{cognome\}/g, recipient.cognome)
      .replace(
        /\{nome_completo\}/g,
        `${recipient.nome} ${recipient.cognome}`.trim(),
      );
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

  await sendGmailEmail(recipient.email, subject, emailHTML);
}

export default router;
