import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: ".",
  testMatch: "deferred-payment.spec.ts",
  outputDir: "/tmp/image-studio-print-deferred-results",
  workers: 1,
  timeout: 100_000,
  use: {
    baseURL: "http://127.0.0.1:4192",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : undefined,
  },
  webServer: {
    command: "pnpm exec vite --config e2e/print-deferred-harness/vite.config.ts",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: { PORT: "4192" },
    url: "http://127.0.0.1:4192",
    reuseExistingServer: false,
  },
});