import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  campaignEndDateInRome,
  dedupeMarketingRecipients,
  isBookingCampaignEnded,
  isEligibleBookingForMarketing,
  normalizeMarketingEmail,
  parseMarketingRecipientFilters,
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
