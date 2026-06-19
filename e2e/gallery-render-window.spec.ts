import { test, expect } from "@playwright/test";

/**
 * Regressione: la galleria pubblica /view/:id con CENTINAIA di foto deve
 * renderizzare TUTTE le foto man mano che si scrolla (finestra di rendering
 * progressiva), senza bloccarsi intorno a ~100; e la lightbox deve poter
 * navigare anche le foto "profonde".
 *
 * Bug storico (causa radice): `GalleryFilter` chiama `onFilterChange` dentro un
 * useEffect che ha `onFilterChange` tra le dipendenze. In Gallery la callback
 * `handleFilterChange` era ricreata ad ogni render (nuova identità), quindi
 * quell'effetto si ri-eseguiva continuamente chiamando `setVisiblePhotoLimit(60)`
 * e resettando la finestra di rendering. Risultato: la griglia masonry oscillava
 * e restava bloccata intorno a ~60 foto, mentre la lightbox (che usa l'elenco
 * completo `displayPhotos`) mostrava tutte le foto. Il fix stabilizza
 * `handleFilterChange`/`resetFilters` con useCallback, così la finestra avanza in
 * modo monotòno fino a coprire tutte le foto.
 *
 * Galleria di test (dev DB Firebase wedding-gallery-397b6):
 * docId "wQPRH6Eunpv34slSGwUV" — 855 foto (723 paginate + ~132 da
 * riconciliazione), SENZA capitoli, SENZA password (la finestra di rendering è
 * attiva solo nella vista standard del fotografo, senza capitoli).
 *
 * Override possibili via env: E2E_GALLERY_ID, E2E_EXPECTED_TOTAL.
 */
const GALLERY_ID = process.env.E2E_GALLERY_ID || "wQPRH6Eunpv34slSGwUV";
const EXPECTED_TOTAL = Number(process.env.E2E_EXPECTED_TOTAL || "855");
// Tolleranza minima: il conteggio finale è esatto, ma lasciamo margine per
// eventuali differenze di dedup/timing.
const COUNT_TOLERANCE = 3;

test.describe("Galleria pubblica – finestra di rendering (gallerie grandi)", () => {
  test.beforeEach(async ({ context }) => {
    // Bypass del gate d'accesso: il componente Gallery controlla
    // localStorage['gallery_auth_<id>']; se manca (e non sei admin) reindirizza
    // a /access/<id>, che non è una route registrata -> 404 globale.
    await context.addInitScript((id) => {
      window.localStorage.setItem(`gallery_auth_${id}`, "true");
    }, GALLERY_ID);
  });

  test("mostra tutte le foto scrollando e la lightbox le naviga", async ({
    page,
  }) => {
    // Le immagini reali non servono per contare le card (il <div.gallery-image>
    // è montato a prescindere dal caricamento dell'immagine): le abortiamo per
    // velocità e per non scaricare centinaia di foto.
    await page.route("**/*", (route) =>
      route.request().resourceType() === "image"
        ? route.abort()
        : route.continue(),
    );

    await page.goto(`/view/${GALLERY_ID}`);

    // Il gate non deve aver fatto scattare la 404.
    await expect(page.getByText("Pagina non trovata")).toHaveCount(0);

    // La griglia si monta.
    await page
      .locator(".gallery-image")
      .first()
      .waitFor({ state: "attached", timeout: 30_000 });

    // All'inizio la finestra è parziale (molto meno del totale).
    const initialCount = await page.locator(".gallery-image").count();
    expect(initialCount).toBeGreaterThan(0);
    expect(initialCount).toBeLessThan(EXPECTED_TOTAL);

    // Scrolla fino in fondo ripetutamente finché il conteggio si stabilizza.
    const finalCount: number = await page.evaluate(async (target: number) => {
      return await new Promise<number>((resolve) => {
        let last = -1;
        let stable = 0;
        let i = 0;
        const step = () => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          setTimeout(() => {
            const n = document.querySelectorAll(".gallery-image").length;
            i += 1;
            if (n >= target || i >= 80) return resolve(n);
            if (n === last) {
              stable += 1;
              if (stable >= 12) return resolve(n); // bloccata: esci
            } else {
              stable = 0;
              last = n;
            }
            step();
          }, 600);
        };
        step();
      });
    }, EXPECTED_TOTAL);

    // CONTROLLO PRINCIPALE: la finestra non si blocca, si arriva al totale.
    expect(finalCount).toBeGreaterThanOrEqual(EXPECTED_TOTAL - COUNT_TOLERANCE);

    // Lightbox: apri una foto "profonda" (l'ultima card nel DOM).
    const cards = page.locator(".gallery-image");
    const cardCount = await cards.count();
    await cards.nth(cardCount - 1).click();

    // Il contatore della lightbox ha formato "N / TOTALE".
    const counter = page
      .getByText(new RegExp(`^\\d+ / ${EXPECTED_TOTAL}$`))
      .first();
    await counter.waitFor({ state: "visible", timeout: 15_000 });

    const counterText = ((await counter.textContent()) || "").trim();
    const startIndex = parseInt(counterText.split("/")[0].trim(), 10);
    // Abbiamo aperto una card profonda: il denominatore conosce tutte le foto e
    // l'indice di partenza è alto (le foto profonde sono navigabili).
    expect(startIndex).toBeGreaterThan(EXPECTED_TOTAL - 12);

    // Naviga indietro: il contatore deve cambiare (navigazione funzionante).
    const prevBtn = page
      .locator('button[aria-label="Foto precedente"]:visible')
      .first();
    for (let k = 0; k < 3; k += 1) {
      await prevBtn.click();
      await page.waitForTimeout(300);
    }
    const afterText = ((await counter.textContent()) || "").trim();
    expect(afterText).not.toBe(counterText);
  });
});
