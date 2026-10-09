import { expect, test, type Page, type Route } from '@playwright/test';

const GALLERY_ID = 'e2e-wedding-cover';
const SLUG = 'anna-e-luca';
const PHOTO_1 = {
  id: 'photo-1',
  name: 'cerimonia.jpg',
  url: 'https://images.example.test/wedding-e2e/photo-1.svg',
  chapterTitle: 'Cerimonia',
};
const PHOTO_2 = {
  id: 'photo-2',
  name: 'ritratto.jpg',
  url: 'https://images.example.test/wedding-e2e/photo-2.svg',
  chapterTitle: 'Ritratto',
};

type FixtureState = {
  selectedPhotoIds: string[];
  requestedCoverPhotoId: string;
  availablePhotos: typeof PHOTO_1[];
  failFirstSelectionSave: boolean;
  selectionAttempts: number;
  selectionWrites: Array<{ selectedPhotoIds: string[]; coverPhotoId?: string }>;
};

function resolvedPhotos(state: FixtureState) {
  const available = state.availablePhotos.filter(photo => state.selectedPhotoIds.includes(photo.id));
  const selectedCover = available.find(photo => photo.id === state.requestedCoverPhotoId);
  const cover = selectedCover || available[0];
  return cover ? [cover, ...available.filter(photo => photo.id !== cover.id)] : [];
}

function storyContext(state: FixtureState) {
  return {
    story: {
      id: 'e2e-story',
      galleryId: GALLERY_ID,
      jobId: 'e2e-job',
      status: 'published',
      slug: SLUG,
      title: 'Anna e Luca',
      excerpt: 'Un matrimonio a Roma.',
      story: '## Una giornata speciale\n\nUna storia di prova per verificare la copertina.',
      seoTitle: 'Anna e Luca | Real Wedding',
      seoDescription: 'Il matrimonio di Anna e Luca a Roma.',
      selectedPhotoIds: state.selectedPhotoIds,
      coverPhotoId: state.requestedCoverPhotoId,
      approvedSourceIds: [],
    },
    gallery: { id: GALLERY_ID, name: 'Matrimonio Anna e Luca', jobType: 'matrimonio' },
    sources: [],
    jobFacts: null,
  };
}

function publicStory(state: FixtureState) {
  return {
    slug: SLUG,
    title: 'Anna e Luca',
    excerpt: 'Un matrimonio a Roma.',
    story: '## Una giornata speciale\n\nUna storia di prova per verificare la copertina.',
    seoTitle: 'Anna e Luca | Real Wedding',
    seoDescription: 'Il matrimonio di Anna e Luca a Roma.',
    photos: resolvedPhotos(state),
    vendors: [],
  };
}

async function jsonResponse(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'cache-control': 'no-cache, no-store, must-revalidate' },
    body: JSON.stringify(body),
  });
}

async function installApiFixtures(page: Page, state: FixtureState) {
  await page.route('**/api/wedding-seo/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === 'GET' && path.endsWith(`/gallery/${GALLERY_ID}`)) {
      return jsonResponse(route, storyContext(state));
    }

    if (request.method() === 'PUT' && path.endsWith(`/gallery/${GALLERY_ID}/selection`)) {
      const payload = request.postDataJSON() as { selectedPhotoIds: string[]; coverPhotoId?: string };
      state.selectionAttempts += 1;
      if (state.failFirstSelectionSave && state.selectionAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Salvataggio temporaneamente non disponibile.' }),
        });
      }
      state.selectionWrites.push(payload);
      state.selectedPhotoIds = payload.selectedPhotoIds;
      state.requestedCoverPhotoId = payload.coverPhotoId || '';
      return jsonResponse(route, {
        selectedPhotoIds: state.selectedPhotoIds,
        coverPhotoId: state.requestedCoverPhotoId,
      });
    }

    if (request.method() === 'GET' && path.endsWith('/api/wedding-seo/public')) {
      const [cover] = resolvedPhotos(state);
      return jsonResponse(route, {
        stories: [{
          slug: SLUG,
          title: 'Anna e Luca',
          excerpt: 'Un matrimonio a Roma.',
          publishedAt: '2100-12-31T23:59:59.999Z',
          coverImage: cover?.url,
        }],
      });
    }

    if (request.method() === 'GET' && path.endsWith(`/public/${SLUG}`)) {
      return jsonResponse(route, publicStory(state));
    }

    return route.continue();
  });

  await page.route('https://images.example.test/wedding-e2e/*.svg', async route => {
    const isSecond = route.request().url().includes('photo-2.svg');
    const color = isSecond ? '#c45679' : '#54735b';
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${color}"/></svg>`,
    });
  });
}

async function expectLoadedImage(locator: ReturnType<Page['locator']>, expectedUrl: string) {
  await expect(locator).toHaveAttribute('src', expectedUrl);
  await expect(locator).toHaveJSProperty('complete', true);
  await expect.poll(() => locator.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
}

async function tabToButton(page: Page, button: ReturnType<Page['getByRole']>, direction: 'forward' | 'backward' = 'forward') {
  const key = direction === 'forward' ? 'Tab' : 'Shift+Tab';
  for (let i = 0; i < 100; i += 1) {
    await page.keyboard.press(key);
    if (await button.evaluate(element => element === document.activeElement)) return;
  }
  throw new Error(`Non è stato possibile raggiungere con ${key} il pulsante ${await button.getAttribute('aria-label')}.`);
}

test('la copertina scelta nell’editor compare in Home e nella hero dopo il ricaricamento, con fallback se rimossa', async ({ page }) => {
  test.setTimeout(60_000);
  const state: FixtureState = {
    selectedPhotoIds: [PHOTO_1.id, PHOTO_2.id],
    requestedCoverPhotoId: PHOTO_1.id,
    availablePhotos: [PHOTO_1, PHOTO_2],
    failFirstSelectionSave: false,
    selectionAttempts: 0,
    selectionWrites: [],
  };
  await installApiFixtures(page, state);

  await page.goto('/e2e/fixtures/wedding-seo-cover-harness.html');
  await expect(page.getByRole('button', { name: 'Copertina cerimonia.jpg' })).toBeVisible();
  await page.getByRole('button', { name: 'Copertina ritratto.jpg' }).click();
  await expect(page.getByText('Selezione foto e copertina salvata automaticamente.')).toBeVisible();
  await expect.poll(() => state.selectionWrites.length).toBe(1);
  expect(state.selectionWrites[0]).toEqual({
    selectedPhotoIds: [PHOTO_1.id, PHOTO_2.id],
    coverPhotoId: PHOTO_2.id,
  });

  const newCoverUrl = PHOTO_2.url;
  // Home ordina insieme ai post Blog e ai Real Wedding e mostra solo i primi
  // tre: la data fixture futura mantiene visibile la card nel test isolato.
  await page.goto('/');
  const homeCard = page.getByRole('link', { name: /Anna e Luca/ }).filter({ hasText: 'Real Wedding' });
  await homeCard.scrollIntoViewIfNeeded();
  await expectLoadedImage(homeCard.locator('img'), newCoverUrl);

  await page.goto(`/real-wedding/${SLUG}`);
  let hero = page.locator('article > img').first();
  await expectLoadedImage(hero, newCoverUrl);
  await page.reload();
  hero = page.locator('article > img').first();
  await expectLoadedImage(hero, newCoverUrl);

  // La foto scelta viene rimossa dalla galleria ma il suo ID resta quello
  // memorizzato come copertina: le API pubbliche ripiegano sulla prima foto
  // selezionata ancora disponibile e entrambe le pagine devono renderla.
  state.availablePhotos = [PHOTO_1];
  await page.goto('/');
  const fallbackCard = page.getByRole('link', { name: /Anna e Luca/ }).filter({ hasText: 'Real Wedding' });
  await fallbackCard.scrollIntoViewIfNeeded();
  await expectLoadedImage(fallbackCard.locator('img'), PHOTO_1.url);

  await page.goto(`/real-wedding/${SLUG}`);
  hero = page.locator('article > img').first();
  await expectLoadedImage(hero, PHOTO_1.url);
});

test('la copertina si cambia da tastiera e la selezione viene salvata automaticamente', async ({ page }) => {
  const state: FixtureState = {
    selectedPhotoIds: [PHOTO_1.id, PHOTO_2.id],
    requestedCoverPhotoId: PHOTO_1.id,
    availablePhotos: [PHOTO_1, PHOTO_2],
    failFirstSelectionSave: false,
    selectionAttempts: 0,
    selectionWrites: [],
  };
  await installApiFixtures(page, state);

  await page.goto('/e2e/fixtures/wedding-seo-cover-harness.html');
  const ceremonyCover = page.getByRole('button', { name: 'Copertina cerimonia.jpg' });
  const portraitCover = page.getByRole('button', { name: 'Copertina ritratto.jpg' });
  await expect(ceremonyCover).toMatchAriaSnapshot('- button "Copertina cerimonia.jpg" [pressed]');
  await expect(portraitCover).toMatchAriaSnapshot('- button "Copertina ritratto.jpg" [pressed=false]');
  await expect(portraitCover).toBeVisible();
  await tabToButton(page, portraitCover);
  await expect(portraitCover).toBeFocused();
  await expect(portraitCover).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Enter');

  await expect(portraitCover).toMatchAriaSnapshot('- button "Copertina ritratto.jpg" [pressed]');
  await expect(ceremonyCover).toMatchAriaSnapshot('- button "Copertina cerimonia.jpg" [pressed=false]');
  await expect(page.getByRole('status').filter({ hasText: 'Copertina selezionata: ritratto.jpg.' }))
    .toHaveText('Copertina selezionata: ritratto.jpg.');
  await expect(page.getByText('Selezione foto e copertina salvata automaticamente.')).toBeVisible();
  await expect.poll(() => state.selectionWrites.length).toBe(1);
  expect(state.selectionWrites[0]).toEqual({
    selectedPhotoIds: [PHOTO_1.id, PHOTO_2.id],
    coverPhotoId: PHOTO_2.id,
  });

  await tabToButton(page, ceremonyCover, 'backward');
  await expect(ceremonyCover).toBeFocused();
  await expect(ceremonyCover).toMatchAriaSnapshot('- button "Copertina cerimonia.jpg" [pressed=false]');
  await page.keyboard.press('Space');
  await expect(ceremonyCover).toMatchAriaSnapshot('- button "Copertina cerimonia.jpg" [pressed]');
  await expect(portraitCover).toMatchAriaSnapshot('- button "Copertina ritratto.jpg" [pressed=false]');
  await expect(page.getByRole('status').filter({ hasText: 'Copertina selezionata: cerimonia.jpg.' }))
    .toHaveText('Copertina selezionata: cerimonia.jpg.');
  await expect(page.getByRole('status').filter({ hasText: 'Salvataggio automatico della selezione…' }))
    .toHaveText('Salvataggio automatico della selezione…');
  await expect(page.getByRole('status').filter({ hasText: 'Selezione foto e copertina salvata automaticamente.' }))
    .toHaveText('Selezione foto e copertina salvata automaticamente.');
  await expect.poll(() => state.selectionWrites.length).toBe(2);
  expect(state.selectionWrites[1]).toEqual({
    selectedPhotoIds: [PHOTO_1.id, PHOTO_2.id],
    coverPhotoId: PHOTO_1.id,
  });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Copertina cerimonia.jpg' }))
    .toMatchAriaSnapshot('- button "Copertina cerimonia.jpg" [pressed]');
  await expect(page.getByRole('button', { name: 'Copertina ritratto.jpg' }))
    .toMatchAriaSnapshot('- button "Copertina ritratto.jpg" [pressed=false]');
});

test('rimuovendo la copertina dalla storia viene salvata e mantenuta la prossima foto valida', async ({ page }) => {
  const state: FixtureState = {
    selectedPhotoIds: [PHOTO_1.id, PHOTO_2.id],
    requestedCoverPhotoId: PHOTO_1.id,
    availablePhotos: [PHOTO_1, PHOTO_2],
    failFirstSelectionSave: false,
    selectionAttempts: 0,
    selectionWrites: [],
  };
  await installApiFixtures(page, state);

  await page.goto('/e2e/fixtures/wedding-seo-cover-harness.html');
  const ceremonyCover = page.getByRole('button', { name: 'Copertina cerimonia.jpg' });
  const portraitCover = page.getByRole('button', { name: 'Copertina ritratto.jpg' });
  await expect(ceremonyCover).toMatchAriaSnapshot('- button "Copertina cerimonia.jpg" [pressed]');

  await page.getByRole('button', { name: 'Seleziona cerimonia.jpg' }).click();

  await expect(ceremonyCover).toHaveAttribute('aria-pressed', 'false');
  await expect(portraitCover).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: 'Selezione foto e copertina salvata automaticamente.' }))
    .toHaveText('Selezione foto e copertina salvata automaticamente.');
  await expect.poll(() => state.selectionWrites.length).toBe(1);
  expect(state.selectionWrites[0]).toEqual({
    selectedPhotoIds: [PHOTO_2.id],
    coverPhotoId: PHOTO_2.id,
  });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Copertina ritratto.jpg' }))
    .toMatchAriaSnapshot('- button "Copertina ritratto.jpg" [pressed]');
  await expect(page.getByRole('button', { name: 'Copertina cerimonia.jpg' }))
    .toMatchAriaSnapshot('- button "Copertina cerimonia.jpg" [pressed=false]');
});

test('dopo un errore il comando di riprova salva la copertina scelta senza cambiare foto', async ({ page }) => {
  const state: FixtureState = {
    selectedPhotoIds: [PHOTO_1.id, PHOTO_2.id],
    requestedCoverPhotoId: PHOTO_1.id,
    availablePhotos: [PHOTO_1, PHOTO_2],
    failFirstSelectionSave: true,
    selectionAttempts: 0,
    selectionWrites: [],
  };
  await installApiFixtures(page, state);

  await page.goto('/e2e/fixtures/wedding-seo-cover-harness.html');
  await expect(page.getByRole('button', { name: 'Copertina cerimonia.jpg' })).toBeVisible();
  await page.getByRole('button', { name: 'Copertina ritratto.jpg' }).click();
  await expect(page.getByRole('alert')).toContainText('Salvataggio automatico non riuscito');
  await expect(page.getByText('Selezione foto e copertina salvata automaticamente.')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Riprova il salvataggio' })).toBeVisible();
  await expect.poll(() => state.selectionAttempts).toBe(1);
  expect(state.selectionWrites).toHaveLength(0);
  expect(state.requestedCoverPhotoId).toBe(PHOTO_1.id);

  await page.getByRole('button', { name: 'Riprova il salvataggio' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Selezione foto e copertina salvata automaticamente.' }))
    .toHaveText('Selezione foto e copertina salvata automaticamente.');
  await expect.poll(() => state.selectionAttempts).toBe(2);
  expect(state.selectionWrites).toEqual([{
    selectedPhotoIds: [PHOTO_1.id, PHOTO_2.id],
    coverPhotoId: PHOTO_2.id,
  }]);
  expect(state.requestedCoverPhotoId).toBe(PHOTO_2.id);
});
