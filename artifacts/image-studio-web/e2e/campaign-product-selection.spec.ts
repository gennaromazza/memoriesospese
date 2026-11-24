import { expect, test } from "@playwright/test";

const harnessOrigin = `http://127.0.0.1:${process.env.CAMPAIGN_PRODUCT_SELECTION_E2E_PORT ?? "4191"}`;
const campaignId = "campaign-products";

async function blockExternalTraffic(page: import("@playwright/test").Page) {
  await page.route("**/*", async route => {
    if (new URL(route.request().url()).origin !== harnessOrigin) {
      await route.abort();
      return;
    }
    await route.continue();
  });
}

test("filtri e selezione multipla preservano i prodotti nascosti e il salvataggio", async ({ page }) => {
  await blockExternalTraffic(page);
  await page.goto("/");

  const editButton = page.getByTestId(`button-edit-${campaignId}`);
  await expect(editButton).toBeVisible();
  await editButton.click();

  const dialog = page.getByRole("dialog");
  const album = dialog.getByTestId("product-option-album-classic");
  const print30 = dialog.getByTestId("product-option-print-30");
  const print40 = dialog.getByTestId("product-option-print-40");
  const selectionCount = dialog.getByText("1 selezionati");

  await expect(album).toHaveAttribute("aria-pressed", "true");
  await expect(selectionCount).toBeVisible();

  const categorySelect = dialog.getByTestId("select-campaign-product-category");
  await categorySelect.click();
  await page.getByRole("option", { name: "Stampe (2)" }).click();
  await expect(print30).toBeVisible();
  await expect(album).toBeHidden();
  await expect(selectionCount).toBeVisible();

  const search = dialog.getByTestId("input-campaign-product-search");
  await search.fill("Stampa 30");
  await expect(print30).toBeVisible();
  await expect(print40).toBeHidden();
  await print30.click();
  await expect(dialog.getByText("2 selezionati")).toBeVisible();

  await search.fill("Stampa 40");
  await expect(print40).toBeVisible();
  await dialog.getByTestId("button-toggle-visible-campaign-products").click();
  await expect(dialog.getByText("3 selezionati")).toBeVisible();

  await dialog.getByRole("button", { name: /cancella ricerca prodotti/i }).click();
  await dialog.getByTestId("toggle-campaign-selected-products").click();
  await expect(dialog.getByTestId("toggle-campaign-selected-products")).toHaveAttribute("aria-pressed", "true");
  await expect(print30).toBeVisible();
  await expect(print40).toBeVisible();
  await expect(album).toBeHidden();

  await dialog.getByTestId("button-toggle-visible-campaign-products").click();
  await expect(dialog.getByText("1 selezionati")).toBeVisible();
  await dialog.getByTestId("toggle-campaign-selected-products").click();

  await categorySelect.click();
  await page.getByRole("option", { name: "Album e fotolibri (1)" }).click();
  await expect(album).toHaveAttribute("aria-pressed", "true");
  await expect(print30).toBeHidden();

  await categorySelect.click();
  await page.getByRole("option", { name: "Stampe (2)" }).click();
  await print30.click();
  await expect(dialog.getByText("2 selezionati")).toBeVisible();

  await dialog.getByTestId("button-save-campaign").click();
  await expect(dialog).toBeHidden();

  const persistedProducts = await page.evaluate(() => {
    const store = (window as any).__campaignSelectionMock;
    const saved = store.collections.booking_campaigns.get("campaign-products");
    return {
      selected: saved.prodottiDisponibili,
      updateCount: store.writes.filter((write: any) =>
        write.operation === "update" && write.id === "campaign-products",
      ).length,
    };
  });
  expect(persistedProducts).toEqual({
    selected: ["album-classic", "print-30"],
    updateCount: 1,
  });

  await page.getByTestId(`button-edit-${campaignId}`).click();
  const reopenedDialog = page.getByRole("dialog");
  await expect(reopenedDialog.getByTestId("product-option-album-classic")).toHaveAttribute("aria-pressed", "true");
  await expect(reopenedDialog.getByTestId("product-option-print-30")).toHaveAttribute("aria-pressed", "true");
  await expect(reopenedDialog.getByTestId("product-option-print-40")).toHaveAttribute("aria-pressed", "false");
});

test("controlli, nomi lunghi e scorrimento restano utilizzabili su mobile e desktop", async ({ page }) => {
  await blockExternalTraffic(page);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await page.getByTestId(`button-edit-${campaignId}`).click();
    const dialog = page.getByRole("dialog");
    const search = dialog.getByTestId("input-campaign-product-search");
    const categorySelect = dialog.getByTestId("select-campaign-product-category");
    const selectedToggle = dialog.getByTestId("toggle-campaign-selected-products");
    const list = dialog.getByTestId("campaign-product-list");

    await expect(search).toBeVisible();
    await expect(categorySelect).toBeVisible();
    await expect(selectedToggle).toBeVisible();
    await expect(dialog.getByTestId("button-toggle-visible-campaign-products")).toBeVisible();
    await expect(list).toBeVisible();

    const dialogBounds = await dialog.boundingBox();
    expect(dialogBounds).not.toBeNull();
    expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const listMetrics = await list.evaluate(element => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(listMetrics.scrollHeight).toBeGreaterThan(listMetrics.clientHeight);
    await list.evaluate(element => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await list.evaluate(element => {
      element.scrollTop = 0;
    });

    await categorySelect.click();
    const lastCategory = page.getByRole("option", {
      name: "Categoria fotografica con nome molto lungo 12 (1)",
    });
    await expect(lastCategory).toBeVisible();
    await lastCategory.click();

    const longProduct = dialog.getByTestId("product-option-product-extra-12");
    await expect(longProduct).toBeVisible();
    const productName = longProduct.locator("span.block.break-words").first();
    const wrapping = await productName.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        renderedTextLines: range.getClientRects().length,
      };
    });
    expect(wrapping.scrollWidth).toBeLessThanOrEqual(wrapping.clientWidth);
    expect(wrapping.renderedTextLines).toBeGreaterThan(1);

    await longProduct.click();
    await expect(longProduct).toHaveAttribute("aria-pressed", "true");
    await selectedToggle.click();
    await expect(longProduct).toBeVisible();
    await dialog.getByTestId("button-toggle-visible-campaign-products").click();
    await expect(longProduct).toBeHidden();
    await expect(dialog.getByText("1 selezionati")).toBeVisible();
    await selectedToggle.click();

    await categorySelect.click();
    await page.getByRole("option", { name: "Tutte le categorie (13)" }).click();
    await search.fill("Album ricordo con copertina fotografica");
    await expect(longProduct).toBeVisible();
    await selectedToggle.click();
    await expect(selectedToggle).toHaveAttribute("aria-pressed", "true");
    await expect(longProduct).toBeHidden();
    await selectedToggle.click();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});
