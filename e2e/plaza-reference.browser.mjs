import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
const root = path.resolve('client/public');
const output = path.resolve(process.env.PLAZA_SCREENSHOT_DIR || '../work/plaza-check'); fs.mkdirSync(output,{recursive:true});
const server = http.createServer((req,res)=> {
  if(req.url==='/plaza-harness.html'){res.setHeader('Content-Type','text/html');res.end('<html><body><script>window.messages=[];addEventListener("message",e=>window.messages.push(e.data));</script><iframe src="/mockups/plaza-v2/index.html" style="width:100%;height:800px"></iframe></body></html>');return;}
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file,(error,data)=>{ if(error){ res.writeHead(404).end(); return; } res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');res.end(data); });
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser = await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : {}),args:['--enable-unsafe-swiftshader']});
 try {
 const page = await browser.newPage({viewport:{width:1400,height:1050}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=`http://127.0.0.1:${server.address().port}/mockups/plaza-v2/index.html`;
 await page.goto(url); await page.waitForFunction(()=>document.body.dataset.ready==='true');
 const nobili = JSON.parse(fs.readFileSync(path.join(root, 'mockups/i-nobili/catalog.json'), 'utf8'));
 assert.equal(await page.locator('[data-finish]:not([hidden])').count(), 86);
 const original = await page.evaluate(async () => (await import('./viewer.js')).configuration());
 await page.locator('#fabricTarget').selectOption('inner');
 const innerChoice = nobili.variants.find(v => v.supplierCode === 'H76');
 await page.locator('details.category').filter({ has: page.locator(`[data-finish="${innerChoice.id}"]`) }).locator('summary').click();
 await page.locator(`[data-finish="${innerChoice.id}"]`).click();
 await page.waitForFunction(() => !document.getElementById('downloadClient').disabled);
 const separate = await page.evaluate(async () => {
   const m = await import('./viewer.js');
   return { c: m.configuration(), matching: m.album.getObjectByName('Retro tessuto album').material.map === m.fixedFrame.children[0].material.map,
     independent: m.mobileFrame.getObjectByName('Traversa mobile superiore').material.map !== m.fixedFrame.children[0].material.map };
 });
 assert.equal(separate.c.materialId, original.materialId); assert.equal(separate.c.innerMaterialId, innerChoice.id); assert(separate.matching && separate.independent);
 await page.locator('#sampleButton').click(); await page.locator('#sampleImage').evaluate(img => img.decode());
 assert((await page.locator('#sampleTitle').textContent()).includes('H76'));
 await page.locator('#sampleClose').click();
 await page.locator(`[data-finish="${original.materialId}"]`).click();
 await page.waitForFunction(() => !document.getElementById('downloadClient').disabled);
 await page.getByRole('button', { name: 'In casa', exact: true }).click();
 await page.locator('#homeScene').selectOption('sideboard'); await page.locator('#homeLighting').selectOption('evening');
 await page.locator('#homeProductLed').uncheck(); assert(!(await page.locator('#ledEnabled').isChecked()));
 await page.locator('#homeProductLed').check(); assert(await page.locator('#ledEnabled').isChecked());
 await page.locator('#homeScene').selectOption('none');
 await page.getByRole('button', { name: 'Tessuti', exact: true }).click();
 console.log('86 Nobili samples, independent fabrics, original sample and home LED: PASS');
 // Local synthetic photo for screenshots; no customer images are uploaded or embedded in source.
 const demo=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="#adc4cf"/><stop offset="1" stop-color="#ead9b6"/></linearGradient></defs><path fill="url(#s)" d="M0 0h1200v900H0z"/><circle cx="830" cy="200" r="90" fill="#fff3d4"/><path fill="#889b85" d="M0 500L240 320 540 600 880 390 1200 560V900H0z"/><path fill="#b5a078" d="M0 710Q500 500 1200 800V900H0z"/></svg>')).png().toBuffer();
 await page.locator('#coverUpload').setInputFiles({name:'Paesaggio dimostrativo.png',mimeType:'image/png',buffer:demo});
 await page.locator('#backUpload').setInputFiles({name:'Paesaggio dimostrativo.png',mimeType:'image/png',buffer:demo});
 await page.waitForFunction(()=>!document.getElementById('downloadClient').disabled);
 await page.evaluate(()=>{ for(const [id,value] of [['firstName','Anna'],['secondName','Marco']]){const n=document.getElementById(id);n.value=value;n.dispatchEvent(new Event('input'));} });
 const measurements=await page.evaluate(async()=>{
  const m=await import('./viewer.js');const T=await import('three');
  const fire=(id,value,event='input')=>{const n=document.getElementById(id);n.value=value;n.dispatchEvent(new Event(event));};
  fire('rotation',0);m.product.updateMatrixWorld(true);
  const bookBox=new T.Box3().setFromObject(m.album),caseBox=new T.Box3().setFromObject(m.mobileFrame);
  const result={center:bookBox.getCenter(new T.Vector3()).x,frontGlass:!!m.mobileFrame.getObjectByName('Plexiglass anteriore scrigno'),rearParent:m.rearPhoto.parent===m.mobileFrame,plaqueVisible:m.plaque.visible,photoX:m.cover.position.x};
  result.frameOptions=Array.from(document.getElementById('frameFinish').options,o=>o.value);
  result.matchingMaterial=m.fixedFrame.getObjectByName('Traversa esterna superiore').material.map===m.album.getObjectByName('Copertina tessuto album').material.map;
  result.outerOpen=!m.fixedFrame.getObjectByName('Montante esterno destro');
  result.namePlates=m.namePlates.map(p=>({name:p.group.userData.nameText,onCase:p.group.parent===m.mobileFrame}));
  const upper=m.mobileFrame.getObjectByName('Traversa mobile superiore');
  result.upperRailEnd=upper.position.x+upper.geometry.parameters.width/2;
  result.upperNameX=m.namePlates[0].group.position.x;
  const frontGlass=m.mobileFrame.getObjectByName('Plexiglass anteriore scrigno');
  frontGlass.geometry.computeBoundingBox();result.glassRight=frontGlass.geometry.boundingBox.max.x;
  result.recess=upper.position.y-upper.geometry.parameters.height/2-bookBox.max.y+m.mobilePivot.position.y;
  // Every rotating-case corner clears the left LED and right fixed upright.
  let min=Infinity,max=-Infinity;for(let a=0;a<=180;a+=5){fire('rotation',a);m.product.updateMatrixWorld(true);const b=new T.Box3().setFromObject(m.mobileFrame);min=Math.min(min,b.min.x);max=Math.max(max,b.max.x);}result.sweep=[min,max];
  fire('rotation',0);const rearBefore=m.rearPhoto.getWorldPosition(new T.Vector3()).toArray();
  fire('extract',100);m.product.updateMatrixWorld(true);result.extraction=m.album.position.x;result.extractionRotation=document.body.dataset.rotation;
  fire('extract',0);fire('rotation',0);m.product.updateMatrixWorld(true);result.rearRestored=rearBefore.every((v,i)=>Math.abs(v-m.rearPhoto.getWorldPosition(new T.Vector3()).toArray()[i])<1e-8);
  fire('coverLayout','photo-plaque','change');result.smallScale=m.cover.scale.x;fire('coverLayout','full','change');result.fullScale=m.cover.scale.x;
  result.photoNamesVisible=!document.getElementById('engravingControls').hidden;
  document.getElementById('spine').click();result.nameView=document.body.dataset.rotation;
  fire('backCover','fabric','change');result.transparentGlass=!!m.mobileFrame.getObjectByName('Plexiglass posteriore scrigno').visible && !m.rearPhoto.visible;
  fire('backCover','photo','change');fire('coverLayout','split-photo-fabric','change');fire('rotation',28);document.getElementById('front').click();
  return result;
 });
 assert.deepEqual(measurements.frameOptions,['fabric']);assert(measurements.matchingMaterial);
 assert(Math.abs(measurements.center)<.006);assert(measurements.frontGlass && measurements.rearParent && measurements.plaqueVisible && measurements.rearRestored && measurements.transparentGlass);
 assert(measurements.outerOpen && measurements.photoNamesVisible && measurements.recess>0);
 assert(Math.abs(measurements.upperRailEnd)<1e-6 && measurements.upperNameX<.002 && measurements.glassRight>.23);
 assert.deepEqual(measurements.namePlates,[{name:'Anna',onCase:true},{name:'Marco',onCase:true}]);assert.equal(measurements.nameView,'-90');
 assert(measurements.photoX>0);assert(measurements.sweep[0]>-.2404 && measurements.sweep[1]<.244);assert.equal(measurements.extraction,.46);assert.equal(measurements.extractionRotation,'90');assert(measurements.smallScale<measurements.fullScale);
 console.log('Geometry and cover checks:',JSON.stringify(measurements));
 await page.addStyleTag({content:'body,main,.workspace,.stage{width:100vw!important;height:100vh!important;min-height:0!important;margin:0!important;padding:0!important;display:block!important}header,aside,.tools,.hint,.badge{display:none!important}.stage{position:fixed!important;inset:0!important}#viewport{width:100%!important;height:100%!important}'});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 for (const [name,angle,side,extraction] of [['plaza-led-front',0,'front',0],['plaza-led-rotated',38,'front',0],['plaza-led-back',-25,'back',0],['plaza-led-side',-90,'front',0],['plaza-led-extracted',90,'front',100]]){
  await page.evaluate(({angle,side,extraction})=>{const fire=(id,v)=>{const n=document.getElementById(id);n.value=v;n.dispatchEvent(new Event('input'));};fire('extract',extraction);fire('rotation',angle);document.getElementById(side).click();},{angle,side,extraction});
  await page.evaluate(()=>new Promise(resolve=>{let n=20;function step(){--n?requestAnimationFrame(step):resolve();}requestAnimationFrame(step);}));
  await page.screenshot({path:path.join(output,name+'.png')});
 }
 // Use actual renderer snapshots for the model chooser.
 await page.evaluate(()=>{const e=document.getElementById('extract');e.value=0;e.dispatchEvent(new Event('input'));const r=document.getElementById('rotation');r.value=28;r.dispatchEvent(new Event('input'));document.getElementById('front').click();});
 for(const layout of process.argv.includes('--update-examples') ? ['full','plaque','photo-plaque','split-photo-fabric'] : []){
  await page.evaluate(value=>{const n=document.getElementById('coverLayout');n.value=value;n.dispatchEvent(new Event('change'));},layout);
  await page.evaluate(()=>new Promise(resolve=>{let n=16;function step(){--n?requestAnimationFrame(step):resolve();}requestAnimationFrame(step);}));
  await sharp(await page.screenshot()).resize({width:900}).webp({quality:87}).toFile(path.join(root,'mockups/examples',`plaza-${layout}.webp`));
 }
 await page.evaluate(()=>{document.getElementById('ledEnabled').checked=false;document.getElementById('ledEnabled').dispatchEvent(new Event('change'));});
 const exportResult=await page.evaluate(async()=>{const m=await import('./viewer.js');const images=await m.previews();return {count:images.length,led:document.getElementById('ledEnabled').checked,valid:images.every(i=>i.image.startsWith('data:image/jpeg;base64,'))};});
 assert.deepEqual(exportResult,{count:8,led:false,valid:true}); assert.deepEqual(errors,[]);
 console.log('8 export views, LED restoration and browser errors: PASS');
 const embedded=await browser.newPage();
 await embedded.goto(url.replace('/mockups/plaza-v2/index.html','/plaza-harness.html'));
 await embedded.waitForFunction(()=>window.messages.some(m=>m.type==='ready'));
 const child=embedded.frames()[1];
 const config=await child.evaluate(async()=>{const m=await import('./viewer.js');return {...m.configuration(),coverLayout:'plaque',assetRevision:1,frameFinish:'wood',ledEnabled:false,engravingNames:{first:'Anna',second:'Marco'}};});
 await embedded.evaluate(configuration=>document.querySelector('iframe').contentWindow.postMessage({channel:'memorie-mockup-v1',type:'apply',configuration},location.origin),config);
 await embedded.waitForFunction(()=>window.messages.some(m=>m.type==='applied'));
 assert.equal(await child.evaluate(()=>document.getElementById('ledEnabled').checked),false);
 assert.equal(await child.evaluate(async()=>(await import('./viewer.js')).configuration().frameFinish),'fabric');
 assert.equal(await child.evaluate(async()=>(await import('./viewer.js')).configuration().assetRevision),1);
 await child.evaluate(()=>{document.getElementById('firstName').value='Lucia';document.getElementById('firstName').dispatchEvent(new Event('input'));});
 assert.equal(await child.evaluate(async()=>(await import('./viewer.js')).configuration().assetRevision),2);
 await embedded.evaluate(()=>{window.messages=[];document.querySelector('iframe').contentWindow.postMessage({channel:'memorie-mockup-v1',type:'export',requestId:'reference-check'},location.origin);});
 await embedded.waitForFunction(()=>window.messages.some(m=>m.type==='exported'));
 assert.equal(await embedded.evaluate(()=>window.messages.filter(m=>m.type==='change').length),0);
 assert.equal(await child.evaluate(()=>document.getElementById('ledEnabled').checked),false);
 await embedded.close();
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await mobile.goto(url);await mobile.waitForFunction(()=>document.body.dataset.ready==='true');
 assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mobile.locator('[data-panel="detailPanel"]').tap();await mobile.locator('[data-detail-tab="coverPanel"]').tap();
 await mobile.locator('#coverLayout').selectOption('photo-plaque');
 assert.equal(await mobile.getAttribute('body','data-cover-layout'),'photo-plaque');
 await mobile.setViewportSize({width:844,height:390});
 assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mobile.close();
 console.log('Legacy configuration, v2 edit, embedded export isolation and mobile controls: PASS');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
