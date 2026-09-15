// Test reale del componente e del renderer, con API/Firebase isolati dalla produzione.
// node e2e/photobook-mockup.browser.mjs
import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createMockupHarnessServer } from './mockup-harness/vite-server.mjs';
const root=process.cwd();
const vite=await createMockupHarnessServer(root);
let browser;
let page;
let currentPhase='avvio harness';
let lastCheck='avvio harness';
function phase(name){currentPhase=name;lastCheck=`fase: ${name}`;console.log(`[mockup] FASE: ${name}`);}
function check(name){lastCheck=name;}
async function rendererDiagnostics(){
 const pageState=page?await page.evaluate(()=>({url:location.href,iframeCount:document.querySelectorAll('iframe').length})).catch(error=>({error:error.message})):{error:'page non disponibile'};
 const renderer=page?.frames().find(candidate=>candidate!==page.mainFrame()&&candidate.url().includes('/mockups/'));
 const rendererState=renderer?await renderer.evaluate(()=>({
  url:location.href,
  dataset:Object.fromEntries(Object.entries(document.body?.dataset||{})),
  photoStatus:document.querySelector('#photoStatus')?.textContent||null,
  downloadStatus:document.querySelector('#downloadStatus')?.textContent||null,
  activeElement:document.activeElement?.id||document.activeElement?.textContent?.trim().slice(0,80)||null
 })).catch(error=>({url:renderer.url(),error:error.message})):{url:null,dataset:null};
 return {page:pageState,renderer:rendererState};
}
async function withDiagnostics(error){
 const diagnostic=await rendererDiagnostics();
 const enriched=error instanceof Error?error:new Error(String(error));
 enriched.message=`${enriched.message}\n[Mockup diagnostics] fase: ${currentPhase}; ultimo controllo: ${lastCheck}; stato: ${JSON.stringify(diagnostic)}`;
 return enriched;
}
try{
 await vite.listen();
 const port=vite.httpServer.address().port;
 const options={headless:true,args:['--enable-unsafe-swiftshader']};
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 if(fs.existsSync(edge))options.executablePath=edge;
 browser=await chromium.launch(options);
  page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.message);});
 page.on('console',msg=>{if(msg.type()==='error')console.error('Console:',msg.text());});
  page.on('requestfailed',request=>console.error(`[mockup] REQUEST FAILED: ${request.method()} ${request.url()} ${request.failure()?.errorText||''}`));
  phase('preparazione fixture e intercettazione API');
 const catalog=JSON.parse(fs.readFileSync('client/public/mockups/custodia-v1/peppe-lab-catalog.json','utf8'));
 const model=catalog.models[0],material=catalog.variants[0];
 const assetId='11111111-1111-4111-8111-111111111111';
 const backAssetId='55555555-5555-4555-8555-555555555555';
 const rearImage=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#286880"/><rect x="300" width="300" height="400" fill="#bb9646"/><text x="45" y="100" font-size="64" fill="white">RETRO</text><circle cx="90" cy="290" r="48" fill="white"/></svg>')).png().toBuffer();
  const photo=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#2b6678"/><rect width="300" height="400" fill="#d66b50"/><circle cx="145" cy="205" r="96" fill="#f4d58d"/><path d="M0 320 C100 250 190 390 300 305 S500 250 600 325 V400 H0Z" fill="#7f3f67"/><text x="30" y="74" font-family="Georgia,serif" font-size="42" fill="#fff8e7">FOTO</text></svg>')).png().toBuffer();
 let saved={version:1,revision:1,updatedAt:new Date().toISOString(),configuration:{modelId:model.id,assetRevision:model.assetRevision,materialId:material.id,appearanceRevision:material.appearanceRevision,coverLayout:'full',topText:'Custodia test',bottomText:'Ricordi',photoAssetId:assetId,crop:{zoom:1.2,x:.4,y:.6}}};
 let uploads=0,gallerySelections=0,adminRequests=0;
 let failNextSave=false,submissions=0;
 let offer=null,labCatalog={revision:0,models:[],materials:[]},confirmations=0,attachments=0;
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1')return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const request=route.request();
  if(!url.pathname.includes('/by-token/')){assert.equal(request.headers().authorization,'Bearer mockup-test-auth');adminRequests++;}
  if(url.pathname.endsWith('/mockup-jobs/job'))return route.fulfill({json:{contacts:[{id:'client',name:'Cliente prova',phone:'+39 333 1234567'}],books:[{id:'book',name:'Album prova',currentVersion:1}]}});
  if(url.pathname.endsWith('/labs'))return route.fulfill({json:[{id:'lab',nome:'Laboratorio test',attivo:true,mockupCatalog:labCatalog}]});
  if(url.pathname.endsWith('/mockup-catalog')){if(request.method()==='PUT'){labCatalog={...request.postDataJSON(),revision:labCatalog.revision+1};}return route.fulfill({json:labCatalog});}
  if(url.pathname.endsWith('/offer')){
   const body=request.postDataJSON();assert.equal(body.savedRevision,saved.revision);
   offer={revision:(offer?.revision||0)+1,updatedAt:new Date().toISOString(),options:body.selections.map(s=>{const entry=labCatalog.models.find(m=>m.id===s.modelId);assert.ok(entry);return {...entry,labId:s.labId,labName:'Laboratorio test',materials:labCatalog.materials.filter(m=>entry.materialIds.includes(m.id))};})};
   saved={...saved,revision:saved.revision+1,status:'draft'};return route.fulfill({json:offer});
  }
  if(url.pathname.endsWith('/submit')||url.pathname.endsWith('/request-changes')){if(url.pathname.endsWith('/submit'))submissions++;assert.equal(request.postDataJSON().revision,saved.revision);saved={...saved,revision:saved.revision+1,note:request.postDataJSON().note,status:url.pathname.endsWith('/submit')?'submitted':'changes_requested'};return route.fulfill({json:saved});}
  if(url.pathname.endsWith('/confirm')){const body=JSON.parse(request.postData());assert.equal(body.revision,saved.revision);assert.deepEqual(body.configuration,saved.configuration);assert.equal(body.previews.length,8);assert.ok(body.previews.every(v=>v.image.startsWith('data:image/jpeg;base64,')));confirmations++;saved={...saved,revision:saved.revision+1,status:'confirmed',confirmedAt:new Date().toISOString()};return route.fulfill({json:saved});}
  if(url.pathname.endsWith('/attach')){assert.equal(saved.status,'confirmed');assert.equal(request.postDataJSON().revision,saved.revision);attachments++;return route.fulfill({json:{status:'attached'}});}
  if(url.pathname.endsWith('/gallery-photos'))return route.fulfill({json:{photos:[{id:'gallery-photo',name:'Foto della galleria',url:'/sample.png',thumbnailUrl:'/sample.png'}],chapters:[]}});
  if(url.pathname.includes('/photos/'))return route.fulfill({contentType:'image/png',body:url.pathname.endsWith(backAssetId)?rearImage:photo});
  if(url.pathname.endsWith('/upload')){uploads++;const back=url.searchParams.get('name')==='retro.png';return route.fulfill({json:{id:back?backAssetId:assetId,name:back?'Foto retro.png':'Nuova foto.png',source:'upload',width:600,height:400}});}
  if(url.pathname.endsWith('/gallery-photo')){assert.equal(request.postDataJSON().photoId,'gallery-photo');gallerySelections++;return route.fulfill({json:{id:assetId,name:'Foto della galleria',source:'gallery',photoId:'gallery-photo',width:600,height:400}});}
  if(request.method()==='PUT'){if(failNextSave){failNextSave=false;return route.fulfill({status:409,json:{error:'Revisione cambiata: ricarica la proposta.'}});}const body=request.postDataJSON();assert.equal(body.revision,saved?.revision||0);saved={version:1,revision:body.revision+1,configuration:body.configuration,updatedAt:new Date().toISOString(),status:'draft',selection:body.selection,option:offer?.options.find(o=>o.labId===body.selection?.labId&&o.id===body.selection?.modelId)};return route.fulfill({json:saved});}
  return route.fulfill({json:{version:1,editable:true,enabled:true,saved,offer}});
 });
 await page.route('**/sample.png',r=>r.fulfill({contentType:'image/png',body:photo}));
 async function domRect(selector) {
   check(`rettangolo DOM ${selector}`);
  return page.evaluate(selector => {
   const element=document.querySelector(selector);
   if (!element) throw new Error(`Elemento non trovato: ${selector}`);
   const rect=element.getBoundingClientRect();
   return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
  },selector);
 }
 async function domRectByButtonText(label) {
   check(`rettangolo pulsante ${label}`);
  return page.evaluate(label => {
   const element=[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === label);
   if (!element) throw new Error(`Pulsante non trovato: ${label}`);
   const rect=element.getBoundingClientRect();
   return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
  },label);
 }
 async function frameDomRect(selector) {
   check(`rettangolo renderer ${selector}`);
  const renderer=page.frames().find(candidate=>candidate!==page.mainFrame()&&candidate.url().includes('/mockups/'));
  if (!renderer) throw new Error('Il renderer 3D non ha creato il frame incorporato');
  return renderer.evaluate(selector => {
   const element=document.querySelector(selector);
   if (!element) throw new Error(`Elemento non trovato nel renderer: ${selector}`);
   const rect=element.getBoundingClientRect();
   return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
  },selector);
 }
 async function setFrameValue(selector,value) {
   check(`impostazione renderer ${selector}`);
  const renderer=page.frames().find(candidate=>candidate!==page.mainFrame()&&candidate.url().includes('/mockups/'));
  if (!renderer) throw new Error('Il renderer 3D non ha creato il frame incorporato');
  await renderer.evaluate(({selector,value})=>{
   const element=document.querySelector(selector);
   if (!element) throw new Error(`Elemento non trovato nel renderer: ${selector}`);
   const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value')?.set;
   if (setter) setter.call(element,value); else element.value=value;
   element.dispatchEvent(new Event('input',{bubbles:true}));
  },{selector,value});
 }
 async function waitForFrameElementText(selector,text) {
   check(`testo renderer ${selector} → ${text}`);
  const renderer=page.frames().find(candidate=>candidate!==page.mainFrame()&&candidate.url().includes('/mockups/'));
  if (!renderer) throw new Error('Il renderer 3D non ha creato il frame incorporato');
   await renderer.waitForFunction(({selector,text})=>document.querySelector(selector)?.textContent?.includes(text)===true,{selector,text},{timeout:90000});
 }
 async function screenshotRect(selector,filePath) {
   check(`screenshot ${selector}`);
   if(process.env.MOCKUP_E2E_SCREENSHOTS!=='1')return;
  await page.screenshot({path:filePath,clip:await domRect(selector)});
 }
  async function capturePage(filePath,options={}) {
   if(process.env.MOCKUP_E2E_SCREENSHOTS!=='1')return;
   fs.mkdirSync('work',{recursive:true});
   await page.screenshot({path:filePath,...options});
  }
  async function openHomePanel(renderer) {
   check('apertura tab In casa');
   const tab=renderer.locator('nav button').filter({hasText:'In casa'});
   await tab.waitFor({state:'attached',timeout:90000});
   await tab.dispatchEvent('click');
   await renderer.locator('#homeScene').waitFor({state:'visible',timeout:30000});
  }
  function contentBounds(pixels) {
   const {width,height,channels}=pixels.info;
   const corners=[[0,0],[width-1,0],[0,height-1],[width-1,height-1]];
   const background=corners.reduce((sum,[x,y])=>{
    const offset=(y*width+x)*channels;
    return sum.map((value,index)=>value+pixels.data[offset+index]/corners.length);
   },[0,0,0]);
   let left=width,top=height,right=0,bottom=0,count=0;
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const offset=(y*width+x)*channels;
    const distance=Math.hypot(
     pixels.data[offset]-background[0],
     pixels.data[offset+1]-background[1],
     pixels.data[offset+2]-background[2],
    );
    if(distance<18)continue;
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);count++;
   }
   if(count<100)return null;
   return {left,top,right:Math.min(width,right+1),bottom:Math.min(height,bottom+1)};
  }
  function regionMean(pixels,region) {
   const {width,channels}=pixels.info;
   let red=0,green=0,blue=0,count=0;
   for(let y=region.top;y<region.bottom;y++)for(let x=region.left;x<region.right;x++){
    const offset=(y*width+x)*channels;
    red+=pixels.data[offset];green+=pixels.data[offset+1];blue+=pixels.data[offset+2];count++;
   }
   return [red/count,green/count,blue/count];
  }
  function colorDistance(first,second) {
   return Math.hypot(first[0]-second[0],first[1]-second[1],first[2]-second[2]);
  }
  function insetCoverRegions(pixels,bounds) {
   const width=bounds.right-bounds.left,height=bounds.bottom-bounds.top;
   const middle=Math.floor((bounds.left+bounds.right)/2);
   const yInset=Math.max(1,Math.floor(height*.18)),xInset=Math.max(1,Math.floor(width*.12));
   return {
    left:{left:bounds.left+xInset,right:middle-2,top:bounds.top+yInset,bottom:bounds.bottom-yInset},
    right:{left:middle+2,right:bounds.right-xInset,top:bounds.top+yInset,bottom:bounds.bottom-yInset},
   };
  }
  async function exportRendererViews(renderer) {
    check('export otto viste renderer');
    const requestId=`e2e-${Date.now()}-${Math.random()}`;
    const result=await page.evaluate(({requestId,frameUrl})=>new Promise((resolve,reject)=>{
      const iframe=[...document.querySelectorAll('iframe')].find(candidate=>candidate.src.includes(frameUrl));
      if(!iframe?.contentWindow)return reject(new Error(`Renderer ${frameUrl} non trovato`));
      const timeout=setTimeout(()=>{window.removeEventListener('message',receive);reject(new Error('Export renderer scaduto'));},90000);
      function receive(event){
        if(event.source!==iframe.contentWindow||event.data?.channel!=='memorie-mockup-v1'||event.data?.requestId!==requestId)return;
        if(event.data.type==='exported'){clearTimeout(timeout);window.removeEventListener('message',receive);resolve(event.data.previews);}
        if(event.data.type==='export-error'){clearTimeout(timeout);window.removeEventListener('message',receive);reject(new Error('Export renderer non riuscito'));}
      }
      window.addEventListener('message',receive);
      iframe.contentWindow.postMessage({channel:'memorie-mockup-v1',type:'export',requestId},location.origin);
    }),{requestId,frameUrl:'/mockups/girevole-v4/'});
    assert.ok(Array.isArray(result));
    return result;
  }
  async function decodedPreview(preview) {
    const encoded=preview.image.split(',')[1];
    assert.ok(encoded,`Immagine export non leggibile per ${preview.label}`);
    return sharp(Buffer.from(encoded,'base64')).raw().toBuffer({resolveWithObject:true});
  }
  function changedPixelStats(first,second) {
    assert.deepEqual(first.info,second.info,'Le dimensioni della vista di controllo sono cambiate');
    const channels=first.info.channels;
    let changed=0,totalDelta=0;
    for(let offset=0;offset<first.data.length;offset+=channels){
      const delta=Math.abs(first.data[offset]-second.data[offset])
       +Math.abs(first.data[offset+1]-second.data[offset+1])
       +Math.abs(first.data[offset+2]-second.data[offset+2]);
      totalDelta+=delta;
      if(delta>24)changed++;
    }
    return {changed,meanDelta:totalDelta/(first.info.width*first.info.height)};
  }
 async function clickPageButton(label) {
   check(`click pagina ${label}`);
  await page.evaluate(label=>{
   const button=[...document.querySelectorAll('button')].find(candidate=>candidate.textContent?.trim()===label&&!candidate.disabled);
   if (!button) throw new Error(`Pulsante non trovato: ${label}`);
   button.click();
  },label);
 }
  async function assertAdminHierarchy() {
    check('gerarchia pannello admin');
    await page.locator('.mockup-admin-panel-heading strong').filter({hasText:'Controllo proposta'}).waitFor();
    const metrics=await page.evaluate(()=>{
      const panel=document.querySelector('.mockup-admin-panel')?.getBoundingClientRect();
      const heading=document.querySelector('.mockup-admin-panel-heading')?.getBoundingClientRect();
      const tabs=document.querySelector('.mockup-admin-tabs')?.getBoundingClientRect();
      return {
        panelWidth:panel?.width||0,
        panelRight:panel?.right||0,
        headingWidth:heading?.width||0,
        tabsWidth:tabs?.width||0,
        tabsRight:tabs?.right||0,
        tabCount:document.querySelectorAll('.mockup-admin-tabs button').length,
        viewportWidth:window.innerWidth,
        horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth,
      };
    });
    assert.equal(metrics.tabCount,3,'Il pannello admin deve avere tre tab nominate');
    assert.ok(metrics.panelWidth>0&&metrics.headingWidth>0&&metrics.tabsWidth>0,'Gerarchia admin non visibile');
    assert.ok(metrics.tabsRight<=metrics.panelRight+1&&metrics.tabsRight<=metrics.viewportWidth+1,`Tab admin oltre il pannello o il viewport: ${JSON.stringify(metrics)}`);
    assert.equal(metrics.horizontalOverflow,false,`Overflow orizzontale nel pannello admin: ${JSON.stringify(metrics)}`);
  }
 async function open(query='?admin'){
   check(`navigazione ${query}`);
  await page.goto(`http://127.0.0.1:${port}/${query}`);
  assert.equal(await page.locator('iframe').count(),0,'Il 3D non deve caricarsi nella pagina delle foto');
   check(`apertura mockup ${query}`);
  await page.getByRole('button',{name:/^Apri mockup /}).dispatchEvent('click');
   check(`ready renderer ${query}`);
   try { await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.body?.dataset.ready === 'true', undefined, {timeout:30000}); }
  catch(error){console.error(await page.locator('body').innerText());console.error(await page.frameLocator('iframe').locator('body').innerText());throw error;}
  if(query.includes('admin')) {
   await page.getByRole('heading',{name:'Verifica proposta album',exact:true}).waitFor();
    await assertAdminHierarchy();
   assert.equal(await page.getByLabel('Cosa deve correggere il cliente?').count(),0);
   const before=await domRect('iframe');
   await page.evaluate(()=>{const panel=document.querySelector('.mockup-admin-panel');if(panel)panel.scrollTop=panel.scrollHeight;});
   assert.deepEqual(await domRect('iframe'),before,'Lo scorrimento dei comandi non sposta l’album');
   await page.getByRole('button',{name:'Modifica',exact:true}).dispatchEvent('click');
   await page.getByRole('button',{name:'Carica una foto'}).waitFor();
  }
  else await page.frameLocator('iframe').locator('#wizard-slot').waitFor();
  return page.frameLocator('iframe');
 }
  phase('custodia: modifica iniziale, foto e download');
  let frame=await open();
 await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.getElementById('topText')?.value==='Custodia test');
 assert.equal(await page.getByRole('button',{name:'Salva mockup'}).isDisabled(),true);
 await setFrameValue('#topText','Anna e Marco');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent?.trim()==='Salva mockup'&&!button.disabled));
 await page.getByRole('button',{name:'Salva mockup'}).dispatchEvent('click');
 await page.waitForFunction(() => document.body.innerText.includes('Mockup salvato. Il salvataggio non equivale alla conferma dello studio.'), undefined, {timeout:60000});
 assert.equal(saved.configuration.topText,'Anna e Marco');
 await page.setViewportSize({width:390,height:844});
 const modal=page.getByRole('dialog',{name:'Verifica proposta album',exact:true});
 await page.waitForFunction(()=>{const box=document.querySelector('[role=dialog]')?.getBoundingClientRect();return box && Math.abs(box.width-innerWidth)<2 && Math.abs(box.height-innerHeight)<2;});
 const modalBox=await domRect('[role=dialog]');
 assert.ok(modalBox && modalBox.width>=389 && modalBox.height>=843);
 const saveBox=await domRectByButtonText('Salva mockup');
 assert.ok(saveBox && saveBox.y+saveBox.height<=844,`Salva sempre visibile sul telefono: ${JSON.stringify({modalBox,saveBox})}`);
 await setFrameValue('#topText','Modifica non salvata');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent?.trim()==='Salva mockup'&&!button.disabled));
 page.once('dialog',dialog=>dialog.dismiss());
 await clickPageButton('Chiudi');
 assert.equal(await page.locator('iframe').count(),1,'Annullare la chiusura conserva il renderer');
 page.once('dialog',dialog=>dialog.accept());
 await clickPageButton('Chiudi');
 await page.waitForFunction(()=>!document.querySelector('iframe'));
 await page.getByRole('button',{name:/^Apri mockup /}).dispatchEvent('click');
 await page.getByRole('button',{name:'Modifica',exact:true}).dispatchEvent('click');
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.getElementById('topText')?.value==='Anna e Marco');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true);
  await capturePage('work/mockup-modal-mobile.png');
 await clickPageButton('Chiudi');
 await page.waitForFunction(()=>!document.querySelector('iframe'));
 await page.setViewportSize({width:1440,height:1100});
 frame=await open();
 await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.getElementById('topText')?.value==='Anna e Marco');
 await page.locator('input[type=file]').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:photo});
 await waitForFrameElementText('#photoStatus','Nuova foto.png');
 await page.getByRole('button',{name:'Salva mockup'}).dispatchEvent('click');
 assert.equal(uploads,1);
 await page.getByRole('button',{name:'Scegli dalla galleria'}).dispatchEvent('click');
 await page.getByRole('dialog').getByRole('button').filter({has:page.getByAltText('Foto della galleria')}).dispatchEvent('click');
 await waitForFrameElementText('#photoStatus','Foto della galleria');
 await page.getByRole('button',{name:'Salva mockup'}).dispatchEvent('click');
 assert.equal(gallerySelections,1);
 await openHomePanel(frame);
 await frame.locator('#homeScene').selectOption('sideboard');
 assert.equal(await frame.locator('.wizard-views').count(),0,'La vista amministrativa conserva i controlli originali');
 await frame.locator('#homeLighting').selectOption('evening');
 await setFrameValue('#homeAlbumAngle','45');await frame.locator('#homeAlbumAngle').dispatchEvent('input');
 await setFrameValue('#homeAlbumX','70');await frame.locator('#homeAlbumX').dispatchEvent('input');
   const downloadPromise=page.waitForEvent('download',{timeout:120000}).then(download=>({download})).catch(error=>({error}));
  await frame.locator('#downloadClient').dispatchEvent('click');
  const downloadResult=await downloadPromise;
  if(downloadResult.error)throw new Error(`Download cliente non intercettato (stato renderer: ${await frame.locator('#downloadStatus').textContent().catch(()=> 'nessuno')}): ${downloadResult.error.message}`);
  const download=downloadResult.download;assert.ok(download.suggestedFilename().endsWith('.html'));
 assert.equal(await frame.locator('#homeScene').inputValue(),'sideboard');
 assert.equal(await frame.locator('body').getAttribute('data-home-album-angle'),'45');
 await openHomePanel(frame);
 await frame.locator('#homeScene').selectOption('none');
  await capturePage('work/mockup-desktop.png');
 await page.setViewportSize({width:390,height:844});
  await capturePage('work/mockup-mobile.png');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:1440,height:1100});
 frame=await open('?admin&readonly');
 await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.getElementById('topText')?.disabled===true);
 assert.equal(await page.getByRole('button',{name:'Salva mockup'}).isDisabled(),true);
 frame=await open('?admin');
 await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.getElementById('topText')?.disabled===false);
 assert.ok(adminRequests>0);
  phase('catalogo laboratorio: importazione e modifica modello');
  // Catalogo reale: campionario unico laboratorio, nome configurabile e modello pronto.
 await page.goto(`http://127.0.0.1:${port}/?catalog`);
 await page.getByText('Nessun modello associato',{exact:true}).waitFor();
 await page.getByText('Campionario del laboratorio (0)',{exact:true}).dispatchEvent('click');
 await page.getByRole('button',{name:'Importa campionario Custodia / Peppe Lab'}).dispatchEvent('click');
 await page.getByRole('button',{name:'Aggiungi modello'}).dispatchEvent('click');
 await page.getByLabel('Nome mostrato al cliente').fill('Custodia Studio');
 await page.getByLabel('Modello 3D',{exact:true}).selectOption(model.id);
 await page.getByRole('button',{name:'Salva catalogo',exact:true}).dispatchEvent('click');
 await page.getByText('Catalogo salvato.',{exact:false}).waitFor();
 assert.equal(labCatalog.models[0].name,'Custodia Studio');assert.equal(labCatalog.materials.length,38);
 assert.equal(await page.getByLabel('Nome mostrato al cliente').count(),0);
 await page.getByText('Disponibile per le proposte',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Modifica',exact:true}).dispatchEvent('click');
 await page.getByLabel('Nome mostrato al cliente').fill('Modifica da annullare');
 await page.getByRole('button',{name:'Annulla modifiche',exact:true}).dispatchEvent('click');
 await page.getByRole('heading',{name:'Custodia Studio',exact:true}).waitFor();
 await page.getByRole('button',{name:'Aggiungi modello'}).dispatchEvent('click');
 await page.getByText('Nuovo · non salvato',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Annulla modifiche',exact:true}).dispatchEvent('click');
 assert.equal(labCatalog.models.length,1);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:1440,height:1100});
  phase('proposta cliente: modelli e rivestimenti disponibili');
  // Il laboratorio abilita due rivestimenti per questo modello, non per il lavoro.
 labCatalog.models[0].materialIds=labCatalog.materials.slice(0,2).map(m=>m.id);
 frame=await open('?admin');
 await page.getByRole('button',{name:'Modelli disponibili',exact:true}).dispatchEvent('click');
 await page.getByRole('button',{name:'Laboratori e modelli per questo lavoro'}).dispatchEvent('click');
 await page.getByRole('checkbox',{name:'Laboratorio test',exact:true}).check();
 await page.getByRole('button',{name:'Pubblica opzioni nel link cliente'}).dispatchEvent('click');
 await page.getByText('Proposta pubblicata nel link cliente.',{exact:true}).waitFor();
 assert.equal(offer.options.length,1);
 await page.setViewportSize({width:390,height:844});
 frame=await open('?client');
 await frame.locator('.wizard-model[aria-pressed="true"]').waitFor();
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.getElementById('modelName')?.value==='Custodia Studio');
 assert.equal(await frame.locator('[data-finish]:not([hidden])').count(),2);
 assert.equal(await frame.locator('#fabricPanel h2').textContent(),'Laboratorio test · 2 rivestimenti');
 assert.ok((await frame.locator('#materialLabel').textContent()).startsWith('Laboratorio test'));
 await page.getByRole('button',{name:'Avanti',exact:true}).dispatchEvent('click');
 await frame.getByRole('heading',{name:'Rivestimento e copertina',exact:true}).waitFor();
 await page.evaluate(()=>{window.wizardCanvas=document.querySelector('iframe').contentDocument.querySelector('#viewport');});
 const stageBefore=await frameDomRect('.stage');
 await frame.locator('.panel-content').evaluate(el=>el.scrollTop=el.scrollHeight);
 assert.deepEqual(await frameDomRect('.stage'),stageBefore,'La vista non scorre con i campioni');
 await page.getByRole('button',{name:'Avanti',exact:true}).dispatchEvent('click');
 await setFrameValue('#topText','Nomi dal telefono');
 await frame.getByRole('button',{name:'Scegli dalla galleria',exact:true}).dispatchEvent('click');
 await page.getByRole('dialog').getByRole('button').filter({has:page.getByAltText('Foto della galleria')}).dispatchEvent('click');
 await page.getByText('Foto pronta. Salva per conservarla nel fotolibro.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Indietro',exact:true}).dispatchEvent('click');
 await page.getByRole('button',{name:'Avanti',exact:true}).dispatchEvent('click');
 assert.equal(await frame.locator('#topText').inputValue(),'Nomi dal telefono');
 assert.equal(await page.evaluate(()=>window.wizardCanvas===document.querySelector('iframe').contentDocument.querySelector('#viewport')),true,'Nessun nuovo canvas fra i passaggi');
 await page.getByRole('button',{name:'Avanti',exact:true}).dispatchEvent('click');
 await frame.getByText('Vedi in casa · facoltativo',{exact:true}).dispatchEvent('click');
 await frame.locator('#homeScene').selectOption('sideboard');
 assert.equal(await frame.locator('.wizard-views').isVisible(),false,'In casa non si estrae il prodotto dal posizionamento');
 assert.equal(await page.evaluate(()=>document.querySelector('iframe').contentDocument.documentElement.scrollWidth<=document.querySelector('iframe').clientWidth),true);
 const sendBox=await domRectByButtonText('Invia allo studio per verifica');
 assert.ok(sendBox.y+sendBox.height<=844,'Invio raggiungibile in fondo al telefono');
 failNextSave=true;
 await page.getByRole('button',{name:'Invia allo studio per verifica'}).dispatchEvent('click');
 await page.getByText('Salvataggio non completato: Revisione cambiata: ricarica la proposta.',{exact:true}).waitFor();
 assert.equal(submissions,0,'Se il salvataggio fallisce non deve partire alcun invio');
 await page.getByRole('button',{name:'Invia allo studio per verifica'}).dispatchEvent('click');
 await page.getByText('Proposta inviata allo studio per la verifica.',{exact:true}).waitFor();
 assert.equal(saved.status,'submitted');
 assert.equal(saved.configuration.topText,'Nomi dal telefono','Invio salva prima la revisione modificata');
 assert.equal(await page.getByRole('button',{name:'Invia allo studio per verifica'}).isDisabled(),true,'Non reinviare senza modifiche');
 await page.getByRole('button',{name:'Indietro',exact:true}).dispatchEvent('click');
 assert.equal(await frame.getByRole('button',{name:'Carica una foto'}).isDisabled(),false);
 await page.setViewportSize({width:1440,height:1100});
 frame=await open('?admin');
 await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 await setFrameValue('#topText','Correzione dello studio');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).dispatchEvent('click');
 await page.getByRole('button',{name:'Verifica',exact:true}).dispatchEvent('click');
 await page.getByRole('button',{name:'Conferma mockup',exact:true}).dispatchEvent('click');
 await page.getByText('Mockup confermato.',{exact:false}).waitFor({timeout:45000});
 assert.equal(confirmations,1);assert.equal(saved.status,'confirmed');
 await page.getByText('Revisioni, documenti e invio al laboratorio',{exact:true}).dispatchEvent('click');
 await page.getByRole('button',{name:'Allega all’invio fotolibro su Drive'}).dispatchEvent('click');
 await page.getByText('Mockup registrato nella cartella Drive.',{exact:false}).waitFor();assert.equal(attachments,1);
 await capturePage('work/mockup-workflow-studio.png',{fullPage:true});
 await page.goto(`http://127.0.0.1:${port}/?job`);
 await page.getByRole('link',{name:'Apri WhatsApp'}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Apri WhatsApp'}).getAttribute('href'),'https://wa.me/393331234567');
 await page.getByText('Confermato dallo studio',{exact:false}).waitFor();
 await page.setViewportSize({width:390,height:844});await capturePage('work/mockup-operativo-mobile.png',{fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  phase('album girevole: cambio renderer, finiture e copertine');
 // Secondo modello: cambio renderer, finiture e copertine, persistenza senza foto.
 const rotatingEntry={...labCatalog.models[0],id:'44444444-4444-4444-8444-444444444444',name:'Album girevole',rendererId:'album-girevole'};
 offer.options.push({...rotatingEntry,labId:'lab',labName:'Laboratorio test',materials:labCatalog.materials.slice(0,2)});
 await page.setViewportSize({width:1440,height:1100});
 frame=await open('?admin');
 await page.getByLabel('Laboratorio e modello scelto',{exact:true}).selectOption(`lab/${rotatingEntry.id}`);
 await page.frameLocator('iframe').locator('#rotation').waitFor();
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.body.dataset.ready==='true');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).dispatchEvent('click');
 await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.configuration.modelId,'album-girevole');assert.equal(saved.configuration.coverLayout,'plaque');
 const rotatingWizardFixture=structuredClone(saved);
 frame=await open('?admin');
 await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 await setFrameValue('#firstName','Anna');await setFrameValue('#secondName','Jacopo');
 const monogramAnna=await frame.locator('#engravingPreview').evaluate(canvas=>canvas.toDataURL());
 await setFrameValue('#firstName','Éléonore');
 assert.notEqual(await frame.locator('#engravingPreview').evaluate(canvas=>canvas.toDataURL()),monogramAnna);
 await setFrameValue('#firstName','Anna');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).dispatchEvent('click');await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.deepEqual(saved.configuration.engravingNames,{first:'Anna',second:'Jacopo'});assert.equal(saved.configuration.assetRevision,4);
 frame=await open('?admin');await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 assert.equal(await frame.locator('#firstName').inputValue(),'Anna');assert.equal(await frame.locator('#secondName').inputValue(),'Jacopo');
 await setFrameValue('#rotation','65');await frame.locator('#rotation').dispatchEvent('input');
 assert.equal(await frame.locator('body').getAttribute('data-rotation'),'65');
 await setFrameValue('#rotation','25');await frame.locator('#rotation').dispatchEvent('input');
 await screenshotRect('iframe','work/mockup-girevole-legno.png');
 await frame.locator('#frameFinish').selectOption('white');await frame.locator('#coverLayout').selectOption('photo-plaque');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).dispatchEvent('click');await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.configuration.frameFinish,'white');assert.equal(saved.configuration.coverLayout,'photo-plaque');
 await screenshotRect('iframe','work/mockup-girevole-bianco.png');
   await frame.locator('#frameFinish').selectOption('fabric');await frame.locator('#coverLayout').selectOption('split-photo-fabric');
  await frame.locator('#front').dispatchEvent('click');await page.waitForTimeout(250);
  const splitRenderer=page.frames().find(candidate=>candidate!==page.mainFrame()&&candidate.url().includes('/mockups/girevole-v4/'));
  assert.ok(splitRenderer,'Renderer girevole-v4 non trovato per la verifica della copertina divisa');
  const splitState=await splitRenderer.evaluate(()=>({
   layout:document.getElementById('coverLayout')?.value,
   coverLayout:document.body.dataset.coverLayout,
   photoStatus:document.getElementById('photoStatus')?.textContent||'',
 }));
  assert.deepEqual(splitState,{layout:'split-photo-fabric',coverLayout:'split-photo-fabric',photoStatus:'Foto salvata'});
  const namedCover=await splitRenderer.locator('#viewport').screenshot();
  if(process.env.MOCKUP_E2E_SCREENSHOTS==='1')fs.writeFileSync('work/mockup-girevole-split-cover.png',namedCover);
  const namedPixels=await sharp(namedCover).raw().toBuffer({resolveWithObject:true});
  const coverBounds=contentBounds(namedPixels);
  assert.ok(coverBounds&&coverBounds.right-coverBounds.left>100,`Copertina non rilevata nel rendering: ${JSON.stringify(coverBounds)}`);
  const splitRegions=insetCoverRegions(namedPixels,coverBounds);
  assert.ok(colorDistance(regionMean(namedPixels,splitRegions.left),regionMean(namedPixels,splitRegions.right))>12,`Le due metà non sono distinguibili nel rendering: ${JSON.stringify({coverBounds,splitRegions})}`);
  await setFrameValue('#firstName','');await setFrameValue('#secondName','');await page.waitForTimeout(150);
  const blankCover=await splitRenderer.locator('#viewport').screenshot();
  const blankPixels=await sharp(blankCover).raw().toBuffer({resolveWithObject:true});
  const monogramRegion=splitRegions.right;
  let monogramDelta=0,monogramSamples=0;
  for(let y=monogramRegion.top;y<monogramRegion.bottom;y++)for(let x=monogramRegion.left;x<monogramRegion.right;x++){
   const offset=(y*namedPixels.info.width+x)*namedPixels.info.channels;
   monogramDelta+=Math.abs(namedPixels.data[offset]-blankPixels.data[offset])
    +Math.abs(namedPixels.data[offset+1]-blankPixels.data[offset+1])
    +Math.abs(namedPixels.data[offset+2]-blankPixels.data[offset+2]);monogramSamples++;
  }
  assert.ok(monogramDelta/monogramSamples>1.5,`Il monogramma botanico non risulta nel rendering: delta=${monogramDelta/monogramSamples}`);
  await setFrameValue('#firstName','Anna');await setFrameValue('#secondName','Jacopo');
   const splitExport=await exportRendererViews(splitRenderer);
   const expectedExportLabels=['Prospettiva · album ruotato','Fronte · allineato','Retro · finitura selezionata','Dorso · rotazione 90°','Lato destro','Vista superiore','Album estratto · copertina','Album estratto · retro'];
   assert.deepEqual(splitExport.map(view=>view.label),expectedExportLabels,'L’export girevole-v4 deve conservare tutte le otto viste previste');
   assert.ok(splitExport.every(view=>view.image.startsWith('data:image/jpeg;base64,')),'Tutte le viste girevole-v4 devono essere immagini JPEG');
   await setFrameValue('#firstName','Elisa');await setFrameValue('#secondName','Marco');
   const alternateMonogramExport=await exportRendererViews(splitRenderer);
   for(const label of ['Prospettiva · album ruotato','Fronte · allineato','Album estratto · copertina']){
    const named=splitExport.find(view=>view.label===label),alternate=alternateMonogramExport.find(view=>view.label===label);
    assert.ok(named&&alternate,`Vista export mancante: ${label}`);
    const namedPixels=await decodedPreview(named),alternatePixels=await decodedPreview(alternate);
    const stats=changedPixelStats(namedPixels,alternatePixels);
    assert.ok(stats.changed>80&&stats.meanDelta>.02,`La vista “${label}” non conserva le iniziali e i nomi del monogramma botanico sulla copertina split: ${JSON.stringify(stats)}`);
   }
   await setFrameValue('#firstName','Anna');await setFrameValue('#secondName','Jacopo');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).dispatchEvent('click');await page.getByText('Mockup salvato.',{exact:false}).waitFor();
  assert.equal(saved.configuration.frameFinish,'fabric');assert.equal(saved.configuration.coverLayout,'split-photo-fabric');
 await screenshotRect('iframe','work/mockup-girevole-tessuto.png');
  await frame.locator('#coverLayout').selectOption('full');
  await page.getByRole('button',{name:'Salva mockup',exact:true}).dispatchEvent('click');await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Verifica',exact:true}).dispatchEvent('click');
 await page.getByRole('button',{name:'Conferma mockup',exact:true}).dispatchEvent('click');await page.getByText('Mockup confermato.',{exact:false}).waitFor({timeout:45000});
 assert.equal(confirmations,2);
  phase('album girevole: foto retro, estrazione e ambientazione');
  // Foto sul plexiglass dello scrigno ed estrazione del solo album, senza cambiare la configurazione.
 frame=await open('?admin');await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 await frame.locator('#backCover').selectOption('photo');
 assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true);
 await page.getByLabel('Foto da personalizzare',{exact:true}).selectOption('back');
 await page.locator('input[type=file]').setInputFiles({name:'retro.png',mimeType:'image/png',buffer:rearImage});
 await waitForFrameElementText('#backPhotoStatus','Foto retro.png');
 await setFrameValue('#backZoom','1.3');await frame.locator('#backZoom').dispatchEvent('input');
 await setFrameValue('#backX','30');await frame.locator('#backX').dispatchEvent('input');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).dispatchEvent('click');await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.configuration.photoAssetId,assetId);assert.equal(saved.configuration.backPhotoAssetId,backAssetId);assert.equal(saved.configuration.backCrop.x,.3);
 frame=await open('?admin');await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 await frame.locator('#backCover').waitFor();assert.equal(await frame.locator('#backCover').inputValue(),'photo');
 assert.equal(await frame.locator('#backZoom').inputValue(),'1.3');
 await frame.locator('#back').dispatchEvent('click');await screenshotRect('iframe','work/mockup-girevole-retro-plex.png');
 await setFrameValue('#extract','100');await frame.locator('#extract').dispatchEvent('input');
 assert.equal(await frame.locator('body').getAttribute('data-extraction'),'100');assert.equal(await frame.locator('#rotation').isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true);
 await screenshotRect('iframe','work/mockup-girevole-estratto.png');
 await openHomePanel(frame);
 await frame.locator('#homeScene').selectOption('warm');
 assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Verifica',exact:true}).dispatchEvent('click');
 await page.getByRole('button',{name:'Conferma mockup',exact:true}).dispatchEvent('click');await page.getByText('Mockup confermato.',{exact:false}).waitFor({timeout:45000});
 assert.equal(confirmations,3);assert.equal(await frame.locator('#extract').inputValue(),'100');
 assert.equal(await frame.locator('#homeScene').inputValue(),'warm');
 await page.getByRole('button',{name:'Modifica',exact:true}).dispatchEvent('click');
 await openHomePanel(frame);
 await frame.locator('#homeScene').selectOption('none');
 frame=await open('?admin&readonly');await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 assert.equal(await frame.locator('#backCover').isDisabled(),true);
 await openHomePanel(frame);
 await frame.locator('#homeScene').selectOption('console');
 assert.equal(await frame.locator('#homeFinish').isEnabled(),true);
 await openHomePanel(frame);
 await frame.locator('#homeScene').selectOption('none');
 await setFrameValue('#extract','50');await frame.locator('#extract').dispatchEvent('input');assert.equal(await frame.locator('body').getAttribute('data-extraction'),'50');
 await frame.locator('#reset').dispatchEvent('click');assert.equal(await frame.locator('#extract').inputValue(),'0');assert.equal(await frame.locator('#rotation').isDisabled(),false);
  phase('compatibilità: revisioni storiche e conferma fedele');
  // Le configurazioni v2/v3 conservano la loro identità anche nel renderer corrente.
 // La conferma compara l'intera configurazione esportata con quella salvata, incluse foto e ritagli.
 const currentRotatingSnapshot=structuredClone(saved);
 for (const legacyRevision of [2,3]) {
  const historicalConfiguration={...currentRotatingSnapshot.configuration,assetRevision:legacyRevision};
  if(legacyRevision===2)delete historicalConfiguration.engravingNames;
  saved={...currentRotatingSnapshot,status:'draft',configuration:historicalConfiguration};
  frame=await open('?admin');await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Carica una foto'&&!b.disabled));
  assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true,'Aprire una revisione storica non deve convertirla');
  assert.equal(await frame.locator('#backCover').inputValue(),historicalConfiguration.backCover);
  assert.equal(await frame.locator('#backZoom').inputValue(),String(historicalConfiguration.backCrop.zoom));
  if(legacyRevision===3)assert.equal(await frame.locator('#firstName').inputValue(),historicalConfiguration.engravingNames.first);
  await page.getByRole('button',{name:'Verifica',exact:true}).dispatchEvent('click');
  await page.getByRole('button',{name:'Conferma mockup',exact:true}).dispatchEvent('click');
  await page.getByText('Mockup confermato.',{exact:false}).waitFor({timeout:45000});
  assert.deepEqual(saved.configuration,historicalConfiguration,'Export storico fedele, senza migrazione implicita');
 }
  phase('compatibilità: apertura v1 e migrazione solo dopo modifica');
  // Una configurazione v1 resta invariata all'apertura, e passa a v4 solo modificandola.
 const {backCover:oldBack,backPhotoAssetId:oldBackPhoto,backCrop:oldBackCrop,engravingNames:oldNames,...legacyConfig}=saved.configuration;
 saved={...saved,status:'draft',configuration:{...legacyConfig,assetRevision:1}};
 frame=await open('?admin');await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Carica una foto'&&!b.disabled));
 assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true);
 await frame.locator('#frameFinish').selectOption('white');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).dispatchEvent('click');await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.configuration.assetRevision,4);assert.equal(saved.configuration.backCover,'fabric');assert.equal(saved.configuration.backPhotoAssetId,null);
 assert.equal('engravingNames' in saved.configuration,false,'Le righe legacy non vengono trasformate in nomi automaticamente');
 saved={...saved,status:'draft',configuration:{...saved.configuration,coverLayout:'plaque',photoAssetId:null,frameFinish:'wood'}};
 frame=await open('?admin');await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 await setFrameValue('#topText','Incisione senza fotografia');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).dispatchEvent('click');await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.configuration.photoAssetId,null);
 await frame.locator('#coverLayout').selectOption('full');assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true);
 await frame.locator('#coverLayout').selectOption('plaque');
 await page.setViewportSize({width:390,height:844});await capturePage('work/mockup-girevole-mobile.png',{fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 frame=await open('?admin&readonly');await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 assert.equal(await frame.locator('#frameFinish').isDisabled(),true);
 await setFrameValue('#rotation','90');await frame.locator('#rotation').dispatchEvent('input');
 assert.equal(await frame.locator('body').getAttribute('data-rotation'),'90');
 frame=await open('?admin');
 await page.getByLabel('Laboratorio e modello scelto',{exact:true}).selectOption(`lab/${labCatalog.models[0].id}`);
 await page.waitForFunction(()=>document.querySelector('iframe')?.src.includes('custodia-v1')&&document.querySelector('iframe')?.contentDocument?.body.dataset.ready==='true');
 await frame.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Carica una foto'&&!b.disabled));
 await page.locator('input[type=file]').setInputFiles({name:'ritorno-custodia.png',mimeType:'image/png',buffer:photo});
 await page.frameLocator('iframe').getByText('Nuova foto.png',{exact:false}).first().waitFor();
 await page.getByRole('button',{name:'Salva mockup',exact:true}).dispatchEvent('click');await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.configuration.modelId,model.id);assert.equal(saved.configuration.photoAssetId,assetId);
  phase('anteprima standalone: modello iniziale senza API');
  // Anteprima del campione iniziale Mist 03, senza API o dati cliente.
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(`http://127.0.0.1:${port}/mockups/girevole-v4/index.html`);
 await page.waitForFunction(() => document.body.dataset.ready === 'true');
 await page.getByRole('button',{name:'Dettagli',exact:true}).dispatchEvent('click');
 await page.locator('#firstName').fill('Anna');await page.locator('#secondName').fill('Jacopo');
 await page.locator('#engravingPreview').screenshot({path:'work/mockup-incisione-botanica.png'});
 await capturePage('work/mockup-girevole-anteprima.png');
  phase('ambientazioni: scene, finiture, misure e mobile');
  // Le ambientazioni sono condivise e non modificano la configurazione prodotto.
 for (const rendererPath of ['girevole-v4','custodia-v1']) {
  await page.goto(`http://127.0.0.1:${port}/mockups/${rendererPath}/index.html`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await openHomePanel(page);
  await page.locator('#homeScene').selectOption('sideboard');
  assert.equal(await page.locator('#front').isVisible(),false);
  for (const scene of ['living','sideboard','warm','console']) {
   await openHomePanel(page);
   await page.locator('#homeScene').selectOption(scene);
   await page.locator('#homeFinish').selectOption('walnut');
  await page.waitForFunction(expectedScene => document.body.dataset.homeScene === expectedScene && document.body.dataset.homeFinish === 'walnut', scene);
   await capturePage(`work/home-${rendererPath}-${scene}.png`);
  }
  for (const finish of ['white','gloss','taupe','cashmere','charcoal','oak','cadiz','walnut','mercure','cement','oxide','nordic','modern']) {
   await page.locator('#homeFinish').selectOption(finish);
   assert.equal(await page.locator('body').getAttribute('data-home-finish'),finish);
  }
  await openHomePanel(page);
  await page.locator('#homeScene').selectOption('living');
  await page.locator('#homeFinish').selectOption('nordic');
  await page.locator('.home-measures summary').dispatchEvent('click');
  for (const [key,value] of [['width','240'],['height','90'],['depth','55']]) {
   await page.locator(`#home-${key}`).fill(value);await page.locator(`#home-${key}`).dispatchEvent('change');
  }
  await capturePage(`work/home-${rendererPath}-large-day.png`);
  await page.locator('#homeLighting').selectOption('evening');
  for (const [id,value] of [['homeAlbumX','60'],['homeAlbumZ','-50'],['homeAlbumAngle','35']]) {
   await page.locator(`#${id}`).fill(value);await page.locator(`#${id}`).dispatchEvent('input');
  }
  assert.equal(await page.locator('body').getAttribute('data-home-album-position'),'60,-50');
  assert.equal(await page.locator('body').getAttribute('data-home-album-angle'),'35');
  await capturePage(`work/home-${rendererPath}-large-led.png`);
  assert.equal(await page.locator('body').getAttribute('data-home-lighting'),'evening');
  await page.locator('#home-width').fill('0');await page.locator('#home-width').dispatchEvent('change');
  assert.match(await page.locator('#homeDimensionStatus').textContent(),/ultima misura valida/);
  await page.locator('#home-width').fill('');await page.locator('#home-width').dispatchEvent('change');
  assert.match(await page.locator('#homeDimensionStatus').textContent(),/ultima misura valida/);
  for (const [key,value] of [['width','80'],['height','50'],['depth','30']]) {
   await page.locator(`#home-${key}`).fill(value);await page.locator(`#home-${key}`).dispatchEvent('change');
  }
  await capturePage(`work/home-${rendererPath}-small-led.png`);
  await page.locator('#homeAlbumAngle').fill('90');await page.locator('#homeAlbumAngle').dispatchEvent('input');
  assert.match(await page.locator('#homePlacementStatus').textContent(),/sporge/);
  await page.locator('#homeAlbumReset').dispatchEvent('click');
  assert.equal(await page.locator('body').getAttribute('data-home-album-position'),'0,0');
  assert.equal(await page.locator('body').getAttribute('data-home-album-angle'),'0');
  await page.setViewportSize({width:390,height:844});
  for (const [key,value] of [['width','300'],['height','110'],['depth','65']]) {
   await page.locator(`#home-${key}`).fill(value);await page.locator(`#home-${key}`).dispatchEvent('change');
  }
  await capturePage(`work/home-${rendererPath}-mobile.png`,{fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await openHomePanel(page);
  await page.locator('#homeScene').selectOption('none');
  assert.equal(await page.locator('#front').isVisible(),true);
  await page.setViewportSize({width:1440,height:1000});
 }
  phase('wizard cliente: incisione, foto richieste, bozza e sola lettura');
  // Wizard girevole: incisione senza foto, requisiti fronte/retro, nuove bozze e sola lettura.
 saved={...rotatingWizardFixture,configuration:{...rotatingWizardFixture.configuration,photoAssetId:null}};
 await page.setViewportSize({width:390,height:844});
 frame=await open('?client');
 await frame.getByRole('button',{name:/Custodia Studio/}).dispatchEvent('click');
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.body.dataset.wizard==='true' && document.querySelector('iframe')?.contentDocument?.getElementById('modelName'));
 await frame.getByRole('button',{name:/^Album girevole/}).dispatchEvent('click');
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.body.dataset.wizard==='true' && document.querySelector('iframe')?.contentDocument?.getElementById('firstName'));
 await capturePage('work/mockup-wizard-mobile-modelli.png');
 await page.getByRole('button',{name:'Avanti',exact:true}).dispatchEvent('click');
 await frame.getByRole('button',{name:'Bianco',exact:true}).dispatchEvent('click');
 await capturePage('work/mockup-wizard-mobile-materiali.png');
 await frame.getByRole('button',{name:'Estrai album',exact:true}).dispatchEvent('click');
 assert.equal(await frame.locator('body').getAttribute('data-extraction'),'100');
 await frame.getByRole('button',{name:'Reinserisci album',exact:true}).dispatchEvent('click');
 await frame.getByRole('button',{name:'Estrai album',exact:true}).dispatchEvent('click');
 await frame.getByRole('button',{name:'Reimposta vista',exact:true}).dispatchEvent('click');
 assert.equal(await frame.getByRole('button',{name:'Estrai album',exact:true}).isVisible(),true,'Il preset rispecchia il ripristino della vista');
 await page.getByRole('button',{name:'Avanti',exact:true}).dispatchEvent('click');
 await setFrameValue('#firstName','Éléonore');await setFrameValue('#secondName','Marco');
 page.once('dialog',dialog=>dialog.dismiss());
 await clickPageButton('Chiudi');
 assert.equal(await frame.locator('#firstName').inputValue(),'Éléonore','Annullare la chiusura conserva la personalizzazione cliente');
 await capturePage('work/mockup-wizard-mobile-nomi.png');
 assert.equal(await page.getByRole('button',{name:'Avanti',exact:true}).isEnabled(),true,'Incisione senza foto valida');
 await page.getByRole('button',{name:'Indietro',exact:true}).dispatchEvent('click');
 await frame.getByRole('button',{name:'Foto grande a tutta copertina',exact:true}).dispatchEvent('click');
 await page.getByRole('button',{name:'Avanti',exact:true}).dispatchEvent('click');
 await frame.waitForFunction(()=>document.body.innerText.includes('Per proseguire, aggiungi le foto richieste'));
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Avanti')?.disabled);
 await page.locator('input[type=file]').setInputFiles({name:'front.png',mimeType:'image/png',buffer:photo});
 await page.getByText('Foto pronta. Salva per conservarla nel fotolibro.',{exact:true}).waitFor();
 await frame.locator('#backCover').selectOption('photo');
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Avanti')?.disabled);
 await frame.getByLabel('Foto da personalizzare',{exact:true}).selectOption('back');
 await page.locator('input[type=file]').setInputFiles({name:'retro.png',mimeType:'image/png',buffer:rearImage});
 await page.getByText('Foto pronta. Salva per conservarla nel fotolibro.',{exact:true}).waitFor();
 await frame.getByText('Sistema la foto del retro',{exact:true}).dispatchEvent('click');
 await setFrameValue('#backZoom','1.4');await frame.locator('#backZoom').dispatchEvent('input');
 await page.getByRole('button',{name:'Avanti',exact:true}).dispatchEvent('click');
 const beforeDraft=saved.revision;
 await page.getByRole('button',{name:'Salva bozza',exact:true}).dispatchEvent('click');
 await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.revision,beforeDraft+1);assert.equal(saved.status,'draft');
 assert.equal(saved.configuration.backPhotoAssetId,backAssetId);assert.equal(saved.configuration.frameFinish,'white');assert.equal(saved.configuration.backCrop.zoom,1.4);
 await capturePage('work/mockup-wizard-mobile-riepilogo.png');
 await page.getByRole('button',{name:'Chiudi',exact:true}).dispatchEvent('click');
 frame=await open('?client&readonly');
 const readRevision=saved.revision;
 for(let step=1;step<4;step++) {
  if(step===2) assert.equal(await frame.getByRole('button',{name:'Bianco',exact:true}).isDisabled(),true);
  if(step===3) assert.equal(await frame.getByRole('button',{name:'Carica una foto',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Avanti',exact:true}).dispatchEvent('click');
 }
 assert.equal(await page.getByRole('button',{name:'Invia allo studio per verifica'}).isDisabled(),true);
 await page.setViewportSize({width:320,height:640});
 await page.waitForFunction(()=>{const box=document.querySelector('[role=dialog]').getBoundingClientRect();return Math.abs(box.width-320)<1 && Math.abs(box.height-640)<1 && box.top>=-1 && box.left>=-1;});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(await frame.getByRole('button',{name:'Fronte',exact:true}).isVisible(),true);
 await capturePage('work/mockup-wizard-mobile-320.png');
 assert.equal(saved.revision,readRevision);
 await page.setViewportSize({width:1280,height:800});
 frame=await open('?admin');
 await page.getByRole('button',{name:'Verifica',exact:true}).dispatchEvent('click');
 assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).count(),0,'La verifica non mostra un salvataggio superfluo');
 await page.getByRole('button',{name:'Richiedi modifiche al cliente',exact:true}).dispatchEvent('click');
 assert.equal(await page.getByRole('button',{name:'Invia richiesta di modifiche',exact:true}).isDisabled(),true);
 await page.getByLabel('Cosa deve correggere il cliente?').fill('Centra la foto sul plexiglass');
 await page.getByRole('button',{name:'Invia richiesta di modifiche',exact:true}).dispatchEvent('click');
 await page.getByText('Proposta restituita al cliente per le modifiche.',{exact:true}).waitFor();
 assert.equal(saved.status,'changes_requested');assert.equal(saved.note,'Centra la foto sul plexiglass');
 assert.equal(await page.getByLabel('Cosa deve correggere il cliente?').count(),0);
 await capturePage('work/mockup-admin-review-final.png');
 assert.deepEqual(errors,[]);
 console.log('Album girevole OK: cambio renderer, ripristino, 3 finiture e copertine, 8 viste, incisione senza foto, blocco foto mancante, mobile e sola lettura.');
 console.log('Browser OK: renderer, foto, download, mobile, catalogo laboratorio, proposta, invio cliente, correzione studio, conferma con 8 viste, allegato e contatto WhatsApp operativo.');
  }catch(error){
   const enriched=await withDiagnostics(error);
   console.error(`[mockup] FALLIMENTO: fase=${currentPhase}; ultimo controllo=${lastCheck}; stato=${JSON.stringify(await rendererDiagnostics())}`);
   throw enriched;
 }finally{await browser?.close();await vite.close();}
