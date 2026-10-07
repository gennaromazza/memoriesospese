import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: 'customer-status.spec.ts',
  outputDir: '/tmp/image-studio-customer-status-results',
  use: {
    ...base.use,
    viewport: { width: 1024, height: 576 },
  },
});