import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: 'payment-handoff.spec.ts',
  outputDir: fileURLToPath(new URL('../../../../generated-artifacts/print-payment/', import.meta.url)),
  use: { ...base.use, viewport: { width: 1280, height: 720 } },
});
