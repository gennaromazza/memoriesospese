import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.QUOTE_BUILDER_LIFECYCLE_E2E_PORT ?? 4185);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("QUOTE_BUILDER_LIFECYCLE_E2E_PORT must be a valid port between 1024 and 65535.");
}

const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "quote-builder-lifecycle.spec.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  outputDir: "/tmp/image-studio-quote-builder-lifecycle-playwright",
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
      `PORT=${port} BASE_PATH=/ ` +
      "VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 " +
      "VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 " +
      "VITE_QUOTE_BUILDER_LIFECYCLE_E2E_HARNESS=true " +
      "pnpm --filter @workspace/image-studio-web run dev",
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
