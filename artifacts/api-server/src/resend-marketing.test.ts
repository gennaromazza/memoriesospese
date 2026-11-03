import { afterEach, describe, expect, it, vi } from "vitest";
const { proxy } = vi.hoisted(() => ({ proxy: vi.fn() }));
let mockClock = Date.now();
vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    proxy = proxy;
  },
}));
import {
  buildResendBroadcastHtml,
  normalizeMarketingEmail,
  submitResendBroadcast,
  validateMarketingSender,
} from "./resend-marketing.js";

afterEach(() => {
  vi.restoreAllMocks();
  proxy.mockReset();
});

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

  it("syncs only eligible selected contacts and sends one broadcast", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => mockClock += 1000);
    proxy.mockImplementation(async (_provider, path, options) => {
      if (path.startsWith("/domains")) return Response.json({ data: [
        { name: "example.com", status: "verified", capabilities: { sending: "enabled" } },
      ] });
      if (path.startsWith("/topics?")) return Response.json({ data: [
        { id: "topic", name: "Image Studio - Comunicazioni promozionali" },
      ] });
      if (path.startsWith("/segments?")) return Response.json({ data: [] });
      if (path === "/segments") return Response.json({ id: "segment" });
      if (path === "/contacts/new%40example.com") return Response.json({}, { status: 404 });
      if (path === "/contacts/optout%40example.com") return Response.json({ id: "excluded", unsubscribed: true });
      if (path === "/contacts") return Response.json({ id: "new-contact" });
      if (path === "/broadcasts") return Response.json({ id: "broadcast" });
      if (path === "/broadcasts/broadcast/send") return Response.json({ id: "broadcast" });
      throw new Error(`Unexpected request: ${options.method} ${path}`);
    });

    const result = await submitResendBroadcast({
      jobId: "job",
      senderEmail: "newsletter@example.com",
      subject: "Promozione",
      body: "<p>Ciao {nome}</p>",
      recipients: [
        { email: "new@example.com", nome: "Alice" },
        { email: "optout@example.com" },
      ],
    });

    expect(result).toMatchObject({ eligibleCount: 1, excludedCount: 1, broadcastId: "broadcast" });
    const createdContacts = proxy.mock.calls.filter(([, path, options]) => path === "/contacts" && options.method === "POST");
    expect(createdContacts).toHaveLength(1);
    expect(JSON.parse(createdContacts[0][2].body).email).toBe("new@example.com");
    const broadcast = proxy.mock.calls.find(([, path]) => path === "/broadcasts");
    expect(JSON.parse(broadcast![2].body)).toMatchObject({ segment_id: "segment", topic_id: "topic", send: false });
    expect(proxy.mock.calls.filter(([, path]) => path.endsWith("/send"))).toHaveLength(1);
  });

  it("does not send again when an existing broadcast was already accepted", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => mockClock += 1000);
    proxy.mockImplementation(async (_provider, path) => {
      if (path.startsWith("/domains")) return Response.json({ data: [
        { name: "example.com", status: "verified", capabilities: { sending: "enabled" } },
      ] });
      if (path === "/broadcasts/existing") return Response.json({ id: "existing", status: "sent" });
      throw new Error(`Unexpected request: ${path}`);
    });
    const result = await submitResendBroadcast({
      jobId: "job",
      senderEmail: "newsletter@example.com",
      subject: "Promozione",
      body: "<p>Ciao</p>",
      recipients: [{ email: "client@example.com" }],
      existing: { providerBroadcastId: "existing", preparedCount: 1 },
    });
    expect(result.providerStatus).toBe("sent");
    expect(proxy.mock.calls.every(([, , options]) => options.method === "GET")).toBe(true);
  });
});
