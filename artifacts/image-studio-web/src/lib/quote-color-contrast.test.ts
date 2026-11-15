import { describe, expect, it } from "vitest";
import { getContrastRatio, getQuoteColorContrastIssues } from "./quote-color-contrast";

describe("contrasto colori dei preventivi", () => {
  it("calcola il rapporto di contrasto effettivo secondo WCAG", () => {
    expect(getContrastRatio("#000000", "#ffffff")).toBe(21);
  });

  it("segnala testo e accenti difficili da leggere con una palette chiara", () => {
    const issues = getQuoteColorContrastIssues("#f3c7df", "#f8e9f1");

    expect(issues.map(issue => issue.label)).toContain("Testo bianco sul pulsante principale");
    expect(issues.map(issue => issue.label)).toContain("Accento principale su fondo chiaro");
    expect(issues.every(issue => issue.ratio < 4.5)).toBe(true);
  });

  it("non segnala problemi con una palette scura e un accento secondario leggibile", () => {
    expect(getQuoteColorContrastIssues("#243447", "#536b57")).toEqual([]);
  });

  it("valuta il testo dell’accento secondario sulla tinta compositata reale", () => {
    const issues = getQuoteColorContrastIssues("#243447", "#000000");

    expect(issues.map(issue => issue.label)).not.toContain("Testo sull’accento secondario");
  });

  it("ignora valori non validi invece di calcolare un contrasto inventato", () => {
    expect(getContrastRatio("currentColor", "#ffffff")).toBeNull();
  });
});
