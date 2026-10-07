import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: 'notifications.spec.ts',
  outputDir: '/tmp/image-studio-print-notifications-results',
  webServer: {
    command: 'pnpm exec vite --config e2e/print-deferred-harness/vite.config.ts',
    cwd: new URL('../../', import.meta.url).pathname,
    env: { PORT: '4192' },
    url: 'http://127.0.0.1:4192',
    reuseExistingServer: true,
  },
});