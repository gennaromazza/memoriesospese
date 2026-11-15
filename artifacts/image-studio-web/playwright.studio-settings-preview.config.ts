import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.STUDIO_SETTINGS_E2E_PORT ?? "4183");

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("STUDIO_SETTINGS_E2E_PORT deve essere una porta valida tra 1024 e 65535.");
}

const baseURL = `http://127.0.0.1:${port}`;
const systemChromium = "/repl/tools/bin/chromium";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "studio-settings-preview.spec.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "/tmp/image-studio-studio-settings-preview-playwright",
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
    command: `PORT=${port} BASE_PATH=/ VITE_STUDIO_SETTINGS_E2E_HARNESS=true pnpm --filter @workspace/image-studio-web run dev`,
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
