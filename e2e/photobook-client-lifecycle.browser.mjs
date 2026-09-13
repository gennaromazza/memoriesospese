// Verifica browser focalizzata sul percorso cliente del mockup fino al blocco stampa.
// Usa il componente reale con API same-origin isolate dalla produzione.
// SwiftShader (default): node e2e/photobook-client-lifecycle.browser.mjs
// GPU reale: PHOTOBOOK_REAL_GPU=1 PHOTOBOOK_GPU_HEADLESS=0 node e2e/photobook-client-lifecycle.browser.mjs
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

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
  const realGpu = process.env.PHOTOBOOK_REAL_GPU === '1';
  const gpuArgs = realGpu
    ? [
        '--ignore-gpu-blocklist',
        '--enable-gpu-rasterization',
        '--enable-webgl',
        '--use-angle=gl',
        '--disable-software-rasterizer',
      ]
    : ['--enable-unsafe-swiftshader'];
  browser = await chromium.launch({
    headless: realGpu ? process.env.PHOTOBOOK_GPU_HEADLESS === '1' : true,
    args: gpuArgs,
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = query =>
      query === '(pointer: coarse)'
        ? {
            matches: true,
            media: query,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() { return true; },
          }
        : nativeMatchMedia(query);
    Object.defineProperty(window.screen, 'orientation', {
      configurable: true,
      value: {
        type: 'portrait-primary',
        angle: 0,
        addEventListener() {},
        removeEventListener() {},
      },
    });
  });
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));

  const catalog = JSON.parse(
    fs.readFileSync('client/public/mockups/custodia-v1/peppe-lab-catalog.json', 'utf8'),
  );
  const baseModel = catalog.models[0];
  const material = catalog.variants[0];
  const option = {
    ...baseModel,
    id: 'custodia',
    name: 'Custodia Studio',
    rendererId: baseModel.id,
    active: true,
    labId: 'lab',
    labName: 'Laboratorio test',
    materials: [{ id: material.id, label: material.label || 'Tessuto test', active: true }],
  };
  const secondOption = {
    ...option,
    id: 'album-alternativo',
    name: 'Album Alternativo',
  };
  const configuration = {
    modelId: baseModel.id,
    assetRevision: baseModel.assetRevision,
    materialId: material.id,
    appearanceRevision: material.appearanceRevision,
    coverLayout: 'full',
    topText: 'Anna e Marco',
    bottomText: 'Ricordi',
    photoAssetId: null,
    crop: { zoom: 1, x: 0.5, y: 0.5 },
  };
  let mode = 'fixed';
  let editable = true;
  let saved = null;

  const payload = () => ({
    version: 1,
    editable,
    enabled: true,
    saved,
    offer: {
      revision: 1,
      updatedAt: new Date().toISOString(),
      mode,
      options: mode === 'fixed' ? [option] : [option, secondOption],
    },
    modelMode: mode,
    modelSelection: mode === 'fixed' ? { labId: option.labId, modelId: option.id } : null,
  });

  await page.route('**/api/photobooks/by-token/mockup-test-token/mockup**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: payload() });
    if (!editable) return route.fulfill({ status: 409, json: { error: 'Versione in sola lettura. Contatta lo studio.' } });
    if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      saved = {
        version: 1,
        revision: (saved?.revision || 0) + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: 'client',
        status: 'draft',
        configuration: body.configuration,
        selection: body.selection,
        option,
      };
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ status: 404, json: { error: 'Azione non prevista dal test' } });
  });

  async function reloadClient() {
    await page.goto(`http://127.0.0.1:${port}/?client&case=${Date.now()}`);
    await page.getByTestId('photobook-mockup').waitFor();
  }

  // Modello fisso: messaggio dello studio e nessuna scelta tra modelli.
  lifecycleStage = 'fixed model messaging';
  await reloadClient();
  await page.getByText('Modello scelto dallo studio', { exact: true }).waitFor();
  await page.getByText('Il modello dell’album è già definito; puoi scegliere soltanto le sue personalizzazioni.', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Apri mockup/ }).click();
  await page.getByRole('heading', { name: 'Il modello scelto per il tuo album', exact: true }).waitFor();
  await page.getByText('Questo modello è stato scelto dallo studio. Continua per personalizzare copertina e contenuti.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Quale album preferisci?', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /Scopri Album Alternativo/ }).count(), 0);
  if (!realGpu) await page.screenshot({ path: 'work/photobook-client-fixed-model.png' });

  // Scelta tra modelli.
  lifecycleStage = 'model choice messaging';
  mode = 'choice';
  saved = null;
  await reloadClient();
  await page.getByRole('button', { name: /Apri mockup/ }).click();
  await page.getByRole('heading', { name: 'Quale album preferisci?', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Scopri Album Alternativo', exact: true }).waitFor();
  if (!realGpu) await page.screenshot({ path: 'work/photobook-client-model-choice.png' });

  // Tutti gli stati visibili al cliente.
  const expectedStates = [
    ['draft', 'Bozza', 'Bozza salvata: puoi riprenderla quando vuoi oppure inviarla allo studio per la verifica.'],
    ['submitted', 'Da verificare', 'La proposta è stata inviata allo studio per la verifica. Puoi ancora modificarla: ogni modifica richiederà una nuova verifica.'],
    ['changes_requested', 'Modifiche richieste', 'Lo studio ha richiesto delle modifiche. Riapri il mockup, aggiorna le scelte e invialo nuovamente.'],
    ['confirmed', 'Confermato dallo studio', 'Lo studio ha confermato il mockup. Puoi ancora modificarlo fino alla stampa: una nuova modifica richiederà una nuova verifica.'],
  ];
  let revision = 1;
  for (const [status, label, message] of expectedStates) {
    lifecycleStage = `customer workflow state: ${status}`;
    saved = {
      version: 1,
      revision: revision++,
      updatedAt: new Date().toISOString(),
      updatedBy: status === 'changes_requested' || status === 'confirmed' ? 'studio' : 'client',
      status,
      configuration,
      selection: { labId: option.labId, modelId: option.id },
      option,
    };
    await reloadClient();
    await page.getByText(new RegExp(`^${label} · revisione`)).waitFor();
    await page.getByText(message, { exact: true }).waitFor();
    if (status === 'changes_requested') {
      await page.getByRole('button', { name: /Apri mockup/ }).waitFor();
    }
  }
  if (!realGpu) await page.screenshot({ path: 'work/photobook-client-confirmed.png' });

  // Una modifica successiva alla conferma crea una nuova revisione in bozza.
  lifecycleStage = 'post-confirmation revision';
  const confirmedRevision = saved.revision;
  const response = await page.evaluate(async ({ configuration, revision, selection }) => {
    const result = await fetch('/api/photobooks/by-token/mockup-test-token/mockup?version=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        revision,
        configuration: { ...configuration, topText: 'Anna e Marco aggiornato' },
        selection,
        offerRevision: 1,
      }),
    });
    return { status: result.status, body: await result.json() };
  }, {
    configuration,
    revision: confirmedRevision,
    selection: { labId: option.labId, modelId: option.id },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.revision, confirmedRevision + 1);
  assert.equal(response.body.status, 'draft');
  await reloadClient();
  await page.getByText(`Bozza · revisione ${confirmedRevision + 1}`, { exact: true }).waitFor();
  await page.getByText('Bozza salvata: puoi riprenderla quando vuoi oppure inviarla allo studio per la verifica.', { exact: true }).waitFor();

  // Blocco stampa: UI esplicitamente sola lettura e API di modifica rifiutata.
  lifecycleStage = 'print lock and read-only API';
  editable = false;
  await reloadClient();
  await page.evaluate(() => {
    Object.defineProperty(window.screen, 'orientation', {
      configurable: true,
      value: {
        type: 'landscape-primary',
        angle: 90,
        addEventListener() {},
        removeEventListener() {},
      },
    });
    window.dispatchEvent(new Event('orientationchange'));
  });
  await page.getByRole('button', { name: /Apri mockup/ }).click();
  await page.getByText('Questa versione è in sola lettura: puoi esplorare l’album e scaricare le viste.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Cambia', exact: true }).isDisabled(), true);
  const lockedResponse = await page.evaluate(async ({ configuration, revision, selection }) => {
    const result = await fetch('/api/photobooks/by-token/mockup-test-token/mockup?version=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision, configuration, selection, offerRevision: 1 }),
    });
    return { status: result.status, body: await result.json() };
  }, {
    configuration,
    revision: saved.revision,
    selection: { labId: option.labId, modelId: option.id },
  });
  assert.equal(lockedResponse.status, 409);
  assert.match(lockedResponse.body.error, /sola lettura/i);

  // Il download resta disponibile dopo il blocco e il report contiene tutte
  // le viste che il cliente può consultare, senza riaprire la modifica.
  lifecycleStage = 'print-locked customer download';
  const mockupFrame = page.frameLocator('iframe[title^="Configuratore 3D"]');
  await mockupFrame.locator('body[data-wizard-mobile="true"]').waitFor();
  const viewerFrame = page.frames().find(frame => frame !== page.mainFrame() && frame.url().includes('/custodia-v1/'));
  assert.ok(viewerFrame, 'Frame del viewer custodia non trovato');
  const webglInfo = await viewerFrame.evaluate(() => {
    const canvas = document.querySelector('#viewport');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    if (!gl) return { renderer: '', vendor: '' };
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '',
      vendor: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : '',
    };
  });
  assert.ok(webglInfo.renderer, 'WEBGL_debug_renderer_info non disponibile: impossibile confermare il renderer GPU');
  const softwareRenderer = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(webglInfo.renderer);
  const gpuMode = softwareRenderer ? 'software-fallback' : 'hardware';
  if (realGpu) {
    assert.equal(
      softwareRenderer,
      false,
      `La modalità GPU reale sta usando un renderer software: ${webglInfo.renderer}`,
    );
    console.log(`GPU WebGL reale: ${webglInfo.renderer} (${webglInfo.vendor})`);
  } else {
    assert.equal(softwareRenderer, true, `Il gate SwiftShader non usa un renderer software: ${webglInfo.renderer}`);
  }
  const nextButton = mockupFrame.locator('#wizard-actions-slot button').nth(1);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await nextButton.waitFor({ state: 'attached' });
    assert.equal(await nextButton.isVisible(), true, `Azione wizard non visibile al tentativo ${attempt + 1}`);
    const actionLabel = (await nextButton.textContent())?.trim() || '';
    if (!/^Avanti/.test(actionLabel)) break;
    await nextButton.click({ noWaitAfter: true });
  }
  const downloadButton = mockupFrame.locator('#downloadClient');
  await downloadButton.waitFor({ state: 'visible' });
  assert.equal(await downloadButton.isDisabled(), false);
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  try {
    const [download] = await Promise.all([
      downloadPromise,
      downloadButton.click({ timeout: 30_000, noWaitAfter: true }),
    ]);
    assert.equal(await download.failure(), null);
    assert.match(download.suggestedFilename(), /^album-configurazione-.*\.html$/);
    const downloadedReport = fs.readFileSync(await download.path(), 'utf8');
    const viewLabels = [
      'Album e custodia · prospettiva',
      'Copertina · album senza custodia',
      'Retro · album senza custodia',
      'Dorso e scritte personalizzate',
      'Lato destro',
      'Vista superiore',
      'Vista inferiore',
      'Album estratto dalla custodia',
    ];
    for (const viewLabel of viewLabels) {
      assert.ok(downloadedReport.includes(viewLabel), `Vista mancante nel download: ${viewLabel}`);
    }
    const embeddedPngs = [...downloadedReport.matchAll(
      /<img\b[^>]*\bsrc="data:image\/png;base64,([^"]+)"/g,
    )].map(match => Buffer.from(match[1], 'base64'));
    assert.equal(embeddedPngs.length, viewLabels.length, 'Il report non contiene otto immagini PNG incorporate');
    const imageDimensions = embeddedPngs.map((png, index) => {
      assert.equal(png.toString('ascii', 1, 4), 'PNG', `Vista ${index + 1} non è una PNG valida`);
      return {
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
        bytes: png.byteLength,
      };
    });
    const expectedDimensions = realGpu ? { width: 1600, height: 1200 } : { width: 800, height: 600 };
    assert.deepEqual(
      imageDimensions.map(({ width, height }) => ({ width, height })),
      viewLabels.map(() => expectedDimensions),
      `Dimensioni export inattese: attese ${expectedDimensions.width}×${expectedDimensions.height}, ricevute ${JSON.stringify(imageDimensions)}`,
    );
    const qualityReport = {
      schemaVersion: 1,
      gate: 'photobook-client-lifecycle',
      result: 'passed',
      gpuMode,
      exportProfile: gpuMode === 'hardware' ? 'hardware-1600x1200' : 'software-fallback-800x600',
      webgl: {
        renderer: webglInfo.renderer,
        vendor: webglInfo.vendor,
        softwareRenderer,
      },
      export: {
        viewCount: viewLabels.length,
        expectedDimensions,
        views: viewLabels.map((label, index) => ({
          index: index + 1,
          label,
          png: {
            format: 'PNG',
            width: imageDimensions[index].width,
            height: imageDimensions[index].height,
            bytes: imageDimensions[index].bytes,
          },
        })),
      },
    };
    fs.mkdirSync('work', { recursive: true });
    fs.writeFileSync(
      'work/photobook-client-lifecycle-quality.json',
      `${JSON.stringify(qualityReport, null, 2)}\n`,
    );
    console.log(`3D quality report JSON: ${JSON.stringify(qualityReport)}`);
    console.log(
      `Report OK: ${embeddedPngs.length} viste PNG ${expectedDimensions.width}×${expectedDimensions.height}.`,
    );
  } catch (error) {
    const status = await mockupFrame.locator('#downloadStatus').textContent().catch(() => '');
    throw new Error(`Download cliente fallito (stato renderer: ${status || 'nessuno'}): ${error.message}`);
  }
  assert.equal(await page.getByRole('button', { name: 'Cambia', exact: true }).isDisabled(), true);
  if (!realGpu) await page.screenshot({ path: 'work/photobook-client-print-locked.png' });

  assert.deepEqual(browserErrors, []);
  console.log('Browser OK: modello fisso, scelta tra modelli, bozza, inviato, modifiche richieste, confermato, nuova revisione e blocco stampa.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error) error.message = `Mockup lifecycle regression at "${lifecycleStage}": ${message}`;
  throw error;
} finally {
  await browser?.close();
  await vite.close();
}