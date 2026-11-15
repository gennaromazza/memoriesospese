import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const port = Number(process.env.PHOTOBOOK_SHIPMENT_E2E_PORT || 4197);
export default defineConfig({
  testDir: './e2e', testMatch: 'photobook-shipment.spec.ts',
  timeout: 45_000, expect: { timeout: 10_000 }, workers: 1,
  reporter: 'list', outputDir: '/tmp/photobook-shipment-tests',
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true,
    launchOptions: existsSync('/repl/tools/bin/chromium') ? { executablePath: '/repl/tools/bin/chromium' } : {},
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `PORT=${port} pnpm exec vite --config e2e/photobook-shipment-harness/vite.config.ts`,
    cwd: fileURLToPath(new URL('.', import.meta.url)), url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false, timeout: 60_000,
  },
});
