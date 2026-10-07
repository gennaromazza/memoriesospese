import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PHOTOBOOK_CLIENT_E2E_PORT ?? "4179");

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("PHOTOBOOK_CLIENT_E2E_PORT deve essere una porta valida tra 1024 e 65535.");
}

const baseURL = `http://127.0.0.1:${port}`;
const systemChromium = "/repl/tools/bin/chromium";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "photobook-client.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "/tmp/image-studio-photobook-client-playwright",
  use: {
    ...devices["Pixel 7"],
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
    command: `PORT=${port} BASE_PATH=/ pnpm --filter @workspace/image-studio-web run dev`,
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});