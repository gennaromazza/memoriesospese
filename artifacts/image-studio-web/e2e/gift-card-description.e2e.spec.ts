import { expect, test } from '@playwright/test';

test('completare una descrizione mantiene la gift card in bozza e permette di salvarla', async ({ page }) => {
  const port = process.env.GIFT_CARD_DESCRIPTION_E2E_PORT ?? '4198';
  const localOrigin = `http://127.0.0.1:${port}`;
  const externalRequests: string[] = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== localOrigin) {
      if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        await route.abort();
        return;
      }
      externalRequests.push(url.origin);
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Nuovo tipo' }).click();

  await page.getByLabel('Nome nel catalogo').fill('Regalo test descrizione');
  await page.getByLabel('Titolo sulla card').fill('Il mio regalo');
  await page.getByLabel('Cosa include, in parole tue').fill('Shooting e ricordi stampati');
  await page.getByRole('button', { name: 'Avanti' }).click();

  await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await expect(page.getByText(/Descrizione del catalogo mancante/)).toBeVisible();
  await page.getByLabel('Quantità di Shooting test').fill('2');

  await page.getByRole('button', {
    name: 'Completa descrizione di Shooting test nel catalogo prodotti',
  }).click();
  const productDialog = page.getByRole('dialog', { name: 'Modifica Prodotto' });
  await expect(productDialog).toBeVisible();
  await expect(productDialog.getByTestId('input-product-name')).toHaveValue('Shooting test');

  const description = 'Servizio fotografico con galleria digitale.';
  await productDialog.getByTestId('input-product-description').fill(description);
  await productDialog.getByTestId('button-save-product').click();
  await expect(productDialog).toBeHidden();

  await expect(page.getByText(/Descrizione del catalogo mancante/)).toHaveCount(0);
  const chosenProducts = page.getByRole('region', { name: 'Nel regalo (1)' });
  await expect(chosenProducts.getByText(description, { exact: true })).toBeVisible();
  await expect(chosenProducts.getByLabel('Quantità di Shooting test')).toHaveValue('2');

  await page.getByRole('button', { name: 'Il regalo' }).click();
  await expect(page.getByLabel('Nome nel catalogo')).toHaveValue('Regalo test descrizione');
  await expect(page.getByLabel('Titolo sulla card')).toHaveValue('Il mio regalo');
  await expect(page.getByLabel('Cosa include, in parole tue')).toHaveValue('Shooting e ricordi stampati');

  await page.getByRole('button', { name: 'Prodotti e prezzo' }).click();
  await page.getByLabel('Prezzo di vendita del regalo (€)').fill('75');
  await page.getByRole('button', { name: 'Grafica' }).click();
  await page.getByRole('button', { name: 'Validità' }).click();
  await page.getByRole('button', { name: 'Dove si vende' }).click();
  await page.getByRole('button', { name: 'Crea il regalo' }).click();

  await expect.poll(() => page.evaluate(() => {
    const state = (window as any).__giftCardDescriptionE2E;
    return state.savedGiftCards.length;
  })).toBe(1);

  const state = await page.evaluate(() => (window as any).__giftCardDescriptionE2E);
  expect(state.productUpdates).toEqual([{
    productId: 'e2e-product-shooting',
    description,
  }]);
  expect(state.savedGiftCards[0]).toMatchObject({
    name: 'Regalo test descrizione',
    title: 'Il mio regalo',
    description: 'Shooting e ricordi stampati',
    priceCents: 7500,
    items: [{ productId: 'e2e-product-shooting', quantity: 2 }],
  });

  const previousQueryClientGeneration = await page.evaluate(
    () => (window as any).__giftCardDescriptionQueryClientGeneration as number,
  );
  await page.reload();
  await expect.poll(() => page.evaluate(
    () => (window as any).__giftCardDescriptionQueryClientGeneration as number,
  )).toBe(previousQueryClientGeneration + 1);
  await expect(page.getByLabel('Nome nel catalogo')).toHaveValue('Regalo test descrizione');
  await expect(page.getByLabel('Titolo sulla card')).toHaveValue('Il mio regalo');
  await expect(page.getByLabel('Cosa include, in parole tue')).toHaveValue('Shooting e ricordi stampati');

  await page.getByRole('button', { name: 'Prodotti e prezzo' }).click();
  const reloadedProducts = page.getByRole('region', { name: 'Nel regalo (1)' });
  await expect(reloadedProducts.getByText('Shooting test', { exact: true })).toBeVisible();
  await expect(reloadedProducts.getByText(description, { exact: true })).toBeVisible();
  await expect(reloadedProducts.getByLabel('Quantità di Shooting test')).toHaveValue('2');

  const reloadedState = await page.evaluate(() => (window as any).__giftCardDescriptionE2E);
  expect(reloadedState.listTypesCalls).toBeGreaterThan(0);
  expect(reloadedState.savedGiftCards).toHaveLength(1);
  expect(reloadedState.savedGiftCards[0]).toMatchObject({
    name: 'Regalo test descrizione',
    description: 'Shooting e ricordi stampati',
    items: [{ productId: 'e2e-product-shooting', quantity: 2 }],
  });
  expect(externalRequests).toEqual([]);
});
