import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const port = Number(process.env.JOB_FLOW_E2E_PORT || 4179);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('JOB_FLOW_E2E_PORT must be a valid port between 1024 and 65535');
}
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: '.',
  testMatch: 'job-flow.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  outputDir: '/tmp/image-studio-desktop-job-flow',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    viewport: { width: 1440, height: 1100 },
    serviceWorkers: 'block',
    launchOptions: existsSync('/repl/tools/bin/chromium')
      ? { executablePath: '/repl/tools/bin/chromium' } : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm --filter @workspace/image-studio-desktop exec vite --config tests/job-flow/vite.config.ts --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});