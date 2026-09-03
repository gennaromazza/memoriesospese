import { defineConfig, devices } from "@playwright/test";

/**
 * Configurazione Playwright per i test e2e.
 *
 * Non c'è uno script npm dedicato (package.json scripts è vietato modificarlo):
 * si lancia con `npx playwright test` (come vitest con `npx vitest run`).
 *
 * Il dev server gira già sulla porta 5000 (workflow "Dev Workflow"): con
 * `reuseExistingServer: true` Playwright lo riusa invece di avviarne un altro.
 */
const PORT = process.env.PORT || "5000";
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // I test che scrivono su Firestore girano SOLO con l'emulatore
  // (playwright.emulator.config.ts), mai contro la produzione.
  testIgnore: /gallery-excluded-chapters\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "webkit-ios",
      testMatch: /info-form-vendors\.spec\.ts/,
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
