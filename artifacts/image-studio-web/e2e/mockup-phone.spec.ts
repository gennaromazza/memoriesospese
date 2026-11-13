import { expect, test, type Page } from "@playwright/test";

// Telefono: stesso standard di scelta (a schermo pieno, 3D in miniatura) per Custodia, Album girevole e Plaza.
// Il visualizzatore 3D è quello vero; le API sono simulate.
const port = process.env.PHOTOBOOK_CLIENT_E2E_PORT ?? "4179";
const localOrigin = `http://127.0.0.1:${port}`;
const token = "e2e-quadrobook-token";
const materialId = "2224386b-262c-5756-96b9-9e458ab95a8f";
const ids = { base: "10000000-0000-4000-8000-000000000001", lid: "10000000-0000-4000-8000-000000000002", cover: "10000000-0000-4000-8000-000000000003", graphic: "10000000-0000-4000-8000-000000000009" };
const models = [
  { key: "custodia", rendererId: "15870135-cc65-5c61-8db0-ccccd8529a77", name: "Custodia" },
  { key: "girevole", rendererId: "album-girevole", name: "Album girevole" },
  { key: "plaza", rendererId: "plaza-led", name: "Plaza LED" },
];
const savedPhotoIds = {
  front: "10000000-0000-4000-8000-000000000101",
  back: "10000000-0000-4000-8000-000000000102",
  base: "10000000-0000-4000-8000-000000000103",
  lid: "10000000-0000-4000-8000-000000000104",
  cover: "10000000-0000-4000-8000-000000000105",
};
const crop = { zoom: 1, x: 0.5, y: 0.5 };
const directModels = [
  {
    key: "custodia",
    rendererId: models[0].rendererId,
    name: "Custodia",
    configuration: {
      modelId: models[0].rendererId, assetRevision: 2, materialId, appearanceRevision: 4,
      coverLayout: "full", topText: "", bottomText: "", photoAssetId: savedPhotoIds.front, crop,
    },
  },
  {
    key: "girevole",
    rendererId: models[1].rendererId,
    name: "Album girevole",
    configuration: {
      modelId: models[1].rendererId, assetRevision: 4, materialId, appearanceRevision: 4,
      coverLayout: "full", frameFinish: "fabric", topText: "", bottomText: "",
      photoAssetId: savedPhotoIds.front, crop, backCover: "photo", backPhotoAssetId: savedPhotoIds.back, backCrop: crop,
    },
  },
  {
    key: "plaza",
    rendererId: models[2].rendererId,
    name: "Plaza LED",
    configuration: {
      modelId: models[2].rendererId, assetRevision: 2, materialId, appearanceRevision: 4,
      coverLayout: "full", frameFinish: "fabric", topText: "", bottomText: "",
      photoAssetId: savedPhotoIds.front, crop, backCover: "photo", backPhotoAssetId: savedPhotoIds.back, backCrop: crop, ledEnabled: false,
    },
  },
  {
    key: "quadrobook",
    rendererId: "scatola-cornice",
    name: "Quadrobook",
    setup: { format: { w: 30, h: 20 }, cover: { mode: "choice", graphicAssetId: ids.graphic } },
    configuration: {
      modelId: "scatola-cornice", assetRevision: 1, materialId, appearanceRevision: 4,
      albumMaterialId: materialId, albumAppearanceRevision: 4, coverLayout: "photo", format: { w: 30, h: 20 },
      photoAssetId: savedPhotoIds.base, lidPhotoAssetId: savedPhotoIds.lid, coverPhotoAssetId: savedPhotoIds.cover,
    },
  },
  {
    key: "imagebox",
    rendererId: "imagebox",
    name: "ImageBox",
    setup: { format: { w: 40, h: 30 } },
    configuration: {
      modelId: "imagebox", assetRevision: 1, materialId, appearanceRevision: 4,
      albumMaterialId: materialId, albumAppearanceRevision: 4, coverLayout: "full", format: { w: 40, h: 30 },
      photoAssetId: savedPhotoIds.base, coverPhotoAssetId: savedPhotoIds.cover, coverEngraving: null, glassEngraving: null,
    },
  },
];

async function jpeg(page: Page, color: string) {
  const data = await page.evaluate(async c => {
    const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 400;
    const x = canvas.getContext("2d")!; x.fillStyle = c; x.fillRect(0, 0, 600, 400);
    const blob: Blob = await new Promise(r => canvas.toBlob(b => r(b!), "image/jpeg", 0.9));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, color);
  return Buffer.from(data);
}

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
for (const model of models) {
  test(`telefono standard: ${model.name}`, async ({ page }) => {
    test.setTimeout(300_000);
    const option = {
      id: `30000000-0000-4000-8000-00000000000${models.indexOf(model) + 1}`, name: model.name, supplierCode: "M-01", rendererId: model.rendererId, active: true,
      materialIds: [materialId], materials: [{ id: materialId, label: "Tessuto di prova", supplierCode: "M-01" }], labId: "studio", labName: "Studio",
    };
    await page.goto("/");
    const photo = await jpeg(page, "#36c");
    const thumbColors = ["#c9a27e", "#7d9a8c", "#d8c8b0", "#4f6f86", "#b5876b", "#e3d6c4"];
    const thumbs = await Promise.all(thumbColors.map(c => jpeg(page, c)));
    let saved: Record<string, unknown> | null = null; let saves = 0; let submitted = false;
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== localOrigin) { await route.abort(); return; }
      const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      const base = `/api/photobooks/by-token/${token}`;
      if (url.pathname === `${base}/gallery-photos`) return json({
        photos: thumbColors.map((_, i) => ({ id: `g${i}`, name: `foto-${i + 1}.jpg`, url: `${localOrigin}/thumb-${i}.jpg`, thumbnailUrl: `${localOrigin}/thumb-${i}.jpg`, chapterId: i < 3 ? "c1" : "c2" })),
        chapters: [{ id: "c1", titolo: "Preparativi", ordine: 1 }, { id: "c2", titolo: "Cerimonia", ordine: 2 }],
      });
      if (/^\/thumb-\d+\.jpg$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: "image/jpeg", body: thumbs[Number(url.pathname.match(/\d+/)![0])] });
      if (url.pathname === `${base}/mockup/gallery-photo`) return json({ id: ids.cover, name: "foto.jpg", source: "gallery", photoId: "g1", width: 600, height: 400 });
      if (url.pathname.startsWith(`${base}/mockup/photos/`)) return route.fulfill({ status: 200, contentType: "image/jpeg", body: photo });
      if (url.pathname === `${base}/mockup/submit`) { submitted = true; saved = { ...saved, status: "submitted" }; return json(saved); }
      if (url.pathname === `${base}/mockup` && request.method() === "PUT") {
        saves++; const body = request.postDataJSON();
        saved = { revision: body.revision + 1, version: 1, status: "draft", updatedAt: "2026-10-14T10:00:00.000Z", updatedBy: "client", selection: body.selection, configuration: body.configuration, option };
        return json(saved);
      }
      if (url.pathname === `${base}/mockup`) return json({ version: 1, mockupPath: "client", editable: true, enabled: true, approvalRequired: false, saved, offer: { revision: 1, mode: "fixed", options: [option] }, modelMode: "fixed", modelSelection: { labId: "studio", modelId: option.id }, offerError: null });
      if (url.pathname === base) return json({ photobook: { id: "e2e-mp", name: "Fotolibro", galleryId: "g", token, currentVersion: 1, versions: [{ version: 1, pageCount: 0 }], approval: { version: 1 }, mockupPath: "client" }, version: 1, pages: [], requests: [] });
      if (request.method() === "GET" || request.method() === "HEAD") return route.continue();
      return route.abort();
    });
    await page.goto(`/fotolibro/${token}`);
    await expect(page.getByTestId("photobook-client-progress")).toBeVisible();
    await page.getByRole("button", { name: "Solo Necessari" }).click({ timeout: 5_000 }).catch(() => undefined);
    await page.getByRole("button", { name: /Personalizza il tuo album|Apri il tuo album|Personalizza album/ }).first().click();
    const viewer = page.frameLocator("iframe").first();
    const title = viewer.locator(".mq-title");
    await expect(title).toBeVisible({ timeout: 90_000 });
    // Schermo pieno per le scelte: niente intestazione dell'host, 3D in miniatura, un solo pulsante principale.
    await expect(page.locator(".mockup-header")).toBeHidden();
    await expect(viewer.locator(".mq-pip-open")).toBeVisible();
    const primary = viewer.locator(".mq-nav .mq-primary");
    const shot = async (n: string) => { await page.waitForTimeout(1200); await page.screenshot({ path: `/tmp/mp-${model.key}-${n}.png` }); };
    // 3D grande solo su richiesta.
    await viewer.locator(".mq-pip-open").click();
    await expect(viewer.locator(".mq-pip-close")).toBeVisible();
    await shot("3d");
    await viewer.locator(".mq-pip-close").click();
    await expect(viewer.locator(".mq-pip-open")).toBeVisible();
    for (let guard = 0; guard < 12; guard++) {
      const name = (await title.textContent())?.trim() || "";
      await shot(String(guard + 1));
      if (name === "Ecco il tuo album") break;
      if (name === "Il tessuto") { await viewer.locator(".wizard-family-card:visible").first().click(); continue; }
      if (name === "Il colore") await viewer.locator(".materials button:visible").first().click();
      if (name === "Disposizione copertina") await viewer.locator(".wizard-cards button", { hasText: /foto/i }).first().click();
      if (name === "Personalizzazione copertina") { await viewer.locator(".mq-thumbs button").first().click(); await expect(viewer.locator(".mq-status")).toContainText("Foto scelta", { timeout: 30_000 }); }
      await expect(primary).toBeEnabled({ timeout: 30_000 });
      await expect.poll(() => primary.evaluate(e => getComputedStyle(e).backgroundColor), { message: `Il pulsante principale deve essere verde pieno (${name})` }).toMatch(/rgb\((51, 94, 86|39, 75, 69)\)/);
      await primary.click();
      await expect(title).not.toHaveText(name, { timeout: 30_000 });
    }
    await expect(title).toHaveText("Ecco il tuo album");
    await expect(page.locator(".mockup-header")).toBeHidden();
    await expect.poll(() => saves, { timeout: 30_000 }).toBeGreaterThan(0);
    await viewer.locator(".mq-nav .mq-primary", { hasText: "Invia allo studio" }).click();
    await expect.poll(() => submitted, { timeout: 30_000 }).toBe(true);
  });
}

async function exercisePlazaBackPhotoSaveRestore(
  page: Page,
  rendererId: "plaza-led" | "album-girevole" = "plaza-led",
) {
  test.setTimeout(300_000);
  await page.goto("about:blank");
  const isPlazaLed = rendererId === "plaza-led";
  const rendererPath = isPlazaLed ? "plaza-v2" : "girevole-v4";
  const rendererName = isPlazaLed ? "Plaza LED" : "Plaza senza LED";
  const testToken = isPlazaLed ? "e2e-plaza-back-photo" : "e2e-plaza-no-led-back-photo";
  const photo = await jpeg(page, "#e23b36");
  const thumbnail = await jpeg(page, "#e23b36");
  const option = {
    id: "50000000-0000-4000-8000-000000000001",
    name: rendererName,
    supplierCode: "P-01",
    rendererId,
    active: true,
    materialIds: [materialId],
    materials: [{ id: materialId, label: "Tessuto di prova", supplierCode: "P-01" }],
    labId: "studio",
    labName: "Studio",
  };
  const backAssetId = "50000000-0000-4000-8000-000000000002";
  const base = `/api/photobooks/by-token/${testToken}`;
  let saved: Record<string, unknown> | null = null;
  let saveCount = 0;
  let selectedPhotoId = "";

  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== localOrigin) { await route.abort(); return; }
    if (url.pathname.startsWith(`/mockups/${rendererPath}/`) && isPlazaLed && !url.searchParams.has("plaza-test-renderer")) {
      url.searchParams.set("plaza-test-renderer", "");
      return route.continue({ url: url.href });
    }
    const json = (body: unknown) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    if (url.pathname === `${base}/gallery-photos`) return json({
      photos: [{
        id: "plaza-back-gallery-photo",
        name: "retro-plaza-e2e.jpg",
        url: `${localOrigin}/plaza-back-photo-thumb.jpg`,
        thumbnailUrl: `${localOrigin}/plaza-back-photo-thumb.jpg`,
        chapterId: "chapter-1",
      }],
      chapters: [{ id: "chapter-1", titolo: "Retro scrigno" }],
    });
    if (url.pathname === "/plaza-back-photo-thumb.jpg") {
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: thumbnail });
    }
    if (url.pathname === `${base}/mockup/gallery-photo`) {
      selectedPhotoId = request.postDataJSON()?.photoId || "";
      return json({
        id: backAssetId,
        name: "retro-plaza-e2e.jpg",
        source: "gallery",
        photoId: selectedPhotoId,
        width: 600,
        height: 400,
      });
    }
    if (url.pathname === `${base}/mockup/photos/${backAssetId}`) {
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: photo });
    }
    if (url.pathname === `${base}/mockup` && request.method() === "PUT") {
      const body = request.postDataJSON();
      saved = {
        revision: Number(body.revision) + 1,
        version: 1,
        status: "draft",
        updatedAt: "2026-10-28T10:00:00.000Z",
        updatedBy: "client",
        selection: body.selection,
        configuration: body.configuration,
        option,
      };
      saveCount += 1;
      return json(saved);
    }
    if (url.pathname === `${base}/mockup`) {
      return json({
        version: 1,
        mockupPath: "client",
        editable: true,
        enabled: true,
        approvalRequired: false,
        saved,
        offer: { revision: 1, mode: "fixed", options: [option] },
        modelMode: "fixed",
        modelSelection: { labId: "studio", modelId: option.id },
        offerError: null,
      });
    }
    if (url.pathname === base) return json({
      photobook: {
        id: `e2e-${rendererId}-back-book`,
        name: `Fotolibro ${rendererName}`,
        galleryId: "e2e-gallery",
        token: testToken,
        currentVersion: 1,
        versions: [{ version: 1, pageCount: 0 }],
        approval: { version: 1 },
        mockupPath: "client",
      },
      version: 1,
      pages: [],
      requests: [],
    });
    if (request.method() === "GET" || request.method() === "HEAD") return route.continue();
    return route.abort();
  });

  await page.addInitScript(() => {
    window.addEventListener("message", event => {
      const payload = event.data as {
        channel?: string;
        type?: string;
        configuration?: unknown;
      } | null;
      if (payload?.channel === "memorie-mockup-v1" && payload.type === "change" && payload.configuration) {
        (window as typeof window & { __plazaTestConfiguration?: unknown }).__plazaTestConfiguration = payload.configuration;
      }
    });
  });
  await page.goto(`/fotolibro/${testToken}`);
  await page.getByRole("button", { name: "Solo Necessari" }).click({ timeout: 5_000 }).catch(() => undefined);
  const card = page.getByTestId("photobook-mockup");
  await expect(card).toBeVisible();
  await card.getByRole("button").click();
  const isMobile = page.viewportSize()!.width < 768;
  const waitForViewer = (restored = false) => page.waitForFunction((shouldBeRestored) => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[src*="/mockups/"]');
    const body = frame?.contentDocument?.body;
    return body?.dataset.ready === "true"
      && (shouldBeRestored || body.dataset.wizard === "true");
  }, restored, { timeout: 90_000 });
  await waitForViewer();

  let saveResponse: Promise<unknown>;
  if (isMobile) {
    saveResponse = page.waitForResponse(response => {
      const body = response.request().postDataJSON() as { configuration?: { backPhotoAssetId?: string } } | null;
      return response.request().method() === "PUT"
        && response.url().includes(`${base}/mockup`)
        && body?.configuration?.backPhotoAssetId === backAssetId;
    });
  } else {
    saveResponse = page.waitForResponse(response =>
      response.request().method() === "PUT" && response.url().includes(`${base}/mockup`),
    );
  }

  await page.evaluate(async ({ isMobile }) => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[src*="/mockups/"]');
    const doc = frame?.contentDocument;
    const body = doc?.body;
    if (!doc || !body) throw new Error("Il viewer Plaza non è disponibile");
    const waitFor = async (check: () => boolean, message: string) => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (check()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`${message}: ${JSON.stringify(body.dataset)}`);
    };
    const waitForStep = (step: string) => waitFor(
      () => body.dataset.wizardStep === step,
      `Il wizard non è arrivato allo step ${step}`,
    );
    const next = doc.querySelector<HTMLButtonElement>(".wizard-nav .wizard-primary");
    if (!next) throw new Error("Pulsante Avanti del wizard non trovato");

    if (body.dataset.wizardStep === "2") {
      const family = doc.querySelector<HTMLButtonElement>(".wizard-family-card:not([hidden])");
      if (!family) throw new Error("Famiglia di tessuti non disponibile");
      family.click();
      await waitForStep("3");
    }
    if (body.dataset.wizardStep === "3") {
      const selectedMaterial = doc.querySelector<HTMLButtonElement>(".materials button[aria-pressed='true']");
      if (!selectedMaterial) {
        const material = doc.querySelector<HTMLButtonElement>(".materials button");
        if (!material) throw new Error("Nessun tessuto selezionabile");
        material.click();
      }
    }
    for (const step of ["3", "4"]) {
      await waitFor(() => !next.disabled, `Avanti non è disponibile allo step ${step}`);
      next.click();
      await waitForStep(String(Number(step) + 1));
    }

    const cover = Array.from(doc.querySelectorAll<HTMLButtonElement>(".wizard-cards[data-wizard-cover-layout] button"))
      .find(button => button.textContent?.includes("Placchetta con incisione"));
    if (!cover) throw new Error("Layout copertina non disponibile");
    cover.click();
    await waitFor(() => !next.disabled, "Layout copertina non selezionato");
    next.click();
    await waitForStep("6");
    await waitFor(() => !next.disabled, "Avanti non è disponibile allo step 6");
    next.click();
    await waitForStep("7");
  }, { isMobile });

  const frameLocator = page.frameLocator('iframe[src*="/mockups/"]');
  const rearPhotoChoice = frameLocator.getByRole("button", {
    name: isPlazaLed ? "Foto a tutta superficie sul telaio" : "Foto a tutta superficie su plexiglass",
  });
  await rearPhotoChoice.click();
  await expect(rearPhotoChoice).toHaveAttribute("aria-pressed", "true");
  await page.waitForFunction(() => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[src*="/mockups/"]');
    return frame?.contentDocument?.body.dataset.backCover === "photo";
  }, undefined, { timeout: 20_000 });
  if (isMobile) {
    const galleryPhoto = frameLocator.getByRole("button", { name: "retro-plaza-e2e.jpg" });
    await expect(galleryPhoto).toBeVisible();
    await galleryPhoto.click();
    await page.waitForFunction((assetId) => {
      const frame = document.querySelector<HTMLIFrameElement>('iframe[src*="/mockups/"]');
      const body = frame?.contentDocument?.body;
      return body?.dataset.backPhotoId === assetId
        && body.dataset.backPhotoLoaded === "true"
        && body.dataset.view === "back";
    }, backAssetId, { timeout: 60_000 });
  }

  const browserState = await page.evaluate(async ({ isMobile, backAssetId }) => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[src*="/mockups/"]');
    const doc = frame?.contentDocument;
    const body = doc?.body;
    if (!doc || !body) throw new Error("Il viewer Plaza non è disponibile");
    const waitFor = async (check: () => boolean, message: string) => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (check()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`${message}: ${JSON.stringify(body.dataset)}`);
    };

    if (!isMobile) {
      await waitFor(
        () => Array.from(doc.querySelectorAll<HTMLButtonElement>("button"))
          .some(button => button.textContent?.includes("Scegli foto per il retro")),
        "Pulsante galleria per il retro non trovato",
      );
      const pickerButton = Array.from(doc.querySelectorAll<HTMLButtonElement>("button"))
        .find(button => button.textContent?.includes("Scegli foto per il retro"));
      if (!pickerButton) throw new Error("Pulsante galleria per il retro non trovato");
      pickerButton.click();
      await waitFor(() => !!document.querySelector('button[aria-label="Seleziona foto retro-plaza-e2e.jpg"]'),
        "Foto della galleria non disponibile");
      document.querySelector<HTMLButtonElement>('button[aria-label="Seleziona foto retro-plaza-e2e.jpg"]')?.click();
    }
    await waitFor(
      () => body.dataset.backPhotoId === backAssetId
        && body.dataset.backPhotoLoaded === "true"
        && body.dataset.view === "back",
      "Foto posteriore o vista retro non applicata",
    );
    const setRange = (id: string, value: string) => {
      const input = doc.getElementById(id) as HTMLInputElement | null;
      if (!input) throw new Error(`Controllo ${id} non trovato`);
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setRange("backZoom", "1.65");
    setRange("backX", "31");
    setRange("backY", "68");
    return {
      photoId: body.dataset.backPhotoId,
      photoLoaded: body.dataset.backPhotoLoaded,
      view: body.dataset.view,
      backCover: body.dataset.backCover,
    };
  }, { isMobile, backAssetId });
  expect(browserState).toMatchObject({
    photoId: backAssetId,
    photoLoaded: "true",
    view: "back",
    backCover: "photo",
  });

  await page.waitForFunction((assetId) => {
    const config = (window as typeof window & {
      __plazaTestConfiguration?: {
        backPhotoAssetId?: string;
        backCrop?: { zoom?: number; x?: number; y?: number };
      };
    }).__plazaTestConfiguration;
    return config?.backPhotoAssetId === assetId
      && config.backCrop?.zoom === 1.65
      && config.backCrop?.x === 0.31
      && config.backCrop?.y === 0.68;
  }, backAssetId, { timeout: 20_000 });
  await page.waitForTimeout(100);
  if (isMobile) {
    await frameLocator.getByRole("button", { name: "Avanti" }).click();
  } else {
    await frameLocator.getByRole("button", { name: /Salva bozza/ }).click();
  }

  await saveResponse;
  await expect.poll(() => saveCount).toBeGreaterThan(0);
  expect(saved?.configuration).toMatchObject({
    modelId: rendererId,
    materialId,
    coverLayout: "plaque",
    backCover: "photo",
    backPhotoAssetId: backAssetId,
    backCrop: { zoom: 1.65, x: 0.31, y: 0.68 },
  });
  if (isPlazaLed) expect(saved?.configuration).toMatchObject({ ledEnabled: true });

  await page.reload();
  await page.getByRole("button", { name: "Solo Necessari" }).click({ timeout: 5_000 }).catch(() => undefined);
  const reopened = page.getByTestId("photobook-mockup");
  await expect(reopened).toBeVisible();
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-testid="photobook-mockup"] button')?.click());
  await waitForViewer(true);
  await page.waitForFunction((assetId) => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[src*="/mockups/"]');
    const doc = frame?.contentDocument;
    const body = doc?.body;
    return body?.dataset.backPhotoId === assetId
      && body.dataset.backPhotoLoaded === "true"
      && body.dataset.backCover === "photo"
      && (doc?.getElementById("backZoom") as HTMLInputElement | null)?.value === "1.65"
      && (doc?.getElementById("backX") as HTMLInputElement | null)?.value === "31"
      && (doc?.getElementById("backY") as HTMLInputElement | null)?.value === "68"
      && (doc?.getElementById("coverLayout") as HTMLSelectElement | null)?.value === "plaque";
  }, backAssetId, { timeout: 90_000 });
  const restoredState = await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[src*="/mockups/"]');
    const doc = frame?.contentDocument;
    const body = doc?.body;
    if (!doc || !body) throw new Error("Il viewer Plaza ripristinato non è disponibile");
    return {
      photoId: body.dataset.backPhotoId,
      photoLoaded: body.dataset.backPhotoLoaded,
      backCover: body.dataset.backCover,
      photoName: doc.getElementById("backPhotoStatus")?.textContent,
      zoom: (doc.getElementById("backZoom") as HTMLInputElement | null)?.value,
      x: (doc.getElementById("backX") as HTMLInputElement | null)?.value,
      y: (doc.getElementById("backY") as HTMLInputElement | null)?.value,
      coverLayout: (doc.getElementById("coverLayout") as HTMLSelectElement | null)?.value,
      led: body.dataset.led,
      view: body.dataset.view,
    };
  });
  expect(restoredState).toMatchObject({
    photoId: backAssetId,
    photoLoaded: "true",
    backCover: "photo",
    zoom: "1.65",
    x: "31",
    y: "68",
    coverLayout: "plaque",
    view: "front",
  });
  expect(restoredState.photoName).toContain("retro");
  expect(saved?.configuration).toMatchObject({
    modelId: rendererId,
    materialId,
    coverLayout: "plaque",
    backCover: "photo",
    backPhotoAssetId: backAssetId,
    backCrop: { zoom: 1.65, x: 0.31, y: 0.68 },
  });
  if (isPlazaLed) expect(restoredState.led).toBe("true");
}

test.describe("salvataggio foto retro Plaza LED", () => {
  test.describe("desktop", () => {
    test.use({
      viewport: { width: 1280, height: 900 },
      screen: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      isMobile: false,
      hasTouch: false,
    });
    test("sceglie dalla galleria, ruota, salva e ripristina foto e ritaglio", async ({ page }) => {
      await exercisePlazaBackPhotoSaveRestore(page);
    });
  });
  test.describe("smartphone", () => {
    test.use({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
    test("sceglie dalla galleria, ruota, salva e ripristina foto e ritaglio", async ({ page }) => {
      await exercisePlazaBackPhotoSaveRestore(page);
    });
  });
});

test.describe("salvataggio foto retro Plaza senza LED", () => {
  test.describe("desktop", () => {
    test.use({
      viewport: { width: 1280, height: 900 },
      screen: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      isMobile: false,
      hasTouch: false,
    });
    test("sceglie dalla galleria, mostra il retro, salva e ripristina la foto", async ({ page }) => {
      await exercisePlazaBackPhotoSaveRestore(page, "album-girevole");
    });
  });
  test.describe("smartphone", () => {
    test.use({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
    test("sceglie dalla galleria, mostra il retro, salva e ripristina la foto", async ({ page }) => {
      await exercisePlazaBackPhotoSaveRestore(page, "album-girevole");
    });
  });
});

for (const model of directModels) {
  test(`link cliente su telefono: 3D iniziale in sola lettura per ${model.name}`, async ({ page }) => {
    test.setTimeout(300_000);
    // Keep the fixture off the app shell so unrelated Firebase-backed home data
    // cannot slow down or destabilize this isolated client-link check.
    await page.goto("about:blank");
    const photo = await jpeg(page, "#36c");
    const option = {
      id: `40000000-0000-4000-8000-00000000000${directModels.indexOf(model) + 1}`,
      name: model.name,
      supplierCode: "M-01",
      rendererId: model.rendererId,
      active: true,
      materialIds: [materialId],
      materials: [{ id: materialId, label: "Tessuto di prova", supplierCode: "M-01" }],
      labId: "studio",
      labName: "Studio",
      ...(model.setup ? { setup: model.setup } : {}),
    };
    const saved = {
      revision: 7,
      version: 1,
      status: "confirmed",
      updatedAt: "2026-10-27T10:00:00.000Z",
      updatedBy: "studio",
      selection: { labId: "studio", modelId: option.id },
      configuration: model.configuration,
      option,
    };
    await page.addInitScript(() => {
      window.addEventListener("message", event => {
        const message = event.data as { channel?: string; type?: string; configuration?: unknown } | null;
        if (message?.channel === "memorie-mockup-v1" && message.type === "change" && message.configuration) {
          (window as Window & { __plazaReadonlyConfiguration?: unknown }).__plazaReadonlyConfiguration = message.configuration;
        }
      });
    });
    let writes = 0;
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== localOrigin) { await route.abort(); return; }
      const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      const base = `/api/photobooks/by-token/${token}`;
      if (url.pathname === `${base}/gallery-photos`) return json({ photos: [], chapters: [] });
      if (url.pathname.startsWith(`${base}/mockup/photos/`)) return route.fulfill({ status: 200, contentType: "image/jpeg", body: photo });
      if (url.pathname === `${base}/mockup/cover-graphic`) return route.fulfill({ status: 200, contentType: "image/jpeg", body: photo });
      if (url.pathname === `${base}/mockup` && request.method() === "GET") {
        return json({
          version: 1, mockupPath: "studio", editable: false, enabled: true, approvalRequired: false,
          clientApprovalAllowed: true,
          saved, offer: { revision: 3, mode: "fixed", options: [option] }, modelMode: "fixed",
          modelSelection: { labId: "studio", modelId: option.id }, offerError: null,
        });
      }
      if (url.pathname === base && request.method() === "GET") {
        return json({
          photobook: {
            id: `direct-${model.key}`, name: `Fotolibro ${model.name}`, galleryId: "g", token,
            currentVersion: 1, versions: [{ version: 1, pageCount: 0 }],
            approval: { version: 1 }, mockupPath: "studio",
          },
          version: 1, pages: [], requests: [],
        });
      }
      if (url.pathname.startsWith(base) && !["GET", "HEAD"].includes(request.method())) writes++;
      if (request.method() === "GET" || request.method() === "HEAD") return route.continue();
      return route.abort();
    });

    // This is the shareable, read-only link, not the editable photobook flow.
    await page.goto(`/fotolibro/${token}/mockup`);
    const boxModel = model.key === "quadrobook" || model.key === "imagebox";
    const landscapeViewport = { width: 844, height: 390 };
    const portraitViewport = { width: 390, height: 780 };
    // Poll the same-origin viewer DOM in one browser-side check. Repeated
    // cross-frame assertions are unreliable while the WebGL renderer is busy.
    await page.waitForFunction(() => {
      const frame = Array.from(document.querySelectorAll("iframe"))
        .find(candidate => candidate.src.includes("/mockups/")) as HTMLIFrameElement | undefined;
      const body = frame?.contentDocument?.body;
      return body?.dataset.ready === "true"
        && body.classList.contains("mq-phone")
        && body.classList.contains("mq-3d");
    }, null, { timeout: 240_000 });
    if (model.key === "plaza") {
      await page.waitForFunction(({ frontId, backId, materialId }) => {
        const configuration = (window as Window & {
          __plazaReadonlyConfiguration?: {
            modelId?: string;
            materialId?: string;
            coverLayout?: string;
            photoAssetId?: string | null;
            backPhotoAssetId?: string | null;
            ledEnabled?: boolean;
          };
        }).__plazaReadonlyConfiguration;
        const frame = Array.from(document.querySelectorAll("iframe"))
          .find(candidate => candidate.src.includes("/mockups/")) as HTMLIFrameElement | undefined;
        const body = frame?.contentDocument?.body;
        return configuration?.modelId === "plaza-led"
          && configuration.materialId === materialId
          && configuration.coverLayout === "full"
          && configuration.photoAssetId === frontId
          && configuration.backPhotoAssetId === backId
          && configuration.ledEnabled === false
          && body?.dataset.coverLayout === "full"
          && body.dataset.led === "false"
          && body.dataset.backPhotoId === backId
          && body.dataset.backPhotoLoaded === "true";
      }, { frontId: savedPhotoIds.front, backId: savedPhotoIds.back, materialId });
    }
    const inspectViewer = async () => page.evaluate((isBox) => {
      const frame = Array.from(document.querySelectorAll("iframe"))
        .find(candidate => candidate.src.includes("/mockups/")) as HTMLIFrameElement | undefined;
      const doc = frame?.contentDocument;
      const body = doc?.body;
      const canvas = doc?.querySelector<HTMLCanvasElement>("#viewport");
      const stage = doc?.querySelector<HTMLElement>(".mq-stage, .stage");
      const canvasRect = canvas?.getBoundingClientRect();
      const stageRect = stage?.getBoundingClientRect();
      const choicesSelector = isBox
        ? ".panel-content [data-step]:not([hidden]) button, .panel-content [data-step]:not([hidden]) input:not([type=file]), .panel-content [data-step]:not([hidden]) select, .panel-content [data-step]:not([hidden]) textarea"
        : "#materials button, #detailPanel input, #detailPanel select";
      const enabledChoices = Array.from(doc?.querySelectorAll<HTMLElement>(choicesSelector) ?? []).filter(control => {
        const style = doc?.defaultView?.getComputedStyle(control);
        return !control.matches(":disabled") && !!style && style.display !== "none"
          && style.visibility !== "hidden" && control.getClientRects().length > 0;
      }).length;
      const viewControl = doc?.querySelector<HTMLButtonElement>(isBox
        ? '.view-tools button[data-mode="uses"], .view-tools button[data-mode="open"]'
        : '.wizard-iconbar button[aria-label="Ingrandisci album"]');
      const controlRect = viewControl?.getBoundingClientRect();
      const controlStyle = viewControl ? doc?.defaultView?.getComputedStyle(viewControl) : null;
      const controlHit = controlRect && doc?.elementFromPoint(
        controlRect.left + controlRect.width / 2,
        controlRect.top + controlRect.height / 2,
      );
      const pipClose = doc?.querySelector<HTMLButtonElement>("#pipClose");
      const pipCloseStyle = pipClose ? doc?.defaultView?.getComputedStyle(pipClose) : null;
      const title = doc?.querySelector(".mq-title, #stepTitle")?.textContent?.trim() || "";
      const viewportWidth = doc?.defaultView?.innerWidth ?? 0;
      const viewportHeight = doc?.defaultView?.innerHeight ?? 0;
      const iframeRect = frame?.getBoundingClientRect();
      const initial = {
        title,
        framePath: frame?.contentWindow?.location.pathname ?? "",
        iframeBox: iframeRect ? { width: iframeRect.width, height: iframeRect.height, top: iframeRect.top, bottom: iframeRect.bottom } : null,
        bodyClasses: body ? Array.from(body.classList) : [],
        ready: body?.dataset.ready === "true",
        wizardReadonly: body?.dataset.wizardReadonly === "true",
        locked: body?.classList.contains("locked") ?? false,
        enabledChoices,
        canvasVisible: !!canvas && !!canvasRect && canvasRect.width > 0 && canvasRect.height > 0,
        stageVisible: !!stage && !!stageRect && stageRect.width > 0 && stageRect.height > 0,
        stageFillsViewer: !!stageRect && Math.abs(stageRect.width - viewportWidth) <= 2
          && Math.abs(stageRect.height - viewportHeight) <= 2,
        stageWithinViewport: !!stageRect && stageRect.left >= -1 && stageRect.top >= -1
          && stageRect.right <= viewportWidth + 1 && stageRect.bottom <= viewportHeight + 1,
        stageWithinPhoneViewport: !!stageRect && !!iframeRect
          && iframeRect.left + stageRect.left >= -1 && iframeRect.top + stageRect.top >= -1
          && iframeRect.left + stageRect.right <= window.innerWidth + 1
          && iframeRect.top + stageRect.bottom <= window.innerHeight + 1,
        canvasWithinStage: !!canvasRect && !!stageRect && canvasRect.left >= stageRect.left - 1
          && canvasRect.top >= stageRect.top - 1 && canvasRect.right <= stageRect.right + 1
          && canvasRect.bottom <= stageRect.bottom + 1,
        viewControlVisible: !!viewControl && !!controlRect && !!controlStyle
          && controlRect.width > 0 && controlRect.height > 0
          && controlStyle.display !== "none" && controlStyle.visibility !== "hidden",
        controlWithinViewport: !!controlRect && controlRect.left >= -1 && controlRect.top >= -1
          && controlRect.right <= viewportWidth + 1 && controlRect.bottom <= viewportHeight + 1,
        controlWithinPhoneViewport: !!controlRect && !!iframeRect
          && iframeRect.left + controlRect.left >= -1 && iframeRect.top + controlRect.top >= -1
          && iframeRect.left + controlRect.right <= window.innerWidth + 1
          && iframeRect.top + controlRect.bottom <= window.innerHeight + 1,
        controlReceivesPointer: !!viewControl && !!controlHit
          && (controlHit === viewControl || viewControl.contains(controlHit)),
        controlHitTarget: controlHit
          ? `${controlHit.tagName.toLowerCase()}#${(controlHit as HTMLElement).id}.${(controlHit as HTMLElement).className}`
          : null,
        pipCloseVisible: !!pipClose && !!pipCloseStyle && pipCloseStyle.display !== "none" && pipCloseStyle.visibility !== "hidden",
        viewControlEnabled: !!viewControl && !viewControl.disabled,
      };
      viewControl?.click();
      return {
        ...initial,
        viewControlPressedAfterClick: viewControl?.getAttribute("aria-pressed") === "true",
        phoneWidth: viewportWidth,
        phoneHeight: viewportHeight,
        backPhotoId: body?.dataset.backPhotoId ?? null,
        backPhotoLoaded: body?.dataset.backPhotoLoaded ?? null,
        coverLayout: body?.dataset.coverLayout ?? null,
        led: body?.dataset.led ?? null,
        summary: doc?.getElementById("configurationSummary")?.textContent ?? "",
        configuration: (window as Window & { __plazaReadonlyConfiguration?: unknown }).__plazaReadonlyConfiguration ?? null,
      };
    }, boxModel);

    const viewerState = await inspectViewer();
    expect(viewerState.title).toBeTruthy();
    expect(viewerState.framePath).toContain("/mockups/");
    expect(viewerState.bodyClasses).toContain("mq-phone");
    expect(viewerState.bodyClasses).toContain("mq-3d");
    expect(viewerState.ready).toBe(true);
    expect(viewerState.canvasVisible).toBe(true);
    expect(viewerState.stageVisible).toBe(true);
    expect(viewerState.stageWithinViewport).toBe(true);
    expect(viewerState.canvasWithinStage).toBe(true);
    expect(viewerState.enabledChoices).toBe(0);
    expect(viewerState.viewControlVisible).toBe(true);
    expect(viewerState.controlWithinViewport).toBe(true);
    expect(viewerState.stageWithinPhoneViewport).toBe(true);
    expect(viewerState.controlWithinPhoneViewport).toBe(true);
    expect(viewerState.controlReceivesPointer).toBe(true);
    expect(viewerState.viewControlEnabled).toBe(true);
    if (model.key === "plaza") {
      expect(viewerState).toMatchObject({
        led: "false",
        backPhotoId: savedPhotoIds.back,
        backPhotoLoaded: "true",
        coverLayout: "full",
        summary: expect.stringContaining("LED: Spento"),
        configuration: {
          materialId,
          coverLayout: "full",
          photoAssetId: savedPhotoIds.front,
          backCover: "photo",
          backPhotoAssetId: savedPhotoIds.back,
          ledEnabled: false,
        },
      });
      expect(viewerState.summary).toContain("Telaio esterno e album: Tessuto di prova");
      expect(viewerState.summary).toContain("Copertina album: Foto grande a tutta copertina");
      expect(viewerState.summary).toContain("Plexiglass dello scrigno: Foto stampata");
      expect((viewerState.configuration as { photoAssetId: string; backPhotoAssetId: string }).photoAssetId)
        .not.toBe((viewerState.configuration as { photoAssetId: string; backPhotoAssetId: string }).backPhotoAssetId);
    }
    if (boxModel) {
      expect(viewerState.locked).toBe(true);
      expect(viewerState.pipCloseVisible).toBe(true);
      expect(viewerState.viewControlPressedAfterClick).toBe(true);
    } else {
      expect(viewerState.wizardReadonly).toBe(true);
    }

    const assertOrientation = async (viewport: { width: number; height: number }, label: string) => {
      await page.setViewportSize(viewport);
      await page.waitForFunction(({ width, height }) => {
        const frame = Array.from(document.querySelectorAll("iframe"))
          .find(candidate => candidate.src.includes("/mockups/")) as HTMLIFrameElement | undefined;
        return window.innerWidth === width && window.innerHeight === height
          && frame?.contentDocument?.body?.classList.contains("mq-3d");
      }, viewport);
      // Let the 3D ResizeObserver update its renderer and camera after rotation.
      await page.waitForTimeout(300);
      const state = await inspectViewer();
      expect(Math.abs(state.phoneWidth - viewport.width), `${label}: larghezza del viewer`).toBeLessThanOrEqual(4);
      expect(Math.abs(state.phoneHeight - (state.iframeBox?.height ?? 0)), `${label}: altezza del frame`).toBeLessThanOrEqual(2);
      expect(state.phoneWidth > state.phoneHeight, `${label}: il viewer deve passare in orizzontale`).toBe(viewport.width > viewport.height);
      expect(state.title, `${label}: il link non deve tornare al wizard`).toBe(viewerState.title);
      expect(state.framePath, `${label}: l'iframe del mockup deve restare aperto`).toBe(viewerState.framePath);
      expect(state.bodyClasses, `${label}: lo stato del viewer deve restare invariato`).toEqual(viewerState.bodyClasses);
      expect(state.ready, `${label}: renderer pronto`).toBe(true);
      expect(state.canvasVisible, `${label}: canvas visibile`).toBe(true);
      expect(state.stageVisible, `${label}: scena visibile`).toBe(true);
      expect(state.stageFillsViewer, `${label}: scena 3D a schermo intero`).toBe(true);
      expect(state.stageWithinViewport, `${label}: scena interamente nel viewport`).toBe(true);
      expect(state.stageWithinPhoneViewport, `${label}: scena non tagliata dal viewport del telefono`).toBe(true);
      expect(state.canvasWithinStage, `${label}: canvas contenuto nella scena`).toBe(true);
      expect(state.enabledChoices, `${label}: le scelte devono restare bloccate`).toBe(0);
      expect(state.viewControlVisible, `${label}: comandi 3D visibili`).toBe(true);
      expect(state.controlWithinViewport, `${label}: comandi 3D raggiungibili nel viewport`).toBe(true);
      expect(state.controlWithinPhoneViewport, `${label}: comandi 3D non tagliati dal viewport del telefono`).toBe(true);
      expect(state.controlReceivesPointer, `${label}: il comando 3D non è coperto (bersaglio: ${state.controlHitTarget})`).toBe(true);
      expect(state.viewControlEnabled, `${label}: comando 3D utilizzabile`).toBe(true);
      expect(state.wizardReadonly).toBe(viewerState.wizardReadonly);
      expect(state.locked).toBe(viewerState.locked);
      if (model.key === "plaza") {
        expect(state).toMatchObject({
          led: "false",
          backPhotoId: savedPhotoIds.back,
          backPhotoLoaded: "true",
          coverLayout: "full",
          summary: expect.stringContaining("LED: Spento"),
        });
      }
      if (boxModel) expect(state.viewControlPressedAfterClick, `${label}: il comando vista risponde`).toBe(true);
    };

    await assertOrientation(landscapeViewport, "Orizzontale");
    await assertOrientation(portraitViewport, "Verticale dopo la rotazione");
    expect(writes, "Il link di sola lettura non deve salvare o inviare scelte.").toBe(0);
  });
}
