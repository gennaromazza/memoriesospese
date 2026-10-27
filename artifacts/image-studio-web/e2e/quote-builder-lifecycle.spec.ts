import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const projectId = "wedding-gallery-397b6";
const authEmulator = "http://127.0.0.1:9099";
const firestoreEmulator = "http://127.0.0.1:8089";
const adminEmail = "gennaro.mazzacane@gmail.com";
const quoteId = "e2e-quote-lifecycle";
const localOrigin = `http://127.0.0.1:${process.env.QUOTE_BUILDER_LIFECYCLE_E2E_PORT ?? "4185"}`;
const harnessPath = "/admin/__e2e/quote-builder-lifecycle";
const firestoreDocumentsUrl =
  `${firestoreEmulator}/v1/projects/${projectId}/databases/(default)/documents`;

function firestoreValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .filter(([, child]) => child !== undefined)
            .map(([key, child]) => [key, firestoreValue(child)]),
        ),
      },
    };
  }
  throw new Error(`Unsupported Firestore fixture value: ${typeof value}`);
}

async function writeFirestoreDocument(
  idToken: string,
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${firestoreDocumentsUrl}/${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]),
      ),
    }),
  });
  if (!response.ok) {
    throw new Error(`Could not seed local Firestore fixture ${path}: ${response.status} ${await response.text()}`);
  }
}

async function createAuthenticatedAdmin(): Promise<{ password: string; idToken: string }> {
  const password = `E2E-${randomBytes(18).toString("hex")}!`;
  const response = await fetch(
    `${authEmulator}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=quote-builder-lifecycle-e2e`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password, returnSecureToken: true }),
    },
  );
  if (!response.ok) {
    throw new Error(`Could not create the local admin account: ${response.status} ${await response.text()}`);
  }
  const { idToken } = (await response.json()) as { idToken: string };
  return { password, idToken };
}

async function resetEmulatorsAndSeedQuote(): Promise<{ password: string; idToken: string }> {
  const [authReset, firestoreReset] = await Promise.all([
    fetch(`${authEmulator}/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" }),
    fetch(
      `${firestoreEmulator}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
      { method: "DELETE" },
    ),
  ]);
  if (!authReset.ok || !firestoreReset.ok) {
    throw new Error(`Could not reset local emulators (Auth ${authReset.status}, Firestore ${firestoreReset.status})`);
  }

  const session = await createAuthenticatedAdmin();
  const timestamp = new Date("2026-10-01T12:00:00.000Z");
  await Promise.all([
    writeFirestoreDocument(session.idToken, `quotes/${quoteId}`, {
      jobId: "e2e-quote-lifecycle-job",
      clienteId: "e2e-quote-lifecycle-client",
      type: "fisso",
      products: [{
        customProductId: "e2e-quote-lifecycle-product",
        nome: "Servizio fotografico",
        descrizione: "Servizio completo",
        prezzo: 1200,
        selectable: false,
        numeroFoto: 0,
        categoria: "",
        sezione: "Servizi",
        immagini: [],
        isOmaggio: false,
      }],
      theme: { primaryColor: "#6b7f6b", secondaryColor: "#d6dfd6" },
      paymentScheduleConfig: {
        autoGenerate: false,
        numberOfPayments: 2,
        accontoType: "percentage",
        accontoPercentage: 30,
        accontoAmount: 0,
        useEventDateReference: true,
        accontoRelativeDays: -30,
        rateIntervalDays: 30,
      },
      discountValue: 0,
      noteInterne: "Nota iniziale",
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    ...[
      {
        id: "e2e-clause-default",
        titolo: "Clausole predefinite",
        predefinito: true,
        clauses: [{ id: "default-clause", text: "Clausola predefinita", required: true, ordine: 1 }],
      },
      {
        id: "e2e-clause-manual",
        titolo: "Clausole scelte manualmente",
        predefinito: false,
        clauses: [{ id: "manual-clause", text: "Clausola scelta manualmente", required: true, ordine: 1 }],
      },
    ].map(({ id, ...template }) =>
      writeFirestoreDocument(session.idToken, `contractClauses/${id}`, {
        ...template,
        jobType: "matrimonio",
        attivo: true,
        createdBy: "e2e",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ),
  ]);
  return session;
}

async function isolateBrowser(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin === localOrigin) {
      if (url.pathname === "/api/admin/security/status") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ enabled: false, required: false }),
        });
        return;
      }
      await route.continue();
      return;
    }

    if (url.origin === authEmulator || url.origin === firestoreEmulator) {
      await route.continue();
      return;
    }

    await route.abort();
  });
}

async function signInAndOpenHarness(page: Page): Promise<void> {
  const { password } = await resetEmulatorsAndSeedQuote();
  await isolateBrowser(page);
  await page.goto("/admin");
  const cookieButton = page.getByRole("button", { name: "Solo Necessari" });
  if (await cookieButton.isVisible().catch(() => false)) await cookieButton.click();
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard(?:$|[?#])/);
  await page.goto(harnessPath);
  await expect(page.getByTestId("quote-builder-auth-state")).toHaveAttribute("data-authenticated", "true");
  await expect(page.getByTestId("quote-builder-auth-state")).toHaveAttribute("data-user-id", /.+/);
  await expect(page.getByRole("dialog", { name: "Modifica Preventivo" })).toBeVisible();
  await expect(page.getByTestId("textarea-notes")).toHaveValue("Nota iniziale");
}

test("un preventivo popolato ma invariato si chiude senza avviso", async ({ page }) => {
  await signInAndOpenHarness(page);
  let confirmCount = 0;
  page.on("dialog", async (dialog) => {
    confirmCount += 1;
    await dialog.dismiss();
  });

  await page.getByTestId("button-cancel").click();
  await expect(page.getByRole("dialog", { name: "Modifica Preventivo" })).toBeHidden();
  expect(confirmCount).toBe(0);

  await page.getByTestId("reopen-quote-builder").click();
  await expect(page.getByRole("dialog", { name: "Modifica Preventivo" })).toBeVisible();
  await expect(page.getByTestId("textarea-notes")).toHaveValue("Nota iniziale");
});

test("le modifiche restano dopo refetch e riapertura, e la clausola scelta resiste al refresh", async ({ page }) => {
  await signInAndOpenHarness(page);

  const clauseSelect = page.getByTestId("select-clause-template-trigger");
  await clauseSelect.click();
  await page.getByRole("option", { name: /Clausole scelte manualmente/ }).click();
  await expect(clauseSelect).toContainText("Clausole scelte manualmente");

  await page.getByTestId("textarea-notes").fill("Nota modificata dall'utente");
  await page.evaluate(() => window.dispatchEvent(new Event("e2e:refresh-quote-queries")));
  await expect(page.getByTestId("quote-builder-refetch-state")).toHaveAttribute("data-state", "complete");
  await expect(page.getByTestId("textarea-notes")).toHaveValue("Nota modificata dall'utente");
  await expect(clauseSelect).toContainText("Clausole scelte manualmente");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("modifiche non salvate");
    await dialog.dismiss();
  });
  await page.getByTestId("button-cancel").click();
  await expect(page.getByRole("dialog", { name: "Modifica Preventivo" })).toBeVisible();
  await expect(page.getByTestId("textarea-notes")).toHaveValue("Nota modificata dall'utente");

  await page.evaluate(() => window.dispatchEvent(new Event("e2e:close-quote-builder")));
  await expect(page.getByRole("dialog", { name: "Modifica Preventivo" })).toBeHidden();

  await page.getByTestId("reopen-quote-builder").click();
  await expect(page.getByRole("dialog", { name: "Modifica Preventivo" })).toBeVisible();
  await expect(page.getByTestId("textarea-notes")).toHaveValue("Nota modificata dall'utente");
  await expect(clauseSelect).toContainText("Clausole scelte manualmente");
});
