// Isolated UI regression: every API request is mocked; no Firestore data is used.
import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const origin = process.env.E2E_BASE_URL || 'http://127.0.0.1:80';
const photoId = '11111111-1111-4111-8111-111111111111';
const rendererId = '15870135-cc65-5c61-8db0-ccccd8529a77';
const materialId = '2224386b-262c-5756-96b9-9e458ab95a8f';
const configuration = { modelId: rendererId, assetRevision: 2, materialId, appearanceRevision: 4, coverLayout: 'oblique', topText: 'Album test', bottomText: '', photoAssetId: photoId, crop: { zoom: 1, x: .5, y: .5 } };
const option = { id: 'album-test', labId: 'lab-test', labName: 'Laboratorio test', name: 'Album test', rendererId, enabled: true, materials: [{ id: materialId, appearanceRevision: 4, label: 'Tessuto test', supplierCode: 'TEST', enabled: true }] };
const selection = { labId: option.labId, modelId: option.id };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=', 'base64');

try {
  for (const width of [1280, 390]) {
    let approvedAt;
    let posts = 0;
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const saved = { version: 1, revision: 3, configuration, selection, option, status: 'confirmed', updatedAt: '2026-10-24T10:00:00Z', ...(approvedAt ? { clientApproval: { revision: 3, approvedAt } } : {}) };
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (path.endsWith('/mockup/approve') && request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({ revision: 3 });
        posts++;
        if (width === 1280 && posts === 1) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Riprova la conferma di test' }) });
        approvedAt = '2026-10-24T10:30:00Z';
        return json({ ...saved, clientApproval: { revision: 3, approvedAt } });
      }
      if (request.method() !== 'GET') throw new Error(`Unexpected mutation: ${request.method()} ${path}`);
      if (path.includes('/mockup/photos/')) return route.fulfill({ contentType: 'image/png', body: png });
      if (path.endsWith('/gallery-photos')) return json({ photos: [], chapters: [] });
      if (path.endsWith('/mockup')) return json({ version: 1, mockupPath: 'studio', editable: false, enabled: true, approvalRequired: false, clientApprovalAllowed: true, saved, modelMode: 'fixed', modelSelection: selection, offer: { revision: 1, mode: 'fixed', options: [option], updatedAt: saved.updatedAt } });
      if (path.endsWith('/by-token/e2e-mockup-only')) return json({ photobook: { id: 'e2e-book', token: 'e2e-mockup-only', name: 'Album test', currentVersion: 1, versions: [{ version: 1, status: 'published' }], approval: { version: 1 }, mockupPath: 'studio', locked: false }, version: 1, pages: [], requests: [] });
      return json({});
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`${origin}/fotolibro/e2e-mockup-only/mockup?version=1`);
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Solo Necessari')?.click());
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    const approve = dialog.getByTestId('button-approve-mockup');
    await expect(approve).toBeDisabled();
    const checkbox = dialog.getByRole('checkbox');
    await expect(checkbox).toBeEnabled({ timeout: 60_000 });
    await checkbox.check();
    await expect(approve).toBeEnabled();
    await expect(dialog.getByRole('button', { name: 'Salva bozza', exact: true })).toHaveCount(0);
    await approve.click();
    if (width === 1280) {
      await expect(dialog.getByRole('alert')).toContainText('Riprova la conferma di test');
      await approve.click();
    }
    await expect(dialog.getByTestId('mockup-client-approved')).toBeVisible();
    const count = posts;
    await page.reload();
    await expect(page.getByRole('dialog').getByTestId('mockup-client-approved')).toBeVisible({ timeout: 30_000 });
    expect(posts).toBe(count);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/mockup-client-approved-${width}.png` });
    expect(pageErrors).toEqual([]);
    console.log(`PASS ${width}px: read-only viewer, consent, approval${width === 1280 ? ', error/retry' : ''}, reload, no overflow; ${posts} mocked POST(s).`);
    await context.close();
  }
} finally {
  await browser.close();
}
