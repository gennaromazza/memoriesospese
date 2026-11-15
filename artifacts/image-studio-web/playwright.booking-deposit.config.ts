import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.BOOKING_DEPOSIT_E2E_PORT ?? "4193");
const baseURL = `http://127.0.0.1:${port}`;
const systemChromium = "/repl/tools/bin/chromium";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "booking-deposit-browser.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "/tmp/image-studio-booking-deposit-playwright",
  use: {
    ...devices["Desktop Chrome"],
    browserName: "chromium",
    launchOptions: {
      ...(existsSync(systemChromium) ? { executablePath: systemChromium } : {}),
    },
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `PORT=${port} pnpm exec vite --config e2e/booking-deposit-harness/vite.config.ts`,
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
