import { expect, test, type Page } from "@playwright/test";

const port = process.env.STUDIO_SETTINGS_E2E_PORT ?? "4183";
const localOrigin = `http://127.0.0.1:${port}`;

async function isolateBrowser(page: Page) {
  const blockedWrites: string[] = [];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin !== localOrigin) {
      await route.abort();
      return;
    }

    if (!["GET", "HEAD"].includes(request.method())) {
      blockedWrites.push(`${request.method()} ${url.pathname}`);
      await route.abort();
      return;
    }

    await route.continue();
  });

  return blockedWrites;
}

test("nome e logo aggiornano la preview della bozza prima del salvataggio", async ({ page }) => {
  const blockedWrites = await isolateBrowser(page);
  await page.goto("/admin/__e2e/studio-settings-preview");

  const previewName = page.getByTestId("text-studio-preview-name");
  const previewLogo = page.getByTestId("placeholder-studio-preview-logo");
  const draftStatus = page.getByTestId("studio-settings-draft-status");
  await expect(previewName).toHaveText("Nome dello studio");
  await expect(previewLogo).toHaveText("Logo dello studio");
  await expect(page.getByTestId("img-studio-preview-logo")).toHaveCount(0);
  await expect(draftStatus).toHaveText("Bozza non salvata");

  await page.getByTestId("input-studio-name").fill("Studio Aurora");
  await expect(previewName).toHaveText("Studio Aurora");
  await expect(draftStatus).toHaveText("Bozza non salvata");

  const logoSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#6b7f6b"/></svg>',
  );
  await page.getByTestId("input-studio-logo").setInputFiles({
    name: "studio-aurora.svg",
    mimeType: "image/svg+xml",
    buffer: logoSvg,
  });

  const previewLogoImage = page.getByTestId("img-studio-preview-logo");
  await expect(previewLogoImage).toBeVisible();
  await expect(previewLogoImage).toHaveAttribute("alt", "Logo Studio Aurora");
  await expect(previewLogoImage).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
  await expect(draftStatus).toHaveText("Bozza non salvata");
  expect(blockedWrites).toEqual([]);

  await page.getByTestId("input-studio-name").fill("");
  await expect(previewName).toHaveText("Nome dello studio");
  await expect(previewLogoImage).toHaveAttribute("alt", "Logo dello studio");
  await expect(draftStatus).toHaveText("Bozza non salvata");
  expect(blockedWrites).toEqual([]);
});
