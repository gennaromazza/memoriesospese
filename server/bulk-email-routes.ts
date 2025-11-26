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
const GMAIL_DAILY_LIMIT = 500; // Gmail ha limite 500/giorno (2000 solo per Workspace)
const BATCH_SIZE = 30; // Aggiornamento DB ogni 30 email (ridotto per update più frequenti)
const CONCURRENCY_LIMIT = 1; // ⚠️ SEQUENZIALE: 1 email alla volta per rispettare rate limit Gmail
const DELAY_BETWEEN_EMAILS_MS = 1000; // ⚠️ RATE LIMIT: 1 email/secondo = 60/minuto (safe)
const DELAY_BETWEEN_BATCHES_MS = 3000; // Rate limiting tra batch
const HEARTBEAT_TIMEOUT = 5 * 60 * 1000; // 5 minuti
const MAX_RETRY_ATTEMPTS = 4; // Tentativi massimi per email (incluso primo)
const BASE_BACKOFF_MS = 2000; // Backoff base per retry (raddoppia ogni tentativo)

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

    // --- LOOP SEQUENZIALE: 1 EMAIL/SECONDO ---
    // Niente chunking, niente parallelismo - invio strettamente sequenziale
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      
      // Invia email singola
      const res = await sendSingleEmailWrapper(recipient, subject, body);
      
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

      // Rate limiting DOPO ogni email: 1 email/secondo
      // (eccetto dopo l'ultima email)
      if (i < recipients.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_EMAILS_MS),
        );
      }

      // --- AGGIORNAMENTO FIRESTORE ogni BATCH_SIZE email ---
      if ((i + 1) % BATCH_SIZE === 0 || i === recipients.length - 1) {
        const updateData: Record<string, any> = {
          sentCount,
          failedCount,
          quotaConsumed: sentCount,
          lastHeartbeatAt: new Date(),
        };
        
        if (currentErrors.length > 0) {
          updateData.errors = FieldValue.arrayUnion(...currentErrors);
        }
        
        await jobRef.update(updateData);
        currentErrors = [];
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
 * Parsa il retryAfter dall'errore Gmail
 * Legge da: error.message, error.response.headers, error.errors[0]
 */
function parseRetryAfter(error: any): number | null {
  // 1. Cerca in response headers (Retry-After header standard)
  const headers = error?.response?.headers;
  if (headers) {
    const retryHeader = headers['retry-after'] || headers['Retry-After'];
    if (retryHeader) {
      const seconds = parseInt(retryHeader, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
      const retryDate = new Date(retryHeader);
      if (!isNaN(retryDate.getTime())) {
        return Math.max(0, retryDate.getTime() - Date.now());
      }
    }
  }
  
  // 2. Cerca in error.errors[0] (formato Google API)
  const googleError = error?.errors?.[0] || error?.response?.data?.error?.errors?.[0];
  if (googleError?.message) {
    const match = googleError.message.match(/Retry after (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i);
    if (match) {
      const retryDate = new Date(match[1]);
      return Math.max(0, retryDate.getTime() - Date.now());
    }
  }
  
  // 3. Cerca nel messaggio di errore (fallback)
  const errorMessage = error?.message || String(error);
  
  const isoMatch = errorMessage.match(/Retry after (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i);
  if (isoMatch) {
    const retryDate = new Date(isoMatch[1]);
    const delayMs = retryDate.getTime() - Date.now();
    return delayMs > 0 ? delayMs : null;
  }
  
  const secondsMatch = errorMessage.match(/retry.+?(\d+)\s*(?:seconds?|s)/i);
  if (secondsMatch) {
    return parseInt(secondsMatch[1], 10) * 1000;
  }
  
  return null;
}

/**
 * Rileva se l'errore è un rate limit Gmail
 * Controlla: status 429, reason codes, e testo messaggio
 */
function isGmailRateLimit(error: any): boolean {
  // 1. HTTP Status 429 (Too Many Requests)
  const status = error?.response?.status || error?.code || error?.status;
  if (status === 429) return true;
  
  // 2. Google API reason codes
  const googleErrors = error?.errors || error?.response?.data?.error?.errors || [];
  for (const ge of googleErrors) {
    const reason = ge?.reason?.toLowerCase() || '';
    if (reason.includes('ratelimit') || reason.includes('quota') || reason.includes('userlimit')) {
      return true;
    }
  }
  
  // 3. Messaggio di errore (fallback)
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('rate') || msg.includes('limit') || msg.includes('quota') || msg.includes('too many')) {
    return true;
  }
  
  return false;
}

/**
 * Wrapper con retry intelligente e backoff esponenziale
 * - Parsa retryAfter dalla risposta Gmail
 * - Backoff esponenziale: 2s, 4s, 8s, 16s...
 * - Max tentativi configurabili
 */
async function sendSingleEmailWrapper(
  recipient: BulkEmailRecipient,
  subject: string,
  body: string,
) {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      await sendSingleEmail(recipient, subject, body);
      return { success: true, email: recipient.email };
    } catch (e: any) {
      lastError = e;
      const isRateLimit = isGmailRateLimit(e);
      const isTimeout = e.message?.includes("timeout") || e.message?.includes("ETIMEDOUT");
      const isRetryable = isRateLimit || isTimeout;
      
      if (!isRetryable || attempt === MAX_RETRY_ATTEMPTS) {
        break;
      }
      
      let delayMs: number;
      
      if (isRateLimit) {
        const retryAfterMs = parseRetryAfter(e);
        if (retryAfterMs && retryAfterMs > 0) {
          delayMs = Math.min(retryAfterMs + 1000, 5 * 60 * 1000);
          console.log(`⏳ Rate limit: attendo ${Math.round(delayMs / 1000)}s (retryAfter) per ${recipient.email}`);
        } else {
          delayMs = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          console.log(`⏳ Rate limit: backoff ${Math.round(delayMs / 1000)}s (tentativo ${attempt}/${MAX_RETRY_ATTEMPTS}) per ${recipient.email}`);
        }
      } else {
        delayMs = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        console.log(`⏳ Timeout: backoff ${Math.round(delayMs / 1000)}s (tentativo ${attempt}/${MAX_RETRY_ATTEMPTS}) per ${recipient.email}`);
      }
      
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  
  console.log(`❌ Fallito dopo ${MAX_RETRY_ATTEMPTS} tentativi: ${recipient.email} - ${lastError?.message}`);
  return { success: false, email: recipient.email, error: lastError?.message || "Max retry exceeded" };
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

// GET Quota giornaliera
router.get("/quota", async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const quotaRef = db.collection("emailQuota").doc(today);
    const quotaDoc = await quotaRef.get();
    
    const data = quotaDoc.exists ? quotaDoc.data() : {};
    const sent = data?.sent || 0;
    const reserved = data?.reserved || 0;
    const remaining = Math.max(0, GMAIL_DAILY_LIMIT - sent - reserved);

    res.json({
      success: true,
      quota: {
        sent,
        reserved,
        limit: GMAIL_DAILY_LIMIT,
        remaining,
        date: today
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET Filtri disponibili (anni dinamici + tipi lavoro dai jobs)
router.get("/filters", async (req: Request, res: Response) => {
  try {
    const jobsSnapshot = await db.collection("jobs").select("dataEvento", "eventDate", "jobType").get();
    const yearsSet = new Set<number>();
    const jobTypesSet = new Set<string>();
    const currentYear = new Date().getFullYear();

    jobsSnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Estrai anno da dataEvento o eventDate
      const dateField = data.dataEvento || data.eventDate;
      if (dateField) {
        let year: number | null = null;
        if (typeof dateField === 'string') {
          year = new Date(dateField).getFullYear();
        } else if (dateField?.toDate) {
          year = dateField.toDate().getFullYear();
        }
        if (year && year >= 2020 && year <= currentYear + 2) {
          yearsSet.add(year);
        }
      }
      
      // Estrai tipo lavoro
      if (data.jobType && typeof data.jobType === 'string') {
        jobTypesSet.add(data.jobType);
      }
    });

    // Ordina anni (più recenti prima)
    const years = Array.from(yearsSet).sort((a, b) => b - a);
    const yearFilters = years
      .filter(y => y !== currentYear)
      .map(year => ({
        value: `anno_${year}`,
        label: `Anno ${year}`
      }));

    // Mappa nomi italiani per i tipi lavoro comuni
    const jobTypeLabels: Record<string, string> = {
      'matrimonio': '💒 Matrimoni',
      'battesimo': '👶 Battesimi',
      'comunione': '⛪ Comunioni',
      'cresima': '✝️ Cresime',
      'compleanno': '🎂 Compleanni',
      'famiglia': '👨‍👩‍👧‍👦 Famiglie',
      'evento': '🎉 Eventi',
      'corporate': '🏢 Corporate',
      'newborn': '👼 Newborn',
      'gravidanza': '🤰 Gravidanza',
      'altro': '📷 Altro'
    };

    const jobTypeFilters = Array.from(jobTypesSet)
      .sort()
      .map(jobType => ({
        value: `tipo_${jobType}`,
        label: jobTypeLabels[jobType] || jobType.charAt(0).toUpperCase() + jobType.slice(1)
      }));

    res.json({ 
      success: true, 
      filters: yearFilters,
      jobTypeFilters
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/recipients", async (req: Request, res: Response) => {
  try {
    const { filter } = req.query;
    const recipients: BulkEmailRecipient[] = [];
    const emailsAdded = new Set<string>();

    // Filtro speciale: Preventivi Non Firmati (per upsell)
    // Target: Jobs con preventivo creato ma non firmato, escludendo jobs completati/contrattualizzati
    if (filter === "preventivi_non_firmati") {
      const jobsSnapshot = await db.collection("jobs")
        .where("quoteId", "!=", null)
        .limit(500)
        .get();
      
      // Raccogli tutti i clientId unici per batch load
      const clientIds = new Set<string>();
      const jobsWithUnsignedQuotes: Array<{ clienteId: string }> = [];
      
      for (const jobDoc of jobsSnapshot.docs) {
        const jobData = jobDoc.data();
        
        // Escludi jobs completati o con contratto firmato
        const isCompleted = jobData.status === 'completed' || jobData.status === 'cancelled';
        const hasSignedQuote = jobData.quoteSignedAt || jobData.quoteStatus === 'signed' || jobData.quoteStatus === 'accepted';
        const hasContract = jobData.contractSignedAt;
        
        // Include solo jobs con preventivo non firmato e non completati
        if (!isCompleted && !hasSignedQuote && !hasContract && jobData.clienteId) {
          clientIds.add(jobData.clienteId);
          jobsWithUnsignedQuotes.push({ clienteId: jobData.clienteId });
        }
      }
      
      // Batch load clienti (max 30 per batch con Firestore 'in' query)
      const clientIdArray = Array.from(clientIds);
      const clientsMap = new Map<string, any>();
      
      for (let i = 0; i < clientIdArray.length; i += 30) {
        const batch = clientIdArray.slice(i, i + 30);
        if (batch.length === 0) continue;
        
        const clientsSnapshot = await db.collection("clienti")
          .where("__name__", "in", batch)
          .get();
        
        clientsSnapshot.forEach(doc => {
          clientsMap.set(doc.id, { id: doc.id, ...doc.data() });
        });
      }
      
      // Costruisci lista destinatari senza duplicati
      for (const job of jobsWithUnsignedQuotes) {
        const clientData = clientsMap.get(job.clienteId);
        if (clientData?.email && !emailsAdded.has(clientData.email)) {
          emailsAdded.add(clientData.email);
          recipients.push({
            email: clientData.email,
            nome: clientData.nome || "",
            cognome: clientData.cognome || "",
            clientId: clientData.id,
          });
        }
      }
      
      return res.json({ success: true, recipients, total: recipients.length });
    }

    // Filtro per tipo lavoro (cerca jobs e poi clienti associati)
    if (filter && filter.toString().startsWith("tipo_")) {
      const jobType = filter.toString().replace("tipo_", "");
      
      const jobsSnapshot = await db.collection("jobs")
        .where("jobType", "==", jobType)
        .limit(500)
        .get();
      
      // Raccogli tutti i clientIds unici
      const clientIds = new Set<string>();
      
      for (const jobDoc of jobsSnapshot.docs) {
        const jobData = jobDoc.data();
        // Supporta sia clienteId singolo che clientiIds array
        if (jobData.clienteId) {
          clientIds.add(jobData.clienteId);
        }
        if (Array.isArray(jobData.clientiIds)) {
          jobData.clientiIds.forEach((id: string) => clientIds.add(id));
        }
      }
      
      // Batch load clienti (max 30 per batch)
      const clientIdArray = Array.from(clientIds);
      const clientsMap = new Map<string, any>();
      
      for (let i = 0; i < clientIdArray.length; i += 30) {
        const batch = clientIdArray.slice(i, i + 30);
        if (batch.length === 0) continue;
        
        const clientsSnapshot = await db.collection("clienti")
          .where("__name__", "in", batch)
          .get();
        
        clientsSnapshot.forEach(doc => {
          clientsMap.set(doc.id, { id: doc.id, ...doc.data() });
        });
      }
      
      // Costruisci lista destinatari senza duplicati
      for (const clientId of clientIds) {
        const clientData = clientsMap.get(clientId);
        if (clientData?.email && !emailsAdded.has(clientData.email)) {
          emailsAdded.add(clientData.email);
          recipients.push({
            email: clientData.email,
            nome: clientData.nome || "",
            cognome: clientData.cognome || "",
            clientId: clientData.id,
          });
        }
      }
      
      return res.json({ success: true, recipients, total: recipients.length });
    }

    // Filtri standard per anno
    let query: any = db.collection("clienti");

    if (filter === "anno_corrente") {
      const currentYear = new Date().getFullYear();
      query = query.where("anno", "==", currentYear);
    } else if (filter && filter.toString().startsWith("anno_")) {
      const year = parseInt(filter.toString().replace("anno_", ""));
      query = query.where("anno", "==", year);
    }

    const snapshot = await query.get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.email && !emailsAdded.has(data.email)) {
        emailsAdded.add(data.email);
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

router.post("/jobs/:jobId/retry-failed", async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    const originalJobDoc = await db.collection("bulkEmailJobs").doc(jobId).get();
    if (!originalJobDoc.exists) {
      return res.status(404).json({ success: false, error: "Job non trovato" });
    }
    
    const originalJob = originalJobDoc.data();
    const errors = originalJob?.errors || [];
    
    if (errors.length === 0) {
      return res.status(400).json({ success: false, error: "Nessun errore da riprovare" });
    }
    
    const originalRecipients = originalJob?.recipients || [];
    const failedEmails = new Set(errors.map((e: any) => e.email));
    
    const recipientsToRetry = originalRecipients.filter((r: any) => 
      failedEmails.has(r.email)
    );
    
    if (recipientsToRetry.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "Impossibile trovare i destinatari da riprovare" 
      });
    }
    
    const today = new Date().toISOString().split("T")[0];
    const quotaRef = db.collection("emailQuota").doc(today);
    const newJobRef = db.collection("bulkEmailJobs").doc();
    
    const result = await db.runTransaction(async (transaction) => {
      const quotaDoc = await transaction.get(quotaRef);
      const data = quotaDoc.exists ? quotaDoc.data() : {};
      const currentReserved = data?.reserved || 0;
      const currentSent = data?.sent || 0;
      const totalUsed = currentReserved + currentSent;
      
      if (totalUsed + recipientsToRetry.length > GMAIL_DAILY_LIMIT) {
        throw new Error(
          `Quota insufficiente. Usati: ${totalUsed}/${GMAIL_DAILY_LIMIT}`
        );
      }
      
      transaction.set(
        quotaRef,
        {
          reserved: FieldValue.increment(recipientsToRetry.length),
          date: today,
          lastUpdated: new Date(),
        },
        { merge: true }
      );
      
      const newJob: BulkEmailJob = {
        id: newJobRef.id,
        subject: originalJob?.subject || "",
        body: originalJob?.body || "",
        recipients: recipientsToRetry,
        totalRecipients: recipientsToRetry.length,
        quotaReserved: recipientsToRetry.length,
        quotaConsumed: 0,
        quotaDate: today,
        sentCount: 0,
        failedCount: 0,
        status: "queued",
        errors: [],
        createdAt: new Date(),
        lastHeartbeatAt: new Date(),
        createdBy: "admin",
        retryOf: jobId,
      };
      
      transaction.set(newJobRef, newJob);
      return { jobId: newJobRef.id, recipientsCount: recipientsToRetry.length };
    });
    
    res.json({ 
      success: true, 
      jobId: result.jobId, 
      recipientsCount: result.recipientsCount,
      message: `Nuovo job creato per ${result.recipientsCount} email fallite` 
    });
  } catch (error: any) {
    console.error("❌ Errore POST /retry-failed:", error);
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
