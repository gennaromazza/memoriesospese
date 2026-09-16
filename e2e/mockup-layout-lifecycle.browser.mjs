// Verifica il cleanup del layout wizard senza avviare renderer 3D, export o preflight GPU.
// node e2e/mockup-layout-lifecycle.browser.mjs
import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';
import { runLayoutLifecycle } from './mockup-layout-lifecycle.mjs';
import { assertMockupHarnessConfig, createMockupHarnessServer } from './mockup-harness/vite-server.mjs';

const root = process.cwd();
const touchRendererTimeoutMs = 17_000;
let vite;
let touchConfigVite;
let browser;
let lifecycleStage = 'harness setup';
try {
  vite = await createMockupHarnessServer(root);
  touchConfigVite = await createMockupHarnessServer(root, {
    define: {
      'import.meta.env.VITE_MOCKUP_RENDERER_READY_TIMEOUT_MS': JSON.stringify(String(touchRendererTimeoutMs)),
    },
  });
  assertMockupHarnessConfig(vite, root);
  assertMockupHarnessConfig(touchConfigVite, root, { rendererTimeoutMs: touchRendererTimeoutMs });
  await touchConfigVite.close();
  touchConfigVite = undefined;

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
  await touchConfigVite?.close();
  await vite?.close();
}