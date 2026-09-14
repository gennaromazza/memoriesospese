import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import { createMockupHarnessServer } from './mockup-harness/vite-server.mjs';

const root = process.cwd();
const vite = await createMockupHarnessServer(root);
let browser;
const errors = [];
const failedRequests = [];

try {
  await vite.listen();
  const port = vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));

  await page.goto(`http://127.0.0.1:${port}/mockups/custodia-v1/index.html`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true', undefined, { timeout: 90000 });
  const spigatoFamily = page.locator('details.material-category').filter({ hasText: 'Spigato' });
  await spigatoFamily.locator('summary').dispatchEvent('click');
  const spigatoButton = page.getByRole('button', { name: 'Spigato Beje', exact: true });
  await spigatoButton.dispatchEvent('click');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && document.getElementById('materialLabel')?.textContent?.includes('PL-SPIGATO-BEJE'));
  assert.equal(await page.locator('#configurationSummary').textContent().then(text => text?.includes('Spigato · Spigato Beje')), true);
  assert.equal(await page.locator('#downloadClient').isDisabled(), false);

  const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.locator('#downloadClient').dispatchEvent('click');
  const download = await downloadPromise;
  const report = fs.readFileSync(await download.path(), 'utf8');
  assert.match(report, /Spigato Beje/);
  await page.waitForFunction(() => document.getElementById('downloadStatus')?.textContent?.includes('File preparato'));
  assert.deepEqual(errors, [], `Errori browser: ${errors.join(' | ')}`);
  assert.deepEqual(failedRequests, [], `Richieste fallite: ${failedRequests.join(' | ')}`);
  console.log('Spigato Beje OK: renderer pronto, asset caricati, riepilogo e export reale verificati.');
} finally {
  await browser?.close();
  await vite.close();
}