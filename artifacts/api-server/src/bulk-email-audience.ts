import { DateTime } from "luxon";

export interface BulkEmailRecipient {
  email: string;
  nome: string;
  cognome: string;
  clientId?: string;
}

export interface BulkEmailRecipientCandidate {
  email: unknown;
  nome?: unknown;
  cognome?: unknown;
  clientId?: unknown;
}

export interface BookingMarketingContact {
  email?: unknown;
  nome?: unknown;
  cognome?: unknown;
}

export interface BookingMarketingCandidateSource {
  status: unknown;
  contact: BookingMarketingContact;
  linkedClient?: BulkEmailRecipientCandidate;
}

export function normalizeMarketingEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function bookingRecipientCandidate(
  bookingContact: BookingMarketingContact,
  linkedClient?: BulkEmailRecipientCandidate,
): BulkEmailRecipientCandidate {
  const linkedEmail = normalizeMarketingEmail(linkedClient?.email);
  return {
    email: linkedEmail || normalizeMarketingEmail(bookingContact.email),
    nome: typeof linkedClient?.nome === "string" && linkedClient.nome.trim()
      ? linkedClient.nome
      : bookingContact.nome,
    cognome: typeof linkedClient?.cognome === "string" && linkedClient.cognome.trim()
      ? linkedClient.cognome
      : bookingContact.cognome,
    ...(typeof linkedClient?.clientId === "string" && linkedClient.clientId.trim()
      ? { clientId: linkedClient.clientId }
      : {}),
  };
}

export function buildBookingMarketingCandidates(
  sources: BookingMarketingCandidateSource[],
): { candidates: BulkEmailRecipientCandidate[]; unlinkedBookingContacts: number } {
  const candidates: BulkEmailRecipientCandidate[] = [];
  let unlinkedBookingContacts = 0;

  for (const source of sources) {
    if (!isEligibleBookingForMarketing(source.status) || !normalizeMarketingEmail(source.contact.email)) {
      continue;
    }
    if (!source.linkedClient) unlinkedBookingContacts += 1;
    candidates.push(bookingRecipientCandidate(source.contact, source.linkedClient));
  }

  return { candidates, unlinkedBookingContacts };
}

export function countUniqueBookingMarketingEmails(
  bookings: Array<{ status: unknown; email: unknown }>,
): number {
  const emails = new Set<string>();
  for (const booking of bookings) {
    if (!isEligibleBookingForMarketing(booking.status)) continue;
    const email = normalizeMarketingEmail(booking.email);
    if (email) emails.add(email);
  }
  return emails.size;
}

export function parseMarketingRecipientFilters(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [raw];
  return Array.from(new Set(
    values
      .filter((value): value is string => typeof value === "string")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  ));
}

export function isEligibleBookingForMarketing(status: unknown): boolean {
  return ["in_attesa", "confermata", "completata"].includes(
    typeof status === "string" ? status.trim().toLowerCase() : "",
  );
}

export function dedupeMarketingRecipients(
  candidates: BulkEmailRecipientCandidate[],
): { recipients: BulkEmailRecipient[]; duplicatesRemoved: number } {
  const recipientsByEmail = new Map<string, BulkEmailRecipient>();
  let duplicatesRemoved = 0;

  for (const candidate of candidates) {
    const email = normalizeMarketingEmail(candidate.email);
    if (!email) continue;

    const existing = recipientsByEmail.get(email);
    const nome = typeof candidate.nome === "string" ? candidate.nome.trim() : "";
    const cognome = typeof candidate.cognome === "string" ? candidate.cognome.trim() : "";
    const clientId = typeof candidate.clientId === "string" ? candidate.clientId.trim() : "";

    if (existing) {
      duplicatesRemoved += 1;
      if (!existing.nome && nome) existing.nome = nome;
      if (!existing.cognome && cognome) existing.cognome = cognome;
      if (!existing.clientId && clientId) existing.clientId = clientId;
      continue;
    }

    recipientsByEmail.set(email, {
      email,
      nome,
      cognome,
      ...(clientId ? { clientId } : {}),
    });
  }

  return {
    recipients: Array.from(recipientsByEmail.values()),
    duplicatesRemoved,
  };
}

export function prepareMarketingSendAudience(
  candidates: BulkEmailRecipientCandidate[],
): { recipients: BulkEmailRecipient[]; totalRecipients: number } {
  const recipients = dedupeMarketingRecipients(candidates).recipients;
  return { recipients, totalRecipients: recipients.length };
}

export function campaignEndDateInRome(value: unknown): DateTime | null {
  let date: DateTime | null = null;

  if (typeof value === "string") {
    const parsed = DateTime.fromISO(value, { zone: "Europe/Rome" });
    date = parsed.isValid ? parsed : null;
  } else if (value instanceof Date) {
    const parsed = DateTime.fromJSDate(value, { zone: "utc" }).setZone("Europe/Rome");
    date = parsed.isValid ? parsed : null;
  } else if (typeof value === "object" && value !== null) {
    const timestamp = value as {
      toDate?: () => Date;
      seconds?: unknown;
      _seconds?: unknown;
      nanoseconds?: unknown;
      _nanoseconds?: unknown;
    };

    if (typeof timestamp.toDate === "function") {
      try {
        const parsed = DateTime.fromJSDate(timestamp.toDate(), { zone: "utc" }).setZone("Europe/Rome");
        date = parsed.isValid ? parsed : null;
      } catch {
        date = null;
      }
    } else {
      const seconds = Number(timestamp.seconds ?? timestamp._seconds);
      const nanoseconds = Number(timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0);
      if (Number.isFinite(seconds) && Number.isFinite(nanoseconds)) {
        const parsed = DateTime.fromMillis(seconds * 1000 + nanoseconds / 1_000_000, {
          zone: "utc",
        }).setZone("Europe/Rome");
        date = parsed.isValid ? parsed : null;
      }
    }
  }

  return date;
}

export function isBookingCampaignEnded(
  dataFine: unknown,
  now: DateTime = DateTime.now().setZone("Europe/Rome"),
): boolean {
  const endDate = campaignEndDateInRome(dataFine);
  if (!endDate) return false;

  // dataFine è una data di calendario: resta valida fino alla fine del giorno
  // in Europe/Rome, evitando di considerare conclusa la campagna già a mezzanotte.
  return endDate.endOf("day").toMillis() < now.setZone("Europe/Rome").toMillis();
}
