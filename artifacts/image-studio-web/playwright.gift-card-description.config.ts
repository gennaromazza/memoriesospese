import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const app = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.GIFT_CARD_DESCRIPTION_E2E_PORT ?? '4198');
const baseURL = `http://127.0.0.1:${port}`;
const systemChromium = '/repl/tools/bin/chromium';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'gift-card-description.e2e.spec.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: '/tmp/image-studio-gift-card-description-playwright',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    headless: true,
    launchOptions: existsSync(systemChromium) ? { executablePath: systemChromium } : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `PORT=${port} pnpm exec vite --config e2e/gift-card-description-harness/vite.config.ts`,
    cwd: app,
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
