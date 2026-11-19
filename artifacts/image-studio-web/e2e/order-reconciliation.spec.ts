import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    fixture: { readOrder(): any; saveOrder(order: any): void; reloadOrders(): Promise<void> };
  }
}

async function fixture(page: Page, initialFailure = false) {
  const state = { fail: initialFailure, posts: 0, credits: 0, unexpected: [] as string[], hold: null as Promise<void> | null };
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4194') {
      // External assets (e.g. Google Fonts stylesheet from index.css) are aborted
      // but are not provider/API calls; every other external request is a failure.
      const type = route.request().resourceType();
      if (!['stylesheet', 'font', 'image'].includes(type)) state.unexpected.push(url.href);
      return route.abort();
    }
    if (url.pathname === '/api/orders/reconcile-booking-deposits') {
      state.posts++;
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({ orderIds: ['order'] });
      if (state.hold) await state.hold;
      if (state.fail) return route.fulfill({ status: 409, json: { error: 'Ricevuta fixture non verificabile' } });
      const changed = await page.evaluate(() => {
        const order = window.fixture.readOrder();
        if (order.transactions.length) return false;
        window.fixture.saveOrder({ ...order, acconto: 5, saldo: 15, transactions: [{
          tipo: 'acconto', importo: 5, metodo: 'paypal', source: 'booking_paypal_deposit',
          providerTransactionId: 'CAPTURE', cashMovementId: 'cash', emailInviata: true,
        }] });
        return true;
      });
      if (changed) state.credits++;
      return route.fulfill({ status: 200, json: { updated: changed ? 1 : 0 } });
    }
    if (url.pathname.startsWith('/api/')) {
      state.unexpected.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  return state;
}

// Amounts are rendered only inside the expanded "Gestione Ordine" panel,
// opened by the order toggle (data-testid="button-order-<bookingId>").
async function openOrderDetails(page: Page) {
  const toggle = page.getByTestId('button-order-booking');
  await expect(toggle).toBeVisible();
  const panel = page.getByRole('heading', { name: 'Gestione Ordine' });
  if (await panel.count() === 0) await toggle.click();
  await expect(panel).toBeVisible();
}

test("la verifica dell'acconto non blocca la pagina e nasconde solo gli importi di quell'ordine", async ({ page }) => {
  const state = await fixture(page);
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  await page.goto('/?time=all&campaign=all');
  // Le prenotazioni sono visibili subito, mentre la verifica e' ancora in corso.
  await expect(page.getByText('Cliente Fittizio')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Verifica degli acconti PayPal in corso' })).toBeVisible();
  await page.getByTestId('button-order-booking').click();
  await expect(page.getByText('Verifica dell’acconto PayPal in corso')).toBeVisible();
  await expect(page.getByText('€20.00', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Acconto$/ })).toHaveCount(0);
  release();
  await expect(page.getByRole('status').filter({ hasText: 'Verifica degli acconti PayPal in corso' })).toHaveCount(0);
  await openOrderDetails(page);
  await expect(page.getByText('€15.00', { exact: true }).first()).toBeVisible();
  expect(state.credits).toBe(1);
  expect(state.posts).toBe(1);
  expect(state.unexpected).toEqual([]);
});

test("se la verifica fallisce, la pagina resta usabile ma gli importi dell'ordine restano nascosti fino a Riprova", async ({ page }) => {
  const state = await fixture(page, true);
  await page.goto('/?time=all&campaign=all');
  await expect(page.getByRole('alert')).toContainText('Pagamenti degli ordini da verificare');
  await expect(page.getByRole('alert')).toContainText('Non registrare nuovamente');
  await expect(page.getByText('Cliente Fittizio')).toBeVisible();
  await page.getByTestId('button-order-booking').click();
  await expect(page.getByText('€20.00', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Acconto$/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Riprova' }).click();
  await expect.poll(() => state.posts).toBe(2);
  await expect(page.getByRole('alert')).toBeVisible();
  state.fail = false;
  await page.getByRole('button', { name: 'Riprova' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await openOrderDetails(page);
  await expect(page.getByText('€5.00', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('€15.00', { exact: true }).first()).toBeVisible();
  await page.reload();
  await openOrderDetails(page);
  await expect(page.getByText('€15.00', { exact: true }).first()).toBeVisible();
  expect(state.posts).toBe(3); // dopo il ricaricamento l'ordine e' gia' a posto: nessuna nuova chiamata
  expect(state.credits).toBe(1);
  expect(state.unexpected).toEqual([]);
  expect(await page.evaluate(() => window.fixture.readOrder().transactions.length)).toBe(1);
});

test('un errore di lettura dopo un caricamento valido nasconde anche gli importi rimasti in cache', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/?time=all&campaign=all');
  await openOrderDetails(page);
  await expect(page.getByText('€15.00', { exact: true }).first()).toBeVisible();
  await page.evaluate(() => localStorage.setItem('fail-order-read', 'yes'));
  await page.evaluate(() => { void window.fixture.reloadOrders(); });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('€15.00', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Registra Acconto/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Riprova' }).click();
  await expect(page.getByRole('alert')).toContainText('temporaneamente nascosti');
  await page.evaluate(() => localStorage.removeItem('fail-order-read'));
  await page.getByRole('button', { name: 'Riprova' }).click();
  await expect(page.getByText('€15.00', { exact: true }).first()).toBeVisible();
  expect(state.credits).toBe(1);
  expect(state.posts).toBe(1);
  expect(state.unexpected).toEqual([]);
});
