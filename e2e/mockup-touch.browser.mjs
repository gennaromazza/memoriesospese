// Regressione touch: non sostituire tap con click, né usare force/dispatchEvent per i pulsanti.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit } from '@playwright/test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const vite=await createServer({configFile:false,root:path.join(root,'e2e/mockup-harness'),publicDir:path.join(root,'client/public'),plugins:[{name:'firebase-test',enforce:'pre',resolveId(source,importer){if(source==='@/lib/firebase'||source.replaceAll('\\','/').endsWith('/client/src/lib/firebase')||(source==='./firebase'&&importer?.replaceAll('\\','/').includes('/client/src/lib/')))return path.join(root,'e2e/mockup-harness/firebase.ts');}},react()],resolve:{alias:{'@':path.join(root,'client/src'),'@shared':path.join(root,'shared')}},css:{postcss:path.join(root,'postcss.config.js')},server:{host:'127.0.0.1',port:0,fs:{allow:[root]}}});
let browser;
let releaseRenderer;
let releaseRotating;
try {
 await vite.listen(); const port=vite.httpServer.address().port;
 const engine=process.env.MOCKUP_ENGINE||'chromium';
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{args:['--enable-unsafe-swiftshader'],...(fs.existsSync(edge)?{executablePath:edge}:{})}: {})});
 const page=await browser.newPage({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true});
 page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const catalog=JSON.parse(fs.readFileSync('client/public/mockups/custodia-v1/peppe-lab-catalog.json','utf8'));
 const materials=catalog.variants.slice(0,2).map(v=>({id:v.id,label:v.label,supplierCode:''}));
 const offer={revision:1,updatedAt:new Date().toISOString(),options:[['11111111-1111-4111-8111-111111111111','Custodia',catalog.models[0].id],['22222222-2222-4222-8222-222222222222','Plaza','album-girevole']].map(([id,name,rendererId])=>({id,name,rendererId,supplierCode:'',active:true,materialIds:materials.map(m=>m.id),materials,labId:'lab',labName:'Laboratorio test'}))};
 await page.route('**/api/**',route=>route.fulfill({json:{version:1,enabled:true,editable:true,saved:null,offer}}));
 const rendererGate=new Promise(resolve=>{releaseRenderer=resolve;});
 await page.route('**/mockups/custodia-v1/viewer.js',async route=>{await rendererGate;await route.continue();});
 const rotatingGate=new Promise(resolve=>{releaseRotating=resolve;});
 await page.route('**/mockups/girevole-v3/viewer.js',async route=>{await rotatingGate;await route.continue();});
 await page.goto(`http://127.0.0.1:${port}/?client`);
 await page.getByRole('button',{name:/^Apri mockup/}).tap();
 const frame=page.frameLocator('iframe');
 await page.locator('iframe').waitFor({state:'attached'});
 assert.equal(await page.locator('iframe').isVisible(),false,'Non mostrare il documento autonomo prima che il wizard sia pronto');
 await page.getByText('Preparazione del tuo configuratore…',{exact:true}).waitFor();
 releaseRenderer();
 await frame.locator('#wizard-slot').waitFor({timeout:45000});
 await frame.getByRole('button',{name:/^Plaza/}).tap();
 try { await page.waitForFunction(()=>document.querySelector('iframe')?.src.includes('girevole'),{},{timeout:10000}); }
 catch(error) { console.log('Stato dopo tap',await page.locator('body').innerText(),await frame.locator('body').innerText());throw error; }
 assert.equal(await page.locator('iframe').isVisible(),false,'Nascondere anche il renderer sostitutivo durante il cambio modello');
 releaseRotating();
 await frame.locator('#wizard-slot').waitFor({timeout:45000});
 await page.getByRole('button',{name:'Avanti',exact:true}).tap();
 await frame.getByRole('button',{name:'Bianco',exact:true}).tap();
 assert.equal(await frame.locator('#frameFinish').inputValue(),'white');
 await frame.getByRole('button',{name:'Estrai album',exact:true}).tap();
 assert.equal(await frame.locator('body').getAttribute('data-extraction'),'100');
 await page.getByRole('button',{name:'Avanti',exact:true}).tap();
 await frame.locator('#firstName').tap();await frame.locator('#firstName').fill('Anna');
 await page.getByRole('button',{name:'Indietro',exact:true}).tap();
 await page.getByRole('button',{name:'Avanti',exact:true}).tap();
 assert.equal(await frame.locator('#firstName').inputValue(),'Anna');
 await page.screenshot({path:`work/mockup-touch-${engine}.png`});
 assert.deepEqual(errors,[]);console.log(`Touch ${engine} OK: Plaza, finitura, estrazione, nomi, navigazione.`);
} finally {releaseRenderer?.();releaseRotating?.();await browser?.close();await vite.close();}
