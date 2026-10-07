import { test, expect, Page, Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const total = 4290;
const mkOrder = (id: string, orderNumber: string, payment = "pending", fulfillment = "submitted", eligibility = { canAuthorize: true, canRestore: false }) => ({
  id, orderNumber, customer: { displayName: "Fixture Customer", email: "customer@example.test", phone: "0815550101" },
  totals: { totalCents: total, shippingCents: 0 }, payment: { status: payment, method: payment === "paid" ? "card" : undefined,
    collectedCents: payment === "paid" ? total : 0, dueCents: payment === "paid" ? 0 : total },
  fulfillment: { method: "studio_pickup", status: fulfillment }, deferredPaymentEligibility: eligibility,
  printShop: { assetCount: 2, copyCount: 4, items: [] }, createdAt: "2025-04-01T10:00:00.000Z",
});
type Fixture = { orders: Record<string, any>; requests: any[]; failNextCollect: boolean; failNextAcceptance?: boolean; external: string[] };
const initialFixture = (): Fixture => ({
  orders: {
    "pending-safe": mkOrder("pending-safe", "PS-483-001"),
    "cancel-restorable": mkOrder("cancel-restorable", "PS-483-002", "pending", "cancelled", { canAuthorize: false, canRestore: true }),
    "cancel-unsafe": mkOrder("cancel-unsafe", "PS-483-003", "pending", "cancelled", { canAuthorize: false, canRestore: false, reason: "Ordine incompleto: impossibile ripristinare." }),
    "manual-deferred": mkOrder("manual-deferred", "PS-483-004", "deferred", "submitted", { canAuthorize: false, canRestore: false }),
    "customer-deferred": mkOrder("customer-deferred", "PS-483-005", "deferred", "submitted", { canAuthorize: false, canRestore: false }),
  },
  requests: [], failNextCollect: false, external: [],
});
async function setup(page: Page, f: Fixture) {
  const origin = "http://127.0.0.1:4192";
  const customerOrderReads: Record<string, number> = {};
  await page.context().route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { f.external.push(url.href); await route.abort("blockedbyclient"); return; }
    if (!url.pathname.startsWith("/api/")) { await route.continue(); return; }
    const method = route.request().method();
    const path = url.pathname;
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/print-shop/admin/orders" && method === "GET") {
      f.requests.push({ method, path, query: url.search });
      return respond({ orders: Object.values(f.orders) });
    }
    const adminDetail = path.match(/^\/api\/print-shop\/admin\/orders\/([^/]+)$/);
    if (adminDetail && method === "GET") { f.requests.push({ method, path }); return respond({ order: f.orders[adminDetail[1]] }); }
    if (/\/lab-shipments$/.test(path) && method === "GET") return respond({ shipments: [] });
    const action = path.match(/^\/api\/print-shop\/admin\/orders\/([^/]+)\/(accept-draft|deferred-payment|restore|collect)$/);
    if (action && method === "POST") {
      const body = route.request().postDataJSON();
      f.requests.push({ method, path, body });
      const order = f.orders[action[1]];
      if (action[2] === 'accept-draft' && f.failNextAcceptance) {
        f.failNextAcceptance = false;
        return respond({ message: 'Fixture accettazione non disponibile: riprova.' }, 503);
      }
      if (action[2] === "collect" && f.failNextCollect) {
        f.failNextCollect = false;
        return respond({ message: "Fixture incasso non disponibile: riprova." }, 503);
      }
      if (action[2] === 'accept-draft') {
        order.printShop.adminAcceptance = { source: 'offline_request', acceptedAt: '2026-10-03T09:00:00Z',
          by: 'admin@example.test', note: body.note, amountCents: total };
        order.fulfillment.status = 'awaiting_payment';
        order.manualAcceptanceEligibility.canAccept = false;
        order.deferredPaymentEligibility = { canAuthorize: true, canRestore: false };
      } else if (action[2] === "deferred-payment") {
        order.payment = { status: "deferred", method: "deferred", collectedCents: 0, dueCents: total,
          deferredAuthorization: { authorizedAt: "2025-04-02T10:00:00Z", by: "admin@example.test", note: body.note, amountCents: total } };
        order.fulfillment.status = "submitted";
        order.deferredPaymentEligibility = { canAuthorize: false, canRestore: false };
      } else if (action[2] === "restore") {
        order.fulfillment.status = "submitted";
        order.payment = { status: "pending", collectedCents: 0, dueCents: total };
        order.deferredPaymentEligibility = { canAuthorize: true, canRestore: false };
      } else {
        order.payment = { status: "paid", method: body.method, collectedCents: total, dueCents: 0,
          manualReceipt: { method: body.method, receivedAt: body.receivedAt, recordedAt: "2025-04-03T12:00:00Z",
            by: "admin@example.test", note: body.note, amountCents: total } };
        order.deferredPaymentEligibility = { canAuthorize: false, canRestore: false };
      }
      return respond({ order });
    }
    if (path === "/api/print-shop/orders" && method === "GET") return respond({ orders: [f.orders["customer-deferred"]] });
    const customerOrder = path.match(/^\/api\/print-shop\/orders\/([^/]+)$/);
    if (customerOrder && method === "GET") {
      const id = customerOrder[1];
      customerOrderReads[id] = (customerOrderReads[id] || 0) + 1;
      if (id === "resume-fixture" && customerOrderReads[id] > 1) f.orders[id].payment = { status: "deferred", collectedCents: 0, dueCents: total };
      return respond({ order: f.orders[id] });
    }
    if (path.endsWith("/assets/asset-a/preview")) {
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
    }
    if (path === "/api/print-shop/catalog") return respond({ products: [], catalogVersion: 1, shipping: { enabled: false, priceCents: 0 } });
    f.requests.push({ method, path, unexpected: true });
    return respond({ message: `Unexpected fixture request ${method} ${path}` }, 404);
  });
}
const getCard = (page: Page, number: string) => page.locator("article, .rounded-xl").filter({ hasText: number }).first();
async function openOrder(page: Page, number: string) {
  const openDialogs = page.getByRole("dialog");
  if (await openDialogs.count()) await page.getByRole("button", { name: "Close" }).last().click();
  await page.getByPlaceholder("Cerca numero ordine, cliente o email").fill(number);
  await page.getByRole("button", { name: "Apri ordine" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test('manual draft acceptance followed by payment on delivery', async ({ page }) => {
  const f = initialFixture();
  f.orders['manual-draft'] = {
    ...mkOrder('manual-draft', 'PS-MANUAL-001', 'pending', 'draft', { canAuthorize: false, canRestore: false, reason: 'Ordine non confermato online' }),
    quoteFingerprint: 'saved-quote', manualAcceptanceEligibility: {
      canAccept: true, snapshotHash: 'saved-snapshot', requiresLowResolutionConfirmation: true,
    },
    printShop: { assetCount: 2, copyCount: 4, items: [
      { sku: 'PRINT-100X150', productName: 'Stampe 10x15', formatLabel: '10x15', finish: 'matte', copyCount: 4,
        assignments: [{ assetId: 'asset-a', copies: 4 }] },
    ] },
  };
  f.failNextAcceptance = true;
  await setup(page, f);
  await page.goto('/?view=admin');
  await openOrder(page, 'PS-MANUAL-001');
  await expect(page.getByTestId('button-authorize-deferred')).toHaveCount(0);
  await page.getByTestId('button-accept-draft').click();
  const submit = page.getByTestId('button-confirm-deferred-action');
  await expect(page.getByTestId('manual-acceptance-summary')).toContainText('Stampe 10x15');
  await expect(submit).toBeDisabled();
  await page.getByTestId('input-deferred-note').fill('Richiesta telefonica cliente verificata');
  await page.getByTestId('checkbox-confirm-deferred').check();
  await expect(submit).toBeDisabled();
  await page.getByTestId('checkbox-accept-low-resolution').check();
  await expect(submit).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/manual-draft-confirm-mobile.png', fullPage: true });
  await submit.click();
  await expect(page.getByTestId('input-deferred-note')).toHaveValue('Richiesta telefonica cliente verificata');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByTestId('text-admin-acceptance')).toBeVisible();
  await expect(page.getByTestId('button-accept-draft')).toHaveCount(0);
  await expect(page.getByTestId('button-authorize-deferred')).toBeVisible();
  expect(f.orders['manual-draft'].payment.status).toBe('pending');
  expect(f.requests.filter(r => r.path.endsWith('/accept-draft'))).toHaveLength(2);
  expect(f.requests.filter(r => r.path.endsWith('/accept-draft'))[1].body).toEqual({
    note: 'Richiesta telefonica cliente verificata', confirmed: true, expectedQuoteFingerprint: 'saved-quote',
    expectedSnapshotHash: 'saved-snapshot', expectedTotalCents: total, lowResolutionConfirmed: true,
  });
  expect(f.requests.some(r => r.path.endsWith('/deferred-payment') || r.path.endsWith('/collect'))).toBe(false);
  await page.reload();
  await openOrder(page, 'PS-MANUAL-001');
  await expect(page.getByTestId('text-admin-acceptance')).toBeVisible();
  await page.getByTestId('button-authorize-deferred').click();
  await page.getByTestId('input-deferred-note').fill('Pagamento concordato alla consegna');
  await page.getByTestId('checkbox-confirm-deferred').check();
  await submit.click();
  await expect(page.getByTestId('button-collect-deferred')).toBeVisible();
  expect(f.orders['manual-draft'].payment).toMatchObject({ status: 'deferred', collectedCents: 0, dueCents: total });
  expect(f.orders['manual-draft'].fulfillment.status).toBe('submitted');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '/tmp/manual-draft-accepted-desktop.png', fullPage: true });
  expect(f.requests.some(r => r.path.endsWith('/collect'))).toBe(false);
  expect(f.requests.filter(r => r.unexpected)).toEqual([]);
  expect(f.external).toEqual([]);
});

test("Task 483 deferred payment UI isolated end-to-end", async ({ page }) => {
  const f = initialFixture();
  mkdirSync(fileURLToPath(new URL("./screenshots", import.meta.url)), { recursive: true });
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => console.log("HARNESS PAGEERROR", error.stack));
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  await setup(page, f);
  await page.goto("/?view=admin");
  console.log("HARNESS BODY", (await page.locator("body").innerText().catch(() => "BODY READ FAILED")).slice(0, 2500));

  await openOrder(page, "PS-483-001");
  await expect(page.getByTestId("button-authorize-deferred")).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL("./screenshots/admin-pending-desktop.png", import.meta.url)), fullPage: true });
  await page.getByTestId("button-authorize-deferred").click();
  const confirm = page.getByTestId("button-confirm-deferred-action");
  await expect(confirm).toBeDisabled();
  await page.getByTestId("input-deferred-note").fill("Verifica fixture Task 483");
  await expect(confirm).toBeDisabled();
  await page.getByTestId("checkbox-confirm-deferred").check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText(/Incassato/).first()).toBeVisible();
  await expect(page.getByText(/0,00\s?€/).first()).toBeVisible();
  expect(f.requests.filter((r) => r.path.endsWith("/deferred-payment"))[0]).toMatchObject({
    method: "POST", path: "/api/print-shop/admin/orders/pending-safe/deferred-payment",
    body: { note: "Verifica fixture Task 483", confirmed: true },
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Pagamento alla consegna — da incassare").first()).toBeVisible();
  await expect(page.getByText(/Da incassare 42,90\s?€/).first()).toBeVisible();
  await page.keyboard.press("Escape");

  await openOrder(page, "PS-483-002");
  await expect(page.getByTestId("button-authorize-deferred")).toHaveCount(0);
  await page.getByTestId("button-restore-order").click();
  await page.getByTestId("input-deferred-note").fill("Ripristino separato fixture");
  await page.getByTestId("checkbox-confirm-deferred").check();
  await page.getByTestId("button-confirm-deferred-action").click();
  const restore = f.requests.find((r) => r.path.endsWith("/restore"));
  expect(restore.body).toMatchObject({ note: "Ripristino separato fixture", confirmed: true });
  await expect(page.getByTestId("button-authorize-deferred")).toBeVisible();
  await expect(page.getByTestId("text-payment-status")).toHaveText("Da pagare");
  await page.getByTestId("button-authorize-deferred").click();
  await page.getByTestId("input-deferred-note").fill("Autorizzazione dopo ripristino");
  await page.getByTestId("checkbox-confirm-deferred").check();
  await page.getByTestId("button-confirm-deferred-action").click();
  expect(f.requests.filter((r) => r.path.endsWith("/deferred-payment")).length).toBe(2);
  await page.keyboard.press("Escape");

  await openOrder(page, "PS-483-003");
  await expect(page.getByTestId("button-authorize-deferred")).toHaveCount(0);
  await expect(page.getByTestId("button-restore-order")).toHaveCount(0);
  await expect(page.getByTestId("text-deferred-ineligible")).toContainText("incompleto");
  await page.keyboard.press("Escape");

  f.failNextCollect = true;
  await openOrder(page, "PS-483-004");
  await expect(page.getByTestId("button-collect-deferred")).toBeVisible();
  await page.getByTestId("button-collect-deferred").click();
  await page.getByTestId("select-collect-method").click();
  await page.getByRole("option", { name: "Carta / POS" }).click();
  await page.locator("#collect-received-at").fill("2025-04-03T09:15");
  await page.getByTestId("input-deferred-note").fill("Ricevuto in sede, ricevuta R-483");
  await page.getByTestId("checkbox-confirm-deferred").check();
  await page.getByTestId("button-confirm-deferred-action").click();
  await expect(page.getByText("Operazione non riuscita")).toBeVisible();
  await expect(page.getByText(/Fixture incasso non disponibile/)).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  const collectDialogButton = page.getByTestId("button-confirm-deferred-action");
  await expect(collectDialogButton).toBeEnabled();
  await collectDialogButton.dblclick();
  await expect(page.getByText("Registrare l’incasso completo?")).toHaveCount(0);
  await expect(page.getByTestId("button-collect-deferred")).toHaveCount(0);
  const collectRequests = f.requests.filter((r) => r.path.endsWith("/collect"));
  expect(collectRequests).toHaveLength(2); // failing attempt, then the intentionally rapid retry can only commit once
  expect(collectRequests[0].body).toMatchObject({
    method: "card", receivedAt: "2025-04-03T09:15:00.000Z", note: "Ricevuto in sede, ricevuta R-483", confirmed: true,
  });
  expect(collectRequests.slice(1).filter((r) => f.orders["manual-deferred"].payment.status === "paid")).toHaveLength(1);
  await expect(page.getByTestId("text-manual-receipt")).toContainText("42,90 €");
  await expect(page.getByTestId("text-manual-receipt")).toContainText("Ricevuto in sede, ricevuta R-483");
  await expect(page.getByTestId("text-payment-status")).toHaveText("Pagato");
  await expect(page.getByText(/0,00\s?€/).first()).toBeVisible();
  expect(f.requests.some((r) => r.path.includes("/paypal/capture"))).toBe(false);
  await page.screenshot({ path: fileURLToPath(new URL("./screenshots/admin-paid-receipt-desktop.png", import.meta.url)), fullPage: true });

  const customer = await page.context().newPage();
  await customer.setViewportSize({ width: 390, height: 844 });
  await customer.goto("/?view=confirmation&orderId=customer-deferred");
  await expect(customer.getByRole("heading", { name: "Ordine ricevuto: paghi alla consegna" })).toBeVisible();
  await expect(customer.getByTestId("status-payment-deferred")).toContainText("da incassare");
  await expect(customer.getByText(/Incassato 0,00\s?€ · Da pagare 42,90\s?€/)).toBeVisible();
  await expect(customer.getByText("Pagamento confermato.")).toHaveCount(0);
  await expect(customer.getByText(/ripetere il pagamento/i)).toHaveCount(0);
  await customer.screenshot({ path: fileURLToPath(new URL("./screenshots/customer-confirmation-phone.png", import.meta.url)), fullPage: true });

  await customer.goto("/?view=orders");
  await expect(customer.getByText("PS-483-005")).toBeVisible();
  await expect(customer.getByText("Pagamento alla consegna — da incassare")).toBeVisible();
  await expect(customer.getByText(/Incassato 0,00\s?€ · Da pagare 42,90\s?€/)).toBeVisible();
  await customer.goto("/?view=confirmation&orderId=pending-safe");
  await expect(customer.getByRole("heading", { name: "Ordine ricevuto: paghi alla consegna" })).toBeVisible();
  await expect(customer.getByTestId("status-payment-deferred")).toContainText("da incassare");
  await expect(customer.getByText(/Incassato € 0,00 · Da pagare € 42,90/)).toBeVisible();
  await expect(customer.getByText("Pagamento confermato.")).toHaveCount(0);

  await customer.goto("/?view=whatsapp");
  const links = customer.getByTestId("link-whatsapp-help");
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveAttribute("href", /^https:\/\/wa\.me\/390815550101\?text=/);
  await expect(links.nth(0)).toHaveAttribute("target", "_blank");
  await expect(links.nth(0)).toHaveAttribute("rel", "noopener noreferrer");
  expect(decodeURIComponent((await links.nth(0).getAttribute("href"))!.split("text=")[1])).toContain("ordine di stampe fotografiche");
  expect(decodeURIComponent((await links.nth(1).getAttribute("href"))!.split("text=")[1])).toContain("PS-483-0123");
  const popupWait = customer.waitForEvent("popup");
  await links.nth(1).click();
  const popup = await popupWait;
  expect(popup.url()).toContain("wa.me");
  await popup.close();
  await expect(links).toHaveCount(2);
  await customer.goto("/?view=whatsapp&phone=bad-phone&email=");
  await expect(customer.getByText(/WhatsApp non disponibile\. Contatta lo studio/)).toBeVisible();
  await expect(customer.getByRole("link", { name: "Pagina Contatti" })).toBeVisible();
  expect(f.external.every((url) => url.startsWith("https://wa.me/"))).toBe(true);

  // Actual order page: resume a saved awaiting-payment checkout, then let the
  // 20-second server poll observe that its status changed to deferred.
  const resume = initialFixture();
  const pendingResume = mkOrder("resume-fixture", "PS-483-090");
  Object.assign(pendingResume, { fulfillment: { method: "studio_pickup", status: "awaiting_payment" }, quoteFingerprint: "fixture-quote", catalogVersion: 1, currency: "EUR",
    assets: [{ id: "asset-a", status: "ready", originalName: "fixture.jpg", widthPx: 1200, heightPx: 1200 }],
    printShop: { assetCount: 1, copyCount: 1, requestedItems: [{ sku: "10x15", finish: "glossy", fitMode: "border", assignments: [{ assetId: "asset-a", copies: 1 }] }],
      items: [{ sku: "10x15", finish: "glossy", fitMode: "border", copyCount: 1, totalCents: total }], assetCount: 1, copyCount: 1 } ,
    totals: { totalCents: total, shippingCents: 0 }, payment: { status: "pending", collectedCents: 0, dueCents: total } });
  resume.orders["resume-fixture"] = pendingResume;
  const resumePage = await page.context().newPage();
  await resumePage.addInitScript(() => sessionStorage.setItem("print-shop-draft:fixture-user", "resume-fixture"));
  await setup(resumePage, resume);
  await resumePage.goto("/?view=order");
  await expect(resumePage.getByText(/riepilogo è già confermato/)).toBeVisible();
  await expect(resumePage.getByText("Conferma prima i dati")).toHaveCount(0);
  // Fixture flips the state on the actual checkout's first 20-second polling GET.
  await expect(resumePage).toHaveURL(/\/stampa-foto-aversa\/ordine\/conferma\?orderId=resume-fixture/);
  await expect(resumePage.getByRole("heading", { name: "Ordine ricevuto: paghi alla consegna" })).toBeVisible();
  await expect(resumePage.getByTestId("paypal-stub")).toHaveCount(0);

  expect(f.external).toEqual([]);
  expect(resume.external).toEqual([]);
  expect(f.requests.some((r) => r.unexpected)).toBe(false);
  expect(resume.requests.some((r) => r.unexpected)).toBe(false);
  expect(await page.evaluate(() => window.__harnessErrors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
  mkdirSync(fileURLToPath(new URL("./screenshots", import.meta.url)), { recursive: true });
});

test("Task 483 focused continuation: receipt retry, customer, help, and resume checkout", async ({ page }) => {
  test.setTimeout(75_000);
  const f = initialFixture();
  mkdirSync(fileURLToPath(new URL("./screenshots", import.meta.url)), { recursive: true });
  const consoleErrors: string[] = [];
  for (const p of [page]) p.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  await setup(page, f);
  await page.goto("/?view=admin");
  await openOrder(page, "PS-483-004");
  await page.getByTestId("button-collect-deferred").click();
  await page.getByTestId("select-collect-method").click();
  await page.getByRole("option", { name: "Carta / POS" }).click();
  await page.locator("#collect-received-at").fill("2025-04-03T09:15");
  await page.getByTestId("input-deferred-note").fill("Ricevuto in sede, ricevuta R-483");
  await page.getByTestId("checkbox-confirm-deferred").check();
  f.failNextCollect = true;
  await page.getByTestId("button-confirm-deferred-action").click();
  await expect(page.getByText("Operazione non riuscita")).toBeVisible();
  await expect(page.getByText(/Fixture incasso non disponibile/)).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByTestId("button-confirm-deferred-action").dblclick();
  await expect(page.getByText("Registrare l’incasso completo?")).toHaveCount(0);
  await expect(page.getByTestId("button-collect-deferred")).toHaveCount(0);
  const collect = f.requests.filter((r) => r.path.endsWith("/collect"));
  expect(collect).toHaveLength(2);
  expect(collect[0].body).toMatchObject({ method: "card", receivedAt: "2025-04-03T09:15:00.000Z",
    note: "Ricevuto in sede, ricevuta R-483", confirmed: true });
  await expect(page.getByTestId("text-payment-status")).toHaveText("Pagato");
  await expect(page.getByTestId("text-manual-receipt")).toContainText("Ricevuto in sede, ricevuta R-483");
  await expect(page.getByTestId("text-manual-receipt")).toContainText("Carta / POS");
  await expect(page.getByTestId("text-manual-receipt")).toContainText("42,90 €");
  await expect(page.getByTestId("text-manual-receipt")).toContainText("3 apr 2025");
  await expect(page.getByText(/0,00\s?€/).first()).toBeVisible();
  expect(f.requests.some((r) => r.path.includes("/paypal/capture"))).toBe(false);

  const customer = await page.context().newPage();
  const customerErrors: string[] = [];
  customer.on("console", (msg) => { if (msg.type() === "error") customerErrors.push(msg.text()); });
  await customer.setViewportSize({ width: 390, height: 844 });
  await customer.goto("/?view=confirmation&orderId=customer-deferred");
  await expect(customer.getByRole("heading", { name: "Ordine ricevuto: paghi alla consegna" })).toBeVisible();
  await expect(customer.getByTestId("status-payment-deferred")).toContainText("da incassare");
  await expect(customer.getByText(/Incassato 0,00\s?€ · Da pagare 42,90\s?€/)).toBeVisible();
  await expect(customer.getByText("Pagamento confermato.")).toHaveCount(0);
  await expect(customer.getByText(/ripetere il pagamento/i)).toHaveCount(0);
  await customer.screenshot({ path: fileURLToPath(new URL("./screenshots/customer-confirmation-phone-continuation.png", import.meta.url)), fullPage: true });
  await customer.goto("/?view=orders");
  await expect(customer.getByText("PS-483-005")).toBeVisible();
  await expect(customer.getByText("Pagamento alla consegna — da incassare")).toBeVisible();
  await expect(customer.getByText(/Incassato 0,00\s?€ · Da pagare 42,90\s?€/)).toBeVisible();

  await customer.goto("/?view=whatsapp");
  const help = customer.getByTestId("link-whatsapp-help");
  await expect(help).toHaveCount(2);
  await expect(help.nth(0)).toHaveText("Assistenza WhatsApp");
  await expect(help.nth(0)).toHaveAttribute("href", /^https:\/\/wa\.me\/390815550101\?text=/);
  await expect(help.nth(0)).toHaveAttribute("target", "_blank");
  await expect(help.nth(0)).toHaveAttribute("rel", "noopener noreferrer");
  expect(decodeURIComponent((await help.nth(0).getAttribute("href"))!.split("text=")[1])).toContain("ordine di stampe fotografiche");
  expect(decodeURIComponent((await help.nth(1).getAttribute("href"))!.split("text=")[1])).toContain("PS-483-0123");
  expect(customer.context().pages()).toHaveLength(2);
  const popupWait = customer.waitForEvent("popup");
  await help.nth(1).click();
  const popup = await popupWait;
  // The tab is opened by the ordinary target=_blank link, then its external
  // navigation is deliberately aborted by the isolation route.
  expect(f.external.some((url) => url.startsWith("https://wa.me/"))).toBe(true);
  await popup.close();
  await expect(help).toHaveCount(2);
  await customer.goto("/?view=whatsapp&phone=bad-phone&email=");
  await expect(customer.getByText("Recapiti non disponibili al momento.").first()).toBeVisible();
  await expect(customer.getByRole("link", { name: "Sito dello studio" }).first()).toHaveAttribute("href", "/");

  const resume = initialFixture();
  const pending = mkOrder("resume-fixture", "PS-483-090");
  Object.assign(pending, {
    fulfillment: { method: "studio_pickup", status: "awaiting_payment" }, quoteFingerprint: "fixture-quote",
    catalogVersion: 1, currency: "EUR",
    assets: [{ id: "asset-a", status: "ready", originalName: "fixture.jpg", widthPx: 1200, heightPx: 1200 }],
    printShop: { assetCount: 1, copyCount: 1, requestedItems: [{ sku: "10x15", finish: "glossy", fitMode: "border",
      assignments: [{ assetId: "asset-a", copies: 1 }] }],
      items: [{ sku: "10x15", finish: "glossy", fitMode: "border", copyCount: 1, totalCents: total }], assetCount: 1, copyCount: 1 },
    totals: { totalCents: total, shippingCents: 0 },
    payment: { status: "pending", collectedCents: 0, dueCents: total },
  });
  resume.orders["resume-fixture"] = pending;
  const resumePage = await page.context().newPage();
  const resumeErrors: string[] = [];
  resumePage.on("console", (msg) => { if (msg.type() === "error") resumeErrors.push(msg.text()); });
  await resumePage.addInitScript(() => sessionStorage.setItem("print-shop-draft:fixture-user", "resume-fixture"));
  await setup(resumePage, resume);
  await resumePage.goto("/?view=order");
  await expect(resumePage.getByText(/già collegato a PayPal/)).toBeVisible();
  await expect(resumePage.getByTestId("paypal-stub")).toBeVisible();
  await expect(resumePage).toHaveURL(/\/stampa-foto-aversa\/ordine\/conferma\?orderId=resume-fixture/, { timeout: 30_000 });
  await expect(resumePage.getByRole("heading", { name: "Ordine ricevuto: paghi alla consegna" })).toBeVisible();
  await expect(resumePage.getByTestId("status-payment-deferred")).toContainText("da incassare");

  expect(f.external.every((url) => url.startsWith("https://wa.me/"))).toBe(true);
  expect(resume.external).toEqual([]);
  expect(f.requests.some((r) => r.unexpected)).toBe(false);
  expect(resume.requests.some((r) => r.unexpected)).toBe(false);
  expect(await page.evaluate(() => window.__harnessErrors)).toEqual([]);
  expect(await customer.evaluate(() => window.__harnessErrors)).toEqual([]);
  expect(await resumePage.evaluate(() => window.__harnessErrors)).toEqual([]);
  const browserConsoleErrors = [...consoleErrors, ...customerErrors, ...resumeErrors];
  expect(browserConsoleErrors.filter((message) => !message.includes("503 (Service Unavailable)"))).toEqual([]);
  expect(browserConsoleErrors.filter((message) => message.includes("503 (Service Unavailable)"))).toHaveLength(1);
});