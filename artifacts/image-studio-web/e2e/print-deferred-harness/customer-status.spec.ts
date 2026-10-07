import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('customer notifications persist after status changes and remain truthful on mobile and for the buyer', async ({ page }) => {
  const order: any = {
    id: 'status-fixture', orderNumber: 'ST-STATUS-FIXTURE',
    customer: { name: 'Customer Fixture', email: 'customer@example.test' },
    totals: { totalCents: 4200, shippingCents: 0 },
    payment: { status: 'deferred', method: 'pay_on_delivery', collectedCents: 0, dueCents: 4200 },
    fulfillment: { status: 'ready_to_print', method: 'studio_pickup' },
    printShop: { assetCount: 1, copyCount: 1, items: [], acceptedByStudio: true,
      adminAcceptance: { acceptedAt: '2026-10-03T10:00:00Z', note: 'Phone request fixture' } },
    assets: [],
    notifications: {
      manualAcceptance: {
        status: 'sent',
        kind: 'manual_acceptance',
        label: 'Ordine preso in carico dallo studio',
        attempts: 1,
      },
      orderConfirmed: { status: 'sent', label: 'Ordine confermato' },
    },
    deferredPaymentEligibility: { canAuthorize: false, canRestore: false },
  };
  const unexpected: string[] = [];
  const mutations: string[] = [];
  const resends: Array<{ path: string; body: unknown }> = [];
  const confirmationMessages: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => {
    confirmationMessages.push(dialog.message());
    await dialog.accept();
  });
  await page.context().route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4192') {
      unexpected.push(url.href);
      await route.abort();
      return;
    }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    const respond = (body: any, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body),
    });
    const method = route.request().method();
    if (url.pathname.endsWith('/status') && method === 'PATCH') {
      mutations.push(url.pathname);
      order.fulfillment.status = route.request().postDataJSON().status;
      order.notifications.printing = {
        status: 'sent', kind: 'printing', label: 'Stampe in produzione', attempts: 1,
      };
      return respond({ order });
    }
    if (url.pathname.includes('/customer-notifications/') && method === 'POST') {
      const kind = url.pathname.split('/').at(-2)!;
      resends.push({ path: url.pathname, body: route.request().postDataJSON() });
      const markerKey = kind === 'manual_acceptance' ? 'manualAcceptance' : 'printing';
      const notification = order.notifications[markerKey];
      order.notifications[markerKey] = {
        ...notification,
        status: 'sent',
        attempts: (notification.attempts || 0) + 1,
        manualResends: (notification.manualResends || 0) + 1,
        manualResendHistory: [
          ...(notification.manualResendHistory || []),
          { attempt: (notification.manualResends || 0) + 1, by: 'admin@example.test', at: '2026-10-03T10:01:00.000Z' },
        ],
      };
      return respond({ sent: true, skipped: false });
    }
    if (url.pathname.endsWith('/lab-shipments')) return respond({ shipments: [] });
    if (url.pathname.endsWith('/orders/status-fixture')) return respond({ order });
    if (url.pathname.endsWith('/orders')) return respond({ orders: [order] });
    unexpected.push(`${method} ${url.pathname}`);
    return respond({ message: 'Unexpected fixture API request' }, 500);
  });
  const openOrder = async () => {
    await page.getByPlaceholder('Cerca numero ordine, cliente o email').fill(order.orderNumber);
    await page.getByRole('button', { name: 'Apri ordine', exact: true }).click();
    await expect(page.getByTestId('customer-order-notifications')).toBeVisible();
  };
  mkdirSync('screenshots', { recursive: true });
  await page.goto('/');
  await openOrder();
  const panel = page.getByTestId('customer-order-notifications');
  await expect(panel.getByRole('heading', { name: 'Email al cliente' })).toBeInViewport();
  await expect(panel.getByRole('button', {
    name: 'Reinvia email: Ordine preso in carico dallo studio',
  })).toBeInViewport();
  await expect(panel.locator('li').filter({ hasText: 'Email inviata' })).toHaveCount(2);
  await expect(panel.getByText('Ordine preso in carico dallo studio', { exact: true })).toBeVisible();
  const acceptanceRow = panel.locator('li').filter({ hasText: 'Ordine preso in carico dallo studio' });
  await acceptanceRow.getByRole('button', { name: 'Reinvia email: Ordine preso in carico dallo studio' }).click();
  await expect(acceptanceRow.getByText('2 tentativi')).toBeVisible();
  await expect(acceptanceRow.getByText('1 reinvio manuale')).toBeVisible();
  await expect(acceptanceRow.getByText(/Reinvio manuale 1 da admin@example\.test/)).toBeVisible();
  expect(confirmationMessages[0]).toContain('può creare un duplicato');
  expect(resends).toEqual([{
    path: '/api/print-shop/admin/orders/status-fixture/customer-notifications/manual_acceptance/resend',
    body: { confirmed: true },
  }]);
  await page.getByRole('button', { name: 'Aggiorna stato', exact: true }).click();
  const statusDialog = page.getByRole('dialog').filter({ hasText: 'Aggiorna produzione' });
  await statusDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'In stampa', exact: true }).click();
  await statusDialog.getByRole('button', { name: 'Salva stato', exact: true }).click();
  await expect(panel.getByText('Stampe in produzione', { exact: true })).toBeVisible();
  await expect(panel.locator('li').filter({ hasText: 'Email inviata' })).toHaveCount(3);
  await expect(page.getByText('Pagamento alla consegna — da incassare', { exact: true }).first()).toBeVisible();
  await page.reload();
  await openOrder();
  await expect(panel.getByText('Stampe in produzione', { exact: true })).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'screenshots/print-customer-status-desktop.jpg' });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  await expect(panel).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'screenshots/print-customer-status-mobile.jpg' });
  order.notifications.printing.status = 'failed';
  await page.reload();
  await openOrder();
  await expect(panel.getByText(/Invio non riuscito — verifica il registro email/)).toBeVisible();
  const printingRow = panel.locator('li').filter({ hasText: 'Stampe in produzione' });
  await printingRow.getByRole('button', { name: 'Riprova email: Stampe in produzione' }).click();
  await expect(printingRow.getByText('2 tentativi')).toBeVisible();
  expect(confirmationMessages[1]).toContain('non è riuscito');
  expect(resends).toHaveLength(2);
  expect(order.fulfillment.status).toBe('printing');
  expect(mutations).toHaveLength(1);
  order.fulfillment.status = 'awaiting_payment';
  order.payment.status = 'pending';
  await page.goto('/?view=orders');
  await expect(page.getByText('Accettato dallo studio · in attesa del pagamento', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aggiorna stato', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'screenshots/print-customer-status-buyer.jpg', fullPage: true });
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__harnessErrors)).toEqual([]);
});