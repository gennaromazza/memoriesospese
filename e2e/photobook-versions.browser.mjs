// Browser reale, API isolate: nessuna email o scrittura di produzione.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createMockupHarnessServer } from './mockup-harness/vite-server.mjs';
const root=process.cwd();
const vite=await createMockupHarnessServer(root);
let browser;
try {
 await vite.listen(); const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 browser=await chromium.launch({headless:true,...(fs.existsSync(edge)?{executablePath:edge}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[]; page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});
 let published=2, notifications=0, approval=null, locked=false, approvedCalls=0;
 let requests=[];
 const catalog=JSON.parse(fs.readFileSync('client/public/mockups/custodia-v1/peppe-lab-catalog.json','utf8'));
 const material=catalog.variants[0];
 const offer={revision:1,updatedAt:new Date().toISOString(),options:[{id:'11111111-1111-4111-8111-111111111111',name:'Ricordi',rendererId:catalog.models[0].id,supplierCode:'',active:true,materialIds:[material.id],materials:[{id:material.id,label:material.label,supplierCode:''}],labId:'lab',labName:'Laboratorio test'}]};
 const versions=[{version:1,pageCount:1},{version:2,pageCount:1},{version:3,pageCount:1,status:'draft'}];
 const book=()=>({id:'book',name:'Album prova',token:'same-token-long',currentVersion:published,versions,locked,approval});
 const pages=v=>[{id:`page-${v}`,photobookId:'book',version:v,pageNumber:1,fileName:'pagina.jpg',url:'/page.svg',width:800,height:400}];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()); if(url.hostname!=='127.0.0.1')return route.abort();
  if(url.pathname==='/page.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#b9a58b"/></svg>'});
   if(url.pathname==='/replacement.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#9fb5a5"/></svg>'});
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const pathname=url.pathname;
  if(pathname.endsWith('/publish-version')){const body=route.request().postDataJSON();assert.equal(body.version,3);assert.equal(body.expectedPageCount,1);assert.equal(body.expectedCurrentVersion,2);published=3;versions[2].status='published';notifications++;return route.fulfill({json:{ok:true,notified:true}});}
   if(pathname.endsWith('/gallery-photos'))return route.fulfill({json:{photos:[{id:'replacement-photo',name:'sostituzione.jpg',url:'/replacement.svg',thumbnailUrl:'/replacement.svg'}],chapters:[]}});
  if(pathname.endsWith('/approve')){assert.equal(route.request().method(),'POST');approvedCalls++;approval={version:published};return route.fulfill({json:{ok:true,approved:true}});}
  if(pathname.endsWith('/mockup')){const version=Number(url.searchParams.get('version'))||published;return route.fulfill({json:{version,enabled:true,editable:!locked&&version===published&&approval?.version===published,approvalRequired:version===published&&approval?.version!==published,saved:null,offer}});}
  if(pathname.includes('/by-token/')){const selected=Number(url.searchParams.get('version'))||published;return route.fulfill({json:{photobook:{...book(),versions:versions.filter(v=>v.status!=='draft')},version:selected,pages:pages(selected),requests}});}
  if(pathname.endsWith('/pages'))return route.fulfill({json:{pages:pages(Number(url.searchParams.get('version')))}});
  return route.fulfill({json:{photobook:book()}});
 });
 await page.goto(`${base}/fotolibro/same-token-long`);
 await page.getByTestId('overlay-rotate').waitFor();
 await page.setViewportSize({width:844,height:390});
 await page.getByTestId('overlay-rotate').waitFor({state:'hidden'});
 await page.getByTestId('photobook-header-status').filter({hasText:'Versione 2 aggiornata · da approvare'}).waitFor();
 assert.equal(await page.getByTestId('photobook-mockup').count(),0,'Nessuna scheda o configuratore prima dell’approvazione');
 assert.equal(await page.locator('iframe').count(),0);
 const pageBounds=await page.locator('img[src="/page.svg"]').boundingBox();
 const headerBounds=await page.locator('header').boundingBox();
 assert.ok(pageBounds&&headerBounds&&pageBounds.y<=headerBounds.y+headerBounds.height+32,'Le pagine seguono l’header senza schede o spiegazioni ingombranti');
 await page.screenshot({path:'work/photobook-mobile-header.png'});
 // Ogni modale deve rimanere visibile, entro lo schermo e senza blocco rotazione.
 const checkModalOrientations=async(role='dialog')=>{
  await page.getByRole(role).last().waitFor();
  await page.waitForTimeout(300);
  for(const viewport of [{width:390,height:844},{width:667,height:375},{width:844,height:390}]){
   await page.setViewportSize(viewport);
   await page.getByTestId('overlay-rotate').waitFor({state:'hidden'});
   const modal=page.getByRole(role).last(); await modal.waitFor();
   await page.waitForTimeout(250);
   const bounds=await modal.boundingBox();
   assert.ok(bounds && bounds.x>=-1 && bounds.y>=-1 && bounds.x+bounds.width<=viewport.width+1 && bounds.y+bounds.height<=viewport.height+1,JSON.stringify({viewport,bounds}));
  }
 };
 const simulateVirtualKeyboard=async(height)=>{
  await page.evaluate((nextHeight)=>{
   const viewport=window.visualViewport;
   if(!viewport) throw new Error('visualViewport non disponibile');
   Object.defineProperty(viewport,'height',{configurable:true,value:nextHeight});
   viewport.dispatchEvent(new Event('resize'));
  },height);
  await page.waitForTimeout(100);
 };
 const restoreVirtualKeyboard=async()=>{
  await page.evaluate(()=>{
   const viewport=window.visualViewport;
   if(!viewport) return;
   Object.defineProperty(viewport,'height',{configurable:true,value:window.innerHeight});
   viewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(100);
 };
  const assertDialogAccessibility=async(role,title)=>{
   const dialog=page.getByRole(role).last();
   await dialog.waitFor();
   const a11y=await dialog.evaluate(element=>{
    const resolve=(attribute)=>{
     const ids=(element.getAttribute(attribute)||'').split(/\s+/).filter(Boolean);
     return ids.map(id=>document.getElementById(id)?.textContent?.trim()||'').filter(Boolean).join(' ');
    };
    return {
     labelledBy:element.getAttribute('aria-labelledby'),
     describedBy:element.getAttribute('aria-describedby'),
     title:resolve('aria-labelledby'),
     description:resolve('aria-describedby'),
     focusInside:element.contains(document.activeElement),
    };
   });
   assert.ok(a11y.labelledBy,`${role} senza nome accessibile`);
   assert.match(a11y.title,new RegExp(title));
   assert.ok(a11y.describedBy,`${role} senza descrizione accessibile`);
   assert.ok(a11y.description,`${role} con descrizione vuota`);
   assert.equal(a11y.focusInside,true,`${role} ha lasciato il focus fuori dal dialogo`);
   return dialog;
  };
 await page.getByTestId('button-open-approve').tap();
 await checkModalOrientations();
 await page.getByRole('button',{name:'Torna alla revisione',exact:true}).tap();
 await page.getByTestId('button-page-pill-slide').tap();
 await checkModalOrientations();
 await page.getByTestId('button-jump-page-1').tap();
 await page.getByTestId('button-photobook-help').tap();
 await checkModalOrientations();
 await page.getByText("Prima le pagine, poi l'aspetto del tuo album.",{exact:true}).waitFor();
 await page.getByRole('button',{name:'Ho capito',exact:true}).tap();
 await page.getByTestId('select-client-version').tap();
 assert.equal(await page.getByRole('option',{name:/Versione 3/}).count(),0);
 await page.getByRole('option',{name:'Versione 1',exact:true}).tap();
 await page.getByTestId('photobook-header-status').filter({hasText:'Versione 1 precedente · sola lettura'}).waitFor();
 assert.equal(await page.getByTestId('button-open-approve').count(),0);
 await page.getByRole('button',{name:'Torna alla versione attuale',exact:true}).tap();
 await page.getByTestId('photobook-header-status').filter({hasText:'Versione 2 aggiornata · da approvare'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 // Bozza di richiesta reale tramite gesto sul canvas: cambiare versione deve chiedere conferma.
 await page.getByTestId('button-activate-pen').tap();
 const drawing=page.locator('img[src="/page.svg"]').first(); await drawing.scrollIntoViewIfNeeded();
 const box=await drawing.boundingBox(); assert.ok(box);
 const touch=await page.context().newCDPSession(page);
 await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.3,y:box.y+box.height*.3}]});
 for(let i=1;i<=8;i++) await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*(.3+.2*i/8),y:box.y+box.height*(.3+.3*i/8)}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForTimeout(500);
 await page.getByTestId('button-confirm-mark').tap();
  await assertDialogAccessibility('dialog','Pagina 1');
 await checkModalOrientations();
  await page.getByTestId('button-action-replace').tap();
  const pickerDialog=await assertDialogAccessibility('dialog','Scegli la foto sostitutiva');
  const pickerLabel=await pickerDialog.getAttribute('aria-labelledby');
  assert.equal(await page.evaluate(labelledBy=>document.activeElement?.closest('[role="dialog"]')?.getAttribute('aria-labelledby'),pickerLabel),pickerLabel);
  await page.getByTestId('button-pick-photo-replacement-photo').tap();
  await assertDialogAccessibility('dialog','Sostituisci foto');
  await page.getByRole('button',{name:'Indietro',exact:true}).tap();
  await assertDialogAccessibility('dialog','Pagina 1');
 await page.getByTestId('button-action-edit').tap();
  await assertDialogAccessibility('dialog','Richiedi una modifica');
 await checkModalOrientations();
 assert.equal(await page.getByTestId('overlay-rotate-portrait').count(),0);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.getByTestId('overlay-rotate').count(),0);
 await page.getByTestId('input-request-note').fill('Schiarire questa foto');
 await simulateVirtualKeyboard(430);
 const noteDialog=page.getByRole('dialog').last();
 const noteDialogBounds=await noteDialog.boundingBox();
 assert.ok(noteDialogBounds && noteDialogBounds.y>=-1 && noteDialogBounds.y+noteDialogBounds.height<=844+1,JSON.stringify({noteDialogBounds}));
 const noteFooterDirection=await page.getByTestId('button-save-draft').evaluate(element=>getComputedStyle(element.parentElement).flexDirection);
 assert.equal(noteFooterDirection,'row','Il footer della nota deve restare raggiungibile con la tastiera virtuale');
 await restoreVirtualKeyboard();
 await page.setViewportSize({width:844,height:390});
 assert.equal(await page.getByTestId('input-request-note').inputValue(),'Schiarire questa foto');
 await page.getByTestId('button-save-draft').tap();
 await page.getByTestId('button-drafts-fab').tap();
 await checkModalOrientations();
 await page.getByTestId('button-clear-all-from-summary').tap();
 await checkModalOrientations('alertdialog');
 await page.getByRole('alertdialog').getByRole('button',{name:'Annulla',exact:true}).tap();
 await page.getByRole('button',{name:'Torna alla revisione',exact:true}).tap();
 await page.getByTestId('select-client-version').tap();
 await page.getByRole('option',{name:'Versione 1',exact:true}).tap();
 await checkModalOrientations('alertdialog');
 const versionConfirm=page.getByRole('alertdialog').last();
 const versionConfirmStyle=await versionConfirm.evaluate(element=>{
  const style=getComputedStyle(element);
  return {paddingBottom:parseFloat(style.paddingBottom),maxHeight:style.maxHeight};
 });
 assert.ok(versionConfirmStyle.paddingBottom>=24,'La conferma versione deve rispettare una zona sicura inferiore');
 assert.match(versionConfirmStyle.maxHeight,/dvh|px/);
 await page.getByRole('alertdialog').getByRole('button',{name:'Annulla',exact:true}).tap();
 await page.getByTestId('photobook-header-status').filter({hasText:'Versione 2 aggiornata · da approvare'}).waitFor();
 await page.getByTestId('select-client-version').tap();
 await page.getByRole('option',{name:'Versione 1',exact:true}).tap();
 await page.getByRole('alertdialog').getByRole('button',{name:'Cambia versione',exact:true}).tap();
 await page.getByTestId('photobook-header-status').filter({hasText:'Versione 1 precedente · sola lettura'}).waitFor();
 requests=[{id:'sent-test',photobookId:'book',photobookName:'Album prova',galleryId:'gallery',version:2,pageId:'page-2',pageNumber:1,type:'edit',note:'Correzione precedente',status:'pending',batchId:'batch',createdAt:new Date().toISOString()}];
 await page.reload();
 await page.getByTestId('button-delete-sent-sent-test').tap();
 await checkModalOrientations('alertdialog');
 await page.getByRole('alertdialog').getByRole('button',{name:'Annulla',exact:true}).tap();
 // Approva davvero (API simulata): la CTA compare in header, mai sopra le pagine.
 requests=[]; await page.reload();
 await page.getByTestId('button-open-approve').tap();
 await page.getByTestId('button-confirm-approve').tap();
 await page.getByTestId('photobook-header-status').filter({hasText:'Versione 2 · pagine approvate'}).waitFor();
 assert.equal(approvedCalls,1);
 assert.equal(await page.getByTestId('button-open-approve').count(),0);
 assert.equal(await page.getByTestId('button-activate-pen').count(),0);
 await page.getByTestId('button-open-client-mockup').waitFor();
 assert.equal(await page.locator('main').getByTestId('photobook-mockup').count(),0);
 assert.equal(await page.locator('iframe').count(),0,'L’approvazione non apre automaticamente il renderer');
 await page.getByTestId('button-open-client-mockup').tap();
 await page.getByRole('dialog').waitFor();
 await page.getByRole('button',{name:'Chiudi mockup',exact:true}).tap();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.setViewportSize({width:1280,height:900});
 const lightboxTrigger=page.getByTestId(/button-fullscreen-/).first();
 await lightboxTrigger.waitFor();
 await lightboxTrigger.click();
 await page.getByTestId('lightbox-page').waitFor();
 await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'button-lightbox-close');
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-testid')),'button-lightbox-close');
 await page.getByTestId('button-lightbox-close').click();
 await page.getByTestId('lightbox-page').waitFor({state:'hidden'});
 await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid')?.startsWith('button-fullscreen-'));
 assert.equal(await lightboxTrigger.evaluate(element=>document.activeElement===element),true);
 await page.setViewportSize({width:844,height:390});
 locked=true; await page.reload();
 await page.getByTestId('photobook-header-status').filter({hasText:'Versione 2 · in stampa'}).waitFor();
 assert.equal(await page.getByTestId('button-open-approve').count(),0);
 assert.equal(await page.getByTestId('button-activate-pen').count(),0);
 locked=false;
 await page.setViewportSize({width:1280,height:900});
 await page.goto(`${base}/admin/photobooks/book`);
 const publish=page.getByRole('button',{name:'Pubblica versione e avvisa cliente',exact:true}); await publish.waitFor();
 assert.equal(notifications,0); await publish.tap();
 await page.getByRole('alertdialog').getByRole('button',{name:'Pubblica versione',exact:true}).tap();
 await page.getByRole('button',{name:'Avvisa cliente / verifica invio',exact:true}).waitFor(); assert.equal(notifications,1);
 await page.setViewportSize({width:844,height:390});
 await page.goto(`${base}/fotolibro/same-token-long`);
 await page.getByTestId('photobook-header-status').filter({hasText:'Versione 3 aggiornata · da approvare'}).waitFor();
 assert.equal(await page.getByTestId('photobook-mockup').count(),0,'L’approvazione v2 non abilita il mockup della v3');
 await page.getByTestId('button-open-approve').waitFor();
 assert.equal(approval.version,2,'La nuova pubblicazione non altera il valore simulato dell’approvazione precedente');
 assert.deepEqual(errors,[]); console.log('Browser versioni OK: header mobile compatto, gate mockup dopo approvazione, nuova versione da approvare, stampa, guida e modali nei due orientamenti, storico e stesso link aggiornato.');
} finally {await browser?.close();await vite.close();}
