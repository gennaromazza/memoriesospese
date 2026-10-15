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

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
test("Quadrobook da telefono: la barra azioni non copre il 3D", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  const images: Record<string, Buffer> = {
    [ids.base]: await jpeg(page, "#2a6"), [ids.lid]: await jpeg(page, "#c63"), [ids.cover]: await jpeg(page, "#36c"), [ids.graphic]: await jpeg(page, "#a3a"),
  };
  const thumbColors = ["#c9a27e", "#7d9a8c", "#d8c8b0", "#4f6f86", "#b5876b", "#e3d6c4", "#8c7a6b", "#a9b8a2", "#6b5b73"];
  const thumbs = await Promise.all(thumbColors.map(c => jpeg(page, c)));
  let picked = 0; const pickOrder = [ids.base, ids.lid, ids.cover];
  let saveBody: { revision: number; configuration: Record<string, unknown>; selection: unknown; offerRevision: number } | undefined;
  let saved: object | null = null;
  let submitted = false;

  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== localOrigin) { await route.abort(); return; }
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    const base = `/api/photobooks/by-token/${token}`;
    if (url.pathname === `${base}/gallery-photos`) return json({
      photos: thumbColors.map((_, i) => ({ id: `g${i}`, name: `foto-${i + 1}.jpg`, url: `${localOrigin}/thumb-${i}.jpg`, thumbnailUrl: `${localOrigin}/thumb-${i}.jpg`, chapterId: i < 5 ? "c1" : "c2" })),
      chapters: [{ id: "c1", titolo: "Preparativi", ordine: 1 }, { id: "c2", titolo: "Cerimonia", ordine: 2 }],
    });
    if (/^\/thumb-\d+\.jpg$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: "image/jpeg", body: thumbs[Number(url.pathname.match(/\d+/)![0])] });
    if (url.pathname === `${base}/mockup/gallery-photo`) { const id = pickOrder[picked++ % 3]; return json({ id, name: "foto.jpg", source: "gallery", photoId: "g1", width: 600, height: 400 }); }
    if (url.pathname.startsWith(`${base}/mockup/photos/`)) { const id = url.pathname.split("/").pop()!; return route.fulfill({ status: 200, contentType: "image/jpeg", body: images[id] }); }
    if (url.pathname === `${base}/mockup/cover-graphic`) return route.fulfill({ status: 200, contentType: "image/jpeg", body: images[ids.graphic] });
    if (url.pathname === `${base}/mockup/submit`) { submitted = true; saved = { ...(saved as object), status: "submitted" }; return json(saved); }
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
  // Si sceglie a schermo pieno: niente intestazione né barra dell'host, 3D in miniatura.
  await expect(viewer.locator("#stepTitle")).toHaveText("Il tessuto", { timeout: 60_000 });
  await expect(page.getByTestId("quadrobook-actions")).toHaveCount(0);
  await expect(viewer.locator("#pipOpen")).toBeVisible();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/tmp/qb-mobile-1.png" });
  await viewer.locator("#pipOpen").click();
  await expect(viewer.locator("#pipClose")).toBeVisible();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "/tmp/qb-mobile-2.png" });
  await viewer.locator("#pipClose").click();
  const next = viewer.locator("#next");
  await next.click(); await expect(viewer.locator("#stepTitle")).toHaveText("Foto del quadro da parete");
  // La galleria del cliente è dentro lo slide: un tocco e la foto è scelta.
  const pick = async (slot: string) => {
    await viewer.locator(`[data-gallery="${slot}"] .thumbs button`).first().click();
    await expect(viewer.locator(`#${slot}Status`)).toContainText("Foto scelta", { timeout: 20_000 });
  };
  await pick("base");
  await page.screenshot({ path: "/tmp/qb-mobile-3.png" });
  await next.click(); await pick("lid");
  await next.click(); await expect(viewer.locator("#stepTitle")).toHaveText("Copertina dell’album");
  await pick("album");
  await next.click(); await expect(viewer.locator("#stepTitle")).toHaveText("Ecco il tuo Quadrobook");
  // Salvataggio automatico al cambio di passo, poi l'invio.
  await expect.poll(() => saveBody?.revision, { timeout: 30_000 }).toBe(0);
  await expect(viewer.locator("#hostStatus")).toContainText("Salvato automaticamente", { timeout: 20_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "/tmp/qb-mobile-4.png" });
  await viewer.locator("#submitHost").click();
  await expect.poll(() => submitted).toBe(true);
  await expect(viewer.locator("#hostStatus")).toContainText("Inviato allo studio", { timeout: 20_000 });
});
