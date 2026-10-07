import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

declare global {
  interface Window {
    jobFlowFixture: typeof import('./api-fixture').fixture;
  }
}

const clients = (page: Page) => page.getByRole('group', { name: 'Clienti da associare' });
const client = (page: Page, name: string) => clients(page).getByRole('checkbox', { name: new RegExp(name) });
const category = (page: Page) => page.getByLabel('Categoria / Tipo evento');
async function selectJob(page: Page, name: string) {
  await page.getByLabel('Job associato', { exact: true }).fill(name);
  await page.getByRole('option', { name: new RegExp(name) }).click();
}
async function mode(page: Page, resource: string, value: string, reset = false) {
  await page.evaluate(({ resource, value }) => {
    window.jobFlowFixture.setMode(resource as 'jobs', value as 'ok');
  }, { resource, value });
  if (reset) {
    await page.getByLabel('Risorsa fixture').selectOption(resource);
    await page.getByLabel('Esito fixture').selectOption(value);
    await page.getByRole('button', { name: 'Applica scenario' }).click();
  }
}
async function gallery(page: Page, id = 'fixture-1') {
  return page.evaluate(id => window.jobFlowFixture.galleries[id], id);
}
async function reopen(page: Page) {
  await page.reload();
  await page.getByRole('tab', { name: 'Impostazioni', exact: true }).click();
  await expect(page.getByLabel('Categoria / Tipo evento')).toBeEnabled();
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Salva modifiche', exact: true }).click();
  await expect.poll(() => page.evaluate(() =>
    window.jobFlowFixture.calls.filter(call => call.method === 'PATCH').at(-1)?.result,
  )).toBe('ok');
  await expect(page.getByRole('button', { name: 'Salva modifiche', exact: true })).toBeEnabled();
}

test.beforeEach(async ({ page, baseURL }) => {
  const violations: string[] = [];
  const errors: string[] = [];
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== new URL(baseURL!).origin || !['GET', 'HEAD'].includes(request.method()) ||
        url.pathname.startsWith('/api/') || /\/lib\/(?:api|firebase)\.ts$/.test(url.pathname)) {
      violations.push(`${request.method()} ${request.url()}`);
      await route.abort('blockedbyclient');
    } else await route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => {
    expect(dialog.type()).toBe('alert');
    expect(dialog.message()).toBe('Impostazioni salvate.');
    await dialog.accept();
  });
  await page.goto('/');
  // Keep browser-side evidence for afterEach without app-side network calls.
  test.info().annotations.push({ type: 'isolation', description: 'Local transport only; all network writes and off-origin requests denied' });
  Object.assign(page, { fixtureViolations: violations, fixtureErrors: errors });
});
test.afterEach(async ({ page }, testInfo) => {
  const evidence = await page.evaluate(() => ({
    calls: window.jobFlowFixture.calls,
    blockedNetwork: window.jobFlowFixture.blockedNetwork,
  }));
  const auditPath = testInfo.outputPath('fixture-audit.json');
  await mkdir(path.dirname(auditPath), { recursive: true });
  await writeFile(auditPath, JSON.stringify(evidence, null, 2));
  await testInfo.attach('fixture-audit', { path: auditPath, contentType: 'application/json' });
  expect((page as Page & { fixtureViolations: string[] }).fixtureViolations).toEqual([]);
  expect((page as Page & { fixtureErrors: string[] }).fixtureErrors).toEqual([]);
  expect(evidence.blockedNetwork).toEqual([]);
  expect(evidence.calls.filter(call => call.result === 'denied' || call.result === 'pending')).toEqual([]);
  for (const call of evidence.calls) {
    if (call.method === 'GET') {
      expect(call.endpoint).toMatch(/^\/(clients|jobs|job-types|galleries\/fixture-\d+(\/photos)?)$/);
    } else {
      expect(`${call.method} ${call.endpoint}`).toMatch(/^(POST \/galleries|PATCH \/galleries\/fixture-\d+)$/);
    }
  }
});

test('creation, Job changes/removal, manual category, save and reopen', async ({ page }) => {
  await page.getByLabel('Nome Galleria *', { exact: true }).fill('Galleria Job fixture');
  await client(page, 'Cliente Manuale').check();
  await selectJob(page, 'Job Alfa');
  await expect(client(page, 'Cliente Alfa')).toBeChecked();
  await expect(client(page, 'Cliente Alfa')).toBeDisabled();
  await expect(client(page, 'Cliente Manuale')).toBeChecked();
  await expect(category(page)).toHaveValue('matrimonio');
  await selectJob(page, 'Job Beta');
  await expect(category(page)).toHaveValue('ritratto');
  await expect(client(page, 'Cliente Alfa')).toBeChecked();
  await expect(client(page, 'Cliente Alfa')).toBeEnabled();
  await expect(client(page, 'Cliente Beta')).toBeChecked();
  await expect(client(page, 'Cliente Beta')).toBeDisabled();
  await page.getByRole('button', { name: 'Rimuovi Job' }).click();
  await expect(client(page, 'Cliente Alfa')).not.toBeChecked();
  await expect(client(page, 'Cliente Beta')).not.toBeChecked();
  await expect(client(page, 'Cliente Manuale')).toBeChecked();
  await selectJob(page, 'Job Alfa');
  await category(page).selectOption('manuale');
  await selectJob(page, 'Job Beta');
  await expect(category(page)).toHaveValue('manuale');
  await page.getByRole('button', { name: 'Rimuovi Job' }).click();
  await expect(category(page)).toHaveValue('manuale');
  await expect(client(page, 'Cliente Alfa')).not.toBeChecked();
  await expect(client(page, 'Cliente Beta')).not.toBeChecked();
  await selectJob(page, 'Job Alfa');
  await page.getByRole('button', { name: 'Crea Galleria', exact: true }).click();
  await expect(page).toHaveURL(/\/galleries\/fixture-1$/);
  await expect(page.getByRole('heading', { name: 'Galleria Job fixture' })).toBeVisible();
  expect(await gallery(page)).toMatchObject({
    jobId: 'job-alpha', clientIds: ['manual', 'alpha'], jobType: 'manuale', category: 'manuale', status: 'draft',
  });
  const created = await page.evaluate(() => window.jobFlowFixture.calls.find(call => call.method === 'POST'));
  expect(created?.body).toMatchObject({ jobId: 'job-alpha', clientIds: ['manual', 'alpha'], jobType: 'manuale', category: 'manuale' });
  await page.getByRole('tab', { name: 'Impostazioni', exact: true }).click();
  await expect(category(page)).toHaveValue('manuale');
  await expect(client(page, 'Cliente Alfa')).toBeDisabled();
  await selectJob(page, 'Job Beta');
  await expect(client(page, 'Cliente Alfa')).toBeEnabled();
  await expect(client(page, 'Cliente Alfa')).toBeChecked();
  await expect(client(page, 'Cliente Beta')).toBeDisabled();
  await save(page);
  await page.getByRole('tab', { name: 'Panoramica' }).click();
  await expect(page.getByText('Job Beta', { exact: true })).toBeVisible();
  await expect(page.getByText('Categoria manuale', { exact: true })).toBeVisible();
  await reopen(page);
  expect(await gallery(page)).toMatchObject({ jobId: 'job-beta', clientIds: ['manual', 'alpha', 'beta'], category: 'manuale' });
  await expect(client(page, 'Cliente Beta')).toBeChecked();
  await expect(client(page, 'Cliente Beta')).toBeDisabled();
  await page.getByRole('button', { name: 'Rimuovi Job' }).click();
  for (const name of ['Cliente Manuale', 'Cliente Alfa', 'Cliente Beta']) {
    await expect(client(page, name)).toBeChecked();
    await expect(client(page, name)).toBeEnabled();
  }
  await client(page, 'Cliente Alfa').uncheck();
  await save(page);
  await reopen(page);
  expect(await gallery(page)).toMatchObject({ jobId: '', clientIds: ['manual', 'beta'], jobType: 'manuale', category: 'manuale' });
  await expect(client(page, 'Cliente Alfa')).not.toBeChecked();
  await category(page).selectOption('');
  await save(page);
  await reopen(page);
  await expect(category(page)).toHaveValue('');
  expect(await gallery(page)).toMatchObject({ jobType: null, category: null, jobId: '' });
  await page.screenshot({ path: '/tmp/image-studio-desktop-job-flow/reopened-settings.png', fullPage: true });
});

test('saved Job survives loading, errors and explicit retry of all association queries', async ({ page }) => {
  await page.getByLabel('Nome Galleria *', { exact: true }).fill('Galleria retry fixture');
  await selectJob(page, 'Job Alfa');
  await page.getByRole('button', { name: 'Crea Galleria', exact: true }).click();
  await expect(page).toHaveURL(/\/galleries\/fixture-1$/);
  await page.getByRole('tab', { name: 'Impostazioni', exact: true }).click();
  const original = await gallery(page);
  const scenarios = [
    { resource: 'jobs', label: 'Job associato', loading: 'Caricamento Job…', error: 'Impossibile caricare i Job.' },
    { resource: 'clients', label: /Clienti associati/, loading: 'Caricamento clienti…', error: 'Impossibile caricare i clienti.' },
    { resource: 'job-types', label: 'Categoria / Tipo evento', loading: 'Caricamento categorie…', error: 'Impossibile caricare le categorie centralizzate.' },
  ];
  for (const scenario of scenarios) {
    await mode(page, scenario.resource, 'slow', true);
    await expect(page.getByText(scenario.loading, { exact: true })).toBeVisible();
    await expect(page.getByLabel(scenario.label, { exact: true })).toBeDisabled();
    if (scenario.resource === 'jobs') {
      await expect(page.getByText('Verifica del Job salvato…', { exact: true })).toBeVisible();
      await expect(page.getByText(/Job non disponibile/)).toHaveCount(0);
    }
    await expect(page.getByLabel(scenario.label, { exact: true })).toBeEnabled();
    await mode(page, scenario.resource, 'error', true);
    const alert = page.getByRole('alert').filter({ hasText: scenario.error });
    await expect(alert).toBeVisible();
    await expect(page.getByLabel(scenario.label, { exact: true })).toBeDisabled();
    if (scenario.resource === 'jobs') {
      await expect(page.getByText('Impossibile verificare il Job salvato (job-alpha).', { exact: true })).toBeVisible();
      await expect(page.getByText(/Job non disponibile/)).toHaveCount(0);
    }
    await mode(page, scenario.resource, 'ok');
    await alert.getByRole('button', { name: 'Riprova', exact: true }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByLabel(scenario.label, { exact: true })).toBeEnabled();
    await expect(category(page)).toHaveValue('matrimonio');
    await expect(client(page, 'Cliente Alfa')).toBeChecked();
    await expect(client(page, 'Cliente Alfa')).toBeDisabled();
    expect(await gallery(page)).toEqual(original);
  }
});

test('failed create/save retain edits; slow save disables submit and retry persists changes', async ({ page }) => {
  await page.getByLabel('Nome Galleria *', { exact: true }).fill('Galleria errori fixture');
  await client(page, 'Cliente Manuale').check();
  await selectJob(page, 'Job Alfa');
  await category(page).selectOption('manuale');
  await mode(page, 'create', 'error');
  await page.getByRole('button', { name: 'Crea Galleria', exact: true }).click();
  await expect(page.getByText('Errore nella creazione della galleria. Riprova.')).toBeVisible();
  expect(await page.evaluate(() => Object.keys(window.jobFlowFixture.galleries))).toEqual([]);
  await expect(category(page)).toHaveValue('manuale');
  await expect(client(page, 'Cliente Alfa')).toBeChecked();
  await expect(page.getByLabel('Nome Galleria *', { exact: true })).toHaveValue('Galleria errori fixture');
  await mode(page, 'create', 'ok');
  await page.getByRole('button', { name: 'Crea Galleria', exact: true }).click();
  await expect(page).toHaveURL(/\/galleries\/fixture-1$/);
  await page.getByRole('tab', { name: 'Impostazioni', exact: true }).click();
  const original = await gallery(page);
  await selectJob(page, 'Job Beta');
  await mode(page, 'save', 'error');
  await page.getByRole('button', { name: 'Salva modifiche', exact: true }).click();
  await expect(page.getByText(/Impostazioni non salvate: Fixture save/)).toBeVisible();
  expect(await gallery(page)).toEqual(original);
  await expect(client(page, 'Cliente Beta')).toBeChecked();
  await expect(category(page)).toHaveValue('manuale');
  await mode(page, 'save', 'slow');
  await page.getByRole('button', { name: 'Salva modifiche', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvataggio...', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Salva modifiche', exact: true })).toBeEnabled();
  expect(await gallery(page)).toMatchObject({ jobId: 'job-beta', clientIds: ['manual', 'alpha', 'beta'], jobType: 'manuale', category: 'manuale' });
  await reopen(page);
  await expect(page.getByText('Job Beta', { exact: true })).toBeVisible();
  await expect(category(page)).toHaveValue('manuale');
  await expect(client(page, 'Cliente Beta')).toBeDisabled();
  const writes = await page.evaluate(() => window.jobFlowFixture.calls.filter(call => call.method !== 'GET'));
  expect(writes.map(call => call.result)).toEqual(['fixture-error', 'ok', 'fixture-error', 'ok']);
  expect(writes.at(-1)?.body).toMatchObject({ jobId: 'job-beta', category: 'manuale', jobType: 'manuale' });
});