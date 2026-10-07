import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: ".",
  testMatch: "save.spec.ts",
  outputDir: "/tmp/image-studio-gallery-save-results",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4188",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  webServer: {
    command: "pnpm exec vite --config e2e/edit-gallery-harness/vite.config.ts",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: { PORT: "4188" },
    url: "http://127.0.0.1:4188",
    reuseExistingServer: false,
  },
});