import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createBulkEmailJsonParser } from "./bulk-email-body-parser.js";

describe("bulk email request size", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
    server = undefined;
  });

  it("accepts the recipient payload for a 983-contact campaign", async () => {
    const app = express();
    app.use("/api/bulk-email", createBulkEmailJsonParser());
    app.use(express.json());
    app.post("/api/bulk-email/send-resend", (req, res) => {
      res.json({ count: req.body.recipients.length });
    });

    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server has no TCP address");

    const recipients = Array.from({ length: 983 }, (_, index) => ({
      email: `cliente-${index}-${"x".repeat(35)}@example.com`,
      nome: `Nome cliente ${index} ${"x".repeat(20)}`,
      cognome: `Cognome cliente ${index} ${"y".repeat(20)}`,
      clientId: `client-${index}-${"z".repeat(24)}`,
    }));
    const payload = JSON.stringify({ subject: "Shooting Natalizio", body: "<p>Invito</p>", recipients });
    expect(Buffer.byteLength(payload)).toBeGreaterThan(100 * 1024);

    const response = await fetch(`http://127.0.0.1:${address.port}/api/bulk-email/send-resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ count: 983 });
  });
});
