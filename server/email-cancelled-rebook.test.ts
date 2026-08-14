/**
 * Test: POST /api/email/send-consultation-cancelled
 * Verifica che il pulsante "Scegli un nuovo orario" non possa MAI puntare a
 * URL arbitrari forniti dal client, e che con un templateId valido l'URL
 * venga costruito server-side sul dominio del sito.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";

const h = vi.hoisted(() => ({
  sentMessages: [] as any[],
  getTemplateById: vi.fn(),
}));

vi.mock("./firebase-admin.js", () => ({
  db: new Proxy(
    {},
    {
      get: () => () => ({
        add: async () => ({ id: "log1" }),
        doc: () => ({ get: async () => ({ exists: false }) }),
      }),
    },
  ),
  Timestamp: {},
  FieldValue: {},
  storage: {},
}));

vi.mock("./services/consultations.js", () => ({
  getTemplateById: (...args: any[]) => h.getTemplateById(...args),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    gmail: () => ({
      users: {
        messages: {
          send: async (args: any) => {
            h.sentMessages.push(args);
            return { data: { id: "msg1" } };
          },
        },
      },
    }),
  },
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // SITE_URL volutamente NON impostata: l'URL deve cadere sul dominio
  // di produzione fisso, mai su header della request (Host falsificabile)
  delete process.env.SITE_URL;
  process.env.REPL_IDENTITY = "test-identity";

  // Mock fetch globale: connector Gmail + Firestore REST (studio info)
  vi.stubGlobal("fetch", async (url: any) => {
    const u = String(url);
    if (u.includes("/api/v2/connection")) {
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              settings: {
                access_token: "fake-token",
                expires_at: new Date(Date.now() + 3600_000).toISOString(),
              },
            },
          ],
        }),
      };
    }
    // Firestore REST (studio info): non ok → fallback default
    return { ok: false, json: async () => ({}) };
  });

  const emailRoutes = await import("./email-routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/email", emailRoutes.default);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as any;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  server?.close();
  vi.unstubAllGlobals();
});

function decodeLastEmailHtml(): string {
  const last = h.sentMessages[h.sentMessages.length - 1];
  expect(last).toBeTruthy();
  const raw: string = last.requestBody.raw;
  return Buffer.from(
    raw.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf-8");
}

async function postCancelled(body: Record<string, any>) {
  return fetchOriginal(`${baseUrl}/api/email/send-consultation-cancelled`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Host forgiato da attaccante: NON deve mai finire nel link email
      "x-forwarded-host": "evil-host.example",
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({
      recipientEmail: "cliente@example.com",
      clienteName: "Mario Rossi",
      jobType: "Matrimonio",
      consultationDate: "10 settembre 2026",
      consultationTime: "10:00 - 11:00",
      ...body,
    }),
  });
}

// fetch reale verso il server locale (il globale è stubbato)
import { request as httpRequest } from "http";
function fetchOriginal(url: string, opts: any): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpRequest(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: opts.method,
        headers: opts.headers,
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode || 0 }));
      },
    );
    req.on("error", reject);
    req.end(opts.body);
  });
}

describe("send-consultation-cancelled rebook link security", () => {
  it("ignora un rebookUrl arbitrario passato dal client (no link esterni)", async () => {
    h.sentMessages.length = 0;
    const res = await postCancelled({
      rebookUrl: "https://evil.example/phish",
    });
    expect(res.status).toBe(200);
    const html = decodeLastEmailHtml();
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("Scegli un nuovo orario");
    expect(html).toContain("contattaci direttamente");
  });

  it("costruisce l'URL server-side canonico, ignorando Host/x-forwarded-host forgiati", async () => {
    h.sentMessages.length = 0;
    h.getTemplateById.mockResolvedValueOnce({
      id: "tpl1",
      jobType: "Matrimonio",
      attiva: true,
    });
    const res = await postCancelled({ rebookTemplateId: "tpl1" });
    expect(res.status).toBe(200);
    const html = decodeLastEmailHtml();
    expect(html).toContain("Scegli un nuovo orario");
    expect(html).toContain(
      "https://imagestudiofotografico.replit.app/consulenze/Matrimonio/tpl1/prenota",
    );
    // Nessun host forgiato o loopback nel link
    expect(html).not.toContain("evil-host.example");
    expect(html).not.toContain("localhost");
    expect(html).not.toContain("127.0.0.1");
  });

  it("omette il pulsante se il template non esiste o non è attivo", async () => {
    h.sentMessages.length = 0;
    h.getTemplateById.mockResolvedValueOnce({
      id: "tpl2",
      jobType: "Matrimonio",
      attiva: false,
    });
    const res = await postCancelled({ rebookTemplateId: "tpl2" });
    expect(res.status).toBe(200);
    const html = decodeLastEmailHtml();
    expect(html).not.toContain("Scegli un nuovo orario");
    expect(html).toContain("contattaci direttamente");
  });
});
