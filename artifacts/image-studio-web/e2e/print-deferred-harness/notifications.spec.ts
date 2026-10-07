import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.protocol !== 'blob:') {
      await route.abort();
    } else {
      await route.continue();
    }
  });
});

test('Admin list and detail preserve legacy contacts and explicit prefixes without incorrect links', async ({ page }) => {
  await page.goto('/?notificationFixture=1&view=admin');
  const links = page.getByRole('link', { name: 'Contatta su WhatsApp' });
  await expect(links).toHaveCount(3);
  const expected = [
    ['ST-LOCAL', '393271234567'],
    ['ST-LEGACY', '393277654321'],
    ['ST-FRANCE', '33612345678'],
  ];
  for (const [number, phone] of expected) {
    const matched = page.locator(`a[href^="https://wa.me/${phone}?"]`);
    await expect(matched).toHaveCount(1);
    const url = new URL((await matched.getAttribute('href'))!);
    expect(url.searchParams.get('text')).toContain(number);
    await expect(matched).toHaveAttribute('target', '_blank');
    await expect(matched).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await expect(page.getByText('Numero non valido per WhatsApp')).toBeVisible();
  await expect(page.getByText('Cellulare: Non disponibile')).toBeVisible();
  // Locate the containing real Card, not a fixture replacement.
  for (const [number, phone] of expected.slice(0, 2)) {
    const heading = page.getByText(number, { exact: true });
    const container = heading.locator('xpath=ancestor::div[contains(@class,"bg-card")][1]');
    await container.getByRole('button', { name: /Dettagli|Apri|Gestisci/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('link', { name: 'Contatta su WhatsApp' })).toHaveAttribute('href', new RegExp(`/${phone}`));
    await expect(dialog.getByText(/pagato/i).first()).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await page.screenshot({ path: '/tmp/print-notifications-admin.jpg', fullPage: true });
});

test('a new browser resumes the URL draft after login with saved Polaroid, contact and delivery', async ({ page }) => {
  await page.goto('/stampa-foto-aversa/ordine?notificationFixture=1&loginFixture=1&orderId=recover-fixture');
  await expect(page.getByRole('button', { name: /Continua con Google/i })).toBeVisible();
  await page.getByRole('button', { name: /Continua con Google/i }).click();
  await expect(page.getByText('foto-salvata.jpg', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/orderId=recover-fixture/);
  expect(await page.evaluate(() => sessionStorage.getItem('print-shop-draft:fixture-user'))).toBe('recover-fixture');
  await expect(page.getByText(/Polaroid/i).first()).toBeVisible();
  await expect(page.getByRole('radio', { name: /Carta opaca/ })).toBeChecked();
  const requests = await page.evaluate(() => (window as any).__printFixtureRequests);
  expect(requests.some((request: any) => request.path.endsWith('/recover-fixture/resume'))).toBe(true);
  expect(requests.some((request: any) => request.path === '/api/print-shop/orders' && request.method === 'POST')).toBe(false);
  await page.getByRole('button', { name: 'Controlla l’ordine' }).click();
  const quoteRequests = await page.evaluate(() => (window as any).__printFixtureRequests.filter((request: any) => request.path.endsWith('/quote')));
  expect(JSON.parse(quoteRequests.at(-1).body).items[0].assignments[0].composition).toEqual({ version: 1, x: .73, y: .38, zoom: 1.3 });
  await expect(page.locator('input[value="327 123 4567"]')).toBeVisible();
  await expect(page.locator('textarea')).toHaveValue('Note già salvate');
  await expect(page.locator('input[value="Via Salvata"]')).toBeVisible();
  await expect(page.locator('input[value="RSSMRA85M01F839X"]')).toBeVisible();
  await page.screenshot({ path: '/tmp/print-notifications-resume.jpg', fullPage: true });
});

test('opt out is explicit, inaccessible and expired drafts never create replacements, and paid orders show confirmation', async ({ page }) => {
  await page.goto('/stampa-foto-aversa/ordine?notificationFixture=1&orderId=recover-fixture&stopReminders=1');
  await page.getByRole('button', { name: 'Interrompi i promemoria', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Promemoria interrotti' })).toBeDisabled();
  let requests = await page.evaluate(() => (window as any).__printFixtureRequests);
  expect(requests.filter((request: any) => request.path.endsWith('/reminders/stop'))).toHaveLength(1);
  for (const id of ['forbidden', 'expired']) {
    await page.goto(`/stampa-foto-aversa/ordine?notificationFixture=1&orderId=${id}`);
    await expect(page.getByRole('alert')).toContainText(id === 'forbidden' ? 'account' : 'scaduto');
    requests = await page.evaluate(() => (window as any).__printFixtureRequests);
    expect(requests.some((request: any) => request.path === '/api/print-shop/orders' && request.method === 'POST')).toBe(false);
  }
  await page.goto('/stampa-foto-aversa/ordine?notificationFixture=1&orderId=paid-fixture');
  await expect(page).toHaveURL(/ordine\/conferma\?orderId=paid-fixture/);
});