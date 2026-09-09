// Esporta anteprime statiche dai renderer reali. Non accede ad API o foto cliente.
// Le immagini dimostrative restano negli asset del carosello e non entrano nei salvataggi.
// --rotating-only aggiorna soltanto le tre anteprime del girevole.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const output = path.join(root, 'client/public/mockups/examples');
const demo = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#c8d9dd"/><stop offset="1" stop-color="#f1e4c9"/></linearGradient><linearGradient id="water" x2="0" y2="1"><stop stop-color="#809e9e"/><stop offset="1" stop-color="#456f76"/></linearGradient></defs>
<path fill="url(#sky)" d="M0 0h1600v1200H0z"/><circle cx="1130" cy="270" r="110" fill="#fff3d7"/>
<path fill="#b3bbad" d="M0 570 220 430 440 540 660 330 1000 580 1320 430 1600 570V1200H0z"/>
<path fill="#829386" d="M0 650 240 555 475 670 790 490 1040 680 1430 510 1600 590V1200H0z"/>
<path fill="url(#water)" d="M0 710 Q360 630 800 730T1600 690V1200H0z"/>
<path fill="#dfd2ac" d="M0 840Q280 810 590 890T1120 1060L1600 1200H0z"/>
<path fill="none" stroke="#f5edd9" stroke-width="8" opacity=".7" d="M0 826Q280 796 590 876T1140 1048"/>
<g fill="#455d4d"><path d="M0 500Q130 600 250 1040L170 1200H0z"/><ellipse cx="110" cy="490" rx="160" ry="155"/><ellipse cx="140" cy="635" rx="160" ry="170"/></g>
</svg>`;
const photo = await sharp(Buffer.from(demo)).png().toBuffer();
const vite = await createServer({ configFile: false, root: path.join(root, 'e2e/mockup-harness'), publicDir: path.join(root, 'client/public'), optimizeDeps: { noDiscovery: true }, server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  fs.mkdirSync(output, { recursive: true });
  await vite.listen();
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  const page = await browser.newPage({ viewport: { width: 1000, height: 780 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(30000);
  const renderers = [['custodia-v1', ['oblique', 'full']], ['girevole-v4', ['plaque', 'full', 'photo-plaque']]];
  for (const [renderer, layouts] of renderers.filter(([id]) => !process.argv.includes('--rotating-only') || id.startsWith('girevole'))) {
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/mockups/${renderer}/index.html`);
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === '' && !document.querySelector('#downloadClient')?.disabled);
    await page.addStyleTag({ content: 'body,main,.workspace,.stage{width:100vw!important;height:100vh!important;min-height:0!important;margin:0!important;padding:0!important;display:block!important}header,aside,.tools,.view-tools,.hint,.badge,.zoom{display:none!important}.stage{position:fixed!important;inset:0!important}#viewport{width:100%!important;height:100%!important}' });
    await page.locator('#coverUpload').setInputFiles({ name: 'Paesaggio dimostrativo.png', mimeType: 'image/png', buffer: photo });
    await page.waitForFunction(() => !document.querySelector('#downloadClient')?.disabled);
    await page.evaluate(rotating => {
      const fire = (id, value, event = 'input') => { const node = document.getElementById(id); node.value = value; node.dispatchEvent(new Event(event, { bubbles: true })); };
      if (rotating) { fire('firstName', 'Anna'); fire('secondName', 'Jacopo'); fire('rotation', 0); }
      else { fire('topText', 'Anna & Jacopo'); fire('bottomText', 'I nostri ricordi'); }
      document.getElementById('reset').click();
      if (rotating) fire('rotation', 0);
      document.getElementById('plus').click();
    }, renderer.startsWith('girevole'));
    for (const layout of layouts) {
      await page.evaluate(value => { const select = document.getElementById('coverLayout'); select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }, layout);
      await page.waitForFunction(() => !document.querySelector('#downloadClient')?.disabled);
      await page.evaluate(() => new Promise(resolve => { let remaining = 16; const settle = () => --remaining ? requestAnimationFrame(settle) : resolve(); requestAnimationFrame(settle); }));
      const filename = `${renderer.startsWith('girevole') ? 'girevole' : 'custodia'}-${layout}.webp`;
      await sharp(await page.locator('#viewport').screenshot()).trim({ threshold: 6 }).extend({ top: 28, bottom: 28, left: 36, right: 36, background: '#e9e8e1' }).resize({ width: 900 }).webp({ quality: 87 }).toFile(path.join(output, filename));
      console.log(`Anteprima esportata: ${filename}`);
    }
  }
} finally { await browser?.close(); await vite.close(); }
