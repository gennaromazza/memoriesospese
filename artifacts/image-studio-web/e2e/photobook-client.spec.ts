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
          const configuration = event.data.configuration || configurations[rendererId] || configurations["${custodiaId}"];
          document.body.dataset.appliedModel = configuration.modelId;
          document.body.dataset.appliedBottomText = configuration.bottomText || "";
          send("change", { configuration });
          send("busy", { busy: false });
        });
        window.testChangeConfiguration = () => send("change", {
          configuration: { ...configurations["album-girevole"], bottomText: "Scelta mobile salvata" }
        });
        send("ready");
        send("busy", { busy: false });
      </script>
    </body></html>`;
}

async function mockPhotobookApi(
  page: Page,
  mockupResponse: (route: Route) => Promise<void>,
  photobookResponse?: (route: Route) => Promise<void>,
) {
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
      if (photobookResponse) {
        await photobookResponse(route);
        return;
      }
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

function confirmedMockupPayload() {
  return {
    version: 1,
    mockupPath: "studio",
    editable: false,
    enabled: true,
    approvalRequired: false,
    clientApprovalAllowed: true,
    saved: {
      revision: 7,
      status: "confirmed",
      updatedAt: "2026-10-01T10:00:00.000Z",
      updatedBy: "studio",
      selection: { labId: "studio", modelId: custodiaId },
      configuration: {
        modelId: custodiaId,
        assetRevision: 2,
        materialId,
        appearanceRevision: 4,
        coverLayout: "oblique",
        topText: "",
        bottomText: "",
        photoAssetId: null,
        crop,
      },
      option: custodiaOption,
    },
    offer: null,
    modelMode: "fixed",
    modelSelection: { labId: "studio", modelId: custodiaId },
    offerError: null,
  };
}

async function openConfirmedSharedMockup(page: Page) {
  const versionRequest = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === `/api/photobooks/by-token/${token}` && url.searchParams.get("version") === "1";
  });
  await page.goto(`/fotolibro/${token}/mockup?version=1`);
  await versionRequest;

  const dialog = page.getByRole("dialog", { name: "Custodia" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Questa versione è in sola lettura")).toBeVisible();
  const renderer = page.frameLocator('iframe[title^="Configuratore 3D"]');
  await expect(renderer.locator('body[data-wizard-readonly="true"]')).toBeVisible();
  await expect(renderer.getByRole("button", {
    name: /Personalizza|Modifica|Salva|Invia|Richiedi|Stampa|Cambia modello/i,
  })).toHaveCount(0);
  await expect(page.getByRole("button", {
    name: /Personalizza|Salva bozza|Invia allo studio per verifica|Richiedi modifiche|Stampa/i,
  })).toHaveCount(0);
  return dialog;
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

  await expect(card.getByTestId("mockup-not-enabled")).toContainText("La proposta non è ancora pronta");
  await expect(page.getByTestId("mockup-not-enabled")).toHaveCount(1);
  expect(getMockupRequests()).toBeGreaterThan(1);
});

test("un link a una revisione non disponibile mostra l’errore e riprova solo quella revisione", async ({ page }) => {
  const versionRequests: string[] = [];
  const fallbackVersionRequests: string[] = [];
  const mutationRequests: string[] = [];
  const emailRequests: string[] = [];

  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === `/api/photobooks/by-token/${token}`) {
      versionRequests.push(url.search);
      if (url.searchParams.get("version") !== "7") fallbackVersionRequests.push(url.search);
    }
    if (url.pathname.startsWith("/api/") && !["GET", "HEAD"].includes(request.method())) {
      mutationRequests.push(`${request.method()} ${url.pathname}`);
    }
    if (url.pathname.startsWith("/api/email/")) emailRequests.push(`${request.method()} ${url.pathname}`);
  });

  await mockPhotobookApi(
    page,
    route => fulfillMockup(route, confirmedMockupPayload()),
    async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("version") === "7") {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "Questa revisione non è disponibile" }),
        });
        return;
      }

      // A fallback to the current version would succeed, making the test catch
      // any behavior that silently opens a different version.
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
    },
  );

  await page.goto(`/fotolibro/${token}/mockup?version=7`);

  const unavailable = page.getByRole("alert");
  await expect(unavailable.getByRole("heading", { name: "Link mockup non disponibile" })).toBeVisible();
  await expect(unavailable).toContainText("questa revisione non è disponibile");
  const retry = unavailable.getByRole("button", { name: "Ricarica anteprima" });
  await expect(retry).toBeVisible();
  await expect(page.getByTestId("photobook-mockup")).toHaveCount(0);
  await expect(page.getByTestId("status-photobook-approval")).toHaveCount(0);
  await expect(page.getByText("Versione fotolibro v1")).toHaveCount(0);
  expect(fallbackVersionRequests).toEqual([]);

  const retryResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === "GET" &&
      url.pathname === `/api/photobooks/by-token/${token}` &&
      url.searchParams.get("version") === "7";
  });
  await retry.click();
  await retryResponse;

  await expect(unavailable).toBeVisible();
  await expect(page.getByTestId("photobook-mockup")).toHaveCount(0);
  await expect.poll(() => versionRequests).toEqual(["?version=7", "?version=7"]);
  expect(fallbackVersionRequests).toEqual([]);
  expect(mutationRequests).toEqual([]);
  expect(emailRequests).toEqual([]);
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

async function exerciseClientModelChoice(page: Page) {
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
  let saveRequests = 0;

  await mockPhotobookApi(page, async route => {
    if (route.request().method() === "PUT") {
      saveRequests += 1;
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
  const chooserBox = await chooser.boundingBox();
  expect(chooserBox).not.toBeNull();
  expect(chooserBox!.x).toBeGreaterThanOrEqual(0);
  expect(chooserBox!.x + chooserBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByTestId("choose-mockup-example-plaque").click();
  const continueButton = chooser.getByRole("button", { name: /Continua/ });
  await expect(continueButton).toHaveCount(1);
  page.once("dialog", dialog => dialog.accept());
  await continueButton.click();

  const rendererFrame = page.frameLocator('iframe[title="Configuratore 3D Album girevole"]');
  await expect(page.getByTestId("mockup-model-chooser")).toHaveCount(0);
  await expect(rendererFrame.locator('body[data-wizard="true"]')).toBeVisible();
  await expect(rendererFrame.locator(".wizard-primary")).toHaveCount(1);
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await rendererFrame.locator("body").evaluate(body => {
      (body.ownerDocument.defaultView as (Window & { testChangeConfiguration: () => void }) | null)?.testChangeConfiguration();
    });
    const saveResponse = page.waitForResponse(response =>
      response.request().method() === "PUT" &&
      response.url().includes(`/photobooks/by-token/${token}/mockup`),
    );
    const nextStep = rendererFrame.locator(".mq-nav .mq-primary");
    await expect(nextStep).toBeEnabled();
    await nextStep.click();
    await saveResponse;
    expect(saveRequests).toBe(1);
    expect(saveRequest?.configuration.bottomText).toBe("Scelta mobile salvata");
    expect(saveRequest?.selection).toEqual({ labId: "studio", modelId: girevoleId });
    await expect.poll(() => (payload.saved as { updatedBy: string } | undefined)?.updatedBy).toBe("client");

    await page.reload();
    const reopenedMockup = page.getByTestId("photobook-mockup");
    await expect(reopenedMockup).toBeVisible();
    await reopenedMockup.getByRole("button").click();
    const restoredFrame = page.frameLocator('iframe[title="Configuratore 3D Album girevole"]');
    await expect(restoredFrame.locator(".mq-title")).toHaveText("Ecco il tuo album");
    await expect(restoredFrame.locator("body")).toHaveAttribute("data-applied-model", "album-girevole");
    await expect(restoredFrame.locator("body")).toHaveAttribute("data-applied-bottom-text", "Scelta mobile salvata");
    const changeModel = restoredFrame.getByRole("button", { name: "Cambia modello", exact: true });
    await expect(changeModel).toBeEnabled();
    await changeModel.click();
    await expect(page.getByTestId(`mockup-model-${custodiaId}`)).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId(`mockup-model-${girevoleId}`)).toHaveAttribute("aria-pressed", "true");
    expect(saveRequests).toBe(1);
    return;
  }

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
  const changeModelLabel = (page.viewportSize()?.width ?? 0) < 768 ? "Cambia" : "Cambia modello";
  const changeModel = page.getByRole("button", { name: changeModelLabel, exact: true });
  await expect(changeModel).toHaveCount(1);
  await expect(changeModel).toBeEnabled();
  await changeModel.click();

  await expect(page.getByTestId(`mockup-model-${custodiaId}`)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId(`mockup-model-${girevoleId}`)).toHaveAttribute("aria-pressed", "true");
}

test("su telefono il cliente sceglie il modello e apre il configuratore", async ({ page }) => {
  await exerciseClientModelChoice(page);
});

test.describe("flusso mockup su desktop", () => {
  test.use({
    viewport: { width: 1280, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  });

  test("su desktop il cliente salva e recupera la scelta dopo una ricarica", async ({ page }) => {
    await exerciseClientModelChoice(page);
  });

  test("lo studio copia una sola volta il link del mockup confermato", async ({ page }) => {
    await exerciseStudioSharing(page);
  });

  test("il link condiviso apre la revisione confermata in sola lettura", async ({ page }) => {
    const mutationRequests: string[] = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname.startsWith("/api/") && !["GET", "HEAD"].includes(request.method())) {
        mutationRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
      }
    });

    await mockPhotobookApi(page, route => fulfillMockup(route, confirmedMockupPayload()));
    const dialog = await openConfirmedSharedMockup(page);
    await dialog.getByRole("button", { name: "Chiudi mockup" }).click();

    await expect(page.getByRole("heading", { name: /La vostra anteprima.*Fotolibro di prova/ })).toBeVisible();
    await expect(page.getByTestId("status-photobook-approval")).toContainText("versione 1");
    const mockup = page.getByTestId("photobook-mockup");
    await expect(mockup.locator(".mockup-status-card")).toContainText("confermato");
    await expect(mockup.locator(".mockup-status-card")).toContainText("revisione 7");
    expect(mutationRequests).toEqual([]);
  });
});

test("su telefono il link condiviso mostra la revisione confermata in sola lettura senza invii", async ({ page }) => {
  const viewportWidth = page.viewportSize()?.width;
  expect(viewportWidth).toBeDefined();
  expect(viewportWidth).toBeLessThan(768);

  const mutationRequests: string[] = [];
  const emailRequests: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") && !["GET", "HEAD"].includes(request.method())) {
      mutationRequests.push(`${request.method()} ${url.pathname}`);
    }
    if (url.pathname.startsWith("/api/email/")) emailRequests.push(`${request.method()} ${url.pathname}`);
  });

  await mockPhotobookApi(page, route => fulfillMockup(route, confirmedMockupPayload()));
  const dialog = await openConfirmedSharedMockup(page);
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewportWidth!);
  await expect(dialog).toHaveText(/versione fotolibro 1/i);
  await expect(dialog.locator("iframe[title^='Configuratore 3D']")).toBeVisible();
  await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.getByRole("button", {
    name: /Personalizza|Modifica|Salva|Invia|Richiedi|Stampa/i,
  })).toHaveCount(0);
  await page.frameLocator('iframe[title^="Configuratore 3D"]').getByRole("button", { name: "Chiudi mockup" }).click();
  await expect(page.getByTestId("photobook-mockup").locator(".mockup-status-card")).toContainText("confermato");
  await expect(page.getByTestId("photobook-mockup").locator(".mockup-status-card")).toContainText("revisione 7");

  expect(mutationRequests).toEqual([]);
  expect(emailRequests).toEqual([]);
});

async function exerciseStudioSharing(page: Page) {
  let apiRequests = 0;
  await page.route("**/api/**", async route => {
    apiRequests += 1;
    await route.abort();
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/admin/__e2e/photobook-mockup-sharing");
  const cookieDismiss = page.getByTestId("cookie-reject-btn");
  if (await cookieDismiss.isVisible().catch(() => false)) await cookieDismiss.click();

  const flow = page.getByTestId("mockup-admin-flow");
  await expect(flow).toBeVisible();
  await flow.getByRole("radio", { name: /Io preparo e confermo/ }).check();

  const shareButton = flow.getByTestId("button-copy-mockup-link");
  await expect(shareButton).toHaveCount(1);
  await expect(shareButton).toHaveAccessibleName(
    `Copia link mockup: ${localOrigin}/fotolibro/e2e-share-token/mockup?version=1`,
  );
  await expect(flow.getByText("Copia link mockup", { exact: true })).toHaveCount(1);
  await expect(flow.getByRole("button", { name: /Invia email|Invia allo studio/ })).toHaveCount(0);
  await expect(flow.getByText(/La stampa non parte automaticamente/)).toBeVisible();
  await expect.poll(() => flow.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  const buttonBox = await shareButton.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  await shareButton.click();
  await expect(shareButton).toContainText("Copiato");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${localOrigin}/fotolibro/e2e-share-token/mockup?version=1`,
  );
  expect(apiRequests).toBe(0);
}

test("lo studio copia una sola volta il link del mockup confermato su telefono", async ({ page }) => {
  await exerciseStudioSharing(page);
});
