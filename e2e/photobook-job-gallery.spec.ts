import { expect, test } from "@playwright/test";

test.describe("Fotolibro – riallineamento Job e galleria", () => {
  test("sceglie la prima galleria collegata quando le gallerie arrivano dopo il Job", async ({
    page,
  }) => {
    await page.route("**/api/photobooks**", async (route) => {
      const request = route.request();
      if (request.method() !== "GET") return route.continue();

      const pathname = new URL(request.url()).pathname;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: pathname.endsWith("/requests")
          ? JSON.stringify({ requests: [] })
          : JSON.stringify({ photobooks: [] }),
      });
    });

    await page.goto("/admin/__e2e/photobook-job-gallery");
    await expect(page.getByTestId("button-create-photobook")).toBeVisible();
    await page.getByTestId("button-create-photobook").click();

    const nameInput = page.getByTestId("input-photobook-name");
    const confirmCreateButton = page.getByTestId("button-confirm-create-photobook");
    await nameInput.fill("Fotolibro con caricamento asincrono");

    const jobTrigger = page.getByTestId("select-photobook-job-trigger");
    await expect(jobTrigger).toBeVisible();
    await jobTrigger.click();
    await page
      .getByTestId("select-photobook-job-option-job-with-late-galleries")
      .click();

    const galleryTrigger = page.getByTestId("select-photobook-gallery");
    await expect(galleryTrigger).toContainText("Seleziona la galleria");
    await expect(jobTrigger).toContainText("Matrimonio con gallerie in ritardo");
    await expect(confirmCreateButton).toBeDisabled();

    await page.evaluate(() => {
      window.__photobookE2EReleaseGalleries?.();
    });

    await expect(galleryTrigger).toContainText("Prima galleria collegata");
    await expect(galleryTrigger).not.toContainText("Seconda galleria collegata");
    await expect(confirmCreateButton).toBeEnabled();

    await galleryTrigger.click();
    await page
      .getByRole("option", { name: "Seconda galleria collegata (20 foto)" })
      .click();
    await expect(galleryTrigger).toContainText("Seconda galleria collegata");

    await jobTrigger.click();
    await page
      .getByTestId("select-photobook-job-option-job-with-late-galleries")
      .click();
    await expect(galleryTrigger).toContainText("Seconda galleria collegata");
  });
});