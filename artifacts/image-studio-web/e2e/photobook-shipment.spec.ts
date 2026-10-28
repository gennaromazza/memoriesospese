import { test, expect, type Page } from '@playwright/test';

async function isolatedApi(page: Page, options: { linked?: boolean; locked?: boolean; partial?: boolean } = {}) {
  const book: any = { id: 'isolated', name: 'Album autonomo di prova', token: 'isolated-token',
    currentVersion: 1, versions: [{ version: 1, pageCount: 2 }], locked: !!options.locked,
    approval: { version: 1 }, mockupPath: 'studio',
    ...(options.linked ? { jobId: 'job-fixture', galleryId: 'gallery-fixture' } : {}),
    ...(options.locked ? { labShipmentId: 'shipment-fixture' } : {}),
  };
  const shipment: any = { id: 'shipment-fixture', sourceType: 'photobook', photobookId: book.id,
    status: 'da_inviare', labId: 'lab-fixture', labNome: 'Laboratorio test', expiryDays: 20,
    shareableLink: 'https://example.test/drive',
    files: [{ kind: 'original', name: 'pagina-001-a.jpg', driveFileId: 'a' }],
    pageTransfer: { status: options.partial ? 'partial' : 'completed', total: 2, transferred: 1, skipped: 0, failed: options.partial ? [{ pageNumber: 2, error: 'Errore simulato' }] : [] },
  };
  if (!options.partial) shipment.files.push({ kind: 'original', name: 'pagina-002-b.jpg', driveFileId: 'b' });
  const state = { book, shipment, sends: 0, retries: 0, loadError: false, sendError: false };
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    // Block every external service (Firebase, Drive, Gmail).
    if (url.origin !== 'http://127.0.0.1:4197') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let body: unknown; let status = 200;
    if (url.pathname === '/api/labs') body = [{ id: 'lab-fixture', nome: 'Laboratorio test', email: 'lab@example.test', attivo: true }];
    else if (url.pathname === '/api/photobooks/requests') body = { requests: [] };
    else if (url.pathname === '/api/photobooks') body = { photobooks: [book] };
    else if (url.pathname.endsWith('/lab-shipment')) {
      if (book.labShipmentId) state.retries++;
      book.locked = true; book.labShipmentId = shipment.id;
      shipment.pageTransfer.status = 'completed'; shipment.pageTransfer.failed = [];
      shipment.files = [1, 2].map(n => ({ kind: 'original', name: `pagina-${n}.jpg`, driveFileId: String(n) }));
      body = { shipment, photobook: book, totalPages: 2, started: true }; status = 202;
    } else if (url.pathname.endsWith('/resolve-photobook-send')) {
      shipment.mockupDispatching = false; shipment.photobookDispatchUncertain = false; body = shipment;
    } else if (url.pathname.endsWith('/send')) {
      state.sends++;
      if (state.sendError) {
        status = 500; shipment.mockupDispatching = true; shipment.photobookDispatchUncertain = true;
        body = { error: 'Errore email simulato' };
      } else { shipment.sentAt = { _seconds: Math.floor(Date.now() / 1000) }; shipment.status = 'inviato'; body = shipment; }
    } else if (url.pathname === `/api/lab-shipments/${shipment.id}`) {
      if (state.loadError) { status = 503; body = { error: 'Errore caricamento simulato' }; }
      else body = shipment;
    } else return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Endpoint non simulato"}' });
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return state;
}

test('autonomo: prepara, resta visibile e dopo refresh permette invio esplicito', async ({ page }) => {
  const state = await isolatedApi(page);
  await page.goto('/');
  const card = page.getByTestId('card-photobook-isolated');
  await expect(card).toBeVisible();
  await page.getByTestId('button-lock-isolated').click();
  await page.getByTestId('select-shipment-lab').click();
  await page.getByRole('option', { name: 'Laboratorio test' }).click();
  await page.getByTestId('button-confirm-lock').click();
  await expect(card).toBeVisible();
  await expect(card).toContainText('Email non ancora inviata', { ignoreCase: true });
  expect(state.sends).toBe(0);
  await page.reload();
  await expect(card).toBeVisible();
  await page.getByTestId('button-send-lab-email').click();
  await expect(card).toContainText('Email al laboratorio inviata.');
  expect(state.sends).toBe(1);
  await page.reload();
  await expect(card).toBeVisible();
  await expect(card).toContainText('Email al laboratorio inviata.');
  expect(state.book.jobId).toBeUndefined();
  expect(state.book.galleryId).toBeUndefined();
});

test('trasferimento parziale: invio disabilitato, retry e recupero caricamento', async ({ page }) => {
  const state = await isolatedApi(page, { locked: true, partial: true });
  state.loadError = true;
  await page.goto('/');
  await expect(page.getByTestId('card-photobook-isolated')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Il fotolibro resta disponibile');
  state.loadError = false;
  await page.getByRole('button', { name: 'Riprova caricamento spedizione' }).click();
  await expect(page.getByTestId('button-send-lab-email')).toBeDisabled();
  expect(state.sends).toBe(0);
  await page.getByTestId('button-retry-shipment-isolated').click();
  await expect(page.getByTestId('button-send-lab-email')).toBeEnabled();
  expect(state.retries).toBe(1);
  await page.reload();
  await expect(page.getByTestId('card-photobook-isolated')).toBeVisible();
});

test('email fallita: card presente, verifica esplicita e nuovo tentativo senza automatismi', async ({ page }) => {
  const state = await isolatedApi(page, { locked: true });
  state.sendError = true;
  await page.goto('/');
  await page.getByTestId('button-send-lab-email').click();
  await expect(page.getByText('Esito email da verificare: nessun nuovo invio automatico.')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('card-photobook-isolated')).toBeVisible();
  expect(state.sends).toBe(1);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Ho verificato: email non inviata' }).click();
  state.sendError = false;
  await expect(page.getByTestId('button-send-lab-email')).toBeEnabled();
  await page.getByTestId('button-send-lab-email').click();
  await expect(page.getByTestId('card-photobook-isolated')).toContainText('Email al laboratorio inviata.');
  expect(state.sends).toBe(2);
});

test('il fotolibro collegato resta nel suo gruppo dopo refresh', async ({ page }) => {
  await isolatedApi(page, { linked: true, locked: true });
  await page.goto('/');
  await expect(page.getByTestId('section-archived-linked-photobooks').getByTestId('card-photobook-isolated')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('section-archived-linked-photobooks').getByTestId('card-photobook-isolated')).toBeVisible();
});
