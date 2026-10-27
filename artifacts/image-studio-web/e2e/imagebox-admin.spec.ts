import { expect, test } from "@playwright/test";

// Admin: assegnazione dell'ImageBox. Lo studio sceglie solo il formato, tra quelli del laboratorio.
// Usa la pagina di prova solo-sviluppo /admin/__e2e/mockup-offer; le API sono simulate.
const port = process.env.PHOTOBOOK_CLIENT_E2E_PORT ?? "4179";
const materialId = "2224386b-262c-5756-96b9-9e458ab95a8f";
const modelId = "30000000-0000-4000-8000-000000000002";
const labs = [{ id: "peppelab", nome: "PeppeLab", attivo: true, mockupCatalog: {
  revision: 1,
  materials: [{ id: materialId, label: "Tessuto di prova", supplierCode: "T-01" }],
  models: [{ id: modelId, name: "ImageBox", supplierCode: "IB-01", rendererId: "imagebox", active: true, materialIds: [materialId] }],
} }];

test("l'admin sceglie il formato dell'ImageBox tra quelli disponibili", async ({ page }) => {
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== `http://127.0.0.1:${port}`) return route.abort();
    if (url.pathname === "/api/labs") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(labs) });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    return route.continue();
  });
  await page.goto("/admin/__e2e/mockup-offer");
  await page.getByRole("button", { name: "Solo Necessari" }).click({ timeout: 8_000 }).catch(() => undefined);
  await page.getByRole("radio", { name: "ImageBox" }).check();
  const setup = page.getByTestId("imagebox-setup");
  await expect(setup).toBeVisible();
  // Sei formati: 20×30, 25×35, 30×40, verticali e orizzontali. Nessuna misura libera, nessuna grafica qui.
  await expect(setup.getByRole("radio")).toHaveCount(6);
  await expect(setup.getByRole("radio", { name: /30 × 20 cm orizzontale/ })).toBeChecked();
  await expect(setup.locator('input[type="file"], input[inputmode="decimal"]')).toHaveCount(0);
  await setup.getByRole("radio", { name: /25 × 35 cm verticale/ }).check();
  await page.getByRole("button", { name: /Salva modell/ }).last().click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mockupOfferPublished?: unknown }).__mockupOfferPublished)).toMatchObject({
    mode: "fixed",
    selections: [{ labId: "peppelab", modelId, setup: { format: { w: 25, h: 35 } } }],
  });
});
