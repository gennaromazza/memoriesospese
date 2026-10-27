import { expect, test, type Page } from "@playwright/test";

// Il cliente personalizza l'ImageBox assegnato dallo studio (percorso in cui sceglie il cliente):
// formato imposto, solo scritte (le grafiche le carica lo studio), foto dalla galleria, salvataggio.
// Il visualizzatore 3D è quello vero; le API sono simulate.
const port = process.env.PHOTOBOOK_CLIENT_E2E_PORT ?? "4179";
const localOrigin = `http://127.0.0.1:${port}`;
const token = "e2e-imagebox-token";
const materialId = "2224386b-262c-5756-96b9-9e458ab95a8f";
const ids = { base: "10000000-0000-4000-8000-000000000011", cover: "10000000-0000-4000-8000-000000000012" };
const option = {
  id: "20000000-0000-4000-8000-000000000002", name: "ImageBox", supplierCode: "IB-01", rendererId: "imagebox", active: true,
  materialIds: [materialId], materials: [{ id: materialId, label: "Tessuto di prova", supplierCode: "T-01" }], labId: "peppelab", labName: "PeppeLab",
  setup: { format: { w: 40, h: 30 } },
};

async function jpeg(page: Page, color: string) {
  const data = await page.evaluate(async c => {
    const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 400;
    const x = canvas.getContext("2d")!; x.fillStyle = c; x.fillRect(0, 0, 600, 400);
    const blob: Blob = await new Promise(r => canvas.toBlob(b => r(b!), "image/jpeg", 0.9));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, color);
  return Buffer.from(data);
}

test("il cliente personalizza l'ImageBox con sole scritte e salva", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  const images: Record<string, Buffer> = { [ids.base]: await jpeg(page, "#2a6"), [ids.cover]: await jpeg(page, "#36c") };
  let picked = 0; const pickOrder = [ids.cover, ids.base];
  let saveBody: { revision: number; configuration: Record<string, unknown>; selection: unknown; offerRevision: number } | undefined;
  let saved: object | null = null;

  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== localOrigin) { await route.abort(); return; }
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    const base = `/api/photobooks/by-token/${token}`;
    if (url.pathname === `${base}/gallery-photos`) return json({ photos: [{ id: "g1", name: "foto.jpg", url: `${localOrigin}/x.jpg`, thumbnailUrl: `${localOrigin}/x.jpg` }], chapters: [] });
    if (url.pathname === `${base}/mockup/gallery-photo`) { const id = pickOrder[picked++ % 2]; return json({ id, name: "foto.jpg", source: "gallery", photoId: "g1", width: 600, height: 400 }); }
    if (url.pathname.startsWith(`${base}/mockup/photos/`)) { const id = url.pathname.split("/").pop()!; return route.fulfill({ status: 200, contentType: "image/jpeg", body: images[id] }); }
    if (url.pathname === `${base}/mockup` && request.method() === "PUT") {
      saveBody = request.postDataJSON();
      saved = { revision: saveBody!.revision + 1, version: 1, status: "draft", updatedAt: "2026-10-27T10:00:00.000Z", updatedBy: "client", selection: saveBody!.selection, configuration: saveBody!.configuration, option };
      return json(saved);
    }
    if (url.pathname === `${base}/mockup`) return json({ version: 1, mockupPath: "client", editable: true, enabled: true, approvalRequired: false, saved, offer: { revision: 1, mode: "fixed", options: [option] }, modelMode: "fixed", modelSelection: { labId: "peppelab", modelId: option.id }, offerError: null });
    if (url.pathname === base) return json({ photobook: { id: "e2e-ib", name: "Fotolibro", galleryId: "g", token, currentVersion: 1, versions: [{ version: 1, pageCount: 0 }], approval: { version: 1 }, mockupPath: "client" }, version: 1, pages: [], requests: [] });
    if (request.method() === "GET" || request.method() === "HEAD") return route.continue();
    return route.abort();
  });

  await page.goto(`/fotolibro/${token}`);
  await page.getByRole("button", { name: "Solo Necessari" }).click({ timeout: 5_000 }).catch(() => undefined);
  await page.getByRole("button", { name: /Personalizza il tuo album|Apri il tuo album|Personalizza album/ }).first().click();

  const viewer = page.frameLocator("iframe").first();
  await expect(viewer.locator("#stepTitle")).toHaveText("Il tessuto", { timeout: 60_000 });
  // Il formato lo decide lo studio; le grafiche le carica lo studio solo quando prepara lui il mockup.
  await expect(viewer.locator("#openStudio")).toBeHidden();
  await expect(viewer.locator('[data-glass="graphic"]')).toBeHidden();
  await expect(viewer.locator('[data-cover-engraving="graphic"]')).toBeHidden();
  const next = viewer.locator("#next");
  // Subito dopo una foto la piattaforma può ancora essere occupata e ignorare il tocco: si ritenta finché il passo cambia.
  const advance = (title: string) => expect(async () => { await next.click(); await expect(viewer.locator("#stepTitle")).toHaveText(title, { timeout: 4_000 }); }).toPass({ timeout: 40_000 });
  const choosePhoto = async (slot: string) => {
    await viewer.locator(`[data-pick="${slot}:gallery"]`).click();
    await page.getByRole("button", { name: /foto\.jpg/ }).first().click();
    await expect(viewer.locator(`#${slot}Status`)).toContainText("Foto scelta", { timeout: 20_000 });
  };

  await advance("Copertina dell’album");
  await choosePhoto("album");
  // La placchetta non usa la foto di copertina: serve la scritta da incidere.
  const plaque = viewer.locator('[data-layout="plaque"]');
  await expect(async () => { await plaque.click(); await expect(plaque).toHaveAttribute("aria-pressed", "true", { timeout: 2_000 }); }).toPass({ timeout: 30_000 });
  await expect(viewer.locator("#coverPhotoBox")).toBeHidden();
  await viewer.locator("#coverText").fill("Lorenzo\n12 ottobre 2026");
  await advance("Foto sul fondo");
  await choosePhoto("base");
  await advance("Incisione sul plexiglass");
  const glassText = viewer.locator('[data-glass="text"]');
  await expect(async () => { await glassText.click(); await expect(glassText).toHaveAttribute("aria-pressed", "true", { timeout: 2_000 }); }).toPass({ timeout: 30_000 });
  await viewer.locator("#glassText").fill("il mio battesimo");
  await viewer.locator('[data-glass-color="black"]').click();
  await advance("Riepilogo");
  await expect(viewer.locator("#configurationSummary")).toContainText("40 × 30 cm");
  await expect(viewer.locator("#configurationSummary")).toContainText("il mio battesimo");

  await page.getByRole("button", { name: "Salva bozza" }).click();
  await expect.poll(() => saveBody?.revision).toBe(0);
  expect(saveBody?.configuration).toMatchObject({
    modelId: "imagebox", format: { w: 40, h: 30 }, coverLayout: "plaque",
    materialId, albumMaterialId: materialId,
    photoAssetId: ids.base, coverPhotoAssetId: null,
    coverEngraving: { mode: "text", text: "Lorenzo\n12 ottobre 2026" },
    glassEngraving: { mode: "text", text: "il mio battesimo", color: "black" },
  });
  await expect(page.getByTestId("quadrobook-actions")).toContainText("Bozza salvata");
});
