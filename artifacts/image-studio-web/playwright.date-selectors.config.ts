import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const port = Number(process.env.DATE_PICKER_E2E_PORT ?? "4178");

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("DATE_PICKER_E2E_PORT deve essere una porta valida tra 1024 e 65535.");
}

const baseURL = `http://127.0.0.1:${port}`;
const systemChromiumPath = "/repl/tools/bin/chromium";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "date-selectors.spec.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "/tmp/image-studio-date-selector-playwright",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    headless: true,
    launchOptions: existsSync(systemChromiumPath)
      ? { executablePath: systemChromiumPath }
      : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `PORT=${port} BASE_PATH=/ VITE_DATE_PICKER_E2E_HARNESS=true pnpm --filter @workspace/image-studio-web run dev`,
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});