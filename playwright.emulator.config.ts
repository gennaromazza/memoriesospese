import { defineConfig, devices } from "@playwright/test";

/**
 * Configurazione Playwright per i test e2e che scrivono su Firestore
 * (es. e2e/gallery-excluded-chapters.spec.ts).
 *
 * Questi test girano ESCLUSIVAMENTE contro l'emulatore Firestore, mai contro
 * la produzione: i fixture hanno una guardia che rifiuta di partire senza
 * FIRESTORE_EMULATOR_HOST.
 *
 * Esecuzione:
 *   1. Avvia l'emulatore (serve Java nel PATH):
 *        firebase emulators:start --only firestore --project wedding-gallery-397b6
 *   2. Lancia i test:
 *        FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *          npx playwright test --config playwright.emulator.config.ts
 *
 * Playwright avvia un dev server dedicato sulla porta 5001 con le variabili
 * emulatore (client Vite: VITE_FIRESTORE_EMULATOR_HOST; server Admin SDK:
 * FIRESTORE_EMULATOR_HOST), separato dal dev server "vero" sulla 5000.
 */
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const PORT = process.env.E2E_EMULATOR_APP_PORT || "5001";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /gallery-excluded-chapters\.spec\.ts/,
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT,
      FIRESTORE_EMULATOR_HOST: EMULATOR_HOST,
      VITE_FIRESTORE_EMULATOR_HOST: EMULATOR_HOST,
      // Porta HMR dedicata: la 24678 di default è occupata dal dev server
      // principale e il client Vite forzerebbe reload continui della pagina.
      VITE_HMR_PORT: "24679",
    },
  },
});
