import { expect, test } from "@playwright/test";

const port = process.env.QUOTE_PUBLIC_DUPLICATES_E2E_PORT ?? "4185";
const localOrigin = `http://127.0.0.1:${port}`;
const token = "duplicate-products-public-quote";
const products = [
  {
    customProductId: "custom-mini",
    nome: "Album aggiuntivo",
    descrizione: "Versione mini",
    prezzo: 120,
    selectable: true,
    selected: false,
    sezione: "Album",
  },
  {
    customProductId: "custom-large",
    nome: "Album aggiuntivo",
    descrizione: "Versione grande",
    prezzo: 240,
    selectable: true,
    selected: false,
    sezione: "Stampe",
  },
];

const publicQuote = {
  success: true,
  data: {
    quote: {
      id: "duplicate-products-quote",
      jobId: "duplicate-products-job",
      clienteId: "duplicate-products-client",
      type: "variabile",
      status: "inviato",
      publicToken: token,
      products,
      totalBeforeDiscount: 360,
      totalAfterDiscount: 360,
      contractClauses: [],
      theme: { primaryColor: "#718271", secondaryColor: "#d8e1d8" },
      benefitRules: [],
      requirementRules: [],
      createdBy: "test",
    },
    jobInfo: null,
    clientiInfo: [],
    appuntamentiClienti: [],
    jobTypeInfo: null,
  },
};

test("shows and selects same-name quote rows independently", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin !== localOrigin) {
      await route.abort();
      return;
    }

    if (url.pathname === `/api/quotes/public/${token}` && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(publicQuote),
      });
      return;
    }

    if (request.method() !== "GET" && request.method() !== "HEAD") {
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto(`/quote/${token}`);

  await expect(page.getByRole("heading", { name: "Album", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stampe", exact: true })).toBeVisible();
  await expect(page.getByText("Versione mini").first()).toBeVisible();
  await expect(page.getByText("Versione grande").first()).toBeVisible();
  const albumSection = page
    .getByRole("heading", { name: "Album", exact: true })
    .locator("xpath=../..");
  const printsSection = page
    .getByRole("heading", { name: "Stampe", exact: true })
    .locator("xpath=../..");
  await expect(albumSection).toContainText("Versione mini");
  await expect(albumSection).not.toContainText("Versione grande");
  await expect(printsSection).toContainText("Versione grande");
  await expect(printsSection).not.toContainText("Versione mini");
  await expect(page.getByTestId("quote-total-value")).toHaveText(/0,00\s*€/);

  const sectionOrder = await page.locator("h3").evaluateAll((headings) =>
    headings.map((heading) => heading.textContent?.trim()).filter(Boolean),
  );
  expect(sectionOrder).toContain("Album");
  expect(sectionOrder).toContain("Stampe");
  expect(sectionOrder.indexOf("Album")).toBeLessThan(sectionOrder.indexOf("Stampe"));

  const miniCheckbox = page.getByTestId("checkbox-product-0");
  const largeCheckbox = page.getByTestId("checkbox-product-1");
  await miniCheckbox.check();
  await expect(miniCheckbox).toBeChecked();
  await expect(largeCheckbox).not.toBeChecked();
  await expect(page.getByTestId("quote-total-value")).toHaveText(/120,00\s*€/);

  await largeCheckbox.check();
  await expect(miniCheckbox).toBeChecked();
  await expect(largeCheckbox).toBeChecked();
  await expect(page.getByTestId("quote-total-value")).toHaveText(/360,00\s*€/);

  await miniCheckbox.uncheck();
  await expect(miniCheckbox).not.toBeChecked();
  await expect(largeCheckbox).toBeChecked();
  await expect(page.getByTestId("quote-total-value")).toHaveText(/240,00\s*€/);
});
