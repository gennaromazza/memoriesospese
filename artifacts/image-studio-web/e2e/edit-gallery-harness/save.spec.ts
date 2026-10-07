import { expect, test, type Page } from "@playwright/test";

async function openFixture(page: Page, name: string) {
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4188") {
      // Fonts/theme previews may try external GETs; never let them leave the harness.
      await route.abort();
      if (!["GET", "HEAD"].includes(request.method())) {
        throw new Error(`Off-origin writes forbidden: ${request.method()} ${url.origin}${url.pathname}`);
      }
      return;
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      await route.abort();
      throw new Error("Non-fixture network traffic forbidden");
    }
    if (url.pathname.startsWith("/api/email/get-gallery-secrets/")) {
      await route.fulfill({
        json: { password: null, specialPin: null },
      });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.abort();
      throw new Error("Unexpected API request");
    }
    await route.continue();
  });
  await page.goto("/");
  const secretsLoaded = page.waitForResponse(response =>
    response.url().includes("/api/email/get-gallery-secrets/"));
  await page.getByRole("button", { name, exact: true }).click();
  await secretsLoaded;
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salva Modifiche", exact: true })).toBeEnabled();
}

async function chooseJob(page: Page, name: string) {
  await page.getByPlaceholder("Cerca per nome evento…").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByTitle("Rimuovi collegamento")).toBeVisible();
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Salva Modifiche", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator('[aria-label="Harness toast"]')).toContainText("Galleria aggiornata");
}

test("legacy gallery without code saves password and public access flags", async ({ page }) => {
  await openFixture(page, "Open legacy fixture");
  await page.getByLabel("Password", { exact: true }).fill("fixture-only-secret");
  await save(page);
  // Return only booleans, never print credentials in a browser/test failure.
  expect(await page.evaluate(() => {
    const store = (window as any).__fakeStore;
    const gallery = store.maps.galleries.get("legacy-gallery");
    return {
      code: gallery.code,
      mode: gallery.accessMode,
      passwordEnabled: gallery.passwordEnabled,
      passwordSaved: store.maps.gallerySecrets.get("legacy-gallery").password === "fixture-only-secret",
    };
  })).toEqual({ code: null, mode: "password", passwordEnabled: true, passwordSaved: true });
});

test("changing only the job is reflected in main save and reverse links", async ({ page }) => {
  await openFixture(page, "Open gallery linked to A");
  await page.getByTitle("Rimuovi collegamento").click();
  await chooseJob(page, "Fixture Job B");
  await save(page);
  expect(await page.evaluate(() => {
    const store = (window as any).__fakeStore;
    return {
      jobId: store.maps.galleries.get("gallery-with-a").jobId,
      oldLinks: store.maps.jobs.get("job-A").galleryIds,
      newLinks: store.maps.jobs.get("job-B").galleryIds,
    };
  })).toEqual({ jobId: "job-B", oldLinks: [], newLinks: ["gallery-with-a"] });
});

test("changing only the category uses the current value", async ({ page }) => {
  await openFixture(page, "Open gallery linked to A");
  // First combobox is the category, not theme/header/photo options.
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Ritratto", exact: true }).click();
  await save(page);
  expect(await page.evaluate(() =>
    (window as any).__fakeStore.maps.galleries.get("gallery-with-a").jobType
  )).toBe("portrait");
});

test("unsaved job switch then clear removes the original persisted reverse link", async ({ page }) => {
  await openFixture(page, "Open gallery linked to A");
  await page.getByTitle("Rimuovi collegamento").click();
  await chooseJob(page, "Fixture Job B");
  await page.getByTitle("Rimuovi collegamento").click();
  await page.getByRole("button", { name: "Aggiorna", exact: true }).click();
  await expect(page.locator('[aria-label="Harness toast"]')).toContainText("Categoria e lavoro aggiornati");
  expect(await page.evaluate(() => {
    const store = (window as any).__fakeStore;
    return {
      jobId: store.maps.galleries.get("gallery-with-a").jobId,
      oldLinks: store.maps.jobs.get("job-A").galleryIds,
      newLinks: store.maps.jobs.get("job-B").galleryIds,
    };
  })).toEqual({ jobId: null, oldLinks: [], newLinks: [] });
});

test("failed batch stays open and never reports success", async ({ page }) => {
  await openFixture(page, "Open legacy fixture");
  await page.evaluate(() => { (window as any).__fakeStore.failNextBatch = true; });
  await page.getByRole("button", { name: "Salva Modifiche", exact: true }).click();
  await expect(page.locator('[aria-label="Harness toast"]')).toContainText("Errore");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__fakeStore.writes.length)).toBe(0);
});