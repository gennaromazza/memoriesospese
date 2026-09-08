import { expect, test } from "@playwright/test";

const GALLERY_ID = "e2e-real-wedding-fallback";
const API_PATTERN = `**/api/wedding-seo/gallery/${GALLERY_ID}**`;

const safeFallbackDraft = {
  title: "Andrea e Justine ad Aversa: il racconto fotografico",
  excerpt:
    "Il racconto fotografico del matrimonio di Andrea e Justine ad Aversa, attraverso i momenti e i dettagli della galleria.",
  story:
    "## Andrea e Justine ad Aversa\n\n" +
    "Il matrimonio viene raccontato attraverso un reportage fotografico costruito sui momenti e sui dettagli raccolti nella galleria. " +
    "Image Studio segue il filo della giornata con uno sguardo attento alla continuità tra persone, gesti e ambienti.\n\n" +
    "## Un racconto costruito sulle immagini\n\n" +
    "Le parole condivise dalla coppia aggiungono al racconto alcuni elementi personali: la luce del pomeriggio e una passeggiata insieme.",
  seoTitle: "Matrimonio di Andrea e Justine ad Aversa | Image Studio",
  seoDescription:
    "Il reportage fotografico del matrimonio di Andrea e Justine ad Aversa, raccontato da Image Studio attraverso immagini e dettagli reali.",
};

test.describe("Real Wedding – fallback IA", () => {
  test("mostra e salva una bozza privata quando il provider IA fallisce", async ({
    page,
  }) => {
    let generateRequests = 0;
    let savedDraftRequest: Record<string, unknown> | undefined;

    await page.route(API_PATTERN, async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() === "GET" && !url.pathname.endsWith("/selection")) {
        await route.fulfill({
          json: {
            story: null,
            gallery: {
              id: GALLERY_ID,
              name: "Andrea e Justine",
              date: "2026-06-12",
              location: "Aversa",
              jobId: "e2e-wedding-job",
              jobType: "matrimonio",
            },
            sources: [
              {
                id: "e2e-story-moment",
                submissionId: "e2e-submission",
                fieldId: "moment",
                label: "Momento preferito",
                value: "La luce del pomeriggio e una passeggiata insieme.",
                clientName: "Andrea",
                category: "story",
                consentGranted: true,
              },
            ],
            vendorReviews: [],
            jobFacts: {
              coupleNames: ["Andrea", "Justine"],
              coupleSurnames: ["Rossi", "Brown"],
              receptionCity: "Aversa",
              clientCities: ["Aversa"],
            },
          },
        });
        return;
      }

      if (request.method() === "POST" && url.pathname.endsWith("/generate")) {
        generateRequests += 1;
        await route.fulfill({
          json: {
            draft: safeFallbackDraft,
            vendorReviews: [],
            fallbackUsed: true,
            fallbackReason:
              "La richiesta IA non è riuscita o ha superato il tempo massimo.",
          },
        });
        return;
      }

      if (request.method() === "PUT" && !url.pathname.endsWith("/selection")) {
        savedDraftRequest = request.postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          json: {
            ok: true,
            story: {
              id: GALLERY_ID,
              galleryId: GALLERY_ID,
              jobId: "e2e-wedding-job",
              status: "draft",
              slug: "andrea-e-justine-ad-aversa-il-racconto-fotografico",
              ...safeFallbackDraft,
              selectedPhotoIds: [],
              approvedSourceIds: ["e2e-story-moment"],
            },
          },
        });
        return;
      }

      await route.fulfill({ json: { ok: true, selectedPhotoIds: [] } });
    });

    await page.goto("/admin/__e2e/wedding-seo-draft-fallback");
    await expect(page.getByText("Storia Real Wedding", { exact: true })).toBeVisible();

    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Genera bozza IA" }).click();

    await expect(
      page.getByText(
        "La richiesta IA non è riuscita o ha superato il tempo massimo.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /Titolo/ }),
    ).toHaveValue(safeFallbackDraft.title);
    await expect(
      page.getByRole("textbox", { name: /Racconto/ }),
    ).toHaveValue(safeFallbackDraft.story);

    const visibleDraft = await page.locator("body").innerText();
    expect(visibleDraft).not.toContain("andrea@example.com");
    expect(visibleDraft).not.toContain("3331234567");
    expect(visibleDraft).not.toContain("Via Roma 12");
    expect(visibleDraft).not.toContain("Rossi");
    expect(visibleDraft).not.toContain("Brown");
    expect(generateRequests).toBe(1);

    await page.getByRole("button", { name: "Salva bozza privata" }).click();
    await expect(
      page.getByText("Bozza privata salvata", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Bozza privata", { exact: true })).toBeVisible();
    expect(savedDraftRequest?.status).toBe("draft");
    expect(savedDraftRequest?.story).toBe(safeFallbackDraft.story);
    expect(generateRequests).toBe(1);
  });
});