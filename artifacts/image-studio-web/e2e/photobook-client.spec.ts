import { expect, test, type Page, type Route } from "@playwright/test";

const port = process.env.PHOTOBOOK_CLIENT_E2E_PORT ?? "4179";
const localOrigin = `http://127.0.0.1:${port}`;
const token = "e2e-photobook-token";
const materialId = "2224386b-262c-5756-96b9-9e458ab95a8f";
const oldModelSelection = { labId: "legacy-studio", modelId: "legacy-plaza" };
const custodiaId = "15870135-cc65-5c61-8db0-ccccd8529a77";
const girevoleId = "44444444-4444-4444-8444-444444444444";
const crop = { zoom: 1, x: 0.5, y: 0.5 };

const custodiaOption = {
  id: custodiaId,
  name: "Custodia",
  supplierCode: "C-01",
  rendererId: custodiaId,
  active: true,
  materialIds: [materialId],
  materials: [{ id: materialId, label: "Tessuto di prova", supplierCode: "C-01" }],
  labId: "studio",
  labName: "Studio",
};

const girevoleOption = {
  id: girevoleId,
  name: "Album girevole",
  supplierCode: "G-01",
  rendererId: "album-girevole",
  active: true,
  materialIds: [materialId],
  materials: [{ id: materialId, label: "Tessuto di prova", supplierCode: "G-01" }],
  labId: "studio",
  labName: "Studio",
};

const legacyPlazaOption = {
  id: oldModelSelection.modelId,
  name: "Plaza LED",
  supplierCode: "P-01",
  rendererId: "plaza-led",
  active: true,
  materialIds: [materialId],
  materials: [{ id: materialId, label: "Tessuto di prova", supplierCode: "P-01" }],
  labId: oldModelSelection.labId,
  labName: "Studio",
};

const plazaConfiguration = {
  modelId: "plaza-led",
  assetRevision: 2,
  materialId,
  appearanceRevision: 4,
  coverLayout: "plaque",
  frameFinish: "fabric",
  topText: "",
  bottomText: "",
  photoAssetId: null,
  crop,
  backCover: "fabric",
  backPhotoAssetId: null,
  backCrop: crop,
  ledEnabled: true,
};

const girevoleConfiguration = {
  modelId: "album-girevole",
  assetRevision: 4,
  materialId,
  appearanceRevision: 4,
  coverLayout: "plaque",
  frameFinish: "wood",
  topText: "",
  bottomText: "",
  photoAssetId: null,
  crop,
  backCover: "fabric",
  backPhotoAssetId: null,
  backCrop: crop,
};

function multiModelClientPayload(saved: object) {
  return {
    version: 1,
    mockupPath: "client",
    editable: true,
    enabled: true,
    approvalRequired: false,
    saved,
    offer: {
      revision: 2,
      mode: "choice",
      options: [custodiaOption, girevoleOption],
    },
    // The API exposes the version offer as authoritative even if the book's
    // legacy model assignment was fixed to Plaza LED.
    modelMode: "choice",
    modelSelection: null,
    offerError: null,
  };
}

function rendererTestPage() {
  return `<!doctype html>
    <html><body>
      <aside><div class="panel-content"><section id="summaryPanel"></section></div></aside>
      <main><div class="workspace"><section class="stage"></section></div></main>
      <script>
        const channel = "memorie-mockup-v1";
        const materialId = "${materialId}";
        const crop = { zoom: 1, x: 0.5, y: 0.5 };
        const configurations = {
          "${custodiaId}": {
            modelId: "${custodiaId}", assetRevision: 2, materialId, appearanceRevision: 4,
            coverLayout: "oblique", topText: "", bottomText: "",
            photoAssetId: "11111111-1111-4111-8111-111111111111", crop
          },
          "album-girevole": {
            modelId: "album-girevole", assetRevision: 4, materialId, appearanceRevision: 4,
            coverLayout: "plaque", frameFinish: "wood", topText: "", bottomText: "",
            photoAssetId: null, crop, backCover: "fabric", backPhotoAssetId: null, backCrop: crop
          },
          "plaza-led": {
            modelId: "plaza-led", assetRevision: 2, materialId, appearanceRevision: 4,
            coverLayout: "plaque", frameFinish: "fabric", topText: "", bottomText: "",
            photoAssetId: null, crop, backCover: "fabric", backPhotoAssetId: null,
            backCrop: crop, ledEnabled: true
          }
        };
        const send = (type, payload = {}) =>
          parent.postMessage({ channel, type, ...payload }, location.origin);
        window.addEventListener("message", event => {
          if (event.source !== parent || event.data?.channel !== channel || event.data.type !== "apply") return;
          const rendererId = event.data.option?.rendererId || "${custodiaId}";
          send("change", { configuration: event.data.configuration || configurations[rendererId] || configurations["${custodiaId}"] });
          send("busy", { busy: false });
        });
        send("ready");
        send("busy", { busy: false });
      </script>
    </body></html>`;
}

async function mockPhotobookApi(page: Page, mockupResponse: (route: Route) => Promise<void>) {
  let mockupRequests = 0;

  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin !== localOrigin) {
      await route.abort();
      return;
    }

    if (url.pathname === `/api/photobooks/by-token/${token}/gallery-photos`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ photos: [], chapters: [] }),
      });
      return;
    }

    if (url.pathname === `/api/photobooks/by-token/${token}/mockup`) {
      mockupRequests += 1;
      await mockupResponse(route);
      return;
    }

    if (url.pathname.startsWith("/mockups/") && url.pathname.endsWith("/index.html")) {
      await route.fulfill({ status: 200, contentType: "text/html", body: rendererTestPage() });
      return;
    }

    if (url.pathname === `/api/photobooks/by-token/${token}`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          photobook: {
            id: "e2e-photobook",
            name: "Fotolibro di prova",
            galleryId: "e2e-gallery",
            token,
            currentVersion: 1,
            versions: [{ version: 1, pageCount: 0 }],
            approval: { version: 1 },
            mockupPath: "client",
          },
          version: 1,
          pages: [],
          requests: [],
        }),
      });
      return;
    }

    if (request.method() === "GET" || request.method() === "HEAD") {
      await route.continue();
      return;
    }
    await route.abort();
  });
  return () => mockupRequests;
}

function mockupPayload(enabled: boolean, editable = false) {
  return {
    version: 1,
    mockupPath: "client",
    editable,
    enabled,
    approvalRequired: false,
    saved: null,
    offer: null,
    modelMode: "choice",
    modelSelection: null,
    offerError: null,
  };
}

async function fulfillMockup(route: Route, body: object) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test("su mobile il mockup ha un solo accesso e un errore di caricamento recuperabile", async ({ page }) => {
  let allowMockupRetry = false;
  const getMockupRequests = await mockPhotobookApi(page, async route => {
    if (!allowMockupRetry) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Servizio temporaneamente non disponibile" }),
      });
      return;
    }
    await fulfillMockup(route, mockupPayload(false));
  });
  await page.goto(`/fotolibro/${token}`);

  const card = page.getByTestId("card-photobook-mockup-mobile");
  await expect(card).toBeVisible();
  const loadError = card.getByTestId("photobook-mockup-load-error");
  await expect(loadError).toBeVisible();
  await expect(loadError.getByRole("alert")).toContainText("Impossibile caricare il mockup");
  await expect(card.getByText("Personalizzazione in preparazione")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Riprova" })).toBeVisible();

  allowMockupRetry = true;
  await card.getByRole("button", { name: "Riprova" }).click();

  await expect(card.getByText("Personalizzazione in preparazione")).toBeVisible();
  await expect(page.getByText("Personalizzazione in preparazione")).toHaveCount(1);
  expect(getMockupRequests()).toBeGreaterThan(1);
});

test("su mobile il cliente vede un solo pulsante per aprire un mockup pronto", async ({ page }) => {
  const getMockupRequests = await mockPhotobookApi(page, route =>
    fulfillMockup(route, mockupPayload(true, true)),
  );
  await page.goto(`/fotolibro/${token}`);

  const card = page.getByTestId("card-photobook-mockup-mobile");
  await expect(card).toBeVisible();
  const mockup = card.getByTestId("photobook-mockup");
  await expect(mockup).toHaveCount(1);
  await expect(mockup.getByRole("button")).toHaveCount(1);
  expect(getMockupRequests()).toBe(1);
});

test("il cliente confronta tutti i modelli e recupera la scelta salvata anche con una vecchia assegnazione fissa", async ({ page }) => {
  const studioDraft = {
    revision: 1,
    status: "draft",
    updatedAt: "2026-10-01T10:00:00.000Z",
    updatedBy: "studio",
    selection: oldModelSelection,
    configuration: plazaConfiguration,
    option: legacyPlazaOption,
  };
  let payload = multiModelClientPayload(studioDraft);
  let saveRequest: { revision: number; configuration: typeof girevoleConfiguration; selection: typeof oldModelSelection; offerRevision: number } | undefined;

  await mockPhotobookApi(page, async route => {
    if (route.request().method() === "PUT") {
      saveRequest = route.request().postDataJSON() as typeof saveRequest;
      const selection = saveRequest?.selection;
      const chosenOption = [custodiaOption, girevoleOption].find(option =>
        option.labId === selection?.labId && option.id === selection?.modelId,
      );
      if (!chosenOption || !saveRequest) throw new Error("La scelta del cliente non corrisponde all’offerta.");

      const saved = {
        revision: saveRequest.revision + 1,
        status: "draft",
        updatedAt: "2026-10-01T10:05:00.000Z",
        updatedBy: "client",
        selection,
        configuration: saveRequest.configuration,
        option: chosenOption,
      };
      payload = multiModelClientPayload(saved);
      await fulfillMockup(route, saved);
      return;
    }
    await fulfillMockup(route, payload);
  });

  await page.addInitScript(() => sessionStorage.setItem("mockup-touch-guide", "seen"));
  await page.goto(`/fotolibro/${token}`);

  const mockup = page.getByTestId("photobook-mockup");
  await expect(mockup).toBeVisible();
  await mockup.getByRole("button").click();

  const chooser = page.getByTestId("mockup-model-chooser");
  await expect(chooser).toBeVisible();
  await expect(chooser).toHaveAttribute("data-chooser-stage", "models");
  const custodiaCard = page.getByTestId(`mockup-model-${custodiaId}`);
  const girevoleCard = page.getByTestId(`mockup-model-${girevoleId}`);
  await expect(custodiaCard).toBeVisible();
  await expect(girevoleCard).toBeVisible();
  await expect(custodiaCard).toHaveAttribute("aria-pressed", "false");
  await expect(girevoleCard).toHaveAttribute("aria-pressed", "false");

  await girevoleCard.click();
  await expect(chooser).toHaveAttribute("data-chooser-stage", "styles");
  await page.getByTestId("choose-mockup-example-plaque").click();
  await chooser.getByRole("button", { name: /Continua/ }).click();

  const rendererFrame = page.frameLocator('iframe[title="Configuratore 3D Album girevole"]');
  const saveDraft = rendererFrame.getByRole("button", { name: /Salva bozza/ });
  await expect(saveDraft).toBeEnabled();
  const savedStateRefresh = page.waitForResponse(response =>
    response.request().method() === "GET" &&
    response.url().includes(`/photobooks/by-token/${token}/mockup`),
  );
  await saveDraft.click();
  await expect.poll(() => saveRequest?.selection).toEqual({ labId: "studio", modelId: girevoleId });
  await expect.poll(() => payload.saved && (payload.saved as { updatedBy: string }).updatedBy).toBe("client");
  await savedStateRefresh;

  await page.reload();
  const reopenedMockup = page.getByTestId("photobook-mockup");
  await expect(reopenedMockup).toBeVisible();
  await reopenedMockup.getByRole("button").click();
  await expect(page.getByTestId("mockup-model-chooser")).toHaveCount(0);
  const changeModel = page.getByRole("button", { name: "Cambia", exact: true });
  await expect(changeModel).toBeEnabled();
  await changeModel.click();

  await expect(page.getByTestId(`mockup-model-${custodiaId}`)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId(`mockup-model-${girevoleId}`)).toHaveAttribute("aria-pressed", "true");
});