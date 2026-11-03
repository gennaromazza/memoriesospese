import { expect, test, type Page, type Route } from "@playwright/test";
import { PRINT_SHOP_CATALOG } from "@shared/print-shop-catalog";

const orderId = "checkout-navigation-fixture";
const assetId = "checkout-photo-fixture";
const product = PRINT_SHOP_CATALOG[0];

const quote = {
  currency: "EUR",
  catalogVersion: 1,
  items: [{
    productId: product.id,
    sku: product.sku,
    productName: product.nome,
    category: product.categoria,
    catalogVersion: 1,
    currency: "EUR",
    widthMm: product.printSpec.widthMm,
    heightMm: product.printSpec.heightMm,
    finish: "glossy",
    fitMode: "border",
    pricingModel: product.printSpec.pricing.model,
    assetCount: 1,
    copyCount: 1,
    pricingQuantity: 1,
    unitPriceCents: 100,
    lineTotalCents: 100,
    assignments: [{ assetId, copies: 1 }],
  }],
  totals: { subtotalCents: 100, discountCents: 0, shippingCents: 350, totalCents: 450 },
  assetCount: 1,
  copyCount: 1,
  fulfillment: { method: "shipping" },
  qualityWarnings: [],
};

async function setup(
  page: Page,
  qualityWarnings: Array<{
    assetId: string;
    sku: string;
    effectiveDpi: number;
    warningBelowDpi: number;
    targetDpi: number;
  }> = [],
) {
  const unexpectedApiRequests: string[] = [];
  const quoteRequests: Array<{ couponCode?: string }> = [];
  const origin = "http://127.0.0.1:4192";
  const order = {
    id: orderId,
    orderNumber: "PS-CHECKOUT-001",
    customer: { name: "Fixture Customer", email: "customer@example.test", phone: "" },
    totals: { totalCents: 450, shippingCents: 350 },
    payment: { status: "pending", collectedCents: 0, dueCents: 450 },
    fulfillment: { method: "studio_pickup", status: "draft" },
    assets: [{
      id: assetId,
      status: "ready",
      originalName: "fixture.jpg",
      sizeBytes: 1000,
      widthPx: 1200,
      heightPx: 1800,
    }],
    printShop: {
      assetCount: 1,
      copyCount: 1,
      requestedItems: [{
        sku: product.sku,
        finish: "glossy",
        fitMode: "border",
        assignments: [{ assetId, copies: 1 }],
      }],
      items: [],
    },
  };

  await page.context().route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      await route.abort("blockedbyclient");
      return;
    }
    if (!url.pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }
    const method = route.request().method();
    const path = url.pathname;
    const respond = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    if (path === "/api/print-shop/catalog" && method === "GET") {
      return respond({
        products: PRINT_SHOP_CATALOG,
        catalogVersion: 1,
        shipping: { enabled: true, priceCents: 350, estimatedMinDays: 2, estimatedMaxDays: 5 },
      });
    }
    if (path === `/api/print-shop/orders/${orderId}/resume` && method === "GET") {
      return respond({ order });
    }
    if (path === `/api/print-shop/orders/${orderId}/quote` && method === "POST") {
      const requestBody = route.request().postDataJSON() as { couponCode?: string };
      quoteRequests.push(requestBody);
      const hasCoupon = requestBody.couponCode === "TEST25";
      const checkoutQuote = { ...quote, qualityWarnings };
      const updatedQuote = hasCoupon
        ? {
            ...checkoutQuote,
            coupon: { code: "TEST25", discountType: "percentage", value: 25, scope: "all" },
            totals: { ...checkoutQuote.totals, discountCents: 25, totalCents: 425 },
          }
        : checkoutQuote;
      return respond({ quote: updatedQuote });
    }
    if (path === `/api/print-shop/orders/${orderId}/assets/${assetId}/preview` && method === "GET") {
      return route.fulfill({ status: 404, body: "Preview intentionally unavailable in this test." });
    }
    unexpectedApiRequests.push(`${method} ${path}`);
    return respond({ message: "Unexpected fixture request." }, 404);
  });
  return { unexpectedApiRequests, quoteRequests };
}

test("checkout mobile jumps to the next required section and desktop keeps its sticky summary", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((draftId) => {
    sessionStorage.setItem("print-shop-draft:fixture-user", draftId);
    (window as any).__checkoutScrollTargets = [];
    Element.prototype.scrollIntoView = function () {
      (window as any).__checkoutScrollTargets.push((this as HTMLElement).id);
    };
  }, orderId);
  const { unexpectedApiRequests } = await setup(page);
  await page.goto("/?view=order&legalFixture=1");

  await expect(page.getByRole("heading", { name: "Come vuoi stampare le foto?" })).toBeVisible();
  await page.getByRole("button", { name: /Spedizione a domicilio/ }).click();
  await page.getByRole("button", { name: "Controlla l’ordine" }).click();
  await expect(page.getByRole("heading", { name: "I tuoi dati di contatto" })).toBeVisible();
  await expect(page.getByTestId("paypal-stub")).toBeVisible();

  const mobileJump = page.getByRole("button", { name: /Vai ai dati da completare|Vai al pagamento/ });
  await expect(mobileJump).toBeVisible();
  await mobileJump.click();
  await expect.poll(() => page.evaluate(() => (window as any).__checkoutScrollTargets.at(-1)))
    .toBe("print-shop-contact");

  await page.locator("#print-shop-phone").fill("3331234567");
  await mobileJump.click();
  await expect.poll(() => page.evaluate(() => (window as any).__checkoutScrollTargets.at(-1)))
    .toBe("print-shop-shipping-details");

  const address = page.locator("#print-shop-shipping-details");
  await address.locator("#print-shipping-street").fill("Via Roma");
  await address.getByLabel(/Numero civico/).fill("10");
  await address.getByLabel(/CAP/).fill("81031");
  await address.getByLabel(/Città/).fill("Aversa");
  await address.getByLabel(/Provincia/).fill("CE");
  await address.locator("#print-fiscal-code").fill("RSSMRA85M01H501Q");
  await mobileJump.click();
  await expect.poll(() => page.evaluate(() => (window as any).__checkoutScrollTargets.at(-1)))
    .toBe("print-shop-payment-requirements");

  const consents = page.locator("#print-shop-payment-requirements").getByRole("checkbox");
  await consents.nth(0).check();
  await consents.nth(1).check();
  await consents.nth(2).check();
  await expect(mobileJump).toHaveText(/Vai al pagamento/);
  await mobileJump.click();
  await expect.poll(() => page.evaluate(() => (window as any).__checkoutScrollTargets.at(-1)))
    .toBe("print-shop-payment");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(mobileJump).toBeHidden();
  const stickySummary = page.locator("aside.sticky").last();
  await expect(stickySummary).toBeVisible();
  await expect.poll(() => stickySummary.evaluate((element) => getComputedStyle(element).position))
    .toBe("sticky");
  await expect.poll(() => stickySummary.evaluate((element) => getComputedStyle(element).top))
    .toBe("96px");
  expect(unexpectedApiRequests).toEqual([]);
});

test("checkout mobile prioritizes the photo-quality warning before consents and payment", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((draftId) => {
    sessionStorage.setItem("print-shop-draft:fixture-user", draftId);
    (window as any).__checkoutScrollTargets = [];
    Element.prototype.scrollIntoView = function () {
      (window as any).__checkoutScrollTargets.push((this as HTMLElement).id);
    };
  }, orderId);
  const { unexpectedApiRequests } = await setup(page, [{
    assetId,
    sku: product.sku,
    effectiveDpi: 120,
    warningBelowDpi: 150,
    targetDpi: 300,
  }]);
  await page.goto("/?view=order&legalFixture=1");

  await expect(page.getByRole("heading", { name: "Come vuoi stampare le foto?" })).toBeVisible();
  await page.getByRole("button", { name: /Spedizione a domicilio/ }).click();
  await page.getByRole("button", { name: "Controlla l’ordine" }).click();
  await expect(page.getByRole("heading", { name: "I tuoi dati di contatto" })).toBeVisible();

  const mobileJump = page.getByRole("button", { name: /Vai ai dati da completare|Vai al pagamento/ });
  await page.locator("#print-shop-phone").fill("3331234567");
  await mobileJump.click();
  await expect.poll(() => page.evaluate(() => (window as any).__checkoutScrollTargets.at(-1)))
    .toBe("print-shop-shipping-details");

  const address = page.locator("#print-shop-shipping-details");
  await address.locator("#print-shipping-street").fill("Via Roma");
  await address.getByLabel(/Numero civico/).fill("10");
  await address.getByLabel(/CAP/).fill("81031");
  await address.getByLabel(/Città/).fill("Aversa");
  await address.getByLabel(/Provincia/).fill("CE");
  await address.locator("#print-fiscal-code").fill("RSSMRA85M01H501Q");
  await mobileJump.click();
  await expect.poll(() => page.evaluate(() => (window as any).__checkoutScrollTargets.at(-1)))
    .toBe("print-shop-quality-warning");
  await expect(page.getByRole("heading", { name: "Alcune foto potrebbero risultare meno nitide" }))
    .toBeVisible();

  await page.getByLabel(/Ho visto l’avviso e desidero continuare/).check();
  await mobileJump.click();
  await expect.poll(() => page.evaluate(() => (window as any).__checkoutScrollTargets.at(-1)))
    .toBe("print-shop-payment-requirements");

  const consents = page.locator("#print-shop-payment-requirements").getByRole("checkbox");
  await consents.nth(0).check();
  await consents.nth(1).check();
  await consents.nth(2).check();
  await expect(mobileJump).toHaveText(/Vai al pagamento/);
  await mobileJump.click();
  await expect.poll(() => page.evaluate(() => (window as any).__checkoutScrollTargets.at(-1)))
    .toBe("print-shop-payment");
  expect(unexpectedApiRequests).toEqual([]);
});

test("removing a coupon restores the checkout code, discount, and total", async ({ page }) => {
  await page.addInitScript((draftId) => {
    sessionStorage.setItem("print-shop-draft:fixture-user", draftId);
  }, orderId);
  const { unexpectedApiRequests, quoteRequests } = await setup(page);
  await page.goto("/?view=order&legalFixture=1");

  await expect(page.getByRole("heading", { name: "Come vuoi stampare le foto?" })).toBeVisible();
  await page.getByRole("button", { name: /Spedizione a domicilio/ }).click();
  await page.getByRole("button", { name: "Controlla l’ordine" }).click();

  const summary = page.getByRole("region", { name: "Il tuo ordine" });
  const total = summary.locator("dl > div").filter({ hasText: "Totale da pagare" }).locator("dd");
  await expect(total).toContainText("4,50");

  await summary.getByRole("textbox", { name: "Codice sconto" }).fill("test25");
  await summary.getByRole("button", { name: "Applica" }).click();
  await expect(summary.getByRole("status")).toHaveText("Coupon TEST25 applicato.");
  await expect(summary.getByRole("textbox", { name: "Codice sconto" })).toHaveValue("TEST25");
  await expect(summary.getByText("Sconto (TEST25)", { exact: true })).toBeVisible();
  await expect(summary.getByText("−0,25 €")).toBeVisible();
  await expect(total).toContainText("4,25");

  await summary.getByRole("button", { name: "Rimuovi" }).click();
  await expect(summary.getByRole("status")).toHaveText("Coupon rimosso.");
  await expect(summary.getByRole("textbox", { name: "Codice sconto" })).toHaveValue("");
  await expect(summary.getByRole("button", { name: "Applica" })).toBeDisabled();
  await expect(summary.getByText("Sconto (TEST25)", { exact: true })).toHaveCount(0);
  await expect(summary.getByText("−0,25 €")).toHaveCount(0);
  await expect(total).toContainText("4,50");
  expect(quoteRequests.map((request) => request.couponCode)).toEqual([undefined, "TEST25", undefined]);
  expect(unexpectedApiRequests).toEqual([]);
});
