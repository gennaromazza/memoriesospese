import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const port = Number(process.env.FINANCE_E2E_PORT || 4179);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./e2e", testMatch: "financial-dashboard.spec.ts",
  timeout: 60_000, expect: { timeout: 15_000 }, workers: 1, reporter: "list",
  outputDir: "/tmp/image-studio-finance-playwright",
  use: {
    ...devices["Desktop Chrome"], baseURL, headless: true,
    launchOptions: existsSync("/repl/tools/bin/chromium") ? { executablePath: "/repl/tools/bin/chromium" } : undefined,
    screenshot: "only-on-failure", trace: "retain-on-failure",
  },
  webServer: {
    command: `PORT=${port} BASE_PATH=/ VITE_FINANCE_E2E_HARNESS=true pnpm --filter @workspace/image-studio-web run dev`,
    url: `${baseURL}/`, reuseExistingServer: false, timeout: 120_000,
  },
});