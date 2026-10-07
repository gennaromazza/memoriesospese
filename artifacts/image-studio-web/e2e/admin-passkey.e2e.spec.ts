import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";

const adminEmail = "gennaro.mazzacane@gmail.com";
const projectId = "wedding-gallery-397b6";
const authEmulator = process.env.ADMIN_PASSKEY_E2E_AUTH_EMULATOR ?? "http://127.0.0.1:9099";
const firestoreEmulator =
  process.env.ADMIN_PASSKEY_E2E_FIRESTORE_EMULATOR ?? "http://127.0.0.1:8089";
const baseURL = process.env.ADMIN_PASSKEY_E2E_BASE_URL ?? "http://localhost:4179";

function localUrl(path: string): string {
  return new URL(path, baseURL).toString();
}

function requireLoopbackEndpoint(raw: string, name: string): void {
  const hostname = new URL(raw).hostname.replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(`${name} must use a loopback host; refusing to touch non-local services`);
  }
}

async function resetDisposableEmulators(): Promise<void> {
  const [authResponse, firestoreResponse] = await Promise.all([
    fetch(`${authEmulator}/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" }),
    fetch(
      `${firestoreEmulator}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
      { method: "DELETE" },
    ),
  ]);
  if (!authResponse.ok || !firestoreResponse.ok) {
    throw new Error(
      `Could not reset local emulators (Auth ${authResponse.status}, Firestore ${firestoreResponse.status})`,
    );
  }
}

async function seedDisposableUser(
  email: string,
  password: string,
): Promise<string> {
  const response = await fetch(
    `${authEmulator}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=passkey-e2e`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      `Auth emulator account setup failed: ${body.error?.message ?? response.status}`,
    );
  }
  return ((await response.json()) as { idToken: string }).idToken;
}

async function seedDisposableAdmin(password: string): Promise<string> {
  return seedDisposableUser(adminEmail, password);
}

async function signInInBrowser(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.evaluate(async ({ email, password }) => {
    const helperUrl = new URL("/e2e/admin-auth-helper.ts", window.location.origin).href;
    const helper = await import(/* @vite-ignore */ helperUrl);
    await helper.signInWithEmulatorUser(email, password);
  }, { email, password });
}

type FirestoreRestValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values: FirestoreRestValue[] } }
  | { mapValue: { fields: Record<string, FirestoreRestValue> } };

function toFirestoreRestValue(value: unknown): FirestoreRestValue {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreRestValue) } };
  }
  if (typeof value === "object") {
    const fields = Object.fromEntries(
      Object.entries(value)
        .filter(([, fieldValue]) => fieldValue !== undefined)
        .map(([key, fieldValue]) => [key, toFirestoreRestValue(fieldValue)]),
    );
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

test("signed-in non-admin cannot open the dashboard URL directly", async () => {
  test.setTimeout(60_000);
  requireLoopbackEndpoint(baseURL, "ADMIN_PASSKEY_E2E_BASE_URL");
  requireLoopbackEndpoint(authEmulator, "ADMIN_PASSKEY_E2E_AUTH_EMULATOR");
  requireLoopbackEndpoint(firestoreEmulator, "ADMIN_PASSKEY_E2E_FIRESTORE_EMULATOR");
  await resetDisposableEmulators();

  const email = `non-admin-${randomBytes(12).toString("hex")}@example.invalid`;
  const password = `Test-${randomBytes(18).toString("hex")}!`;
  await seedDisposableUser(email, password);

  const systemChromiumPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/repl/tools/bin/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(systemChromiumPath) ? { executablePath: systemChromiumPath } : {}),
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  await context.route("**/*", async (route) => {
    const { hostname } = new URL(route.request().url());
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });

  try {
    const page = await context.newPage();
    const dashboardRequests: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith("/api/admin/") || pathname === "/api/jobs") {
        dashboardRequests.push(pathname);
      }
    });

    await page.goto(localUrl("/"));
    await page.evaluate(() => localStorage.setItem("isAdmin", "true"));
    await signInInBrowser(page, email, password);
    await page.goto(localUrl("/admin/dashboard"));

    await expect(page).toHaveURL(/\/admin(?:$|[?#])/);
    await expect(page.getByRole("heading", { name: "Accesso Admin" })).toBeVisible();
    await expect(page.getByTestId("card-jobs-events")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("isAdmin"))).toBeNull();
    expect(dashboardRequests).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});

async function seedFirestoreDocument(
  idToken: string,
  documentPath: string,
  data: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(
    `${firestoreEmulator}/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(data).map(([key, value]) => [
            key,
            toFirestoreRestValue(value),
          ]),
        ),
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Firestore emulator fixture setup failed for ${documentPath}: ${response.status} ${await response.text()}`,
    );
  }
}

async function addVirtualAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
  return { cdp, authenticatorId };
}

async function signIn(page: Page, password: string): Promise<void> {
  await page.goto(localUrl("/admin"));
  const necessaryCookies = page.getByRole("button", { name: "Solo Necessari" });
  if (await necessaryCookies.isVisible().catch(() => false)) {
    await necessaryCookies.click();
  }
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard(?:$|[?#])/);
}

test("account dashboard link opens the passkey guard on desktop and mobile", async () => {
  test.setTimeout(120_000);
  requireLoopbackEndpoint(baseURL, "ADMIN_PASSKEY_E2E_BASE_URL");
  requireLoopbackEndpoint(authEmulator, "ADMIN_PASSKEY_E2E_AUTH_EMULATOR");
  requireLoopbackEndpoint(firestoreEmulator, "ADMIN_PASSKEY_E2E_FIRESTORE_EMULATOR");
  await resetDisposableEmulators();

  const password = `Test-${randomBytes(18).toString("hex")}!`;
  await seedDisposableAdmin(password);

  const systemChromiumPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/repl/tools/bin/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(systemChromiumPath) ? { executablePath: systemChromiumPath } : {}),
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ viewport: { width: 1262, height: 822 } });
  await context.route("**/*", async (route) => {
    const { hostname } = new URL(route.request().url());
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });

  try {
    const page = await context.newPage();
    await page.route("**/api/admin/security/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          passkeyRequired: true,
          passkeys: [],
          recoveryCodesRemaining: 0,
          recoveryCodesGeneratedAt: null,
          lockedUntil: null,
          verified: false,
          activationReady: false,
          verifiedUntil: null,
          expectedClaim: null,
        }),
      }),
    );

    await signIn(page, password);
    await page.goto(localUrl("/"));
    await page.getByRole("button", { name: "Apri la tua area personale" }).click();
    const desktopDashboardLink = page.getByTestId("desktop-account-admin-dashboard");
    await expect(desktopDashboardLink).toBeVisible();
    await desktopDashboardLink.click();
    await expect(page).toHaveURL(/\/admin\/dashboard(?:$|[?#])/);
    await expect(page.getByRole("heading", { name: "Verifica passkey" })).toBeVisible();

    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto(localUrl("/"));
    await page.getByRole("button", { name: "Apri la tua area personale" }).click();
    const mobileDashboardLink = page.getByTestId("mobile-account-admin-dashboard");
    await expect(mobileDashboardLink).toBeVisible();
    await mobileDashboardLink.click();
    await expect(page).toHaveURL(/\/admin\/dashboard(?:$|[?#])/);
    await expect(mobileDashboardLink).toBeHidden();
    await expect(page.getByRole("heading", { name: "Verifica passkey" })).toBeVisible();
  } finally {
    await context.close();
    await browser.close();
  }
});

test("admin passkey sessions: enroll, enforce, verify, and revoke across sessions", async () => {
  test.setTimeout(180_000);
  requireLoopbackEndpoint(baseURL, "ADMIN_PASSKEY_E2E_BASE_URL");
  requireLoopbackEndpoint(authEmulator, "ADMIN_PASSKEY_E2E_AUTH_EMULATOR");
  requireLoopbackEndpoint(
    firestoreEmulator,
    "ADMIN_PASSKEY_E2E_FIRESTORE_EMULATOR",
  );
  await resetDisposableEmulators();
  const password = `Test-${randomBytes(18).toString("hex")}!`;
  await seedDisposableAdmin(password);

  const systemChromiumPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/repl/tools/bin/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(systemChromiumPath) ? { executablePath: systemChromiumPath } : {}),
    args: ["--no-sandbox"],
  });

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const blockExternalTraffic = async (context: BrowserContext) => {
    await context.route("**/*", async (route) => {
      const { hostname } = new URL(route.request().url());
      if (hostname === "127.0.0.1" || hostname === "localhost") {
        await route.continue();
      } else {
        await route.abort("blockedbyclient");
      }
    });
  };
  await Promise.all([blockExternalTraffic(contextA), blockExternalTraffic(contextB)]);

  try {
    const pageA = await contextA.newPage();
    const { cdp: cdpA, authenticatorId: authenticatorA } =
      await addVirtualAuthenticator(contextA, pageA);
    await signIn(pageA, password);
    await pageA.goto(localUrl("/admin/sicurezza"));

    await pageA.getByTestId("input-passkey-label").fill("Passkey E2E iniziale");
    await pageA.getByTestId("button-register-passkey").click();
    const firstPasskeyRow = pageA.locator('[data-testid^="row-passkey-"]').first();
    await expect(firstPasskeyRow).toContainText("Passkey E2E iniziale");
    const firstCredentialResult = await cdpA.send("WebAuthn.getCredentials", {
      authenticatorId: authenticatorA,
    });
    expect(firstCredentialResult.credentials).toHaveLength(1);
    const firstCredential = firstCredentialResult.credentials[0];
    // Simula un secondo dispositivo: il dispositivo vuoto non ha il credential
    // incluso in excludeCredentials, quindi può registrare una seconda passkey.
    await cdpA.send("WebAuthn.removeCredential", {
      authenticatorId: authenticatorA,
      credentialId: firstCredential.credentialId,
    });

    await pageA.getByTestId("input-passkey-label").fill("Passkey E2E secondaria");
    await pageA.getByTestId("button-register-passkey").click();
    await expect(pageA.locator('[data-testid^="row-passkey-"]')).toHaveCount(2);
    const secondCredentialResult = await cdpA.send("WebAuthn.getCredentials", {
      authenticatorId: authenticatorA,
    });
    expect(secondCredentialResult.credentials).toHaveLength(1);

    await pageA.getByTestId("button-generate-recovery-codes").click();
    const recoveryPanel = pageA.getByTestId("panel-recovery-codes");
    await expect(recoveryPanel).toBeVisible();
    const recoveryCode = (await recoveryPanel.locator(".grid span").first().innerText()).trim();
    expect(recoveryCode).toHaveLength(14);
    expect(recoveryCode).toMatch(/^[A-Z0-9-]+$/);
    await recoveryPanel.getByRole("button", { name: "Li ho salvati" }).click();

    await pageA.getByTestId("button-enable-enforcement").click();
    await pageA.getByTestId("button-confirm-enforcement").click();
    const securityStateA = pageA.getByTestId("card-security-state");
    await expect(securityStateA).toContainText("Passkey obbligatoria attiva");
    await expect(securityStateA).toContainText("Sessione verificata fino alle");

    // Secondo browser context = nuova sessione Firebase, non ancora verificata.
    const credentials = await cdpA.send("WebAuthn.getCredentials", {
      authenticatorId: authenticatorA,
    });
    expect(credentials.credentials).toHaveLength(1);
    const pageB = await contextB.newPage();
    const { cdp: cdpB, authenticatorId: authenticatorB } =
      await addVirtualAuthenticator(contextB, pageB);
    await cdpB.send("WebAuthn.addCredential", {
      authenticatorId: authenticatorB,
      credential: firstCredential,
    });
    await signIn(pageB, password);
    await expect(pageB.getByRole("heading", { name: "Verifica passkey" })).toBeVisible();
    await expect(pageB.getByTestId("button-verify-passkey")).toBeEnabled();
    const passkeyVerifyResponse = pageB.waitForResponse((response) => {
      return new URL(response.url()).pathname === "/api/admin/security/authentication/verify";
    });
    await pageB.getByTestId("button-verify-passkey").click();
    expect((await passkeyVerifyResponse).ok()).toBe(true);
    await expect(pageB.getByRole("heading", { name: "Verifica passkey" })).toHaveCount(0);

    // La revoca in una sessione invalida anche la verifica già ottenuta
    // nell'altra sessione, benché il suo ID token non sia ancora scaduto.
    await pageB.goto(localUrl("/admin/sicurezza"));
    await expect(pageB.getByTestId("card-security-state")).toContainText("Sessione verificata fino alle");
    const secondPasskeyRow = pageB
      .locator('[data-testid^="row-passkey-"]')
      .filter({ hasText: "Passkey E2E secondaria" });
    await expect(secondPasskeyRow).toHaveCount(1);
    await secondPasskeyRow.getByTestId(/^button-revoke-/).click();
    await pageB.getByTestId("button-confirm-revoke").click();
    await expect(pageB.getByRole("heading", { name: "Verifica passkey" })).toBeVisible();

    await pageA.reload();
    await expect(pageA.getByRole("heading", { name: "Verifica passkey" })).toBeVisible();
    await expect(pageA.getByTestId("button-verify-passkey")).toBeEnabled();
  } finally {
    await contextA.close();
    await contextB.close();
    await browser.close();
  }
});



// Keep recovery to one sign-in session: after a later sign-in, the Auth
// Emulator can give an older session the account's latest auth_time on refresh.
// Cross-session invalidation is verified separately above.
test("admin passkey recovery: redeem a code and register a replacement key", async () => {
  test.setTimeout(90_000);
  requireLoopbackEndpoint(baseURL, "ADMIN_PASSKEY_E2E_BASE_URL");
  requireLoopbackEndpoint(authEmulator, "ADMIN_PASSKEY_E2E_AUTH_EMULATOR");
  requireLoopbackEndpoint(firestoreEmulator, "ADMIN_PASSKEY_E2E_FIRESTORE_EMULATOR");
  await resetDisposableEmulators();
  const password = `Test-${randomBytes(18).toString("hex")}!`;
  await seedDisposableAdmin(password);

  const systemChromiumPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/repl/tools/bin/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(systemChromiumPath) ? { executablePath: systemChromiumPath } : {}),
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  await context.route("**/*", async (route) => {
    const { hostname } = new URL(route.request().url());
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });

  try {
    const page = await context.newPage();
    const { cdp, authenticatorId } = await addVirtualAuthenticator(context, page);
    await signIn(page, password);
    await page.goto(localUrl("/admin/sicurezza"));

    await page.getByTestId("input-passkey-label").fill("Passkey E2E iniziale");
    await page.getByTestId("button-register-passkey").click();
    await expect(page.locator('[data-testid^="row-passkey-"]').first()).toContainText(
      "Passkey E2E iniziale",
    );
    const firstCredential = (
      await cdp.send("WebAuthn.getCredentials", { authenticatorId })
    ).credentials[0];
    expect(firstCredential).toBeTruthy();
    await cdp.send("WebAuthn.removeCredential", {
      authenticatorId,
      credentialId: firstCredential.credentialId,
    });

    await page.getByTestId("input-passkey-label").fill("Passkey E2E secondaria");
    await page.getByTestId("button-register-passkey").click();
    await expect(page.locator('[data-testid^="row-passkey-"]')).toHaveCount(2);

    await page.getByTestId("button-generate-recovery-codes").click();
    const recoveryPanel = page.getByTestId("panel-recovery-codes");
    await expect(recoveryPanel).toBeVisible();
    const recoveryCode = (await recoveryPanel.locator(".grid span").first().innerText()).trim();
    expect(recoveryCode).toHaveLength(14);
    expect(recoveryCode).toMatch(/^[A-Z0-9-]+$/);
    await recoveryPanel.getByRole("button", { name: "Li ho salvati" }).click();

    await page.getByTestId("button-enable-enforcement").click();
    await page.getByTestId("button-confirm-enforcement").click();
    const securityState = page.getByTestId("card-security-state");
    await expect(securityState).toContainText("Passkey obbligatoria attiva");
    await expect(securityState).toContainText("Sessione verificata fino alle");

    const secondPasskeyRow = page
      .locator('[data-testid^="row-passkey-"]')
      .filter({ hasText: "Passkey E2E secondaria" });
    await expect(secondPasskeyRow).toHaveCount(1);
    await secondPasskeyRow.getByTestId(/^button-revoke-/).click();
    await page.getByTestId("button-confirm-revoke").click();
    await expect(page.getByRole("heading", { name: "Verifica passkey" })).toBeVisible();

    await page.getByTestId("button-use-recovery-code").click();
    await page.getByTestId("input-recovery-code").fill(recoveryCode);
    await expect(page.getByTestId("button-submit-recovery-code")).toBeEnabled();
    const recoveryVerifyResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/admin/security/recovery/verify",
      { timeout: 15_000 },
    );
    await page.getByTestId("button-submit-recovery-code").click();
    expect((await recoveryVerifyResponse).ok()).toBe(true);

    const verificationHeading = page.getByRole("heading", { name: "Verifica passkey" });
    const retryClaimRefresh = page.getByTestId("button-retry-passkey-token-refresh");
    await expect
      .poll(
        async () => {
          if ((await verificationHeading.count()) === 0) return "unlocked";
          return (await retryClaimRefresh.isVisible()) ? "refresh" : "pending";
        },
        { timeout: 15_000 },
      )
      .not.toBe("pending");
    if (await verificationHeading.count()) {
      try {
        await retryClaimRefresh.click({ timeout: 3_000 });
      } catch (error) {
        // Il refresh può sbloccare la pagina e rimuovere il pulsante prima
        // che Playwright termini il clic; accettalo solo se la schermata gate
        // è davvero scomparsa.
        if (await verificationHeading.count()) throw error;
      }
    }
    await expect(verificationHeading).toHaveCount(0, { timeout: 15_000 });
    await expect(securityState).toContainText("Sessione verificata fino alle");

    // L'autenticatore conserva la chiave revocata, che non è più esclusa dal
    // server; può quindi creare una chiave sostitutiva distinta dalla prima.
    await page.getByTestId("input-passkey-label").fill("Passkey E2E sostitutiva");
    await page.getByTestId("button-register-passkey").click();
    await expect(page.locator('[data-testid^="row-passkey-"]')).toHaveCount(2);
    await expect(
      page
        .locator('[data-testid^="row-passkey-"]')
        .filter({ hasText: "Passkey E2E sostitutiva" }),
    ).toHaveCount(1);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("admin dashboard React smoke: load the default calendar and navigate core sections", async () => {
  test.setTimeout(120_000);
  requireLoopbackEndpoint(baseURL, "ADMIN_PASSKEY_E2E_BASE_URL");
  requireLoopbackEndpoint(authEmulator, "ADMIN_PASSKEY_E2E_AUTH_EMULATOR");
  requireLoopbackEndpoint(firestoreEmulator, "ADMIN_PASSKEY_E2E_FIRESTORE_EMULATOR");
  await resetDisposableEmulators();

  const password = `Test-${randomBytes(18).toString("hex")}!`;
  const idToken = await seedDisposableAdmin(password);
  const clientId = "e2e-admin-dashboard-client";
  const jobId = "e2e-admin-dashboard-job";
  const galleryId = "e2e-admin-dashboard-gallery";
  const campaignId = "e2e-admin-dashboard-campaign";
  const bookingId = "e2e-admin-dashboard-booking";
  const fixtureJobName = "E2E - Lavoro sintetico";
  const fixtureClientEmail = "admin-dashboard-fixture@example.invalid";
  const eventDate = new Date();
  eventDate.setHours(12, 0, 0, 0);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0);

  const fixtureJob = {
    id: jobId,
    nomeEvento: fixtureJobName,
    clientiIds: [clientId],
    jobType: "matrimonio",
    dataNonDefinita: false,
    allDay: false,
    eventDate: eventDate.toISOString(),
    startTime: "12:00",
    endTime: "13:00",
    eventLocation: "Luogo fittizio",
    status: "confermato",
    financials: {
      totalePreventivato: 0,
      totaleOrdini: 0,
      totalePagato: 0,
      saldoResiduo: 0,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await Promise.all([
    seedFirestoreDocument(idToken, `clienti/${clientId}`, {
      nome: "Cliente",
      cognome: "Sintetico E2E",
      email: fixtureClientEmail,
      cellulare1: "+390000000000",
      sourceRefs: {
        jobIds: [jobId],
        bookingIds: [],
        orderIds: [],
        galleryIds: [],
      },
      lifecycle: {
        firstContactAt: new Date(),
        lastInteractionAt: new Date(),
        status: "lead",
      },
      financials: { totalRevenue: 0, outstandingBalance: 0, totalOrders: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    seedFirestoreDocument(idToken, `jobs/${jobId}`, {
      ...fixtureJob,
      eventDate,
    }),
    seedFirestoreDocument(idToken, `galleries/${galleryId}`, {
      name: "E2E - Galleria sintetica",
      code: "e2efixtur",
      date: eventDate.toISOString(),
      location: "Luogo fittizio",
      photoCount: 0,
      active: true,
      jobType: "matrimonio",
      clienteId: clientId,
      clientiIds: [clientId],
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    seedFirestoreDocument(idToken, `booking_campaigns/${campaignId}`, {
      nome: "Campagna E2E sintetica",
      code: "E2EFIXTR",
      descrizione: "Dati fittizi del test admin",
      dataInizio: new Date(Date.now() - 24 * 60 * 60 * 1000),
      dataFine: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      temaStagionale: null,
      orarioApertura: "09:00",
      orarioPausaInizio: "13:00",
      orarioPausaFine: "14:00",
      orarioChiusura: "19:00",
      durataShootingMinuti: 60,
      prodottiDisponibili: [],
      attiva: true,
      createdAt: new Date(),
    }),
    seedFirestoreDocument(idToken, `bookings/${bookingId}`, {
      campaignId,
      clienteId: clientId,
      cliente: {
        nome: "Cliente",
        cognome: "Sintetico E2E",
        email: fixtureClientEmail,
        whatsapp: "+390000000000",
      },
      dataShootingInizio: tomorrow,
      dataShootingFine: new Date(tomorrow.getTime() + 60 * 60 * 1000),
      note: "Prenotazione sintetica E2E",
      stato: "in_attesa",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  ]);

  const systemChromiumPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
    "/repl/tools/bin/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(systemChromiumPath)
      ? { executablePath: systemChromiumPath }
      : {}),
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1262, height: 822 },
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const reactBoundaryErrors: string[] = [];

  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      await route.abort("blockedbyclient");
      return;
    }

    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (url.pathname === "/api/admin/security/status") {
      await json({
        passkeyRequired: false,
        passkeys: [],
        recoveryCodesRemaining: 0,
        recoveryCodesGeneratedAt: null,
        lockedUntil: null,
        verified: false,
        activationReady: false,
        verifiedUntil: null,
        expectedClaim: null,
      });
      return;
    }
    if (url.pathname === "/api/calendar/events") {
      await json({ events: [] });
      return;
    }
    if (url.pathname === "/api/jobs") {
      await json({ jobs: [fixtureJob] });
      return;
    }
    if (url.pathname === "/api/jobs/list-aggregates") {
      await json({
        transactionCounts: {},
        quotesStatus: {},
        financialsByJob: {},
      });
      return;
    }
    if (url.pathname === "/api/collaboratori") {
      await json([]);
      return;
    }
    if (url.pathname === "/api/collaboratori/assignments") {
      await json([]);
      return;
    }
    await route.continue();
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.stack ?? error.message);
  });
  page.on("console", async (message) => {
    if (message.type() !== "error") return;

    const details = await Promise.all(
      message.args().map((argument) =>
        argument
          .evaluate((value: unknown) => {
            if (value instanceof Error) return value.stack ?? value.message;
            if (typeof value === "string") return value;
            try {
              return JSON.stringify(value);
            } catch {
              return String(value);
            }
          })
          .catch(() => ""),
      ),
    );
    const text = [message.text(), ...details].join("\n");
    if (
      /\[ErrorBoundary\]|React Error Boundary catturato errore|The above error occurred in|componentStack/i.test(
        text,
      )
    ) {
      reactBoundaryErrors.push(text);
    }
  });

  try {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto(localUrl("/admin"));
    await page.getByRole("button", { name: "Apri menu" }).click();
    const discoverToggle = page.getByRole("button", {
      name: /Scopri Image Studio/,
    });
    await discoverToggle.click();
    const mobileDiscoverContent = page.getByTestId("mobile-discover-content");
    await expect(mobileDiscoverContent).toBeVisible();
    await discoverToggle.click();
    await expect(mobileDiscoverContent).toBeHidden();

    // La preview Replit in cui è comparso il loop usa questo viewport desktop.
    await page.setViewportSize({ width: 1262, height: 822 });
    await signIn(page, password);

    // Un contesto browser nuovo parte senza sessionStorage: il calendario deve
    // restare la sezione iniziale e mostrare il lavoro del giorno caricato.
    await expect(page.getByTestId("card-jobs-events")).toBeVisible();
    await expect(page.getByTestId(`today-job-card-${jobId}`)).toContainText(
      fixtureJobName,
    );

    const visitNavigationItem = async (groupId: string, itemId: string) => {
      await page.getByTestId(`nav-${groupId}`).click();
      await page.getByTestId(`nav-item-${itemId}`).click();
    };

    await visitNavigationItem("lavori", "jobs-list");
    await expect(
      page.getByRole("heading", { name: "Gestione Lavori", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(fixtureJobName, { exact: true })).toBeVisible();

    await visitNavigationItem("lavori", "clienti");
    const clientiManager = page.getByTestId("clienti-manager");
    await expect(
      clientiManager.getByRole("heading", { name: "Clienti", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId(`row-cliente-${clientId}`)
        .getByText(fixtureClientEmail, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page
        .getByTestId("clienti-manager")
        .getByRole("heading", { name: "Clienti", exact: true }),
    ).toBeVisible();

    await visitNavigationItem("gallerie", "galleries");
    await expect(
      page.getByRole("heading", { name: "Gallerie Eventi", exact: true }),
    ).toBeVisible();
    // La tab salvata in sessionStorage deve montare correttamente il suo
    // Collapsible anche al successivo ingresso nella dashboard.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Gallerie Eventi", exact: true }),
    ).toBeVisible();

    await visitNavigationItem("gallerie", "requests");
    await expect(
      page.getByRole("heading", { name: "Richieste Password" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Richieste Password" }),
    ).toBeVisible();

    await visitNavigationItem("agenda", "bookings-list");
    await expect(
      page.getByRole("heading", { name: "Gestione Prenotazioni", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("input-search-bookings")).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Gestione Prenotazioni", exact: true }),
    ).toBeVisible();

    await page.getByTestId("nav-cassa").click();
    await expect(page.getByTestId("cash-tab-dashboard")).toBeVisible();
    await expect(
      page.getByTestId("finance-income-total").or(page.getByTestId("finance-error")),
    ).toBeVisible({ timeout: 30_000 });
    // Riproduce anche un nuovo accesso con Cassa come ultima tab salvata.
    await page.reload();
    await expect(page.getByTestId("cash-tab-dashboard")).toBeVisible();
    await expect(
      page.getByTestId("finance-income-total").or(page.getByTestId("finance-error")),
    ).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText("Oops! Qualcosa è andato storto")).toHaveCount(
      0,
    );
    expect(pageErrors, "errori non gestiti della pagina").toEqual([]);
    expect(
      reactBoundaryErrors,
      "errori React o stack registrati dall'ErrorBoundary",
    ).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});