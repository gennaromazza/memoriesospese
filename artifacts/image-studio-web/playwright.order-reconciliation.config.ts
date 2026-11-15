import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const port = 4194;
export default defineConfig({
  testDir: './e2e', testMatch: 'order-reconciliation.spec.ts',
  workers: 1, timeout: 60_000, expect: { timeout: 15_000 },
  outputDir: '/tmp/image-studio-order-reconciliation',
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true,
    launchOptions: existsSync('/repl/tools/bin/chromium') ? { executablePath: '/repl/tools/bin/chromium' } : {},
    screenshot: 'only-on-failure' },
  webServer: {
    command: `PORT=${port} pnpm exec vite --config e2e/order-reconciliation-harness/vite.config.ts`,
    cwd: fileURLToPath(new URL('.', import.meta.url)), url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false, timeout: 60_000,
  },
});
