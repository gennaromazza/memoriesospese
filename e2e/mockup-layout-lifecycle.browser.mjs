// Verifica il cleanup del layout wizard senza avviare renderer 3D, export o preflight GPU.
// node e2e/mockup-layout-lifecycle.browser.mjs
import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import path from 'node:path';
import { runLayoutLifecycle } from './mockup-layout-lifecycle.mjs';

const root = process.cwd();
const vite = await createServer({
  configFile: false,
  root: path.join(root, 'e2e/mockup-harness'),
  publicDir: path.join(root, 'client/public'),
  plugins: [
    {
      name: 'mockup-test-firebase',
      enforce: 'pre',
      resolveId(source, importer) {
        if (
          source === '@/lib/firebase' ||
          source.replaceAll('\\', '/').endsWith('/client/src/lib/firebase') ||
          (source === './firebase' && importer?.replaceAll('\\', '/').includes('/client/src/lib/'))
        ) {
          return path.join(root, 'e2e/mockup-harness/firebase.ts');
        }
      },
    },
    react(),
  ],
  resolve: { alias: { '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared') } },
  css: { postcss: path.join(root, 'postcss.config.js') },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
});

let browser;
let lifecycleStage = 'harness setup';
try {
  await vite.listen();
  const port = vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));

  lifecycleStage = 'wizard layout replacement lifecycle';
  await runLayoutLifecycle({ page, port });
  assert.deepEqual(browserErrors, []);
  console.log('Browser OK: cleanup del layout wizard verificato in modalità desktop e mobile.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error) error.message = `Mockup layout lifecycle regression at "${lifecycleStage}": ${message}`;
  throw error;
} finally {
  await browser?.close();
  await vite.close();
}