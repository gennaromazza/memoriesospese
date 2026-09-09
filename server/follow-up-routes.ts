import { Router, type Request, type Response } from "express";
import { db, FieldValue, Timestamp } from "./firebase-admin.js";
import { authenticateFirebase } from "./email-routes.js";
import { sendGmailEmail } from "./email-routes.js";
import type {
  FollowUpDashboardItem,
  FollowUpDashboardResponse,
  FollowUpEventType,
  FollowUpMode,
  FollowUpPersistenceType,
  FollowUpSequence,
  FollowUpSequenceStep,
  FollowUpStatus,
  FollowUpTemplate,
} from "../shared/follow-up-types.js";

const router = Router();

const DEFAULT_SEQUENCE_STEPS: FollowUpSequenceStep[] = [
  { step: 1, delayDays: 3, templateId: "quote-followup-step-1", enabled: true },
  { step: 2, delayDays: 10, templateId: "quote-followup-step-2", enabled: true },
  { step: 3, delayDays: 25, templateId: "quote-followup-step-3", enabled: true },
];

const DEFAULT_TEMPLATES: FollowUpTemplate[] = [
  {
    id: "quote-followup-step-1",
    name: "Primo promemoria",
    serviceType: "*",
    step: 1,
    active: true,
    subject: "Un piccolo promemoria per il tuo preventivo",
    bodyHtml:
      "<p>Ciao [nome cliente],</p><p>ti scrivo per sapere se hai avuto modo di dare un'occhiata al preventivo per [nome coppia].</p><p>Se vuoi, puoi rivederlo qui:</p>",
    cta: "quote",
    ctaLabel: "Rivedi il preventivo",
    version: 1,
  },
  {
    id: "quote-followup-step-2",
    name: "Secondo promemoria",
    serviceType: "*",
    step: 2,
    active: true,
    subject: "Hai bisogno di un chiarimento sul preventivo?",
    bodyHtml:
      "<p>Ciao [nome cliente],</p><p>se hai dubbi o vuoi modificare qualche dettaglio di [nome coppia], sono qui per aiutarti.</p><p>Puoi ripartire dal preventivo:</p>",
    cta: "quote",
    ctaLabel: "Apri il preventivo",
    version: 1,
  },
  {
    id: "quote-followup-step-3",
    name: "Ultimo promemoria",
    serviceType: "*",
    step: 3,
    active: true,
    subject: "Resto a disposizione per il tuo preventivo",
    bodyHtml:
      "<p>Ciao [nome cliente],</p><p>chiudo qui i promemoria automatici per [nome coppia]. Se il progetto è ancora attuale, puoi scrivermi quando vuoi.</p><p>Il preventivo resta disponibile qui:</p>",
    cta: "quote",
    ctaLabel: "Rivedi il preventivo",
    version: 1,
  },
];

const DEFAULT_SEQUENCE: FollowUpSequence = {
  id: "default",
  name: "Preventivi rapidi",
  serviceType: "*",
  enabled: true,
  mode: "automatic",
  steps: DEFAULT_SEQUENCE_STEPS,
  dormantAfterStep: 3,
  reactivationDaysBeforeEvent: 60,
};

const STALE_SENDING_LOCK_MS = 15 * 60 * 1000;
const RECOVERY_LEASE_MS = 5 * 60 * 1000;

type FirestoreData = Record<string, any>;

function asDate(value: any): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?._seconds === "number") {
    return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function iso(value: any): string | undefined {
  return asDate(value)?.toISOString();
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function quoteTotal(quote: FirestoreData): number {
  if (quote.type === "variabile" && Number(quote.totaleSelezionato) > 0) {
    return Number(quote.totaleSelezionato);
  }
  return Number(
    quote.totalAfterDiscount ??
      quote.totaleSelezionato ??
      quote.totaleBase ??
      quote.totalBeforeDiscount ??
      0,
  );
}

function baseUrl(): string {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  return domain ? `https://${domain}` : "http://localhost:5000";
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function getFollowUpOrigin(
  quote: FirestoreData,
  job?: FirestoreData,
): { date: Date; source: "quote_sent_at" | "quick_quote_created_at_legacy" } | undefined {
  const explicitSentAt = asDate(quote.emailSentAt || quote.sentAt);
  if (explicitSentAt) return { date: explicitSentAt, source: "quote_sent_at" };

  // I vecchi Preventivi Rapidi inviavano il link subito dopo la creazione
  // della quote, ma non persistevano sentAt/emailSentAt. La provenienza e le
  // clausole del contratto rendono riconoscibile questo percorso legacy.
  const isQuickQuote = quote.createdBy === "preventivo-rapido" || job?.provenance === "preventivo-rapido";
  if (
    isQuickQuote &&
    ["inviato", "visionato"].includes(quote.status) &&
    quote.publicToken &&
    Array.isArray(quote.contractClauses)
  ) {
    const createdAt = asDate(quote.createdAt);
    if (createdAt) return { date: createdAt, source: "quick_quote_created_at_legacy" };
  }
  return undefined;
}

function normalizeStepList(value: any): FollowUpSequenceStep[] {
  if (!Array.isArray(value)) return DEFAULT_SEQUENCE_STEPS;
  return value
    .map((step: any, index: number) => ({
      step: Number(step.step) || index + 1,
      delayDays: Math.max(0, Number(step.delayDays) || 0),
      templateId: String(step.templateId || `quote-followup-step-${index + 1}`),
      enabled: step.enabled !== false,
    }))
    .sort((a, b) => a.step - b.step);
}

async function getSequences(): Promise<FollowUpSequence[]> {
  const snapshot = await db.collection("followUpSequences").get();
  const stored = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as FollowUpSequence[];
  return stored.length ? stored : [DEFAULT_SEQUENCE];
}

async function getSequence(serviceType: string): Promise<FollowUpSequence> {
  const exact = await db.collection("followUpSequences").doc(serviceType).get();
  if (exact.exists) {
    const data = exact.data() || {};
    return {
      ...DEFAULT_SEQUENCE,
      ...data,
      id: exact.id,
      serviceType,
      steps: normalizeStepList(data.steps),
    };
  }
  const fallback = await db.collection("followUpSequences").doc("default").get();
  if (fallback.exists) {
    const data = fallback.data() || {};
    return {
      ...DEFAULT_SEQUENCE,
      ...data,
      id: fallback.id,
      steps: normalizeStepList(data.steps),
    };
  }
  return { ...DEFAULT_SEQUENCE, steps: DEFAULT_SEQUENCE_STEPS };
}

async function getTemplates(): Promise<FollowUpTemplate[]> {
  const snapshot = await db.collection("followUpTemplates").get();
  const stored = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as FollowUpTemplate[];
  return stored.length ? stored : DEFAULT_TEMPLATES;
}

async function getTemplate(id: string, serviceType: string, step: number): Promise<FollowUpTemplate | undefined> {
  const direct = await db.collection("followUpTemplates").doc(id).get();
  if (direct.exists) return { id: direct.id, ...direct.data() } as FollowUpTemplate;
  const templates = await getTemplates();
  return templates.find((template) =>
    template.active &&
    template.step === step &&
    (template.serviceType === serviceType || template.serviceType === "*"),
  );
}

function renderTemplate(
  template: FollowUpTemplate,
  data: {
    clientName: string;
    coupleName: string;
    eventDate: string;
    quoteTotal: string;
    quoteUrl: string;
    trackingOpenUrl: string;
  },
): { subject: string; html: string } {
  const replacements: Record<string, string> = {
    "[nome cliente]": escapeHtml(data.clientName),
    "[nome coppia]": escapeHtml(data.coupleName),
    "[data evento]": escapeHtml(data.eventDate || "da definire"),
    "[importo preventivo]": escapeHtml(data.quoteTotal),
    "[url preventivo]": data.quoteUrl,
    "[url configuratore]": data.quoteUrl,
  };
  const replace = (text: string) =>
    Object.entries(replacements).reduce(
      (result, [key, value]) => result.split(key).join(value),
      text,
    );
  const cta =
    template.cta === "none"
      ? ""
      : `<p style="margin:24px 0"><a href="${template.cta === "custom" ? escapeHtml(template.customUrl) : data.quoteUrl}" style="display:inline-block;background:#263b35;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(template.ctaLabel || "Apri il preventivo")}</a></p>`;
  return {
    subject: replace(template.subject),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#263b35">${replace(template.bodyHtml)}${cta}<p style="color:#6b7280;font-size:13px">Se hai già risposto o non desideri altri promemoria, puoi ignorare questa email: la sequenza si fermerà appena registreremo il contatto.</p><img src="${data.trackingOpenUrl}" width="1" height="1" alt="" style="display:none" /></div>`,
  };
}

async function appendFollowUpEvent(
  type: FollowUpEventType,
  quoteId: string,
  jobId: string | undefined,
  metadata: FirestoreData = {},
  step?: number,
): Promise<void> {
  await db.collection("followUpEvents").add({
    quoteId,
    ...(jobId ? { jobId } : {}),
    type,
    ...(step ? { step } : {}),
    metadata,
    occurredAt: FieldValue.serverTimestamp(),
  });
}

async function recordPostSendPersistenceFailure(
  context: any,
  step: number,
  persistence: FollowUpPersistenceType,
  failedEventType: "followup_sent" | "dormant",
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  try {
    await appendFollowUpEvent(
      "followup_persistence_failed",
      context.quote.id,
      context.quote.jobId,
      { persistence, failedEventType, error: message },
      step,
    );
  } catch (reportingError) {
    console.error(
      `[FollowUp] Impossibile registrare l'avviso di persistenza post-invio per quote ${context.quote.id}:`,
      reportingError,
    );
  }
}
export async function recordFollowUpEvent(
  quoteId: string,
  type: FollowUpEventType,
  metadata: FirestoreData = {},
): Promise<void> {
  const quoteDoc = await db.collection("quotes").doc(quoteId).get();
  const quoteData = quoteDoc.data() || {};
  await appendFollowUpEvent(type, quoteId, quoteData.jobId, metadata);
  if (type === "quote_signed" || type === "booking_created") {
    const stateRef = db.collection("quoteFollowUps").doc(quoteId);
    const stateDoc = await stateRef.get();
    if (stateDoc.exists) {
      await stateRef.set({
        quoteId,
        jobId: quoteData.jobId || stateDoc.data()?.jobId,
        status: type === "quote_signed" ? "converted" : "completed",
        signedAt: type === "quote_signed" ? FieldValue.serverTimestamp() : (stateDoc.data()?.signedAt || null),
        signedValue: Number(metadata.value || stateDoc.data()?.signedValue || 0),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
}

function eventDateLabel(value: any): string {
  const date = asDate(value);
  return date
    ? date.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })
    : "";
}

async function hasBooking(jobId: string): Promise<boolean> {
  const snapshot = await db.collection("bookings").where("jobId", "==", jobId).limit(10).get();
  return snapshot.docs.some((doc) => {
    const status = doc.data()?.stato;
    return status !== "annullata" && status !== "rifiutata";
  });
}

async function isLatestQuote(quoteId: string, jobId: string, sentAt: Date, quotesByJob?: Map<string, FirestoreData[]>): Promise<boolean> {
  const candidates = quotesByJob?.get(jobId);
  if (candidates) {
    return !candidates.some((candidate) =>
      candidate.id !== quoteId &&
      getFollowUpOrigin(candidate)?.date.getTime()! > sentAt.getTime(),
    );
  }
  const snapshot = await db.collection("quotes").where("jobId", "==", jobId).limit(50).get();
  return !snapshot.docs.some((doc) => {
    const data = doc.data();
    return doc.id !== quoteId &&
      getFollowUpOrigin(data)?.date.getTime()! > sentAt.getTime();
  });
}

async function getClientData(quote: FirestoreData, job: FirestoreData): Promise<FirestoreData | undefined> {
  const clientId = job?.clientiIds?.[0] || quote.clienteId;
  if (clientId) {
    const clientDoc = await db.collection("clienti").doc(clientId).get();
    if (clientDoc.exists) return { id: clientDoc.id, ...clientDoc.data() };
  }
  return quote.clientiInfo?.[0];
}

async function getEligibleContext(
  quoteDoc: any,
  quotesByJob?: Map<string, FirestoreData[]>,
) {
  const quote = { id: quoteDoc.id, ...quoteDoc.data() } as FirestoreData;
  if (!quote.jobId || !["inviato", "visionato"].includes(quote.status)) return null;
  if (quote.signature || quote.status === "firmato") return null;
  const jobDoc = await db.collection("jobs").doc(quote.jobId).get();
  if (!jobDoc.exists) return null;
  const job = jobDoc.data() || {};
  const origin = getFollowUpOrigin(quote, job);
  if (!origin) return null;
  if (job.status !== "lead" || job.deletedAt) return null;
  const eventDate = asDate(job.eventDate);
  if (eventDate && eventDate.getTime() < Date.now()) return null;
  if (!(await isLatestQuote(quote.id, quote.jobId, origin.date, quotesByJob))) return null;
  if (await hasBooking(quote.jobId)) return null;
  const client = await getClientData(quote, job);
  const email = String(client?.email || quote.sentTo || "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  return { quote, job, client: client || {}, email, sentAt: origin.date, sentAtSource: origin.source, eventDate };
}

async function ensureState(context: any, sequence: FollowUpSequence): Promise<FirestoreData> {
  const ref = db.collection("quoteFollowUps").doc(context.quote.id);
  let created = false;
  let state: FirestoreData | undefined;
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      state = { id: ref.id, ...existing.data() };
      return;
    }
    const firstStep = sequence.steps.find((step) => step.enabled);
    const initialState = {
      quoteId: context.quote.id,
      jobId: context.quote.jobId,
      clienteId: context.job.clientiIds?.[0] || context.quote.clienteId,
      serviceType: context.job.jobType || "default",
      status: sequence.mode === "automatic" ? "active" : "pending_approval",
      mode: sequence.mode,
      sequenceId: sequence.id,
      sentSteps: [],
      nextStep: firstStep?.step,
      nextDueAt: firstStep ? Timestamp.fromDate(addDays(context.sentAt, firstStep.delayDays)) : null,
      quoteSentAt: Timestamp.fromDate(context.sentAt),
      quoteSentAtSource: context.sentAtSource || "quote_sent_at",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(ref, initialState);
    state = { id: ref.id, ...initialState, createdAt: new Date(), updatedAt: new Date() };
    created = true;
  });
  if (created) {
    await appendFollowUpEvent("quote_sent", context.quote.id, context.quote.jobId, {
      source: "follow-up-sync",
      sentAtSource: context.sentAtSource || "quote_sent_at",
    });
  }
  return state!;
}

type StaleLockRecovery = "none" | "recent" | "cleared" | "finalized" | "pending";
type FollowUpRunOptions = {
  quoteId?: string;
  force?: boolean;
};

async function findAcceptedFollowUpEmail(
  quoteId: string,
  step: number,
  lockId: string,
): Promise<{ accepted?: FirestoreData; ambiguous: boolean }> {
  const snapshot = await db
    .collection("emailLogs")
    .where("relatedDocId", "==", quoteId)
    .where("type", "==", "quote_followup")
    .get();
  const logs = snapshot.docs.map((doc) => doc.data());
  return {
    accepted: logs
      .find((data) => data.status === "sent" && data.followUpStep === step && data.followUpLockId === lockId),
    ambiguous: logs.some((data) => data.followUpStep === step),
  };
}

async function appendRecoveryEvent(
  type: Extract<FollowUpEventType, `followup_recovery_${string}`>,
  context: any,
  metadata: FirestoreData,
  step: number,
): Promise<void> {
  try {
    await appendFollowUpEvent(type, context.quote.id, context.quote.jobId, metadata, step);
  } catch (error) {
    console.error(`[FollowUp] Evento recovery non registrato per quote ${context.quote.id}:`, error);
  }
}

async function finalizeRecoveredSend(
  stateRef: any,
  context: any,
  sequence: FollowUpSequence,
  lock: FirestoreData,
): Promise<void> {
  const step = Number(lock.step);
  const next = sequence.steps.find((item) => item.enabled && item.step > step);
  await stateRef.update({
    sendingLock: FieldValue.delete(),
    recoveryPending: FieldValue.delete(),
    sentSteps: FieldValue.arrayUnion(step),
    lastSentAt: FieldValue.serverTimestamp(),
    nextStep: next?.step ?? null,
    nextDueAt: next ? Timestamp.fromDate(addDays(context.sentAt, next.delayDays)) : null,
    status: next ? "active" : "dormant",
    lastRecoveryAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await appendRecoveryEvent(
    "followup_recovery_finalized",
    context,
    { lockId: lock.id, reason: "gmail-accepted", source: "stale-lock-recovery" },
    step,
  );
}

async function recoverStaleSendingLock(
  stateRef: any,
  context: any,
  sequence: FollowUpSequence,
  state: FirestoreData,
): Promise<StaleLockRecovery> {
  const lock = state.sendingLock;
  if (!lock?.id || !lock.step) return "none";
  const lockedAt = asDate(lock.at);
  if (!lockedAt || Date.now() - lockedAt.getTime() < STALE_SENDING_LOCK_MS) return "recent";

  const recoveryId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let claimed = false;
  await db.runTransaction(async (transaction) => {
    const latest = await transaction.get(stateRef);
    const latestData = latest.data() || {};
    const latestLock = latestData.sendingLock;
    if (!latest.exists || latestLock?.id !== lock.id) return;
    const latestLockedAt = asDate(latestLock.at);
    if (!latestLockedAt || Date.now() - latestLockedAt.getTime() < STALE_SENDING_LOCK_MS) return;
    const recoveryAt = asDate(latestLock.recoveryAt);
    if (recoveryAt && Date.now() - recoveryAt.getTime() < RECOVERY_LEASE_MS) return;
    transaction.update(stateRef, {
      sendingLock: { ...latestLock, recoveryId, recoveryAt: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
    });
    claimed = true;
  });
  if (!claimed) return "recent";

  const emailEvidence = await findAcceptedFollowUpEmail(context.quote.id, Number(lock.step), lock.id);
  if (emailEvidence.accepted) {
    await finalizeRecoveredSend(stateRef, context, sequence, lock);
    return "finalized";
  }
  if (emailEvidence.ambiguous) {
    const latest = await stateRef.get();
    const latestLock = latest.data()?.sendingLock;
    if (latestLock?.recoveryId !== recoveryId) return "recent";
    await stateRef.update({
      sendingLock: FieldValue.delete(),
      status: "suspended",
      recoveryPending: {
        lockId: lock.id,
        step: Number(lock.step),
        reason: "gmail-log-without-lock-marker",
        at: FieldValue.serverTimestamp(),
      },
      lastRecoveryAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await appendRecoveryEvent(
      "followup_recovery_pending",
      context,
      { lockId: lock.id, reason: "gmail-log-without-lock-marker", source: "stale-lock-recovery" },
      Number(lock.step),
    );
    return "pending";
  }

  // No accepted Gmail log means the process stopped before Gmail confirmed the
  // message. Clear only this exact lock, then let the normal path retry it.
  const latest = await stateRef.get();
  const latestLock = latest.data()?.sendingLock;
  if (latestLock?.recoveryId !== recoveryId) return "recent";
  await stateRef.update({
    sendingLock: FieldValue.delete(),
    lastRecoveryAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await appendRecoveryEvent(
    "followup_recovery_cleared",
    context,
    { lockId: lock.id, reason: "no-gmail-acceptance-log", source: "stale-lock-recovery" },
    Number(lock.step),
  );
  return "cleared";
}

async function processQuote(
  context: any,
  quotesByJob?: Map<string, FirestoreData[]>,
  options: FollowUpRunOptions = {},
): Promise<"sent" | "skipped" | "error"> {
  const sequence = await getSequence(context.job.jobType || "default");
  let state = await ensureState(context, sequence);
  const stateRef = db.collection("quoteFollowUps").doc(context.quote.id);
  const recovered = await recoverStaleSendingLock(stateRef, context, sequence, state);
  if (recovered === "recent" || recovered === "finalized" || recovered === "pending") return "skipped";
  if (recovered === "cleared") {
    const refreshed = await stateRef.get();
    state = { id: stateRef.id, ...(refreshed.data() || {}) };
  }
  const now = new Date();
  const currentStatus = String(state.status) as FollowUpStatus;
  if (!sequence.enabled || sequence.mode !== "automatic") return "skipped";
  if (["completed", "converted", "not_interested", "superseded", "suspended"].includes(currentStatus)) return "skipped";
  if (state.snoozedUntil && asDate(state.snoozedUntil)?.getTime()! > now.getTime()) return "skipped";
  if (state.nextDueAt && asDate(state.nextDueAt)?.getTime()! > now.getTime() && !options.force) return "skipped";
  const step = sequence.steps.find((item) => item.enabled && !state.sentSteps?.includes(item.step));
  if (!step) {
    if (currentStatus !== "dormant") {
      await stateRef.update({ status: "dormant", nextStep: null, updatedAt: FieldValue.serverTimestamp() });
      await appendFollowUpEvent("dormant", context.quote.id, context.quote.jobId, { lastStep: state.sentSteps?.at(-1) });
    }
    return "skipped";
  }
  // Una forzatura manuale serve solo a provare il primo invio: non deve
  // trasformarsi in un modo per anticipare il secondo o terzo step.
  if (options.force && state.sentSteps?.length) return "skipped";
  const lockId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let locked = false;
  await db.runTransaction(async (transaction) => {
    const latest = await transaction.get(stateRef);
    const data = latest.data() || {};
    if (
      !latest.exists ||
      data.status !== currentStatus ||
      data.sendingLock ||
      (data.sentSteps || []).includes(step.step) ||
      (data.nextDueAt && asDate(data.nextDueAt)?.getTime()! > now.getTime())
    ) return;
    transaction.update(stateRef, {
      sendingLock: { id: lockId, step: step.step, at: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
    });
    locked = true;
  });
  if (!locked) return "skipped";

  let rendered: { subject: string; html: string };
  let templateId = step.templateId;
  try {
    const template = await getTemplate(step.templateId, context.job.jobType || "default", step.step);
    if (!template?.active) throw new Error(`Template follow-up mancante o inattivo per step ${step.step}`);
    templateId = template.id;
    const quoteUrl = `${baseUrl()}/quote/${context.quote.publicToken}`;
    const clientName = [context.client.nome, context.client.cognome].filter(Boolean).join(" ") || "Cliente";
    rendered = renderTemplate(template, {
      clientName,
      coupleName: context.job.nomeEvento || "il tuo evento",
      eventDate: eventDateLabel(context.eventDate),
      quoteTotal: `€${quoteTotal(context.quote).toFixed(2)}`,
      quoteUrl: `${baseUrl()}/api/follow-ups/track/${context.quote.id}/clicked?token=${encodeURIComponent(context.quote.publicToken)}&redirect=${encodeURIComponent(quoteUrl)}`,
      trackingOpenUrl: `${baseUrl()}/api/follow-ups/track/${context.quote.id}/opened?token=${encodeURIComponent(context.quote.publicToken)}`,
    });
  } catch (error) {
    await stateRef.update({
      sendingLock: FieldValue.delete(),
      lastError: error instanceof Error ? error.message : String(error),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.error(`[FollowUp] Invio fallito per quote ${context.quote.id}:`, error);
    return "error";
  }

  try {
    await appendFollowUpEvent("followup_due", context.quote.id, context.quote.jobId, {}, step.step);
  } catch (error) {
    console.error(`[FollowUp] Evento due non registrato per quote ${context.quote.id}:`, error);
  }

  try {
    await sendGmailEmail(context.email, rendered.subject, rendered.html, undefined, {
      type: "quote_followup",
      relatedDocId: context.quote.id,
      relatedDocType: "quote",
      clientName: [context.client.nome, context.client.cognome].filter(Boolean).join(" ") || "Cliente",
      followUpStep: step.step,
      followUpLockId: lockId,
    });
  } catch (error) {
    await stateRef.update({
      sendingLock: FieldValue.delete(),
      lastError: error instanceof Error ? error.message : String(error),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.error(`[FollowUp] Invio fallito per quote ${context.quote.id}:`, error);
    return "error";
  }

  const next = sequence.steps.find((item) => item.enabled && item.step > step.step);
  try {
    await stateRef.update({
      sendingLock: FieldValue.delete(),
      sentSteps: FieldValue.arrayUnion(step.step),
      lastSentAt: FieldValue.serverTimestamp(),
      nextStep: next?.step ?? null,
      nextDueAt: next ? Timestamp.fromDate(addDays(context.sentAt, next.delayDays)) : null,
      status: next ? "active" : "dormant",
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // Gmail has already accepted the message. Keep the lock if the state write
    // fails: releasing it could make the next scheduler tick send it again.
    console.error(`[FollowUp] Stato post-invio non registrato per quote ${context.quote.id}:`, error);
    await recordPostSendPersistenceFailure(context, step.step, "state", "followup_sent", error);
  }

  try {
    await appendFollowUpEvent("followup_sent", context.quote.id, context.quote.jobId, {
      subject: rendered.subject,
      templateId,
    }, step.step);
  } catch (error) {
    console.error(`[FollowUp] Audit invio post-invio non registrato per quote ${context.quote.id}:`, error);
    await recordPostSendPersistenceFailure(context, step.step, "audit", "followup_sent", error);
  }

  if (!next) {
    try {
      await appendFollowUpEvent("dormant", context.quote.id, context.quote.jobId, { lastStep: step.step }, step.step);
    } catch (error) {
      console.error(`[FollowUp] Audit chiusura sequenza non registrato per quote ${context.quote.id}:`, error);
      await recordPostSendPersistenceFailure(context, step.step, "audit", "dormant", error);
    }
  }
  return "sent";
}

export async function runFollowUpCheck(
  options: FollowUpRunOptions = {},
): Promise<{ checked: number; sent: number; skipped: number; errors: string[] }> {
  const result = { checked: 0, sent: 0, skipped: 0, errors: [] as string[] };
  const quoteSnapshot = await db.collection("quotes").limit(500).get();
  const quotesByJob = new Map<string, FirestoreData[]>();
  for (const doc of quoteSnapshot.docs) {
    const data = { id: doc.id, ...doc.data() } as FirestoreData;
    if (data.jobId) quotesByJob.set(data.jobId, [...(quotesByJob.get(data.jobId) || []), data]);
  }
  for (const quoteDoc of quoteSnapshot.docs) {
    if (options.quoteId && quoteDoc.id !== options.quoteId) continue;
    try {
      const context = await getEligibleContext(quoteDoc, quotesByJob);
      if (!context) continue;
      result.checked++;
      const outcome = await processQuote(context, quotesByJob, options);
      if (outcome === "sent") result.sent++;
      else if (outcome === "skipped") result.skipped++;
      else result.errors.push(quoteDoc.id);
    } catch (error) {
      result.errors.push(quoteDoc.id);
      console.error(`[FollowUp] Errore quote ${quoteDoc.id}:`, error);
    }
  }
  return result;
}

async function syncExistingFollowUpStates(): Promise<void> {
  const quoteSnapshot = await db.collection("quotes").limit(500).get();
  const quotesByJob = new Map<string, FirestoreData[]>();
  for (const doc of quoteSnapshot.docs) {
    const data = { id: doc.id, ...doc.data() } as FirestoreData;
    if (data.jobId) quotesByJob.set(data.jobId, [...(quotesByJob.get(data.jobId) || []), data]);
  }

  const sequences = new Map<string, FollowUpSequence>();
  for (const quoteDoc of quoteSnapshot.docs) {
    try {
      const context = await getEligibleContext(quoteDoc, quotesByJob);
      if (!context) continue;
      const serviceType = context.job.jobType || "default";
      let sequence = sequences.get(serviceType);
      if (!sequence) {
        sequence = await getSequence(serviceType);
        sequences.set(serviceType, sequence);
      }
      await ensureState(context, sequence);
    } catch (error) {
      console.error(`[FollowUp] Impossibile inizializzare il preventivo ${quoteDoc.id}:`, error);
    }
  }
}

function serializeState(data: FirestoreData): FirestoreData {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, key.endsWith("At") || key === "quoteSentAt" || key === "nextDueAt" || key === "snoozedUntil" ? iso(value) : value]),
  );
}

export async function getFollowUpDashboard(): Promise<FollowUpDashboardResponse> {
  // Acquisisce anche i preventivi inviati prima dell'attivazione del Centro,
  // senza eseguire gli invii: sarà lo scheduler, o il pulsante "Esegui
  // controllo", a processare le scadenze.
  await syncExistingFollowUpStates();
  const [stateSnapshot, eventSnapshot, sequences, templates] = await Promise.all([
    db.collection("quoteFollowUps").limit(500).get(),
    db.collection("followUpEvents").limit(1000).get(),
    getSequences(),
    getTemplates(),
  ]);
  const items: FollowUpDashboardItem[] = [];
  for (const stateDoc of stateSnapshot.docs) {
    const state = stateDoc.data();
    const [quoteDoc, jobDoc] = await Promise.all([
      db.collection("quotes").doc(stateDoc.id).get(),
      db.collection("jobs").doc(state.jobId).get(),
    ]);
    const quote = quoteDoc.data() || {};
    const job = jobDoc.data() || {};
    const client = await getClientData(quote, job);
    const item = serializeState({ id: stateDoc.id, ...state }) as FollowUpDashboardItem;
    item.clientName = [client?.nome, client?.cognome].filter(Boolean).join(" ") || "Cliente";
    item.email = client?.email || quote.sentTo;
    item.eventName = job.nomeEvento;
    item.eventDate = iso(job.eventDate);
    item.quoteTotal = quoteTotal(quote);
    item.quoteStatus = quote.status;
    if (state.nextDueAt && asDate(state.nextDueAt)?.getTime()! <= Date.now()) item.reason = "Follow-up in scadenza";
    items.push(item);
  }
  const stats = {
    active: items.filter((item) => item.status === "active").length,
    due: items.filter((item) => item.reason).length,
    snoozed: items.filter((item) => item.status === "snoozed").length,
    dormant: items.filter((item) => item.status === "dormant").length,
    suspended: items.filter((item) => item.status === "suspended").length,
    converted: items.filter((item) => item.status === "converted").length,
    notInterested: items.filter((item) => item.status === "not_interested").length,
    sentByStep: {} as Record<string, number>,
    assistedValue: 0,
  };
  for (const item of items) {
    for (const step of item.sentSteps || []) stats.sentByStep[String(step)] = (stats.sentByStep[String(step)] || 0) + 1;
  }
  const signedQuoteIds = new Set(
    eventSnapshot.docs
      .filter((doc) => doc.data().type === "quote_signed")
      .map((doc) => doc.data().quoteId),
  );
  const persistenceFailures = eventSnapshot.docs
    .filter((doc) => doc.data().type === "followup_persistence_failed")
    .map((doc) => {
      const data = doc.data();
      const metadata = data.metadata || {};
      return {
        id: doc.id,
        quoteId: data.quoteId,
        ...(data.jobId ? { jobId: data.jobId } : {}),
        step: Number(data.step),
        persistence: metadata.persistence,
        failedEventType: metadata.failedEventType,
        error: String(metadata.error || "Errore di persistenza non specificato"),
        occurredAt: iso(data.occurredAt) || "",
      };
    })
    .filter((failure) => failure.quoteId && failure.step > 0 && (failure.persistence === "state" || failure.persistence === "audit"))
    .sort((a, b) => (b.occurredAt || "").localeCompare(a.occurredAt || ""));
  for (const item of items) {
    if (signedQuoteIds.has(item.quoteId) && (item.sentSteps || []).length > 0) {
      stats.assistedValue += item.quoteTotal || 0;
    }
  }
  return { items, stats, persistenceFailures, sequences, templates };
}

router.get("/dashboard", authenticateFirebase, async (_req, res) => {
  try {
    res.json(await getFollowUpDashboard());
  } catch (error) {
    console.error("[FollowUp] Dashboard error:", error);
    res.status(500).json({ error: "Impossibile caricare il Centro Follow-up" });
  }
});

router.post("/run", authenticateFirebase, async (_req, res) => {
  try {
    res.json({ success: true, result: await runFollowUpCheck() });
  } catch (error) {
    res.status(500).json({ error: "Impossibile eseguire il controllo follow-up" });
  }
});

async function updateStateAction(
  quoteId: string,
  status: FollowUpStatus,
  type: FollowUpEventType,
  metadata: FirestoreData = {},
) {
  const ref = db.collection("quoteFollowUps").doc(quoteId);
  const state = await ref.get();
  if (!state.exists) throw new Error("Follow-up non trovato");
  await ref.update({
    status,
    ...(type === "manual_contact" || type === "customer_replied" ? { lastCustomerContactAt: FieldValue.serverTimestamp() } : {}),
    ...(status === "snoozed" ? { snoozedUntil: Timestamp.fromDate(addDays(new Date(), Number(metadata.days) || 7)) } : {}),
    pauseReason: metadata.reason || type,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await appendFollowUpEvent(type, quoteId, state.data()?.jobId, metadata);
}

router.post("/:quoteId/snooze", authenticateFirebase, async (req, res) => {
  try {
    await updateStateAction(req.params.quoteId, "snoozed", "snoozed", { days: Math.min(90, Math.max(1, Number(req.body?.days) || 7)) });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Operazione non riuscita" });
  }
});

router.post("/:quoteId/resume", authenticateFirebase, async (req, res) => {
  try {
    const ref = db.collection("quoteFollowUps").doc(req.params.quoteId);
    await ref.update({ status: "active", snoozedUntil: FieldValue.delete(), pauseReason: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    await appendFollowUpEvent("reactivated", req.params.quoteId, (await ref.get()).data()?.jobId, { source: "admin" });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Operazione non riuscita" });
  }
});

router.post("/:quoteId/contact", authenticateFirebase, async (req, res) => {
  try {
    await updateStateAction(req.params.quoteId, "suspended", "manual_contact", { channel: req.body?.channel || "manual", note: req.body?.note || "" });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Operazione non riuscita" });
  }
});

router.post("/:quoteId/not-interested", authenticateFirebase, async (req, res) => {
  try {
    await updateStateAction(req.params.quoteId, "not_interested", "not_interested", { note: req.body?.note || "" });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Operazione non riuscita" });
  }
});

router.post("/:quoteId/reply", authenticateFirebase, async (req, res) => {
  try {
    await updateStateAction(req.params.quoteId, "suspended", "customer_replied", { channel: req.body?.channel || "email", note: req.body?.note || "" });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Operazione non riuscita" });
  }
});

router.put("/sequences/:id", authenticateFirebase, async (req, res) => {
  try {
    const body = req.body || {};
    await db.collection("followUpSequences").doc(req.params.id).set({
      id: req.params.id,
      name: String(body.name || "Sequenza follow-up"),
      serviceType: String(body.serviceType || "*"),
      enabled: body.enabled !== false,
      mode: (body.mode === "pending_approval" ? "pending_approval" : "automatic") as FollowUpMode,
      steps: normalizeStepList(body.steps),
      dormantAfterStep: Number(body.dormantAfterStep) || 3,
      reactivationDaysBeforeEvent: Number(body.reactivationDaysBeforeEvent) || 60,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: "Sequenza non valida" });
  }
});

router.put("/templates/:id", authenticateFirebase, async (req, res) => {
  try {
    const body = req.body || {};
    await db.collection("followUpTemplates").doc(req.params.id).set({
      id: req.params.id,
      name: String(body.name || "Template follow-up"),
      serviceType: String(body.serviceType || "*"),
      step: Number(body.step) || 1,
      active: body.active !== false,
      subject: String(body.subject || ""),
      bodyHtml: String(body.bodyHtml || ""),
      cta: ["quote", "configurator", "custom", "none"].includes(body.cta) ? body.cta : "quote",
      ctaLabel: String(body.ctaLabel || "Apri il preventivo"),
      customUrl: body.customUrl ? String(body.customUrl) : FieldValue.delete(),
      version: Number(body.version) || 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: "Template non valido" });
  }
});

// Endpoint pubblico usato solo dai link firmati inseriti nelle email follow-up.
router.get("/track/:quoteId/:event", async (req, res) => {
  try {
    const quote = await db.collection("quotes").doc(req.params.quoteId).get();
    if (!quote.exists || !req.query.token || quote.data()?.publicToken !== req.query.token) {
      return res.status(404).send("Link non valido");
    }
    const event = req.params.event === "opened" ? "followup_opened" : "followup_clicked";
    await appendFollowUpEvent(event, req.params.quoteId, quote.data()?.jobId, { source: "email" });
    const quoteUrl = `${baseUrl()}/quote/${req.query.token}`;
    const requestedRedirect = typeof req.query.redirect === "string" ? req.query.redirect : "";
    const redirect = requestedRedirect.startsWith(quoteUrl) ? requestedRedirect : quoteUrl;
    res.redirect(302, redirect);
  } catch {
    res.status(302).redirect(`${baseUrl()}/quote/${req.query.token || ""}`);
  }
});

export default router;
