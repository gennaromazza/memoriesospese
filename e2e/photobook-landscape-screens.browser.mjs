// Cattura le schermate reali del configuratore fotolibro (chooser, wizard, sola lettura)
// nei formati di riferimento: landscape mobile 844×390 e 1024×478, più desktop.
// Verifica anche che in landscape nulla venga coperto dalla barra azioni e che
// la schermata in sola lettura non esponga più azioni di invio/salvataggio.
import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createMockupHarnessServer } from './mockup-harness/vite-server.mjs';

const root = process.cwd();
const outDir = path.join(root, 'screenshots/photobook-landscape');
fs.mkdirSync(outDir, { recursive: true });
const catalog = JSON.parse(fs.readFileSync('client/public/mockups/custodia-v1/peppe-lab-catalog.json', 'utf8'));
const baseModel = catalog.models[0];
const material = catalog.variants[0];
const option = {
  ...baseModel, id: 'custodia', name: 'Custodia Studio', rendererId: baseModel.id, active: true,
  labId: 'lab', labName: 'Laboratorio test',
  materials: [{ id: material.id, label: material.label || 'Tessuto test', active: true }],
};
const rotatingOption = { ...option, id: 'album-girevole-test', name: 'Album girevole', rendererId: 'album-girevole' };
const secondOption = { ...option, id: 'album-alternativo', name: 'Album Alternativo' };
const rotatingConfiguration = {
  modelId: 'album-girevole', assetRevision: 4, materialId: material.id, appearanceRevision: material.appearanceRevision,
  coverLayout: 'plaque', frameFinish: 'fabric', topText: 'Anna e Marco', bottomText: 'Ricordi', photoAssetId: null,
  crop: { zoom: 1, x: 0.5, y: 0.5 }, backCover: 'fabric', backPhotoAssetId: null, backCrop: { zoom: 1, x: 0.5, y: 0.5 },
  engravingNames: { first: 'Anna', second: 'Marco' },
};

const viewports = [
  { name: 'landscape-844x390', viewport: { width: 844, height: 390 }, screen: { width: 390, height: 844 }, mobile: true },
  { name: 'landscape-1024x478', viewport: { width: 1024, height: 478 }, screen: { width: 478, height: 1024 }, mobile: true },
  { name: 'desktop-1366x800', viewport: { width: 1366, height: 800 }, screen: { width: 1366, height: 800 }, mobile: false },
];

// Portrait: il chooser resta la sola schermata utilizzabile; la barra azioni deve
// restare visibile e non coprire mai l'ultima card a fine scroll.
const portraitViewports = [
  { name: 'portrait-320x640', viewport: { width: 320, height: 640 } },
  { name: 'portrait-390x844', viewport: { width: 390, height: 844 } },
];

const vite = await createMockupHarnessServer(root);
let browser;
try {
  await vite.listen();
  const port = vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const scenario of viewports) {
    const context = await browser.newContext({ viewport: scenario.viewport, screen: scenario.screen, isMobile: scenario.mobile, hasTouch: scenario.mobile, deviceScaleFactor: 1 });
    if (scenario.mobile) {
      await context.addInitScript(() => {
        const nativeMatchMedia = window.matchMedia.bind(window);
        window.matchMedia = query => query === '(pointer: coarse)'
          ? { matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } }
          : nativeMatchMedia(query);
        Object.defineProperty(window.screen, 'orientation', { configurable: true, value: { type: 'landscape-primary', angle: 90, addEventListener() {}, removeEventListener() {} } });
      });
    }
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let state = { mode: 'choice', editable: true, saved: null };
    // Playwright valuta le route dall'ultima registrata: il catch-all va prima.
    await page.route('**/api/**', route => route.fulfill({ status: 404, json: { error: 'non previsto' } }));
    await page.route('**/api/photobooks/by-token/mockup-test-token/mockup**', route => {
      if (route.request().method() !== 'GET') return route.fulfill({ status: 409, json: { error: 'Solo lettura nel test' } });
      const options = state.mode === 'fixed' ? [rotatingOption] : [option, secondOption, rotatingOption];
      return route.fulfill({ json: {
        version: 1, editable: state.editable, enabled: true, saved: state.saved,
        offer: { revision: 1, updatedAt: new Date().toISOString(), mode: state.mode, options },
        modelMode: state.mode,
        modelSelection: state.mode === 'fixed' ? { labId: rotatingOption.labId, modelId: rotatingOption.id } : null,
      } });
    });

    const shot = name => page.screenshot({ path: path.join(outDir, `${scenario.name}-${name}.jpg`), type: 'jpeg', quality: 80 });
    const assertNoOverlap = async (label, cardsSelector, barSelector) => {
      const bar = await page.locator(barSelector).boundingBox();
      const viewportHeight = scenario.viewport.height;
      assert.ok(bar && bar.y + bar.height <= viewportHeight + 1, `${label}: barra azioni fuori schermo`);
      const firstCard = await page.locator(cardsSelector).first().boundingBox();
      assert.ok(firstCard && firstCard.y + firstCard.height <= bar.y + 1, `${label}: la prima card è coperta dalla barra azioni`);
      assert.ok(firstCard.y >= 0, `${label}: prima card sopra il viewport`);
    };

    // 1. Chooser, scelta libera: stage Modello, poi Copertina.
    await page.goto(`http://127.0.0.1:${port}/?client&case=chooser`);
    await page.getByTestId('photobook-mockup').waitFor();
    await page.getByRole('button', { name: /Apri mockup/ }).click();
    const chooser = page.getByTestId('mockup-model-chooser');
    if (scenario.mobile) {
      await chooser.waitFor();
      assert.equal(await chooser.getAttribute('data-chooser-stage'), 'models');
      await page.locator('.mockup-chooser-model-card img').first().waitFor();
      await page.waitForTimeout(600); // fine animazione apertura dialog
      await shot('chooser-modello');
      await assertNoOverlap('chooser modello', '.mockup-chooser-model-card', '.mockup-chooser-action-bar');
      const heading = await page.locator('#mockup-model-heading').boundingBox();
      assert.ok(heading && heading.height < scenario.viewport.height * 0.45, 'Titolo del chooser troppo ingombrante in landscape');
      await page.getByTestId(`mockup-model-${rotatingOption.id}`).click();
      assert.equal(await chooser.getAttribute('data-chooser-stage'), 'styles');
      await page.locator('.mockup-chooser-cover-card img').first().waitFor();
      await shot('chooser-copertina');
      await assertNoOverlap('chooser copertina', '.mockup-chooser-cover-card', '.mockup-chooser-action-bar');
      assert.ok(await page.locator('.mockup-chooser-cover-card').count() >= 2, 'Copertine non visibili');
      await page.locator('.mockup-chooser-cover-card').first().click();
      await page.locator('.mockup-chooser-primary').click();
      // 2. Wizard editabile nel renderer album-girevole.
      const frame = page.frameLocator('iframe[title^="Configuratore 3D"]');
      await frame.locator('body[data-wizard-layout="ready"]').waitFor({ timeout: 90000 });
      await page.waitForTimeout(1500);
      await shot('wizard-configura');
      assert.equal(await frame.locator('.wizard-mobile-actions').count(), 1, 'Azioni wizard mancanti');
    } else {
      const frame = page.frameLocator('iframe[title^="Configuratore 3D"]');
      await frame.locator('body[data-wizard-layout="ready"]').waitFor({ timeout: 90000 });
      await page.waitForTimeout(1500);
      await shot('wizard-configura');
    }

    // 3. Sola lettura (confermato) con album-girevole, 6 passaggi.
    state = { mode: 'fixed', editable: false, saved: {
      version: 1, revision: 3, updatedAt: new Date().toISOString(), updatedBy: 'admin', status: 'confirmed',
      configuration: rotatingConfiguration, selection: { labId: rotatingOption.labId, modelId: rotatingOption.id, coverLayout: 'plaque' }, option: rotatingOption,
    } };
    await page.goto(`http://127.0.0.1:${port}/?client&case=readonly`);
    await page.getByTestId('photobook-mockup').waitFor();
    await page.getByRole('button', { name: /Apri mockup/ }).click();
    const frame = page.frameLocator('iframe[title^="Configuratore 3D"]');
    await frame.locator('body[data-wizard-layout="ready"][data-wizard-readonly="true"]').waitFor({ timeout: 90000 });
    await page.waitForTimeout(1500);
    await shot('sola-lettura');
    assert.equal(await page.getByRole('button', { name: /Invia allo studio/ }).count(), 0, 'Invia allo studio visibile in sola lettura (pagina)');
    assert.equal(await page.getByRole('button', { name: /Salva bozza/ }).count(), 0, 'Salva bozza visibile in sola lettura (pagina)');
    assert.equal(await frame.getByRole('button', { name: /Invia allo studio/ }).count(), 0, 'Invia allo studio visibile in sola lettura (iframe)');
    assert.equal(await frame.getByRole('button', { name: /Salva bozza/ }).count(), 0, 'Salva bozza visibile in sola lettura (iframe)');
    const asideLabel = await frame.locator('aside').evaluate(el => getComputedStyle(el, '::before').content);
    assert.match(asideLabel, /SOLA LETTURA/, `Intestazione pannello iframe non aggiornata: ${asideLabel}`);
    assert.equal(await frame.getByText('Versione del modello non supportata').count(), 0, 'Messaggio di versione non supportata in sola lettura');
    assert.deepEqual(errors, [], `Errori browser (${scenario.name})`);
    await context.close();
    console.log(`✓ ${scenario.name}`);
  }

  for (const scenario of portraitViewports) {
    const context = await browser.newContext({ viewport: scenario.viewport, screen: scenario.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = query => query === '(pointer: coarse)'
        ? { matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } }
        : nativeMatchMedia(query);
      Object.defineProperty(window.screen, 'orientation', { configurable: true, value: { type: 'portrait-primary', angle: 0, addEventListener() {}, removeEventListener() {} } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.route('**/api/**', route => route.fulfill({ status: 404, json: { error: 'non previsto' } }));
    await page.route('**/api/photobooks/by-token/mockup-test-token/mockup**', route => route.fulfill({ json: {
      version: 1, editable: true, enabled: true, saved: null,
      offer: { revision: 1, updatedAt: new Date().toISOString(), mode: 'choice', options: [option, secondOption, rotatingOption] },
      modelMode: 'choice', modelSelection: null,
    } }));
    await page.goto(`http://127.0.0.1:${port}/?client&case=portrait`);
    await page.getByRole('button', { name: /Apri mockup/ }).click();
    const chooser = page.getByTestId('mockup-model-chooser');
    await chooser.waitFor();
    await page.locator('.mockup-chooser-model-card img').first().waitFor();
    await page.waitForTimeout(600);
    // La barra è sticky: il contenuto può scorrerle sotto, ma deve restare
    // sempre visibile e a fine scroll l'ultima card deve emergere sopra di essa.
    const checkBar = async (label, cardSelector, { atEnd = false } = {}) => {
      const bar = await page.locator('.mockup-chooser-action-bar').boundingBox();
      assert.ok(bar && bar.y >= 0 && bar.y + bar.height <= scenario.viewport.height + 1, `${scenario.name} ${label}: barra azioni non visibile`);
      if (!atEnd) return;
      const last = await page.locator(cardSelector).last().boundingBox();
      assert.ok(last && last.y + last.height <= bar.y + 1, `${scenario.name} ${label}: l'ultima card resta coperta dalla barra azioni`);
    };
    await checkBar('iniziale', '.mockup-chooser-model-card');
    await chooser.evaluate(el => { el.scrollTop = el.scrollHeight / 2; });
    await checkBar('metà scroll', '.mockup-chooser-model-card');
    await chooser.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(100);
    await checkBar('fine scroll', '.mockup-chooser-model-card', { atEnd: true });
    await page.screenshot({ path: path.join(outDir, `${scenario.name}-chooser-modello.jpg`), type: 'jpeg', quality: 80 });
    await page.getByTestId(`mockup-model-${rotatingOption.id}`).click();
    await page.locator('.mockup-chooser-cover-card img').first().waitFor();
    await chooser.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(100);
    await checkBar('copertine fine scroll', '.mockup-chooser-cover-card', { atEnd: true });
    await page.screenshot({ path: path.join(outDir, `${scenario.name}-chooser-copertina.jpg`), type: 'jpeg', quality: 80 });
    await context.close();
    console.log(`✓ ${scenario.name}`);
  }
} finally {
  await browser?.close();
  await vite.close();
}
console.log(`Screenshot in ${path.relative(root, outDir)}`);
