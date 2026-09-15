import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import { createMockupHarnessServer } from './mockup-harness/vite-server.mjs';

const root = process.cwd();
const vite = await createMockupHarnessServer(root);
let browser;

async function verifyRenderer(browser, port, renderer) {
  const errors = [];
  const failedRequests = [];
  const assetRequests = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    if (request.url().includes('spigato-beje')) assetRequests.push(request.url());
  });
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));

  await page.goto(`http://127.0.0.1:${port}${renderer.path}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true', undefined, { timeout: 90000 });
  const spigatoFamily = page.locator(renderer.materialFamilySelector).filter({ hasText: 'Spigato' });
  await spigatoFamily.locator('summary').dispatchEvent('click');
  await page.getByRole('button', { name: 'Spigato Beje', exact: true }).dispatchEvent('click');
  await page.waitForFunction(expected => document.body.dataset.ready === 'true' && document.getElementById('materialLabel')?.textContent?.includes(expected), renderer.materialReadyText);

  assert.equal(await page.locator('#configurationSummary').textContent().then(text => text?.includes(renderer.summaryText)), true);
  assert.equal(await page.locator('#downloadClient').isDisabled(), false);
  assert.equal(assetRequests.some(url => url.endsWith('/spigato-beje-r2.png')), true, `${renderer.name}: texture colore r2 non richiesta`);
  assert.equal(assetRequests.some(url => url.endsWith('/spigato-beje-height-r2.png')), true, `${renderer.name}: height map r2 non richiesta`);
  assert.equal(assetRequests.some(url => /spigato-beje(?:-height)?\.png$/.test(url)), false, `${renderer.name}: richiesto un asset precedente a r2`);

  if (renderer.closeUp) await renderer.closeUp(page);
  await page.waitForTimeout(250);
  const closeUp = await page.locator('#viewport').evaluate(canvas => canvas.toDataURL('image/jpeg', .9));
  assert.match(closeUp, /^data:image\/jpeg;base64,.{1000,}$/, `${renderer.name}: la verifica ravvicinata del canvas è vuota`);

  const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.locator('#downloadClient').dispatchEvent('click');
  const download = await downloadPromise;
  const report = fs.readFileSync(await download.path(), 'utf8');
  assert.match(report, /Spigato Beje/);
  assert.ok((report.match(new RegExp(`data:image\\/${renderer.exportedImageType};base64,`, 'g')) || []).length >= renderer.minimumExportedViews, `${renderer.name}: export privo delle viste renderizzate attese`);
  await page.waitForFunction(() => document.getElementById('downloadStatus')?.textContent?.includes('File preparato'));
  assert.deepEqual(errors, [], `${renderer.name} · errori browser: ${errors.join(' | ')}`);
  assert.deepEqual(failedRequests, [], `${renderer.name} · richieste fallite: ${failedRequests.join(' | ')}`);
  await page.close();
}

try {
  await vite.listen();
  const port = vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  await verifyRenderer(browser, port, {
    name: 'Custodia v1',
    path: '/mockups/custodia-v1/index.html',
    materialFamilySelector: 'details.material-category',
    materialReadyText: 'PL-SPIGATO-BEJE',
    summaryText: 'Spigato · Spigato Beje',
    minimumExportedViews: 8,
    exportedImageType: 'png',
    closeUp: page => page.locator('#plus').dispatchEvent('click'),
  });
  await verifyRenderer(browser, port, {
    name: 'Girevole v4',
    path: '/mockups/girevole-v4/index.html',
    materialFamilySelector: 'details.category',
    materialReadyText: 'Spigato Beje',
    summaryText: 'Tessuto: Spigato Beje',
    minimumExportedViews: 8,
    exportedImageType: 'jpeg',
    closeUp: async page => {
      await page.locator('#rotate').dispatchEvent('click');
      await page.locator('#rotation').evaluate(input => {
        input.value = '70';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      for (let index = 0; index < 3; index += 1) await page.locator('#plus').dispatchEvent('click');
    },
  });
  console.log('Spigato Beje OK: Custodia v1 e Girevole v4 hanno caricato colore/height r2, vista ravvicinata ed export senza errori.');
} finally {
  await browser?.close();
  await vite.close();
}