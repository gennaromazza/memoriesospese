import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const slot = { start: '2030-12-01T09:00:00.000Z', end: '2030-12-01T09:30:00.000Z', startTime: '10:00', endTime: '10:30' };
const browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let captured = false;
const calls = { hold: 0, capture: 0, release: 0 };
const receipt = { bookingId: 'hold-test', paypalOrderId: 'ORDER-TEST', paypalCaptureId: 'CAPTURE-TEST',
  amountCents: 2000, currency: 'EUR', status: 'paid', bookingConfirmed: true, duplicate: false };
const view = () => ({ bookingId: 'hold-test', campaignId: 'campaign-test', status: 'active',
  depositAmountCents: 2000, currency: 'EUR', expiresAt: new Date(Date.now() + 600_000).toISOString(),
  serverTime: new Date().toISOString(), dataShootingInizio: slot.start, dataShootingFine: slot.end });
// These intercepts exist in this browser only. No app bypass, provider traffic, or database writes.
await page.route('**/api/**', route => {
  if (route.request().method() !== 'GET') return route.fulfill({ status: 200, json: { ok: true } });
  return route.continue();
});
await page.route('https://www.paypal.com/**', route => route.abort());
await page.route('**/google.firestore.v1.Firestore/Write/**', route => route.abort());
await page.route('**/src/lib/booking-campaigns.ts*', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + `
getCampaignByCode = async () => ({ id:'campaign-test', code:'TESTCODE', nome:'Prenotazione di prova',
descrizione:'Verifica del flusso con acconto', dataInizio:new Date(2030,11,1),dataFine:new Date(2030,11,3),
durataShootingMinuti:30,prodottiDisponibili:['product-test'],attiva:true,richiedeApprovazione:false,
richiedeAcconto:true,accontoImportoCentesimi:2000 });` });
});
await page.route('**/src/lib/products.ts*', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + `
getAllProducts = async () => [{id:'product-test',nome:'Shooting fotografico',prezzo:50,prezzoFinale:50,
sconto:0,numeroFoto:5,immagini:[],attivo:true}];` });
});
await page.route('**/src/features/gift-cards/GiftCardPayPalButtons.tsx*', route => route.fulfill({
  contentType: 'application/javascript', body: `import React from '/node_modules/.vite/deps/react.js';
export function GiftCardPayPalButtons(p) { return React.createElement('button', {type:'button',
disabled:!p.enabled,'data-testid':'browser-pay',style:{width:'100%',padding:16,background:'#ffc439',color:'#111',borderRadius:6},
onClick:async()=>{try{await p.onApprove(await p.createOrder())}catch(e){p.onError(e.message)}}},'Pagamento PayPal simulato'); }`,
}));
await page.route('**/api/booking/**', async route => {
  const path = new URL(route.request().url()).pathname;
  let json;
  if (path.endsWith('/available-slots')) json = { slots: [slot] };
  else if (path.endsWith('/paypal/config')) json = { enabled: true, clientId: 'test-only', currency: 'EUR', environment: 'sandbox' };
  else if (path.endsWith('/checkout-holds')) {
    calls.hold++; const input = route.request().postDataJSON();
    assert(!('amountCents' in input)); assert(!('depositAmountCents' in input));
    json = { ...view(), token: '1'.repeat(64) };
  } else if (path.endsWith('/paypal-order')) {
    assert.deepEqual(Object.keys(route.request().postDataJSON()), ['token']);
    json = { bookingId: 'hold-test', paypalOrderId: 'ORDER-TEST', depositAmountCents: 2000, currency: 'EUR', expiresAt: view().expiresAt };
  } else if (path.endsWith('/paypal-capture')) {
    calls.capture++; captured = true;
    assert.deepEqual(Object.keys(route.request().postDataJSON()), ['token']);
    json = receipt;
  } else if (path.endsWith('/paypal-status')) {
    json = { bookingId: 'hold-test', status: captured ? 'paid' : 'unpaid', dataShootingInizio: slot.start,
      dataShootingFine: slot.end, ...(captured ? { payment: receipt } : {}) };
  } else if (path.endsWith('/resume')) json = view();
  else if (path.endsWith('/release')) { calls.release++; json = { bookingId: 'hold-test', status: 'cancelled' }; }
  else { await route.fulfill({ status: 500, json: { error: 'Unexpected test route' } }); return; }
  await route.fulfill({ status: 200, json });
});
try {
  await page.goto('http://127.0.0.1:80/prenota/TESTCODE', { waitUntil: 'domcontentloaded' });
  const cookies = page.getByRole('button', { name: 'Solo Necessari', exact: true });
  if (await cookies.isVisible({ timeout: 3000 }).catch(() => false)) await cookies.click();
  await page.getByTestId('date-2030-12-01').click({ timeout: 30000 });
  await page.getByTestId('slot-10:00').click();
  await page.getByTestId('input-nome').fill('Cliente');
  await page.getByTestId('input-cognome').fill('Prova');
  await page.getByTestId('input-email').fill('cliente@example.com');
  await page.getByTestId('input-whatsapp').fill('+390000000000');
  await page.getByTestId('checkbox-privacy-consent').click();
  await page.getByTestId('button-submit-booking').click();
  await page.getByTestId('browser-pay').waitFor();
  await page.waitForTimeout(400);
  assert(await page.getByTestId('booking-deposit-amount').textContent().then(text => text.includes('20,00')));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, 'mobile horizontal overflow');
  const card = await page.getByTestId('booking-deposit-checkout').boundingBox();
  assert(card && card.x >= 0 && card.x + card.width <= 390, 'checkout stays in mobile viewport');
  await fs.mkdir('generated-artifacts/booking-checkout', { recursive: true });
  await page.screenshot({ path: 'generated-artifacts/booking-checkout/mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'generated-artifacts/booking-checkout/desktop.png', fullPage: true });
  await page.getByTestId('browser-pay').click();
  await page.getByTestId('booking-outcome').waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('booking-outcome').waitFor();
  await page.getByTestId('button-new-paid-booking').click();
  await page.getByTestId('date-2030-12-01').waitFor();
  assert.deepEqual(calls, { hold: 1, capture: 1, release: 0 });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ outcome: 'passed', mobile: '390x844 without overflow', desktop: '1280x900',
    receiptAfterReload: true, calls, browserErrors: errors.length }));
} finally { await browser.close(); }
