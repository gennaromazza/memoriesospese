import { defineConfig, devices } from "@playwright/test";

/**
 * Configurazione isolata per il test browser del fallback Real Wedding.
 * Il test intercetta tutte le API editoriali e non usa Firebase, Gemini o
 * altri servizi esterni.
 */
const PORT = process.env.E2E_WEDDING_APP_PORT || "5003";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /wedding-seo-draft-fallback\.spec\.ts/,
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
      VITE_WEDDING_E2E_HARNESS: "true",
      VITE_HMR_PORT: "24680",
    },
  },
});