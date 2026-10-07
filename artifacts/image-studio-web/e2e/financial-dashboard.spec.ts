import { test, expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { readFile } from "node:fs/promises";

const fixturePath = "/admin/__e2e/financial-dashboard";
const runtimeIssues = new WeakMap<Page, string[]>();
async function isolate(page: Page) {
  const issues: string[] = [];
  runtimeIssues.set(page, issues);
  page.on("pageerror", error => issues.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /ErrorBoundary|Uncaught|Maximum update depth|Minified React error/i.test(message.text()))
      issues.push(message.text());
  });
  await page.clock.setFixedTime(new Date("2026-10-04T12:00:00Z"));
  await page.route(/https?:\/\/[^/]*(googleapis|firebaseio|firebase)\./, route => route.abort());
  await page.route("**/api/**", async route => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) return route.abort();
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}
test.afterEach(async ({ page }) => {
  expect(runtimeIssues.get(page) || []).toEqual([]);
});
const amount = (value: number) => new RegExp(`${value.toLocaleString("it-IT", { minimumFractionDigits: 2 })}\\s*€`);

test("full dashboard: receipts, campaigns, forecasts, export and payment update", async ({ page }) => {
  await isolate(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(fixturePath);
  await expect(page.getByTestId("finance-income-total")).toHaveText(amount(290));
  await page.getByRole("button", { name: /Solo Necessari/i }).click();
  await expect(page.getByTestId("finance-expense-total")).toHaveText(amount(60));
  await expect(page.getByTestId("finance-outstanding-total")).toHaveText(amount(1340));
  await page.getByTestId("finance-tab-campaigns").click();
  await expect(page.getByTestId("finance-campaign-campagna-A")).toContainText(amount(50));
  await expect(page.getByTestId("finance-campaign-campagna-B")).toContainText(amount(80));
  await page.getByTestId("finance-campaign-campagna-A").getByRole("button").click();
  const details = page.getByTestId("finance-campaign-detail");
  await expect(details.getByTestId("finance-movement-cash:cash-A")).toContainText("01/10/2026");
  await expect(details.getByTestId("finance-movement-cash:refund-A")).toContainText("Rimborso / storno");
  await details.getByTestId("finance-movement-cash:cash-A").getByRole("button").click();
  await expect(page.getByTestId("finance-detail-dialog")).toContainText("cassa/cash-A");
  await page.keyboard.press("Escape");
  await page.getByTestId("cash-period-option-month").click();
  await page.getByTestId("finance-tab-overview").click();
  await expect(page.getByTestId("finance-income-total")).toHaveText(amount(190));
  await expect(page.getByTestId("finance-month-2026-10")).toContainText(amount(190));
  await expect(page.getByTestId("finance-outstanding-total")).toHaveText(amount(1340));
  await page.getByTestId("finance-tab-receivables").click();
  const future = page.getByTestId("finance-receivable-schedule:schedule-job:future-rate");
  await expect(future).toContainText("01/11/2026");
  await expect(future).toContainText(amount(400));
  await expect(page.getByTestId("finance-receivable-schedule:schedule-job:overdue-rate")).toContainText("Scaduto");
  await expect(page.getByTestId("finance-receivable-schedule:schedule-job:undated-rate")).toContainText("Senza data");
  await page.getByTestId("finance-horizon").click();
  await page.getByRole("option", { name: "Solo scaduti", exact: true }).click();
  await expect(future).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("finance-export").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("rendiconto-finanziario.xlsx");
  const path = await download.path();
  const workbook = XLSX.read(await readFile(path!), { type: "buffer" });
  expect(XLSX.utils.sheet_to_json(workbook.Sheets["Da riscuotere"])).toHaveLength(1);
  expect((await page.evaluate(() => window.__financeE2EExport?.receivables.map(r => r.amount)))).toEqual([300]);
  await page.getByTestId("cash-period-option-all").click();
  await page.getByTestId("finance-horizon").click();
  await page.getByRole("option", { name: "Tutto, anche senza data", exact: true }).click();
  await page.getByTestId("finance-open-payment").click();
  let registrations = 0;
  await page.route("**/api/payment-schedules/schedule-job/payments/future-rate/register", async route => {
    registrations++;
    const body = route.request().postDataJSON();
    await page.evaluate(args => window.__financeE2EApplyPayment?.(args.importoPagato, args.dataPagamento, args.metodoPagamento), body);
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ success: true, data: { totalePagato: 500, saldoResiduo: 500 } }) });
  });
  await page.getByTestId("button-registra-submit").click();
  await expect(page.getByTestId("modal-registra-pagamento")).toHaveCount(0);
  await expect(future).toHaveCount(0);
  await page.getByTestId("finance-tab-overview").click();
  await expect(page.getByTestId("finance-income-total")).toHaveText(amount(690));
  await expect(page.getByTestId("finance-outstanding-total")).toHaveText(amount(940));
  expect(registrations).toBe(1);
  await page.getByTestId("finance-tab-movements").click();
  await expect(page.getByTestId("finance-movement-cash:cash-job-new")).toContainText("04/10/2026");
  await expect(page.getByTestId("finance-movement-schedule-receipt:schedule-job:future-rate")).toHaveCount(0);
  await page.getByTestId("cash-period-option-month").click();
  await page.getByTestId("finance-tab-overview").click();
  await expect(page.getByTestId("finance-income-total")).toHaveText(amount(590));
  await page.getByTestId("cash-period-option-all").click();
  await page.screenshot({ path: "/tmp/finance-dashboard-desktop.jpg", fullPage: true });
  expect(errors).toEqual([]);
});

test("mobile: useful drilldowns, keyboard navigation, search and no page overflow", async ({ page }) => {
  await isolate(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(fixturePath);
  await expect(page.getByTestId("finance-income-total")).toHaveText(amount(290));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId("finance-tab-movements").click();
  await page.getByTestId("finance-search").fill("Cliente Campagna A");
  await expect(page.getByTestId("finance-movement-cash:cash-A")).toBeVisible();
  await expect(page.getByTestId("finance-movement-cash:cash-walkin")).toHaveCount(0);
  await page.getByTestId("finance-movement-cash:cash-A").getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("finance-detail-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("finance-search").fill("");
  await page.getByTestId("finance-tab-receivables").click();
  await page.getByTestId("finance-horizon").click();
  await page.getByRole("option", { name: "Solo senza data", exact: true }).click();
  await expect(page.getByTestId("finance-receivable-schedule:schedule-job:undated-rate")).toBeVisible();
  await page.getByTestId("finance-tab-overview").click();
  await page.screenshot({ path: "/tmp/finance-dashboard-mobile.jpg", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("read failures do not appear as zero receipts, stale values are labeled", async ({ page }) => {
  await isolate(page);
  await page.goto(`${fixturePath}?error=1`);
  await expect(page.getByTestId("finance-error")).toBeVisible();
  await expect(page.getByTestId("finance-income-total")).toHaveCount(0);
  await page.evaluate(() => window.__financeE2ESetFailure?.(false));
  await page.getByTestId("finance-error").getByRole("button", { name: "Riprova" }).click();
  await expect(page.getByTestId("finance-income-total")).toHaveText(amount(290));
  await page.evaluate(() => window.__financeE2ESetFailure?.(true));
  await page.getByTestId("finance-refresh").click();
  await expect(page.getByTestId("finance-stale-error")).toBeVisible();
  await expect(page.getByTestId("finance-income-total")).toHaveText(amount(290));
});