import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const port = Number(process.env.JOB_COST_PAYMENT_E2E_PORT || 4181);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "job-cost-payment.e2e.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  outputDir: "/tmp/image-studio-job-cost-payment-playwright",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    headless: true,
    launchOptions: existsSync("/repl/tools/bin/chromium")
      ? { executablePath: "/repl/tools/bin/chromium" }
      : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      `PORT=${port} BASE_PATH=/ VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 ` +
      "VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 pnpm --filter @workspace/image-studio-web run dev",
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
