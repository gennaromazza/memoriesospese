// Test reale del componente e del renderer, con API/Firebase isolati dalla produzione.
// node e2e/photobook-mockup.browser.mjs
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const root=process.cwd();
const vite=await createServer({ configFile:false, root:path.join(root,'e2e/mockup-harness'), publicDir:path.join(root,'client/public'),
  plugins:[{ name:'mockup-test-firebase', enforce:'pre', resolveId(source,importer){if(source==='@/lib/firebase'||source.replaceAll('\\','/').endsWith('/client/src/lib/firebase')||(source==='./firebase'&&importer?.replaceAll('\\','/').includes('/client/src/lib/')))return path.join(root,'e2e/mockup-harness/firebase.ts');} },react()],
  resolve:{alias:{'@':path.join(root,'client/src'),'@shared':path.join(root,'shared')}},
  css:{postcss:path.join(root,'postcss.config.js')},
  server:{host:'127.0.0.1',port:0,fs:{allow:[root]}} });
let browser;
try{
 await vite.listen();
 const port=vite.httpServer.address().port;
 const options={headless:true,args:['--enable-unsafe-swiftshader']};
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 if(fs.existsSync(edge))options.executablePath=edge;
 browser=await chromium.launch(options);
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.message);});
 page.on('console',msg=>{if(msg.type()==='error')console.error('Console:',msg.text());});
 const catalog=JSON.parse(fs.readFileSync('client/public/mockups/custodia-v1/peppe-lab-catalog.json','utf8'));
 const model=catalog.models[0],material=catalog.variants[0];
 const assetId='11111111-1111-4111-8111-111111111111';
 const backAssetId='55555555-5555-4555-8555-555555555555';
 const rearImage=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#286880"/><rect x="300" width="300" height="400" fill="#bb9646"/><text x="45" y="100" font-size="64" fill="white">RETRO</text><circle cx="90" cy="290" r="48" fill="white"/></svg>')).png().toBuffer();
 const photo=await sharp({create:{width:600,height:400,channels:3,background:'#bc8862'}}).png().toBuffer();
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
 async function open(query='?admin'){
  await page.goto(`http://127.0.0.1:${port}/${query}`);
  assert.equal(await page.locator('iframe').count(),0,'Il 3D non deve caricarsi nella pagina delle foto');
  await page.getByRole('button',{name:/^Apri mockup /}).click();
  try { await page.frameLocator('iframe').locator('body[data-ready="true"]').waitFor({timeout:30000}); }
  catch(error){console.error(await page.locator('body').innerText());console.error(await page.frameLocator('iframe').locator('body').innerText());throw error;}
  if(query.includes('admin')) {
   await page.getByRole('heading',{name:'Verifica proposta album',exact:true}).waitFor();
   assert.equal(await page.getByLabel('Cosa deve correggere il cliente?').count(),0);
   const before=await page.locator('iframe').boundingBox();
   await page.locator('.mockup-admin-panel').evaluate(el=>el.scrollTop=el.scrollHeight);
   assert.deepEqual(await page.locator('iframe').boundingBox(),before,'Lo scorrimento dei comandi non sposta l’album');
   await page.getByRole('button',{name:'Modifica',exact:true}).click();
   await page.getByRole('button',{name:'Carica una foto'}).waitFor();
  }
  else await page.frameLocator('iframe').locator('#wizard-slot').waitFor();
  return page.frameLocator('iframe');
 }
 let frame=await open();
 await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.getElementById('topText')?.value==='Custodia test');
 assert.equal(await page.getByRole('button',{name:'Salva mockup'}).isDisabled(),true);
 await frame.locator('#topText').fill('Anna e Marco');
 await page.getByRole('button',{name:'Salva mockup'}).click();
 await page.getByText('Mockup salvato. Il salvataggio non equivale alla conferma dello studio.',{exact:true}).waitFor();
 assert.equal(saved.configuration.topText,'Anna e Marco');
 await page.setViewportSize({width:390,height:844});
 const modal=page.getByRole('dialog',{name:'Verifica proposta album',exact:true});
 await page.waitForFunction(()=>{const box=document.querySelector('[role=dialog]')?.getBoundingClientRect();return box && Math.abs(box.width-innerWidth)<2 && Math.abs(box.height-innerHeight)<2;});
 const modalBox=await modal.boundingBox();
 assert.ok(modalBox && modalBox.width>=389 && modalBox.height>=843);
 const saveBox=await page.getByRole('button',{name:'Salva mockup',exact:true}).boundingBox();
 assert.ok(saveBox && saveBox.y+saveBox.height<=844,`Salva sempre visibile sul telefono: ${JSON.stringify({modalBox,saveBox})}`);
 await frame.locator('#topText').fill('Modifica non salvata');
 page.once('dialog',dialog=>dialog.dismiss());
 await page.getByRole('button',{name:'Chiudi',exact:true}).click();
 assert.equal(await page.locator('iframe').count(),1,'Annullare la chiusura conserva il renderer');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Chiudi',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('iframe'));
 await page.getByRole('button',{name:/^Apri mockup /}).click();
 await page.getByRole('button',{name:'Modifica',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.getElementById('topText')?.value==='Anna e Marco');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true);
 await page.screenshot({path:'work/mockup-modal-mobile.png'});
 await page.getByRole('button',{name:'Chiudi',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('iframe'));
 await page.setViewportSize({width:1440,height:1100});
 frame=await open();
 await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.getElementById('topText')?.value==='Anna e Marco');
 await page.locator('input[type=file]').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:photo});
 await frame.getByText('Nuova foto.png',{exact:false}).first().waitFor();
 await page.getByRole('button',{name:'Salva mockup'}).click();
 assert.equal(uploads,1);
 await page.getByRole('button',{name:'Scegli dalla galleria'}).click();
 await page.getByRole('dialog').getByRole('button').filter({has:page.getByAltText('Foto della galleria')}).click();
 await frame.getByText('Foto della galleria',{exact:false}).first().waitFor();
 await page.getByRole('button',{name:'Salva mockup'}).click();
 assert.equal(gallerySelections,1);
 await frame.getByRole('button',{name:'In casa',exact:true}).click();
 await frame.locator('#homeScene').selectOption('sideboard');
 assert.equal(await frame.locator('.wizard-views').count(),0,'La vista amministrativa conserva i controlli originali');
 await frame.locator('#homeLighting').selectOption('evening');
 await frame.locator('#homeAlbumAngle').fill('45');await frame.locator('#homeAlbumAngle').dispatchEvent('input');
 await frame.locator('#homeAlbumX').fill('70');await frame.locator('#homeAlbumX').dispatchEvent('input');
 const downloadPromise=page.waitForEvent('download');
 await frame.locator('#downloadClient').click();
 const download=await downloadPromise;assert.ok(download.suggestedFilename().endsWith('.html'));
 assert.equal(await frame.locator('#homeScene').inputValue(),'sideboard');
 assert.equal(await frame.locator('body').getAttribute('data-home-album-angle'),'45');
 await frame.getByRole('button',{name:'In casa',exact:true}).click();
 await frame.locator('#homeScene').selectOption('none');
 fs.mkdirSync('work',{recursive:true});await page.screenshot({path:'work/mockup-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'work/mockup-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:1440,height:1100});
 frame=await open('?admin&readonly');
 await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.getElementById('topText')?.disabled===true);
 assert.equal(await page.getByRole('button',{name:'Salva mockup'}).isDisabled(),true);
 frame=await open('?admin');
 await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.getElementById('topText')?.disabled===false);
 assert.ok(adminRequests>0);
 // Catalogo reale: campionario unico laboratorio, nome configurabile e modello pronto.
 await page.goto(`http://127.0.0.1:${port}/?catalog`);
 await page.getByText('Nessun modello associato',{exact:true}).waitFor();
 await page.getByText('Campionario del laboratorio (0)',{exact:true}).click();
 await page.getByRole('button',{name:'Importa campionario Custodia / Peppe Lab'}).click();
 await page.getByRole('button',{name:'Aggiungi modello'}).click();
 await page.getByLabel('Nome mostrato al cliente').fill('Custodia Studio');
 await page.getByLabel('Modello 3D',{exact:true}).selectOption(model.id);
 await page.getByRole('button',{name:'Salva catalogo',exact:true}).click();
 await page.getByText('Catalogo salvato.',{exact:false}).waitFor();
 assert.equal(labCatalog.models[0].name,'Custodia Studio');assert.equal(labCatalog.materials.length,37);
 assert.equal(await page.getByLabel('Nome mostrato al cliente').count(),0);
 await page.getByText('Disponibile per le proposte',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Modifica',exact:true}).click();
 await page.getByLabel('Nome mostrato al cliente').fill('Modifica da annullare');
 await page.getByRole('button',{name:'Annulla modifiche',exact:true}).click();
 await page.getByRole('heading',{name:'Custodia Studio',exact:true}).waitFor();
 await page.getByRole('button',{name:'Aggiungi modello'}).click();
 await page.getByText('Nuovo · non salvato',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Annulla modifiche',exact:true}).click();
 assert.equal(labCatalog.models.length,1);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:1440,height:1100});
 // Il laboratorio abilita due rivestimenti per questo modello, non per il lavoro.
 labCatalog.models[0].materialIds=labCatalog.materials.slice(0,2).map(m=>m.id);
 frame=await open('?admin');
 await page.getByRole('button',{name:'Modelli disponibili',exact:true}).click();
 await page.getByRole('button',{name:'Laboratori e modelli per questo lavoro'}).click();
 await page.getByRole('checkbox',{name:'Laboratorio test',exact:true}).check();
 await page.getByRole('button',{name:'Pubblica opzioni nel link cliente'}).click();
 await page.getByText('Proposta pubblicata nel link cliente.',{exact:true}).waitFor();
 assert.equal(offer.options.length,1);
 await page.setViewportSize({width:390,height:844});
 frame=await open('?client');
 await frame.locator('.wizard-model[aria-pressed="true"]').waitFor();
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.getElementById('modelName')?.value==='Custodia Studio');
 assert.equal(await frame.locator('[data-finish]:not([hidden])').count(),2);
 assert.equal(await frame.locator('#fabricPanel h2').textContent(),'Laboratorio test · 2 rivestimenti');
 assert.ok((await frame.locator('#materialLabel').textContent()).startsWith('Laboratorio test'));
 await page.getByRole('button',{name:'Avanti',exact:true}).click();
 await frame.getByRole('heading',{name:'Rivestimento e copertina',exact:true}).waitFor();
 await page.evaluate(()=>{window.wizardCanvas=document.querySelector('iframe').contentDocument.querySelector('#viewport');});
 const stageBefore=await frame.locator('.stage').boundingBox();
 await frame.locator('.panel-content').evaluate(el=>el.scrollTop=el.scrollHeight);
 assert.deepEqual(await frame.locator('.stage').boundingBox(),stageBefore,'La vista non scorre con i campioni');
 await page.getByRole('button',{name:'Avanti',exact:true}).click();
 await frame.locator('#topText').fill('Nomi dal telefono');
 await frame.getByRole('button',{name:'Scegli dalla galleria',exact:true}).click();
 await page.getByRole('dialog').getByRole('button').filter({has:page.getByAltText('Foto della galleria')}).click();
 await page.getByText('Foto pronta. Salva per conservarla nel fotolibro.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Indietro',exact:true}).click();
 await page.getByRole('button',{name:'Avanti',exact:true}).click();
 assert.equal(await frame.locator('#topText').inputValue(),'Nomi dal telefono');
 assert.equal(await page.evaluate(()=>window.wizardCanvas===document.querySelector('iframe').contentDocument.querySelector('#viewport')),true,'Nessun nuovo canvas fra i passaggi');
 await page.getByRole('button',{name:'Avanti',exact:true}).click();
 await frame.getByText('Vedi in casa · facoltativo',{exact:true}).click();
 await frame.locator('#homeScene').selectOption('sideboard');
 assert.equal(await frame.locator('.wizard-views').isVisible(),false,'In casa non si estrae il prodotto dal posizionamento');
 assert.equal(await page.evaluate(()=>document.querySelector('iframe').contentDocument.documentElement.scrollWidth<=document.querySelector('iframe').clientWidth),true);
 const sendBox=await page.getByRole('button',{name:'Invia allo studio per verifica'}).boundingBox();
 assert.ok(sendBox.y+sendBox.height<=844,'Invio raggiungibile in fondo al telefono');
 failNextSave=true;
 await page.getByRole('button',{name:'Invia allo studio per verifica'}).click();
 await page.getByText('Salvataggio non completato: Revisione cambiata: ricarica la proposta.',{exact:true}).waitFor();
 assert.equal(submissions,0,'Se il salvataggio fallisce non deve partire alcun invio');
 await page.getByRole('button',{name:'Invia allo studio per verifica'}).click();
 await page.getByText('Proposta inviata allo studio per la verifica.',{exact:true}).waitFor();
 assert.equal(saved.status,'submitted');
 assert.equal(saved.configuration.topText,'Nomi dal telefono','Invio salva prima la revisione modificata');
 assert.equal(await page.getByRole('button',{name:'Invia allo studio per verifica'}).isDisabled(),true,'Non reinviare senza modifiche');
 await page.getByRole('button',{name:'Indietro',exact:true}).click();
 assert.equal(await frame.getByRole('button',{name:'Carica una foto'}).isDisabled(),false);
 await page.setViewportSize({width:1440,height:1100});
 frame=await open('?admin');
 await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
 await frame.locator('#topText').fill('Correzione dello studio');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).click();
 await page.getByRole('button',{name:'Verifica',exact:true}).click();
 await page.getByRole('button',{name:'Conferma mockup',exact:true}).click();
 await page.getByText('Mockup confermato.',{exact:false}).waitFor({timeout:45000});
 assert.equal(confirmations,1);assert.equal(saved.status,'confirmed');
 await page.getByText('Revisioni, documenti e invio al laboratorio',{exact:true}).click();
 await page.getByRole('button',{name:'Allega all’invio fotolibro su Drive'}).click();
 await page.getByText('Mockup registrato nella cartella Drive.',{exact:false}).waitFor();assert.equal(attachments,1);
 await page.screenshot({path:'work/mockup-workflow-studio.png',fullPage:true});
 await page.goto(`http://127.0.0.1:${port}/?job`);
 await page.getByRole('link',{name:'Apri WhatsApp'}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Apri WhatsApp'}).getAttribute('href'),'https://wa.me/393331234567');
 await page.getByText('Confermato dallo studio',{exact:false}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'work/mockup-operativo-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 // Secondo modello: cambio renderer, tre finiture/copertine, persistenza senza foto.
 const rotatingEntry={...labCatalog.models[0],id:'44444444-4444-4444-8444-444444444444',name:'Album girevole',rendererId:'album-girevole'};
 offer.options.push({...rotatingEntry,labId:'lab',labName:'Laboratorio test',materials:labCatalog.materials.slice(0,2)});
 await page.setViewportSize({width:1440,height:1100});
 frame=await open('?admin');
 await page.getByLabel('Laboratorio e modello scelto',{exact:true}).selectOption(`lab/${rotatingEntry.id}`);
 await page.frameLocator('iframe').locator('#rotation').waitFor();
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.body.dataset.ready==='true');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).click();
 await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.configuration.modelId,'album-girevole');assert.equal(saved.configuration.coverLayout,'plaque');
 const rotatingWizardFixture=structuredClone(saved);
 frame=await open('?admin');
 await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
 await frame.locator('#firstName').fill('Anna');await frame.locator('#secondName').fill('Jacopo');
 const monogramAnna=await frame.locator('#engravingPreview').evaluate(canvas=>canvas.toDataURL());
 await frame.locator('#firstName').fill('Éléonore');
 assert.notEqual(await frame.locator('#engravingPreview').evaluate(canvas=>canvas.toDataURL()),monogramAnna);
 await frame.locator('#firstName').fill('Anna');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).click();await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.deepEqual(saved.configuration.engravingNames,{first:'Anna',second:'Jacopo'});assert.equal(saved.configuration.assetRevision,4);
 frame=await open('?admin');await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
 assert.equal(await frame.locator('#firstName').inputValue(),'Anna');assert.equal(await frame.locator('#secondName').inputValue(),'Jacopo');
 await frame.locator('#rotation').fill('65');await frame.locator('#rotation').dispatchEvent('input');
 assert.equal(await frame.locator('body').getAttribute('data-rotation'),'65');
 await frame.locator('#rotation').fill('25');await frame.locator('#rotation').dispatchEvent('input');
 await page.locator('iframe').screenshot({path:'work/mockup-girevole-legno.png'});
 await frame.locator('#frameFinish').selectOption('white');await frame.locator('#coverLayout').selectOption('photo-plaque');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).click();await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.configuration.frameFinish,'white');assert.equal(saved.configuration.coverLayout,'photo-plaque');
 await page.locator('iframe').screenshot({path:'work/mockup-girevole-bianco.png'});
 await frame.locator('#frameFinish').selectOption('fabric');await frame.locator('#coverLayout').selectOption('full');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).click();await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 await page.locator('iframe').screenshot({path:'work/mockup-girevole-tessuto.png'});
 await page.getByRole('button',{name:'Verifica',exact:true}).click();
 await page.getByRole('button',{name:'Conferma mockup',exact:true}).click();await page.getByText('Mockup confermato.',{exact:false}).waitFor({timeout:45000});
 assert.equal(confirmations,2);
 // Foto sul plexiglass dello scrigno ed estrazione del solo album, senza cambiare la configurazione.
 frame=await open('?admin');await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
 await frame.locator('#backCover').selectOption('photo');
 assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true);
 await page.getByLabel('Foto da personalizzare',{exact:true}).selectOption('back');
 await page.locator('input[type=file]').setInputFiles({name:'retro.png',mimeType:'image/png',buffer:rearImage});
 await frame.getByText('Foto retro.png',{exact:false}).first().waitFor();
 await frame.locator('#backZoom').fill('1.3');await frame.locator('#backZoom').dispatchEvent('input');
 await frame.locator('#backX').fill('30');await frame.locator('#backX').dispatchEvent('input');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).click();await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.configuration.photoAssetId,assetId);assert.equal(saved.configuration.backPhotoAssetId,backAssetId);assert.equal(saved.configuration.backCrop.x,.3);
 frame=await open('?admin');await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
 await frame.locator('#backCover').waitFor();assert.equal(await frame.locator('#backCover').inputValue(),'photo');
 assert.equal(await frame.locator('#backZoom').inputValue(),'1.3');
 await frame.locator('#back').click();await page.locator('iframe').screenshot({path:'work/mockup-girevole-retro-plex.png'});
 await frame.locator('#extract').fill('100');await frame.locator('#extract').dispatchEvent('input');
 assert.equal(await frame.locator('body').getAttribute('data-extraction'),'100');assert.equal(await frame.locator('#rotation').isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true);
 await page.locator('iframe').screenshot({path:'work/mockup-girevole-estratto.png'});
 await frame.getByRole('button',{name:'In casa',exact:true}).click();
 await frame.locator('#homeScene').selectOption('warm');
 assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Verifica',exact:true}).click();
 await page.getByRole('button',{name:'Conferma mockup',exact:true}).click();await page.getByText('Mockup confermato.',{exact:false}).waitFor({timeout:45000});
 assert.equal(confirmations,3);assert.equal(await frame.locator('#extract').inputValue(),'100');
 assert.equal(await frame.locator('#homeScene').inputValue(),'warm');
 await page.getByRole('button',{name:'Modifica',exact:true}).click();
 await frame.getByRole('button',{name:'In casa',exact:true}).click();
 await frame.locator('#homeScene').selectOption('none');
 frame=await open('?admin&readonly');await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
 assert.equal(await frame.locator('#backCover').isDisabled(),true);
 await frame.getByRole('button',{name:'In casa',exact:true}).click();
 await frame.locator('#homeScene').selectOption('console');
 assert.equal(await frame.locator('#homeFinish').isEnabled(),true);
 await frame.getByRole('button',{name:'In casa',exact:true}).click();
 await frame.locator('#homeScene').selectOption('none');
 await frame.locator('#extract').fill('50');await frame.locator('#extract').dispatchEvent('input');assert.equal(await frame.locator('body').getAttribute('data-extraction'),'50');
 await frame.locator('#reset').click();assert.equal(await frame.locator('#extract').inputValue(),'0');assert.equal(await frame.locator('#rotation').isDisabled(),false);
 // Le configurazioni v2/v3 conservano la loro identità anche nel renderer corrente.
 // La conferma compara l'intera configurazione esportata con quella salvata, incluse foto e ritagli.
 const currentRotatingSnapshot=structuredClone(saved);
 for (const legacyRevision of [2,3]) {
  const historicalConfiguration={...currentRotatingSnapshot.configuration,assetRevision:legacyRevision};
  if(legacyRevision===2)delete historicalConfiguration.engravingNames;
  saved={...currentRotatingSnapshot,status:'draft',configuration:historicalConfiguration};
  frame=await open('?admin');await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Carica una foto'&&!b.disabled));
  assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true,'Aprire una revisione storica non deve convertirla');
  assert.equal(await frame.locator('#backCover').inputValue(),historicalConfiguration.backCover);
  assert.equal(await frame.locator('#backZoom').inputValue(),String(historicalConfiguration.backCrop.zoom));
  if(legacyRevision===3)assert.equal(await frame.locator('#firstName').inputValue(),historicalConfiguration.engravingNames.first);
  await page.getByRole('button',{name:'Verifica',exact:true}).click();
  await page.getByRole('button',{name:'Conferma mockup',exact:true}).click();
  await page.getByText('Mockup confermato.',{exact:false}).waitFor({timeout:45000});
  assert.deepEqual(saved.configuration,historicalConfiguration,'Export storico fedele, senza migrazione implicita');
 }
 // Una configurazione v1 resta invariata all'apertura, e passa a v4 solo modificandola.
 const {backCover:oldBack,backPhotoAssetId:oldBackPhoto,backCrop:oldBackCrop,engravingNames:oldNames,...legacyConfig}=saved.configuration;
 saved={...saved,status:'draft',configuration:{...legacyConfig,assetRevision:1}};
 frame=await open('?admin');await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Carica una foto'&&!b.disabled));
 assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true);
 await frame.locator('#frameFinish').selectOption('white');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).click();await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.configuration.assetRevision,4);assert.equal(saved.configuration.backCover,'fabric');assert.equal(saved.configuration.backPhotoAssetId,null);
 assert.equal('engravingNames' in saved.configuration,false,'Le righe legacy non vengono trasformate in nomi automaticamente');
 saved={...saved,status:'draft',configuration:{...saved.configuration,coverLayout:'plaque',photoAssetId:null,frameFinish:'wood'}};
 frame=await open('?admin');await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
 await frame.locator('#topText').fill('Incisione senza fotografia');
 await page.getByRole('button',{name:'Salva mockup',exact:true}).click();await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.configuration.photoAssetId,null);
 await frame.locator('#coverLayout').selectOption('full');assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).isDisabled(),true);
 await frame.locator('#coverLayout').selectOption('plaque');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'work/mockup-girevole-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 frame=await open('?admin&readonly');await frame.getByRole('button',{name:'Dettagli',exact:true}).click();
 assert.equal(await frame.locator('#frameFinish').isDisabled(),true);
 await frame.locator('#rotation').fill('90');await frame.locator('#rotation').dispatchEvent('input');
 assert.equal(await frame.locator('body').getAttribute('data-rotation'),'90');
 frame=await open('?admin');
 await page.getByLabel('Laboratorio e modello scelto',{exact:true}).selectOption(`lab/${labCatalog.models[0].id}`);
 await page.waitForFunction(()=>document.querySelector('iframe')?.src.includes('custodia-v1')&&document.querySelector('iframe')?.contentDocument?.body.dataset.ready==='true');
 await page.frameLocator('iframe').getByRole('button',{name:'Dettagli',exact:true}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Carica una foto'&&!b.disabled));
 await page.locator('input[type=file]').setInputFiles({name:'ritorno-custodia.png',mimeType:'image/png',buffer:photo});
 await page.frameLocator('iframe').getByText('Nuova foto.png',{exact:false}).first().waitFor();
 await page.getByRole('button',{name:'Salva mockup',exact:true}).click();await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.configuration.modelId,model.id);assert.equal(saved.configuration.photoAssetId,assetId);
 // Anteprima del campione iniziale Mist 03, senza API o dati cliente.
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(`http://127.0.0.1:${port}/mockups/girevole-v4/index.html`);
 await page.locator('body[data-ready="true"]').waitFor();
 await page.getByRole('button',{name:'Dettagli',exact:true}).click();
 await page.locator('#firstName').fill('Anna');await page.locator('#secondName').fill('Jacopo');
 await page.locator('#engravingPreview').screenshot({path:'work/mockup-incisione-botanica.png'});
 await page.screenshot({path:'work/mockup-girevole-anteprima.png'});
 // Le ambientazioni sono condivise e non modificano la configurazione prodotto.
 for (const rendererPath of ['girevole-v4','custodia-v1']) {
  await page.goto(`http://127.0.0.1:${port}/mockups/${rendererPath}/index.html`);
  await page.locator('body[data-ready="true"]').waitFor();
  await page.getByRole('button',{name:'In casa',exact:true}).click();
  await page.locator('#homeScene').selectOption('sideboard');
  assert.equal(await page.locator('#front').isVisible(),false);
  for (const scene of ['living','sideboard','warm','console']) {
   await page.getByRole('button',{name:'In casa',exact:true}).click();
   await page.locator('#homeScene').selectOption(scene);
   await page.locator('#homeFinish').selectOption('walnut');
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.screenshot({path:`work/home-${rendererPath}-${scene}.png`});
  }
  for (const finish of ['white','gloss','taupe','cashmere','charcoal','oak','cadiz','walnut','mercure','cement','oxide','nordic','modern']) {
   await page.locator('#homeFinish').selectOption(finish);
   assert.equal(await page.locator('body').getAttribute('data-home-finish'),finish);
  }
  await page.getByRole('button',{name:'In casa',exact:true}).click();
  await page.locator('#homeScene').selectOption('living');
  await page.locator('#homeFinish').selectOption('nordic');
  await page.locator('.home-measures summary').click();
  for (const [key,value] of [['width','240'],['height','90'],['depth','55']]) {
   await page.locator(`#home-${key}`).fill(value);await page.locator(`#home-${key}`).dispatchEvent('change');
  }
  await page.screenshot({path:`work/home-${rendererPath}-large-day.png`});
  await page.locator('#homeLighting').selectOption('evening');
  for (const [id,value] of [['homeAlbumX','60'],['homeAlbumZ','-50'],['homeAlbumAngle','35']]) {
   await page.locator(`#${id}`).fill(value);await page.locator(`#${id}`).dispatchEvent('input');
  }
  assert.equal(await page.locator('body').getAttribute('data-home-album-position'),'60,-50');
  assert.equal(await page.locator('body').getAttribute('data-home-album-angle'),'35');
  await page.screenshot({path:`work/home-${rendererPath}-large-led.png`});
  assert.equal(await page.locator('body').getAttribute('data-home-lighting'),'evening');
  await page.locator('#home-width').fill('0');await page.locator('#home-width').dispatchEvent('change');
  assert.match(await page.locator('#homeDimensionStatus').textContent(),/ultima misura valida/);
  await page.locator('#home-width').fill('');await page.locator('#home-width').dispatchEvent('change');
  assert.match(await page.locator('#homeDimensionStatus').textContent(),/ultima misura valida/);
  for (const [key,value] of [['width','80'],['height','50'],['depth','30']]) {
   await page.locator(`#home-${key}`).fill(value);await page.locator(`#home-${key}`).dispatchEvent('change');
  }
  await page.screenshot({path:`work/home-${rendererPath}-small-led.png`});
  await page.locator('#homeAlbumAngle').fill('90');await page.locator('#homeAlbumAngle').dispatchEvent('input');
  assert.match(await page.locator('#homePlacementStatus').textContent(),/sporge/);
  await page.locator('#homeAlbumReset').click();
  assert.equal(await page.locator('body').getAttribute('data-home-album-position'),'0,0');
  assert.equal(await page.locator('body').getAttribute('data-home-album-angle'),'0');
  await page.setViewportSize({width:390,height:844});
  for (const [key,value] of [['width','300'],['height','110'],['depth','65']]) {
   await page.locator(`#home-${key}`).fill(value);await page.locator(`#home-${key}`).dispatchEvent('change');
  }
  await page.screenshot({path:`work/home-${rendererPath}-mobile.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'In casa',exact:true}).click();
  await page.locator('#homeScene').selectOption('none');
  assert.equal(await page.locator('#front').isVisible(),true);
  await page.setViewportSize({width:1440,height:1000});
 }
 // Wizard girevole: incisione senza foto, requisiti fronte/retro, nuove bozze e sola lettura.
 saved={...rotatingWizardFixture,configuration:{...rotatingWizardFixture.configuration,photoAssetId:null}};
 await page.setViewportSize({width:390,height:844});
 frame=await open('?client');
 await frame.getByRole('button',{name:/Custodia Studio/}).click();
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.body.dataset.wizard==='true' && document.querySelector('iframe')?.contentDocument?.getElementById('modelName'));
 await frame.getByRole('button',{name:/^Album girevole/}).click();
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.body.dataset.wizard==='true' && document.querySelector('iframe')?.contentDocument?.getElementById('firstName'));
 await page.screenshot({path:'work/mockup-wizard-mobile-modelli.png'});
 await page.getByRole('button',{name:'Avanti',exact:true}).click();
 await frame.getByRole('button',{name:'Bianco',exact:true}).click();
 await page.screenshot({path:'work/mockup-wizard-mobile-materiali.png'});
 await frame.getByRole('button',{name:'Estrai album',exact:true}).click();
 assert.equal(await frame.locator('body').getAttribute('data-extraction'),'100');
 await frame.getByRole('button',{name:'Reinserisci album',exact:true}).click();
 await frame.getByRole('button',{name:'Estrai album',exact:true}).click();
 await frame.getByRole('button',{name:'Reimposta vista',exact:true}).click();
 assert.equal(await frame.getByRole('button',{name:'Estrai album',exact:true}).isVisible(),true,'Il preset rispecchia il ripristino della vista');
 await page.getByRole('button',{name:'Avanti',exact:true}).click();
 await frame.locator('#firstName').fill('Éléonore');await frame.locator('#secondName').fill('Marco');
 page.once('dialog',dialog=>dialog.dismiss());
 await page.getByRole('button',{name:'Chiudi',exact:true}).click();
 assert.equal(await frame.locator('#firstName').inputValue(),'Éléonore','Annullare la chiusura conserva la personalizzazione cliente');
 await page.screenshot({path:'work/mockup-wizard-mobile-nomi.png'});
 assert.equal(await page.getByRole('button',{name:'Avanti',exact:true}).isEnabled(),true,'Incisione senza foto valida');
 await page.getByRole('button',{name:'Indietro',exact:true}).click();
 await frame.getByRole('button',{name:'Foto grande a tutta copertina',exact:true}).click();
 await page.getByRole('button',{name:'Avanti',exact:true}).click();
 await frame.getByText('Per proseguire, aggiungi le foto richieste',{exact:false}).waitFor();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Avanti')?.disabled);
 await page.locator('input[type=file]').setInputFiles({name:'front.png',mimeType:'image/png',buffer:photo});
 await page.getByText('Foto pronta. Salva per conservarla nel fotolibro.',{exact:true}).waitFor();
 await frame.locator('#backCover').selectOption('photo');
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Avanti')?.disabled);
 await frame.getByLabel('Foto da personalizzare',{exact:true}).selectOption('back');
 await page.locator('input[type=file]').setInputFiles({name:'retro.png',mimeType:'image/png',buffer:rearImage});
 await page.getByText('Foto pronta. Salva per conservarla nel fotolibro.',{exact:true}).waitFor();
 await frame.getByText('Sistema la foto del retro',{exact:true}).click();
 await frame.locator('#backZoom').fill('1.4');await frame.locator('#backZoom').dispatchEvent('input');
 await page.getByRole('button',{name:'Avanti',exact:true}).click();
 const beforeDraft=saved.revision;
 await page.getByRole('button',{name:'Salva bozza',exact:true}).click();
 await page.getByText('Mockup salvato.',{exact:false}).waitFor();
 assert.equal(saved.revision,beforeDraft+1);assert.equal(saved.status,'draft');
 assert.equal(saved.configuration.backPhotoAssetId,backAssetId);assert.equal(saved.configuration.frameFinish,'white');assert.equal(saved.configuration.backCrop.zoom,1.4);
 await page.screenshot({path:'work/mockup-wizard-mobile-riepilogo.png'});
 await page.getByRole('button',{name:'Chiudi',exact:true}).click();
 frame=await open('?client&readonly');
 const readRevision=saved.revision;
 for(let step=1;step<4;step++) {
  if(step===2) assert.equal(await frame.getByRole('button',{name:'Bianco',exact:true}).isDisabled(),true);
  if(step===3) assert.equal(await frame.getByRole('button',{name:'Carica una foto',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Avanti',exact:true}).click();
 }
 assert.equal(await page.getByRole('button',{name:'Invia allo studio per verifica'}).isDisabled(),true);
 await page.setViewportSize({width:320,height:640});
 await page.waitForFunction(()=>{const box=document.querySelector('[role=dialog]').getBoundingClientRect();return Math.abs(box.width-320)<1 && Math.abs(box.height-640)<1 && box.top>=-1 && box.left>=-1;});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(await frame.getByRole('button',{name:'Fronte',exact:true}).isVisible(),true);
 await page.screenshot({path:'work/mockup-wizard-mobile-320.png'});
 assert.equal(saved.revision,readRevision);
 await page.setViewportSize({width:1280,height:800});
 frame=await open('?admin');
 await page.getByRole('button',{name:'Verifica',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Salva mockup',exact:true}).count(),0,'La verifica non mostra un salvataggio superfluo');
 await page.getByRole('button',{name:'Richiedi modifiche al cliente',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Invia richiesta di modifiche',exact:true}).isDisabled(),true);
 await page.getByLabel('Cosa deve correggere il cliente?').fill('Centra la foto sul plexiglass');
 await page.getByRole('button',{name:'Invia richiesta di modifiche',exact:true}).click();
 await page.getByText('Proposta restituita al cliente per le modifiche.',{exact:true}).waitFor();
 assert.equal(saved.status,'changes_requested');assert.equal(saved.note,'Centra la foto sul plexiglass');
 assert.equal(await page.getByLabel('Cosa deve correggere il cliente?').count(),0);
 await page.screenshot({path:'work/mockup-admin-review-final.png'});
 assert.deepEqual(errors,[]);
 console.log('Album girevole OK: cambio renderer, ripristino, 3 finiture e copertine, 8 viste, incisione senza foto, blocco foto mancante, mobile e sola lettura.');
 console.log('Browser OK: renderer, foto, download, mobile, catalogo laboratorio, proposta, invio cliente, correzione studio, conferma con 8 viste, allegato e contatto WhatsApp operativo.');
}finally{await browser?.close();await vite.close();}
