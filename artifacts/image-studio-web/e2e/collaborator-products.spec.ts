import { expect, test, type Page } from "@playwright/test";

const port = process.env.COLLABORATOR_PRODUCTS_E2E_PORT ?? "4180";
const localOrigin = `http://127.0.0.1:${port}`;
const harnessPath = "/admin/__e2e/collaborator-products";
const assignmentId = "assignment-products-e2e";

async function isolateBrowser(page: Page) {
  const apiRequests: string[] = [];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin !== localOrigin) {
      await route.abort();
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      apiRequests.push(`${request.method()} ${url.pathname}`);
      await route.abort();
      return;
    }

    await route.continue();
  });

  return apiRequests;
}

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
]) {
  test(`${viewport.name}: seleziona e rimuove prodotti, salvando ogni modifica dopo il reload`, async ({ page }) => {
    const apiRequests = await isolateBrowser(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(harnessPath);

    const summary = page.locator("body");
    await expect(summary).toContainText("Videomaker");
    await expect(summary).toContainText("Compenso");
    await expect(summary).toContainText("Pagato: €100.00");
    await expect(summary).toContainText("Residuo: €350.00");
    await expect(summary).not.toContainText(/mansioni|ritocco colore storico/i);

    const openProducts = page.locator(
      `[data-testid="button-assignment-products-${assignmentId}"]:visible`,
    );
    await expect(openProducts).toBeVisible();
    await openProducts.click();

    const dialog = page.getByRole("dialog", { name: "Gestisci prodotti assegnati" });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);

    const drone = dialog.getByTestId("checkbox-product-0");
    const album = dialog.getByTestId("checkbox-product-1");
    await expect(drone).toHaveAttribute("aria-checked", "true");
    await expect(album).toHaveAttribute("aria-checked", "false");

    await drone.click();
    await album.click();
    await dialog.getByTestId("button-submit-assignment-products").click();
    await expect(dialog).toBeHidden();

    await page.reload();
    await expect(summary).toContainText("Videomaker");
    await expect(summary).toContainText("Pagato: €100.00");
    await page.locator(
      `[data-testid="button-assignment-products-${assignmentId}"]:visible`,
    ).click();

    const reopenedDialog = page.getByRole("dialog", { name: "Gestisci prodotti assegnati" });
    await expect(reopenedDialog.getByTestId("checkbox-product-0")).toHaveAttribute("aria-checked", "false");
    await expect(reopenedDialog.getByTestId("checkbox-product-1")).toHaveAttribute("aria-checked", "true");
    await reopenedDialog.getByTestId("checkbox-product-1").click();
    await reopenedDialog.getByTestId("button-submit-assignment-products").click();
    await expect(reopenedDialog).toBeHidden();

    await page.reload();
    await page.locator(
      `[data-testid="button-assignment-products-${assignmentId}"]:visible`,
    ).click();
    const afterRemoval = page.getByRole("dialog", { name: "Gestisci prodotti assegnati" });
    await expect(afterRemoval.getByTestId("checkbox-product-0")).toHaveAttribute("aria-checked", "false");
    await expect(afterRemoval.getByTestId("checkbox-product-1")).toHaveAttribute("aria-checked", "false");
    await afterRemoval.getByRole("button", { name: "Annulla" }).click();

    await expect(summary).toContainText("Videomaker");
    await expect(summary).toContainText("Pagato: €100.00");
    await expect(summary).toContainText("Residuo: €350.00");
    await expect(summary).not.toContainText(/mansioni|ritocco colore storico/i);
    expect(apiRequests).toEqual([]);
  });
}