import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "admin-passkey.e2e.spec.ts",
  grep: /device enrollment QR registers a new device without transferring admin access/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "/tmp/image-studio-admin-passkey-enrollment-playwright",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4179",
    headless: true,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "env -u REPL_ID PORT=4179 BASE_PATH=/ VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 pnpm exec vite --config vite.config.ts --host 127.0.0.1 --port 4179 --strictPort",
    cwd: "artifacts/image-studio-web",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
