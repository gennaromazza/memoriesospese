import { describe, expect, it } from "vitest";
import {
  buildResendBroadcastHtml,
  normalizeMarketingEmail,
  validateMarketingSender,
} from "./resend-marketing.js";

describe("Resend marketing helpers", () => {
  it("normalizes recipient addresses before syncing", () => {
    expect(normalizeMarketingEmail("  Alice.Example@MAIL.COM ")).toBe(
      "alice.example@mail.com",
    );
  });

  it("only accepts a sender on a verified sending domain", () => {
    const domains = [
      {
        name: "gennaromazzacane.it",
        status: "verified",
        sendingEnabled: true,
      },
    ];

    expect(
      validateMarketingSender("newsletter@gennaromazzacane.it", domains),
    ).toBeNull();
    expect(
      validateMarketingSender("newsletter@imagestudiofotografico.com", domains),
    ).toContain("non risulta verificato");
    expect(validateMarketingSender("not-an-email", domains)).toContain(
      "indirizzo mittente valido",
    );
  });

  it("personalizes names and includes Resend's unsubscribe placeholder", () => {
    const html = buildResendBroadcastHtml(
      "<p>Ciao {nome_completo}, {nome} {cognome}</p>",
    );

    expect(html).toContain("{{{contact.first_name|}}}");
    expect(html).toContain("{{{contact.last_name|}}}");
    expect(html).toContain("{{{contact.first_name|cliente}}}");
    expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
  });
});
