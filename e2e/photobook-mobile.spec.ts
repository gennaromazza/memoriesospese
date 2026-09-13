import { devices, expect, test } from "@playwright/test";

const TOKEN = "mobile-review-test";

const pages = [1, 2, 3].map((pageNumber) => ({
  id: `page-${pageNumber}`,
  photobookId: "book-mobile",
  version: 1,
  pageNumber,
  fileName: `pagina-${pageNumber}.svg`,
  url: `/e2e-photobook-page-${pageNumber}.svg`,
  width: 1200,
  height: 800,
}));

const { defaultBrowserType: _defaultBrowserType, ...iPhoneLandscape } =
  devices["iPhone 13 landscape"];

test.use({
  ...iPhoneLandscape,
});

test.describe("Fotolibro – sfoglio smartphone", () => {
  test("mostra una pagina, sfoglia con swipe e gestisce l'approvazione nell'header", async ({
    page,
  }) => {
    let hasPendingRequest = false;

    await page.addInitScript((token) => {
      localStorage.removeItem(`pb_slide_${token}`);
    }, TOKEN);

    await page.route("**/e2e-photobook-page-*.svg", async (route) => {
      const pageNumber = new URL(route.request().url()).pathname.match(/(\d+)\.svg$/)?.[1] ?? "1";
      await route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
          <rect width="1200" height="800" fill="#ede4d8"/>
          <text x="600" y="420" text-anchor="middle" font-size="120">Pagina ${pageNumber}</text>
        </svg>`,
      });
    });

    await page.route(`**/api/photobooks/by-token/${TOKEN}**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/gallery-photos")) {
        return route.fulfill({ json: { photos: [], chapters: [] } });
      }
      if (url.pathname.endsWith("/approve")) {
        return route.fulfill({ json: { ok: true, approved: true } });
      }

      return route.fulfill({
        json: {
          photobook: {
            id: "book-mobile",
            name: "Album smartphone",
            token: TOKEN,
            currentVersion: 1,
            versions: [{ version: 1, pageCount: pages.length }],
            locked: false,
            approval: null,
          },
          version: 1,
          pages,
          requests: hasPendingRequest
            ? [
                {
                  id: "request-pending",
                  photobookId: "book-mobile",
                  photobookName: "Album smartphone",
                  galleryId: "gallery-mobile",
                  version: 1,
                  pageId: "page-1",
                  pageNumber: 1,
                  type: "edit",
                  note: "Correzione in lavorazione",
                  status: "pending",
                  batchId: "batch-mobile",
                  createdAt: "2026-09-13T10:00:00.000Z",
                },
              ]
            : [],
        },
      });
    });

    await page.goto(`/fotolibro/${TOKEN}`);

    const header = page.locator("header");
    const approveButton = header.getByTestId("button-open-approve");
    await expect(approveButton).toBeVisible();
    await expect(page.getByTestId("card-approve")).toHaveCount(0);

    await expect(page.getByAltText("Pagina 1")).toBeVisible();
    await expect(page.getByAltText("Pagina 2")).toHaveCount(0);
    await expect(page.getByAltText("Pagina 3")).toHaveCount(0);
    await expect(page.getByTestId("button-page-pill-slide")).toHaveText("Pagina 1 di 3");

    const firstPageBounds = await page.getByAltText("Pagina 1").boundingBox();
    const viewport = page.viewportSize();
    expect(firstPageBounds).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(firstPageBounds!.y).toBeGreaterThanOrEqual(0);
    expect(firstPageBounds!.y + firstPageBounds!.height).toBeLessThanOrEqual(viewport!.height);

    const swipeTarget = page.locator("main").getByText("Pagina 1", { exact: true }).locator("..");
    const swipeBounds = await swipeTarget.boundingBox();
    expect(swipeBounds).not.toBeNull();
    const y = swipeBounds!.y + Math.min(80, swipeBounds!.height / 2);
    await page.touchscreen.tap(swipeBounds!.x + swipeBounds!.width - 30, y);
    await swipeTarget.evaluate(
      (element, points) => {
        const start = new Event("touchstart", { bubbles: true, cancelable: true });
        Object.defineProperty(start, "touches", {
          value: [{ clientX: points.startX, clientY: points.y }],
        });
        element.dispatchEvent(start);

        const end = new Event("touchend", { bubbles: true, cancelable: true });
        Object.defineProperty(end, "changedTouches", {
          value: [{ clientX: points.endX, clientY: points.y }],
        });
        element.dispatchEvent(end);
      },
      {
        startX: swipeBounds!.x + swipeBounds!.width - 40,
        endX: swipeBounds!.x + 40,
        y,
      },
    );

    await expect(page.getByAltText("Pagina 2")).toBeVisible();
    await expect(page.getByAltText("Pagina 1")).toHaveCount(0);
    await expect(page.getByTestId("button-page-pill-slide")).toHaveText("Pagina 2 di 3");

    await approveButton.click();
    await expect(page.getByRole("dialog")).toContainText("Approvi l'impaginato?");
    await page.getByRole("button", { name: "Torna alla revisione", exact: true }).click();

    hasPendingRequest = true;
    await page.reload();

    const disabledApproveButton = header.getByTestId("button-open-approve");
    await expect(page.getByTestId("photobook-header-status")).toContainText("richieste in attesa");
    await expect(disabledApproveButton).toBeDisabled();
    await expect(disabledApproveButton).toHaveAttribute(
      "title",
      "Attendi la lavorazione delle richieste",
    );
  });
});