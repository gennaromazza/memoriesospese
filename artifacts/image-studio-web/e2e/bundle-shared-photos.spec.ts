import { expect, test } from "@playwright/test";

const harnessPath = "/";
const bundleId = "bundle-shared-photos";
const localOrigin = `http://127.0.0.1:${process.env.BUNDLE_SHARED_PHOTOS_E2E_PORT ?? "4190"}`;

async function blockExternalTraffic(page: import("@playwright/test").Page) {
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin !== localOrigin) {
      await route.abort();
      return;
    }
    await route.continue();
  });
}

test("salva e ricarica Foto condivise e il prodotto sorgente dal Firestore mockato", async ({ page }) => {
  await blockExternalTraffic(page);
  await page.goto(harnessPath);

  const editButton = page.getByTestId(`button-edit-product-${bundleId}`);
  await expect(editButton).toBeVisible();
  await editButton.click();

  const dialog = page.getByRole("dialog");
  const sharedPhotos = dialog.getByTestId("switch-bundle-shared-photos");
  await expect(sharedPhotos).toHaveAttribute("aria-checked", "false");
  await sharedPhotos.click();

  const sourceSelect = dialog.getByTestId("select-bundle-photo-source");
  await sourceSelect.click();
  await page.getByRole("option", { name: "Shooting · 40 foto" }).click();
  await expect(sourceSelect).toContainText("Shooting · 40 foto");
  await dialog.getByTestId("button-save-product").click();
  await expect(dialog).toBeHidden();

  const persistedSettings = await page.evaluate(() => {
    const store = (window as any).__bundlePhotoMock;
    const bundle = store.collections.products.get("bundle-shared-photos");
    return {
      fotoCondivise: bundle.fotoCondivise,
      prodottoSorgenteFotoId: bundle.prodottoSorgenteFotoId,
      updateCount: store.writes.filter((write: any) =>
        write.operation === "update" && write.id === "bundle-shared-photos",
      ).length,
    };
  });
  expect(persistedSettings).toEqual({
    fotoCondivise: true,
    prodottoSorgenteFotoId: "source-shooting",
    updateCount: 1,
  });

  await page.getByTestId(`button-edit-product-${bundleId}`).click();
  const reopenedDialog = page.getByRole("dialog");
  await expect(reopenedDialog.getByTestId("switch-bundle-shared-photos"))
    .toHaveAttribute("aria-checked", "true");
  await expect(reopenedDialog.getByTestId("select-bundle-photo-source"))
    .toContainText("Shooting · 40 foto");
});

test("impedisce il salvataggio delle Foto condivise senza una sorgente valida", async ({ page }) => {
  await blockExternalTraffic(page);
  await page.goto(harnessPath);
  await page.getByTestId(`button-edit-product-${bundleId}`).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("switch-bundle-shared-photos").click();
  await expect(dialog.getByTestId("select-bundle-photo-source"))
    .toContainText("Seleziona il prodotto sorgente");
  await dialog.getByTestId("button-save-product").click();

  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("harness-toast"))
    .toContainText("Seleziona la galleria sorgente");
  const stateAfterRejectedSave = await page.evaluate(() => {
    const store = (window as any).__bundlePhotoMock;
    const bundle = store.collections.products.get("bundle-shared-photos");
    return {
      fotoCondivise: bundle.fotoCondivise,
      prodottoSorgenteFotoId: bundle.prodottoSorgenteFotoId,
      writes: store.writes.length,
    };
  });
  expect(stateAfterRejectedSave).toEqual({
    fotoCondivise: false,
    prodottoSorgenteFotoId: "",
    writes: 0,
  });

  await dialog.getByTestId("switch-bundle-shared-photos").click();
  await dialog.getByTestId("button-save-product").click();
  await expect(dialog).toBeHidden();
  const disabledSharedPhotos = await page.evaluate(() => {
    const bundle = (window as any).__bundlePhotoMock.collections.products.get("bundle-shared-photos");
    return {
      fotoCondivise: bundle.fotoCondivise,
      prodottoSorgenteFotoId: bundle.prodottoSorgenteFotoId,
    };
  });
  expect(disabledSharedPhotos).toEqual({ fotoCondivise: false, prodottoSorgenteFotoId: "" });
});

test("la rimozione della sorgente richiede un'altra sorgente o la disattivazione delle foto condivise", async ({ page }) => {
  await blockExternalTraffic(page);
  await page.goto(harnessPath);
  await page.getByTestId(`button-edit-product-${bundleId}`).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("switch-bundle-shared-photos").click();
  const sourceSelect = dialog.getByTestId("select-bundle-photo-source");
  await sourceSelect.click();
  await page.getByRole("option", { name: "Shooting · 40 foto" }).click();
  await dialog.getByTestId("button-remove-bundle-product-source-shooting").click();
  await expect(dialog.getByTestId("select-bundle-photo-source"))
    .toContainText("Seleziona il prodotto sorgente");
  await expect(dialog.getByTestId("bundle-photo-source-error"))
    .toContainText("Scegli un altro prodotto");

  await dialog.getByTestId("button-save-product").click();
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("harness-toast"))
    .toContainText("Seleziona la galleria sorgente");
  expect(await page.evaluate(() =>
    (window as any).__bundlePhotoMock.writes.length,
  )).toBe(0);

  await dialog.getByTestId("select-bundle-photo-source").click();
  await page.getByRole("option", { name: "Album · 10 foto" }).click();
  await dialog.getByTestId("button-save-product").click();
  await expect(dialog).toBeHidden();
  const savedBundle = await page.evaluate(() => {
    const store = (window as any).__bundlePhotoMock;
    const bundle = store.collections.products.get("bundle-shared-photos");
    return {
      fotoCondivise: bundle.fotoCondivise,
      prodottoSorgenteFotoId: bundle.prodottoSorgenteFotoId,
      bundleItems: bundle.bundleItems.map((item: any) => item.prodottoId),
    };
  });
  expect(savedBundle).toEqual({
    fotoCondivise: true,
    prodottoSorgenteFotoId: "component-album",
    bundleItems: ["component-album"],
  });
});

test("riaprendo un bundle non seleziona una sorgente eliminata dal catalogo", async ({ page }) => {
  await blockExternalTraffic(page);
  await page.goto(harnessPath);
  await page.getByTestId(`button-edit-product-${bundleId}`).click();
  const setupDialog = page.getByRole("dialog");
  await setupDialog.getByTestId("switch-bundle-shared-photos").click();
  await setupDialog.getByTestId("select-bundle-photo-source").click();
  await page.getByRole("option", { name: "Shooting · 40 foto" }).click();
  await setupDialog.getByTestId("button-save-product").click();
  await expect(setupDialog).toBeHidden();

  await page.getByTestId("button-delete-product-source-shooting").click();
  await page.getByTestId("button-confirm-delete").click();
  await expect(page.getByTestId("button-edit-product-source-shooting")).toHaveCount(0);
  await expect(page.getByText("Sorgente da configurare")).toBeVisible();

  await page.getByTestId(`button-edit-product-${bundleId}`).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("select-bundle-photo-source"))
    .toContainText("Seleziona il prodotto sorgente");
  await expect(dialog.getByTestId("bundle-photo-source-error")).toBeVisible();
});

test("azzerare le foto della sorgente rende non valida la configurazione condivisa", async ({ page }) => {
  await blockExternalTraffic(page);
  await page.goto(harnessPath);
  await page.evaluate(() => {
    const bundle = (window as any).__bundlePhotoMock.collections.products.get("bundle-shared-photos");
    bundle.fotoCondivise = true;
    bundle.prodottoSorgenteFotoId = "source-shooting";
  });

  await page.getByTestId("button-edit-product-source-shooting").click();
  const sourceDialog = page.getByRole("dialog");
  await sourceDialog.getByTestId("input-product-photos").fill("0");
  await sourceDialog.getByTestId("button-save-product").click();
  await expect(sourceDialog).toBeHidden();

  await page.getByTestId(`button-edit-product-${bundleId}`).click();
  const bundleDialog = page.getByRole("dialog");
  await expect(bundleDialog.getByTestId("select-bundle-photo-source"))
    .toContainText("Seleziona il prodotto sorgente");
  await expect(bundleDialog.getByTestId("bundle-photo-source-error"))
    .toContainText("La sorgente della galleria condivisa non è più valida");

  await bundleDialog.getByTestId("button-save-product").click();
  await expect(bundleDialog).toBeVisible();
  await expect(page.getByTestId("harness-toast"))
    .toContainText("Seleziona la galleria sorgente");
  const persistedBundle = await page.evaluate(() => {
    const store = (window as any).__bundlePhotoMock;
    const bundle = store.collections.products.get("bundle-shared-photos");
    return {
      fotoCondivise: bundle.fotoCondivise,
      prodottoSorgenteFotoId: bundle.prodottoSorgenteFotoId,
      bundleWrites: store.writes.filter((write: any) =>
        write.operation === "update" && write.id === "bundle-shared-photos",
      ).length,
    };
  });
  expect(persistedBundle).toEqual({
    fotoCondivise: true,
    prodottoSorgenteFotoId: "source-shooting",
    bundleWrites: 0,
  });
});
