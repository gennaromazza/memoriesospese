import { expect, test, type Page, type Route } from "@playwright/test";

// Il cliente apre il Quadrobook assegnato dallo studio: formato imposto, copertina a scelta,
// foto dalla galleria, salvataggio. Il visualizzatore 3D è quello vero; le API sono simulate.
const port = process.env.PHOTOBOOK_CLIENT_E2E_PORT ?? "4179";
const localOrigin = `http://127.0.0.1:${port}`;
const token = "e2e-quadrobook-token";
const materials = [
  { id: "2224386b-262c-5756-96b9-9e458ab95a8f", appearanceRevision: 4, label: "Tessuto scatola prova" },
  { id: "87b8a72c-27d9-53e2-8547-0a0c95ddb36c", appearanceRevision: 4, label: "Tessuto album prova" },
];
const ids = {
  base: "10000000-0000-4000-8000-000000000001",
  newBase: "10000000-0000-4000-8000-000000000004",
  lid: "10000000-0000-4000-8000-000000000002",
  cover: "10000000-0000-4000-8000-000000000003",
  graphic: "10000000-0000-4000-8000-000000000009",
};
const option = {
  id: "20000000-0000-4000-8000-000000000001", name: "Quadrobook", supplierCode: "Q-01", rendererId: "scatola-cornice", active: true,
  materialIds: materials.map(material => material.id),
  materials: materials.map((material, index) => ({ id: material.id, label: material.label, supplierCode: `Q-0${index + 1}` })),
  labId: "studio", labName: "Studio",
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

test("il cliente rivede e salva il Quadrobook su desktop e telefono senza confondere le superfici", async ({ browser }) => {
  test.setTimeout(360_000);
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await page.goto("/");
  const images: Record<string, Buffer> = {
    [ids.base]: await jpeg(page, "#2a6"), [ids.newBase]: await jpeg(page, "#3a5"), [ids.lid]: await jpeg(page, "#c63"), [ids.cover]: await jpeg(page, "#36c"), [ids.graphic]: await jpeg(page, "#a3a"),
  };
  const pickOrder = [ids.newBase];
  let picked = 0;
  let saveBody: { revision: number; configuration: Record<string, unknown>; selection: unknown; offerRevision: number } | undefined;
  let saved: Record<string, any> | null = {
    revision: 0,
    version: 1,
    status: "draft",
    updatedAt: "2026-11-13T10:00:00.000Z",
    updatedBy: "studio",
    selection: { labId: "studio", modelId: option.id },
    option,
    configuration: {
      modelId: "scatola-cornice",
      assetRevision: 1,
      materialId: materials[0].id,
      appearanceRevision: materials[0].appearanceRevision,
      albumMaterialId: materials[1].id,
      albumAppearanceRevision: materials[1].appearanceRevision,
      coverLayout: "photo",
      format: { w: 30, h: 20 },
      photoAssetId: ids.base,
      lidPhotoAssetId: ids.lid,
      coverPhotoAssetId: ids.cover,
    },
  };

  const apiRoute = async (route: Route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== localOrigin) { await route.abort(); return; }
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    const base = `/api/photobooks/by-token/${token}`;
    if (url.pathname === `${base}/gallery-photos`) return json({ photos: [{ id: "g1", name: "foto-fondo-nuova.jpg", url: `${localOrigin}/x.jpg`, thumbnailUrl: `${localOrigin}/x.jpg` }], chapters: [] });
    if (url.pathname === `${base}/mockup/gallery-photo`) { const id = pickOrder[picked++]; return json({ id, name: "foto-fondo-nuova.jpg", source: "gallery", photoId: "g1", width: 600, height: 400 }); }
    if (url.pathname.startsWith(`${base}/mockup/photos/`)) {
      const id = url.pathname.split("/").pop()!;
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: images[id] || images[ids.base] });
    }
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
  };
  await page.route("**/*", apiRoute);

  await page.goto(`/fotolibro/${token}`);
  await expect(page.getByTestId("photobook-client-progress")).toBeVisible();
  await page.getByRole("button", { name: "Solo Necessari" }).click({ timeout: 5_000 }).catch(() => undefined);
  await page.getByRole("button", { name: /Personalizza il tuo album|Apri il tuo album|Personalizza album/ }).first().click();

  const viewer = page.frameLocator("iframe").first();
  await expect(viewer.locator("#stepTitle")).toHaveText("Il tessuto", { timeout: 60_000 });
  // Formato e copertina arrivano dallo studio: il cliente non ha controlli per cambiarli.
  await expect(viewer.locator("#formatInput")).toBeHidden();
  await expect(viewer.locator("#formatInfo")).toContainText("32,2 × 22,2 cm");
  await expect(viewer.locator("#materialLabel")).toContainText("album 30 × 20 cm");
  await expect(viewer.locator("#baseStatus")).toContainText("Foto salvata");
  await expect(viewer.locator("#lidStatus")).toContainText("Foto salvata");
  await expect(viewer.locator("#albumStatus")).toContainText("Foto salvata");
  const next = viewer.locator("#next");
  const advance = (title: string) => expect(async () => { await next.click(); await expect(viewer.locator("#stepTitle")).toHaveText(title, { timeout: 4_000 }); }).toPass({ timeout: 40_000 });
  await advance("Foto del quadro da parete");
  await viewer.locator('[data-pick="base:gallery"]').click();
  await page.getByRole("button", { name: "foto-fondo-nuova.jpg" }).click();
  await expect(viewer.locator("#baseStatus")).toContainText("Foto scelta", { timeout: 20_000 });
  await advance("Foto della cornice da tavolo");
  await advance("Copertina dell’album");
  await expect(viewer.locator("#coverChoice")).toBeVisible();
  // La foto del tappo e quella dell'album restano nei rispettivi alloggiamenti.
  await expect(viewer.locator("#lidStatus")).toContainText("Foto salvata");
  await expect(viewer.locator("#albumStatus")).toContainText("Foto salvata");
  await advance("Riepilogo");
  await expect(viewer.locator("#configurationSummary")).toContainText("30 × 20 cm");
  await expect(viewer.locator("#configurationSummary")).toContainText("Tessuto scatola, tappo e piedistallo: Alcantara 01");
  await expect(viewer.locator("#configurationSummary")).toContainText("Tessuto album: Alcantara 02");
  await expect(viewer.locator("#configurationSummary")).toContainText("Fondo della scatola (quadro da parete)");
  await expect(viewer.locator("#configurationSummary")).toContainText("Tappo (cornice da tavolo)");
  await expect(viewer.locator("#configurationSummary")).toContainText("Copertina dell’album");

  await page.getByRole("button", { name: "Salva bozza" }).click();
  await expect.poll(() => saveBody?.revision).toBe(0);
  expect(saveBody?.configuration).toMatchObject({
    modelId: "scatola-cornice",
    coverLayout: "photo",
    format: { w: 30, h: 20 },
    photoAssetId: ids.newBase,
    lidPhotoAssetId: ids.lid,
    coverPhotoAssetId: ids.cover,
    materialId: materials[0].id,
    albumMaterialId: materials[1].id,
  });
  await expect(page.getByTestId("quadrobook-actions")).toContainText("Bozza salvata");

  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  try {
    await phone.route("**/*", apiRoute);
    await phone.goto(`/fotolibro/${token}`);
    await phone.getByRole("button", { name: "Solo Necessari" }).click({ timeout: 5_000 }).catch(() => undefined);
    await phone.getByRole("button", { name: /Personalizza il tuo album|Apri il tuo album|Personalizza album/ }).first().click();
    const phoneViewer = phone.frameLocator("iframe").first();
    await expect(phoneViewer.locator("#stepTitle")).toHaveText("Il tessuto", { timeout: 60_000 });
    await expect.poll(() => phoneViewer.locator("body").evaluate(element => element.classList.contains("mq-phone"))).toBe(true);
    await expect(phoneViewer.locator("#materialLabel")).toContainText("album 30 × 20 cm");
    await expect(phoneViewer.locator("#baseStatus")).toContainText("Foto salvata");
    await expect(phoneViewer.locator("#lidStatus")).toContainText("Foto salvata");
    await expect(phoneViewer.locator("#albumStatus")).toContainText("Foto salvata");
    await expect(phoneViewer.locator("#pipOpen")).toBeVisible();
  } finally {
    await page.close();
    await phone.close();
  }
});
