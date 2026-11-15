import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.QUOTE_BUILDER_PRODUCTS_E2E_PORT ?? "4184");

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("QUOTE_BUILDER_PRODUCTS_E2E_PORT deve essere una porta valida tra 1024 e 65535.");
}

const baseURL = `http://127.0.0.1:${port}`;
const systemChromium = "/repl/tools/bin/chromium";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "quote-builder-products.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "/tmp/image-studio-quote-builder-products-playwright",
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
    command:
      `PORT=${port} BASE_PATH=/ ` +
      "VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 " +
      "VITE_QUOTE_BUILDER_PRODUCTS_E2E_HARNESS=true " +
      "pnpm --filter @workspace/image-studio-web run dev",
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
