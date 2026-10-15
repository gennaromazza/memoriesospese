import { expect, test } from "@playwright/test";

// Admin: assegnazione del Quadrobook con formato in cm e copertina decisi dallo studio.
// Usa la pagina di prova solo-sviluppo /admin/__e2e/mockup-offer; le API sono simulate.
const materialId = "2224386b-262c-5756-96b9-9e458ab95a8f";
const modelId = "30000000-0000-4000-8000-000000000001";
const labs = [{ id: "lab1", nome: "Studio Lab", attivo: true, mockupCatalog: {
  revision: 1,
  materials: [{ id: materialId, label: "Tessuto di prova", supplierCode: "T-01" }],
  models: [{ id: modelId, name: "Quadrobook", supplierCode: "Q-01", rendererId: "scatola-cornice", active: true, materialIds: [materialId] }],
} }];

test("l'admin imposta formato e copertina del Quadrobook", async ({ page }) => {
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4179") return route.abort();
    if (url.pathname === "/api/labs") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(labs) });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    return route.continue();
  });
  await page.goto("/admin/__e2e/mockup-offer");
  await page.getByRole("button", { name: "Solo Necessari" }).click();
  await page.getByText("Quadrobook").first().waitFor();
  await page.screenshot({ path: "/tmp/qb-admin-0.png", fullPage: true });
  await page.getByRole("radio", { name: "Quadrobook" }).check();
  await expect(page.getByLabel("Larghezza in cm")).toBeVisible();
  await page.getByLabel("Larghezza in cm").fill("30");
  await page.getByLabel("Altezza in cm").fill("20");
  await page.getByText("Solo la mia grafica").click();
  // Senza grafica non si pubblica.
  await page.getByRole("button", { name: /Salva modell/ }).last().click();
  await expect(page.getByText("Carica la grafica di copertina.")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "grafica.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") });
  await expect(page.getByText("grafica.jpg")).toBeVisible();
  await page.screenshot({ path: "/tmp/qb-admin-1.png", fullPage: true });
  await page.getByRole("button", { name: /Salva modell/ }).last().click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mockupOfferPublished?: unknown }).__mockupOfferPublished)).toMatchObject({
    mode: "fixed",
    selections: [{ labId: "lab1", modelId, setup: { format: { w: 30, h: 20 }, cover: { mode: "graphic", graphicAssetId: "10000000-0000-4000-8000-000000000009" } } }],
  });
});
