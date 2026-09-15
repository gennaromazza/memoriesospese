// Scelta modello mobile-first: il modello e il layout di copertina restano due decisioni distinte.
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
].map(([id, name, rendererId]) => ({
  id, name, rendererId, supplierCode: '', active: true,
  materialIds: materials.map(material => material.id), materials,
  labId: 'test-lab', labName: 'Laboratorio esempi',
}));
const mainFile = path.join(root, 'e2e/mockup-harness/main.tsx').replaceAll('\\', '/');
const harness = `import React from 'react';import{createRoot}from'react-dom/client';import MockupModelChooser,{mockupCoverExamples}from'@/components/photobook/MockupModelChooser';import{MOCKUP_RENDERERS}from'@shared/mockup-catalog';import'@/index.css';
const options=${JSON.stringify(options)};const params=new URLSearchParams(location.search);const fixed=params.has('fixed');const filtered=params.has('empty')?[]:params.has('single')?options.slice(0,1):[...options,{...options[0],id:'inactive',name:'Disattivato',active:false},{...options[0],id:'unavailable',name:'Non disponibile',rendererId:null}];
window.__mockupCatalog=MOCKUP_RENDERERS.map(renderer=>({id:renderer.id,coverLayouts:[...renderer.coverLayouts],examples:mockupCoverExamples(renderer.id)}));
function Harness(){const[liveOptions,setLiveOptions]=React.useState(filtered);React.useEffect(()=>{window.__removeModel=id=>setLiveOptions(current=>current.filter(option=>option.id!==id));},[]);return <main style={{height:'100dvh',display:'flex',flexDirection:'column'}}><div style={{height:44,flexShrink:0,padding:'8px 14px',borderBottom:'1px solid #ddd'}}>Personalizza il tuo album</div><MockupModelChooser options={liveOptions} initialOption={params.has('initial')||fixed?options[1]:undefined} fixed={fixed} onCancel={()=>window.__cancelled=true} onChoose={(option,layout)=>{window.__chosen={option,layout};}}/></main>}createRoot(document.getElementById('root')).render(<Harness/>);`;
const vite = await createServer({
  configFile: false,
  cacheDir: path.join(root, 'node_modules/.vite-mockup-chooser'),
  root: path.join(root, 'e2e/mockup-harness'),
  publicDir: path.join(root, 'client/public'),
  plugins: [{ name: 'chooser-test-harness', enforce: 'pre', load(id) { if (id.replaceAll('\\', '/') === mainFile) return harness; } }, react()],
  resolve: { alias: { '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared') } },
  css: { postcss: path.join(root, 'postcss.config.js') },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
});

let browser;
try {
  await vite.listen();
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(10000);
  const errors = [];
  const responses = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().includes('/mockups/examples/')) responses.push(response); });
  await page.route('**/api/**', () => assert.fail('Il selettore non deve chiamare API'));
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
  const chooser = page.getByTestId('mockup-model-chooser');
  const primary = page.getByRole('button', { name: /Continua/ });

  async function fits(locator) {
    const box = await locator.boundingBox();
    assert.ok(box, 'Elemento presente');
    const viewport = page.viewportSize();
    assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `Elemento dentro il viewport: ${JSON.stringify(box)}`);
  }

  async function fitsHorizontally(locator) {
    const box = await locator.boundingBox();
    assert.ok(box, 'Elemento presente');
    const viewport = page.viewportSize();
    assert.ok(box.x >= -1 && box.x + box.width <= viewport.width + 1, `Elemento dentro la larghezza del viewport: ${JSON.stringify(box)}`);
  }

  await page.goto(url);
  const registry = await page.evaluate(() => window.__mockupCatalog);
  assert.ok(registry.length > 0, 'Registry renderer disponibile nel client');
  for (const renderer of registry) {
    assert.equal(renderer.coverLayouts.length, renderer.examples.length, `${renderer.id}: un esempio per ogni layout`);
    assert.deepEqual(renderer.coverLayouts.slice().sort(), renderer.examples.map(example => example.layout).slice().sort(), `${renderer.id}: layouts ed esempi coincidono`);
  }
  const custodiaRegistry = registry.find(renderer => renderer.id === options[1].rendererId);
  const rotatingRegistry = registry.find(renderer => renderer.id === options[0].rendererId);
  assert.ok(custodiaRegistry && rotatingRegistry, 'Renderer fixture registrati');
  const custodiaFirstLayout = custodiaRegistry.coverLayouts[0];
  const custodiaSecondLayout = custodiaRegistry.coverLayouts[1];
  const rotatingLayoutToConfirm = rotatingRegistry.coverLayouts.find(layout => layout === 'photo-plaque') || rotatingRegistry.coverLayouts[0];
  assert.equal(await chooser.getAttribute('data-chooser-stage'), 'models');
  assert.equal(await page.locator('canvas,iframe').count(), 0, 'Nessun renderer prima della conferma');
  assert.equal(await page.locator('.mockup-chooser-model-card').count(), 4, 'Inattivi e renderer senza esempi sono esclusi');
  for (const name of ['Plaza', 'Ricordi', 'Terzo modello', 'Quarto modello']) {
    assert.equal(await page.getByRole('button', { name: `Scegli ${name}`, exact: true }).count(), 1, `${name} visibile insieme agli altri modelli`);
  }
  assert.equal(await page.getByRole('button', { name: /Disattivato/ }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /Non disponibile/ }).count(), 0);
  assert.equal(await page.evaluate(() => window.__chosen), undefined, 'Nessuna scelta implicita');
  assert.equal(await page.locator('.mockup-chooser-carousel').count(), 0, 'Nessun carosello nel nuovo flusso');

  // La preselezione resta nel primo passo e non invoca il callback.
  await page.goto(`${url}?initial=1`);
  assert.equal(await chooser.getAttribute('data-chooser-stage'), 'models');
  assert.equal(await page.getByTestId(`mockup-model-${options[1].id}`).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => window.__chosen), undefined);
  await page.getByTestId(`mockup-model-${options[1].id}`).tap();
  assert.equal(await chooser.getAttribute('data-chooser-stage'), 'styles');
  assert.equal(await page.locator('[role="radio"]').count(), custodiaRegistry.coverLayouts.length, 'Custodia mostra solo i layout compatibili');
  assert.equal(await page.getByTestId('choose-mockup-example-plaque').count(), 0, 'Nessuna copertina non supportata');
  assert.equal(await primary.isDisabled(), true);
  const radios = page.locator('[role="radio"]');
  assert.equal(await radios.nth(0).getAttribute('tabindex'), '0');
  assert.equal(await radios.nth(1).getAttribute('tabindex'), '-1');
  await radios.nth(0).press('ArrowRight');
  await page.waitForFunction(layout => document.activeElement?.getAttribute('data-testid') === `choose-mockup-example-${layout}`, custodiaSecondLayout);
  assert.equal(await radios.nth(1).getAttribute('aria-checked'), 'true');
  await radios.nth(1).press('Home');
  assert.equal(await radios.nth(0).getAttribute('aria-checked'), 'true');
  await radios.nth(0).press('End');
  assert.equal(await radios.nth(1).getAttribute('aria-checked'), 'true');
  await page.getByTestId(`choose-mockup-example-${custodiaSecondLayout}`).tap();
  assert.equal(await page.evaluate(() => window.__chosen), undefined, 'Scegliere lo stile non conferma ancora');
  await primary.tap();
  assert.deepEqual(await page.evaluate(() => window.__chosen), { option: options[1], layout: custodiaSecondLayout }, 'Callback con opzione originale e layout');

  // Indietro/cambio modello e compatibilità dei quattro layout Girevole.
  await page.getByTestId('mockup-change-model').tap();
  assert.equal(await chooser.getAttribute('data-chooser-stage'), 'models');
  await page.getByTestId(`mockup-model-${options[0].id}`).tap();
  assert.equal(await page.locator('[role="radio"]').count(), rotatingRegistry.coverLayouts.length);
  for (const layout of rotatingRegistry.coverLayouts) {
    assert.equal(await page.getByTestId(`choose-mockup-example-${layout}`).count(), 1, `${layout} compatibile`);
  }
  await page.getByTestId(`choose-mockup-example-${rotatingLayoutToConfirm}`).tap();
  await primary.tap();
  assert.deepEqual(await page.evaluate(() => window.__chosen), { option: options[0], layout: rotatingLayoutToConfirm });

  // Il modello fisso non espone modelli alternativi e, se pre-selezionato, apre gli stili.
  await page.goto(`${url}?fixed=1`);
  assert.equal(await chooser.getAttribute('data-chooser-stage'), 'styles');
  assert.equal(await page.getByText('Scelto dallo studio', { exact: true }).count(), 1);
  assert.equal(await page.locator('.mockup-chooser-model-card').count(), 0);
  assert.equal(await page.getByTestId('mockup-change-model').count(), 1);
  await page.getByTestId('mockup-change-model').tap();
  assert.equal(await chooser.getAttribute('data-chooser-stage'), 'models');
  assert.equal(await page.locator('.mockup-chooser-model-card').count(), 1, 'In modalità fissa non ci sono modelli estranei');
  assert.equal(await page.getByRole('button', { name: /Scegli Plaza/ }).count(), 0);
  await page.getByTestId(`mockup-model-${options[1].id}`).tap();
  await page.getByTestId(`choose-mockup-example-${custodiaFirstLayout}`).tap();
  await primary.tap();
  assert.deepEqual(await page.evaluate(() => window.__chosen), { option: options[1], layout: 'oblique' });

  // Se il catalogo viene aggiornato mentre il secondo passo è aperto, non resta una schermata vuota.
  await page.goto(`${url}?initial=1&live=1`);
  await page.getByTestId(`mockup-model-${options[1].id}`).tap();
  assert.equal(await chooser.getAttribute('data-chooser-stage'), 'styles');
  await page.evaluate(id => window.__removeModel(id), options[1].id);
  await page.waitForFunction(() => document.querySelector('[data-testid="mockup-model-chooser"]')?.getAttribute('data-chooser-stage') === 'models');
  assert.equal(await page.locator('.mockup-chooser-style-stage').count(), 0, 'Il modello rimosso non lascia il secondo passo vuoto');
  assert.ok(await page.locator('.mockup-chooser-model-card').count() >= 1);

  // Azioni e contenimento restano raggiungibili con touch e in entrambe le orientazioni.
  for (const size of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.goto(`${url}?initial=1`);
    for (const button of await page.locator('button:visible').all()) {
      const box = await button.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `Touch target >= 44px: ${JSON.stringify(box)}`);
      await fitsHorizontally(button);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Nessun overflow orizzontale');
    await page.getByTestId(`mockup-model-${options[1].id}`).tap();
    await fitsHorizontally(page.getByTestId(`choose-mockup-example-${custodiaSecondLayout}`));
    await fits(primary);
  }

  await page.goto(`${url}?empty=1`);
  assert.equal(await page.getByText('Nessun modello disponibile', { exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Torna al tuo album', exact: true }).tap();
  assert.equal(await page.evaluate(() => window.__cancelled), true);
  assert.ok(responses.length >= 4 && responses.every(response => response.ok()), 'Anteprime presenti e caricabili');
  assert.deepEqual(errors, []);
  console.log('Selettore verificato: modelli dinamici, preselezione, modalità fissa, compatibilità, back/callback e viewport mobile.');
} finally {
  await browser?.close();
  await vite.close();
}
