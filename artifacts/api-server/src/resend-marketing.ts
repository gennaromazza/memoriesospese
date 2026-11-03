import { ReplitConnectors } from "@replit/connectors-sdk";

const MARKETING_TOPIC_NAME = "Image Studio - Comunicazioni promozionali";
const MARKETING_TOPIC_DESCRIPTION =
  "Promozioni e aggiornamenti fotografici di Image Studio.";
const REQUEST_INTERVAL_MS = 130;

type ResendEntity = Record<string, any>;
type ResendList = { data?: ResendEntity[]; has_more?: boolean };
type ResendRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
};

export interface ResendMarketingRecipient {
  email: string;
  nome?: string;
  cognome?: string;
}

export interface ResendMarketingStatus {
  connected: true;
  verifiedSendingDomains: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

export interface ResendBroadcastProgress {
  providerTopicId?: string;
  providerSegmentId?: string;
  providerBroadcastId?: string;
  providerStatus?: string;
  preparedCount?: number;
  excludedCount?: number;
  progressStage?: string;
}

export interface SubmitResendBroadcastInput {
  jobId: string;
  senderEmail: string;
  subject: string;
  body: string;
  recipients: ResendMarketingRecipient[];
  existing?: ResendBroadcastProgress;
  onProgress?: (progress: ResendBroadcastProgress) => Promise<void>;
}

export interface SubmitResendBroadcastResult {
  broadcastId: string;
  providerStatus: string;
  eligibleCount: number;
  excludedCount: number;
}

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleResendRequests(): Promise<void> {
  const waitMs = Math.max(
    0,
    REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt),
  );
  if (waitMs > 0) await sleep(waitMs);
  lastRequestAt = Date.now();
}

async function resendRequest(
  path: string,
  options: ResendRequestOptions = {},
  allowNotFound = false,
): Promise<{ status: number; data: any }> {
  await throttleResendRequests();
  const response = await new ReplitConnectors().proxy("resend", path, {
    method: options.method ?? "GET",
    ...(options.body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body),
        }
      : {}),
  });

  if (allowNotFound && response.status === 404) {
    return { status: response.status, data: null };
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const providerMessage =
      typeof data?.message === "string" ? data.message : undefined;
    throw new Error(
      providerMessage
        ? `Resend HTTP ${response.status}: ${providerMessage.slice(0, 300)}`
        : `Resend HTTP ${response.status} durante ${options.method ?? "GET"} ${path.split("?")[0]}`,
    );
  }

  return { status: response.status, data };
}

function listRows(payload: any): ResendEntity[] {
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload?.data && typeof payload.data === "object") return [payload.data];
  return [];
}

async function listAll(path: string): Promise<ResendEntity[]> {
  const rows: ResendEntity[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 100; page++) {
    const url = cursor
      ? `${path}?limit=100&after=${encodeURIComponent(cursor)}`
      : `${path}?limit=100`;
    const { data } = await resendRequest(url);
    const pageRows = listRows(data);
    rows.push(...pageRows);
    if (!data?.has_more || pageRows.length === 0) return rows;
    cursor = pageRows[pageRows.length - 1]?.id;
    if (!cursor) return rows;
  }

  throw new Error("Resend ha restituito troppe pagine da elaborare.");
}

function payloadEntity(payload: any): ResendEntity | null {
  if (payload?.data && !Array.isArray(payload.data)) return payload.data;
  return payload && typeof payload === "object" ? payload : null;
}

export function normalizeMarketingEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateMarketingSender(
  senderEmail: string,
  verifiedDomains: Array<{ name: string; status: string; sendingEnabled?: boolean }>,
): string | null {
  const normalized = senderEmail.trim().toLowerCase();
  const match = normalized.match(/^[^\s<>@]+@[^\s<>@]+$/);
  if (!match) return "Inserisci un indirizzo mittente valido.";

  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  const isVerified = verifiedDomains.some(
    (item) =>
      item.name.toLowerCase() === domain &&
      item.status === "verified" &&
      item.sendingEnabled !== false,
  );

  return isVerified
    ? null
    : `Il dominio ${domain} non risulta verificato per l'invio Resend.`;
}

export function buildResendBroadcastHtml(body: string): string {
  const personalizedBody = body
    .replace(/\{nome_completo\}/gi, "{{{contact.first_name|}}} {{{contact.last_name|}}}")
    .replace(/\{nome\}/gi, "{{{contact.first_name|cliente}}}")
    .replace(/\{cognome\}/gi, "{{{contact.last_name|}}}");

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      ${personalizedBody}
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #666; font-size: 12px;">
        <p style="margin: 5px 0; font-weight: 600;">Image Studio Fotografico</p>
        <p style="margin: 5px 0;">Email: image.studio.fotografico@gmail.com</p>
        <p style="margin: 5px 0;">Tel: +39 334 7103142</p>
        <p style="margin: 12px 0 0;">
          Non vuoi più ricevere comunicazioni promozionali?
          <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Disiscriviti</a>.
        </p>
      </div>
    </div>
  `;
}

export async function getResendMarketingStatus(): Promise<ResendMarketingStatus> {
  const [{ data: domainsPayload }] = await Promise.all([
    resendRequest("/domains?limit=100"),
  ]);
  const verifiedSendingDomains = listRows(domainsPayload)
    .filter(
      (domain) =>
        domain.status === "verified" &&
        domain.capabilities?.sending === "enabled",
    )
    .map((domain) => ({
      id: String(domain.id ?? ""),
      name: String(domain.name ?? ""),
      status: String(domain.status ?? ""),
    }));

  return { connected: true, verifiedSendingDomains };
}

async function ensureMarketingTopic(): Promise<string> {
  const topics = await listAll("/topics");
  const existing = topics.find(
    (topic) => topic.name === MARKETING_TOPIC_NAME && typeof topic.id === "string",
  );
  if (existing) return existing.id;

  const { data } = await resendRequest("/topics", {
    method: "POST",
    body: {
      name: MARKETING_TOPIC_NAME,
      description: MARKETING_TOPIC_DESCRIPTION,
      default_subscription: "opt_out",
      visibility: "public",
    },
  });
  const topic = payloadEntity(data);
  if (!topic?.id) throw new Error("Resend non ha restituito l'ID del topic.");
  return String(topic.id);
}

async function ensureCampaignSegment(
  jobId: string,
  existingSegmentId?: string,
): Promise<string> {
  if (existingSegmentId) return existingSegmentId;

  const segmentName = `Image Studio campagna ${jobId}`;
  const existing = (await listAll("/segments")).find(
    (segment) => segment.name === segmentName && typeof segment.id === "string",
  );
  if (existing) return existing.id;

  const { data } = await resendRequest("/segments", {
    method: "POST",
    body: { name: segmentName },
  });
  const segment = payloadEntity(data);
  if (!segment?.id) throw new Error("Resend non ha restituito l'ID del segmento.");
  return String(segment.id);
}

async function getContactByEmail(email: string): Promise<ResendEntity | null> {
  const { status, data } = await resendRequest(
    `/contacts/${encodeURIComponent(email)}`,
    {},
    true,
  );
  return status === 404 ? null : payloadEntity(data);
}

async function contactTopicRows(contactId: string): Promise<ResendEntity[]> {
  const { data } = await resendRequest(
    `/contacts/${encodeURIComponent(contactId)}/topics?limit=100`,
  );
  return listRows(data);
}

async function ensureContactTopic(
  contactId: string,
  topicId: string,
): Promise<boolean> {
  const topics = await contactTopicRows(contactId);
  const marketingTopic = topics.find((topic) => topic.id === topicId);
  if (marketingTopic?.subscription === "opt_out") return false;
  if (marketingTopic?.subscription === "opt_in") return true;

  const updatedTopics = topics
    .filter(
      (topic) =>
        typeof topic.id === "string" &&
        ["opt_in", "opt_out"].includes(topic.subscription),
    )
    .map((topic) => ({
      id: topic.id,
      subscription: topic.subscription,
    }));
  updatedTopics.push({ id: topicId, subscription: "opt_in" });

  await resendRequest(`/contacts/${encodeURIComponent(contactId)}/topics`, {
    method: "PATCH",
    body: { topics: updatedTopics },
  });
  return true;
}

async function ensureContactInSegment(
  contactId: string,
  segmentId: string,
): Promise<void> {
  const { data } = await resendRequest(
    `/contacts/${encodeURIComponent(contactId)}/segments?limit=100`,
  );
  const segments = listRows(data);
  if (segments.some((segment) => segment.id === segmentId)) return;

  await resendRequest(
    `/contacts/${encodeURIComponent(contactId)}/segments/${encodeURIComponent(segmentId)}`,
    { method: "POST" },
  );
}

async function syncRecipient(
  recipient: ResendMarketingRecipient,
  topicId: string,
  segmentId: string,
): Promise<"eligible" | "excluded"> {
  const email = normalizeMarketingEmail(recipient.email);
  let contact = await getContactByEmail(email);

  if (!contact) {
    const { data } = await resendRequest("/contacts", {
      method: "POST",
      body: {
        email,
        first_name: recipient.nome || undefined,
        last_name: recipient.cognome || undefined,
        segments: [segmentId],
        topics: [{ id: topicId, subscription: "opt_in" }],
      },
    });
    contact = payloadEntity(data);
    if (!contact?.id) {
      throw new Error("Resend non ha restituito l'ID del contatto creato.");
    }
    return "eligible";
  }

  if (contact.unsubscribed === true) return "excluded";

  const contactId = String(contact.id ?? email);
  if (!(await ensureContactTopic(contactId, topicId))) return "excluded";
  await ensureContactInSegment(contactId, segmentId);
  return "eligible";
}

function getBroadcastId(payload: any): string | null {
  const entity = payloadEntity(payload);
  return typeof entity?.id === "string" ? entity.id : null;
}

export async function submitResendBroadcast(
  input: SubmitResendBroadcastInput,
): Promise<SubmitResendBroadcastResult> {
  const status = await getResendMarketingStatus();
  const senderError = validateMarketingSender(
    input.senderEmail,
    status.verifiedSendingDomains.map((domain) => ({
      ...domain,
      sendingEnabled: true,
    })),
  );
  if (senderError) throw new Error(senderError);

  if (input.existing?.providerBroadcastId) {
    const broadcastId = input.existing.providerBroadcastId;
    const { data: broadcastPayload } = await resendRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}`,
    );
    const broadcast = payloadEntity(broadcastPayload);
    const providerStatus = String(broadcast?.status ?? "unknown");

    if (["draft", "drafted"].includes(providerStatus)) {
      await resendRequest(
        `/broadcasts/${encodeURIComponent(broadcastId)}/send`,
        { method: "POST", body: {} },
      );
      return {
        broadcastId,
        providerStatus: "queued",
        eligibleCount: input.existing.preparedCount ?? input.recipients.length,
        excludedCount: input.existing.excludedCount ?? 0,
      };
    }

    if (["queued", "scheduled", "sending", "sent"].includes(providerStatus)) {
      return {
        broadcastId,
        providerStatus,
        eligibleCount: input.existing.preparedCount ?? input.recipients.length,
        excludedCount: input.existing.excludedCount ?? 0,
      };
    }

    throw new Error(
      `La campagna Resend è in stato "${providerStatus}" e non può essere avviata in sicurezza.`,
    );
  }

  await input.onProgress?.({ progressStage: "Verifica liste Resend" });
  const topicId =
    input.existing?.providerTopicId ?? (await ensureMarketingTopic());
  await input.onProgress?.({
    providerTopicId: topicId,
    progressStage: "Preparo i destinatari",
  });

  const segmentId = await ensureCampaignSegment(
    input.jobId,
    input.existing?.providerSegmentId,
  );
  await input.onProgress?.({ providerSegmentId: segmentId });

  const uniqueRecipients = Array.from(
    new Map(
      input.recipients
        .filter((recipient) => recipient.email?.trim())
        .map((recipient) => [
          normalizeMarketingEmail(recipient.email),
          recipient,
        ]),
    ).values(),
  );

  let eligibleCount = 0;
  let excludedCount = 0;
  for (let i = 0; i < uniqueRecipients.length; i++) {
    const result = await syncRecipient(uniqueRecipients[i], topicId, segmentId);
    if (result === "eligible") eligibleCount++;
    else excludedCount++;

    if ((i + 1) % 10 === 0 || i === uniqueRecipients.length - 1) {
      await input.onProgress?.({
        preparedCount: eligibleCount,
        excludedCount,
        progressStage: `Preparo i destinatari (${i + 1}/${uniqueRecipients.length})`,
      });
    }
  }

  if (eligibleCount === 0) {
    throw new Error(
      "Nessun destinatario è idoneo: risultano già disiscritti o non disponibili.",
    );
  }

  await input.onProgress?.({ progressStage: "Creo la campagna Resend" });
  const html = buildResendBroadcastHtml(input.body);
  const { data: createdPayload } = await resendRequest("/broadcasts", {
    method: "POST",
    body: {
      name: `Image Studio campagna ${input.jobId}`,
      segment_id: segmentId,
      topic_id: topicId,
      from: `Image Studio Fotografico <${input.senderEmail.trim()}>`,
      reply_to: ["image.studio.fotografico@gmail.com"],
      subject: input.subject,
      html,
      send: false,
    },
  });
  const broadcastId = getBroadcastId(createdPayload);
  if (!broadcastId) throw new Error("Resend non ha restituito l'ID della campagna.");

  await input.onProgress?.({
    providerBroadcastId: broadcastId,
    providerStatus: "draft",
    preparedCount: eligibleCount,
    excludedCount,
    progressStage: "Invio della campagna a Resend",
  });

  await resendRequest(
    `/broadcasts/${encodeURIComponent(broadcastId)}/send`,
    { method: "POST", body: {} },
  );

  return {
    broadcastId,
    providerStatus: "queued",
    eligibleCount,
    excludedCount,
  };
}
