import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    fixture: {
      readOrder(): any; saveOrder(order: any): void; reloadOrders(): Promise<void>;
      readBooking(): any; saveBooking(booking: any): void; releaseBookingListener(): void; isBookingListenerPending(): boolean;
    };
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

type ApprovalPath = 'final' | 'deposit';

async function interceptApproval(page: Page, path: ApprovalPath, loseResponse = false) {
  const state = { attempts: 0, approvals: 0, googleEvents: 0, emails: 0 };
  await page.route('**/api/booking/v2/booking/approve', async route => {
    state.attempts++;
    expect(route.request().method()).toBe('PATCH');
    const booking = await page.evaluate(() => window.fixture.readBooking());
    const notYetApproved = booking.stato === 'in_attesa' && !booking.depositPaymentRequest;
    if (notYetApproved) {
      state.approvals++;
      if (path === 'deposit') {
        await page.evaluate(() => window.fixture.saveBooking({
          ...window.fixture.readBooking(),
          depositPaymentRequest: {
            status: 'pending', amountCents: 500,
            requestedAt: '2030-12-01T08:00:00.000Z', expiresAt: '2030-12-01T09:00:00.000Z',
          },
        }));
        state.emails++;
      } else {
        await page.evaluate(() => window.fixture.saveBooking({
          ...window.fixture.readBooking(), stato: 'confermata',
        }));
        state.googleEvents++;
        state.emails++;
      }
    }

    // The mock server commits before dropping the response, matching the ambiguous
    // network outcome without making any real calendar or email request.
    if (loseResponse) return route.abort('failed');
    return route.fulfill({ json: path === 'deposit'
      ? { success: true, paymentRequired: true, amountCents: 500, expiresAt: '2030-12-01T09:00:00Z', emailStatus: 'sent' }
      : { success: true, bookingId: 'booking' } });
  });
  return state;
}

async function reopenAdminTab(page: Page, url: string) {
  // A full navigation away and back models the app being discarded and reopened;
  // it does not reproduce OS process suspension or mobile radio handoff.
  await page.goto('about:blank');
  await page.goto(url);
}

async function expectApprovalPathSettled(page: Page, path: ApprovalPath) {
  await expect(page.getByTestId('button-approve-booking')).toHaveCount(0);
  await expect(page.getByText(path === 'deposit' ? 'In attesa di pagamento' : 'Confermata').first()).toBeVisible();
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

test.describe('approvazione con un solo tocco da telefono', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const placement of ['list', 'detail', 'deposit'] as const) {
    test(`il primo tocco salva da ${placement} anche con badge e lista bloccati`, async ({ page }) => {
      const state = await fixture(page);
      let approvals = 0;
      await page.route('**/api/booking/v2/booking/approve', async route => {
        approvals++;
        expect(route.request().method()).toBe('PATCH');
        await route.fulfill({ json: placement === 'deposit'
          ? { success: true, paymentRequired: true, amountCents: 500, expiresAt: '2030-12-01T09:00:00Z', emailStatus: 'sent' }
          : { success: true, bookingId: 'booking' } });
      });
      await page.goto(`/?time=all&campaign=all&approval-case=${placement}`);
      if (placement === 'detail') await page.getByTestId('button-view-booking').tap();
      const button = page.getByTestId(placement === 'detail' ? 'button-approve-detail-booking' : 'button-approve-booking');
      await expect(button).toBeVisible();
      await button.tap();
      if (placement === 'detail') {
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByTestId('button-approve-booking')).toHaveText('Approvata');
      } else {
        await expect(button).toHaveText(placement === 'deposit' ? 'Acconto richiesto' : 'Approvata');
      }
      await expect(page.getByTestId('button-approve-booking')).toBeDisabled();
      expect(approvals).toBe(1);
      expect(state.unexpected).toEqual([]);
    });
  }
});

// Da verificare separatamente su iOS/Android reali: sospensione del processo da parte
// del sistema, cambio effettivo Wi-Fi/rete mobile e riconsegna della pagina dal browser.
test.describe('approvazione mobile dopo standby e recupero listener', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const path of ['final', 'deposit'] as const) {
    test(`la ${path === 'deposit' ? 'richiesta acconto' : 'conferma finale'} resta coerente dopo listener in ritardo e riapertura`, async ({ page }) => {
      const state = await fixture(page);
      const sideEffects = await interceptApproval(page, path);
      const url = `/?time=all&campaign=all&approval-case=${path}&listener-delay=1`;
      await page.goto(url);

      const button = page.getByTestId('button-approve-booking');
      await expect(button).toBeVisible();
      await button.tap();
      await expect(button).toHaveText(path === 'deposit' ? 'Acconto richiesto' : 'Approvata');
      await expect(button).toBeDisabled();
      await expect.poll(() => page.evaluate(() => window.fixture.isBookingListenerPending())).toBe(true);
      expect(sideEffects).toEqual({
        attempts: 1, approvals: 1,
        googleEvents: path === 'final' ? 1 : 0,
        emails: 1,
      });

      // The action acknowledgement already blocks another tap while the read
      // listener is delayed; releasing it reconciles the visible booking state.
      await page.evaluate(() => window.fixture.releaseBookingListener());
      await expectApprovalPathSettled(page, path);
      await reopenAdminTab(page, url);
      await expectApprovalPathSettled(page, path);
      expect(sideEffects.attempts).toBe(1);
      expect(state.unexpected).toEqual([]);
    });

    test(`la risposta HTTP persa alla ${path === 'deposit' ? 'richiesta acconto' : 'conferma finale'} non ripete gli effetti`, async ({ page }) => {
      const state = await fixture(page);
      const sideEffects = await interceptApproval(page, path, true);
      const url = `/?time=all&campaign=all&approval-case=${path}&listener-delay=1`;
      await page.goto(url);

      await page.getByTestId('button-approve-booking').tap();
      await expect.poll(() => page.evaluate(() => window.fixture.isBookingListenerPending())).toBe(true);
      expect(sideEffects).toEqual({
        attempts: 1, approvals: 1,
        googleEvents: path === 'final' ? 1 : 0,
        emails: 1,
      });

      // The server committed, but the response and listener update did not arrive.
      // Simulate an offline/online transition around the suspended-tab reopen.
      await page.context().setOffline(true);
      await page.goto('about:blank');
      await page.context().setOffline(false);
      // Reopening reads the saved state and must not expose a second approval action.
      await page.goto(url);
      await expectApprovalPathSettled(page, path);
      expect(sideEffects.attempts).toBe(1);
      expect(sideEffects.approvals).toBe(1);
      expect(sideEffects.googleEvents).toBe(path === 'final' ? 1 : 0);
      expect(sideEffects.emails).toBe(1);
      expect(state.unexpected).toEqual([]);
    });
  }
});

test('il recupero calendario richiede una verifica e non ricrea appuntamenti già presenti', async ({ page }) => {
  const state = await fixture(page);
  let inspections = 0, recoveries = 0;
  await page.route('**/api/booking/booking/calendar-recovery', async route => {
    if (route.request().method() === 'GET') {
      inspections++;
      return route.fulfill({ json: { action: 'link_existing', canRecover: true,
        inspectionKey: 'a'.repeat(64), calendarId: 'studio-fixture', message: 'Appuntamento già presente: verrà collegato.' } });
    }
    recoveries++;
    expect(route.request().postDataJSON()).toEqual({ inspectionKey: 'a'.repeat(64) });
    return route.fulfill({ json: { action: 'already_linked', canRecover: false,
      message: 'Appuntamento recuperato. Nessuna email inviata; stato e incassi invariati.' } });
  });
  await page.goto('/?time=all&campaign=all');
  await page.getByTestId('button-view-booking').click();
  const recovery = page.getByRole('region', { name: 'Recupero appuntamento Google' });
  await expect(recovery).toBeVisible();
  expect(inspections).toBe(0); expect(recoveries).toBe(0);
  await recovery.getByRole('button', { name: 'Verifica appuntamento' }).click();
  await expect(recovery.getByText('Appuntamento già presente: verrà collegato.')).toBeVisible();
  await expect(recovery.getByRole('button', { name: 'Crea appuntamento mancante' })).toHaveCount(0);
  await recovery.getByRole('button', { name: 'Collega appuntamento esistente' }).click();
  await expect(recovery.getByText('Appuntamento recuperato. Nessuna email inviata; stato e incassi invariati.')).toBeVisible();
  expect(recoveries).toBe(1);
  expect(state.unexpected).toEqual([]);
});

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
