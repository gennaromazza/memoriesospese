import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../../lib/shared-src', import.meta.url)),
      // Cloud Functions regression tests import the preserved migration sources.
      'firebase-functions/v1': require.resolve('firebase-functions/v1'),
    },
  },
  test: {
    environment: 'node',
  },
});