import { execFileSync } from "node:child_process";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { createServer as createHttpsServer } from "node:https";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testHostname = "imagestudiofotografico.com";

/**
 * Serve the local Vite app on a secure origin with the production RP hostname.
 * The browser maps this hostname to loopback; no production host is contacted.
 */
export async function createLocalProductionOrigin(upstreamPort = 4179): Promise<{
  origin: string;
  port: number;
  close: () => Promise<void>;
}> {
  const certDir = mkdtempSync(join(tmpdir(), "admin-passkey-e2e-cert-"));
  const keyPath = join(certDir, "key.pem");
  const certPath = join(certDir, "cert.pem");

  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      `/CN=${testHostname}`,
      "-addext",
      `subjectAltName=DNS:${testHostname}`,
    ],
    { stdio: "ignore" },
  );

  const server = createHttpsServer({
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
  }, (incoming, outgoing) => {
    const upstream = httpRequest({
      hostname: "127.0.0.1",
      port: upstreamPort,
      method: incoming.method,
      path: incoming.url,
      headers: {
        ...incoming.headers,
        host: `127.0.0.1:${upstreamPort}`,
      },
    }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });

    upstream.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end("Local Vite server unavailable");
    });
    incoming.pipe(upstream);
  });

  server.on("upgrade", (incoming, clientSocket, head) => {
    const upstreamSocket = connect(upstreamPort, "127.0.0.1", () => {
      const headers = Object.entries(incoming.headers)
        .filter(([name]) => name.toLowerCase() !== "host")
        .map(([name, value]) => {
          const formatted = Array.isArray(value) ? value.join(", ") : value;
          return `${name}: ${formatted ?? ""}`;
        });
      upstreamSocket.write([
        `GET ${incoming.url ?? "/"} HTTP/1.1`,
        `Host: 127.0.0.1:${upstreamPort}`,
        ...headers,
        "",
        "",
      ].join("\r\n"));
      if (head.length) upstreamSocket.write(head);
      clientSocket.pipe(upstreamSocket).pipe(clientSocket);
    });
    upstreamSocket.on("error", () => clientSocket.destroy());
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(certDir, { recursive: true, force: true });
    throw new Error("Could not start local HTTPS passkey test origin");
  }

  return {
    origin: `https://${testHostname}:${address.port}`,
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      rmSync(certDir, { recursive: true, force: true });
    },
  };
}
