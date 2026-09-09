// Geometria reale, controlli Three.js e revisioni isolate: nessuna API o foto cliente.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const root = process.cwd();
const vite = await createServer({ configFile: false, root: path.join(root, 'e2e/mockup-harness'), publicDir: path.join(root, 'client/public'), optimizeDeps: { noDiscovery: true, entries: [] }, server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } } });
let browser;
try {
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const catalog = JSON.parse(fs.readFileSync('client/public/mockups/custodia-v1/peppe-lab-catalog.json', 'utf8'));
  const material = catalog.variants.find(v => v.legacyId === 'mist-03');
  const backId = '11111111-1111-4111-8111-111111111111';
  const photo = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#164c61"/><rect x="400" width="400" height="600" fill="#bb9646"/><text x="50" y="180" font-size="100" fill="white">PLEXI</text></svg>')).png().toBuffer();
  await page.route('**/api/**', route => route.abort());
  await page.route('**/renderer-test*', route => {
    const kind = new URL(route.request().url()).searchParams.get('kind') || 'girevole-v4';
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}iframe{width:100vw;height:100dvh;border:0}</style><script>window.events=[];addEventListener('message',e=>events.push(e.data));</script><iframe src="/mockups/${kind}/index.html"></iframe>` });
  });
  for (const kind of ['girevole-v4', 'custodia-v1']) await page.route(`**/mockups/${kind}/viewer.js`, async route => {
    const response = await route.fetch();
    const symbols = kind === 'girevole-v4' ? 'product,frame,pivot,album,boxPhoto,rearPhoto,rearPlex,configuration,previews' : 'model,album';
    await route.fulfill({ response, body: `${await response.text()}\nwindow.rendererTest={camera,controls,renderer,${symbols}};` });
  });
  async function open(kind = 'girevole-v4') {
    await page.goto(`${base}/renderer-test?kind=${kind}`);
    const frame = page.frames().find(f => f.url().includes(`/mockups/${kind}`)) || await new Promise(resolve => page.once('framenavigated', resolve));
    await frame.waitForFunction(() => !!window.rendererTest, { timeout: 45000 });
    // Simula la reale area orizzontale del wizard mantenendo i pulsanti nativi cliccabili.
    await frame.addStyleTag({ content: 'header,aside,.hint,.badge,.tools>label,.tools>input,.tools>p{display:none!important}main{display:block!important;height:100dvh!important}.workspace{display:grid!important;grid-template-rows:minmax(0,1fr) 90px!important;height:100dvh}.stage{height:auto!important;min-height:0!important}.tools{display:block;padding:3px!important}.tools .row{display:flex;max-width:none}.tools button{min-height:40px;padding:4px}.view-tools{display:flex!important;position:absolute;bottom:0}' });
    return frame;
  }
  async function apply(c) {
    await page.evaluate(({ c, bytes, backId }) => {
      window.events.length = 0;
      document.querySelector('iframe').contentWindow.postMessage({ channel: 'memorie-mockup-v1', type: 'apply', configuration: c,
        ...(c.backPhotoAssetId ? { backPhoto: { id: backId, name: 'Esempio test', source: 'gallery', blob: new Blob([new Uint8Array(bytes)], { type: 'image/png' }) } } : {}) }, location.origin);
    }, { c, bytes: [...photo], backId });
    await page.waitForFunction(() => events.some(e => e.type === 'applied'));
  }
  const baseConfig = { modelId: 'album-girevole', materialId: material.id, appearanceRevision: material.appearanceRevision, coverLayout: 'plaque', frameFinish: 'wood', topText: 'Dedica storica', bottomText: 'Il nostro giorno', photoAssetId: null, crop: { zoom: 1, x: .5, y: .5 } };
  for (const revision of [1, 2, 3]) {
    const frame = await open();
    const configuration = { ...baseConfig, assetRevision: revision, ...(revision >= 2 ? { backCover: 'photo', backPhotoAssetId: backId, backCrop: { zoom: 1.3, x: .2, y: .7 } } : {}), ...(revision === 3 ? { engravingNames: { first: 'Anna', second: 'Jacopo' } } : {}) };
    await apply(configuration);
    assert.deepEqual(await frame.evaluate(() => window.rendererTest.configuration()), configuration, `Ripristino fedele v${revision}`);
    await frame.evaluate(() => { document.getElementById('front').click(); document.getElementById('extract').value = 100; document.getElementById('extract').dispatchEvent(new Event('input')); });
    assert.deepEqual(await frame.evaluate(() => window.rendererTest.configuration()), configuration, 'La sola esplorazione non migra il salvataggio');
    if (revision === 2) {
      const result = await frame.evaluate(() => { const r = window.rendererTest; return { views: r.previews().length, configuration: r.configuration(), extraction: r.album.position.x }; });
      assert.equal(result.views, 8); assert.deepEqual(result.configuration, configuration); assert.equal(result.extraction, .48);
    }
    await frame.locator('#frameFinish').evaluate(select => { select.value = 'white'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    const edited = await frame.evaluate(() => { const r = window.rendererTest; return { configuration: r.configuration(), photoOnBox: r.boxPhoto.visible, oldPhotoOnAlbum: r.rearPhoto.visible }; });
    assert.equal(edited.configuration.assetRevision, 4); assert.equal(edited.configuration.topText, configuration.topText);
    assert.equal(edited.photoOnBox, revision >= 2); assert.equal(edited.oldPhotoOnAlbum, false);
    assert.equal('engravingNames' in edited.configuration, revision === 3, 'Non trasformare dediche legacy in nomi');
  }
  const frame = await open();
  const current = { ...baseConfig, assetRevision: 4, backCover: 'photo', backPhotoAssetId: backId, backCrop: { zoom: 1, x: .5, y: .5 }, engravingNames: { first: 'Anna', second: 'Jacopo' } };
  await apply(current);
  const geometry = await frame.evaluate(() => {
    const r = window.rendererTest, rotation = document.getElementById('rotation'), extract = document.getElementById('extract');
    rotation.value = -90; rotation.dispatchEvent(new Event('input'));
    r.product.updateMatrixWorld(true); const before = r.boxPhoto.matrixWorld.elements.slice();
    extract.value = 100; extract.dispatchEvent(new Event('input'));
    r.product.updateMatrixWorld(true); const after = r.boxPhoto.matrixWorld.elements.slice();
    const albumOutside = r.album.position.x;
    extract.value = 0; extract.dispatchEvent(new Event('input')); rotation.value = 0; rotation.dispatchEvent(new Event('input'));
    r.product.updateMatrixWorld(true);
    return { before, after, rotated: r.boxPhoto.matrixWorld.elements.slice(), albumOutside, parent: r.boxPhoto.parent.name, frameAngle: r.frame.rotation.y, visible: r.boxPhoto.visible, oldVisible: r.rearPhoto.visible, size: [r.boxPhoto.geometry.boundingBox?.min.x], config: r.configuration() };
  });
  assert.deepEqual(geometry.before, geometry.after, 'Estrazione: stampa ferma nello scrigno, mentre il libro esce');
  assert.notDeepEqual(geometry.after, geometry.rotated, 'Ruotando lo scrigno ruota anche il plexiglass fotografico');
  assert.equal(geometry.albumOutside, .48); assert.equal(geometry.parent, 'Supporto interno girevole'); assert.equal(geometry.frameAngle, 0);
  assert.equal(geometry.visible, true); assert.equal(geometry.oldVisible, false); assert.deepEqual(geometry.config, current);
  await frame.evaluate(() => document.getElementById('back').click());
  await page.screenshot({ path: 'work/renderer-plexi-v4.png' });
  const exportedCurrent = await frame.evaluate(() => {
    const r = window.rendererTest;
    const views = r.previews();
    return { configuration: r.configuration(), count: views.length, allImages: views.every(v => v.image.startsWith('data:image/jpeg;base64,')), parent: r.boxPhoto.parent.name, x: r.album.position.x };
  });
  assert.equal(exportedCurrent.count, 8); assert.equal(exportedCurrent.allImages, true);
  assert.deepEqual(exportedCurrent.configuration, current); assert.equal(exportedCurrent.parent, 'Supporto interno girevole'); assert.equal(exportedCurrent.x, 0);
  for (const kind of ['girevole-v4', 'custodia-v1']) {
    const view = await open(kind);
    await view.evaluate(() => document.getElementById('front').click());
    const before = await view.evaluate(() => { const r = window.rendererTest; return r.camera.position.distanceTo(r.controls.target); });
    const bounds = await view.locator('#viewport').boundingBox();
    const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const fingers = (span, shift = 0) => [{ x: cx - span + shift, y: cy, id: 1 }, { x: cx + span + shift, y: cy, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(30) });
    for (const span of [40, 55, 70, 90]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(span) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const pinched = await view.evaluate(() => { const r = window.rendererTest; return r.camera.position.distanceTo(r.controls.target); });
    assert.ok(pinched < before * .8, `${kind}: pinch nativo ingrandisce`);
    const targetBefore = await view.evaluate(() => window.rendererTest.controls.target.toArray());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(40) });
    for (const shift of [10, 20, 35, 50]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(40, shift) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const targetAfter = await view.evaluate(() => window.rendererTest.controls.target.toArray());
    assert.notDeepEqual(targetBefore, targetAfter, `${kind}: due dita spostano il dettaglio per osservare il tessuto`);
    await cdp.detach();
    await view.evaluate(() => document.getElementById('front').click());
    for (let i = 0; i < 12; i++) await view.locator('#plus').tap();
    const close = await view.evaluate(() => { const r = window.rendererTest; return r.camera.position.distanceTo(r.controls.target); });
    assert.ok(close < before / 3, `${kind}: zoom tessuto almeno 3×, ${before} → ${close}`);
    await view.locator('#reset').tap();
    const reset = await view.evaluate(() => { const r = window.rendererTest; return r.camera.position.distanceTo(r.controls.target); });
    assert.ok(reset > close * 3, `${kind}: reset ripristina vista completa`);
  }
  assert.deepEqual(errors, []);
  console.log('Renderer mobile OK: revisioni 1–4, stampa sullo scrigno, estrazione/rotazione, export fedele, zoom ravvicinato Custodia e Plaza.');
} finally { await browser?.close(); await vite.close(); }
