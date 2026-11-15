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
  getResendMarketingStatus,
  normalizeMarketingEmail,
  submitResendBroadcast,
  validateMarketingSender,
} from "./resend-marketing.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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

  it("uses the Resend secret directly in production instead of the development connector", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test_do_not_use");
    const fetchMock = vi.fn(async () => Response.json({
      data: [
        {
          id: "domain",
          name: "example.com",
          status: "verified",
          capabilities: { sending: "enabled" },
        },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const status = await getResendMarketingStatus();

    expect(status.verifiedSendingDomains).toEqual([
      { id: "domain", name: "example.com", status: "verified" },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://api.resend.com/domains?limit=100");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer re_test_do_not_use");
    expect(new Headers(init.headers).get("user-agent")).toBe("Image Studio Backend");
    expect(proxy).not.toHaveBeenCalled();
  });

  it("shows a clear setup error if production has no Resend secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");

    await expect(getResendMarketingStatus()).rejects.toThrow(
      "Invio Resend in produzione non configurato: aggiungi RESEND_API_KEY",
    );
    expect(proxy).not.toHaveBeenCalled();
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
      if (path.startsWith("/broadcasts?")) return Response.json({ data: [] });
      if (path === "/segments") return Response.json({ id: "segment" });
      if (path === "/segments/segment/contacts?limit=100") return Response.json({ data: [] });
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
    expect(JSON.parse(createdContacts[0][2].body)).toMatchObject({
      email: "new@example.com",
      segments: [{ id: "segment" }],
    });
    // Resend rejects string entries with "expected object, received string".
    for (const [, , options] of createdContacts) {
      expect(JSON.parse(options.body).segments.every(
        (segment: unknown) => typeof segment === "object" && segment !== null && "id" in segment,
      )).toBe(true);
    }
    const broadcast = proxy.mock.calls.find(([, path]) => path === "/broadcasts");
    expect(JSON.parse(broadcast![2].body)).toMatchObject({ segment_id: "segment", topic_id: "topic", send: false });
    expect(proxy.mock.calls.filter(([, path]) => path.endsWith("/send"))).toHaveLength(1);
    const createdSegment = proxy.mock.calls.find(([, path, options]) => path === "/segments" && options.method === "POST");
    expect(JSON.parse(createdSegment![2].body)).toEqual({ name: "Campagna corrente" });
  });

  it("svuota solo le appartenenze al segmento e riusa Campagna corrente", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => mockClock += 1000);
    proxy.mockImplementation(async (_provider, path, options) => {
      if (path.startsWith("/domains")) return Response.json({ data: [
        { name: "example.com", status: "verified", capabilities: { sending: "enabled" } },
      ] });
      if (path.startsWith("/topics?")) return Response.json({ data: [
        { id: "topic", name: "Image Studio - Comunicazioni promozionali" },
      ] });
      if (path.startsWith("/segments?")) return Response.json({ data: [
        { id: "current", name: "Campagna corrente" },
      ] });
      if (path.startsWith("/broadcasts?")) return Response.json({ data: [] });
      if (path === "/segments/current/contacts?limit=100") return Response.json({ data: [
        { id: "old-contact", email: "old@example.com" },
      ] });
      if (path === "/contacts/old-contact/segments/current" && options.method === "DELETE") {
        return Response.json({ deleted: true });
      }
      if (path === "/contacts/client%40example.com") return Response.json({
        id: "selected-contact",
        email: "client@example.com",
        unsubscribed: false,
      });
      if (path === "/contacts/selected-contact/topics?limit=100") return Response.json({ data: [
        { id: "topic", subscription: "opt_in" },
      ] });
      if (path === "/contacts/selected-contact/segments?limit=100") return Response.json({ data: [] });
      if (path === "/contacts/selected-contact/segments/current" && options.method === "POST") {
        return Response.json({ id: "current" });
      }
      if (path === "/broadcasts") return Response.json({ id: "broadcast" });
      if (path === "/broadcasts/broadcast/send") return Response.json({ id: "broadcast" });
      throw new Error(`Unexpected request: ${options.method} ${path}`);
    });

    const result = await submitResendBroadcast({
      jobId: "new-job",
      senderEmail: "newsletter@example.com",
      subject: "Promozione",
      body: "<p>Ciao</p>",
      recipients: [{ email: "client@example.com" }],
    });

    expect(result).toMatchObject({ eligibleCount: 1, excludedCount: 0 });
    expect(proxy.mock.calls.some(([, path, options]) => path === "/segments" && options.method === "POST")).toBe(false);
    expect(proxy.mock.calls.some(([, path, options]) => path === "/segments/current" && options.method === "PATCH")).toBe(false);
    expect(proxy.mock.calls.some(([, path, options]) => path === "/contacts/old-contact/segments/current" && options.method === "DELETE")).toBe(true);
    expect(proxy.mock.calls.some(([, path]) => path === "/contacts/old-contact")).toBe(false);
    expect(proxy.mock.calls.some(([, path, options]) => path === "/contacts/selected-contact/segments/current" && options.method === "POST")).toBe(true);
    const broadcast = proxy.mock.calls.find(([, path]) => path === "/broadcasts");
    expect(JSON.parse(broadcast![2].body)).toMatchObject({ segment_id: "current" });
  });

  it("rinomina un vecchio segmento creato dalle campagne se il piano è pieno", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => mockClock += 1000);
    proxy.mockImplementation(async (_provider, path, options) => {
      if (path.startsWith("/domains")) return Response.json({ data: [
        { name: "example.com", status: "verified", capabilities: { sending: "enabled" } },
      ] });
      if (path.startsWith("/topics?")) return Response.json({ data: [
        { id: "topic", name: "Image Studio - Comunicazioni promozionali" },
      ] });
      if (path.startsWith("/segments?")) return Response.json({ data: [
        { id: "manual-a", name: "Clienti storici" },
        { id: "legacy-campaign", name: "Image Studio campagna previous-job" },
        { id: "manual-b", name: "Contatti fiera" },
      ] });
      if (path.startsWith("/broadcasts?")) return Response.json({ data: [] });
      if (path === "/segments/legacy-campaign" && options.method === "PATCH") {
        expect(JSON.parse(options.body)).toEqual({ name: "Campagna corrente" });
        return Response.json({ id: "legacy-campaign", name: "Campagna corrente" });
      }
      if (path === "/segments/legacy-campaign/contacts?limit=100") return Response.json({ data: [] });
      if (path === "/contacts/new%40example.com") return Response.json({}, { status: 404 });
      if (path === "/contacts") return Response.json({ id: "new-contact" });
      if (path === "/broadcasts") return Response.json({ id: "broadcast" });
      if (path === "/broadcasts/broadcast/send") return Response.json({ id: "broadcast" });
      throw new Error(`Unexpected request: ${options.method} ${path}`);
    });

    await submitResendBroadcast({
      jobId: "new-job",
      senderEmail: "newsletter@example.com",
      subject: "Promozione",
      body: "<p>Ciao</p>",
      recipients: [{ email: "new@example.com" }],
    });

    expect(proxy.mock.calls.some(([, path, options]) => path === "/segments/legacy-campaign" && options.method === "PATCH")).toBe(true);
    expect(proxy.mock.calls.some(([, path, options]) => path === "/segments" && options.method === "POST")).toBe(false);
    expect(proxy.mock.calls.some(([, path]) => path === "/broadcasts")).toBe(true);
  });

  it("mostra un messaggio chiaro se il limite dei segmenti è pieno e non tocca altri segmenti", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => mockClock += 1000);
    proxy.mockImplementation(async (_provider, path, options) => {
      if (path.startsWith("/domains")) return Response.json({ data: [
        { name: "example.com", status: "verified", capabilities: { sending: "enabled" } },
      ] });
      if (path.startsWith("/topics?")) return Response.json({ data: [
        { id: "topic", name: "Image Studio - Comunicazioni promozionali" },
      ] });
      if (path.startsWith("/segments?")) return Response.json({ data: [
        { id: "manual-a", name: "Clienti storici" },
        { id: "manual-b", name: "Contatti fiera" },
        { id: "manual-c", name: "Fotografi" },
      ] });
      if (path.startsWith("/broadcasts?")) return Response.json({ data: [] });
      if (path === "/segments" && options.method === "POST") {
        return Response.json({ message: "Your plan includes 3 segments" }, { status: 400 });
      }
      throw new Error(`Unexpected request: ${options.method} ${path}`);
    });

    await expect(submitResendBroadcast({
      jobId: "job",
      senderEmail: "newsletter@example.com",
      subject: "Promozione",
      body: "<p>Ciao</p>",
      recipients: [{ email: "client@example.com" }],
    })).rejects.toThrow(
      "Il piano Resend consente al massimo 3 segmenti. Non ho trovato un vecchio segmento di campagne Image Studio da riutilizzare",
    );
    expect(proxy.mock.calls.some(([, path]) => path.startsWith("/contacts/"))).toBe(false);
    expect(proxy.mock.calls.some(([, path]) => path === "/broadcasts")).toBe(false);
    expect(proxy.mock.calls.some(([, path, options]) => path.startsWith("/segments/manual-") && options.method === "PATCH")).toBe(false);
  });

  it("ricostruisce i destinatari del job prima di riprendere un draft sul segmento condiviso", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => mockClock += 1000);
    proxy.mockImplementation(async (_provider, path, options) => {
      if (path.startsWith("/domains")) return Response.json({ data: [
        { name: "example.com", status: "verified", capabilities: { sending: "enabled" } },
      ] });
      if (path === "/broadcasts/existing") return Response.json({
        id: "existing",
        status: "draft",
        segment_id: "current",
      });
      if (path === "/segments/current") return Response.json({
        id: "current",
        name: "Campagna corrente",
      });
      if (path.startsWith("/broadcasts?")) return Response.json({ data: [] });
      if (path.startsWith("/topics?")) return Response.json({ data: [
        { id: "topic", name: "Image Studio - Comunicazioni promozionali" },
      ] });
      if (path === "/segments/current/contacts?limit=100") return Response.json({ data: [
        { id: "other-campaign-contact", email: "other@example.com" },
      ] });
      if (path === "/contacts/other-campaign-contact/segments/current" && options.method === "DELETE") {
        return Response.json({ deleted: true });
      }
      if (path === "/contacts/original%40example.com") return Response.json({
        id: "original-contact",
        email: "original@example.com",
        unsubscribed: false,
      });
      if (path === "/contacts/original-contact/topics?limit=100") return Response.json({ data: [
        { id: "topic", subscription: "opt_in" },
      ] });
      if (path === "/contacts/original-contact/segments?limit=100") return Response.json({ data: [] });
      if (path === "/contacts/original-contact/segments/current" && options.method === "POST") {
        return Response.json({ id: "current" });
      }
      if (path === "/broadcasts/existing/send") return Response.json({ id: "existing" });
      throw new Error(`Unexpected request: ${options.method} ${path}`);
    });

    const result = await submitResendBroadcast({
      jobId: "old-job",
      senderEmail: "newsletter@example.com",
      subject: "Promozione",
      body: "<p>Ciao</p>",
      recipients: [{ email: "original@example.com" }],
      existing: {
        providerTopicId: "topic",
        providerSegmentId: "current",
        providerBroadcastId: "existing",
        preparedCount: 1,
      },
    });

    expect(result).toMatchObject({ broadcastId: "existing", providerStatus: "queued", eligibleCount: 1 });
    expect(proxy.mock.calls.some(([, path, options]) => path === "/contacts/other-campaign-contact/segments/current" && options.method === "DELETE")).toBe(true);
    expect(proxy.mock.calls.some(([, path, options]) => path === "/contacts/original-contact/segments/current" && options.method === "POST")).toBe(true);
    expect(proxy.mock.calls.some(([, path]) => path === "/broadcasts")).toBe(false);
    expect(proxy.mock.calls.some(([, path]) => path === "/broadcasts/existing/send")).toBe(true);
  });

  it("non svuota il segmento finché un invio precedente è ancora in coda", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => mockClock += 1000);
    proxy.mockImplementation(async (_provider, path) => {
      if (path.startsWith("/domains")) return Response.json({ data: [
        { name: "example.com", status: "verified", capabilities: { sending: "enabled" } },
      ] });
      if (path.startsWith("/topics?")) return Response.json({ data: [
        { id: "topic", name: "Image Studio - Comunicazioni promozionali" },
      ] });
      if (path.startsWith("/segments?")) return Response.json({ data: [
        { id: "current", name: "Campagna corrente" },
      ] });
      if (path.startsWith("/broadcasts?")) return Response.json({ data: [
        { id: "previous", segment_id: "current", status: "queued" },
      ] });
      throw new Error(`Unexpected request: ${path}`);
    });

    await expect(submitResendBroadcast({
      jobId: "next-job",
      senderEmail: "newsletter@example.com",
      subject: "Promozione",
      body: "<p>Ciao</p>",
      recipients: [{ email: "next@example.com" }],
    })).rejects.toThrow(
      "Per non inviare ai destinatari sbagliati, attendi che l’invio finisca",
    );
    expect(proxy.mock.calls.some(([, path]) => path.includes("/contacts/") && path.endsWith("/segments/current"))).toBe(false);
    expect(proxy.mock.calls.some(([, path]) => path === "/broadcasts")).toBe(false);
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
