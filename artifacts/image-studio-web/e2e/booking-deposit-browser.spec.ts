import { expect, test, type Page } from "@playwright/test";

const harnessOrigin = `http://127.0.0.1:${process.env.BOOKING_DEPOSIT_E2E_PORT ?? "4193"}`;
const externalRequests: string[] = [];

async function isolateNetwork(page: Page) {
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== harnessOrigin) {
      externalRequests.push(url.href);
      await route.abort();
      return;
    }
    await route.continue();
  });
}

async function openCheckout(page: Page, scenario = "success") {
  await isolateNetwork(page);
  await page.goto(`/prenota/TESTCODE?scenario=${scenario}`);
  await page.getByTestId("date-2030-12-01").click();
  await page.getByTestId("slot-10:00").click();
  await page.getByTestId("input-nome").fill("Cliente");
  await page.getByTestId("input-cognome").fill("Test");
  await page.getByTestId("input-email").fill("cliente@example.test");
  await page.getByTestId("input-whatsapp").fill("+390000000000");
  await page.getByTestId("checkbox-privacy-consent").click();
  await page.getByTestId("button-submit-booking").click();
  await expect(page.getByTestId("booking-deposit-checkout")).toBeVisible();
  return page.getByTestId("booking-payment-message");
}

async function calls(page: Page) {
  return page.evaluate(() => window.__bookingPaymentHarness?.calls || []);
}

function expectNoUnexpectedExternalTraffic() {
  // The app stylesheet references Google Fonts. The route above aborts every
  // off-origin request, and no payment/provider request may escape the harness.
  expect(externalRequests.filter(url => !url.startsWith("https://fonts.googleapis.com/"))).toEqual([]);
}

test.beforeEach(() => {
  externalRequests.length = 0;
});

test("checkout riuscito usa l’importo configurato e funziona su mobile e desktop", async ({ browser }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport });
    await openCheckout(page);

    await expect(page.getByTestId("booking-deposit-amount")).toContainText("25,00");
    await expect(page.getByTestId("booking-checkout-countdown")).toBeVisible();
    await expect(page.getByTestId("simulated-paypal-pay")).toBeVisible();
    const checkout = await page.getByTestId("booking-deposit-checkout").boundingBox();
    expect(checkout).not.toBeNull();
    expect(checkout!.x).toBeGreaterThanOrEqual(0);
    expect(checkout!.x + checkout!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByTestId("simulated-paypal-pay").click();
    await expect(page.getByText("Appuntamento confermato!")).toBeVisible();
    const recorded = await calls(page);
    expect(recorded.filter(call => call.name === "create-hold")).toHaveLength(1);
    expect(recorded.filter(call => call.name === "create-order")).toHaveLength(1);
    expect(recorded.filter(call => call.name === "capture")).toHaveLength(1);
    expect(recorded.some(call => call.name === "release-hold")).toBe(false);
    expect(recorded.find(call => call.name === "create-hold")?.detail).not.toHaveProperty("depositAmountCents");
    await page.close();
  }
  expectNoUnexpectedExternalTraffic();
});

test("annullamento ed errore PayPal liberano il checkout senza catturare", async ({ browser }) => {
  for (const button of ["simulated-paypal-cancel", "simulated-paypal-error"]) {
    const page = await browser.newPage();
    await openCheckout(page);
    await page.getByTestId(button).click();
    await expect(page.getByTestId("booking-payment-message")).toContainText("slot è stato liberato");

    const recorded = await calls(page);
    expect(recorded.filter(call => call.name === "release-hold")).toHaveLength(1);
    expect(recorded.some(call => call.name === "capture")).toBe(false);
    await page.getByTestId("button-return-booking-form").click();
    await page.getByTestId("date-2030-12-01").click();
    await page.getByTestId("slot-10:00").click();
    await expect(page.getByTestId("input-email")).toHaveValue("cliente@example.test");
    await page.close();
  }
  expectNoUnexpectedExternalTraffic();
});

test("una risposta di cattura incerta si risolve senza ripetere l’incasso", async ({ page }) => {
  await openCheckout(page, "uncertain");
  await page.getByTestId("simulated-paypal-pay").click();
  await expect(page.getByTestId("button-verify-booking-payment")).toBeVisible();
  await expect(page.getByTestId("booking-payment-message")).toContainText("Non pagare di nuovo");

  await page.evaluate(() => {
    const state = window.__bookingPaymentHarness!;
    state.resolveCapture = true;
    localStorage.setItem("booking-deposit-browser-harness", JSON.stringify(state));
  });
  await page.getByTestId("button-verify-booking-payment").click();
  await expect(page.getByText("Appuntamento confermato!")).toBeVisible();

  const recorded = await calls(page);
  expect(recorded.filter(call => call.name === "capture")).toHaveLength(1);
  expect(recorded.filter(call => call.name === "release-hold")).toHaveLength(0);
  expectNoUnexpectedExternalTraffic();
});

test("il reload riprende lo stesso slot e conserva la ricevuta senza un secondo incasso", async ({ page }) => {
  await openCheckout(page);
  const originalExpiry = await page.evaluate(() => window.__bookingPaymentHarness?.hold?.expiresAt);
  await page.reload();
  await expect(page.getByTestId("booking-deposit-checkout")).toBeVisible();
  await expect(page.getByTestId("booking-deposit-amount")).toContainText("25,00");
  expect(await page.evaluate(() => window.__bookingPaymentHarness?.hold?.expiresAt)).toBe(originalExpiry);

  let recorded = await calls(page);
  expect(recorded.filter(call => call.name === "create-hold")).toHaveLength(1);
  expect(recorded.filter(call => call.name === "resume-hold")).toHaveLength(1);
  await page.getByTestId("simulated-paypal-pay").click();
  await expect(page.getByText("Appuntamento confermato!")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Appuntamento confermato!")).toBeVisible();

  recorded = await calls(page);
  expect(recorded.filter(call => call.name === "capture")).toHaveLength(1);
  expect(recorded.filter(call => call.name === "create-hold")).toHaveLength(1);
  expectNoUnexpectedExternalTraffic();
});

test("checkout già scaduto libera lo slot e non apre PayPal", async ({ page }) => {
  const message = await openCheckout(page, "expired");
  await expect(message).toContainText("scaduto");
  await expect(page.getByTestId("button-return-booking-form")).toBeVisible();

  const recorded = await calls(page);
  expect(recorded.filter(call => call.name === "release-hold")).toHaveLength(1);
  expect(recorded.some(call => call.name === "create-order" || call.name === "capture")).toBe(false);
  expectNoUnexpectedExternalTraffic();
});
