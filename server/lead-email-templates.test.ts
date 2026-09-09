import { describe, expect, it, vi } from "vitest";

vi.mock("./firebase-admin.js", () => ({
  db: {},
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifyIdToken: vi.fn() }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: vi.fn() },
  Timestamp: { fromDate: vi.fn() },
}));

import { createQuoteSentEmailHTML } from "./email-routes.js";
import {
  DEFAULT_TEMPLATES,
  renderTemplate,
  upgradeLegacyDefaultTemplate,
} from "./follow-up-routes.js";

describe("email iniziale del lead", () => {
  it("mostra valore, riepilogo, CTA e invito al confronto senza inviare email", () => {
    const html = createQuoteSentEmailHTML(
      "Mario Rossi",
      "variabile",
      "Matrimonio in Costiera",
      2450,
      "https://example.com/quote/public-token",
      new Date("2026-12-31T12:00:00.000Z"),
      {
        name: "Image Studio Fotografico",
        email: "studio@example.com",
        phone: "+39 334 7103142",
        address: "Aversa",
      },
    );

    expect(html).toContain("La tua proposta fotografica");
    expect(html).toContain("Matrimonio in Costiera");
    expect(html).toContain("€2450,00");
    expect(html).toContain("Puoi anche provare le diverse opzioni");
    expect(html).toContain("Scopri la tua proposta");
    expect(html).toContain("https://example.com/quote/public-token");
    expect(html).toContain("Rispondi direttamente a questa email");
    expect(html).not.toContain("Preventivo Personalizzato");
  });

  it("mantiene il riepilogo coerente per un preventivo fisso", () => {
    const html = createQuoteSentEmailHTML(
      "Giulia Bianchi",
      "fisso",
      "Servizio fotografico",
      1200,
      "https://example.com/quote/fisso",
    );

    expect(html).toContain("Una proposta chiara, già organizzata per il tuo evento.");
    expect(html).toContain("€1200,00");
    expect(html).not.toContain("Puoi anche provare le diverse opzioni");
  });
});

describe("template follow-up dei lead", () => {
  const data = {
    clientName: "Mario Rossi",
    coupleName: "Matrimonio in Costiera",
    eventDate: "15 settembre 2026",
    quoteTotal: "€2.450,00",
    quoteUrl: "https://example.com/track/click",
    trackingOpenUrl: "https://example.com/track/open",
  };

  it.each([
    [1, "Hai già visto la proposta", "Scopri la tua proposta"],
    [2, "Cosa vuoi chiarire", "Rivedi la proposta"],
    [3, "Chiudo qui i promemoria", "Riapri la proposta"],
  ])("rende correttamente step %i con contenuto e CTA", (step, subjectFragment, ctaLabel) => {
    const template = DEFAULT_TEMPLATES.find((item) => item.step === step);
    expect(template).toBeDefined();

    const rendered = renderTemplate(template!, data);

    expect(rendered.subject).toContain(subjectFragment);
    expect(rendered.subject).not.toMatch(/\[[^\]]+\]/);
    expect(rendered.html).toContain("Mario Rossi");
    expect(rendered.html).toContain("Matrimonio in Costiera");
    expect(rendered.html).toContain("15 settembre 2026");
    expect(rendered.html).toContain("€2.450,00");
    expect(rendered.html).toContain(ctaLabel);
    expect(rendered.html).toContain(data.quoteUrl);
    expect(rendered.html).toContain(data.trackingOpenUrl);
    expect(rendered.html).not.toContain("[nome cliente]");
    expect(rendered.html).not.toContain("[nome coppia]");
    expect(rendered.html).not.toContain("[data evento]");
    expect(rendered.html).not.toContain("[importo preventivo]");
  });

  it("aggiorna il vecchio template standard ma preserva quello personalizzato", () => {
    const legacy = {
      ...DEFAULT_TEMPLATES[0],
      version: 1,
      subject: "Un piccolo promemoria per il tuo preventivo",
      bodyHtml:
        "<p>Ciao [nome cliente],</p><p>ti scrivo per sapere se hai avuto modo di dare un'occhiata al preventivo per [nome coppia].</p><p>Se vuoi, puoi rivederlo qui:</p>",
    };
    const upgraded = upgradeLegacyDefaultTemplate(legacy);

    expect(upgraded.version).toBe(2);
    expect(upgraded.subject).toContain("Hai già visto la proposta");
    expect(upgraded.bodyHtml).toContain("rispondi pure a questa email");

    const custom = {
      ...legacy,
      subject: "La tua proposta, come promesso",
      bodyHtml: "<p>Ciao [nome cliente], questo è un messaggio personalizzato.</p>",
    };
    expect(upgradeLegacyDefaultTemplate(custom)).toEqual(custom);
  });
});