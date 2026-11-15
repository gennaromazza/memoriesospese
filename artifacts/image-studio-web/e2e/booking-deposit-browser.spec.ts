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

async function approveAdminBooking(page: Page, scenario = "success") {
  await isolateNetwork(page);
  const expiresAt = scenario === "expired"
    ? new Date(Date.now() - 60_000).toISOString()
    : new Date(Date.now() + 60 * 60_000).toISOString();
  let approvalRequests = 0;
  await page.route("**/api/booking/v2/booking-browser-approved/approve", async route => {
    approvalRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        bookingId: "booking-browser-approved",
        paymentRequired: true,
        stato: "in_attesa_pagamento",
        amountCents: 2500,
        currency: "EUR",
        expiresAt,
        emailStatus: "sent",
      }),
    });
  });
  await page.goto(`/test/admin-approval?scenario=${scenario}`);
  await expect(page.getByTestId("admin-booking-status")).toHaveText("Da approvare");
  await expect(page.getByTestId("button-approve-detail-booking-browser-approved")).toHaveText(/Approva e richiedi acconto/);
  await page.getByTestId("button-approve-detail-booking-browser-approved").click();
  await expect(page.getByTestId("admin-booking-status")).toHaveText("In attesa di pagamento");
  await expect(page.getByTestId("admin-approval-email-status")).toHaveText("Richiesta email: sent");
  await expect(page.getByTestId("simulated-deposit-email-link")).toBeVisible();
  expect(approvalRequests).toBe(1);
  const deadline = await page.getByTestId("approved-deadline").textContent();
  return { deadline, approvalRequests: () => approvalRequests };
}

async function approveAndOpenPaymentEmail(page: Page, scenario = "success") {
  const approved = await approveAdminBooking(page, scenario);
  await page.getByTestId("simulated-deposit-email-link").click();
  await expect(page.getByTestId("booking-deposit-checkout")).toBeVisible();
  return approved;
}

async function calls(page: Page) {
  return page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("booking-deposit-browser-harness") || "{}");
    return saved.calls || window.__bookingPaymentHarness?.calls || [];
  });
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

test("approvazione admin invia il link, mantiene l’acconto in attesa e conferma solo dopo l’incasso", async ({ page }) => {
  const { deadline } = await approveAndOpenPaymentEmail(page);
  const initialExpiry = await page.evaluate(() => JSON.parse(localStorage.getItem("booking-deposit-browser-harness") || "{}").hold?.expiresAt);
  expect(deadline).toContain(initialExpiry);
  expect(page.url()).not.toContain("#");
  await expect(page.getByTestId("booking-deposit-amount")).toContainText("25,00");
  await expect(page.getByTestId("booking-checkout-countdown")).toBeVisible();
  await expect(page.getByText("Appuntamento confermato!")).toHaveCount(0);

  let recorded = await calls(page);
  expect(recorded.filter(call => call.name === "admin-approval")).toHaveLength(1);
  expect(recorded.filter(call => call.name === "resume-hold")).toHaveLength(1);
  expect(recorded.some(call => call.name === "create-hold" || call.name === "capture" || call.name === "release-hold")).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("booking-deposit-browser-harness") || "{}").hold?.expiresAt)).toBe(initialExpiry);

  await page.getByTestId("simulated-paypal-pay").click();
  await expect(page.getByTestId("approved-deposit-receipt")).toContainText("Acconto ricevuto");
  await expect(page.getByText("Appuntamento confermato!")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("approved-deposit-receipt")).toBeVisible();

  recorded = await calls(page);
  expect(recorded.filter(call => call.name === "admin-approval")).toHaveLength(1);
  expect(recorded.filter(call => call.name === "create-hold")).toHaveLength(0);
  expect(recorded.filter(call => call.name === "capture")).toHaveLength(1);
  expect(recorded.filter(call => call.name === "release-hold")).toHaveLength(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("booking-deposit-browser-harness") || "{}").hold?.expiresAt)).toBe(initialExpiry);
  expectNoUnexpectedExternalTraffic();
});

test("annullare PayPal non annulla la prenotazione approvata e permette di riprovare senza una nuova richiesta", async ({ page }) => {
  const { approvalRequests } = await approveAndOpenPaymentEmail(page);
  await page.getByTestId("simulated-paypal-cancel").click();
  await expect(page.getByTestId("booking-payment-message")).toContainText("orario resta riservato");

  let recorded = await calls(page);
  expect(recorded.filter(call => call.name === "release-hold")).toHaveLength(0);
  expect(recorded.filter(call => call.name === "capture")).toHaveLength(0);
  expect(approvalRequests()).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("booking-deposit-browser-harness") || "{}").hold?.status)).toBe("active");

  await page.getByTestId("simulated-paypal-pay").click();
  await expect(page.getByTestId("approved-deposit-receipt")).toBeVisible();
  recorded = await calls(page);
  expect(recorded.filter(call => call.name === "admin-approval")).toHaveLength(1);
  expect(recorded.filter(call => call.name === "create-hold")).toHaveLength(0);
  expect(recorded.filter(call => call.name === "capture")).toHaveLength(1);
  expect(recorded.filter(call => call.name === "release-hold")).toHaveLength(0);
  expectNoUnexpectedExternalTraffic();
});

test("il reload del link email riapre la stessa richiesta e non rinnova l’ora", async ({ page }) => {
  await approveAndOpenPaymentEmail(page);
  const originalExpiry = await page.evaluate(() => JSON.parse(localStorage.getItem("booking-deposit-browser-harness") || "{}").hold?.expiresAt);
  await page.reload();
  await expect(page.getByTestId("booking-deposit-checkout")).toBeVisible();
  await expect(page.getByTestId("booking-deposit-amount")).toContainText("25,00");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("booking-deposit-browser-harness") || "{}").hold?.expiresAt)).toBe(originalExpiry);

  const recorded = await calls(page);
  expect(recorded.filter(call => call.name === "admin-approval")).toHaveLength(1);
  expect(recorded.filter(call => call.name === "resume-hold")).toHaveLength(2);
  expect(recorded.filter(call => call.name === "create-hold")).toHaveLength(0);
  expect(recorded.filter(call => call.name === "capture")).toHaveLength(0);
  expectNoUnexpectedExternalTraffic();
});

test("il reinvio email usa la stessa scadenza e non crea una nuova richiesta", async ({ page }) => {
  await approveAdminBooking(page);
  const initialExpiry = await page.evaluate(() => JSON.parse(localStorage.getItem("booking-deposit-browser-harness") || "{}").hold?.expiresAt);
  const originalLink = await page.getByTestId("simulated-deposit-email-link").getAttribute("href");
  await expect(page.getByTestId("booking-payment-panel")).toBeVisible();
  await page.getByRole("button", { name: "Reinvia link di pagamento" }).click();
  await expect(page.getByText(/il reinvio non concede un’altra ora/i)).toBeVisible();
  await page.getByRole("button", { name: "Conferma reinvio" }).click();
  await expect(page.getByRole("button", { name: "Reinvia link di pagamento" })).toBeDisabled();

  const value = await page.evaluate(() => JSON.parse(localStorage.getItem("booking-deposit-browser-harness") || "{}"));
  expect(value.calls.filter((call: { name: string }) => call.name === "admin-approval")).toHaveLength(1);
  expect(value.calls.filter((call: { name: string }) => call.name === "resend-email")).toHaveLength(1);
  expect(value.calls.some((call: { name: string }) => call.name === "create-hold" || call.name === "capture")).toBe(false);
  expect(value.hold.expiresAt).toBe(initialExpiry);
  expect(value.adminPayment.expiresAt).toBe(initialExpiry);
  expect(await page.getByTestId("simulated-deposit-email-link").getAttribute("href")).toBe(originalLink);
  expectNoUnexpectedExternalTraffic();
});

test("un link scaduto non apre PayPal e libera il blocco senza addebitare", async ({ page }) => {
  await approveAndOpenPaymentEmail(page, "expired");
  await expect(page.getByTestId("booking-payment-message")).toContainText("Il tempo per pagare è scaduto");
  await expect(page.getByTestId("button-return-booking-form")).toBeVisible();

  const recorded = await calls(page);
  expect(recorded.filter(call => call.name === "resume-hold")).toHaveLength(1);
  expect(recorded.filter(call => call.name === "release-hold")).toHaveLength(1);
  expect(recorded.some(call => call.name === "create-order" || call.name === "capture")).toBe(false);
  expectNoUnexpectedExternalTraffic();
});

test("un errore certo di PayPal conserva lo slot approvato e consente un nuovo tentativo", async ({ page }) => {
  await approveAndOpenPaymentEmail(page);
  await page.getByTestId("simulated-paypal-error").click();
  await expect(page.getByTestId("booking-payment-message")).toContainText("orario resta riservato");
  await expect(page.getByTestId("button-retry-booking-paypal")).toBeVisible();
  let recorded = await calls(page);
  expect(recorded.filter(call => call.name === "release-hold")).toHaveLength(0);
  expect(recorded.filter(call => call.name === "capture")).toHaveLength(0);

  await page.getByTestId("button-retry-booking-paypal").click();
  await page.getByTestId("simulated-paypal-pay").click();
  await expect(page.getByTestId("approved-deposit-receipt")).toBeVisible();
  recorded = await calls(page);
  expect(recorded.filter(call => call.name === "create-hold")).toHaveLength(0);
  expect(recorded.filter(call => call.name === "capture")).toHaveLength(1);
  expect(recorded.filter(call => call.name === "release-hold")).toHaveLength(0);
  expectNoUnexpectedExternalTraffic();
});

test("un esito PayPal incerto viene verificato senza ripetere la cattura", async ({ page }) => {
  await approveAndOpenPaymentEmail(page, "uncertain");
  await page.getByTestId("simulated-paypal-pay").click();
  await expect(page.getByTestId("button-verify-booking-payment")).toBeVisible();
  await expect(page.getByTestId("booking-payment-message")).toContainText("Non pagare una seconda volta");

  await page.evaluate(() => {
    const value = window.__bookingPaymentHarness!;
    value.resolveCapture = true;
    localStorage.setItem("booking-deposit-browser-harness", JSON.stringify(value));
  });
  await page.getByTestId("button-verify-booking-payment").click();
  await expect(page.getByTestId("approved-deposit-receipt")).toBeVisible();
  const recorded = await calls(page);
  expect(recorded.filter(call => call.name === "capture")).toHaveLength(1);
  expect(recorded.filter(call => call.name === "release-hold")).toHaveLength(0);
  expectNoUnexpectedExternalTraffic();
});

test("la lista admin distingue i checkout aperti e gli incassi da riconciliare, anche su mobile", async ({ browser }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    await isolateNetwork(page);
    await page.goto("/test/admin-payment-recovery");
    await expect(page.getByRole("region", { name: "Checkout senza prenotazione confermata" })).toBeVisible();
    await expect(page.getByText("Cliente con checkout aperto")).toBeVisible();
    await expect(page.getByText("Cliente con pagamento da riconciliare")).toBeVisible();
    await expect(page.getByText("In attesa di pagamento · 25.00 €")).toBeVisible();
    await expect(page.getByText("Pagamento da riconciliare · 25.00 €")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole("button", { name: "Dettagli pagamento" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("booking-payment-panel")).toBeVisible();
    const dialog = await page.getByRole("dialog").boundingBox();
    expect(dialog).not.toBeNull();
    expect(dialog!.x).toBeGreaterThanOrEqual(0);
    expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(viewport.width);
    await expect(page.getByText("Nessun incasso confermato")).toBeVisible();

    const verify = page.getByRole("button", { name: "Verifica esito PayPal" });
    await verify.click();
    await expect(page.getByText("Autorizzato, non ancora incassato")).toBeVisible();
    await verify.click();
    const recorded = await calls(page);
    expect(recorded.filter(call => call.name === "verify-payment")).toHaveLength(2);
    expect(recorded.some(call => call.name === "capture" || call.name === "resend-email")).toBe(false);
    await page.close();
  }
  expectNoUnexpectedExternalTraffic();
});

test("il pannello distingue richiesta scaduta, acconto incassato e incasso da riconciliare", async ({ page }) => {
  await isolateNetwork(page);
  await page.goto("/test/admin-payment-recovery?case=expired");
  await expect(page.getByTestId("booking-payment-panel")).toBeVisible();
  await expect(page.getByText("Scaduta", { exact: true })).toBeVisible();
  await expect(page.getByTestId("deposit-countdown")).toContainText("Tempo scaduto");
  await expect(page.getByRole("button", { name: "Reinvia link di pagamento" })).toBeDisabled();
  await expect(page.getByText("Nessun incasso confermato")).toBeVisible();
  await page.close();

  const paidPage = await page.context().newPage();
  await isolateNetwork(paidPage);
  await paidPage.goto("/test/admin-payment-recovery?case=paid");
  await expect(paidPage.getByText("Confermata", { exact: true })).toBeVisible();
  await expect(paidPage.getByText("Ricevuto", { exact: true })).toBeVisible();
  await expect(paidPage.getByText("Incassato", { exact: true })).toBeVisible();
  await expect(paidPage.getByRole("button", { name: "Reinvia link di pagamento" })).toBeDisabled();
  await paidPage.close();

  const reviewPage = await page.context().newPage();
  await isolateNetwork(reviewPage);
  await reviewPage.goto("/test/admin-payment-recovery?case=review");
  await expect(reviewPage.getByText("Pagamento da riconciliare", { exact: true })).toBeVisible();
  await expect(reviewPage.getByText("Incasso o richiesta da riconciliare")).toBeVisible();
  await expect(reviewPage.getByText("Confermata", { exact: true })).toHaveCount(0);
  await expect(reviewPage.getByRole("button", { name: "Reinvia link di pagamento" })).toBeDisabled();
  const recorded = await calls(reviewPage);
  expect(recorded.some(call => call.name === "capture" || call.name === "resend-email")).toBe(false);
  await reviewPage.close();
  expectNoUnexpectedExternalTraffic();
});

test("il reinvio nel dettaglio approvato conserva importo e termine e si blocca dopo una conferma", async ({ page }) => {
  await isolateNetwork(page);
  await page.goto("/test/admin-payment-recovery?case=approved");
  await expect(page.getByTestId("booking-payment-panel")).toBeVisible();
  const before = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("booking-deposit-browser-harness") || "{}").adminPayments?.["booking-approved-test"];
    return { expiresAt: data?.expiresAt, amountCents: data?.amountCents };
  });
  expect(before).toEqual(expect.objectContaining({ amountCents: 2500 }));

  await page.getByRole("button", { name: "Reinvia link di pagamento" }).click();
  await expect(page.getByText(/la scadenza resta .* il reinvio non concede un’altra ora/i)).toBeVisible();
  await page.getByRole("button", { name: "Conferma reinvio" }).click();
  await expect(page.getByRole("button", { name: "Reinvia link di pagamento" })).toBeDisabled();

  const after = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("booking-deposit-browser-harness") || "{}");
    const data = state.adminPayments?.["booking-approved-test"];
    return { expiresAt: data?.expiresAt, amountCents: data?.amountCents, calls: state.calls || [] };
  });
  expect(after.expiresAt).toBe(before.expiresAt);
  expect(after.amountCents).toBe(before.amountCents);
  expect(after.calls.filter(call => call.name === "resend-email")).toHaveLength(1);
  expect(after.calls.some(call => call.name === "capture" || call.name === "verify-payment")).toBe(false);
  expectNoUnexpectedExternalTraffic();
});
