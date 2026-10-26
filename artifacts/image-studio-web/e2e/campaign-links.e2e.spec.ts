import { expect, test } from "@playwright/test";

const appOrigin = `http://127.0.0.1:${process.env.CAMPAIGN_LINKS_E2E_PORT || "4182"}`;
const projectId = "wedding-gallery-397b6";
const authEmulator = "http://127.0.0.1:9099";
const firestoreEmulator = "http://127.0.0.1:8089";
const adminEmail = "gennaro.mazzacane@gmail.com";
const adminPassword = "campaign-links-e2e-password";
const newCampaignCode = "E2E724A";
const legacyCampaignCode = "LEGACY72";
const legacyCampaignId = "random-legacy-campaign-id";
const invalidCampaignCode = "BADDATE7";
const invalidCampaignId = "random-invalid-campaign-id";

type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } };

function requireLoopback(raw: string, label: string): void {
  const hostname = new URL(raw).hostname.replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(`${label} must use a loopback host; refusing non-local access`);
  }
}

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  throw new Error(`Unsupported Firestore fixture value: ${String(value)}`);
}

function documentUrl(path: string): string {
  return `${firestoreEmulator}/v1/projects/${projectId}/databases/(default)/documents/${path}`;
}

async function createEmulatorAdmin(): Promise<string> {
  requireLoopback(authEmulator, "Auth emulator");
  const response = await fetch(
    `${authEmulator}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        returnSecureToken: true,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Auth emulator setup failed: ${response.status} ${await response.text()}`);
  }
  const payload = (await response.json()) as { idToken: string };
  return payload.idToken;
}

async function seedCampaign(
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  requireLoopback(firestoreEmulator, "Firestore emulator");
  const response = await fetch(documentUrl(`booking_campaigns/${id}`), {
    method: "PATCH",
    headers: {
      // Firestore Emulator accepts this test-only token to bypass rules for fixtures.
      Authorization: "Bearer owner",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]),
      ),
    }),
  });
  if (!response.ok) {
    throw new Error(`Firestore fixture setup failed: ${response.status} ${await response.text()}`);
  }
}

async function readCampaign(id: string): Promise<Record<string, unknown>> {
  const response = await fetch(documentUrl(`booking_campaigns/${id}`), {
    headers: { Authorization: "Bearer owner" },
  });
  if (!response.ok) {
    throw new Error(`Could not read campaign fixture: ${response.status} ${await response.text()}`);
  }
  const document = (await response.json()) as {
    fields?: Record<string, FirestoreValue>;
  };
  return Object.fromEntries(
    Object.entries(document.fields ?? {}).map(([key, value]) => [
      key,
      "stringValue" in value
        ? value.stringValue
        : "timestampValue" in value
          ? value.timestampValue
          : "booleanValue" in value
            ? value.booleanValue
            : "integerValue" in value
              ? Number(value.integerValue)
              : "nullValue" in value
                ? null
                : value.arrayValue?.values ?? [],
    ]),
  );
}

test("crea, apre e modifica campagne nuove e mantiene i link legacy; mostra errori data", async ({
  page,
  context,
}) => {
  const allowedOrigins = new Set([
    appOrigin,
    authEmulator,
    firestoreEmulator,
  ]);
  await context.route("**/*", async route => {
    if (!allowedOrigins.has(new URL(route.request().url()).origin)) {
      await route.abort();
      return;
    }
    await route.continue();
  });

  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 7);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 20);
  const dateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  await createEmulatorAdmin();
  await seedCampaign(legacyCampaignId, {
    nome: "Campagna storica E2E",
    code: legacyCampaignCode,
    descrizione: "Campagna legacy con ID casuale",
    dataInizio: startDate,
    dataFine: endDate,
    orarioApertura: "09:00",
    orarioPausaInizio: "13:00",
    orarioPausaFine: "14:00",
    orarioChiusura: "19:00",
    durataShootingMinuti: 60,
    prodottiDisponibili: [],
    attiva: true,
  });
  await seedCampaign(invalidCampaignId, {
    nome: "Campagna con date corrotte E2E",
    code: invalidCampaignCode,
    dataInizio: "questa-non-e-una-data",
    dataFine: endDate,
    orarioApertura: "09:00",
    orarioPausaInizio: "13:00",
    orarioPausaFine: "14:00",
    orarioChiusura: "19:00",
    durataShootingMinuti: 60,
    prodottiDisponibili: [],
    attiva: true,
  });

  await page.goto("/admin/campaigns");
  await expect(page.getByRole("heading", { name: "Campagne Booking" })).toBeVisible();

  await page.getByTestId("button-new-campaign").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("input-campaign-name").fill("Campagna nuova E2E");
  await dialog.getByTestId("input-campaign-code").fill(newCampaignCode);
  await dialog.getByTestId("input-campaign-start-date").fill(dateForInput(startDate));
  await dialog.getByTestId("input-campaign-end-date").fill(dateForInput(endDate));
  await dialog.getByTestId("button-save-campaign").click();

  const editButton = page.getByTestId(`button-edit-${newCampaignCode}`);
  await expect(editButton).toBeVisible();
  const createdCampaign = await readCampaign(newCampaignCode);
  expect(createdCampaign.code).toBe(newCampaignCode);
  expect(createdCampaign.nome).toBe("Campagna nuova E2E");

  const publicPagePromise = context.waitForEvent("page");
  await page.getByTestId(`button-open-url-${newCampaignCode}`).click();
  const publicPage = await publicPagePromise;
  await expect(publicPage).toHaveURL(new RegExp(`/prenota/${newCampaignCode}$`));
  await expect(publicPage.getByRole("heading", { name: "Campagna nuova E2E" })).toBeVisible();

  await editButton.click();
  const editDialog = page.getByRole("dialog");
  await editDialog.getByTestId("input-campaign-name").fill("Campagna nuova E2E modificata");
  await editDialog.getByTestId("button-save-campaign").click();
  await expect(page.getByTestId(`button-edit-${newCampaignCode}`)).toBeVisible();
  await expect.poll(async () => (await readCampaign(newCampaignCode)).nome).toBe(
    "Campagna nuova E2E modificata",
  );
  await publicPage.reload();
  await expect(
    publicPage.getByRole("heading", { name: "Campagna nuova E2E modificata" }),
  ).toBeVisible();

  await publicPage.goto(`/prenota/${legacyCampaignCode}`);
  await expect(publicPage.getByRole("heading", { name: "Campagna storica E2E" })).toBeVisible();
  expect((await readCampaign(legacyCampaignId)).code).toBe(legacyCampaignCode);

  await publicPage.goto(`/prenota/${invalidCampaignCode}`);
  await expect(publicPage.getByText("Campagna non trovata", { exact: true })).toBeVisible();
  await expect(publicPage.getByRole("button", { name: "Torna alla homepage" })).toBeVisible();
});
