import { defineConfig, devices } from "@playwright/test";

/**
 * Configurazione isolata per il test Blog Admin.
 *
 * Il test monta un harness dev-only e blocca a livello di rete Firestore e
 * Storage: non richiede login, credenziali o un database di prova.
 */
const PORT = process.env.E2E_BLOG_APP_PORT || "5002";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /blog-admin-alt\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT,
      VITE_BLOG_E2E_HARNESS: "true",
      // Non condividere la porta HMR con il workflow dev principale.
      VITE_HMR_PORT: "24679",
    },
  },
});