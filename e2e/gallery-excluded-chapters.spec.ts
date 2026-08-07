import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  seedSelectionGallery,
  deleteSelectionGallery,
  waitForSelectionCompleted,
  type SeededSelectionGallery,
} from "./fixtures/selection-gallery";

/**
 * Verifica end-to-end che le foto dei capitoli esclusi dalla selezione
 * (Chapter.excludeFromSelection) non finiscano MAI nella selezione del
 * cliente, in tutte le modalità:
 *
 * 1. Normale (requiredPhotoCount): sanificazione di selezioni salvate PRIMA
 *    che l'admin escludesse il capitolo, contatori basati sulle sole foto
 *    selezionabili, badge nel lightbox al posto del pulsante di selezione,
 *    salvataggio senza foto escluse.
 * 2. Inversa (dislike): contatore "Verranno salvate X su Y" basato su
 *    selectablePhotos, salvataggio = foto selezionabili non escluse dal
 *    cliente (mai quelle del capitolo escluso).
 * 3. Multi-prodotto: toggle bloccato con toast, sanificazione di
 *    photoAssignments pregressi, salvataggio senza foto escluse.
 *
 * Le gallerie fixture (con 2 capitoli: "Cerimonia" selezionabile e
 * "Backstage" escluso, 3 foto ciascuno) vengono seedate via Firebase Admin
 * SDK e cancellate a fine test (cascade-delete server-side condiviso).
 *
 * ⚠️ Questi test scrivono su Firestore e girano SOLO contro l'EMULATORE
 * (il fixture rifiuta di partire senza FIRESTORE_EMULATOR_HOST):
 *   1. firebase emulators:start --only firestore --project wedding-gallery-397b6
 *   2. FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *        npx playwright test --config playwright.emulator.config.ts
 */

/** Prepara la pagina: bypass gate accesso + abort immagini (URL finti). */
async function openGallery(page: Page, galleryId: string) {
  await page.addInitScript((id) => {
    window.localStorage.setItem(`gallery_auth_${id}`, "true");
    // Pre-imposta il consenso cookie: il banner altrimenti copre la pagina
    // e intercetta i click (z-50 fixed in basso).
    window.localStorage.setItem("image_studio_cookie_consent", "true");
    window.localStorage.setItem(
      "image_studio_cookie_preferences",
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  }, galleryId);
  await page.route("**/*", (route) =>
    route.request().resourceType() === "image"
      ? route.abort()
      : route.continue(),
  );
  await page.goto(`/view/${galleryId}`);
  await expect(page.getByText("Pagina non trovata")).toHaveCount(0);
  // Il banner cookie copre la parte bassa della pagina: chiudilo subito.
  const cookieBtn = page.getByRole("button", { name: "Solo Necessari" });
  if (await cookieBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await cookieBtn.click();
  }
}

/**
 * Chiude il riepilogo selezione se si è aperto da solo (succede al load
 * quando la selezione pre-salvata sembra completa PRIMA della sanificazione).
 */
async function closeReviewModalIfOpen(page: Page) {
  const continueBtn = page.getByTestId("button-continue-editing");
  if (await continueBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await continueBtn.click({ timeout: 10_000 }).catch(() => {});
    await expect(continueBtn).toBeHidden({ timeout: 10_000 });
  }
}

/** Espande un capitolo (le card partono tutte collassate). */
async function expandChapter(page: Page, chapterId: string) {
  const card = page.getByTestId(`chapter-card-${chapterId}`);
  await card.waitFor({ state: "visible", timeout: 30_000 });
  await card.click();
  await page
    .locator(`[data-testid="chapter-${chapterId}"] .gallery-image`)
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
}

/** Apre nel lightbox la foto index-esima del capitolo indicato. */
async function openPhotoInLightbox(
  page: Page,
  chapterId: string,
  index: number,
) {
  await page
    .locator(`[data-testid="chapter-${chapterId}"] .gallery-image`)
    .nth(index)
    .click();
}

async function closeLightbox(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("lightbox-selection-button")).toHaveCount(0, {
    timeout: 10_000,
  });
}

test.describe("Capitoli esclusi dalla selezione – enforcement cliente", () => {
  test.describe.configure({ mode: "serial" });

  test("modalità normale: sanificazione, contatori, lightbox e salvataggio senza foto escluse", async ({
    page,
  }) => {
    let seeded: SeededSelectionGallery | null = null;
    try {
      // Il cliente aveva già selezionato 1 foto consentita e 1 del capitolo
      // POI escluso dall'admin: quella esclusa va sanificata al load.
      seeded = await seedSelectionGallery({
        galleryFields: {
          requiredPhotoCount: 2,
          unlimitedSelection: false,
          // pre-salvataggio "sporco": include una foto del capitolo escluso
          selectedPhotoIds: [] as string[], // placeholder, sovrascritto sotto
        },
      });
      const { db } = await import("../server/firebase-admin");
      await db.collection("galleries").doc(seeded.galleryId).update({
        selectedPhotoIds: [seeded.allowedPhotoIds[0], seeded.excludedPhotoIds[0]],
      });

      await openGallery(page, seeded.galleryId);

      // Badge "non selezionabili" su card e header del capitolo escluso.
      await expect(
        page.getByTestId(`badge-chapter-excluded-${seeded.excludedChapterId}`),
      ).toBeVisible({ timeout: 30_000 });

      // Al load il riepilogo può aprirsi da solo (2/2 apparente PRIMA della
      // sanificazione): chiudilo per proseguire.
      await closeReviewModalIfOpen(page);

      // 🧹 Sanificazione: il contatore mostra 1/2 (la foto esclusa pre-salvata
      // NON conta), non 2/2.
      await expect(page.getByText("1 / 2").first()).toBeVisible({
        timeout: 20_000,
      });

      // Capitolo escluso: header badge + lightbox con badge e SENZA pulsante.
      await expandChapter(page, seeded.excludedChapterId);
      await expect(
        page.getByTestId(
          `badge-chapter-excluded-header-${seeded.excludedChapterId}`,
        ),
      ).toBeVisible();
      await openPhotoInLightbox(page, seeded.excludedChapterId, 0);
      await expect(page.getByTestId("lightbox-excluded-badge")).toBeVisible();
      await expect(page.getByTestId("lightbox-selection-button")).toHaveCount(0);
      await closeLightbox(page);

      // Seleziona la seconda foto consentita dal lightbox → 2/2.
      await expandChapter(page, seeded.allowedChapterId);
      await openPhotoInLightbox(page, seeded.allowedChapterId, 1);
      const toggleBtn = page.getByTestId("lightbox-selection-button");
      await expect(toggleBtn).toBeVisible();
      await toggleBtn.click();

      // A 2/2 il riepilogo si apre da solo: conferma direttamente da lì
      // (niente Escape: chiuderebbe modale e lightbox insieme).
      await page
        .getByTestId("button-confirm-selection-modal")
        .click({ timeout: 20_000 });

      const saved = await waitForSelectionCompleted(seeded.galleryId);
      const savedIds: string[] = saved.selectedPhotoIds || [];
      expect(savedIds.sort()).toEqual(
        [seeded.allowedPhotoIds[0], seeded.allowedPhotoIds[1]].sort(),
      );
      for (const excludedId of seeded.excludedPhotoIds) {
        expect(savedIds).not.toContain(excludedId);
      }
    } finally {
      if (seeded) await deleteSelectionGallery(seeded.galleryId);
    }
  });

  test("modalità inversa (dislike): contatori su selectablePhotos e salvataggio senza foto escluse", async ({
    page,
  }) => {
    let seeded: SeededSelectionGallery | null = null;
    try {
      seeded = await seedSelectionGallery({
        galleryFields: {
          selectionMode: "dislike",
          requiredPhotoCount: 0,
        },
      });

      await openGallery(page, seeded.galleryId);
      await expect(
        page.getByTestId(`badge-chapter-excluded-${seeded.excludedChapterId}`),
      ).toBeVisible({ timeout: 30_000 });

      // Escludi (dislike) la prima foto consentita dal lightbox. Un effect di
      // sync iniziale può azzerare lo stato subito dopo il load: riprova
      // finché l'esclusione non risulta registrata nel contatore.
      await expandChapter(page, seeded.allowedChapterId);
      await expect(async () => {
        await openPhotoInLightbox(page, seeded.allowedChapterId, 0);
        const dislikeBtn = page.getByTestId("lightbox-selection-button");
        await expect(dislikeBtn).toBeVisible({ timeout: 5_000 });
        if ((await dislikeBtn.textContent())?.includes("Escludi questa foto")) {
          await dislikeBtn.click();
        }
        await page.keyboard.press("Escape");
        // Contatore basato su selectablePhotos: 3 foto selezionabili, 1
        // esclusa → "Verranno salvate 2 foto su 3." (le 3 del capitolo
        // escluso NON entrano nel denominatore).
        await expect(
          page.getByText("Verranno salvate 2 foto su 3.").first(),
        ).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 45_000, intervals: [2_000] });

      // Lightbox su foto del capitolo escluso: badge, nessun pulsante dislike.
      await expandChapter(page, seeded.excludedChapterId);
      await openPhotoInLightbox(page, seeded.excludedChapterId, 1);
      await expect(page.getByTestId("lightbox-excluded-badge")).toBeVisible();
      await expect(page.getByTestId("lightbox-selection-button")).toHaveCount(0);
      await closeLightbox(page);

      // Conferma esclusioni → salvate solo le 2 foto consentite non escluse.
      // (in dislike la conferma è bloccata finché le foto non sono tutte
      // caricate: riprova finché non parte il salvataggio)
      await expect(async () => {
        await page.getByTestId("button-confirm-selection").click();
        await expect(
          page.getByText("Selezione confermata").first(),
        ).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000, intervals: [1_000] });

      const saved = await waitForSelectionCompleted(seeded.galleryId);
      const savedIds: string[] = saved.selectedPhotoIds || [];
      expect(savedIds.sort()).toEqual(
        [seeded.allowedPhotoIds[1], seeded.allowedPhotoIds[2]].sort(),
      );
      for (const excludedId of seeded.excludedPhotoIds) {
        expect(savedIds).not.toContain(excludedId);
      }
    } finally {
      if (seeded) await deleteSelectionGallery(seeded.galleryId);
    }
  });

  test("multi-prodotto: toggle bloccato con toast, sanificazione assegnazioni e salvataggio pulito", async ({
    page,
  }) => {
    let seeded: SeededSelectionGallery | null = null;
    try {
      seeded = await seedSelectionGallery({
        galleryFields: {
          productRequirements: [
            { prodottoNome: "Album", prodottoNumeroFoto: 1 },
            { prodottoNome: "Stampa", prodottoNumeroFoto: 1 },
          ],
        },
      });
      // Assegnazione "sporca" pre-salvata: una foto del capitolo escluso era
      // già assegnata al prodotto 0 prima dell'esclusione del capitolo.
      const { db } = await import("../server/firebase-admin");
      await db
        .collection("galleries")
        .doc(seeded.galleryId)
        .update({ photoAssignments: { [seeded.excludedPhotoIds[0]]: ["0"] } });

      await openGallery(page, seeded.galleryId);
      await expect(
        page.getByTestId(`badge-chapter-excluded-${seeded.excludedChapterId}`),
      ).toBeVisible({ timeout: 30_000 });

      // 🧹 Sanificazione: l'assegnazione pregressa alla foto esclusa sparisce
      // → il prodotto Album risulta 0/1, non 1/1.
      await expect(page.getByText("0/1").first()).toBeVisible({
        timeout: 20_000,
      });

      // Tentativo di assegnare una foto del capitolo escluso: chip presente
      // ma il toggle è bloccato con toast informativo, e il contatore resta 0/1.
      await expandChapter(page, seeded.excludedChapterId);
      await openPhotoInLightbox(page, seeded.excludedChapterId, 0);
      await page.getByTestId("lightbox-product-chip-0").click();
      await expect(
        page.getByText("Capitolo escluso dalla selezione").first(),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByTestId("lightbox-product-chip-0"),
      ).toContainText("0/1");
      await page.keyboard.press("Escape");

      // Assegna una foto consentita a ciascun prodotto.
      await expandChapter(page, seeded.allowedChapterId);
      await openPhotoInLightbox(page, seeded.allowedChapterId, 0);
      await page.getByTestId("lightbox-product-chip-0").click();
      await expect(
        page.getByTestId("lightbox-product-chip-0"),
      ).toContainText("1/1");
      await page.keyboard.press("Escape");
      await openPhotoInLightbox(page, seeded.allowedChapterId, 1);
      await page.getByTestId("lightbox-product-chip-1").click();
      await expect(
        page.getByTestId("lightbox-product-chip-1"),
      ).toContainText("1/1");

      // Con tutti i prodotti completi il riepilogo si apre da solo: conferma
      // direttamente da lì (niente Escape: chiuderebbe modale e lightbox).
      await page
        .getByTestId("button-confirm-selection-modal")
        .click({ timeout: 20_000 });

      const saved = await waitForSelectionCompleted(seeded.galleryId);
      const savedAssignments: Record<string, string[]> =
        saved.photoAssignments || {};
      expect(savedAssignments).toEqual({
        [seeded.allowedPhotoIds[0]]: ["0"],
        [seeded.allowedPhotoIds[1]]: ["1"],
      });
      const savedIds: string[] = saved.selectedPhotoIds || [];
      for (const excludedId of seeded.excludedPhotoIds) {
        expect(savedIds).not.toContain(excludedId);
        expect(savedAssignments[excludedId]).toBeUndefined();
      }
    } finally {
      if (seeded) await deleteSelectionGallery(seeded.galleryId);
    }
  });
});
