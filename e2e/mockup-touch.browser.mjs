// Regressione touch: non sostituire tap con click, né usare force/dispatchEvent per i pulsanti.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit } from '@playwright/test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const root=process.cwd();
const TOUCH_TIMEOUT_MS=Number(process.env.MOCKUP_TOUCH_ACTION_TIMEOUT_MS||30000);
const RENDERER_TIMEOUT_MS=Number(process.env.MOCKUP_RENDERER_TIMEOUT_MS||90000);
const CLEANUP_TIMEOUT_MS=Number(process.env.MOCKUP_CLEANUP_TIMEOUT_MS||5000);
const TEST_TIMEOUT_MS=Number(process.env.MOCKUP_TOUCH_TEST_TIMEOUT_MS||300000);
let phase='startup';
let page;
let vite;
let watchdog;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const withTimeout=(label,operation,timeout) => {
 phase=label;
 const pending=Promise.resolve().then(operation);
 pending.catch(()=>{});
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error(`${label} non completato entro ${timeout} ms`)),timeout);
  pending.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
 });
};
const touch=(target,label)=>withTimeout(label,()=>target.tap({timeout:TOUCH_TIMEOUT_MS}),TOUCH_TIMEOUT_MS);
const waitForRenderer=(frame,label)=>withTimeout(label,()=>frame.locator('#wizard-slot').waitFor({timeout:RENDERER_TIMEOUT_MS}),RENDERER_TIMEOUT_MS);
const pageDiagnostics=async()=>{
 if(!page) return 'pagina non disponibile';
 const originalPhase=phase;
 try {
  const result=JSON.stringify(await withTimeout('diagnostica timeout',()=>page.evaluate(()=>({
   url:location.href,
   phase:document.body?.dataset.wizardStep||'unknown',
   iframe:document.querySelector('iframe')?.getAttribute('title')||null,
   iframeVisible:document.querySelector('iframe') ? getComputedStyle(document.querySelector('iframe')).visibility : null,
   rendererReady:document.querySelector('iframe')?.contentDocument?.body?.dataset.ready||null,
   wizardLayout:document.querySelector('iframe')?.contentDocument?.body?.dataset.wizardLayout||null,
   webgl:(()=>{const canvas=document.querySelector('iframe')?.contentDocument?.querySelector('canvas');return canvas?.getContext('webgl')||canvas?.getContext('webgl2')?'available':'unavailable';})(),
  })),2000));
  phase=originalPhase;
  return result;
 } catch(error) { phase=originalPhase; return `diagnostica non disponibile: ${error.message}`; }
};
const closeWithTimeout=async(label,close)=>{
 if(!close) return;
 const pending=Promise.resolve().then(close);
 pending.catch(()=>{});
 await Promise.race([pending,delay(CLEANUP_TIMEOUT_MS)]);
 if(label==='browser' && browser) {
  const processHandle=browser.process?.();
  if(processHandle && !processHandle.killed) processHandle.kill('SIGKILL');
 }
};
const createRendererGate=label=>{
 let settled=false;
 let release;
 let timer;
 let started=false;
 const promise=new Promise(resolve=>{
  release=()=>{
   if(settled) return;
   settled=true;
   clearTimeout(timer);
   resolve();
  };
 });
 const start=()=>{
  if(started || settled) return;
  started=true;
  timer=setTimeout(()=>{
   console.error(`[mockup-touch] ${label} gate scaduto dopo ${RENDERER_TIMEOUT_MS} ms; continuo per produrre un esito`);
   release();
  },RENDERER_TIMEOUT_MS);
  timer.unref();
 };
 return {promise,release,start};
};
watchdog=setTimeout(()=>{
 console.error(`[mockup-touch] timeout globale durante "${phase}" dopo ${TEST_TIMEOUT_MS} ms`);
 void pageDiagnostics().then(diagnostic=>console.error(`[mockup-touch] ${diagnostic}`)).catch(()=>{}).finally(()=>{
  console.error(`[mockup-touch] processo terminato per evitare un job bloccato`);
  const processHandle=browser?.process?.();
  if(processHandle && !processHandle.killed) processHandle.kill('SIGKILL');
  process.exit(1);
 });
},TEST_TIMEOUT_MS);
watchdog.unref();
let browser;
let releaseRenderer;
let releaseRotating;
try {
 vite=await createServer({configFile:false,root:path.join(root,'e2e/mockup-harness'),publicDir:path.join(root,'client/public'),plugins:[{name:'firebase-test',enforce:'pre',resolveId(source,importer){if(source==='@/lib/firebase'||source.replaceAll('\\','/').endsWith('/client/src/lib/firebase')||(source==='./firebase'&&importer?.replaceAll('\\','/').includes('/client/src/lib/')))return path.join(root,'e2e/mockup-harness/firebase.ts');}},react()],resolve:{alias:{'@':path.join(root,'client/src'),'@shared':path.join(root,'shared')}},css:{postcss:path.join(root,'postcss.config.js')},server:{host:'127.0.0.1',port:0,fs:{allow:[root]}}});
 await withTimeout('avvio Vite',()=>vite.listen(),30000); const port=vite.httpServer.address().port;
 const {mockupConfigurationSchema}=await vite.ssrLoadModule('/@fs/'+path.join(root,'shared/mockup-types.ts').replaceAll('\\','/'));
 const {mockupWorkflowInputSchema,mockupSelectionSchema}=await vite.ssrLoadModule('/@fs/'+path.join(root,'shared/mockup-workflow.ts').replaceAll('\\','/'));
 const engine=process.env.MOCKUP_ENGINE||'chromium';
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser=await withTimeout('avvio browser',()=> (engine==='webkit'?webkit:chromium).launch({headless:true,timeout:30000,...(engine==='chromium'?{args:['--enable-unsafe-swiftshader'],...(fs.existsSync(edge)?{executablePath:edge}:{})}: {})}),30000);
  page=await withTimeout('creazione pagina',()=>browser.newPage({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true}),30000);
 page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const catalog=JSON.parse(fs.readFileSync('client/public/mockups/custodia-v1/peppe-lab-catalog.json','utf8'));
 const materials=catalog.variants.slice(0,2).map(v=>({id:v.id,label:v.label,supplierCode:''}));
 const offer={revision:1,updatedAt:new Date().toISOString(),options:[['11111111-1111-4111-8111-111111111111','Custodia',catalog.models[0].id],['22222222-2222-4222-8222-222222222222','Plaza','album-girevole']].map(([id,name,rendererId])=>({id,name,rendererId,supplierCode:'',active:true,materialIds:materials.map(m=>m.id),materials,labId:'lab',labName:'Laboratorio test'}))};
 const photoId='33333333-3333-4333-8333-333333333333';
 const photo=await sharp({create:{width:600,height:400,channels:3,background:'#ccbbaa'}}).png().toBuffer();
 let saved=null,locked=false;
 let draftSaveRequests=0;
 await page.route('**/api/**',route=>{
   const url=new URL(route.request().url());
   assert.ok(!url.pathname.endsWith('/upload'),'Il mobile sceglie solo dalla galleria');
   if(url.pathname.endsWith('/gallery-photos')) return route.fulfill({json:{photos:Array.from({length:65},(_,i)=>({id:i?`gallery-${i}`:'gallery-one',name:`Foto prova ${i}`,thumbnailUrl:'/test-photo.png',url:'/test-photo.png'})),chapters:[]}});
   if(url.pathname.endsWith('/by-token/mockup-test-token')) return route.fulfill({json:{photobook:{id:'book',name:'Album test',currentVersion:1,approval:{version:1},versions:[{version:1,pageCount:0}],locked},version:1,pages:[],requests:[]}});
   if(url.pathname.endsWith('/gallery-photo')) return route.fulfill({json:{id:photoId,name:'Foto prova',source:'gallery',width:600,height:400}});
   if(url.pathname.includes('/photos/')) return route.fulfill({contentType:'image/png',body:photo});
   if(url.pathname.endsWith('/submit')) {const data=mockupWorkflowInputSchema.parse(route.request().postDataJSON());assert.equal(data.revision,saved.revision);saved={...saved,revision:saved.revision+1,status:'submitted'};return route.fulfill({json:saved});}
   if(route.request().method()==='PUT'){draftSaveRequests++;const data=route.request().postDataJSON();mockupConfigurationSchema.parse(data.configuration);mockupSelectionSchema.parse(data.selection);assert.equal(data.revision,saved?.revision||0);saved={version:1,status:'draft',updatedAt:new Date().toISOString(),...data,revision:(saved?.revision||0)+1};return route.fulfill({json:saved});}
   return route.fulfill({json:{version:1,enabled:true,editable:!locked,saved,offer}});
 });
 await page.route('**/test-photo.png',route=>route.fulfill({contentType:'image/png',body:photo}));
  const rendererGate=createRendererGate('renderer Custodia');
  releaseRenderer=rendererGate.release;
  await page.route('**/mockups/custodia-v1/viewer.js',async route=>{rendererGate.start();await rendererGate.promise;await route.continue();});
  const rotatingGate=createRendererGate('renderer girevole');
  releaseRotating=rotatingGate.release;
  await page.route('**/mockups/girevole-v4/viewer.js',async route=>{rotatingGate.start();await rotatingGate.promise;await route.continue();});
  await withTimeout('caricamento pagina cliente',()=>page.goto(`http://127.0.0.1:${port}/fotolibro/mockup-test-token`),30000);
  await withTimeout('overlay orientamento iniziale',()=>page.getByTestId('overlay-rotate').waitFor(),TOUCH_TIMEOUT_MS);
 await page.setViewportSize({width:844,height:390});
  await withTimeout('chiusura overlay orientamento',()=>page.getByTestId('overlay-rotate').waitFor({state:'hidden'}),TOUCH_TIMEOUT_MS);
  await touch(page.getByRole('button',{name:'Personalizza album',exact:true}),'apertura configuratore');
 const chooser=page.getByTestId('mockup-model-chooser');
  await withTimeout('apertura scelta modello',()=>chooser.waitFor(),TOUCH_TIMEOUT_MS);
 assert.equal(await page.locator('iframe').count(),0,'Il primo modello non deve partire prima della scelta');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.getByTestId('mockup-rotate').count(),0,'I caroselli sono usabili anche in verticale');
 await page.setViewportSize({width:844,height:390});
  await touch(chooser.getByRole('button',{name:'Modello successivo',exact:true}),'scorrimento modello Plaza');
  await touch(chooser.getByRole('button',{name:'Scopri Plaza',exact:true}),'apertura esempi Plaza');
 assert.equal(await chooser.getAttribute('data-chooser-stage'),'styles');
 assert.equal(await page.locator('iframe').count(),0,'Le varianti sono statiche e non caricano il 3D');
  await touch(chooser.getByTestId('choose-mockup-example-plaque'),'scelta esempio Plaza');
 const frame=page.frameLocator('iframe');
 const tapFrameButton=async(selector='.wizard-primary') => {
    await withTimeout('pulsante iframe Avanti',()=>frame.getByRole('button',{name:'Avanti',exact:true}).waitFor(),TOUCH_TIMEOUT_MS);
    const box=await withTimeout('layout pulsante iframe Avanti',()=>frame.locator(selector).boundingBox(),TOUCH_TIMEOUT_MS);
    if (!box) throw new Error(`Pulsante iframe non disponibile: ${selector}`);
    await withTimeout('tap touch pulsante iframe Avanti',()=>page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2),TOUCH_TIMEOUT_MS);
 };
 const tapFrameTextButton=async(name) => {
    await withTimeout(`pulsante iframe ${name}`,()=>frame.getByRole('button',{name,exact:true}).waitFor(),TOUCH_TIMEOUT_MS);
    const box=await withTimeout(`layout pulsante iframe ${name}`,()=>frame.getByRole('button',{name,exact:true}).boundingBox(),TOUCH_TIMEOUT_MS);
    if (!box) throw new Error(`Pulsante iframe non disponibile: ${name}`);
    await withTimeout(`tap touch pulsante iframe ${name}`,()=>page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2),TOUCH_TIMEOUT_MS);
 };
 const tapCloseButton=async() => {
   const point=await page.evaluate(() => {
     const button=document.querySelector('.mockup-close');
     if (!button) throw new Error('Pulsante chiusura mockup non disponibile');
     const rect=button.getBoundingClientRect();
     return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
   });
    await withTimeout('tap touch chiusura mockup',()=>page.touchscreen.tap(point.x,point.y),TOUCH_TIMEOUT_MS);
 };
  await withTimeout('iframe renderer allegato',()=>page.locator('iframe').waitFor({state:'attached'}),TOUCH_TIMEOUT_MS);
 assert.equal(await page.locator('iframe').isVisible(),false,'Non mostrare il documento autonomo prima che il wizard sia pronto');
  await withTimeout('messaggio preparazione configuratore',()=>page.getByText('Preparazione del tuo configuratore…',{exact:true}).waitFor(),TOUCH_TIMEOUT_MS);
 releaseRotating();
  await waitForRenderer(frame,'renderer girevole pronto');
  await touch(frame.getByRole('button',{name:'Ho capito',exact:true}),'chiusura guida gestuale');
  await withTimeout('applicazione copertina iniziale',()=>page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument.querySelector('#coverLayout')?.value==='plaque',{timeout:RENDERER_TIMEOUT_MS}),RENDERER_TIMEOUT_MS);
 await page.setViewportSize({width:390,height:844});
  await withTimeout('overlay mobile dopo caricamento',()=>page.getByTestId('mockup-rotate').waitFor(),TOUCH_TIMEOUT_MS);
 await page.setViewportSize({width:844,height:390});
  await withTimeout('overlay nascosto in orizzontale',()=>page.getByTestId('mockup-rotate').waitFor({state:'hidden'}),TOUCH_TIMEOUT_MS);
 // L'album mantiene l'intera altezza disponibile: comandi dentro il canvas, azioni nel pannello.
 for (const viewport of [{width:844,height:300},{width:667,height:280},{width:844,height:390}]) {
   await page.setViewportSize(viewport); await page.waitForTimeout(250);
   const stageBox=await frame.locator('.stage').boundingBox(),iframeBox=await page.locator('iframe').boundingBox();
   const modalBox=await page.locator('[data-mobile-mockup=true]').boundingBox();
   assert.ok(Math.abs(modalBox.height-viewport.height)<2,'Il modale usa tutto il viewport visibile');
   assert.ok(stageBox.height>=iframeBox.height-2,`Canvas usa altezza disponibile: ${JSON.stringify(stageBox)}`);
   assert.ok(stageBox.width>=viewport.width*.54 && stageBox.width<=viewport.width*.62,'Anteprima bilanciata con pannello opzioni più largo');
   for(const button of [frame.getByRole('button',{name:'Avanti',exact:true}),frame.getByRole('button',{name:'Torna alla scelta modello',exact:true}),frame.getByRole('button',{name:'Fronte',exact:true})]) {
     const box=await button.boundingBox(); assert.ok(box.height>=44 && box.y>=0 && box.y+box.height<=viewport.height+1,'Controlli raggiungibili senza scroll pagina');
   }
   assert.equal(await page.locator('.mockup-actions').count(),0,'Nessun footer ingombrante sul mobile');
 }
 assert.equal(await frame.locator('details.category[open],details.material-category[open]').count(),0);
  await touch(frame.locator('.category summary,.material-category summary').first(),'apertura famiglia materiali');
 assert.equal(await frame.locator('details.category[open],details.material-category[open]').count(),1);
  await touch(frame.getByRole('button',{name:'Avanti',exact:true}),'passaggio struttura');
  await touch(frame.getByRole('button',{name:'Bianco',exact:true}),'scelta finitura bianca');
 assert.equal(await frame.locator('#frameFinish').inputValue(),'white');
  await touch(frame.getByRole('button',{name:'Avvia o ferma rotazione scrigno',exact:true}),'avvio rotazione scrigno');
 assert.equal(await frame.locator('#rotate').getAttribute('aria-pressed'),'true');
  await touch(frame.getByRole('button',{name:'Estrai o reinserisci album',exact:true}),'estrazione album');
 assert.equal(await frame.locator('body').getAttribute('data-extraction'),'100');
 assert.equal(await frame.locator('#rotate').getAttribute('aria-pressed'),'false');
  await touch(frame.getByRole('button',{name:'Avanti',exact:true}),'passaggio copertina');
  await touch(frame.locator('#firstName'),'selezione nome');await frame.locator('#firstName').fill('Anna');
  await touch(frame.getByRole('button',{name:'Indietro',exact:true}),'ritorno alla struttura');
  await touch(frame.getByRole('button',{name:'Avanti',exact:true}),'ritorno alla copertina');
 assert.equal(await frame.locator('#firstName').inputValue(),'Anna');
 const normalWidth=(await frame.locator('.stage').boundingBox()).width;
 assert.ok((await frame.locator('aside').boundingBox()).width>=300,'Più larghezza per opzioni sul telefono orizzontale');
  await touch(page.getByRole('button',{name:'Espandi anteprima',exact:true}),'espansione anteprima');
 assert.equal(await frame.locator('aside').isVisible(),false);
 assert.ok((await frame.locator('.stage').boundingBox()).width>normalWidth+200);
  await touch(page.getByRole('button',{name:'Torna alle opzioni',exact:true}),'ripristino opzioni');
 assert.equal(await frame.locator('#firstName').inputValue(),'Anna');
 assert.equal(await page.locator('input[type=file]').count(),0);
 assert.equal(await frame.getByLabel('Foto da personalizzare',{exact:true}).count(),0);
 const stageBox=await frame.locator('.stage').boundingBox(),controlsBox=await frame.locator('.wizard-iconbar').boundingBox();
 assert.ok(controlsBox.height<=44 && controlsBox.y+controlsBox.height<=stageBox.y+stageBox.height,'Icone compatte nel canvas');
 // In casa disponibile prima del riepilogo, non altera configurazione o passaggio.
  await touch(page.getByRole('button',{name:'In casa',exact:true}),'apertura scena casa');
 assert.equal(await frame.locator('#homeScene').inputValue(),'sideboard');
 await frame.locator('#homeScene').selectOption('living');
 assert.equal(await frame.locator('#homeFinish option').count(),13);
 await frame.locator('#homeLighting').selectOption('evening');
  await touch(frame.locator('.home-measures summary'),'apertura misure casa');
 await frame.locator('#home-width').fill('180');
 await frame.locator('#home-width').press('Tab');
 assert.equal(await frame.locator('#home-width').inputValue(),'180');
 await frame.locator('#homeAlbumX').fill('60');await frame.locator('#homeAlbumX').dispatchEvent('input');
 assert.equal(await frame.locator('body').getAttribute('data-home-album-position'),'60,0');
  await touch(page.getByRole('button',{name:'Solo album',exact:true}),'chiusura scena casa');
 assert.equal(await frame.locator('body').getAttribute('data-wizard-step'),'4');
 assert.equal(await frame.locator('#firstName').inputValue(),'Anna');
  await touch(page.getByRole('button',{name:'In casa',exact:true}),'riapertura scena casa');
 assert.equal(await frame.locator('#homeScene').inputValue(),'living');
 assert.equal(await frame.locator('#homeLighting').inputValue(),'evening');
 assert.equal(await frame.locator('#home-width').inputValue(),'180');
  await touch(frame.getByRole('button',{name:'Torna a personalizzare',exact:true}),'ritorno personalizzazione');
  await touch(frame.getByRole('button',{name:'Avanti',exact:true}),'passaggio plexiglass');
  await touch(frame.getByRole('button',{name:'Foto a tutta superficie su plexiglass',exact:true}),'scelta foto plexiglass');
  await withTimeout('validazione foto plexiglass',()=>frame.getByText('Manca la foto sul plexiglass.',{exact:false}).waitFor(),TOUCH_TIMEOUT_MS);
 assert.equal(await frame.getByRole('button',{name:'Avanti',exact:true}).isDisabled(),true);
  await touch(frame.getByRole('button',{name:'Scegli dalla galleria',exact:true}),'apertura galleria plexiglass');
 const picker=page.getByRole('dialog',{name:'Scegli la foto del retro',exact:true});
 await picker.waitFor();
 for(const viewport of [{width:667,height:375},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(500);
   const bounds=await picker.boundingBox();
   assert.ok(bounds && bounds.x>=-1 && bounds.y>=-1 && bounds.x+bounds.width<=viewport.width+1 && bounds.y+bounds.height<=viewport.height+1);
    await touch(page.getByTestId('button-picker-next'),`pagina galleria successiva ${viewport.width}x${viewport.height}`);
    await withTimeout('foto galleria finale',()=>page.getByTestId('button-pick-photo-gallery-64').waitFor(),TOUCH_TIMEOUT_MS);
    await touch(page.getByTestId('button-picker-prev'),`pagina galleria precedente ${viewport.width}x${viewport.height}`);
 }
 await page.getByTestId('input-photo-search').fill('Foto');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.getByTestId('mockup-rotate').count(),0);
 assert.equal(await page.getByTestId('overlay-rotate').count(),0);
  await touch(page.getByTestId('button-pick-photo-gallery-one'),'scelta foto dalla galleria');
  await withTimeout('overlay mobile dopo galleria',()=>page.getByTestId('mockup-rotate').waitFor(),TOUCH_TIMEOUT_MS);
 await page.setViewportSize({width:844,height:390});
  await withTimeout('overlay galleria nascosto',()=>page.getByTestId('mockup-rotate').waitFor({state:'hidden'}),TOUCH_TIMEOUT_MS);
  await touch(frame.getByRole('button',{name:'Avanti',exact:true}),'passaggio riepilogo');
  await touch(frame.getByRole('button',{name:'Indietro',exact:true}),'ritorno dal riepilogo');
 assert.equal(await frame.locator('body').getAttribute('data-wizard-step'),'5','Si torna indietro dal riepilogo');
  await touch(frame.getByRole('button',{name:'Avanti',exact:true}),'ritorno al riepilogo');
  await touch(frame.getByRole('button',{name:'Salva bozza',exact:true}),'salvataggio prima bozza');
  await withTimeout('conferma prima bozza',()=>frame.getByText('Mockup salvato.',{exact:false}).waitFor(),TOUCH_TIMEOUT_MS);
 assert.equal(saved.configuration.backPhotoAssetId,photoId);
 assert.equal(saved.configuration.assetRevision,4);
 assert.equal(saved.configuration.engravingNames.first,'Anna');
  await touch(page.getByRole('button',{name:'Chiudi mockup',exact:true}),'chiusura prima bozza');
  await touch(page.getByRole('button',{name:'Recupera bozza',exact:true}),'recupero prima bozza');
 assert.equal(await chooser.count(),0,'La bozza salvata viene recuperata senza tornare alla scelta modello');
  await waitForRenderer(frame,'renderer girevole pronto dopo recupero');
  await touch(frame.getByRole('button',{name:'Invia allo studio',exact:true}),'invio proposta allo studio');
  await withTimeout('conferma invio proposta',()=>frame.getByText('Proposta inviata allo studio per la verifica.',{exact:true}).waitFor(),TOUCH_TIMEOUT_MS);
 assert.equal(saved.status,'submitted');
  await touch(page.getByRole('button',{name:'Chiudi mockup',exact:true}),'chiusura proposta inviata');
  await touch(page.getByRole('button',{name:'Apri il tuo album',exact:true}),'riapertura album');
 assert.equal(await chooser.count(),0,'La riapertura riparte dalla configurazione salvata');
  await waitForRenderer(frame,'renderer girevole pronto dopo invio');
 assert.equal(await frame.locator('.wizard-gesture-guide').count(),0,'La guida iniziale non si ripete nella sessione');
  await touch(page.getByRole('button',{name:'In casa',exact:true}),'esplorazione scena casa');
  await touch(page.getByRole('button',{name:'Solo album',exact:true}),'ritorno al solo album');
 assert.equal(await frame.getByText('Modifiche da salvare',{exact:true}).count(),0,'La sola esplorazione non crea revisioni');
  await touch(frame.getByRole('button',{name:'Avanti',exact:true}),'apertura modifica dopo invio');
  await touch(frame.getByRole('button',{name:'Legno naturale',exact:true}),'scelta legno naturale');
  for(let i=0;i<3;i++) await touch(frame.getByRole('button',{name:'Avanti',exact:true}),`passaggio modifica ${i+1}`);
  await touch(frame.getByRole('button',{name:'Salva bozza',exact:true}),'salvataggio nuova revisione');
  await withTimeout('conferma nuova revisione',()=>frame.getByText('Mockup salvato.',{exact:false}).waitFor(),TOUCH_TIMEOUT_MS);
 assert.equal(saved.revision,3,'Nuova revisione dopo precedente invio, che ha creato la revisione 2');
 // Il cambio modello ritorna ai due caroselli, con renderer esistente nascosto fino alla scelta.
  await touch(page.getByRole('button',{name:'Cambia',exact:true}),'apertura cambio modello');
  await touch(chooser.getByRole('button',{name:'Modello precedente',exact:true}),'scorrimento modello Custodia');
  await touch(chooser.getByRole('button',{name:'Scopri Custodia',exact:true}),'apertura esempi Custodia');
 assert.equal(await chooser.getByTestId('choose-mockup-example-plaque').count(),0,'Nessuna incisione non supportata su Custodia');
  await touch(chooser.getByRole('button',{name:'Esempio successivo',exact:true}),'scorrimento esempi Custodia');
  await touch(chooser.getByTestId('choose-mockup-example-full'),'scelta esempio Custodia');
 assert.equal(await page.locator('iframe').isVisible(),false,'Nascondere il renderer durante il cambio');
 releaseRenderer();
  await waitForRenderer(frame,'renderer Custodia pronto');
  await withTimeout('iframe Custodia visibile',()=>page.locator('iframe').waitFor({state:'visible'}),RENDERER_TIMEOUT_MS);
 // Il frame appena sostituito non espone un bounding box stabile al locator,
 // ma il gesto touch reale deve comunque raggiungere il pulsante.
 await tapFrameButton();
 assert.equal(await frame.locator('body').getAttribute('data-wizard-step'),'4','Custodia non mostra un passaggio struttura vuoto');
  await withTimeout('applicazione copertina Custodia',()=>page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument.querySelector('#coverOptions select')?.value==='full',{timeout:RENDERER_TIMEOUT_MS}),RENDERER_TIMEOUT_MS);
 assert.equal(await frame.locator('#coverUpload').isVisible(),false,'Il selettore di file nativo non riappare in Custodia');
 assert.equal(await frame.locator('label[for=coverUpload]').isVisible(),false);
 await tapFrameTextButton('Scegli dalla galleria');
 const coverPicker=page.getByRole('dialog',{name:'Scegli la foto di copertina',exact:true});
 await coverPicker.waitFor();
  await touch(page.getByTestId('button-pick-photo-gallery-one'),'scelta foto copertina');
 await tapFrameButton();

 // Anche il cambio inverso deve lasciare intatta la bozza Custodia finché
 // l’utente non salva esplicitamente il nuovo modello.
  await touch(frame.getByRole('button',{name:'Salva bozza',exact:true}),'salvataggio Custodia');
  await withTimeout('conferma salvataggio Custodia',()=>frame.getByText('Mockup salvato.',{exact:false}).waitFor(),TOUCH_TIMEOUT_MS);
 assert.equal(saved.selection.modelId,catalog.models[0].id,'La bozza salvata appartiene ancora a Custodia');
  await touch(page.getByRole('button',{name:'Cambia',exact:true}),'riapertura cambio modello');
  await touch(chooser.getByRole('button',{name:'Modello successivo',exact:true}),'ritorno modello Plaza');
  await touch(chooser.getByRole('button',{name:'Scopri Plaza',exact:true}),'riapertura esempi Plaza');
  await touch(chooser.getByTestId('choose-mockup-example-plaque'),'ritorno esempio Plaza');
 assert.equal(await page.locator('iframe').isVisible(),false,'Nascondere il renderer Custodia durante il cambio inverso');
  await waitForRenderer(frame,'renderer girevole pronto dopo cambio inverso');
  await withTimeout('iframe girevole visibile',()=>page.locator('iframe').waitFor({state:'visible'}),RENDERER_TIMEOUT_MS);
 assert.equal(await page.locator('iframe').getAttribute('title'),'Configuratore 3D Album girevole');
 assert.equal(await frame.locator('body').getAttribute('data-wizard-step'),'2','Il cambio inverso apre il pannello Rivestimento');
 assert.equal(saved.selection.modelId,catalog.models[0].id,'Il cambio non sovrascrive la bozza Custodia');
 const revisionBeforeHistoryNavigation=saved.revision;
 const draftSaveRequestsBeforeHistoryNavigation=draftSaveRequests;
 // La cronologia deve ripristinare la bozza persistita anche quando il
 // renderer temporaneo scelto ma non salvato viene smontato e rimontato.
 await page.goto(`http://127.0.0.1:${port}/history-away`);
 await page.getByTestId('history-away').waitFor();
 await page.goBack();
 await page.getByRole('button',{name:'Recupera bozza',exact:true}).waitFor();
 await page.getByRole('button',{name:'Recupera bozza',exact:true}).tap();
 await frame.locator('#wizard-slot').waitFor({timeout:45000});
 assert.equal(await page.locator('iframe').getAttribute('title'),'Configuratore 3D Custodia','Il back ripristina il modello salvato');
 assert.equal(await frame.locator('#coverOptions select').inputValue(),'full','Il back ripristina la configurazione salvata');
 await page.goForward();
 await page.getByTestId('history-away').waitFor();
 await page.goBack();
 await page.getByRole('button',{name:'Recupera bozza',exact:true}).waitFor();
 await page.getByRole('button',{name:'Recupera bozza',exact:true}).tap();
 await frame.locator('#wizard-slot').waitFor({timeout:45000});
 assert.equal(await page.locator('iframe').getAttribute('title'),'Configuratore 3D Custodia','Il forward/back mantiene il modello salvato');
 assert.equal(await frame.locator('#coverOptions select').inputValue(),'full','Il forward/back mantiene la configurazione salvata');
 assert.equal(saved.revision,revisionBeforeHistoryNavigation,'Back e forward recuperano la revisione senza crearne una copia');
 assert.equal(draftSaveRequests,draftSaveRequestsBeforeHistoryNavigation,'Back e forward recuperano la configurazione senza salvare una nuova revisione');
 // Un refresh durante il cambio modello deve ripartire dalla bozza persistita,
 // non dal renderer scelto localmente ma ancora non salvato.
  await withTimeout('refresh durante cambio modello',()=>page.reload(),30000);
  await touch(page.getByRole('button',{name:'Recupera bozza',exact:true}),'recupero bozza dopo refresh');
 assert.equal(await chooser.count(),0,'Il refresh recupera direttamente la bozza salvata');
  await waitForRenderer(frame,'renderer Custodia pronto dopo refresh');
 assert.equal(await page.locator('iframe').getAttribute('title'),'Configuratore 3D Custodia','Il refresh ripristina il modello salvato');
 assert.equal(await frame.locator('#coverOptions select').inputValue(),'full','Il refresh ripristina la configurazione salvata');
 page.once('dialog',dialog=>dialog.accept());
 await tapCloseButton();
  await withTimeout('chiusura iframe dopo dialog',()=>page.waitForFunction(()=>!document.querySelector('iframe'),{timeout:TOUCH_TIMEOUT_MS}),TOUCH_TIMEOUT_MS);
  await touch(page.getByRole('button',{name:'Recupera bozza',exact:true}),'recupero bozza dopo chiusura');
 assert.equal(await chooser.count(),0,'Il recupero mantiene la bozza Custodia');
  await waitForRenderer(frame,'renderer Custodia pronto dopo chiusura');
 assert.equal(await page.locator('iframe').getAttribute('title'),'Configuratore 3D Custodia');
 assert.equal(await frame.locator('#coverOptions select').inputValue(),'full','Il recupero ripristina la copertina Custodia');

 await page.waitForTimeout(500);
 await tapCloseButton();
  await withTimeout('chiusura iframe finale',()=>page.waitForFunction(()=>!document.querySelector('iframe'),{timeout:TOUCH_TIMEOUT_MS}),TOUCH_TIMEOUT_MS);
 locked=true;saved=null;
  await withTimeout('refresh versione bloccata',()=>page.reload(),30000);
  await withTimeout('stato versione bloccata',()=>page.getByText('Nessun mockup salvato da consultare',{exact:true}).waitFor(),TOUCH_TIMEOUT_MS);
 assert.equal(await page.getByRole('button',{name:'Personalizza album',exact:true}).count(),0,'In stampa senza mockup non propone una nuova bozza');
 assert.equal(await page.locator('iframe').count(),0);
 assert.deepEqual(errors,[]);console.log(`Touch ${engine} OK: caroselli, nessun flash studio, layout ridotto, galleria ruotata, In casa, salvataggi e riapertura.`);
 } catch(error) {
  console.error(`[mockup-touch] FALLITO durante "${phase}": ${error.message}`);
  console.error(`[mockup-touch] ${await pageDiagnostics()}`);
  throw error;
 } finally {
  clearTimeout(watchdog);
  releaseRenderer?.();releaseRotating?.();
  await closeWithTimeout('browser',()=>browser?.close());
  await closeWithTimeout('vite',()=>vite?.close());
 }
