import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.QUOTE_PUBLIC_DUPLICATES_E2E_PORT ?? "4185");
const baseURL = `http://127.0.0.1:${port}`;
const systemChromium = "/repl/tools/bin/chromium";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "quote-public-duplicate-products.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "/tmp/image-studio-quote-public-duplicate-products-playwright",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    headless: true,
    launchOptions: existsSync(systemChromium)
      ? { executablePath: systemChromium }
      : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `PORT=${port} BASE_PATH=/ pnpm --filter @workspace/image-studio-web run dev`,
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
