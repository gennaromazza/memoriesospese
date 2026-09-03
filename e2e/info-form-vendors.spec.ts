import { test, expect, devices } from "@playwright/test";
import type { Page } from "@playwright/test";

test.use({ ...devices["iPhone 13"], browserName: "chromium" });

const TOKEN = "e2e-mobile-vendors-token";

const submission = {
  id: "submission-mobile-vendors",
  jobId: "job-mobile-vendors",
  templateId: "template-mobile-vendors",
  templateName: "Informazioni evento",
  token: TOKEN,
  clientName: "Mario Rossi",
  clientEmail: "mario@example.com",
  status: "pending",
  answers: {},
  templateFields: [
    {
      id: "fornitori",
      label: "Fornitori",
      type: "vendor",
      required: true,
    },
  ],
};

const vendorValues = [
  {
    name: "Atelier Aurora",
    category: "Atelier sposa",
    location: "Aversa (CE)",
  },
  {
    name: "Fiori Bianchi",
    category: "Floral designer",
    location: "Caserta",
  },
  {
    name: "Musica del Borgo",
    category: "Intrattenimento",
    location: "Napoli",
  },
];

async function fillVendor(
  page: Page,
  index: number,
  vendor: (typeof vendorValues)[number],
) {
  await page.getByPlaceholder("Nome del fornitore").nth(index).fill(vendor.name);
  await page
    .getByPlaceholder("Categoria, es. floral designer")
    .nth(index)
    .fill(vendor.category);
  await page
    .getByPlaceholder("Luogo, es. Aversa (CE)")
    .nth(index)
    .fill(vendor.location);
}

test.describe("Modulo informativo pubblico – fornitori su mobile", () => {
  test("compila, valida, rimuove e invia più fornitori senza URL", async ({
    page,
  }) => {
    let submittedAnswers: Record<string, unknown> | undefined;

    await page.route(`**/api/info-forms/by-token/${TOKEN}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(submission),
      });
    });
    await page.route(
      `**/api/info-forms/by-token/${TOKEN}/submit`,
      async (route) => {
        submittedAnswers = (route.request().postDataJSON() as {
          answers: Record<string, unknown>;
        }).answers;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      },
    );
    await page.route("**/api/email/send-info-form-submitted", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem("image_studio_cookie_consent", "true");
      window.localStorage.setItem(
        "image_studio_cookie_preferences",
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });
    await page.goto(`/modulo/${TOKEN}`);
    await expect(page.getByRole("heading", { name: "Fornitori*" })).toBeVisible();

    // Il controllo client impedisce l'invio di una lista vuota.
    await page.getByRole("button", { name: "Invia Modulo" }).click();
    await expect(
      page.getByText("Aggiungi almeno un fornitore"),
    ).toBeVisible();

    const addVendorButton = page.getByRole("button", {
      name: "Aggiungi fornitore",
    });
    await addVendorButton.click();
    await addVendorButton.click();
    await addVendorButton.click();
    await expect(page.getByText("Fornitore 3")).toBeVisible();

    await expect(page.getByPlaceholder("Nome del fornitore")).toHaveCount(3);
    await expect(
      page.getByPlaceholder("Categoria, es. floral designer"),
    ).toHaveCount(3);
    await expect(page.getByPlaceholder("Luogo, es. Aversa (CE)")).toHaveCount(
      3,
    );

    // Il modello espone solo nome, categoria e luogo, mai un campo URL.
    await expect(page.locator('input[type="url"]')).toHaveCount(0);
    await expect(page.locator("input")).toHaveCount(9);

    for (let index = 0; index < vendorValues.length; index += 1) {
      await fillVendor(page, index, vendorValues[index]);
    }

    // Rimuovendo il secondo elemento, il terzo deve restare e diventare il
    // secondo elemento della lista.
    await page
      .getByRole("button", { name: "Rimuovi fornitore 2" })
      .click();
    await expect(page.getByText("Fornitore 3")).toHaveCount(0);
    await expect(page.getByText("Fornitore 2")).toBeVisible();
    await expect(
      page.getByPlaceholder("Nome del fornitore").nth(1),
    ).toHaveValue(vendorValues[2].name);
    await expect(page.getByPlaceholder("Nome del fornitore")).toHaveCount(2);

    // Ogni proprietà è obbligatoria per ogni fornitore, non solo per il primo.
    const requiredFields = [
      "Nome del fornitore",
      "Categoria, es. floral designer",
      "Luogo, es. Aversa (CE)",
    ];
    for (const placeholder of requiredFields) {
      for (let index = 0; index < 2; index += 1) {
        const input = page.getByPlaceholder(placeholder).nth(index);
        const originalValue = await input.inputValue();
        await input.fill("");
        await page.getByRole("button", { name: "Invia Modulo" }).click();
        await expect(
          page.getByText("Completa nome, categoria e luogo per ogni fornitore"),
        ).toBeVisible();
        await input.fill(originalValue);
      }
    }

    await page.getByRole("button", { name: "Invia Modulo" }).click();
    await expect(
      page.getByRole("heading", { name: "Grazie!" }),
    ).toBeVisible();
    expect(submittedAnswers).toEqual({
      fornitori: [vendorValues[0], vendorValues[2]],
    });
    expect(JSON.stringify(submittedAnswers)).not.toContain('"url"');
  });
});