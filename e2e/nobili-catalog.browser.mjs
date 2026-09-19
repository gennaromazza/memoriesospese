import fs from 'node:fs';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createMockupHarnessServer } from './mockup-harness/vite-server.mjs';
const vite=await createMockupHarnessServer();await vite.listen();
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : {})});
try {
for(const nobili of [false,true]){
 const page=await browser.newPage({viewport:{width:360,height:800}});
 await page.route('**/api/labs/lab/mockup-catalog',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({revision:0,materials:[],models:[]})}));
 await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/?admin&catalog${nobili?'&nobili':''}`);
 await page.getByText('Campionario del laboratorio (0)',{exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Importa i Nobili · 86 campioni e Plaza LED'}).count(),nobili?1:0);
 await page.getByRole('button',{name:'Aggiungi modello',exact:true}).click();
 assert.equal(await page.locator('select option[value="plaza-led"]').count(),nobili?1:0);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.close();console.log(`PASS catalog UI: ${nobili?'i Nobili':'other company'}, model visibility and mobile overflow`);
}
}finally{await browser.close();await vite.close();}
