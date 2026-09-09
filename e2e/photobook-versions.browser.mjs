// Browser reale, API isolate: nessuna email o scrittura di produzione.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const vite=await createServer({configFile:false,root:path.join(root,'e2e/mockup-harness'),publicDir:path.join(root,'client/public'),plugins:[{name:'firebase-test',enforce:'pre',resolveId(source,importer){if(source==='@/lib/firebase'||source.replaceAll('\\','/').endsWith('/client/src/lib/firebase')||(source==='./firebase'&&importer?.replaceAll('\\','/').includes('/client/src/lib/')))return path.join(root,'e2e/mockup-harness/firebase.ts');}},react()],resolve:{alias:{'@':path.join(root,'client/src'),'@shared':path.join(root,'shared')}},css:{postcss:path.join(root,'postcss.config.js')},server:{host:'127.0.0.1',port:0,fs:{allow:[root]}}});
let browser;
try {
 await vite.listen(); const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 browser=await chromium.launch({headless:true,...(fs.existsSync(edge)?{executablePath:edge}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 let published=2, notifications=0;
 const versions=[{version:1,pageCount:1},{version:2,pageCount:1},{version:3,pageCount:1,status:'draft'}];
 const book=()=>({id:'book',name:'Album prova',token:'same-token-long',currentVersion:published,versions,locked:false});
 const pages=v=>[{id:`page-${v}`,photobookId:'book',version:v,pageNumber:1,fileName:'pagina.jpg',url:'/page.svg',width:800,height:400}];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()); if(url.hostname!=='127.0.0.1')return route.abort();
  if(url.pathname==='/page.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#b9a58b"/></svg>'});
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const pathname=url.pathname;
  if(pathname.endsWith('/publish-version')){const body=route.request().postDataJSON();assert.equal(body.version,3);assert.equal(body.expectedPageCount,1);assert.equal(body.expectedCurrentVersion,2);published=3;versions[2].status='published';notifications++;return route.fulfill({json:{ok:true,notified:true}});}
  if(pathname.endsWith('/gallery-photos'))return route.fulfill({json:{photos:[],chapters:[]}});
  if(pathname.endsWith('/mockup'))return route.fulfill({json:{version:Number(url.searchParams.get('version'))||published,enabled:false,editable:false,saved:null}});
  if(pathname.includes('/by-token/')){const selected=Number(url.searchParams.get('version'))||published;return route.fulfill({json:{photobook:{...book(),versions:versions.filter(v=>v.status!=='draft')},version:selected,pages:pages(selected),requests:[]}});}
  if(pathname.endsWith('/pages'))return route.fulfill({json:{pages:pages(Number(url.searchParams.get('version')))}});
  return route.fulfill({json:{photobook:book()}});
 });
 await page.goto(`${base}/fotolibro/same-token-long`);
 await page.getByText('Stai vedendo la versione aggiornata 2',{exact:true}).waitFor();
 await page.getByTestId('overlay-rotate').waitFor();
 await page.getByText('Come controllare il tuo fotolibro · guida passo passo',{exact:true}).click();
 await page.getByText('Sfoglia tutte le pagine con le frecce.',{exact:true}).waitFor();
 await page.getByTestId('select-client-version').click();
 assert.equal(await page.getByRole('option',{name:/Versione 3/}).count(),0);
 await page.getByRole('option',{name:'Versione 1',exact:true}).click();
 await page.getByText('Versione precedente 1 · sola lettura',{exact:true}).waitFor();
 assert.equal(await page.getByTestId('button-open-approve').count(),0);
 await page.getByRole('button',{name:'Torna alla versione attuale',exact:true}).click();
 await page.getByText('Stai vedendo la versione aggiornata 2',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'work/photobook-versioni-mobile.png',fullPage:true});
 // Bozza di richiesta reale tramite gesto sul canvas: cambiare versione deve chiedere conferma.
 await page.getByTestId('button-activate-pen').click();
 const drawing=page.locator('img[src="/page.svg"]').first(); await drawing.scrollIntoViewIfNeeded();
 const box=await drawing.boundingBox(); assert.ok(box);
 await page.mouse.move(box.x+box.width*.3,box.y+box.height*.3); await page.mouse.down();
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.6,{steps:8}); await page.mouse.up();
 await page.getByTestId('button-confirm-mark').click();
 await page.getByTestId('button-action-edit').click();
 await page.getByTestId('input-request-note').fill('Schiarire questa foto');
 await page.getByTestId('button-save-draft').click();
 await page.getByTestId('select-client-version').click(); page.once('dialog',d=>d.dismiss());
 await page.getByRole('option',{name:'Versione 1',exact:true}).click();
 await page.getByText('Stai vedendo la versione aggiornata 2',{exact:true}).waitFor();
 await page.getByTestId('select-client-version').click(); page.once('dialog',d=>d.accept());
 await page.getByRole('option',{name:'Versione 1',exact:true}).click();
 await page.getByText('Versione precedente 1 · sola lettura',{exact:true}).waitFor();
 await page.setViewportSize({width:1280,height:900});
 await page.goto(`${base}/admin/photobooks/book`);
 const publish=page.getByRole('button',{name:'Pubblica versione e avvisa cliente',exact:true}); await publish.waitFor();
 assert.equal(notifications,0); page.once('dialog',d=>d.accept()); await publish.click();
 await page.getByRole('button',{name:'Avvisa cliente / verifica invio',exact:true}).waitFor(); assert.equal(notifications,1);
 await page.goto(`${base}/fotolibro/same-token-long`);
 await page.getByText('Stai vedendo la versione aggiornata 3',{exact:true}).waitFor();
 assert.deepEqual(errors,[]); console.log('Browser versioni OK: telefono verticale, guida, storico, ritorno attuale, bozza admin, pubblicazione esplicita e solito link aggiornato.');
} finally {await browser?.close();await vite.close();}
