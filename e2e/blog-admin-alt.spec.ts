import { test, expect } from "@playwright/test";

const editorImageAlt = "Foto degli sposi durante il primo ballo";
const updatedEditorImageAlt = "Sposi sorridenti durante il primo ballo";
const coverImageAlt = "Copertina con gli sposi nel giardino";

test.describe("Blog Admin – testi alternativi immagini", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    test.skip(
      baseURL !== "http://localhost:5002",
      "Richiede playwright.blog.config.ts, che abilita l'harness isolato.",
    );

    // Il harness espone solo il componente reale; nessun test può arrivare
    // alle API di persistenza perché Firestore e Storage sono bloccati.
    await page.route("**/firestore.googleapis.com/**", (route) => route.abort());
    await page.route("**/firebasestorage.googleapis.com/**", (route) =>
      route.abort(),
    );
    await page.route("https://example.invalid/existing.jpg", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#d9e7df"/><circle cx="80" cy="48" r="28" fill="#789b8a"/></svg>',
        ),
      }),
    );
    await page.addInitScript(() => {
      window.localStorage.setItem("image_studio_cookie_consent", "true");
      window.localStorage.setItem(
        "image_studio_cookie_preferences",
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });
  });

  test("richiede l'alt in upload e conserva modifica, HTML e copertina", async ({
    page,
  }) => {
    await page.goto("/admin/__e2e/blog-admin-alt");
    await expect(page.getByRole("button", { name: "Nuovo Post" })).toBeVisible();
    await page.getByRole("button", { name: "Nuovo Post" }).click();

    await page.getByTestId("input-title").fill("Una storia di matrimonio");
    await page.getByTestId("input-excerpt").fill(
      "Un ricordo dal primo ballo degli sposi.",
    );

    // Copertina: il testo inserito deve arrivare all'immagine di anteprima.
    const coverUrl = "https://example.invalid/blog-cover.jpg";
    await page.getByTestId("input-cover-image").fill(coverUrl);
    await page.getByTestId("input-cover-image-alt").fill(coverImageAlt);
    await expect(page.locator(`img[src="${coverUrl}"]`)).toHaveAttribute(
      "alt",
      coverImageAlt,
    );

    // L'upload apre prima il dialog obbligatorio. Lo annulliamo dopo la
    // verifica: il test non deve creare un file in Storage.
    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator(".ql-toolbar .ql-image").click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "blog-alt-check.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(page.getByTestId("input-editor-image-alt")).toBeVisible();
    await page.getByTestId("input-editor-image-alt").fill(editorImageAlt);
    await expect(
      page.getByRole("button", { name: "Carica e inserisci" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Annulla", exact: true }).last().click();
    await expect(page.getByTestId("input-editor-image-alt")).toHaveCount(0);

    // Inserisce un'immagine già esistente dalla sorgente HTML, così la modifica
    // dell'alt viene testata senza alcun upload esterno.
    await page.getByRole("button", { name: "Sorgente HTML" }).click();
    const htmlSource = page.getByTestId("textarea-html-source");
    await htmlSource.fill(
      `<p>Il primo ballo</p><p><img src="https://example.invalid/existing.jpg" width="160" height="100"></p>`,
    );
    await page.getByRole("button", { name: "Vista Visuale" }).click();
    const editorImage = page.locator(".ql-editor img").first();
    await expect(editorImage).toBeVisible();

    // Seleziona il blot in modo deterministico: il pulsante custom legge la
    // selezione nativa di Quill e Chromium non seleziona sempre un <img> con
    // un semplice click quando la sorgente HTML contiene un'immagine esterna.
    await editorImage.evaluate((image) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNode(image);
      selection?.removeAllRanges();
      selection?.addRange(range);
      (image.closest(".ql-editor") as HTMLElement | null)?.focus();
    });
    await page.getByTestId("button-edit-image-alt").click();
    await expect(page.getByTestId("input-editor-image-alt")).toHaveValue("");
    await page.getByTestId("input-editor-image-alt").fill(updatedEditorImageAlt);
    await page.getByRole("button", { name: "Salva descrizione" }).click();
    await expect(editorImage).toHaveAttribute("alt", updatedEditorImageAlt);

    // Il valore che verrebbe sanificato e salvato mantiene l'attributo dopo
    // il passaggio visuale → sorgente HTML.
    await page.getByRole("button", { name: "Sorgente HTML" }).click();
    await expect(htmlSource).toContainText(updatedEditorImageAlt);
    await expect(htmlSource).toHaveValue(
      new RegExp(`alt=["']${updatedEditorImageAlt}["']`),
    );

    // Chiude la bozza senza chiamare il salvataggio.
    await page.getByRole("button", { name: "Annulla", exact: true }).last().click();
    await expect(page.getByRole("button", { name: "Nuovo Post" })).toBeVisible();
  });

  test("avvisa per un'immagine legacy senza alt ma salva il contenuto invariato", async ({
    page,
  }) => {
    await page.goto("/admin/__e2e/blog-admin-alt");
    await page.getByRole("button", { name: "Nuovo Post" }).click();
    await page.getByTestId("input-title").fill("Articolo legacy accessibile");
    await page.getByTestId("input-excerpt").fill(
      "Contenuto importato da una versione precedente.",
    );

    const legacyImageUrl = "https://example.invalid/legacy.jpg";
    const legacyHtml = `<p>Testo importato</p><p><img src="${legacyImageUrl}"></p>`;
    await page.getByRole("button", { name: "Sorgente HTML" }).click();
    await page.getByTestId("textarea-html-source").fill(legacyHtml);
    await page.getByRole("button", { name: "Vista Visuale" }).click();

    await page.getByTestId("button-save-post").click();
    await expect(
      page.getByText("Attenzione: immagini senza testo alternativo", {
        exact: true,
      }).first(),
    ).toBeVisible();

    const savedPayload = page.getByTestId("e2e-save-payload");
    await expect(savedPayload).not.toHaveText("");
    const payload = JSON.parse(await savedPayload.textContent() || "{}") as {
      mode: string;
      content: string;
    };
    expect(payload.mode).toBe("create");
    expect(payload.content).toContain(legacyImageUrl);
    expect(payload.content).not.toMatch(/<img[^>]*\balt\s*=/i);
    await expect(
      page.getByText("Post creato con successo", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuovo Post" })).toBeVisible();
  });

  test("in modifica conserva immagine legacy, copertina e relativi path", async ({
    page,
  }) => {
    await page.goto("/admin/__e2e/blog-admin-alt");
    const editButton = page.getByTestId("button-edit-legacy-post-for-e2e");
    await expect(editButton).toBeVisible();
    await editButton.click();

    await expect(page.getByTestId("input-title")).toHaveValue(
      "Articolo legacy da modificare",
    );
    await expect(page.getByTestId("input-cover-image")).toHaveValue(
      "https://example.invalid/legacy-cover.jpg",
    );
    await expect(page.getByTestId("input-cover-image-alt")).toHaveValue(
      "Copertina storica del matrimonio",
    );
    await page.getByTestId("input-excerpt").fill(
      "Contenuto legacy aggiornato senza perdere le risorse esistenti.",
    );

    await page.getByTestId("button-save-post").click();
    await expect(
      page.getByText("Attenzione: immagini senza testo alternativo", {
        exact: true,
      }).first(),
    ).toBeVisible();

    const savedPayload = page.getByTestId("e2e-save-payload");
    await expect(savedPayload).not.toHaveText("");
    const payload = JSON.parse(await savedPayload.textContent() || "{}") as {
      mode: string;
      content: string;
      coverImage?: string;
      coverImageAlt?: string;
      coverImagePath?: string;
      contentImagePaths: string[];
    };
    expect(payload.mode).toBe("update");
    expect(payload.content).toContain(
      "https://example.invalid/blog-content-images/legacy-post-for-e2e/content.jpg",
    );
    expect(payload.content).not.toMatch(/<img[^>]*\balt\s*=/i);
    expect(payload.coverImage).toBe(
      "https://example.invalid/legacy-cover.jpg",
    );
    expect(payload.coverImageAlt).toBe("Copertina storica del matrimonio");
    expect(payload.coverImagePath).toBe(
      "blog-covers/legacy-post-for-e2e/cover.jpg",
    );
    expect(payload.contentImagePaths).toEqual([
      "blog-content-images/legacy-post-for-e2e/content.jpg",
    ]);
    await expect(
      page.getByText("Post aggiornato con successo", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuovo Post" })).toBeVisible();
  });

  test("annullare una modifica legacy non pulisce le risorse esistenti", async ({
    page,
  }) => {
    let storageRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("firebasestorage.googleapis.com")) {
        storageRequests += 1;
      }
    });

    await page.goto("/admin/__e2e/blog-admin-alt");
    const editButton = page.getByTestId("button-edit-legacy-post-for-e2e");
    await expect(editButton).toBeVisible();
    await editButton.click();
    await expect(page.getByTestId("input-title")).toHaveValue(
      "Articolo legacy da modificare",
    );
    await expect(page.getByTestId("input-cover-image")).toHaveValue(
      "https://example.invalid/legacy-cover.jpg",
    );

    await page.getByRole("button", { name: "Annulla", exact: true }).last().click();
    await expect(page.getByRole("button", { name: "Nuovo Post" })).toBeVisible();
    await expect(editButton).toBeVisible();
    await expect(page.getByTestId("e2e-save-payload")).toHaveText("");
    expect(storageRequests).toBe(0);
  });
});