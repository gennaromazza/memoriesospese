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
