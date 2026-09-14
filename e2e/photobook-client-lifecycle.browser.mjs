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
import { isSoftwareRenderer } from '../client/public/mockups/export-yield.js';

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
  const displayName = process.env.DISPLAY
    ? `DISPLAY=${process.env.DISPLAY}`
    : process.env.WAYLAND_DISPLAY
      ? `WAYLAND_DISPLAY=${process.env.WAYLAND_DISPLAY}`
      : process.env.MIR_SOCKET
        ? `MIR_SOCKET=${process.env.MIR_SOCKET}`
        : '';
  const displayRequired = realGpu;
  const gpuHeadless = process.env.PHOTOBOOK_GPU_HEADLESS === '1';
  const displayAvailable = Boolean(displayName) && !gpuHeadless;
  console.log(
    `GPU preflight: display=${displayRequired
      ? (gpuHeadless ? 'disabled (headless browser)' : displayAvailable ? `${displayName} (configured)` : 'missing')
      : 'not-required (headless software mode)'}`,
  );
  if (displayRequired && !displayAvailable) {
    throw new Error(
      gpuHeadless
        ? 'GPU preflight failed: real-GPU verification cannot run with PHOTOBOOK_GPU_HEADLESS=1. Use PHOTOBOOK_GPU_HEADLESS=0 with an active DISPLAY or WAYLAND_DISPLAY.'
        : 'GPU preflight failed: no active display was configured. Set DISPLAY or WAYLAND_DISPLAY and run with PHOTOBOOK_GPU_HEADLESS=0; a visible display is required for real-GPU WebGL verification.',
    );
  }
  const gpuArgs = realGpu
    ? [
        '--ignore-gpu-blocklist',
        '--enable-gpu-rasterization',
        '--enable-webgl',
        '--use-angle=gl',
        '--disable-software-rasterizer',
      ]
    : ['--enable-unsafe-swiftshader'];
  try {
    browser = await chromium.launch({
      headless: realGpu ? gpuHeadless : true,
      args: gpuArgs,
    });
  } catch (error) {
    if (realGpu) {
      throw new Error(
        `GPU preflight failed: Chromium could not open the configured display (${displayName || 'none'}). `
        + `Check the display server and GPU prerequisites before the customer path: ${error.message}`,
      );
    }
    throw error;
  }
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  const devtools = await page.context().newCDPSession(page);
  await devtools.send('Network.setCacheDisabled', { cacheDisabled: true });
  const browserDevtools = await browser.newBrowserCDPSession();
  let systemInfo = null;
  try {
    systemInfo = await browserDevtools.send('SystemInfo.getInfo');
  } catch (error) {
    console.log(`GPU preflight: GPU device inspection unavailable (${error.message})`);
  } finally {
    await browserDevtools.detach().catch(() => {});
  }
  const gpuDevices = systemInfo?.gpu?.devices || [];
  const gpuDevice = gpuDevices.find(device => (
    device.active !== false && (device.vendorString || device.deviceString)
  ));
  const gpuDeviceName = gpuDevice
    ? `${gpuDevice.vendorString || 'unknown vendor'} ${gpuDevice.deviceString || 'unknown device'}`
    : '';
  const hardwareGpuDevice = gpuDevice && !isSoftwareRenderer(gpuDeviceName);
  const featureStatus = systemInfo?.gpu?.featureStatus || {};
  const preflightPage = await browser.newPage();
  const webglInfo = await preflightPage.evaluate(() => {
    const canvas = document.createElement('canvas');
    let gl = null;
    try {
      gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    } catch (error) {
      return { available: false, renderer: '', vendor: '', error: error.message };
    }
    if (!gl) return { available: false, renderer: '', vendor: '', error: 'WebGL context unavailable' };
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) {
      return { available: true, renderer: '', vendor: '', error: 'WEBGL_debug_renderer_info unavailable' };
    }
    return {
      available: true,
      renderer: String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''),
      vendor: String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || ''),
      error: '',
    };
  });
  await preflightPage.close();
  const softwareRenderer = isSoftwareRenderer(webglInfo.renderer);
  const rendererClass = !webglInfo.available
    ? 'unavailable'
    : !webglInfo.renderer
      ? 'unknown'
      : softwareRenderer
        ? 'software-fallback'
        : 'hardware';
  console.log(
    `GPU preflight: gpuDevice=${hardwareGpuDevice ? gpuDeviceName : gpuDevice ? `software (${gpuDeviceName})` : 'missing'}; `
    + `webgl=${webglInfo.available ? 'available' : 'missing'}; renderer=${webglInfo.renderer || 'missing'}; `
    + `rendererClass=${rendererClass}; webglFeature=${featureStatus.webgl || 'unknown'}; `
    + `webgl2Feature=${featureStatus.webgl2 || 'unknown'}`,
  );
  if (!webglInfo.available) {
    throw new Error(
      `GPU preflight failed: WebGL is unavailable (${webglInfo.error || 'no WebGL context'}). `
      + 'The browser needs a working display and WebGL-capable GPU/device before the customer path can run.',
    );
  }
  if (!webglInfo.renderer) {
    throw new Error(
      `GPU preflight failed: hardware renderer is unavailable (${webglInfo.error || 'renderer not reported'}). `
      + 'WEBGL_debug_renderer_info is required to distinguish a real GPU from software rasterization.',
    );
  }
  if (realGpu && !hardwareGpuDevice) {
    throw new Error(
      `GPU preflight failed: no active hardware GPU device was reported by Chromium (device: ${gpuDeviceName || 'missing'}, renderer: ${webglInfo.renderer}). `
      + 'SwiftShader, llvmpipe, and softpipe devices are software rasterizers, not valid hardware prerequisites.',
    );
  }
  if (realGpu && softwareRenderer) {
    throw new Error(
      `GPU preflight failed: renderer "${webglInfo.renderer}" is software rasterization. `
      + 'SwiftShader, llvmpipe, and softpipe are not accepted for real-GPU verification.',
    );
  }
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

  lifecycleStage = 'wizard layout replacement lifecycle';
  const runLayoutLifecycle = async ({ mobile }) => {
    await page.goto(`http://127.0.0.1:${port}/?layout-lifecycle${mobile ? '&mobile' : ''}`);
    const lifecycleFrame = page.getByTestId('layout-lifecycle-frame');
    await lifecycleFrame.waitFor();
    const lifecycleFrameLocator = page.frameLocator('[data-testid="layout-lifecycle-frame"]');
    await lifecycleFrameLocator.locator('body[data-wizard-layout="ready"]').waitFor();
    assert.equal(
      await lifecycleFrameLocator.locator('style[data-mockup-wizard-style-kind="base"]').count(),
      1,
      `${mobile ? 'Mobile' : 'Desktop'} deve avere un solo blocco di stili base`,
    );
    assert.equal(
      await lifecycleFrameLocator.locator('style[data-mockup-wizard-style-kind="mobile"]').count(),
      mobile ? 1 : 0,
      `${mobile ? 'Mobile' : 'Desktop'} deve avere ${mobile ? 'un' : 'zero'} blocco di stili mobile`,
    );
    assert.equal(
      await lifecycleFrameLocator.locator('style[data-mockup-wizard-style="true"]').count(),
      mobile ? 2 : 1,
    );
    assert.equal(await lifecycleFrameLocator.locator('body[data-wizard="true"]').count(), 1);
    assert.equal(await lifecycleFrameLocator.locator('body[data-wizard-mobile="true"]').count(), mobile ? 1 : 0);

    for (let replacement = 1; replacement <= 2; replacement++) {
      await page.getByRole('button', { name: 'Sostituisci renderer', exact: true }).click();
      await page.getByTestId('layout-lifecycle-revision').evaluate((element, expected) => {
        if (element.getAttribute('data-revision') !== String(expected)) {
          throw new Error(`Revision renderer inattesa: ${element.getAttribute('data-revision')}`);
        }
      }, replacement);
      await lifecycleFrameLocator.locator('body[data-wizard-layout="ready"]').waitFor();
      assert.equal(
        await lifecycleFrameLocator.locator('style[data-mockup-wizard-style-kind="base"]').count(),
        1,
        `Il renderer ${replacement} deve avere un solo blocco di stili base`,
      );
      assert.equal(
        await lifecycleFrameLocator.locator('style[data-mockup-wizard-style-kind="mobile"]').count(),
        mobile ? 1 : 0,
        `Il renderer ${replacement} deve avere ${mobile ? 'un' : 'zero'} blocco di stili mobile`,
      );
      assert.equal(
        await lifecycleFrameLocator.locator('style[data-mockup-wizard-style="true"]').count(),
        mobile ? 2 : 1,
      );
      const disposed = await page.evaluate(() => window.__mockupLayoutLifecycle?.disposed || []);
      assert.ok(
        disposed.length >= replacement * 2,
        `Il renderer precedente ${replacement - 1} non è stato smontato: ${JSON.stringify(disposed)}`,
      );
      assert.ok(
        disposed.slice(-2).every(snapshot => (
          snapshot.wizard === null
          && snapshot.wizardLayout === null
          && snapshot.wizardMobile === null
          && snapshot.styleCount === 0
          && snapshot.baseStyleCount === 0
          && snapshot.mobileStyleCount === 0
        )),
        `Il layout precedente ${replacement - 1} ha lasciato tracce: ${JSON.stringify(disposed.slice(-2))}`,
      );
    }
    await page.getByRole('button', { name: 'Rimuovi layout', exact: true }).click();
    const manuallyDisposed = await page.evaluate(() => window.__mockupLayoutLifecycle?.disposed || []);
    assert.ok(
      manuallyDisposed.slice(-2).every(snapshot => (
        snapshot.wizard === null
        && snapshot.wizardLayout === null
        && snapshot.wizardMobile === null
        && snapshot.styleCount === 0
        && snapshot.baseStyleCount === 0
        && snapshot.mobileStyleCount === 0
      )),
      `Dispose ripetuto non idempotente: ${JSON.stringify(manuallyDisposed.slice(-2))}`,
    );
    assert.equal(await lifecycleFrameLocator.locator('body[data-wizard-layout]').count(), 0);
    assert.equal(await lifecycleFrameLocator.locator('body[data-wizard]').count(), 0);
    assert.equal(await lifecycleFrameLocator.locator('body[data-wizard-mobile]').count(), 0);
    assert.equal(await lifecycleFrameLocator.locator('style[data-mockup-wizard-style="true"]').count(), 0);
  };
  await runLayoutLifecycle({ mobile: false });
  await runLayoutLifecycle({ mobile: true });

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
  const rotatingOption = {
    ...option,
    id: 'album-girevole-test',
    name: 'Album girevole test',
    rendererId: 'album-girevole',
  };
  const rotatingConfiguration = assetRevision => ({
    modelId: 'album-girevole',
    assetRevision,
    materialId: material.id,
    appearanceRevision: material.appearanceRevision,
    coverLayout: 'plaque',
    frameFinish: 'fabric',
    topText: 'Anna e Marco',
    bottomText: 'Ricordi',
    photoAssetId: null,
    crop: { zoom: 1, x: 0.5, y: 0.5 },
    ...(assetRevision >= 2 ? {
      backCover: 'fabric',
      backPhotoAssetId: null,
      backCrop: { zoom: 1, x: 0.5, y: 0.5 },
    } : {}),
    ...(assetRevision >= 3 ? {
      engravingNames: { first: 'Anna', second: 'Marco' },
    } : {}),
  });
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
  let activeRotatingViewer = null;
  let servedRotatingViewer = null;

  const payload = () => ({
    version: 1,
    editable,
    enabled: true,
    saved,
    offer: {
      revision: 1,
      updatedAt: new Date().toISOString(),
      mode,
      options: mode === 'fixed'
        ? [activeRotatingViewer ? rotatingOption : option]
        : [option, secondOption],
    },
    modelMode: mode,
    modelSelection: mode === 'fixed'
      ? {
          labId: (activeRotatingViewer ? rotatingOption : option).labId,
          modelId: (activeRotatingViewer ? rotatingOption : option).id,
        }
      : null,
  });

  await page.route('**/mockups/girevole-v4/viewer.js', async route => {
    if (!activeRotatingViewer) return route.continue();
    servedRotatingViewer = activeRotatingViewer;
    const viewerPath = path.join(root, 'client/public/mockups', activeRotatingViewer, 'viewer.js');
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: fs.readFileSync(viewerPath, 'utf8'),
    });
  });
  await page.route('**/mockups/girevole-v4/monogram.js', async route => {
    if (activeRotatingViewer !== 'girevole-v3') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: fs.readFileSync(path.join(root, 'client/public/mockups/girevole-v3/monogram.js'), 'utf8'),
    });
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
  const viewerWebglInfo = await viewerFrame.evaluate(() => {
    const canvas = document.querySelector('#viewport');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    if (!gl) return { renderer: '', vendor: '' };
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '',
      vendor: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : '',
    };
  });
  assert.ok(viewerWebglInfo.renderer, 'WEBGL_debug_renderer_info non disponibile: impossibile confermare il renderer GPU');
  assert.equal(
    viewerWebglInfo.renderer,
    webglInfo.renderer,
    `Il renderer WebGL è cambiato tra il preflight (${webglInfo.renderer}) e il viewer (${viewerWebglInfo.renderer})`,
  );
  const viewerSoftwareRenderer = isSoftwareRenderer(viewerWebglInfo.renderer);
  const gpuMode = viewerSoftwareRenderer ? 'software-fallback' : 'hardware';
  if (realGpu) {
    assert.equal(
      viewerSoftwareRenderer,
      false,
      `La modalità GPU reale sta usando un renderer software: ${viewerWebglInfo.renderer}`,
    );
    console.log(`GPU WebGL reale: ${viewerWebglInfo.renderer} (${viewerWebglInfo.vendor})`);
  } else {
    assert.equal(viewerSoftwareRenderer, true, `Il gate SwiftShader non usa un renderer software: ${viewerWebglInfo.renderer}`);
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
        renderer: viewerWebglInfo.renderer,
        vendor: viewerWebglInfo.vendor,
        softwareRenderer: viewerSoftwareRenderer,
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

  const rotatingViewLabels = {
    'girevole-v1': [
      'Prospettiva · album ruotato',
      'Fronte · allineato',
      'Retro',
      'Dorso · rotazione 90°',
      'Lato destro',
      'Vista superiore',
      'Copertina · cornice aperta',
      'Rotazione 180°',
    ],
    'girevole-v2': [
      'Prospettiva · album ruotato',
      'Fronte · allineato',
      'Retro · finitura selezionata',
      'Dorso · rotazione 90°',
      'Lato destro',
      'Vista superiore',
      'Album estratto · copertina',
      'Album estratto · retro',
    ],
    'girevole-v3': [
      'Prospettiva · album ruotato',
      'Fronte · allineato',
      'Retro · finitura selezionata',
      'Dorso · rotazione 90°',
      'Lato destro',
      'Vista superiore',
      'Album estratto · copertina',
      'Album estratto · retro',
    ],
    'girevole-v4': [
      'Prospettiva · album ruotato',
      'Fronte · allineato',
      'Retro · finitura selezionata',
      'Dorso · rotazione 90°',
      'Lato destro',
      'Vista superiore',
      'Album estratto · copertina',
      'Album estratto · retro',
    ],
  };
  for (const [viewerPath, viewLabels] of Object.entries(rotatingViewLabels)) {
    lifecycleStage = `print-locked customer download: ${viewerPath}`;
    activeRotatingViewer = viewerPath;
    const lockedConfiguration = rotatingConfiguration(Number(viewerPath.slice(-1)));
    saved = {
      version: 1,
      revision: 100 + Number(viewerPath.slice(-1)),
      updatedAt: new Date().toISOString(),
      updatedBy: 'studio',
      status: 'confirmed',
      configuration: lockedConfiguration,
      selection: { labId: rotatingOption.labId, modelId: rotatingOption.id },
      option: rotatingOption,
    };
    await reloadClient();
    await page.getByRole('button', { name: /Apri mockup/ }).click();
    await page.getByText('Questa versione è in sola lettura: puoi esplorare l’album e scaricare le viste.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Cambia', exact: true }).isDisabled(), true);

    const rotatingFrame = page.frameLocator('iframe[title^="Configuratore 3D"]');
    const rotatingDownloadButton = rotatingFrame.locator('#downloadClient');
    await rotatingDownloadButton.waitFor({ state: 'visible' });
    const enabledDeadline = Date.now() + 30_000;
    while (await rotatingDownloadButton.isDisabled()) {
      if (Date.now() >= enabledDeadline) {
        const status = await rotatingFrame.locator('#downloadStatus').textContent().catch(() => '');
        const rendererStatus = await rotatingFrame.locator('#status').textContent().catch(() => '');
        const handler = await rotatingFrame.locator('#downloadClient').evaluate(button => ({
          onclick: typeof button.onclick,
          ready: document.body.dataset.ready || '',
        })).catch(() => null);
        throw new Error(`${viewerPath}: download ancora disabilitato (stato=${status || 'nessuno'}, renderer=${rendererStatus || 'nessuno'}, handler=${JSON.stringify(handler)}, errori=${browserErrors.join(' | ') || 'nessuno'})`);
      }
      await page.waitForTimeout(100);
    }
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    let download;
    try {
      [download] = await Promise.all([
        downloadPromise,
        rotatingDownloadButton.dispatchEvent('click'),
      ]);
    } catch (error) {
      const status = await rotatingFrame.locator('#downloadStatus').textContent().catch(() => '');
      const disabled = await rotatingDownloadButton.isDisabled().catch(() => null);
      const rendererStatus = await rotatingFrame.locator('#status').textContent().catch(() => '');
      const handler = await rotatingFrame.locator('#downloadClient').evaluate(button => ({
        onclick: typeof button.onclick,
        ready: document.body.dataset.ready || '',
        scripts: [...document.scripts].map(script => script.src),
      })).catch(() => null);
      throw new Error(`${viewerPath}: evento download assente (servito=${servedRotatingViewer}, download disabled=${disabled}, stato=${status || 'nessuno'}, renderer=${rendererStatus || 'nessuno'}, handler=${JSON.stringify(handler)}, errori=${browserErrors.join(' | ') || 'nessuno'}): ${error.message}`);
    }
    assert.equal(await download.failure(), null, `${viewerPath}: download fallito`);
    assert.equal(download.suggestedFilename(), 'album-girevole-anteprima.html');
    const downloadedReport = fs.readFileSync(await download.path(), 'utf8');
    for (const viewLabel of viewLabels) {
      assert.ok(downloadedReport.includes(viewLabel), `${viewerPath}: vista mancante nel download: ${viewLabel}`);
    }
    const embeddedPngs = [...downloadedReport.matchAll(
      /<img\b[^>]*\bsrc="data:image\/(png|jpeg);base64,([^"]+)"/g,
    )].map(match => ({
      format: match[1],
      bytes: Buffer.from(match[2], 'base64'),
    }));
    assert.equal(embeddedPngs.length, viewLabels.length, `${viewerPath}: il report non contiene otto immagini`);
    const imageDimensions = embeddedPngs.map(({ format, bytes }, index) => {
      if (format === 'png') {
        assert.equal(bytes.toString('ascii', 1, 4), 'PNG', `${viewerPath}: vista ${index + 1} non è una PNG valida`);
        return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
      }
      assert.deepEqual(
        [...bytes.subarray(0, 3)],
        [0xff, 0xd8, 0xff],
        `${viewerPath}: vista ${index + 1} non è una JPEG valida`,
      );
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = bytes[offset + 1];
        offset += 2;
        if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        const segmentLength = bytes.readUInt16BE(offset);
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
          || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
          return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
        }
        offset += segmentLength;
      }
      throw new Error(`${viewerPath}: dimensioni JPEG non leggibili per la vista ${index + 1}`);
    });
    const expectedDimensions = realGpu ? { width: 1600, height: 1200 } : { width: 800, height: 600 };
    assert.deepEqual(
      imageDimensions,
      viewLabels.map(() => expectedDimensions),
      `${viewerPath}: dimensioni export inattese`,
    );

    const rejectedSave = await page.evaluate(async ({ configuration, revision, selection }) => {
      const result = await fetch('/api/photobooks/by-token/mockup-test-token/mockup?version=1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision, configuration, selection, offerRevision: 1 }),
      });
      return { status: result.status, body: await result.json() };
    }, {
      configuration: lockedConfiguration,
      revision: saved.revision,
      selection: saved.selection,
    });
    assert.equal(rejectedSave.status, 409, `${viewerPath}: il salvataggio è stato accettato dopo il blocco`);
  }
  activeRotatingViewer = null;

  if (!realGpu) await page.screenshot({ path: 'work/photobook-client-print-locked.png' });

  assert.deepEqual(browserErrors, []);
  console.log('Browser OK: lifecycle cliente, blocco stampa e download verificati per custodia-v1 e girevole-v1…v4.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error) error.message = `Mockup lifecycle regression at "${lifecycleStage}": ${message}`;
  throw error;
} finally {
  await browser?.close();
  await vite.close();
}