import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.ADMIN_PASSKEY_E2E_BASE_URL ?? "http://localhost:4179";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "admin-passkey.e2e.spec.ts",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "/tmp/image-studio-admin-passkey-playwright",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});