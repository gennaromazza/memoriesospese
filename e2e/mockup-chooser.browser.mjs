// Caroselli isolati: API assenti, esempi neutri, tocchi/swipe reali simulati.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalog = JSON.parse(fs.readFileSync('client/public/mockups/custodia-v1/peppe-lab-catalog.json', 'utf8'));
const materials = catalog.variants.slice(0, 2).map(variant => ({ id: variant.id, label: variant.label, supplierCode: '' }));
const options = [
  ['11111111-1111-4111-8111-111111111111', 'Plaza', 'album-girevole'],
  ['22222222-2222-4222-8222-222222222222', 'Ricordi', catalog.models[0].id],
  ['33333333-3333-4333-8333-333333333333', 'Terzo modello', 'album-girevole'],
  ['44444444-4444-4444-8444-444444444444', 'Quarto modello', catalog.models[0].id],
].map(([id, name, rendererId]) => ({ id, name, rendererId, supplierCode: '', active: true, materialIds: materials.map(material => material.id), materials, labId: 'test-lab', labName: 'Laboratorio esempi' }));
const mainFile = path.join(root, 'e2e/mockup-harness/main.tsx').replaceAll('\\', '/');
const harness = `import React from 'react';import {createRoot} from 'react-dom/client';import MockupModelChooser from '@/components/photobook/MockupModelChooser';import '@/index.css';
const options=${JSON.stringify(options)};const params=new URLSearchParams(location.search);let filtered=params.has('single')?options.slice(0,1):params.has('empty')?[]:[...options,{...options[0],id:'inactive',name:'Disattivato',active:false},{...options[0],id:'unavailable',name:'Non disponibile',rendererId:null}];
createRoot(document.getElementById('root')).render(<main style={{height:'100dvh',display:'flex',flexDirection:'column'}}><div style={{height:44,flexShrink:0,padding:'8px 14px',borderBottom:'1px solid #ddd'}}>Personalizza il tuo album</div><MockupModelChooser options={filtered} initialOption={params.has('initial')?options[1]:undefined} onCancel={()=>window.__cancelled=true} onChoose={(option,layout)=>{window.__chosen={option,layout};}}/></main>);`;
const vite = await createServer({ configFile: false, cacheDir: path.join(root, 'node_modules/.vite-mockup-chooser'), root: path.join(root, 'e2e/mockup-harness'), publicDir: path.join(root, 'client/public'), plugins: [{ name: 'chooser-test-harness', enforce: 'pre', load(id) { if (id.replaceAll('\\', '/') === mainFile) return harness; } }, react()], resolve: { alias: { '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared') } }, css: { postcss: path.join(root, 'postcss.config.js') }, server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } } });
let browser;
try {
  await vite.listen();
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  const responses = []; page.on('response', response => { if (response.url().includes('/mockups/examples/')) responses.push(response); });
  await page.route('**/api/**', () => assert.fail('Il carosello non deve chiamare API'));
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
  const chooser = page.getByTestId('mockup-model-chooser');
  async function activeStyle(id) {
    await page.waitForFunction(layout => document.querySelector(`[data-testid="choose-mockup-example-${layout}"]`)?.tabIndex === 0, id);
  }
  async function fits(locator) {
    await page.waitForFunction(node => { const box = node.getBoundingClientRect(); return box.x >= -1 && box.y >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1; }, await locator.elementHandle());
    const box = await locator.boundingBox(); assert.ok(box, 'Elemento presente');
    const viewport = page.viewportSize();
    assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `Elemento dentro il viewport: ${JSON.stringify(box)}`);
  }
  await page.goto(url);
  assert.equal(await chooser.getAttribute('data-chooser-stage'), 'models');
  assert.equal(await page.locator('canvas,iframe').count(), 0, 'Nessun renderer prima della scelta');
  assert.equal(await page.getByText('Personalizza questo', { exact: true }).count(), 0, 'Prima si vedono solo i modelli');
  assert.equal(await page.evaluate(() => window.__chosen), undefined, 'Nessuna scelta implicita');
  assert.equal(await page.locator('.mockup-chooser-slide').count(), 4, 'Esclusi modelli inattivi o senza renderer');
  const nextSlide = await page.locator('.mockup-chooser-slide').nth(1).boundingBox();
  assert.ok(nextSlide.x < page.viewportSize().width && nextSlide.x > page.viewportSize().width - 65, 'La scheda successiva è accennata, senza mostrare due modelli insieme');
  await page.getByRole('button', { name: 'Scopri Plaza', exact: true }).tap();
  assert.equal(await chooser.getAttribute('data-chooser-stage'), 'styles');
  assert.equal(await page.locator('.mockup-chooser-slide').count(), 3);
  assert.equal(await page.evaluate(() => window.__chosen), undefined, 'Il tocco sul modello non sceglie uno stile');
  await page.getByRole('button', { name: 'Esempio successivo', exact: true }).tap();
  await activeStyle('full');
  await fits(page.getByTestId('choose-mockup-example-full'));
  await page.getByTestId('choose-mockup-example-full').tap();
  assert.deepEqual(await page.evaluate(() => window.__chosen), { option: options[0], layout: 'full' }, 'Solo modello e layout: niente foto/nomi dimostrativi');
  await page.getByRole('button', { name: 'Modelli', exact: true }).tap();
  await page.getByRole('button', { name: 'Modello successivo', exact: true }).tap();
  await page.getByRole('button', { name: 'Scopri Ricordi', exact: true }).tap();
  assert.equal(await page.locator('.mockup-chooser-slide').count(), 2, 'Custodia propone solo i due stili reali');
  assert.equal(await page.getByTestId('choose-mockup-example-plaque').count(), 0, 'Nessuna incisione non supportata');
  await page.getByRole('button', { name: 'Esempio successivo', exact: true }).tap();
  await activeStyle('full');
  await page.getByTestId('choose-mockup-example-full').tap();
  assert.deepEqual(await page.evaluate(() => window.__chosen), { option: options[1], layout: 'full' });
  await page.getByRole('button', { name: 'Modelli', exact: true }).tap();
  await page.waitForFunction(() => document.querySelector('[aria-label="Scopri Ricordi"]')?.tabIndex === 0);
  // Un vero swipe touch non deve attivare la scheda trascinata.
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator('.mockup-chooser-carousel').boundingBox();
  const start = box.x + box.width * .7; const finish = box.x + box.width * .2; const y = box.y + box.height * .45;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start + (finish - start) * i / 8, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => document.querySelector('[aria-label="Scopri Terzo modello"]')?.tabIndex === 0);
  assert.equal(await chooser.getAttribute('data-chooser-stage'), 'models', 'Scorrere non sceglie il modello');
  await page.getByRole('button', { name: 'Scopri Terzo modello', exact: true }).tap();
  for (const size of [{ width: 667, height: 300 }, { width: 844, height: 390 }, { width: 320, height: 640 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await activeStyle('plaque');
    await fits(page.getByTestId('choose-mockup-example-plaque'));
    assert.ok(await page.getByTestId('choose-mockup-example-plaque').evaluate(node => { const action = node.getBoundingClientRect(), card = node.closest('.mockup-chooser-card').getBoundingClientRect(); return action.bottom <= card.bottom && action.top >= card.top; }), 'Azione non tagliata dalla scheda');
    await fits(page.getByRole('navigation', { name: 'Scorri gli esempi' }));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Nessun overflow orizzontale');
    fs.mkdirSync(path.join(root, 'work'), { recursive: true });
    await page.screenshot({ path: path.join(root, `work/mockup-chooser-${size.width}x${size.height}.png`) });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  fs.mkdirSync(path.join(root, 'work'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'work/mockup-chooser-landscape.png') });
  await page.getByRole('button', { name: 'Esempio successivo', exact: true }).tap(); await activeStyle('full');
  await page.getByRole('button', { name: 'Esempio successivo', exact: true }).tap(); await activeStyle('photo-plaque');
  await page.getByTestId('choose-mockup-example-photo-plaque').tap();
  assert.equal((await page.evaluate(() => window.__chosen)).layout, 'photo-plaque');
  await page.goto(`${url}?single=1`);
  assert.equal(await chooser.getAttribute('data-chooser-stage'), 'models', 'Anche un solo modello richiede una scelta esplicita');
  assert.equal(await page.getByRole('button', { name: 'Modello successivo', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Annulla', exact: true }).tap(); assert.equal(await page.evaluate(() => window.__cancelled), true);
  await page.goto(`${url}?initial=1`);
  await page.waitForFunction(() => document.querySelector('[aria-label="Scopri Ricordi"]')?.tabIndex === 0);
  assert.equal(await chooser.getAttribute('data-chooser-stage'), 'models', 'Cambia modello mostra la posizione corrente, non sceglie automaticamente');
  await page.goto(`${url}?empty=1`); assert.equal(await page.getByText('Nessun modello disponibile', { exact: true }).count(), 1);
  assert.ok(responses.length >= 5 && responses.every(response => response.ok()), 'Anteprime presenti e caricabili');
  assert.deepEqual(errors, []);
  console.log('Caroselli verificati: due livelli, layout compatibili, swipe/tap, 4 viewport, ritorno, esempi isolati, catalogo singolo/vuoto.');
} finally { await browser?.close(); await vite.close(); }
