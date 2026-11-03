import type { HttpHandlerResult } from "./http-types.js";
/**
 * Bulk Email Routes - Sistema invio massivo email ai clienti
 * Ottimizzato per: Performance Firestore, Crash Recovery, Atomic Locking
 */

import { Router, Request, Response } from "express";
import { db } from "./firebase-admin.js";
import { sendGmailEmail, authenticateFirebase } from "./email-routes.js";
import { FieldValue } from "firebase-admin/firestore";
import { DateTime } from "luxon";
import { nowRomeDate } from "./utils/timezone.js";
import {
  getResendMarketingStatus,
  submitResendBroadcast,
  validateMarketingSender,
} from "./resend-marketing.js";
import {
  campaignEndDateInRome,
  dedupeMarketingRecipients,
  isBookingCampaignEnded,
  isEligibleBookingForMarketing,
  normalizeMarketingEmail,
  parseMarketingRecipientFilters,
  type BulkEmailRecipient,
  type BulkEmailRecipientCandidate,
} from "./bulk-email-audience.js";

/**
 * Ottiene la data di oggi in formato YYYY-MM-DD usando Europe/Rome
 * Evita problemi di timezone con UTC
 */
function getTodayRome(): string {
  return DateTime.now().setZone("Europe/Rome").toFormat("yyyy-MM-dd");
}

const router = Router();

const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

interface EndedBookingCampaign {
  id: string;
  label: string;
  endDate: DateTime;
}

async function loadEndedBookingCampaigns(): Promise<EndedBookingCampaign[]> {
  const now = DateTime.now().setZone("Europe/Rome");
  const snapshot = await db.collection("booking_campaigns").get();

  return snapshot.docs
    .flatMap((doc) => {
      const data = doc.data();
      const endDate = campaignEndDateInRome(data.dataFine);
      if (!endDate || !isBookingCampaignEnded(data.dataFine, now)) return [];

      return [{
        id: doc.id,
        label: typeof data.nome === "string" && data.nome.trim()
          ? data.nome.trim()
          : `Campagna ${doc.id}`,
        endDate,
      }];
    })
    .sort((a, b) => b.endDate.toMillis() - a.endDate.toMillis());
}

async function loadClientDocumentsByIds(clientIds: Iterable<string>): Promise<Map<string, any>> {
  const uniqueIds = Array.from(new Set(Array.from(clientIds).filter(Boolean)));
  const documents = new Map<string, any>();
  const refs = uniqueIds.map((id) => db.collection("clienti").doc(id));

  for (let offset = 0; offset < refs.length; offset += 250) {
    const batch = await db.getAll(...refs.slice(offset, offset + 250));
    for (const document of batch) {
      if (document.exists) documents.set(document.id, document);
    }
  }

  return documents;
}

async function loadBookingsByCampaignIds(
  campaignIds: string[],
): Promise<Map<string, Array<{ id: string; data: any }>>> {
  const bookingsByCampaign = new Map(
    campaignIds.map((campaignId) => [campaignId, [] as Array<{ id: string; data: any }>]),
  );

  for (let offset = 0; offset < campaignIds.length; offset += 30) {
    const batchIds = campaignIds.slice(offset, offset + 30);
    if (batchIds.length === 0) continue;

    const snapshot = await db.collection("bookings")
      .where("campaignId", "in", batchIds)
      .get();

    for (const document of snapshot.docs) {
      const data = document.data();
      const campaignBookings = bookingsByCampaign.get(data.campaignId);
      if (campaignBookings) campaignBookings.push({ id: document.id, data });
    }
  }

  return bookingsByCampaign;
}

function clientDocumentToCandidate(document: any): BulkEmailRecipientCandidate {
  const data = document.data() || {};
  return {
    email: data.email,
    nome: data.nome,
    cognome: data.cognome,
    clientId: document.id,
  };
}

async function loadCampaignRecipientCandidates(
  campaignId: string,
): Promise<{ candidates: BulkEmailRecipientCandidate[]; unlinkedBookingContacts: number }> {
  const [campaignDocument, bookingsByCampaign] = await Promise.all([
    db.collection("booking_campaigns").doc(campaignId).get(),
    loadBookingsByCampaignIds([campaignId]),
  ]);

  if (!campaignDocument.exists || !isBookingCampaignEnded(campaignDocument.data()?.dataFine)) {
    return { candidates: [], unlinkedBookingContacts: 0 };
  }

  const bookings = (bookingsByCampaign.get(campaignId) || []).filter(({ data }) =>
    isEligibleBookingForMarketing(data.stato) && normalizeMarketingEmail(data.cliente?.email),
  );
  const explicitClientIds = bookings
    .map(({ data }) => typeof data.clienteId === "string" ? data.clienteId : "")
    .filter(Boolean);
  const clientDocuments = await loadClientDocumentsByIds(explicitClientIds);
  const clientByBookingId = new Map<string, any>();

  const bookingIds = bookings.map(({ id }) => id);
  for (let offset = 0; offset < bookingIds.length; offset += 30) {
    const batchBookingIds = bookingIds.slice(offset, offset + 30);
    const linkedClients = await db.collection("clienti")
      .where("sourceRefs.bookingIds", "array-contains-any", batchBookingIds)
      .get();

    for (const document of linkedClients.docs) {
      const linkedBookingIds = document.data()?.sourceRefs?.bookingIds;
      if (!Array.isArray(linkedBookingIds)) continue;
      for (const bookingId of linkedBookingIds) {
        if (batchBookingIds.includes(bookingId) && !clientByBookingId.has(bookingId)) {
          clientByBookingId.set(bookingId, document);
        }
      }
    }
  }

  const unresolvedEmails = Array.from(new Set(
    bookings
      .filter(({ id, data }) => !clientDocuments.has(data.clienteId) && !clientByBookingId.has(id))
      .map(({ data }) => normalizeMarketingEmail(data.cliente?.email))
      .filter((email): email is string => !!email),
  ));
  const clientByEmail = new Map<string, any>();

  for (let offset = 0; offset < unresolvedEmails.length; offset += 30) {
    const emailBatch = unresolvedEmails.slice(offset, offset + 30);
    if (emailBatch.length === 0) continue;
    const matchingClients = await db.collection("clienti")
      .where("email", "in", emailBatch)
      .get();
    for (const document of matchingClients.docs) {
      const email = normalizeMarketingEmail(document.data()?.email);
      if (email && !clientByEmail.has(email)) clientByEmail.set(email, document);
    }
  }

  const candidates: BulkEmailRecipientCandidate[] = [];
  let unlinkedBookingContacts = 0;

  for (const booking of bookings) {
    const email = normalizeMarketingEmail(booking.data.cliente?.email);
    if (!email) continue;
    const linkedDocument =
      clientDocuments.get(booking.data.clienteId) ||
      clientByBookingId.get(booking.id) ||
      clientByEmail.get(email);

    if (!linkedDocument?.exists || !normalizeMarketingEmail(linkedDocument.data()?.email)) {
      unlinkedBookingContacts += 1;
      continue;
    }

    candidates.push(clientDocumentToCandidate(linkedDocument));
  }

  return { candidates, unlinkedBookingContacts };
}

async function getRecipientsForFilters(filters: string[]): Promise<{
  recipients: BulkEmailRecipient[];
  duplicatesRemoved: number;
  unlinkedBookingContacts: number;
}> {
  const candidates: BulkEmailRecipientCandidate[] = [];
  let unlinkedBookingContacts = 0;
  const selectedCampaignIds: string[] = [];
  const selectedFilters = Array.from(new Set(filters.map((filter) => filter.trim()).filter(Boolean)));

  for (const filter of selectedFilters) {
    if (filter === "all") {
      const snapshot = await db.collection("clienti").get();
      for (const document of snapshot.docs) candidates.push(clientDocumentToCandidate(document));
      continue;
    }

    if (filter === "preventivi_non_firmati") {
      const jobsSnapshot = await db.collection("jobs")
        .where("quoteId", "!=", null)
        .limit(500)
        .get();
      const clientIds = new Set<string>();

      for (const jobDocument of jobsSnapshot.docs) {
        const jobData = jobDocument.data();
        const isCompleted = jobData.status === "completed" || jobData.status === "cancelled";
        const hasSignedQuote = jobData.quoteSignedAt ||
          jobData.quoteStatus === "signed" ||
          jobData.quoteStatus === "accepted";
        if (!isCompleted && !hasSignedQuote && !jobData.contractSignedAt && jobData.clienteId) {
          clientIds.add(jobData.clienteId);
        }
      }

      const clients = await loadClientDocumentsByIds(clientIds);
      for (const document of clients.values()) candidates.push(clientDocumentToCandidate(document));
      continue;
    }

    if (filter.startsWith("tipo_")) {
      const jobType = filter.slice("tipo_".length);
      if (!jobType) continue;
      const jobsSnapshot = await db.collection("jobs")
        .where("jobType", "==", jobType)
        .limit(500)
        .get();
      const clientIds = new Set<string>();

      for (const jobDocument of jobsSnapshot.docs) {
        const jobData = jobDocument.data();
        const linkedIds: string[] = Array.isArray(jobData.clientiIds) ? jobData.clientiIds : [];
        if (linkedIds.length === 0 && typeof jobData.clienteId === "string") {
          linkedIds.push(jobData.clienteId);
        }
        for (const id of linkedIds) if (typeof id === "string" && id) clientIds.add(id);
      }

      const clients = await loadClientDocumentsByIds(clientIds);
      for (const document of clients.values()) candidates.push(clientDocumentToCandidate(document));
      continue;
    }

    if (filter === "anno_corrente" || /^anno_\d{4}$/.test(filter)) {
      const year = filter === "anno_corrente"
        ? DateTime.now().setZone("Europe/Rome").year
        : Number(filter.slice("anno_".length));
      const snapshot = await db.collection("clienti").where("anno", "==", year).get();
      for (const document of snapshot.docs) candidates.push(clientDocumentToCandidate(document));
      continue;
    }

    if (filter.startsWith("campagna_")) {
      const campaignId = filter.slice("campagna_".length).trim();
      if (campaignId) selectedCampaignIds.push(campaignId);
    }
  }

  for (let offset = 0; offset < selectedCampaignIds.length; offset += 5) {
    const campaignBatch = selectedCampaignIds.slice(offset, offset + 5);
    const campaignResults = await Promise.all(
      campaignBatch.map((campaignId) => loadCampaignRecipientCandidates(campaignId)),
    );
    for (const campaignResult of campaignResults) {
      candidates.push(...campaignResult.candidates);
      unlinkedBookingContacts += campaignResult.unlinkedBookingContacts;
    }
  }

  const deduped = dedupeMarketingRecipients(candidates);
  return {
    ...deduped,
    unlinkedBookingContacts,
  };
}

function requireAdmin(req: any, res: any, next: any) {
  if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
    return res.status(403).json({ error: 'Accesso negato: solo admin' });
  }
  next();
}

// --- CONFIGURAZIONE ---
const GMAIL_DAILY_LIMIT = 400; // 400 per bulk email, 100 riservate per notifiche clienti
const BATCH_SIZE = 30; // Aggiornamento DB ogni 30 email (ridotto per update più frequenti)
const CONCURRENCY_LIMIT = 1; // ⚠️ SEQUENZIALE: 1 email alla volta per rispettare rate limit Gmail
const DELAY_BETWEEN_EMAILS_MS = 1000; // ⚠️ RATE LIMIT: 1 email/secondo = 60/minuto (safe)
const DELAY_BETWEEN_BATCHES_MS = 3000; // Rate limiting tra batch
const HEARTBEAT_TIMEOUT = 5 * 60 * 1000; // 5 minuti
const MAX_RETRY_ATTEMPTS = 4; // Tentativi massimi per email (incluso primo)
const BASE_BACKOFF_MS = 2000; // Backoff base per retry (raddoppia ogni tentativo)

// --- INTERFACCE ---
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
  status: "queued" | "scheduled" | "in_progress" | "completed" | "failed";
  errors: Array<{ email: string; error: string }>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  lastHeartbeatAt: Date;
  createdBy: string;
  quotaDate: string;
  retryOf?: string;
  batchIndex?: number;
  totalBatches?: number;
  provider?: "gmail" | "resend";
  senderEmail?: string;
  providerTopicId?: string;
  providerSegmentId?: string;
  providerBroadcastId?: string;
  providerStatus?: string;
  preparedCount?: number;
  excludedCount?: number;
  progressStage?: string;
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
          completedAt: nowRomeDate(),
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
        startedAt: nowRomeDate(),
        lastHeartbeatAt: nowRomeDate(),
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

    if (jobData?.provider === "resend") {
      const result = await submitResendBroadcast({
        jobId,
        senderEmail: jobData.senderEmail,
        subject,
        body,
        recipients,
        existing: {
          providerTopicId: jobData.providerTopicId,
          providerSegmentId: jobData.providerSegmentId,
          providerBroadcastId: jobData.providerBroadcastId,
          providerStatus: jobData.providerStatus,
          preparedCount: jobData.preparedCount,
          excludedCount: jobData.excludedCount,
          progressStage: jobData.progressStage,
        },
        onProgress: async (progress) => {
          await jobRef.update({
            ...progress,
            lastHeartbeatAt: nowRomeDate(),
          });
        },
      });

      await jobRef.update({
        status: "completed",
        provider: "resend",
        providerBroadcastId: result.broadcastId,
        providerStatus: result.providerStatus,
        progressStage: "Campagna affidata a Resend",
        preparedCount: result.eligibleCount,
        excludedCount: result.excludedCount,
        sentCount: result.eligibleCount,
        failedCount: 0,
        completedAt: nowRomeDate(),
        lastHeartbeatAt: nowRomeDate(),
      });
      return;
    }

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
          lastHeartbeatAt: nowRomeDate(),
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
      completedAt: nowRomeDate(),
      lastHeartbeatAt: nowRomeDate(),
    });

    console.log(
      `✅ Job ${jobId} completato. Inviate: ${sentCount}, Fallite: ${failedCount}`,
    );
  } catch (error: any) {
    console.error(`❌ Errore fatale job ${jobId}:`, error);
    await jobRef.update({
      status: "failed",
      errors: FieldValue.arrayUnion({ email: "system", error: error.message }),
      completedAt: nowRomeDate(),
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
router.get("/quota", authenticateFirebase, requireAdmin, async (req: any, res: Response) => {
  try {
    const today = getTodayRome();
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

router.get("/resend-status", authenticateFirebase, requireAdmin, async (_req: any, res: Response) => {
  try {
    const status = await getResendMarketingStatus();
    res.json({ success: true, ...status });
  } catch {
    res.status(503).json({
      success: false,
      connected: false,
      error: "Resend non è disponibile. Controlla il collegamento API.",
    });
  }
});

router.post("/send-resend", authenticateFirebase, requireAdmin, async (req: any, res: Response): Promise<HttpHandlerResult> => {
  try {
    const { subject, body, recipients, senderId, senderEmail, confirmMarketingConsent } = req.body;

    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      typeof body !== "string" ||
      !body.trim() ||
      !Array.isArray(recipients) ||
      recipients.length === 0
    ) {
      return res.status(400).json({ success: false, error: "Oggetto, messaggio e destinatari sono obbligatori." });
    }
    if (subject.length > 200 || body.length > 250_000) {
      return res.status(400).json({
        success: false,
        error: "L'oggetto o il messaggio supera la dimensione consentita.",
      });
    }
    if (recipients.length > 5000) {
      return res.status(400).json({ success: false, error: "La campagna supera il limite di 5.000 destinatari." });
    }
    if (confirmMarketingConsent !== true) {
      return res.status(400).json({
        success: false,
        error: "Conferma che i destinatari selezionati hanno dato il consenso alle comunicazioni promozionali.",
      });
    }

    const resendStatus = await getResendMarketingStatus();
    const senderError = validateMarketingSender(
      typeof senderEmail === "string" ? senderEmail : "",
      resendStatus.verifiedSendingDomains.map((domain) => ({
        ...domain,
        sendingEnabled: true,
      })),
    );
    if (senderError) {
      return res.status(400).json({ success: false, error: senderError });
    }

    const requestedRecipients = new Map<string, { clientId: string }>();
    for (const recipient of recipients) {
      const email = typeof recipient?.email === "string"
        ? recipient.email.trim().toLowerCase()
        : "";
      const clientId = typeof recipient?.clientId === "string"
        ? recipient.clientId.trim()
        : "";
      if (!email || !clientId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          success: false,
          error: "La lista contiene un contatto non valido. Ricarica i destinatari e riprova.",
        });
      }
      requestedRecipients.set(email, { clientId });
    }

    const entries = Array.from(requestedRecipients.entries());
    const refs = entries.map(([, recipient]) => db.collection("clienti").doc(recipient.clientId));
    const clientDocs: any[] = [];
    for (let offset = 0; offset < refs.length; offset += 250) {
      clientDocs.push(...await db.getAll(...refs.slice(offset, offset + 250)));
    }
    const recipientsByEmail = new Map<string, BulkEmailRecipient>();
    for (let i = 0; i < entries.length; i++) {
      const [email, requested] = entries[i];
      const clientDoc = clientDocs[i];
      if (!clientDoc?.exists) {
        return res.status(400).json({
          success: false,
          error: "Uno o più contatti non sono più disponibili. Ricarica la lista e riprova.",
        });
      }
      const clientData = clientDoc.data() || {};
      const storedEmail = typeof clientData.email === "string"
        ? clientData.email.trim().toLowerCase()
        : "";
      if (storedEmail !== email) {
        return res.status(400).json({
          success: false,
          error: "I dati dei destinatari sono cambiati. Ricarica la lista prima di inviare.",
        });
      }
      recipientsByEmail.set(email, {
        email,
        nome: typeof clientData.nome === "string" ? clientData.nome : "",
        cognome: typeof clientData.cognome === "string" ? clientData.cognome : "",
        clientId: clientDoc.id,
      });
    }

    const normalizedRecipients = Array.from(recipientsByEmail.values());
    const today = getTodayRome();
    const jobRef = db.collection("bulkEmailJobs").doc();
    const job: BulkEmailJob = {
      id: jobRef.id,
      subject: subject.trim(),
      body,
      recipients: normalizedRecipients,
      totalRecipients: normalizedRecipients.length,
      quotaReserved: 0,
      quotaConsumed: 0,
      quotaDate: today,
      sentCount: 0,
      failedCount: 0,
      status: "queued",
      errors: [],
      createdAt: nowRomeDate(),
      lastHeartbeatAt: nowRomeDate(),
      createdBy: senderId || req.user?.email || "admin",
      provider: "resend",
      senderEmail: senderEmail.trim().toLowerCase(),
      providerStatus: "preparing",
      preparedCount: 0,
      excludedCount: 0,
      progressStage: "In attesa di Resend",
    };

    await jobRef.set(job);
    res.json({
      success: true,
      jobId: jobRef.id,
      jobs: [{ id: jobRef.id, status: job.status, recipients: normalizedRecipients.length }],
      message: `Campagna Resend in coda per ${normalizedRecipients.length} destinatari.`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: typeof error?.message === "string" ? error.message : "Impossibile preparare la campagna Resend.",
    });
  }
});

// POST Reset quota giornaliera (solo admin)
router.post("/quota/reset", authenticateFirebase, requireAdmin, async (req: any, res: Response) => {
  try {
    const today = getTodayRome();
    const quotaRef = db.collection("emailQuota").doc(today);
    
    await quotaRef.set({
      sent: 0,
      reserved: 0,
      resetAt: nowRomeDate(),
      resetBy: "admin"
    });
    
    console.log(`🔄 Quota resettata per ${today}`);
    
    res.json({ 
      success: true, 
      message: `Quota resettata per ${today}`,
      date: today
    });
  } catch (error: any) {
    console.error("❌ Errore reset quota:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// TEMPLATE EMAIL ROUTES
// ============================================================================

// GET Lista template email
router.get("/templates", authenticateFirebase, requireAdmin, async (req: any, res: Response) => {
  try {
    const snapshot = await db.collection("emailTemplates")
      .orderBy("updatedAt", "desc")
      .get();
    
    const templates = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({ success: true, templates });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST Crea nuovo template
router.post("/templates", authenticateFirebase, requireAdmin, async (req: any, res: Response): Promise<HttpHandlerResult> => {
  try {
    const { name, subject, body } = req.body;
    
    if (!name || !subject || !body) {
      return res.status(400).json({ 
        success: false, 
        error: "Nome, oggetto e corpo sono obbligatori" 
      });
    }
    
    const templateData = {
      name,
      subject,
      body,
      createdAt: nowRomeDate(),
      updatedAt: nowRomeDate()
    };
    
    const docRef = await db.collection("emailTemplates").add(templateData);
    
    res.json({ 
      success: true, 
      template: { id: docRef.id, ...templateData }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT Aggiorna template
router.put("/templates/:id", authenticateFirebase, requireAdmin, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { name, subject, body } = req.body;
    
    const updateData: any = { updatedAt: nowRomeDate() };
    if (name) updateData.name = name;
    if (subject) updateData.subject = subject;
    if (body) updateData.body = body;
    
    await db.collection("emailTemplates").doc(id).update(updateData);
    
    res.json({ success: true, message: "Template aggiornato" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE Elimina template
router.delete("/templates/:id", authenticateFirebase, requireAdmin, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    await db.collection("emailTemplates").doc(id).delete();
    res.json({ success: true, message: "Template eliminato" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// FILTER ROUTES
// ============================================================================

// GET Filtri disponibili (anni dinamici + tipi lavoro dai jobs)
router.get("/filters", authenticateFirebase, requireAdmin, async (req: any, res: Response) => {
  try {
    // CRITICAL: Use Luxon for correct timezone handling (server runs in UTC)
    const jobsSnapshot = await db.collection("jobs").select("dataEvento", "eventDate", "jobType").get();
    const yearsSet = new Set<number>();
    const jobTypesSet = new Set<string>();
    const currentYear = DateTime.now().setZone('Europe/Rome').year;

    jobsSnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Estrai anno da dataEvento o eventDate
      const dateField = data.dataEvento || data.eventDate;
      if (dateField) {
        let year: number | null = null;
        if (typeof dateField === 'string') {
          // Parse string date in Europe/Rome timezone
          const dt = DateTime.fromISO(dateField, { zone: 'Europe/Rome' });
          year = dt.isValid ? dt.year : null;
        } else if (dateField?.toDate) {
          // Parse Firestore Timestamp in Europe/Rome timezone
          const dt = DateTime.fromJSDate(dateField.toDate(), { zone: 'Europe/Rome' });
          year = dt.isValid ? dt.year : null;
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

    const endedCampaigns = await loadEndedBookingCampaigns();
    const campaignBookings = await loadBookingsByCampaignIds(endedCampaigns.map(campaign => campaign.id));
    const bookingCampaignFilters = endedCampaigns.map((campaign) => {
      const uniqueEmails = new Set<string>();
      for (const booking of campaignBookings.get(campaign.id) || []) {
        if (!isEligibleBookingForMarketing(booking.data.stato)) continue;
        const email = normalizeMarketingEmail(booking.data.cliente?.email);
        if (email) uniqueEmails.add(email);
      }

      return {
        value: `campagna_${campaign.id}`,
        label: campaign.label,
        endDate: campaign.endDate.toISODate(),
        recipientsCount: uniqueEmails.size,
      };
    });

    res.json({ 
      success: true, 
      filters: yearFilters,
      jobTypeFilters,
      bookingCampaignFilters,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/recipients", authenticateFirebase, requireAdmin, async (req: any, res: Response): Promise<HttpHandlerResult> => {
  try {
    const rawFilters = req.query.filters ?? req.query.filter ?? "all";
    const filters = parseMarketingRecipientFilters(rawFilters);
    const result = await getRecipientsForFilters(filters);

    res.json({
      success: true,
      recipients: result.recipients,
      total: result.recipients.length,
      uniqueTotal: result.recipients.length,
      duplicatesRemoved: result.duplicatesRemoved,
      unlinkedBookingContacts: result.unlinkedBookingContacts,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/send", authenticateFirebase, requireAdmin, async (req: any, res: Response): Promise<HttpHandlerResult> => {
  try {
    const { subject, body, recipients, senderId } = req.body;

    if (!subject || !body || !recipients || recipients.length === 0) {
      return res.status(400).json({ success: false, error: "Dati mancanti" });
    }

    const today = getTodayRome();
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
          lastUpdated: nowRomeDate(),
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
        createdAt: nowRomeDate(),
        lastHeartbeatAt: nowRomeDate(),
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

// POST Invio con split automatico (divide in job da 400 max)
router.post("/send-split", authenticateFirebase, requireAdmin, async (req: any, res: Response): Promise<HttpHandlerResult> => {
  try {
    const { subject, body, recipients, senderId } = req.body;

    if (!subject || !body || !recipients || recipients.length === 0) {
      return res.status(400).json({ success: false, error: "Dati mancanti" });
    }

    const today = getTodayRome();
    const quotaRef = db.collection("emailQuota").doc(today);
    
    // Dividi recipients in chunk da DAILY_LIMIT (deep copy per evitare reference issues)
    const chunks: any[][] = [];
    for (let i = 0; i < recipients.length; i += GMAIL_DAILY_LIMIT) {
      // Clone profondo di ogni recipient per evitare problemi di riferimento
      const chunk = recipients.slice(i, i + GMAIL_DAILY_LIMIT).map((r: any) => ({ ...r }));
      chunks.push(chunk);
    }
    
    // Verifica quota per il primo job
    const quotaDoc = await quotaRef.get();
    const quotaData = quotaDoc.exists ? quotaDoc.data() : {};
    const currentReserved = quotaData?.reserved || 0;
    const currentSent = quotaData?.sent || 0;
    const totalUsed = currentReserved + currentSent;
    const firstChunkSize = chunks[0].length;
    
    if (totalUsed + firstChunkSize > GMAIL_DAILY_LIMIT) {
      return res.status(400).json({ 
        success: false, 
        error: `Quota insufficiente per oggi. Usati: ${totalUsed}/${GMAIL_DAILY_LIMIT}. Riprova domani o seleziona meno destinatari.`
      });
    }
    
    const jobs: any[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const jobRef = db.collection("bulkEmailJobs").doc();
      const isFirst = i === 0;
      
      const job: BulkEmailJob = {
        id: jobRef.id,
        subject,
        body,
        recipients: chunk,
        totalRecipients: chunk.length,
        quotaReserved: isFirst ? chunk.length : 0,
        quotaConsumed: 0,
        quotaDate: today,
        sentCount: 0,
        failedCount: 0,
        status: isFirst ? "queued" : "scheduled",
        errors: [],
        createdAt: nowRomeDate(),
        lastHeartbeatAt: nowRomeDate(),
        createdBy: senderId || "admin",
        batchIndex: i + 1,
        totalBatches: chunks.length,
      };
      
      await jobRef.set(job);
      jobs.push({ id: jobRef.id, status: job.status, recipients: chunk.length, batchIndex: i + 1 });
    }
    
    // Riserva quota solo per il primo job
    if (firstChunkSize > 0) {
      await quotaRef.set({
        reserved: FieldValue.increment(firstChunkSize),
        date: today,
        lastUpdated: nowRomeDate(),
      }, { merge: true });
    }
    
    console.log(`📧 Creati ${jobs.length} job: ${jobs.map(j => `#${j.batchIndex}(${j.recipients})`).join(', ')}`);
    
    res.json({ 
      success: true, 
      jobs,
      message: jobs.length > 1 
        ? `Creati ${jobs.length} job: il primo parte subito, gli altri sono programmati`
        : "Job in coda"
    });
  } catch (error: any) {
    console.error("❌ Errore POST /send-split:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST Avvia job scheduled
router.post("/jobs/:jobId/start", authenticateFirebase, requireAdmin, async (req: any, res: Response): Promise<HttpHandlerResult> => {
  try {
    const { jobId } = req.params;
    const jobRef = db.collection("bulkEmailJobs").doc(jobId);
    const jobDoc = await jobRef.get();
    
    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: "Job non trovato" });
    }
    
    const job = jobDoc.data();
    
    if (job?.status !== "scheduled") {
      return res.status(400).json({ 
        success: false, 
        error: `Il job è già in stato "${job?.status}", non può essere avviato`
      });
    }
    
    const today = getTodayRome();
    const quotaRef = db.collection("emailQuota").doc(today);
    const recipientCount = job?.totalRecipients || 0;
    
    // Verifica quota
    const quotaDoc = await quotaRef.get();
    const quotaData = quotaDoc.exists ? quotaDoc.data() : {};
    const currentReserved = quotaData?.reserved || 0;
    const currentSent = quotaData?.sent || 0;
    const totalUsed = currentReserved + currentSent;
    
    if (totalUsed + recipientCount > GMAIL_DAILY_LIMIT) {
      return res.status(400).json({ 
        success: false, 
        error: `Quota insufficiente. Usati: ${totalUsed}/${GMAIL_DAILY_LIMIT}. Riprova domani.`
      });
    }
    
    // Riserva quota e cambia stato
    await db.runTransaction(async (transaction) => {
      transaction.update(quotaRef, {
        reserved: FieldValue.increment(recipientCount),
        date: today,
        lastUpdated: nowRomeDate(),
      });
      
      transaction.update(jobRef, {
        status: "queued",
        quotaReserved: recipientCount,
        quotaDate: today,
        lastHeartbeatAt: nowRomeDate(),
      });
    });
    
    console.log(`🚀 Job ${jobId} avviato manualmente (${recipientCount} email)`);
    
    res.json({ 
      success: true, 
      jobId,
      message: `Job avviato con ${recipientCount} email`
    });
  } catch (error: any) {
    console.error("❌ Errore POST /jobs/:jobId/start:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/jobs", authenticateFirebase, requireAdmin, async (req: any, res: Response) => {
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

router.get("/jobs/:jobId", authenticateFirebase, requireAdmin, async (req: any, res: Response): Promise<HttpHandlerResult> => {
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

router.post("/jobs/:jobId/retry-failed", authenticateFirebase, requireAdmin, async (req: any, res: Response): Promise<HttpHandlerResult> => {
  try {
    const { jobId } = req.params;
    
    const originalJobDoc = await db.collection("bulkEmailJobs").doc(jobId).get();
    if (!originalJobDoc.exists) {
      return res.status(404).json({ success: false, error: "Job non trovato" });
    }
    
    const originalJob = originalJobDoc.data();
    if (originalJob?.provider === "resend") {
      if (originalJob.status !== "failed") {
        return res.status(409).json({
          success: false,
          error: "Puoi riprendere una campagna Resend solo dopo un errore.",
        });
      }

      const originalJobRef = db.collection("bulkEmailJobs").doc(jobId);
      await db.runTransaction(async (transaction) => {
        const currentDoc = await transaction.get(originalJobRef);
        const currentJob = currentDoc.data();
        if (!currentDoc.exists || currentJob?.provider !== "resend") {
          throw new Error("La campagna Resend non è più disponibile.");
        }
        if (currentJob.status !== "failed") {
          throw new Error("La campagna è già stata ripresa o è in esecuzione.");
        }

        transaction.update(originalJobRef, {
          status: "queued",
          failedCount: 0,
          errors: [],
          completedAt: FieldValue.delete(),
          progressStage: "Ripresa sicura della campagna Resend",
          lastHeartbeatAt: nowRomeDate(),
        });
      });

      return res.json({
        success: true,
        jobId,
        recipientsCount: originalJob.totalRecipients || 0,
        resumed: true,
        message: "Campagna Resend rimessa in coda; lo stato esistente verrà verificato prima di qualsiasi invio.",
      });
    }
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
    
    const today = getTodayRome();
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
          lastUpdated: nowRomeDate(),
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
        createdAt: nowRomeDate(),
        lastHeartbeatAt: nowRomeDate(),
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
        <p style="margin: 5px 0; font-weight: 600;">Image Studio Fotografico</p>
        <p style="margin: 5px 0;">Email: image.studio.fotografico@gmail.com</p>
        <p style="margin: 5px 0;">Tel: +39 334 7103142</p>
      </div>
    </div>
  `;

  await sendGmailEmail(recipient.email, subject, emailHTML);
}

export default router;
