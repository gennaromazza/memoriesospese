import { expect, test, type Page } from "@playwright/test";

const port = process.env.QUICK_QUOTE_PREVIEW_E2E_PORT ?? "4181";
const localOrigin = `http://127.0.0.1:${port}`;
const token = "e2e-quick-quote-preview";
const quotePath = `/api/quotes/quick/${token}`;
const sessionKey = `qqs_draft_${token}`;

const existingOtpDraft = {
  step: "otp",
  formData: {
    nome: "Cliente",
    cognome: "Prova",
    email: "cliente@example.test",
    cellulare: "",
    nomeEvento: "Evento di prova",
    dataNonDefinita: true,
    eventLocation: "",
    rituLocation: "",
    rituTime: "",
    noteCliente: "",
  },
  selectedProducts: ["product-album"],
};

const quickQuoteFixture = {
  success: true,
  data: {
    template: {
      id: "e2e-quick-quote-template",
      nome: "Preventivo interattivo",
      jobType: "matrimonio",
      type: "variabile" as const,
      theme: { primaryColor: "#8B9A8B", secondaryColor: "#C8D4C8" },
      defaultProducts: [
        {
          productId: "product-base",
          nome: "Servizio base",
          descrizione: "",
          prezzo: 800,
          selectable: false,
        },
        {
          productId: "product-album",
          nome: "Album completo",
          descrizione:
            "Album fotografico rilegato a mano, con copertina personalizzabile e stampe fine art. Include una selezione accurata delle immagini e una confezione pensata per conservarlo nel tempo.",
          prezzo: 250,
          selectable: true,
        },
        {
          productId: "product-video",
          nome: "Video evento",
          descrizione: "Un racconto video dell'evento, montato con musica e audio originali.",
          prezzo: 150,
          selectable: true,
        },
      ],
      defaultClauses: [],
      requirementRules: [
        {
          id: "video-requires-album",
          enabled: true,
          type: "requires",
          blockedProductNames: ["Video evento"],
          requiredProductNames: ["Album completo"],
        },
      ],
    },
    jobTypeInfo: null,
    studioInfo: null,
  },
};

async function isolateBrowser(page: Page) {
  const quickQuotePosts: string[] = [];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    // Keep this browser check independent of Firebase, live APIs, and other hosts.
    if (url.origin !== localOrigin) {
      await route.abort();
      return;
    }

    if (request.method() === "POST") {
      if (url.pathname.startsWith(`${quotePath}/`)) {
        quickQuotePosts.push(url.pathname);
      }
      // Never allow a write to reach the dev server or any configured API.
      await route.abort();
      return;
    }

    if (url.pathname === quotePath && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(quickQuoteFixture),
      });
      return;
    }

    if (!["GET", "HEAD"].includes(request.method())) {
      await route.abort();
      return;
    }

    await route.continue();
  });

  return quickQuotePosts;
}

test("su mobile, prodotti leggibili e totale aggiornato dopo ogni selezione", async ({ page }) => {
  const quickQuotePosts = await isolateBrowser(page);
  const storedDraft = JSON.stringify(existingOtpDraft);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(
    ({ key, draft }) => window.sessionStorage.setItem(key, JSON.stringify(draft)),
    { key: sessionKey, draft: existingOtpDraft },
  );
  await page.goto(`/preventivo-rapido/${token}?preview=1`);

  await expect(page.getByTestId("cookie-banner")).toBeVisible();
  await page.getByTestId("cookie-reject-btn").tap();
  await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
  await expect(page.getByTestId("quick-quote-preview-notice")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preventivo interattivo" })).toBeVisible();
  expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "la pagina non deve avere scorrimento orizzontale su telefono",
  ).toBe(true);
  await expect(page.getByRole("heading", { name: "Verifica la tua email" })).toHaveCount(0);
  await expect(page.getByText("Cliente Prova", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /Invia Preventivo|Conferma e Firma|Riprova invio|Verifica codice|Rinvia codice/,
    }),
  ).toHaveCount(0);

  const total = page.getByText("Totale", { exact: true }).locator("xpath=..").locator("span").nth(1);
  const mobileTotal = page.getByTestId("quick-quote-mobile-total");
  const album = page.getByRole("checkbox", { name: "Album completo", exact: true });
  const video = page.getByRole("checkbox", { name: /^Video evento/ });
  const albumDescription = page.getByText(quickQuoteFixture.data.template.defaultProducts[1].descrizione);
  const videoRequirement = page.getByText("Richiede: Album completo");

  const boxesOverlap = async (first: typeof album, second: typeof albumDescription) => {
    const firstBox = await first.boundingBox();
    const secondBox = await second.boundingBox();
    expect(firstBox, "il controllo deve avere dimensioni visibili").not.toBeNull();
    expect(secondBox, "il testo deve avere dimensioni visibili").not.toBeNull();
    return (
      firstBox!.x < secondBox!.x + secondBox!.width &&
      firstBox!.x + firstBox!.width > secondBox!.x &&
      firstBox!.y < secondBox!.y + secondBox!.height &&
      firstBox!.y + firstBox!.height > secondBox!.y
    );
  };
  const expectUpdatedVisibleTotal = async (amount: RegExp) => {
    await expect(total).toHaveText(amount);
    if (await mobileTotal.isVisible()) {
      await expect(mobileTotal).toBeInViewport();
      await expect(mobileTotal).toContainText(amount);
    } else {
      await expect(total).toBeInViewport();
    }
  };

  await expect(page.getByRole("checkbox", { name: "Sempre incluso" })).toHaveAttribute("aria-checked", "true");
  await expect(album).toHaveAttribute("aria-checked", "false");
  await expect(video).toHaveAttribute("aria-checked", "false");
  await expect(video).toBeDisabled();
  await expect(videoRequirement).toBeVisible();
  await expect(albumDescription).toBeVisible();
  expect(await boxesOverlap(album, albumDescription), "la descrizione non deve coprire la casella").toBe(false);
  expect(await boxesOverlap(video, videoRequirement), "il vincolo non deve coprire la casella").toBe(false);
  await expect(page.getByRole("button", { name: "Altro" })).toBeVisible();
  await expect(total).toHaveText(/800,00/);

  await page.getByRole("button", { name: "Altro" }).tap();
  await expect(page.getByRole("button", { name: "Meno" })).toBeVisible();
  await expect(albumDescription).toContainText("confezione pensata per conservarlo nel tempo");
  expect(await boxesOverlap(album, albumDescription), "la descrizione estesa non deve coprire la casella").toBe(false);

  await album.tap();
  await expect(album).toHaveAttribute("aria-checked", "true");
  await expectUpdatedVisibleTotal(/1050,00/);
  await expect(video).toBeEnabled();

  await video.tap();
  await expect(video).toHaveAttribute("aria-checked", "true");
  await expectUpdatedVisibleTotal(/1200,00/);

  await album.tap();
  await expect(album).toHaveAttribute("aria-checked", "false");
  await expect(video).toHaveAttribute("aria-checked", "false");
  await expectUpdatedVisibleTotal(/800,00/);

  await expect(page.getByTestId("quick-quote-preview-notice")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verifica la tua email" })).toHaveCount(0);
  expect(await page.evaluate((key) => window.sessionStorage.getItem(key), sessionKey)).toBe(storedDraft);
  expect(quickQuotePosts).toEqual([]);
});