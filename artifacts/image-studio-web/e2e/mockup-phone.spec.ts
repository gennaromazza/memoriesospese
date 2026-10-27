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
      photoAssetId: savedPhotoIds.front, crop, backCover: "photo", backPhotoAssetId: savedPhotoIds.back, backCrop: crop, ledEnabled: true,
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
    const viewerState = await page.evaluate((isBox) => {
      const frame = Array.from(document.querySelectorAll("iframe"))
        .find(candidate => candidate.src.includes("/mockups/")) as HTMLIFrameElement | undefined;
      const doc = frame?.contentDocument;
      const body = doc?.body;
      const canvas = doc?.querySelector<HTMLCanvasElement>("#viewport");
      const stage = doc?.querySelector<HTMLElement>(".mq-stage, .stage");
      const canvasRect = canvas?.getBoundingClientRect();
      const stageRect = stage?.getBoundingClientRect();
      const enabledChoices = doc?.querySelectorAll(isBox
        ? ".panel-content button:not(:disabled)"
        : "#materials button:not(:disabled), #detailPanel input:not(:disabled), #detailPanel select:not(:disabled)").length ?? -1;
      const viewControl = doc?.querySelector<HTMLButtonElement>(isBox
        ? 'button[data-mode="uses"], button[data-mode="open"]'
        : "#rotate");
      const pipClose = doc?.querySelector<HTMLButtonElement>("#pipClose");
      const pipCloseStyle = pipClose ? doc?.defaultView?.getComputedStyle(pipClose) : null;
      const title = doc?.querySelector(".mq-title, #stepTitle")?.textContent?.trim() || "";
      const initial = {
        title,
        bodyClasses: body ? Array.from(body.classList) : [],
        ready: body?.dataset.ready === "true",
        wizardReadonly: body?.dataset.wizardReadonly === "true",
        locked: body?.classList.contains("locked") ?? false,
        enabledChoices,
        canvasVisible: !!canvas && !!canvasRect && canvasRect.width > 0 && canvasRect.height > 0,
        stageVisible: !!stage && !!stageRect && stageRect.width > 0 && stageRect.height > 0,
        pipCloseVisible: !!pipClose && !!pipCloseStyle && pipCloseStyle.display !== "none" && pipCloseStyle.visibility !== "hidden",
        viewControlEnabled: !!viewControl && !viewControl.disabled,
      };
      viewControl?.click();
      return { ...initial, viewControlPressedAfterClick: viewControl?.getAttribute("aria-pressed") === "true" };
    }, boxModel);

    expect(viewerState.title).toBeTruthy();
    expect(viewerState.bodyClasses).toContain("mq-phone");
    expect(viewerState.bodyClasses).toContain("mq-3d");
    expect(viewerState.ready).toBe(true);
    expect(viewerState.canvasVisible).toBe(true);
    expect(viewerState.stageVisible).toBe(true);
    expect(viewerState.enabledChoices).toBe(0);
    expect(viewerState.viewControlEnabled).toBe(true);
    expect(viewerState.viewControlPressedAfterClick).toBe(true);
    if (boxModel) {
      expect(viewerState.locked).toBe(true);
      expect(viewerState.pipCloseVisible).toBe(true);
    } else {
      expect(viewerState.wizardReadonly).toBe(true);
    }
    expect(writes, "Il link di sola lettura non deve salvare o inviare scelte.").toBe(0);
  });
}
