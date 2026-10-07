/**
 * Test del fallback della data mostrata nel badge "Compilato il" della lista lavori:
 * - se il job ha `quickQuoteCompiledAt` valido → si usa quello (ultima compilazione)
 * - job vecchi senza il campo → fallback su `createdAt`
 * - gestisce tutti i formati timestamp (Web SDK, Admin SDK serializzato, Date, ISO)
 */
import { describe, it, expect } from "vitest";
import { getQuickQuoteDisplayDate, toDisplayDate } from "./job-display";

const D1 = new Date("2026-01-10T10:00:00Z");
const D2 = new Date("2026-03-05T15:30:00Z");

describe("toDisplayDate", () => {
  it("gestisce Date, {toDate}, {seconds}, {_seconds}, stringa ISO", () => {
    expect(toDisplayDate(D1)?.getTime()).toBe(D1.getTime());
    expect(toDisplayDate({ toDate: () => D1 })?.getTime()).toBe(D1.getTime());
    expect(toDisplayDate({ seconds: D1.getTime() / 1000 })?.getTime()).toBe(D1.getTime());
    expect(toDisplayDate({ _seconds: D1.getTime() / 1000 })?.getTime()).toBe(D1.getTime());
    expect(toDisplayDate(D1.toISOString())?.getTime()).toBe(D1.getTime());
  });

  it("ritorna null per valori mancanti o invalidi", () => {
    expect(toDisplayDate(undefined)).toBeNull();
    expect(toDisplayDate(null)).toBeNull();
    expect(toDisplayDate("non-una-data")).toBeNull();
    expect(toDisplayDate(new Date("invalid"))).toBeNull();
    expect(toDisplayDate({})).toBeNull();
  });
});

describe("getQuickQuoteDisplayDate (badge 'Compilato il')", () => {
  it("usa quickQuoteCompiledAt quando presente (ha priorità su createdAt)", () => {
    const job = {
      quickQuoteCompiledAt: { _seconds: D2.getTime() / 1000 },
      createdAt: { _seconds: D1.getTime() / 1000 },
    };
    expect(getQuickQuoteDisplayDate(job)?.getTime()).toBe(D2.getTime());
  });

  it("fallback su createdAt per i job vecchi senza quickQuoteCompiledAt", () => {
    const job = { createdAt: { _seconds: D1.getTime() / 1000 } };
    expect(getQuickQuoteDisplayDate(job)?.getTime()).toBe(D1.getTime());
  });

  it("fallback su createdAt anche se quickQuoteCompiledAt è invalido", () => {
    const job = {
      quickQuoteCompiledAt: new Date("invalid"),
      createdAt: D1,
    };
    expect(getQuickQuoteDisplayDate(job)?.getTime()).toBe(D1.getTime());
  });

  it("ritorna null se mancano entrambi i campi", () => {
    expect(getQuickQuoteDisplayDate({})).toBeNull();
  });
});
