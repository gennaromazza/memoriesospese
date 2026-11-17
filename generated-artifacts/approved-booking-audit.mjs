import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] });
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const results = [];
await fs.mkdir('generated-artifacts/approved-booking', { recursive: true });
try {
  for (const [name, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const bookingId = 'approved-browser-test', token = '1'.repeat(64);
    let captured = false;
    const calls = { hold: 0, capture: 0, release: 0, config: 0, status: 0 };
    const start = '2030-12-01T09:00:00.000Z', end = '2030-12-01T09:30:00.000Z';
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const view = () => ({ bookingId, campaignId: 'campaign-test', flow: 'approved', status: 'active', depositAmountCents: 2500,
      currency: 'EUR', expiresAt, serverTime: new Date().toISOString(), dataShootingInizio: start, dataShootingFine: end });
    const receipt = { bookingId, paypalOrderId: 'ORDER-TEST', paypalCaptureId: 'CAPTURE-TEST',
      amountCents: 2500, currency: 'EUR', status: 'paid', bookingConfirmed: true, duplicate: false };
    // Browser-only mocks: no provider traffic, real writes, email or authentication bypass.
    await page.route('**/api/**', route => route.request().method() !== 'GET'
      ? route.fulfill({ status: 200, json: { ok: true } }) : route.continue());
    await page.route('https://www.paypal.com/**', route => route.abort());
    await page.route('**/google.firestore.v1.Firestore/Write/**', route => route.abort());
    await page.route('**/src/features/gift-cards/GiftCardPayPalButtons.tsx*', route => route.fulfill({
      contentType: 'application/javascript', body: `import React from '/node_modules/.vite/deps/react.js';
export function GiftCardPayPalButtons(p) { const b=(id,label,action)=>React.createElement('button',
{key:id,type:'button',disabled:!p.enabled,'data-testid':id,onClick:action,
style:{width:'100%',padding:12,marginBottom:6,background:'#ffc439',color:'#111',borderRadius:6}},label);
return React.createElement('div',null,
b('browser-pay','PayPal simulato',async()=>{try{await p.onApprove(await p.createOrder())}catch(e){p.onError(e.message)}}),
b('browser-cancel','Annulla PayPal',()=>p.onCancel()),
b('browser-error','Simula errore SDK',()=>p.onError('SDK non disponibile'))); }`,
    }));
    await page.route('**/api/booking/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let json;
      if (path.endsWith('/paypal/config')) { calls.config++; json = { enabled: true, clientId: 'test-only', currency: 'EUR', environment: 'sandbox' }; }
      else if (path.endsWith('/paypal-status')) {
        calls.status++;
        assert.deepEqual(route.request().postDataJSON(), { token });
        json = { bookingId, campaignId: 'campaign-test', flow: 'approved', status: captured ? 'paid' : 'unpaid',
          dataShootingInizio: start, dataShootingFine: end, ...(captured ? { payment: receipt } : {}) };
      } else if (path.endsWith('/resume')) json = view();
      else if (path.endsWith('/paypal-order')) {
        assert.deepEqual(route.request().postDataJSON(), { token });
        json = { bookingId, paypalOrderId: 'ORDER-TEST', depositAmountCents: 2500, currency: 'EUR', expiresAt };
      } else if (path.endsWith('/paypal-capture')) {
        assert.deepEqual(route.request().postDataJSON(), { token });
        calls.capture++; captured = true; json = receipt;
      } else if (path.endsWith('/release')) { calls.release++; json = { bookingId, status: 'cancelled' }; }
      else if (path.endsWith('/checkout-holds')) { calls.hold++; json = { ...view(), token }; }
      else { return route.fulfill({ status: 500, json: { error: 'Unexpected mocked route' } }); }
      await route.fulfill({ status: 200, json });
    });
    await page.goto(`${base}/prenota/acconto/${bookingId}#${token}`, { waitUntil: 'domcontentloaded' });
    const cookie = page.getByRole('button', { name: 'Solo Necessari', exact: true });
    try { await cookie.waitFor({ state: 'visible', timeout: 3500 }); await cookie.click(); } catch { /* Banner not always shown. */ }
    await page.getByTestId('browser-pay').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(calls.hold, 0);
    assert.equal(calls.capture, 0);
    assert.equal(await page.getByTestId('button-cancel-booking-payment').count(), 0);
    assert.match(await page.getByTestId('booking-deposit-checkout').innerText(), /(?:60:00|59:\d{2})/);
    assert.match(await page.getByTestId('booking-deposit-amount').innerText(), /25,00/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.screenshot({ path: `generated-artifacts/approved-booking/${name}.png`, fullPage: true });
    await page.getByTestId('browser-cancel').click();
    await page.getByText(/Hai annullato il pagamento PayPal, non la prenotazione/).waitFor();
    assert.equal(calls.release, 0);
    await page.getByTestId('browser-error').click();
    await page.getByTestId('button-retry-booking-paypal').click();
    await page.getByTestId('browser-pay').click();
    await page.getByTestId('approved-deposit-receipt').waitFor();
    assert.equal(calls.capture, 1);
    const configBeforeReload = calls.config;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('approved-deposit-receipt').waitFor({ timeout: 30000 });
    assert.equal(calls.capture, 1);
    assert.equal(calls.config, configBeforeReload);
    assert.equal(calls.hold, 0);
    assert.equal(calls.release, 0);
    assert.deepEqual(errors, []);
    results.push({ viewport: name, passed: true, ...calls });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
