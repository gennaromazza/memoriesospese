import { expect, test, type Page, type Request, type Route } from "@playwright/test";

const port = process.env.QUOTE_BUILDER_PRODUCTS_E2E_PORT ?? "4184";
const localOrigin = `http://127.0.0.1:${port}`;
const firestoreEmulatorOrigin = "http://127.0.0.1:8089";
const firestoreDocumentsUrl =
  `${firestoreEmulatorOrigin}/v1/projects/wedding-gallery-397b6/databases/(default)/documents`;
const harnessPath = "/admin/__e2e/quote-builder-products";

type InterceptOptions = {
  onStorageUpload?: (route: Route, request: Request) => Promise<void>;
};

async function isolateBrowser(page: Page, options: InterceptOptions = {}) {
  const blockedWrites: string[] = [];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin === localOrigin) {
      if (!["GET", "HEAD"].includes(request.method())) {
        blockedWrites.push(`${request.method()} ${url.pathname}`);
        await route.abort();
        return;
      }
      await route.continue();
      return;
    }

    if (url.origin === firestoreEmulatorOrigin) {
      await route.continue();
      return;
    }

    if (url.hostname === "firebasestorage.googleapis.com") {
      if (options.onStorageUpload) {
        await options.onStorageUpload(route, request);
      } else {
        await route.abort();
      }
      return;
    }

    // Keep Firebase Auth, analytics, and all other external services isolated.
    await route.abort();
  });

  return blockedWrites;
}

test.beforeEach(async () => {
  const clearResponse = await fetch(
    `${firestoreEmulatorOrigin}/emulator/v1/projects/wedding-gallery-397b6/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!clearResponse.ok) {
    throw new Error(`Could not clear the local Firestore fixture: ${clearResponse.status}`);
  }

  const seedResponse = await fetch(
    `${firestoreDocumentsUrl}/quotes?documentId=e2e-quote-products`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fields: { type: { stringValue: "variabile" } },
      }),
    },
  );
  if (!seedResponse.ok) {
    throw new Error(`Could not seed the local quote fixture: ${seedResponse.status}`);
  }
});

function decodeFirestoreValue(value: any): any {
  if (!value || typeof value !== "object") return value;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  }
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, field]) => [
        key,
        decodeFirestoreValue(field),
      ]),
    );
  }
  return value;
}

async function readSavedProducts() {
  const response = await fetch(`${firestoreDocumentsUrl}/quotes/e2e-quote-products`);
  if (!response.ok) {
    throw new Error(`Could not read the saved local quote: ${response.status}`);
  }
  const savedQuote = await response.json();
  return decodeFirestoreValue({ mapValue: { fields: savedQuote.fields } }).products;
}

test("prodotti omonimi mantengono identità, prezzi, sezioni, ordine e omaggi dopo la riapertura", async ({ page }) => {
  const blockedWrites = await isolateBrowser(page);

  await page.goto(harnessPath);
  const dialog = page.getByRole("dialog", { name: "Modifica Preventivo" });
  await expect(dialog).toBeVisible();

  const rowA = page.getByTestId("order-row-cust:custom-quote-product-a");
  const rowB = page.getByTestId("order-row-cust:custom-quote-product-b");
  await expect(rowA).toContainText("Album aggiuntivo");
  await expect(rowB).toContainText("Album aggiuntivo");
  await expect(rowB.getByTestId("button-toggle-selectable-cust:custom-quote-product-b")).toContainText("FISSO");

  // Edits follow the stable custom ID rather than the duplicated product name.
  await rowB.getByTestId("button-edit-price-cust:custom-quote-product-b").click();
  const priceB = rowB.getByTestId("input-price-cust:custom-quote-product-b");
  await priceB.fill("255");
  await priceB.press("Enter");
  await expect(rowB.getByTestId("button-edit-price-cust:custom-quote-product-b")).toContainText("255,00");

  // Omaggio temporarily forces zero/fixed, then restores this row's edited state.
  const giftB = rowB.getByTestId("button-toggle-omaggio-cust:custom-quote-product-b");
  await giftB.click();
  await expect(giftB).toContainText("OMAGGIO");
  await expect(rowB).toContainText("✓ Incluso");
  await expect(rowB.getByTestId("button-toggle-selectable-cust:custom-quote-product-b")).toHaveCount(0);
  await giftB.click();
  await expect(rowB.getByTestId("button-edit-price-cust:custom-quote-product-b")).toContainText("255,00");
  await expect(rowB.getByTestId("button-toggle-selectable-cust:custom-quote-product-b")).toContainText("FISSO");

  // Give the second product its own section and move it ahead of the first.
  await rowB.getByTitle("Modifica sezione").click();
  const sectionB = rowB.getByTestId("input-section-cust:custom-quote-product-b");
  await sectionB.fill("Esperienze");
  await sectionB.press("Enter");
  await expect(rowB.getByTitle("Modifica sezione")).toContainText("Esperienze");

  await rowA.getByRole("button", { name: "Trascina per riordinare" }).dragTo(
    rowB.getByRole("button", { name: "Trascina per riordinare" }),
  );
  await expect.poll(async () =>
    page.locator('[data-testid^="order-row-cust:"]').evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-testid")),
    ),
  ).toEqual([
    "order-row-cust:custom-quote-product-b",
    "order-row-cust:custom-quote-product-a",
  ]);

  const save = dialog.getByRole("button", { name: "Salva Modifiche" });
  await save.click();
  await expect(page.getByTestId("quote-builder-saved")).toBeVisible();

  const savedProducts = await readSavedProducts();
  expect(savedProducts.map((product: any) => product.customProductId)).toEqual([
    "custom-quote-product-b",
    "custom-quote-product-a",
  ]);
  expect(savedProducts.map((product: any) => product.nome)).toEqual([
    "Album aggiuntivo",
    "Album aggiuntivo",
  ]);
  expect(savedProducts.map((product: any) => product.prezzo)).toEqual([255, 120]);
  expect(savedProducts.map((product: any) => product.selectable)).toEqual([false, true]);
  expect(savedProducts.map((product: any) => product.sezione)).toEqual(["Esperienze", "Album"]);
  expect(savedProducts.every((product: any) => product.isOmaggio !== true)).toBe(true);
  expect(blockedWrites).toEqual([]);

  // Reload with a fresh QueryClient. QuoteBuilder must hydrate the saved Firestore
  // emulator document, not the original fixture or the previous form state.
  await page.getByTestId("button-reopen-saved-quote").click();
  await page.waitForURL(/loadSavedQuote=1/);
  await expect(dialog).toBeVisible();

  const reopenedRowA = page.getByTestId("order-row-cust:custom-quote-product-a");
  const reopenedRowB = page.getByTestId("order-row-cust:custom-quote-product-b");
  await expect.poll(async () =>
    page.locator('[data-testid^="order-row-cust:"]').evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-testid")),
    ),
  ).toEqual([
    "order-row-cust:custom-quote-product-b",
    "order-row-cust:custom-quote-product-a",
  ]);
  await expect(reopenedRowA).toContainText("Album aggiuntivo");
  await expect(reopenedRowA.getByTestId("button-edit-price-cust:custom-quote-product-a")).toContainText("120,00");
  await expect(reopenedRowA.getByTestId("button-toggle-selectable-cust:custom-quote-product-a")).toContainText("EXTRA");
  await expect(reopenedRowA.getByTitle("Modifica sezione")).toContainText("Album");
  await expect(reopenedRowB).toContainText("Album aggiuntivo");
  await expect(reopenedRowB.getByTestId("button-edit-price-cust:custom-quote-product-b")).toContainText("255,00");
  await expect(reopenedRowB.getByTestId("button-toggle-selectable-cust:custom-quote-product-b")).toContainText("FISSO");
  await expect(reopenedRowB.getByTitle("Modifica sezione")).toContainText("Esperienze");
  await expect(reopenedRowB.getByTestId("button-toggle-omaggio-cust:custom-quote-product-b")).toHaveText("Omaggio");

  // Also persist an active gift, keeping the same-name paid product untouched.
  await reopenedRowA.getByTestId("button-toggle-omaggio-cust:custom-quote-product-a").click();
  await expect(reopenedRowA).toContainText("✓ Incluso");
  await save.click();
  await expect(page.getByTestId("quote-builder-saved")).toBeVisible();
  const savedWithGift = await readSavedProducts();
  expect(savedWithGift.map((product: any) => ({
    id: product.customProductId,
    prezzo: product.prezzo,
    selectable: product.selectable,
    isOmaggio: product.isOmaggio,
    sezione: product.sezione,
  }))).toEqual([
    { id: "custom-quote-product-b", prezzo: 255, selectable: false, isOmaggio: false, sezione: "Esperienze" },
    { id: "custom-quote-product-a", prezzo: 0, selectable: false, isOmaggio: true, sezione: "Album" },
  ]);

  await page.getByTestId("button-reopen-saved-quote").click();
  await expect(dialog).toBeVisible();
  await expect(reopenedRowA.getByTestId("button-toggle-omaggio-cust:custom-quote-product-a")).toHaveText("OMAGGIO");
  await expect(reopenedRowA).toContainText("✓ Incluso");
  await expect(reopenedRowA.getByTestId("button-toggle-selectable-cust:custom-quote-product-a")).toHaveCount(0);
  await expect(reopenedRowB.getByTestId("button-edit-price-cust:custom-quote-product-b")).toContainText("255,00");
  await expect(reopenedRowB.getByTestId("button-toggle-selectable-cust:custom-quote-product-b")).toContainText("FISSO");
  await expect(reopenedRowB.getByTestId("button-toggle-omaggio-cust:custom-quote-product-b")).toHaveText("Omaggio");
  expect(blockedWrites).toEqual([]);
});

test("un upload completato dopo la rimozione della riga non viene assegnato al prodotto successivo", async ({ page }) => {
  let releaseUpload!: () => void;
  let signalUploadStarted!: () => void;
  let signalDownloadUrlRequested!: () => void;
  const uploadGate = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  const uploadStarted = new Promise<void>((resolve) => {
    signalUploadStarted = resolve;
  });
  const downloadUrlRequested = new Promise<void>((resolve) => {
    signalDownloadUrlRequested = resolve;
  });
  const blockedWrites = await isolateBrowser(page, {
    onStorageUpload: async (route, request) => {
      const url = new URL(request.url());
      const name = url.searchParams.get("name") ?? "quote-products/e2e.png";
      const metadata = {
        name,
        bucket: "wedding-gallery-397b6.firebasestorage.app",
        generation: "1",
        metageneration: "1",
        contentType: "image/png",
        timeCreated: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-01T00:00:00.000Z",
        size: "68",
        md5Hash: "e2e",
        downloadTokens: "quote-builder-products-e2e-token",
      };

      if (request.method() === "POST") {
        signalUploadStarted();
        await uploadGate;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(metadata) });
      } else if (request.method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(metadata) });
        signalDownloadUrlRequested();
      } else {
        await route.abort();
      }
    },
  });

  await page.goto(harnessPath);
  const dialog = page.getByRole("dialog", { name: "Modifica Preventivo" });
  await expect(dialog).toBeVisible();
  await page.getByTestId("button-toggle-expand-product-0").click();
  const uploadInput = page.getByTestId("input-upload-image-0");
  await expect(uploadInput).toBeAttached();
  await uploadInput.setInputFiles({
    name: "pending-product.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  });
  await uploadStarted;

  // Remove the product whose upload is still pending; the other row shifts to index 0.
  await page.getByTestId("button-remove-product-0").click();
  await page.getByTestId("button-toggle-expand-product-0").click();
  await expect(page.getByTestId("input-product-name-0")).toHaveValue("Album aggiuntivo");
  releaseUpload();
  await downloadUrlRequested;
  await expect(page.getByTestId("input-product-name-0")).toHaveValue("Album aggiuntivo");
  await expect(page.getByRole("img", { name: "Prodotto 1 - Immagine 1" })).toHaveCount(0);

  await page.getByRole("button", { name: "Salva Modifiche" }).click();
  await expect(page.getByTestId("quote-builder-saved")).toBeVisible();

  const savedProducts = await readSavedProducts();
  expect(savedProducts).toHaveLength(1);
  expect(savedProducts[0]).toMatchObject({
    customProductId: "custom-quote-product-b",
    nome: "Album aggiuntivo",
    prezzo: 240,
    sezione: "Stampe",
  });
  expect(savedProducts[0].immagini ?? []).toEqual([]);
  expect(blockedWrites).toEqual([]);
});
