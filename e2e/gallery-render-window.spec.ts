import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  seedLargeGallery,
  deleteLargeGallery,
} from "./fixtures/large-gallery";

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
 * Indipendenza dai dati reali:
 * Il test NON usa un totale hardcoded. Il "totale atteso" viene letto a runtime
 * dal denominatore del contatore della lightbox ("N / TOTALE"), che è la fonte di
 * verità interna del componente (l'elenco completo `displayPhotos`). Così, se la
 * galleria di test viene modificata nel DB (foto aggiunte/rimosse), il test
 * continua a verificare l'invariante reale del bug — la masonry deve raggiungere
 * lo stesso totale che la lightbox conosce — senza rompersi per un numero fisso.
 *
 * Nota: `displayPhotos` cresce nel tempo (la paginazione `useInfiniteQuery`
 * scarica le pagine restanti in background), quindi il totale è noto con
 * certezza solo quando il caricamento si è stabilizzato. Per questo il test
 * alterna scroll (avanza la finestra di rendering) e ri-lettura del totale,
 * finché la masonry raggiunge il totale che la lightbox conosce.
 *
 * Per restare una guardia significativa serve comunque una galleria "grande":
 * `MIN_PHOTOS` (default 100) è la soglia minima sotto la quale la finestra di
 * rendering progressiva non è esercitata; se la galleria non la raggiunge il
 * test fallisce con un messaggio esplicito (dati di test non più adeguati),
 * invece di passare in modo ingannevole.
 *
 * Autonomia dei dati (CI):
 * Di default il test NON dipende più da una galleria reale preesistente: nel
 * `beforeAll` crea via Firebase Admin SDK una galleria fixture seedata con
 * `SEED_PHOTOS` foto fittizie (solo metadati Firestore; gli URL sono finti
 * perché il test aborta comunque il download delle immagini) e la elimina nel
 * `afterAll` riusando il cascade-delete server-side (`deleteLargeGallery`).
 * In alternativa, impostando `E2E_GALLERY_ID` si punta a una galleria esistente
 * (senza capitoli, senza password) e il seed/teardown viene saltato — utile per
 * debug manuale su dati reali.
 *
 * Prerequisiti del seed: `FIREBASE_ADMIN_CREDENTIALS` configurato (lo stesso
 * usato dal dev server). Eseguire il test nello stesso ambiente del workflow.
 *
 * Esecuzione: `npx playwright test e2e/gallery-render-window.spec.ts`
 * (nessuno script npm; il dev server sulla porta 5000 viene riusato).
 * Override: `E2E_GALLERY_ID` (galleria esistente, salta il seed),
 * `E2E_MIN_PHOTOS` (soglia minima), `E2E_SEED_PHOTOS` (quante foto seedare).
 */
const EXISTING_GALLERY_ID = process.env.E2E_GALLERY_ID || "";
// Soglia minima di foto perché il test sia una guardia valida del bug: sotto
// questo numero la finestra di rendering progressiva non viene esercitata.
const MIN_PHOTOS = Number(process.env.E2E_MIN_PHOTOS || "100");
// Quante foto seedare nella galleria fixture (deve superare MIN_PHOTOS perché
// la finestra di rendering progressiva venga effettivamente esercitata).
const SEED_PHOTOS = Number(process.env.E2E_SEED_PHOTOS || "150");
// Tolleranza minima: il conteggio finale è esatto, ma lasciamo margine per
// eventuali differenze di dedup/timing.
const COUNT_TOLERANCE = 3;

// Id della galleria sotto test, risolto in beforeAll: o quella esistente
// (E2E_GALLERY_ID) o quella fixture appena seedata.
let galleryId = "";
// Vero se abbiamo seedato noi la galleria (→ va eliminata nel teardown).
let seededByTest = false;

/** Legge il contatore della lightbox aperta ("N / TOTALE"). */
async function readLightboxCounter(page: Page) {
  const counter = page.getByText(/^\d+ \/ \d+$/).first();
  await counter.waitFor({ state: "visible", timeout: 15_000 });
  const text = ((await counter.textContent()) || "").trim();
  const [currentStr, totalStr] = text.split("/").map((s) => s.trim());
  return {
    current: parseInt(currentStr, 10),
    total: parseInt(totalStr, 10),
    text,
  };
}

/**
 * Scrolla in fondo ripetutamente finché il numero di card montate si stabilizza
 * o raggiunge `target`. Restituisce il conteggio finale di .gallery-image.
 */
async function scrollUntilStable(page: Page, target: number): Promise<number> {
  return await page.evaluate(async (goal: number) => {
    return await new Promise<number>((resolve) => {
      let last = -1;
      let stable = 0;
      let i = 0;
      const step = () => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        setTimeout(() => {
          const n = document.querySelectorAll(".gallery-image").length;
          i += 1;
          if (n >= goal || i >= 80) return resolve(n);
          if (n === last) {
            stable += 1;
            if (stable >= 12) return resolve(n); // finestra ferma: esci
          } else {
            stable = 0;
            last = n;
          }
          step();
        }, 600);
      };
      step();
    });
  }, target);
}

test.describe("Galleria pubblica – finestra di rendering (gallerie grandi)", () => {
  test.beforeAll(async () => {
    if (EXISTING_GALLERY_ID) {
      // Modalità debug: usa una galleria reale preesistente, niente seed.
      galleryId = EXISTING_GALLERY_ID;
      seededByTest = false;
      return;
    }
    // Modalità autonoma (default): crea una galleria fixture seedata.
    const seeded = await seedLargeGallery(SEED_PHOTOS);
    galleryId = seeded.galleryId;
    seededByTest = true;
  });

  test.afterAll(async () => {
    // Cascade-delete della fixture: niente dati orfani. Solo se l'abbiamo
    // creata noi (mai cancellare una galleria reale passata via env).
    if (seededByTest && galleryId) {
      await deleteLargeGallery(galleryId);
    }
  });

  test.beforeEach(async ({ context }) => {
    // Bypass del gate d'accesso: il componente Gallery controlla
    // localStorage['gallery_auth_<id>']; se manca (e non sei admin) reindirizza
    // a /access/<id>, che non è una route registrata -> 404 globale.
    await context.addInitScript((id) => {
      window.localStorage.setItem(`gallery_auth_${id}`, "true");
    }, galleryId);
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

    await page.goto(`/view/${galleryId}`);

    // Il gate non deve aver fatto scattare la 404.
    await expect(page.getByText("Pagina non trovata")).toHaveCount(0);

    // La griglia si monta.
    await page
      .locator(".gallery-image")
      .first()
      .waitFor({ state: "attached", timeout: 30_000 });

    // All'inizio la finestra è parziale.
    const initialCount = await page.locator(".gallery-image").count();
    expect(initialCount).toBeGreaterThan(0);

    // Convergenza: la masonry deve raggiungere il totale che la lightbox
    // conosce. Poiché `displayPhotos` cresce in background, alterniamo
    // scroll (avanza la finestra) e ri-lettura del totale finché le due
    // grandezze coincidono o esauriamo i tentativi.
    let expectedTotal = 0;
    let finalCount = 0;
    for (let round = 0; round < 5; round += 1) {
      finalCount = await scrollUntilStable(page, Number.MAX_SAFE_INTEGER);

      // Leggi il totale dal denominatore della lightbox (fonte di verità:
      // l'elenco completo `displayPhotos`). Apriamo l'ultima card montata.
      const cards = page.locator(".gallery-image");
      const cardCount = await cards.count();
      await cards.nth(cardCount - 1).click();
      ({ total: expectedTotal } = await readLightboxCounter(page));
      await page.keyboard.press("Escape");
      await page
        .locator(".gallery-image")
        .first()
        .waitFor({ state: "attached", timeout: 15_000 });

      if (finalCount >= expectedTotal - COUNT_TOLERANCE) break;
      // Sono arrivate altre pagine in background: continua a scrollare per
      // montarle.
    }

    // La galleria di test deve essere "grande": altrimenti il test non esercita
    // la finestra di rendering e non è una guardia valida del bug.
    expect(
      expectedTotal,
      `La galleria ${galleryId} ha solo ${expectedTotal} foto (< ${MIN_PHOTOS}). ` +
        "Il test richiede una galleria grande: aumenta E2E_SEED_PHOTOS o, se usi " +
        "E2E_GALLERY_ID, punta a una galleria più grande.",
    ).toBeGreaterThanOrEqual(MIN_PHOTOS);

    // La finestra iniziale era molto meno del totale (partiva parziale).
    expect(initialCount).toBeLessThan(expectedTotal);

    // CONTROLLO PRINCIPALE: la finestra non si blocca, si arriva al totale che
    // la lightbox conosce.
    expect(finalCount).toBeGreaterThanOrEqual(expectedTotal - COUNT_TOLERANCE);

    // Lightbox: apri una foto "profonda" (l'ultima card nel DOM).
    const cards = page.locator(".gallery-image");
    const cardCount = await cards.count();
    await cards.nth(cardCount - 1).click();

    const {
      current: startIndex,
      total: lightboxTotal,
      text: counterText,
    } = await readLightboxCounter(page);
    // Il denominatore resta coerente con quello su cui abbiamo fatto convergere.
    expect(lightboxTotal).toBe(expectedTotal);
    // Abbiamo aperto una card profonda: il denominatore conosce tutte le foto e
    // l'indice di partenza è alto (le foto profonde sono navigabili).
    expect(startIndex).toBeGreaterThan(expectedTotal - 12);

    // Naviga indietro: il contatore deve cambiare (navigazione funzionante).
    const prevBtn = page
      .locator('button[aria-label="Foto precedente"]:visible')
      .first();
    for (let k = 0; k < 3; k += 1) {
      await prevBtn.click();
      await page.waitForTimeout(300);
    }
    const counter = page.getByText(/^\d+ \/ \d+$/).first();
    const afterText = ((await counter.textContent()) || "").trim();
    expect(afterText).not.toBe(counterText);
  });
});
