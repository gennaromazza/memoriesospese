import { expect, test, type Page } from "@playwright/test";

// Il cliente apre il Quadrobook assegnato dallo studio: formato imposto, copertina a scelta,
// foto dalla galleria, salvataggio. Il visualizzatore 3D è quello vero; le API sono simulate.
const port = process.env.PHOTOBOOK_CLIENT_E2E_PORT ?? "4179";
const localOrigin = `http://127.0.0.1:${port}`;
const token = "e2e-quadrobook-token";
const materialId = "2224386b-262c-5756-96b9-9e458ab95a8f";
const ids = { base: "10000000-0000-4000-8000-000000000001", lid: "10000000-0000-4000-8000-000000000002", cover: "10000000-0000-4000-8000-000000000003", graphic: "10000000-0000-4000-8000-000000000009" };
const option = {
  id: "20000000-0000-4000-8000-000000000001", name: "Quadrobook", supplierCode: "Q-01", rendererId: "scatola-cornice", active: true,
  materialIds: [materialId], materials: [{ id: materialId, label: "Tessuto di prova", supplierCode: "Q-01" }], labId: "studio", labName: "Studio",
  setup: { format: { w: 30, h: 20 }, cover: { mode: "choice", graphicAssetId: ids.graphic } },
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

test("il cliente personalizza il Quadrobook e salva senza poter cambiare il formato", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  const images: Record<string, Buffer> = {
    [ids.base]: await jpeg(page, "#2a6"), [ids.lid]: await jpeg(page, "#c63"), [ids.cover]: await jpeg(page, "#36c"), [ids.graphic]: await jpeg(page, "#a3a"),
  };
  let picked = 0; const pickOrder = [ids.base, ids.lid, ids.cover];
  let saveBody: { revision: number; configuration: Record<string, unknown>; selection: unknown; offerRevision: number } | undefined;
  let saved: object | null = null;

  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== localOrigin) { await route.abort(); return; }
    if (url.origin !== localOrigin) { await route.abort(); return; }
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    const base = `/api/photobooks/by-token/${token}`;
    if (url.pathname === `${base}/gallery-photos`) return json({ photos: [{ id: "g1", name: "foto.jpg", url: `${localOrigin}/x.jpg`, thumbnailUrl: `${localOrigin}/x.jpg` }], chapters: [] });
    if (url.pathname === `${base}/mockup/gallery-photo`) { const id = pickOrder[picked++ % 3]; return json({ id, name: "foto.jpg", source: "gallery", photoId: "g1", width: 600, height: 400 }); }
    if (url.pathname.startsWith(`${base}/mockup/photos/`)) { const id = url.pathname.split("/").pop()!; return route.fulfill({ status: 200, contentType: "image/jpeg", body: images[id] }); }
    if (url.pathname === `${base}/mockup/cover-graphic`) return route.fulfill({ status: 200, contentType: "image/jpeg", body: images[ids.graphic] });
    if (url.pathname === `${base}/mockup` && request.method() === "PUT") {
      saveBody = request.postDataJSON();
      saved = { revision: saveBody!.revision + 1, version: 1, status: "draft", updatedAt: "2026-10-14T10:00:00.000Z", updatedBy: "client", selection: saveBody!.selection, configuration: saveBody!.configuration, option };
      return json(saved);
    }
    if (url.pathname === `${base}/mockup`) return json({ version: 1, mockupPath: "client", editable: true, enabled: true, approvalRequired: false, saved, offer: { revision: 1, mode: "fixed", options: [option] }, modelMode: "fixed", modelSelection: { labId: "studio", modelId: option.id }, offerError: null });
    if (url.pathname === base) return json({ photobook: { id: "e2e-qb", name: "Fotolibro", galleryId: "g", token, currentVersion: 1, versions: [{ version: 1, pageCount: 0 }], approval: { version: 1 }, mockupPath: "client" }, version: 1, pages: [], requests: [] });
    if (request.method() === "GET" || request.method() === "HEAD") return route.continue();
    return route.abort();
  });

  await page.goto(`/fotolibro/${token}`);
  await expect(page.getByTestId("photobook-client-progress")).toBeVisible();
  await page.getByRole("button", { name: "Solo Necessari" }).click({ timeout: 5_000 }).catch(() => undefined);
  await page.getByRole("button", { name: /Personalizza il tuo album|Apri il tuo album|Personalizza album/ }).first().click();

  const viewer = page.frameLocator("iframe").first();
  await expect(viewer.locator("#stepTitle")).toHaveText("Il tessuto", { timeout: 60_000 });
  // Formato e copertina arrivano dallo studio: il cliente non ha controlli per cambiarli.
  await expect(viewer.locator("#formatInput")).toBeHidden();
  const next = viewer.locator("#next");
  // Subito dopo una foto la piattaforma può ancora essere occupata e ignorare il tocco: si ritenta finché il passo cambia.
  const advance = (title: string) => expect(async () => { await next.click(); await expect(viewer.locator("#stepTitle")).toHaveText(title, { timeout: 4_000 }); }).toPass({ timeout: 40_000 });
  await advance("Foto del quadro da parete");
  const choosePhoto = async (slot: string) => {
    await viewer.locator(`[data-pick="${slot}:gallery"]`).click();
    await page.getByRole("button", { name: /foto\.jpg/ }).first().click();
    await expect(viewer.locator(`#${slot}Status`)).toContainText("Foto scelta", { timeout: 20_000 });
  };
  await choosePhoto("base");
  await advance("Foto della cornice da tavolo");
  await choosePhoto("lid");
  await advance("Copertina dell’album");
  // La copertina è lasciata al cliente: può scegliere tra la sua foto e la grafica dello studio.
  await expect(viewer.locator("#coverChoice")).toBeVisible();
  await choosePhoto("album");
  await advance("Riepilogo");
  await expect(viewer.locator("#configurationSummary")).toContainText("30 × 20 cm");
  await page.getByRole("button", { name: "Salva bozza" }).click();
  await expect.poll(() => saveBody?.revision).toBe(0);
  expect(saveBody?.configuration).toMatchObject({
    modelId: "scatola-cornice", coverLayout: "photo", format: { w: 30, h: 20 },
    photoAssetId: ids.base, lidPhotoAssetId: ids.lid, coverPhotoAssetId: ids.cover,
  });
  await expect(page.getByTestId("quadrobook-actions")).toContainText("Bozza salvata");
  // Il cliente sceglie la grafica dello studio: la foto di copertina non viene più salvata.
  // Dopo il salvataggio il viewer esporta le viste (lento con il renderer software): attendiamo che sia libero.
  await viewer.locator("#prev").click({ timeout: 90_000 });
  await viewer.locator('[data-cover="graphic"]').click();
  await page.getByRole("button", { name: "Salva bozza" }).click();
  await expect.poll(() => saveBody?.revision).toBe(1);
  expect(saveBody?.configuration).toMatchObject({ coverLayout: "graphic", coverPhotoAssetId: null });
  await page.screenshot({ path: "/tmp/quadrobook-done.png" });
});
