import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { chromium } from '@playwright/test';
const root=path.resolve('client/public');
const wizard=ts.transpileModule(fs.readFileSync('client/src/components/photobook/mockup-wizard-layout.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const server=http.createServer((req,res)=>{if(req.url==='/wizard-audit.js'){res.setHeader('Content-Type','text/javascript');return res.end(wizard);}const f=path.resolve(root,'.'+req.url.split('?')[0]);if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.png':'image/png','.webp':'image/webp'})[path.extname(f)]||'application/octet-stream');res.end(data);});});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : {}),args:['--enable-unsafe-swiftshader']});
try{
for(const [width,height,mobile] of [[360,800,true],[390,844,true],[844,390,true],[768,1024,false],[1366,900,false]]){
 const page=await browser.newPage({viewport:{width,height},screen:{width,height},isMobile:mobile,hasTouch:mobile});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/mockups/plaza-v2/index.html`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 await page.evaluate(async mobile=>{const {installMockupWizard}=await import('/wizard-audit.js');window.auditWizard=installMockupWizard(document,mobile);window.auditWizard.onFamilySelect(f=>window.auditWizard.step(f==='back-to-families'?2:3));window.auditWizard.step(2);},mobile);
 assert.equal(await page.locator('.wizard-family-card:visible').count(),9);
 for(const step of [2,3,4,5,6,7,9]){
  await page.evaluate(s=>window.auditWizard.step(s),step);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Horizontal overflow ${width} step ${step}`);
  const canvas=await page.locator('#viewport').boundingBox();assert(canvas.width>100 && canvas.height>60,`Canvas missing ${width} step ${step}`);
 }
 await page.evaluate(()=>window.auditWizard.step(3));await page.locator('#fabricTarget').selectOption('inner');await page.locator('#sampleButton').click();
 const dialog=await page.locator('#sampleDialog').boundingBox();assert(dialog.x>=0 && dialog.x+dialog.width<=width+1,`Dialog overflow ${width}`);
 await page.locator('#sampleClose').click();assert(await page.locator('#fabricTarget').isVisible());
 await page.evaluate(()=>window.auditWizard.home(true));assert(await page.locator('#homeProductLed').isVisible());await page.locator('#homeProductLed').uncheck();assert(!(await page.locator('#ledEnabled').isChecked()));
 await page.evaluate(()=>window.auditWizard.home(false));
 assert.deepEqual(errors,[]);console.log(`PASS embedded wizard ${width}x${height}: families, steps, sample, home, overflow`);
 if(width===390){await page.screenshot({path:'../outputs/plaza-audit-mobile.png'});}
 await page.close();
}
for (const renderer of ['girevole-v4', 'custodia-v1']) {
 const page=await browser.newPage({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true});
 await page.goto(`http://127.0.0.1:${server.address().port}/mockups/${renderer}/index.html`);
 await page.locator('.panel-content').waitFor();
 await page.evaluate(async()=>{const {installMockupWizard}=await import('/wizard-audit.js');window.auditWizard=installMockupWizard(document,true);window.auditWizard.step(2);});
 assert(await page.locator('.wizard-family-card:visible').count()>0);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.evaluate(()=>window.auditWizard.home(true));assert(await page.locator('#homePanel').isVisible());
 await page.evaluate(()=>window.auditWizard.home(false));assert(await page.locator('#fabricPanel').isVisible());
 await page.close();console.log(`PASS shared layout regression ${renderer}`);
}
}finally{await browser.close();server.close();}
