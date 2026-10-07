import { expect, test, type Page, type Request } from "@playwright/test";

const port = process.env.DATE_PICKER_E2E_PORT ?? "4178";
const localOrigin = `http://127.0.0.1:${port}`;
const harnessPath = "/admin/__e2e/date-selectors";

async function isolateBrowser(
  page: Page,
  onLocalRead?: (request: Request) => void,
  onConsultationRequest?: (request: Request) => void,
) {
  const blockedWrites: string[] = [];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    // Non consentire traffico verso Firebase, API esterne o il dominio live.
    if (url.origin !== localOrigin) {
      await route.abort();
      return;
    }

    // Le richieste di anteprima e invio vengono intercettate e completate localmente:
    // nessuna richiesta raggiunge il server o i servizi di email/WhatsApp.
    if (
      request.method() === "POST" &&
      url.pathname === "/api/consultations/v2/available-slots"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ slots: [] }),
      });
      return;
    }
    if (
      request.method() === "POST" &&
      /^\/api\/jobs\/[^/]+\/send-consultation-request$/.test(url.pathname)
    ) {
      onConsultationRequest?.(request);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    // La prova interagisce con i moduli ma non può inviare modifiche o pagamenti.
    if (!["GET", "HEAD"].includes(request.method())) {
      blockedWrites.push(`${request.method()} ${url.pathname}`);
      await route.abort();
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      onLocalRead?.(request);
      if (url.pathname === "/api/quotes/quick/e2e-date-selector") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              template: {
                id: "e2e-date-selector-template",
                nome: "Preventivo di prova",
                jobType: "matrimonio",
                type: "fisso",
                theme: { primaryColor: "#8B9A8B", secondaryColor: "#C8D4C8" },
                defaultProducts: [],
                defaultClauses: [],
              },
              jobTypeInfo: null,
              studioInfo: null,
            },
          }),
        });
        return;
      }

      const body = url.pathname === "/api/jobs/check-calendar"
        ? { hasConflicts: false, conflicts: [] }
        : { data: [] };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
      return;
    }

    await route.continue();
  });

  return blockedWrites;
}

async function assertDatePickerWorks(
  page: Page,
  viewport: { width: number; height: number },
  inputTestId: string,
  triggerTestId = `${inputTestId}-calendar-button`,
) {
  const dateInput = page.getByTestId(inputTestId);
  await dateInput.fill("15/09/2026");
  await expect(dateInput).toHaveValue("15/09/2026");
  await page.getByTestId(triggerTestId).click();

  const calendar = page.locator(".rdp-root").last();
  await expect(calendar).toBeVisible();
  await expect(calendar.locator(".rdp-month_caption")).toContainText("settembre 2026");
  await expect(calendar.locator(".rdp-weekday")).toHaveCount(7);
  await expect(calendar.locator(".rdp-week").first().locator(".rdp-day")).toHaveCount(7);

  const popover = page.locator("[data-radix-popper-content-wrapper]").filter({ has: calendar });
  const bounds = await popover.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);

  const weekdayWidths = await calendar.locator(".rdp-weekday").evaluateAll((cells) =>
    cells.map((cell) => cell.getBoundingClientRect().width)
  );
  expect(weekdayWidths.every((width) => width > 0)).toBe(true);
  expect(Math.min(...weekdayWidths)).toBeGreaterThanOrEqual(38);
  expect(Math.max(...weekdayWidths) - Math.min(...weekdayWidths)).toBeLessThan(1);

  await calendar.getByRole("button", { name: /16 settembre 2026/ }).click();
  await expect(calendar).toBeHidden();
  await expect(dateInput).toHaveValue("16/09/2026");
}

test("modifica rata: inserimento manuale, correzione e cancellazione senza inviare", async ({ page }) => {
  const blockedWrites = await isolateBrowser(page);
  await page.goto(harnessPath);
  await page.getByTestId("open-installment").click();

  const dialog = page.getByRole("dialog", { name: "Modifica Rata" });
  await dialog.getByTestId("installment-date-mode-absolute").click();
  const dateInput = dialog.getByTestId("input-data-scadenza-manual");
  await expect(dateInput).toHaveValue("15/09/2026");

  // A valid Italian date updates the controlled value; Enter must not submit the form.
  await dateInput.fill("21/10/2026");
  await dateInput.press("Enter");
  await expect(dateInput).toHaveValue("21/10/2026");
  await expect(dialog).toBeVisible();

  // Impossible and incomplete values show the input error without replacing the last valid date.
  await dateInput.fill("31/02/2026");
  await expect(dateInput).toHaveClass(/border-destructive/);
  await dateInput.press("Escape");
  await expect(dateInput).toHaveValue("21/10/2026");
  await expect(dateInput).not.toHaveClass(/border-destructive/);
  await expect(dialog).toBeVisible();

  await dateInput.fill("4/10");
  await dateInput.blur();
  await expect(dateInput).toHaveClass(/border-destructive/);
  await expect(dateInput).toHaveValue("4/10");

  // Correcting an invalid value clears the error and accepts the new date.
  await dateInput.fill("04/10/2026");
  await expect(dateInput).toHaveValue("04/10/2026");
  await expect(dateInput).not.toHaveClass(/border-destructive/);

  // Enter on a partial value reports the error and leaves the form open and unchanged.
  await dateInput.fill("05/10");
  await dateInput.press("Enter");
  await expect(dateInput).toHaveClass(/border-destructive/);
  await expect(dateInput).toHaveValue("05/10");
  await expect(dialog).toBeVisible();

  await dateInput.press("Escape");
  await expect(dateInput).toHaveValue("04/10/2026");
  await expect(dateInput).not.toHaveClass(/border-destructive/);
  await expect(dialog).toBeVisible();

  // With no in-progress edit, Escape keeps its normal dialog-close behavior.
  await dateInput.press("Escape");
  await expect(dialog).toBeHidden();

  expect(blockedWrites).toEqual([]);
});

test("modifica rata: accetta il 29 febbraio bisestile e rifiuta quello dell'anno comune senza inviare", async ({ page }) => {
  const blockedWrites = await isolateBrowser(page);
  await page.goto(harnessPath);
  await page.getByTestId("open-installment").click();

  const dialog = page.getByRole("dialog", { name: "Modifica Rata" });
  await dialog.getByTestId("installment-date-mode-absolute").click();
  const dateInput = dialog.getByTestId("input-data-scadenza-manual");
  await expect(dateInput).toHaveValue("15/09/2026");

  await dateInput.fill("29/02/2024");
  await dateInput.press("Enter");
  await expect(dateInput).toHaveValue("29/02/2024");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("button-date-picker").click();

  const calendar = page.locator(".rdp-root");
  await expect(calendar.locator(".rdp-month_caption")).toContainText("febbraio 2024");
  await expect(calendar.locator(".rdp-selected")).toContainText("29");
  await dialog.getByTestId("button-date-picker").click();

  await dateInput.fill("29/02/2025");
  await dateInput.press("Enter");
  await expect(dateInput).toHaveValue("29/02/2025");
  await expect(dateInput).toHaveClass(/border-destructive/);
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("button-date-picker").click();
  await expect(calendar.locator(".rdp-month_caption")).toContainText("febbraio 2024");
  await expect(calendar.locator(".rdp-selected")).toContainText("29");

  await dialog.getByRole("button", { name: "Annulla" }).click();
  expect(blockedWrites).toEqual([]);
});

test("preventivo rapido: cancellare una data facoltativa senza inviare", async ({ page }) => {
  const blockedWrites = await isolateBrowser(page);
  await page.goto("/preventivo-rapido/e2e-date-selector");
  await expect(page.getByText("Preventivo di prova", { exact: true })).toBeVisible();

  const dateInput = page.getByTestId("input-event-date-quick-quote");
  await expect(dateInput).toHaveValue("");
  await dateInput.fill("21/10/2026");
  await expect(dateInput).toHaveValue("21/10/2026");
  await dateInput.fill("");
  await expect(dateInput).toHaveValue("");

  expect(blockedWrites).toEqual([]);
});

test("pagamento: dropdown mese/anno, navigazione e data visibile dopo la selezione", async ({ page }) => {
  const blockedWrites = await isolateBrowser(page);
  await page.goto(harnessPath);
  await page.getByRole("button", { name: "Apri pagamento di prova" }).click();

  const dialog = page.getByTestId("modal-registra-pagamento");
  await dialog.getByTestId("button-data-pagamento-picker").click();

  const calendar = page.locator(".rdp-root");
  const dropdowns = calendar.locator(".rdp-dropdown");
  await expect(dropdowns).toHaveCount(2);

  const month = dropdowns.nth(0);
  const year = dropdowns.nth(1);
  await month.selectOption({ label: "gennaio" });
  await year.selectOption({ label: "2025" });
  await expect(month).toHaveValue("0");
  await expect(year).toHaveValue("2025");

  await calendar.locator(".rdp-button_next").click();
  await expect(month).toHaveValue("1");
  await calendar.locator(".rdp-button_previous").click();
  await expect(month).toHaveValue("0");

  await calendar.getByRole("button").filter({ hasText: /^12$/ }).click();
  await expect(calendar).toBeHidden();
  await expect(dialog.getByTestId("input-data-pagamento-manual")).toHaveValue("12/01/2025");
  await dialog.getByTestId("button-annulla").click();

  expect(blockedWrites).toEqual([]);
});

test("dashboard finanziaria: seleziona un periodo solo dopo aver scelto entrambe le date", async ({ page }) => {
  const blockedWrites = await isolateBrowser(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(harnessPath);

  const fixture = page.getByTestId("cash-period-picker-fixture");
  await fixture.getByTestId("cash-period-option-custom").click();

  const calendar = page.locator(".rdp-root").last();
  await expect(calendar).toBeVisible();
  const popover = page.locator("[data-radix-popper-content-wrapper]").filter({ has: calendar });
  const bounds = await popover.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);

  const dateTrigger = fixture.getByTestId("cash-period-date-trigger");
  await calendar.getByRole("button", { name: /10 ottobre 2026/ }).click();
  await expect(calendar).toBeVisible();
  await expect(dateTrigger).toContainText(/4 ott.*4 ott 2026/);

  await calendar.getByRole("button", { name: /15 ottobre 2026/ }).click();
  await expect(calendar).toBeHidden();
  await expect(dateTrigger).toContainText(/10 ott.*15 ott 2026/);

  expect(blockedWrites).toEqual([]);
});

test("modifica lavoro: selezione da tastiera nel viewport stretto senza salvare", async ({ page }) => {
  const blockedWrites = await isolateBrowser(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(harnessPath);
  await page.getByRole("button", { name: "Apri modifica lavoro di prova" }).click();

  const dialog = page.getByRole("dialog", { name: /Modifica Lavoro/ });
  const dateInput = dialog.getByTestId("input-event-date-manual");
  await expect(dateInput).toHaveValue("15/09/2026");
  await dialog.getByTestId("button-calendar-picker").click();

  const calendar = page.locator(".rdp-root");
  await expect(calendar).toBeVisible();
  const bounds = await calendar.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);

  await calendar.locator(".rdp-button_previous").click();
  await calendar.getByRole("button", { name: /15 settembre 2026/ }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(calendar).toBeHidden();
  await expect(dateInput).toHaveValue("16/09/2026");
  await dialog.getByTestId("button-cancel").click();

  expect(blockedWrites).toEqual([]);
});

test("modifica lavoro: data incompleta o impossibile blocca il salvataggio e una valida aggiorna il form", async ({ page }) => {
  const calendarDates: string[] = [];
  const blockedWrites = await isolateBrowser(page, (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/jobs/check-calendar") {
      calendarDates.push(url.searchParams.get("eventDate") ?? "");
    }
  });
  await page.goto(harnessPath);
  await page.getByRole("button", { name: "Apri modifica lavoro di prova" }).click();

  const dialog = page.getByRole("dialog", { name: /Modifica Lavoro/ });
  const dateInput = dialog.getByTestId("input-event-date-manual");
  const dateError = dialog.getByText("Inserisci una data completa e valida (gg/mm/aaaa)");
  await expect(dateInput).toHaveValue("15/09/2026");

  await dateInput.fill("21/10");
  await dialog.getByTestId("button-save").click();
  await expect(dateError).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(blockedWrites).toEqual([]);

  await dateInput.fill("31/02/2026");
  await dialog.getByTestId("button-save").click();
  await expect(dateError).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(blockedWrites).toEqual([]);

  await dateInput.fill("21/10/2026");
  await expect(dateInput).toHaveValue("21/10/2026");
  await expect(dateError).toBeHidden();
  await expect.poll(() => calendarDates.includes("2026-10-21")).toBe(true);
  expect(blockedWrites).toEqual([]);

  await dialog.getByTestId("button-cancel").click();
  expect(blockedWrites).toEqual([]);
});

for (const viewport of [
  { name: "normale", width: 1280, height: 900 },
  { name: "stretto", width: 390, height: 844 },
]) {
  test(`creazione lavoro: calendario leggibile e selezione nel viewport ${viewport.name}`, async ({ page }) => {
      const blockedWrites = await isolateBrowser(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(harnessPath);
    await page.getByRole("button", { name: "Apri creazione lavoro di prova" }).click();

    const dialog = page.getByRole("dialog", { name: "Nuovo Lavoro" });
    const dateInput = dialog.getByTestId("input-event-date");
    await expect(dateInput).toHaveValue("15/09/2026");
    const dialogZIndex = Number.parseInt(
      await dialog.evaluate((node) => getComputedStyle(node).zIndex),
      10
    );
    await dialog.getByTestId("input-event-date-calendar-button").click();

    const calendar = page.locator(".rdp-root");
    await expect(calendar).toBeVisible();
    await expect(calendar.locator(".rdp-month_caption")).toContainText("settembre 2026");
    await expect(calendar.locator(".rdp-weekday")).toHaveCount(7);
    await expect(calendar.locator(".rdp-week").first().locator(".rdp-day")).toHaveCount(7);

    const popover = page.locator("[data-radix-popper-content-wrapper]").filter({ has: calendar });
    const bounds = await popover.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(bounds!.width).toBeGreaterThanOrEqual(300);

    const popoverZIndex = Number.parseInt(
      await calendar.evaluate((node) => getComputedStyle(node.parentElement!).zIndex),
      10
    );
    expect(popoverZIndex).toBeGreaterThan(dialogZIndex);

    const weekdayWidths = await calendar.locator(".rdp-weekday").evaluateAll((cells) =>
      cells.map((cell) => cell.getBoundingClientRect().width)
    );
    expect(weekdayWidths.every((width) => width > 0)).toBe(true);
    expect(Math.min(...weekdayWidths)).toBeGreaterThanOrEqual(38);
    expect(Math.max(...weekdayWidths) - Math.min(...weekdayWidths)).toBeLessThan(1);

    await calendar.getByRole("button", { name: /16 settembre 2026/ }).click();
    await expect(calendar).toBeHidden();
    await expect(dateInput).toHaveValue("16/09/2026");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("button-cancel").click();

    expect(blockedWrites).toEqual([]);
  });
}

const quoteAndInstallmentFlows: Array<{
  name: string;
  path: string;
  inputTestId: string;
  extraPickerTriggerTestId?: string;
  prepare: (page: Page) => Promise<void>;
}> = [
  {
    name: "editor preventivo",
    path: harnessPath,
    inputTestId: "input-expires-at-manual",
    prepare: async (page) => {
      await page.getByTestId("open-quote-builder").click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  {
    name: "preventivo rapido",
    path: "/preventivo-rapido/e2e-date-selector",
    inputTestId: "input-event-date-quick-quote",
    prepare: async (page) => {
      await expect(page.getByText("Preventivo di prova", { exact: true })).toBeVisible();
    },
  },
  {
    name: "generazione rate",
    path: harnessPath,
    inputTestId: "input-data-scadenza-0",
    prepare: async (page) => {
      await page.getByTestId("open-generate-payments").click();
      const dialog = page.getByRole("dialog", { name: "Genera Piano Pagamenti" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("tab", { name: "Manuale" }).click();
    },
  },
  {
    name: "modifica rata",
    path: harnessPath,
    inputTestId: "input-data-scadenza-manual",
    extraPickerTriggerTestId: "button-date-picker",
    prepare: async (page) => {
      await page.getByTestId("open-installment").click();
      const dialog = page.getByRole("dialog", { name: "Modifica Rata" });
      await expect(dialog).toBeVisible();
      await dialog.getByTestId("installment-date-mode-absolute").click();
    },
  },
];

async function selectDateWithKeyboard(
  page: Page,
  inputTestId: string,
  triggerTestId = `${inputTestId}-calendar-button`,
  tabsToReachTrigger = 1,
) {
  const dateInput = page.getByTestId(inputTestId);
  await dateInput.focus();
  await dateInput.press("Control+A");
  await dateInput.pressSequentially("15/09/2026");
  await expect(dateInput).toHaveValue("15/09/2026");

  const trigger = page.getByTestId(triggerTestId);
  for (let tabIndex = 0; tabIndex < tabsToReachTrigger; tabIndex += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");

  const calendar = page.locator(".rdp-root").last();
  await expect(calendar).toBeVisible();
  const selectedDate = calendar.getByRole("button", { name: /15 settembre 2026/ });
  await expect(selectedDate).toBeFocused();

  await page.keyboard.press("ArrowRight");
  const nextDate = calendar.getByRole("button", { name: /16 settembre 2026/ });
  await expect(nextDate).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(calendar).toBeHidden();
  await expect(dateInput).toHaveValue("16/09/2026");
}

for (const flow of quoteAndInstallmentFlows) {
  test(`${flow.name}: scegliere la data solo con la tastiera`, async ({ page }) => {
      const blockedWrites = await isolateBrowser(page);
    await page.goto(flow.path);
    await flow.prepare(page);
    await selectDateWithKeyboard(page, flow.inputTestId);

    if (flow.extraPickerTriggerTestId) {
      await selectDateWithKeyboard(
        page,
        flow.inputTestId,
        flow.extraPickerTriggerTestId,
        2,
      );
    }

    expect(blockedWrites).toEqual([]);
  });
}

test("richiesta consulenza: invia al backend il range selezionato", async ({ page }) => {
  const consultationRequests: Array<{ path: string; body: unknown }> = [];
  const blockedWrites = await isolateBrowser(page, undefined, (request) => {
    consultationRequests.push({
      path: new URL(request.url()).pathname,
      body: request.postDataJSON(),
    });
  });
  const jobId = "e2e-date-selector-job";
  await page.goto(`/admin/__e2e/date-selectors/job/${jobId}`);

  await page.getByTestId("button-send-consultation").click();
  const templateDialog = page.getByRole("dialog", { name: "Seleziona Tipo Consulenza" });
  await templateDialog.getByText("Consulenza di prova").click();
  await templateDialog.getByTestId("button-confirm-template").click();

  const dialog = page.getByRole("dialog", { name: "Invia Richiesta Consulenza" });
  const trigger = dialog.getByTestId("consultation-date-range-trigger");
  await trigger.click();
  const popover = page.getByTestId("consultation-date-range-popover");
  const calendar = popover.locator(".rdp-root");

  const dates = await page.evaluate(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const firstDate = today.getDate() <= lastDay - 2
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12)
      : new Date(today.getFullYear(), today.getMonth() + 1, 1, 12);
    const secondDate = new Date(firstDate);
    secondDate.setDate(firstDate.getDate() + 1);
    const dateParts = (date: Date) => {
      const parts = new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).formatToParts(date);
      const getPart = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? "";
      return {
        iso: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
        accessibleLabel: `${getPart("day")} ${getPart("month")} ${getPart("year")}`,
        firstIsNextMonth: date.getMonth() !== today.getMonth(),
      };
    };

    return {
      first: dateParts(firstDate),
      second: dateParts(secondDate),
    };
  });

  if (dates.first.firstIsNextMonth) {
    await calendar.locator(".rdp-button_next").click();
  }
  await calendar.getByRole("button", {
    name: new RegExp(`\\b${dates.first.accessibleLabel}\\b`, "i"),
  }).click();
  await calendar.getByRole("button", {
    name: new RegExp(`\\b${dates.second.accessibleLabel}\\b`, "i"),
  }).click();

  await expect(popover).toBeHidden();
  await expect(trigger).toHaveAttribute("data-range-from", dates.first.iso);
  await expect(trigger).toHaveAttribute("data-range-to", dates.second.iso);
  await dialog.getByTestId("button-send-email").click();

  await expect(dialog).toBeHidden();
  expect(consultationRequests).toEqual([
    {
      path: `/api/jobs/${jobId}/send-consultation-request`,
      body: {
        templateId: "e2e-consultation-template",
        channel: "email",
        dateFrom: dates.first.iso,
        dateTo: dates.second.iso,
      },
    },
  ]);
  expect(blockedWrites).toEqual([]);
});

for (const viewport of [
  { name: "normale", width: 1280, height: 900 },
  { name: "stretto", width: 390, height: 844 },
]) {
  test(`richiesta consulenza: calendario nel dialog e range aggiornato nel viewport ${viewport.name}`, async ({ page }) => {
    const blockedWrites = await isolateBrowser(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(harnessPath);
    await page.getByTestId("open-consultation-request").click();

    const dialog = page.getByRole("dialog", { name: "Invia Richiesta Consulenza" });
    const trigger = dialog.getByTestId("consultation-date-range-trigger");
    await expect(trigger).toHaveText("Tutte le date disponibili");
    await trigger.click();

    const popover = page.getByTestId("consultation-date-range-popover");
    const calendar = popover.locator(".rdp-root");
    await expect(calendar).toBeVisible();
    const expectedMonthCount = viewport.width >= 640 ? 2 : 1;
    const months = calendar.locator(".rdp-month");
    await expect(months).toHaveCount(expectedMonthCount);

    for (let index = 0; index < expectedMonthCount; index += 1) {
      const month = months.nth(index);
      await expect(month.locator(".rdp-weekday")).toHaveCount(7);
      await expect(month.locator(".rdp-week").first().locator(".rdp-day")).toHaveCount(7);
      const weekdayWidths = await month.locator(".rdp-weekday").evaluateAll((cells) =>
        cells.map((cell) => cell.getBoundingClientRect().width)
      );
      expect(weekdayWidths.every((width) => width > 0)).toBe(true);
      expect(Math.max(...weekdayWidths) - Math.min(...weekdayWidths)).toBeLessThan(1);
    }

    const popoverBounds = await popover.boundingBox();
    expect(popoverBounds).not.toBeNull();
    expect(popoverBounds!.x).toBeGreaterThanOrEqual(0);
    expect(popoverBounds!.y).toBeGreaterThanOrEqual(0);
    expect(popoverBounds!.x + popoverBounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(popoverBounds!.y + popoverBounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(popoverBounds!.height).toBeGreaterThanOrEqual(280);

    const dialogZIndex = Number.parseInt(
      await dialog.evaluate((node) => getComputedStyle(node).zIndex),
      10
    );
    const popoverZIndex = Number.parseInt(
      await popover.evaluate((node) => getComputedStyle(node).zIndex),
      10
    );
    expect(popoverZIndex).toBeGreaterThan(dialogZIndex);

    const dates = await page.evaluate(() => {
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const firstDate = today.getDate() <= lastDay - 2
        ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12)
        : new Date(today.getFullYear(), today.getMonth() + 1, 1, 12);
      const secondDate = new Date(firstDate);
      secondDate.setDate(firstDate.getDate() + 1);
      const dateParts = (date: Date) => {
        const parts = new Intl.DateTimeFormat("it-IT", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).formatToParts(date);
        const getPart = (type: Intl.DateTimeFormatPartTypes) =>
          parts.find((part) => part.type === type)?.value ?? "";
        return {
          iso: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
          accessibleLabel: `${getPart("day")} ${getPart("month")} ${getPart("year")}`,
          summaryLabel: `${String(date.getDate()).padStart(2, "0")} ${new Intl.DateTimeFormat("it-IT", { month: "short" }).format(date).replace(/\./g, "")}`,
          summaryWithYear: `${String(date.getDate()).padStart(2, "0")} ${new Intl.DateTimeFormat("it-IT", { month: "short" }).format(date).replace(/\./g, "")} ${date.getFullYear()}`,
        };
      };

      return {
        first: dateParts(firstDate),
        second: dateParts(secondDate),
        firstIsNextMonth: firstDate.getMonth() !== today.getMonth(),
      };
    });

    if (dates.firstIsNextMonth && expectedMonthCount === 1) {
      await calendar.locator(".rdp-button_next").click();
    }
    await calendar.getByRole("button", {
      name: new RegExp(`\\b${dates.first.accessibleLabel}\\b`, "i"),
    }).click();
    await expect(popover).toBeVisible();
    await expect(trigger).toHaveAttribute("data-range-from", dates.first.iso);
    await expect(trigger).toHaveAttribute("data-range-to", dates.first.iso);
    await calendar.getByRole("button", {
      name: new RegExp(`\\b${dates.second.accessibleLabel}\\b`, "i"),
    }).click();

    await expect(popover).toBeHidden();
    await expect(trigger).toHaveAttribute("data-range-from", dates.first.iso);
    await expect(trigger).toHaveAttribute("data-range-to", dates.second.iso);
    await expect(trigger).toContainText(dates.first.summaryLabel);
    await expect(trigger).toContainText(dates.second.summaryWithYear);
    await expect(dialog.getByTestId("button-send-consultation")).toBeVisible();

    await dialog.getByRole("button", { name: "Annulla" }).click();
    expect(blockedWrites).toEqual([]);
  });

  for (const flow of quoteAndInstallmentFlows) {
    test(`${flow.name}: popover leggibile e data aggiornata nel viewport ${viewport.name}`, async ({ page }) => {
      const blockedWrites = await isolateBrowser(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(flow.path);
      await flow.prepare(page);
      await assertDatePickerWorks(page, viewport, flow.inputTestId);
      if (flow.extraPickerTriggerTestId) {
        await assertDatePickerWorks(page, viewport, flow.inputTestId, flow.extraPickerTriggerTestId);
      }
      expect(blockedWrites).toEqual([]);
    });
  }
}

test("richiesta consulenza: seleziona da tastiera un range senza scrivere", async ({ page }) => {
  const blockedWrites = await isolateBrowser(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(harnessPath);
  await page.getByTestId("open-consultation-request").click();

  const dialog = page.getByRole("dialog", { name: "Invia Richiesta Consulenza" });
  const trigger = dialog.getByTestId("consultation-date-range-trigger");
  await trigger.focus();
  await page.keyboard.press("Enter");

  const popover = page.getByTestId("consultation-date-range-popover");
  const calendar = popover.locator(".rdp-root");
  await expect(calendar).toBeVisible();

  const today = await page.evaluate(() => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    const parts = (value: Date) => {
      const formatted = new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).formatToParts(value);
      const getPart = (type: Intl.DateTimeFormatPartTypes) =>
        formatted.find((part) => part.type === type)?.value ?? "";
      return {
        iso: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`,
        accessibleLabel: `${getPart("day")} ${getPart("month")} ${getPart("year")}`,
        summaryLabel: `${String(value.getDate()).padStart(2, "0")} ${new Intl.DateTimeFormat("it-IT", { month: "short" }).format(value).replace(/\./g, "")}`,
        summaryWithYear: `${String(value.getDate()).padStart(2, "0")} ${new Intl.DateTimeFormat("it-IT", { month: "short" }).format(value).replace(/\./g, "")} ${value.getFullYear()}`,
      };
    };
    const first = new Date(date);
    first.setDate(first.getDate() + 1);
    const second = new Date(first);
    second.setDate(second.getDate() + 1);
    return { today: parts(date), first: parts(first), second: parts(second) };
  });

  const activeDay = calendar.getByRole("button", {
    name: new RegExp(`\\b${today.today.accessibleLabel}\\b`, "i"),
  });
  await expect(activeDay).toBeFocused();

  await page.keyboard.press("ArrowRight");
  const firstDay = calendar.getByRole("button", {
    name: new RegExp(`\\b${today.first.accessibleLabel}\\b`, "i"),
  });
  await expect(firstDay).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(popover).toBeVisible();
  await expect(trigger).toHaveAttribute("data-range-from", today.first.iso);
  await expect(trigger).toHaveAttribute("data-range-to", today.first.iso);

  await page.keyboard.press("ArrowRight");
  const secondDay = calendar.getByRole("button", {
    name: new RegExp(`\\b${today.second.accessibleLabel}\\b`, "i"),
  });
  await expect(secondDay).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(popover).toBeHidden();
  await expect(trigger).toHaveAttribute("data-range-from", today.first.iso);
  await expect(trigger).toHaveAttribute("data-range-to", today.second.iso);
  await expect(trigger).toContainText(today.first.summaryLabel);
  await expect(trigger).toContainText(today.second.summaryWithYear);
  await dialog.getByRole("button", { name: "Annulla" }).click();

  expect(blockedWrites).toEqual([]);
});
