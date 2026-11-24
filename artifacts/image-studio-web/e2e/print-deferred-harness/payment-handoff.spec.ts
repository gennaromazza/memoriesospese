import { test, expect, type Page } from '@playwright/test';
import { draftOrder } from '../../src/components/print-shop/deferred-payment.test-fixtures';

async function fixture(page: Page, blocked = false) {
  let order: any = draftOrder();
  let failAuthorization = true;
  const requests: Array<{ action: string; body: any }> = [];
  const unexpected: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  if (blocked) {
    order.manualAcceptanceEligibility = { canAccept: false, reason: 'Originali scaduti: crea un nuovo ordine.' };
    order.deferredPaymentEligibility = { canAuthorize: false, reason: 'Originali scaduti: crea un nuovo ordine.' };
  }
  await page.context().route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4192') {
      unexpected.push(url.href);
      return route.abort();
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const json = (body: any, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const action = url.pathname.split('/').pop()!;
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      requests.push({ action, body });
      if (blocked || !body.confirmed || !body.note?.trim()) return json({ message: 'Operazione non consentita' }, 409);
      if (action === 'accept-draft') {
        order = { ...order, fulfillment: { ...order.fulfillment, status: 'awaiting_payment' },
          printShop: { ...order.printShop, adminAcceptance: { acceptedAt: '2026-11-17', note: body.note } },
          manualAcceptanceEligibility: { canAccept: false },
          deferredPaymentEligibility: { canAuthorize: true } };
      } else if (action === 'deferred-payment') {
        if (failAuthorization) { failAuthorization = false; return json({ message: 'Provider simulato non disponibile: riprova' }, 503); }
        order = { ...order, payment: { status: 'deferred', method: 'pay_on_delivery', collectedCents: 0, dueCents: 1500 },
          fulfillment: { ...order.fulfillment, status: 'submitted' },
          deferredPaymentEligibility: { canAuthorize: false } };
      } else {
        unexpected.push(url.pathname);
        return json({ message: 'Unexpected mutation refused' }, 400);
      }
      return json({ order });
    }
    if (action === 'financial-report') return json({ orders: [] });
    if (action === 'orders') return json({ orders: [order] });
    if (action === 'offline-draft') return json({ order });
    if (action === 'lab-shipments') return json({ shipments: [] });
    unexpected.push(url.pathname);
    return json({ message: 'Unexpected API refused' }, 400);
  });
  return { requests, unexpected, errors };
}

async function openLab(page: Page) {
  const detail = page.getByRole('dialog', { name: 'ST-TEST-50', exact: true });
  const prepare = detail.getByRole('button', { name: 'Prepara invio' });
  await prepare.scrollIntoViewIfNeeded();
  await prepare.click();
  return page.getByRole('dialog', { name: 'Prepara il laboratorio', exact: true });
}

test('15 €/50 stampe: mouse, tastiera, recupero errore e riapertura senza incasso', async ({ page }, testInfo) => {
  const f = await fixture(page);
  await page.goto('/?printOrderId=offline-draft&labFixture=1');
  let lab = await openLab(page);
  await expect(lab.getByRole('button', { name: 'Prepara trasferimento' })).toBeDisabled();
  await lab.getByRole('button', { name: 'Vai all’azione di pagamento' }).click();
  let action = page.getByRole('dialog', { name: 'Accettare l’ordine su richiesta del cliente?' });
  await expect(action).toBeVisible();
  await expect(lab).not.toBeVisible();
  await expect(action.getByTestId('input-deferred-note')).toBeFocused();
  await expect(action.getByTestId('manual-acceptance-summary')).toContainText('50 copie');
  await expect(action.getByTestId('button-confirm-deferred-action')).toBeDisabled();
  await action.getByTestId('input-deferred-note').fill('Cliente conferma al telefono, saldo al ritiro');
  await action.getByTestId('checkbox-confirm-deferred').check();
  await action.getByTestId('button-confirm-deferred-action').click();
  await expect(action).not.toBeVisible();
  await expect(page.getByTestId('text-admin-acceptance')).toBeVisible();
  await expect(page.getByTestId('button-authorize-deferred')).toBeFocused();

  // Repeat the long-detail handoff using only the keyboard to activate it.
  lab = await openLab(page);
  await lab.getByRole('button', { name: 'Vai all’azione di pagamento' }).focus();
  await page.keyboard.press('Enter');
  action = page.getByRole('dialog', { name: 'Autorizzare il pagamento alla consegna?' });
  await expect(action.getByTestId('input-deferred-note')).toBeFocused();
  await page.keyboard.type('Pagamento al ritiro autorizzato, nessun incasso');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(action.getByTestId('checkbox-confirm-deferred')).toBeChecked();
  await page.keyboard.press('Tab'); // Cancel
  await page.keyboard.press('Tab'); // Confirm
  await page.keyboard.press('Enter');
  await expect(action.getByRole('alert')).toContainText('Provider simulato non disponibile');
  await expect(page.getByTestId('button-accept-draft')).toHaveCount(0);
  await expect(action.getByTestId('button-confirm-deferred-action')).toBeEnabled();
  await action.getByTestId('button-confirm-deferred-action').click();
  await expect(action).not.toBeVisible();
  const panel = page.getByTestId('panel-payment');
  await expect(panel.getByTestId('text-payment-status')).toContainText('Pagamento alla consegna');
  await expect(panel.locator('dl > div').filter({ has: page.getByText('Incassato', { exact: true }) })).toContainText('0,00');
  await expect(panel.locator('dl > div').filter({ has: page.getByText('Da incassare', { exact: true }) })).toContainText('15,00');
  await page.screenshot({ path: testInfo.outputPath('pagamento-al-ritiro.jpg') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Apri ordine' }).click();
  await expect(page.getByTestId('text-payment-status')).toContainText('Pagamento alla consegna');
  lab = await openLab(page);
  await expect(page.getByTestId('lab-payment-required')).toHaveCount(0);
  await lab.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Laboratorio simulato' }).click();
  await expect(lab.getByRole('button', { name: 'Prepara trasferimento' })).toBeEnabled();
  // Do not start any real or simulated transfer; availability is enough here.
  expect(f.requests.map(r => r.action)).toEqual(['accept-draft', 'deferred-payment', 'deferred-payment']);
  expect(f.requests[0].body).toMatchObject({ confirmed: true, expectedTotalCents: 1500, expectedSnapshotHash: 'snapshot-50' });
  expect(f.unexpected).toEqual([]);
  expect(f.errors).toEqual([]);
});

test('il laboratorio spiega un requisito non soddisfatto senza falso invito al pagamento', async ({ page }) => {
  const f = await fixture(page, true);
  await page.goto('/?printOrderId=offline-draft&labFixture=1');
  const lab = await openLab(page);
  await expect(lab.getByTestId('lab-payment-required')).toContainText('Originali scaduti: crea un nuovo ordine.');
  await expect(lab.getByRole('button', { name: 'Vai all’azione di pagamento' })).toHaveCount(0);
  await expect(lab.getByRole('button', { name: 'Prepara trasferimento' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'ST-TEST-50', exact: true })).toBeVisible();
  expect(f.requests).toEqual([]);
  expect(f.errors).toEqual([]);
  expect(f.unexpected).toEqual([]);
});
