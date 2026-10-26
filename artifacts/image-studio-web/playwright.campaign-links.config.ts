import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const port = Number(process.env.CAMPAIGN_LINKS_E2E_PORT || 4182);
const apiPort = Number(process.env.CAMPAIGN_LINKS_API_PORT || 4183);
const baseURL = `http://127.0.0.1:${port}`;
const apiBaseURL = `http://127.0.0.1:${apiPort}`;
const systemChromium = "/repl/tools/bin/chromium";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "campaign-links.e2e.spec.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  outputDir: "/tmp/image-studio-campaign-links-playwright",
  use: {
    ...devices["Desktop Chrome"],
    browserName: "chromium",
    launchOptions: existsSync(systemChromium)
      ? { executablePath: systemChromium }
      : undefined,
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command:
        `PORT=${apiPort} FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 ` +
        "FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 " +
        "pnpm --filter @workspace/api-server run dev",
      url: `${apiBaseURL}/api/healthz`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command:
        `PORT=${port} BASE_PATH=/ ` +
        "VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 " +
        "VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 " +
        `VITE_API_PROXY_TARGET=${apiBaseURL} ` +
        "pnpm exec vite --config e2e/campaign-links-harness/vite.config.ts",
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
