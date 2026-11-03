import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  buildBookingMarketingCandidates,
  bookingRecipientCandidate,
  campaignEndDateInRome,
  countUniqueBookingMarketingEmails,
  dedupeMarketingRecipients,
  isBookingCampaignEnded,
  isEligibleBookingForMarketing,
  normalizeMarketingEmail,
  parseMarketingRecipientFilters,
  prepareMarketingSendAudience,
} from "./bulk-email-audience.js";

describe("bulk email audience helpers", () => {
  it("normalizes valid email addresses and rejects invalid values", () => {
    expect(normalizeMarketingEmail("  Cliente@Esempio.it ")).toBe("cliente@esempio.it");
    expect(normalizeMarketingEmail("not-an-email")).toBeNull();
    expect(normalizeMarketingEmail(null)).toBeNull();
  });

  it("parses repeated and comma-separated audience filters without duplicates", () => {
    expect(parseMarketingRecipientFilters([
      "all",
      "tipo_matrimonio,campagna_natale",
      " campagna_natale ",
      null,
    ])).toEqual(["all", "tipo_matrimonio", "campagna_natale"]);
  });

  it("deduplicates addresses regardless of case or surrounding whitespace", () => {
    const result = dedupeMarketingRecipients([
      { email: "Cliente@Esempio.it", nome: "", cognome: "" },
      { email: " cliente@esempio.it ", nome: "Anna", cognome: "Rossi", clientId: "cliente-1" },
      { email: "altra@example.it", nome: "Luca", cognome: "Bianchi" },
      { email: "indirizzo-non-valido", nome: "Ignorato", cognome: "" },
    ]);

    expect(result.duplicatesRemoved).toBe(1);
    expect(result.recipients).toEqual([
      { email: "cliente@esempio.it", nome: "Anna", cognome: "Rossi", clientId: "cliente-1" },
      { email: "altra@example.it", nome: "Luca", cognome: "Bianchi" },
    ]);
  });

  it("uses valid booking snapshots when client data is missing and excludes cancelled bookings", () => {
    const result = buildBookingMarketingCandidates([
      {
        status: "completata",
        contact: { email: "  Snapshot@Esempio.it ", nome: "Anna", cognome: "Rossi" },
      },
      {
        status: "confermata",
        contact: { email: "linked@example.it", nome: "Nome prenotazione", cognome: "Cognome" },
        linkedClient: { email: "", nome: "Nome scheda", clientId: "client-1" },
      },
      {
        status: "annullata",
        contact: { email: "cancelled@example.it", nome: "Da escludere" },
      },
      {
        status: "in_attesa",
        contact: { email: "invalid-email", nome: "Indirizzo non valido" },
      },
    ]);

    expect(result.unlinkedBookingContacts).toBe(1);
    expect(dedupeMarketingRecipients(result.candidates).recipients).toEqual([
      { email: "snapshot@esempio.it", nome: "Anna", cognome: "Rossi" },
      { email: "linked@example.it", nome: "Nome scheda", cognome: "Cognome", clientId: "client-1" },
    ]);
  });

  it("counts unique eligible booking emails after normalization", () => {
    expect(countUniqueBookingMarketingEmails([
      { status: "confermata", email: " Cliente@Esempio.it " },
      { status: "completata", email: "cliente@esempio.it" },
      { status: "annullata", email: "annullato@esempio.it" },
      { status: "confermata", email: "not-an-email" },
    ])).toBe(1);
  });

  it("creates one send recipient and count from overlapping groups", () => {
    const groups = [
      [
        { email: " CLIENTE@ESEMPIO.IT ", nome: "Anna", cognome: "Rossi", clientId: "client-1" },
        { email: "first@example.it", nome: "Luca", cognome: "Bianchi" },
      ],
      [
        { email: "cliente@esempio.it", nome: "", cognome: "" },
        { email: " FIRST@example.it ", nome: "Luca", cognome: "Bianchi" },
        { email: "second@example.it", nome: "Marta", cognome: "Verdi" },
      ],
    ];

    const queuedCampaign = prepareMarketingSendAudience(groups.flat());

    expect(queuedCampaign.totalRecipients).toBe(3);
    expect(queuedCampaign.recipients.map(({ email }) => email)).toEqual([
      "cliente@esempio.it",
      "first@example.it",
      "second@example.it",
    ]);
  });

  it("falls back to the booking snapshot when a linked client has no email", () => {
    expect(bookingRecipientCandidate(
      { email: "snapshot@example.it", nome: "Snapshot name" },
      { email: null, nome: "", clientId: "client-1" },
    )).toEqual({
      email: "snapshot@example.it",
      nome: "Snapshot name",
      cognome: undefined,
      clientId: "client-1",
    });
  });

  it("includes active and completed bookings but excludes cancelled states", () => {
    expect(isEligibleBookingForMarketing("in_attesa")).toBe(true);
    expect(isEligibleBookingForMarketing("confermata")).toBe(true);
    expect(isEligibleBookingForMarketing("completata")).toBe(true);
    expect(isEligibleBookingForMarketing("annullata")).toBe(false);
    expect(isEligibleBookingForMarketing("cancellation_pending")).toBe(false);
    expect(isEligibleBookingForMarketing("cancellata")).toBe(false);
    expect(isEligibleBookingForMarketing(undefined)).toBe(false);
  });

  it("treats the campaign end date as inclusive in the Rome timezone", () => {
    const sameDayEvening = DateTime.fromISO("2026-10-12T23:59:00", { zone: "Europe/Rome" });
    const nextDay = DateTime.fromISO("2026-10-13T00:01:00", { zone: "Europe/Rome" });

    expect(isBookingCampaignEnded("2026-10-12", sameDayEvening)).toBe(false);
    expect(isBookingCampaignEnded("2026-10-12", nextDay)).toBe(true);
  });

  it("parses Firestore timestamp-shaped values", () => {
    const date = campaignEndDateInRome({ _seconds: 1_792_094_400, _nanoseconds: 0 });
    expect(date?.isValid).toBe(true);
    expect(date?.zoneName).toBe("Europe/Rome");
  });
});
