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
});
