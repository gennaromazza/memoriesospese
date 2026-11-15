import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createLocalProductionOrigin } from "./local-production-origin";

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

function firebaseUidFromIdToken(idToken: string): string {
  const encodedClaims = idToken.split(".")[1];
  if (!encodedClaims) throw new Error("Auth emulator returned an invalid ID token");
  const claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8")) as {
    sub?: string;
    user_id?: string;
  };
  const uid = claims.user_id ?? claims.sub;
  if (!uid) throw new Error("Auth emulator ID token did not contain a UID");
  return uid;
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

async function signIn(page: Page, password: string, origin = baseURL): Promise<void> {
  await page.goto(new URL("/admin", origin).toString());
  const necessaryCookies = page.getByRole("button", { name: "Solo Necessari" });
  if (await necessaryCookies.isVisible().catch(() => false)) {
    await necessaryCookies.click();
  }
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard(?:$|[?#])/);
}

test("a remembered browser restores trust after login and stays blocked after revocation", async () => {
  test.setTimeout(240_000);
  requireLoopbackEndpoint(baseURL, "ADMIN_PASSKEY_E2E_BASE_URL");
  requireLoopbackEndpoint(authEmulator, "ADMIN_PASSKEY_E2E_AUTH_EMULATOR");
  requireLoopbackEndpoint(firestoreEmulator, "ADMIN_PASSKEY_E2E_FIRESTORE_EMULATOR");
  await resetDisposableEmulators();

  const password = `Test-${randomBytes(18).toString("hex")}!`;
  await seedDisposableAdmin(password);
  const rememberedLabel = "Browser ricordato E2E";
  const localOrigin = await createLocalProductionOrigin(4179, 443);
  const systemChromiumPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/repl/tools/bin/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(systemChromiumPath) ? { executablePath: systemChromiumPath } : {}),
    args: [
      "--no-sandbox",
      "--allow-running-insecure-content",
      "--host-resolver-rules=MAP imagestudiofotografico.com 127.0.0.1",
    ],
  });
  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });
  const allowOnlyLocalTraffic = async (context: BrowserContext) => {
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const localProductionOrigin =
        url.hostname === "imagestudiofotografico.com" &&
        (url.port === "" || url.port === "443");
      if (
        localProductionOrigin ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "::1"
      ) {
        await route.continue();
      } else {
        await route.abort("blockedbyclient");
      }
    });
  };
  await Promise.all([allowOnlyLocalTraffic(contextA), allowOnlyLocalTraffic(contextB)]);

  try {
    const pageA = await contextA.newPage();
    const { cdp: cdpA, authenticatorId: authenticatorA } =
      await addVirtualAuthenticator(contextA, pageA);
    await signIn(pageA, password, localOrigin.origin);
    await pageA.goto(new URL("/admin/sicurezza", localOrigin.origin).toString());

    await pageA.getByTestId("input-passkey-label").fill("Passkey browser ricordato");
    await pageA.getByTestId("button-register-passkey").click();
    await expect(pageA.locator('[data-testid^="row-passkey-"]').first()).toContainText(
      "Passkey browser ricordato",
    );
    const credentialsA = await cdpA.send("WebAuthn.getCredentials", {
      authenticatorId: authenticatorA,
    });
    expect(credentialsA.credentials).toHaveLength(1);

    const activationVerifyResponse = pageA.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/admin/security/authentication/verify",
    );
    await pageA.getByTestId("button-verify-now").click();
    expect((await activationVerifyResponse).ok()).toBe(true);
    await expect(pageA.getByTestId("card-security-state")).toContainText(
      "Sessione verificata fino alle",
    );
    await pageA.getByTestId("button-generate-recovery-codes").click();
    const recoveryPanel = pageA.getByTestId("panel-recovery-codes");
    await expect(recoveryPanel).toBeVisible();
    await recoveryPanel.getByRole("button", { name: "Li ho salvati" }).click();
    await pageA.getByTestId("button-enable-enforcement").click();
    await pageA.getByTestId("button-confirm-enforcement").click();
    await expect(pageA.getByTestId("card-security-state")).toContainText(
      "Passkey obbligatoria attiva",
    );

    // Logout reale da Firebase: il cookie HttpOnly del browser deve restare.
    await pageA.getByRole("button", { name: "Esci dal pannello" }).click();
    await expect(pageA).toHaveURL(/\/admin(?:$|[?#])/);
    await signIn(pageA, password, localOrigin.origin);
    await expect(pageA.getByRole("heading", { name: "Verifica passkey" })).toBeVisible();
    await pageA.getByTestId("checkbox-remember-device").check();
    await pageA.getByTestId("input-remember-device-label").fill(rememberedLabel);
    const rememberVerifyResponse = pageA.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/admin/security/authentication/verify",
    );
    await pageA.getByTestId("button-verify-passkey").click();
    expect((await rememberVerifyResponse).ok()).toBe(true);
    await expect(pageA.getByRole("heading", { name: "Verifica passkey" })).toHaveCount(0);
    // Copia la credenziale aggiornata dopo entrambe le asserzioni già eseguite
    // dal browser A, così il contatore dell'autenticatore virtuale resta coerente.
    const authenticatedCredentialsA = await cdpA.send("WebAuthn.getCredentials", {
      authenticatorId: authenticatorA,
    });
    expect(authenticatedCredentialsA.credentials).toHaveLength(1);
    const credential = authenticatedCredentialsA.credentials[0];

    await pageA.goto(new URL("/admin/sicurezza", localOrigin.origin).toString());
    const rememberedRowA = pageA
      .getByTestId("card-remembered-devices")
      .locator('[data-testid^="row-remembered-device-"]')
      .filter({ hasText: rememberedLabel });
    await expect(rememberedRowA).toContainText("Questo browser");

    // Lo stesso browser deve ripristinare la fiducia al successivo accesso.
    await pageA.getByRole("button", { name: "Esci dal pannello" }).click();
    await expect(pageA).toHaveURL(/\/admin(?:$|[?#])/);
    await signIn(pageA, password, localOrigin.origin);
    await expect(pageA.getByRole("heading", { name: "Verifica passkey" })).toHaveCount(0);
    await pageA.goto(new URL("/admin/sicurezza", localOrigin.origin).toString());
    await expect(pageA.getByTestId("card-security-state")).toContainText(
      "Sessione verificata fino alle",
    );
    await expect(
      pageA
        .getByTestId("card-remembered-devices")
        .locator('[data-testid^="row-remembered-device-"]')
        .filter({ hasText: rememberedLabel }),
    ).toContainText("Questo browser");

    // Un contesto browser nuovo non ha il cookie: deve inserire la passkey.
    const pageB = await contextB.newPage();
    const { cdp: cdpB, authenticatorId: authenticatorB } =
      await addVirtualAuthenticator(contextB, pageB);
    await cdpB.send("WebAuthn.addCredential", {
      authenticatorId: authenticatorB,
      credential,
    });
    await signIn(pageB, password, localOrigin.origin);
    await expect(pageB.getByRole("heading", { name: "Verifica passkey" })).toBeVisible();
    await expect(pageB.getByTestId("checkbox-remember-device")).not.toBeChecked();
    const freshBrowserVerifyResponse = pageB.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/admin/security/authentication/verify",
    );
    await pageB.getByTestId("button-verify-passkey").click();
    const freshBrowserVerification = await freshBrowserVerifyResponse;
    if (!freshBrowserVerification.ok()) {
      throw new Error(
        `Passkey verification from a new context failed (${freshBrowserVerification.status()}): ${await freshBrowserVerification.text()}`,
      );
    }
    await expect(pageB.getByRole("heading", { name: "Verifica passkey" })).toHaveCount(0);

    // Revocare da una sessione verificata deve bloccare il browser ricordato.
    await pageB.goto(new URL("/admin/sicurezza", localOrigin.origin).toString());
    const rememberedRowB = pageB
      .getByTestId("card-remembered-devices")
      .locator('[data-testid^="row-remembered-device-"]')
      .filter({ hasText: rememberedLabel });
    await expect(rememberedRowB).toHaveCount(1);
    await rememberedRowB.getByRole("button", { name: "Dimentica" }).click();
    await pageB.getByTestId("button-confirm-forget-device").click();
    await expect(rememberedRowB).toContainText("Revocato");

    await pageA.reload();
    await expect(pageA.getByRole("heading", { name: "Verifica passkey" })).toBeVisible();
    await pageA.getByTestId("button-logout-from-verification").click();
    await expect(pageA).toHaveURL(/\/admin(?:$|[?#])/);
    await signIn(pageA, password, localOrigin.origin);
    await expect(pageA.getByRole("heading", { name: "Verifica passkey" })).toBeVisible();
  } finally {
    await Promise.allSettled([contextA.close(), contextB.close()]);
    await browser.close().catch(() => undefined);
    await localOrigin.close();
  }
});

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

test("device enrollment QR resumes on its approval page after admin login", async () => {
  test.setTimeout(60_000);
  requireLoopbackEndpoint(baseURL, "ADMIN_PASSKEY_E2E_BASE_URL");
  requireLoopbackEndpoint(authEmulator, "ADMIN_PASSKEY_E2E_AUTH_EMULATOR");
  requireLoopbackEndpoint(firestoreEmulator, "ADMIN_PASSKEY_E2E_FIRESTORE_EMULATOR");
  await resetDisposableEmulators();

  const password = `Test-${randomBytes(18).toString("hex")}!`;
  await seedDisposableAdmin(password);
  const enrollmentId = "Q".repeat(43);
  const deviceLabel = "Telefono appena associato";
  let approvalStatus: "pending" | "expired" | "cancelled" = "pending";

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
  await context.route("**/api/admin/security/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/admin/security/status") {
      await route.fulfill({
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
      });
      return;
    }
    if (pathname.endsWith(`/device-enrollment/${enrollmentId}/approval-info`)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: approvalStatus,
          deviceLabel,
          expiresAt: Date.now() + 5 * 60_000,
        }),
      });
      return;
    }
    if (pathname.endsWith(`/device-enrollment/${enrollmentId}/reject`)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rejected: true }),
      });
      return;
    }
    await route.continue();
  });

  try {
    const page = await context.newPage();
    await page.goto(localUrl(`/admin/authorize-device?deviceEnrollment=${enrollmentId}`));
    await expect(page).toHaveURL(
      new RegExp(`/admin\\?deviceEnrollment=${enrollmentId}$`),
    );
    const necessaryCookies = page.getByRole("button", { name: "Solo Necessari" });
    if (await necessaryCookies.isVisible().catch(() => false)) {
      await necessaryCookies.click();
    }
    await page.getByLabel("Email").fill(adminEmail);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Accedi" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/admin/authorize-device\\?deviceEnrollment=${enrollmentId}$`),
    );
    await expect(page.getByText(deviceLabel)).toBeVisible();
    await expect(page.getByRole("button", { name: "Approva e verifica con passkey" })).toBeVisible();
    await page.getByRole("button", { name: "Rifiuta richiesta" }).click();
    await expect(page.getByText(/Richiesta rifiutata/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Approva e verifica con passkey" })).toHaveCount(0);

    approvalStatus = "expired";
    await page.reload();
    await expect(page.getByText(/Questo QR è scaduto/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Approva e verifica con passkey" })).toHaveCount(0);

    approvalStatus = "cancelled";
    await page.reload();
    await expect(page.getByText(/Richiesta annullata/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Approva e verifica con passkey" })).toHaveCount(0);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("a different emulator account cannot approve or register another account's QR", async () => {
  test.setTimeout(90_000);
  requireLoopbackEndpoint(baseURL, "ADMIN_PASSKEY_E2E_BASE_URL");
  requireLoopbackEndpoint(authEmulator, "ADMIN_PASSKEY_E2E_AUTH_EMULATOR");
  requireLoopbackEndpoint(firestoreEmulator, "ADMIN_PASSKEY_E2E_FIRESTORE_EMULATOR");
  await resetDisposableEmulators();

  const passwordA = `Test-${randomBytes(18).toString("hex")}!`;
  const passwordB = `Test-${randomBytes(18).toString("hex")}!`;
  const otherEmail = `other-admin-${randomBytes(12).toString("hex")}@example.invalid`;
  const uidA = firebaseUidFromIdToken(await seedDisposableAdmin(passwordA));
  const uidB = firebaseUidFromIdToken(await seedDisposableUser(otherEmail, passwordB));
  const enrollmentId = randomBytes(32).toString("base64url");
  const deviceLabel = "Portatile dell'account A";
  const expiresAt = Date.now() + 10 * 60_000;
  const enrollment = { status: "pending", deviceLabel, expiresAt };
  const passkeysByUid = new Map([
    [uidA, new Set(["account-a-trusted-passkey"])],
    [uidB, new Set<string>()],
  ]);
  const requests = {
    approvalInfoFromB: 0,
    approvalOptionsFromB: 0,
    approvalVerifyFromB: 0,
    registrationOptionsFromB: 0,
    registrationVerifyFromB: 0,
  };

  const localOrigin = await createLocalProductionOrigin();
  const systemChromiumPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/repl/tools/bin/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(systemChromiumPath) ? { executablePath: systemChromiumPath } : {}),
    args: [
      "--no-sandbox",
      "--allow-running-insecure-content",
      "--host-resolver-rules=MAP imagestudiofotografico.com 127.0.0.1",
    ],
  });
  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });
  const json = (route: Parameters<Parameters<BrowserContext["route"]>[1]>[0], body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  const routeEnrollmentApi = async (
    route: Parameters<Parameters<BrowserContext["route"]>[1]>[0],
  ) => {
    const { pathname } = new URL(route.request().url());
    const token = route.request().headers().authorization?.replace(/^Bearer\s+/i, "");
    const uid = token ? firebaseUidFromIdToken(token) : null;

    if (pathname === "/api/admin/security/device-enrollment/start") {
      if (uid !== uidA) {
        return json(route, {
          error: "Richiesta non valida o scaduta",
          code: "device_enrollment_not_found",
        }, 404);
      }
      return json(route, {
        enrollmentId,
        approvalUrl:
          `https://imagestudiofotografico.com/admin/authorize-device?deviceEnrollment=${enrollmentId}`,
        expiresAt,
      });
    }
    if (pathname.endsWith(`/device-enrollment/${enrollmentId}/approval-info`)) {
      if (uid === uidB) requests.approvalInfoFromB += 1;
      if (uid !== uidA) {
        return json(route, {
          error: "Richiesta non valida o scaduta",
          code: "device_enrollment_not_found",
        }, 404);
      }
      return json(route, enrollment);
    }
    if (pathname.endsWith(`/device-enrollment/${enrollmentId}/authentication/options`)) {
      if (uid === uidB) requests.approvalOptionsFromB += 1;
      if (uid !== uidA || !passkeysByUid.get(uid)?.size) {
        return json(route, {
          error: "Richiesta non valida o scaduta",
          code: "device_enrollment_not_found",
        }, 404);
      }
      return json(route, {
        challenge: randomBytes(32).toString("base64url"),
        rpId: "imagestudiofotografico.com",
        allowCredentials: [{
          id: "account-a-trusted-passkey",
          type: "public-key",
          transports: ["internal"],
        }],
        timeout: 60_000,
        userVerification: "required",
      });
    }
    if (pathname.endsWith(`/device-enrollment/${enrollmentId}/authentication/verify`)) {
      if (uid === uidB) requests.approvalVerifyFromB += 1;
      if (uid !== uidA) {
        return json(route, {
          error: "Richiesta non valida o scaduta",
          code: "device_enrollment_not_found",
        }, 404);
      }
      enrollment.status = "approved";
      return json(route, { approvedAt: Date.now() });
    }
    if (pathname.endsWith(`/device-enrollment/${enrollmentId}/registration/options`)) {
      if (uid === uidB) requests.registrationOptionsFromB += 1;
      return json(route, {
        error: "Richiesta non valida o scaduta",
        code: "device_enrollment_not_found",
      }, 404);
    }
    if (pathname.endsWith(`/device-enrollment/${enrollmentId}/registration/verify`)) {
      if (uid === uidB) requests.registrationVerifyFromB += 1;
      return json(route, {
        error: "Richiesta non valida o scaduta",
        code: "device_enrollment_not_found",
      }, 404);
    }
    return route.continue();
  };
  for (const context of [contextA, contextB]) {
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const localOriginRequest =
        url.hostname === "imagestudiofotografico.com" &&
        Number(url.port) === localOrigin.port;
      if (
        localOriginRequest ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "::1"
      ) {
        await route.continue();
      } else {
        await route.abort("blockedbyclient");
      }
    });
    await context.route("**/api/admin/security/**", routeEnrollmentApi);
  }

  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await Promise.all([
      pageA.goto(`${localOrigin.origin}/`),
      pageB.goto(`${localOrigin.origin}/`),
    ]);
    await Promise.all([
      signInInBrowser(pageA, adminEmail, passwordA),
      signInInBrowser(pageB, otherEmail, passwordB),
    ]);
    const { cdp: cdpB, authenticatorId: authenticatorIdB } =
      await addVirtualAuthenticator(contextB, pageB);
    const credentialB = await pageB.evaluate(async (email) => {
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { id: "imagestudiofotografico.com", name: "Image Studio" },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: email,
            displayName: "Secondo account",
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          timeout: 60_000,
          authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "required",
          },
        },
      });
      if (!(credential instanceof PublicKeyCredential)) {
        throw new Error("Could not create the second account's virtual passkey");
      }
      return credential.id;
    }, otherEmail);
    passkeysByUid.get(uidB)!.add(credentialB);
    const credentialsBeforeAttempt = await cdpB.send("WebAuthn.getCredentials", {
      authenticatorId: authenticatorIdB,
    });
    expect(credentialsBeforeAttempt.credentials.map((credential: { credentialId: string }) =>
      Buffer.from(credential.credentialId, "base64").toString("base64url"),
    )).toEqual([credentialB]);

    const started = await pageA.evaluate(async () => {
      const moduleUrl = new URL("/src/lib/admin-passkey.ts", window.location.origin).href;
      const { AdminPasskeyClient } = await import(/* @vite-ignore */ moduleUrl);
      return AdminPasskeyClient.startDeviceEnrollment("Portatile dell'account A");
    });
    expect(started.uid).toBe(uidA);
    expect(started.enrollmentId).toBe(enrollmentId);
    expect(passkeysByUid.get(uidA)).toEqual(new Set(["account-a-trusted-passkey"]));

    const otherAccountAttempt = await pageB.evaluate(async (id) => {
      const moduleUrl = new URL("/src/lib/admin-passkey.ts", window.location.origin).href;
      const firebaseUrl = new URL("/src/lib/firebase.ts", window.location.origin).href;
      const [{ AdminPasskeyClient }, { auth }] = await Promise.all([
        import(/* @vite-ignore */ moduleUrl),
        import(/* @vite-ignore */ firebaseUrl),
      ]);
      const outcomes = [];
      for (const action of [
        () => AdminPasskeyClient.getDeviceEnrollmentApprovalInfo(id),
        () => AdminPasskeyClient.approveDeviceEnrollment(id),
      ]) {
        try {
          await action();
          outcomes.push({ rejected: false });
        } catch (error) {
          const cause = error as { status?: number; code?: string; message?: string };
          outcomes.push({
            rejected: true,
            status: cause.status,
            code: cause.code,
            message: cause.message,
          });
        }
      }
      const token = await auth.currentUser?.getIdTokenResult(true);
      return {
        uid: auth.currentUser?.uid,
        outcomes,
        adminPasskeyClaim: token?.claims.apk ?? null,
      };
    }, enrollmentId);

    expect(otherAccountAttempt.uid).toBe(uidB);
    expect(otherAccountAttempt.outcomes).toEqual([
      {
        rejected: true,
        status: 404,
        code: "device_enrollment_not_found",
        message: "Richiesta non valida o scaduta",
      },
      {
        rejected: true,
        status: 404,
        code: "device_enrollment_not_found",
        message: "Richiesta non valida o scaduta",
      },
    ]);
    expect(requests).toEqual({
      approvalInfoFromB: 1,
      approvalOptionsFromB: 1,
      approvalVerifyFromB: 0,
      registrationOptionsFromB: 0,
      registrationVerifyFromB: 0,
    });
    expect(enrollment.status).toBe("pending");
    expect([...passkeysByUid.get(uidB)!]).toEqual([credentialB]);
    const credentialsAfterAttempt = await cdpB.send("WebAuthn.getCredentials", {
      authenticatorId: authenticatorIdB,
    });
    expect(credentialsAfterAttempt.credentials.map((credential: { credentialId: string }) =>
      Buffer.from(credential.credentialId, "base64").toString("base64url"),
    )).toEqual([credentialB]);
    expect(otherAccountAttempt.adminPasskeyClaim).toBeNull();
  } finally {
    await Promise.allSettled([contextA.close(), contextB.close()]);
    await browser.close().catch(() => undefined);
    await localOrigin.close();
  }
});

test("device enrollment QR registers a new device without transferring admin access", async () => {
  test.setTimeout(120_000);
  requireLoopbackEndpoint(baseURL, "ADMIN_PASSKEY_E2E_BASE_URL");
  requireLoopbackEndpoint(authEmulator, "ADMIN_PASSKEY_E2E_AUTH_EMULATOR");
  requireLoopbackEndpoint(firestoreEmulator, "ADMIN_PASSKEY_E2E_FIRESTORE_EMULATOR");
  await resetDisposableEmulators();

  const password = `Test-${randomBytes(18).toString("hex")}!`;
  await seedDisposableAdmin(password);

  const enrollmentId = randomBytes(32).toString("base64url");
  const replacementEnrollmentId = randomBytes(32).toString("base64url");
  const approvedEnrollmentId = randomBytes(32).toString("base64url");
  const deviceLabel = "Portatile nuovo";
  let trustedCredentialId = "";
  let passkeys: Array<{
    id: string;
    label: string;
    rpId: string;
    deviceType: string;
    backedUp: boolean;
    createdAt: number;
    lastUsedAt: number | null;
  }> = [];
  let passkeyRequired = false;
  let enrollmentStatus: "pending" | "approved" | "registered" | "expired" = "pending";
  let replacementEnrollmentStatus: "pending" | "approved" | "registered" | "cancelled" = "pending";
  let approvedEnrollmentStatus: "pending" | "approved" | "registered" = "pending";
  let approvalUrl = "";
  let verifierFromNewDevice = "";
  let approvalVerificationCount = 0;
  let staleApprovalOptionsAttempts = 0;
  let newDeviceAuthenticationCount = 0;
  let enrollmentStartCount = 0;
  const expiresAt = Date.now() + 10 * 60_000;

  const localOrigin = await createLocalProductionOrigin();
  const systemChromiumPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/repl/tools/bin/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(systemChromiumPath) ? { executablePath: systemChromiumPath } : {}),
    args: [
      "--no-sandbox",
      "--allow-running-insecure-content",
      "--host-resolver-rules=MAP imagestudiofotografico.com 127.0.0.1",
    ],
  });
  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });
  const allowOnlyLocalTraffic = async (context: BrowserContext) => {
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const localOriginRequest =
        url.hostname === "imagestudiofotografico.com" &&
        Number(url.port) === localOrigin.port;
      if (
        localOriginRequest ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "::1"
      ) {
        await route.continue();
      } else {
        await route.abort("blockedbyclient");
      }
    });
  };
  await Promise.all([allowOnlyLocalTraffic(contextA), allowOnlyLocalTraffic(contextB)]);

  const statusResponse = () => ({
    passkeyRequired,
    passkeys,
    recoveryCodesRemaining: 5,
    recoveryCodesGeneratedAt: Date.now(),
    lockedUntil: null,
    verified: false,
    activationReady: true,
    verifiedUntil: null,
    expectedClaim: null,
    rememberedDeviceId: null,
    rememberedDevices: [],
  });
  const json = (route: Parameters<Parameters<BrowserContext["route"]>[1]>[0], body: unknown) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  const authenticationOptions = {
    challenge: randomBytes(32).toString("base64url"),
    rpId: "imagestudiofotografico.com",
    allowCredentials: () => [{
      id: trustedCredentialId,
      type: "public-key",
      transports: ["internal"],
    }],
    timeout: 60_000,
    userVerification: "required",
  };
  const makeRegistrationOptions = (excludeCredentialId?: string) => ({
    challenge: randomBytes(32).toString("base64url"),
    rp: { name: "Image Studio", id: "imagestudiofotografico.com" },
    user: {
      id: randomBytes(16).toString("base64url"),
      name: adminEmail,
      displayName: "Amministratore Image Studio",
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    timeout: 60_000,
    attestation: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
    excludeCredentials: excludeCredentialId
      ? [{ id: excludeCredentialId, type: "public-key", transports: ["internal"] }]
      : [],
  });

  await contextA.route("**/api/admin/security/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/admin/security/status") {
      return json(route, statusResponse());
    }
    if (pathname === "/api/admin/security/registration/options") {
      return json(route, makeRegistrationOptions());
    }
    if (pathname === "/api/admin/security/registration/verify") {
      const body = route.request().postDataJSON() as {
        label?: string;
        response?: { id?: string };
      };
      expect(body.response?.id).toMatch(/^[A-Za-z0-9_-]+$/);
      trustedCredentialId = body.response!.id!;
      const trustedPasskey = {
        id: trustedCredentialId,
        label: body.label ?? "Telefono fidato",
        rpId: "imagestudiofotografico.com",
        deviceType: "singleDevice",
        backedUp: false,
        createdAt: Date.now(),
        lastUsedAt: null,
      };
      passkeys = [trustedPasskey];
      return json(route, { passkey: trustedPasskey });
    }
    if (pathname.endsWith(`/device-enrollment/${enrollmentId}/approval-info`)) {
      return json(route, { status: enrollmentStatus, deviceLabel, expiresAt });
    }
    if (pathname.endsWith(`/device-enrollment/${enrollmentId}/authentication/options`)) {
      if (enrollmentStatus === "expired") {
        staleApprovalOptionsAttempts += 1;
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "Richiesta non valida o scaduta", code: "device_enrollment_not_found" }),
        });
      }
      return json(route, {
        ...authenticationOptions,
        allowCredentials: authenticationOptions.allowCredentials(),
      });
    }
    if (pathname.endsWith(`/device-enrollment/${replacementEnrollmentId}/approval-info`)) {
      return json(route, {
        status: replacementEnrollmentStatus,
        deviceLabel,
        expiresAt: Date.now() + 10 * 60_000,
      });
    }
    if (pathname.endsWith(`/device-enrollment/${replacementEnrollmentId}/authentication/options`)) {
      return json(route, {
        ...authenticationOptions,
        allowCredentials: authenticationOptions.allowCredentials(),
      });
    }
    if (pathname.endsWith(`/device-enrollment/${replacementEnrollmentId}/authentication/verify`)) {
      const body = route.request().postDataJSON() as {
        response?: { id?: string };
      };
      expect(body.response?.id).toBe(trustedCredentialId);
      approvalVerificationCount += 1;
      replacementEnrollmentStatus = "approved";
      return json(route, { approvedAt: Date.now() });
    }
    if (pathname.endsWith(`/device-enrollment/${approvedEnrollmentId}/approval-info`)) {
      return json(route, {
        status: approvedEnrollmentStatus,
        deviceLabel,
        expiresAt: Date.now() + 10 * 60_000,
      });
    }
    if (pathname.endsWith(`/device-enrollment/${approvedEnrollmentId}/authentication/options`)) {
      return json(route, {
        ...authenticationOptions,
        allowCredentials: authenticationOptions.allowCredentials(),
      });
    }
    if (pathname.endsWith(`/device-enrollment/${approvedEnrollmentId}/authentication/verify`)) {
      const body = route.request().postDataJSON() as {
        response?: { id?: string };
      };
      expect(body.response?.id).toBe(trustedCredentialId);
      approvalVerificationCount += 1;
      approvedEnrollmentStatus = "approved";
      return json(route, { approvedAt: Date.now() });
    }
    return json(route, { error: `Unexpected trusted-device request: ${pathname}` });
  });

  await contextB.route("**/api/admin/security/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/admin/security/status") {
      return json(route, statusResponse());
    }
    if (pathname === "/api/admin/security/device-enrollment/start") {
      const body = route.request().postDataJSON() as {
        verifierHash?: string;
        deviceLabel?: string;
      };
      expect(body.verifierHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(body.deviceLabel).toBe(deviceLabel);
      enrollmentStartCount += 1;
      const activeEnrollmentId = [
        enrollmentId,
        replacementEnrollmentId,
        approvedEnrollmentId,
      ][enrollmentStartCount - 1];
      if (!activeEnrollmentId) throw new Error("Unexpected extra enrollment request");
      approvalUrl =
        `https://imagestudiofotografico.com/admin/authorize-device?deviceEnrollment=${activeEnrollmentId}`;
      return json(route, {
        enrollmentId: activeEnrollmentId,
        approvalUrl,
        expiresAt: Date.now() + 10 * 60_000,
      });
    }
    if (pathname.endsWith(`/device-enrollment/${enrollmentId}/status`)) {
      const body = route.request().postDataJSON() as { verifier?: string };
      expect(body.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      verifierFromNewDevice = body.verifier!;
      return json(route, { status: enrollmentStatus, deviceLabel, expiresAt });
    }
    if (pathname.endsWith(`/device-enrollment/${replacementEnrollmentId}/status`)) {
      const body = route.request().postDataJSON() as { verifier?: string };
      expect(body.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      verifierFromNewDevice = body.verifier!;
      return json(route, {
        status: replacementEnrollmentStatus,
        deviceLabel,
        expiresAt: Date.now() + 10 * 60_000,
      });
    }
    if (pathname.endsWith(`/device-enrollment/${approvedEnrollmentId}/status`)) {
      const body = route.request().postDataJSON() as { verifier?: string };
      expect(body.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      verifierFromNewDevice = body.verifier!;
      return json(route, {
        status: approvedEnrollmentStatus,
        deviceLabel,
        expiresAt: Date.now() + 10 * 60_000,
      });
    }
    if (pathname.endsWith(`/device-enrollment/${replacementEnrollmentId}/cancel`)) {
      replacementEnrollmentStatus = "cancelled";
      return json(route, { cancelled: true });
    }
    if (pathname.endsWith(`/device-enrollment/${approvedEnrollmentId}/registration/options`)) {
      const body = route.request().postDataJSON() as { verifier?: string };
      expect(body.verifier).toBe(verifierFromNewDevice);
      expect(approvedEnrollmentStatus).toBe("approved");
      return json(route, makeRegistrationOptions(trustedCredentialId));
    }
    if (pathname.endsWith(`/device-enrollment/${approvedEnrollmentId}/registration/verify`)) {
      const body = route.request().postDataJSON() as {
        verifier?: string;
        response?: { id?: string };
      };
      expect(body.verifier).toBe(verifierFromNewDevice);
      expect(body.response?.id).toMatch(/^[A-Za-z0-9_-]+$/);
      const newPasskey = {
        ...passkeys[0],
        id: body.response!.id!,
        label: deviceLabel,
        createdAt: Date.now(),
      };
      passkeys = [...passkeys, newPasskey];
      approvedEnrollmentStatus = "registered";
      return json(route, { passkey: newPasskey });
    }
    if (pathname === "/api/admin/security/authentication/options" ||
        pathname === "/api/admin/security/authentication/verify") {
      newDeviceAuthenticationCount += 1;
      return json(route, { error: "The new device must explicitly verify its own passkey." });
    }
    return json(route, { error: `Unexpected new-device request: ${pathname}` });
  });

  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await addVirtualAuthenticator(contextA, pageA);
    await addVirtualAuthenticator(contextB, pageB);

    await Promise.all([
      pageA.goto(`${localOrigin.origin}/admin`),
      pageB.goto(`${localOrigin.origin}/admin`),
    ]);
    await Promise.all([
      signInInBrowser(pageA, adminEmail, password),
      signInInBrowser(pageB, adminEmail, password),
    ]);

    await pageA.goto(`${localOrigin.origin}/admin/sicurezza`);
    await pageA.getByTestId("input-passkey-label").fill("Telefono fidato");
    await pageA.getByTestId("button-register-passkey").click();
    await expect(pageA.locator('[data-testid^="row-passkey-"]').first()).toContainText(
      "Telefono fidato",
    );
    expect(passkeys).toHaveLength(1);
    passkeyRequired = true;
    expect(passkeyRequired).toBe(true);

    await pageB.goto(`${localOrigin.origin}/admin/dashboard`);
    await expect(pageB.getByRole("heading", { name: "Verifica passkey" })).toBeVisible();
    await pageB.getByTestId("button-toggle-passkey-options").click();
    await pageB.getByTestId("button-open-device-enrollment").click();
    await expect(pageB.getByTestId("panel-device-enrollment")).toBeVisible();
    await pageB.getByTestId("input-device-enrollment-label").fill(deviceLabel);
    await pageB.getByTestId("button-start-device-enrollment").click();
    await expect(pageB.getByTestId("qr-device-enrollment")).toBeVisible();
    const firstQrMarkup = await pageB.getByTestId("qr-device-enrollment").innerHTML();
    expect(enrollmentStartCount).toBe(1);

    enrollmentStatus = "expired";
    await expect(pageB.getByTestId("text-device-enrollment-expired")).toBeVisible();
    await expect(pageB.getByRole("button", { name: "Genera un nuovo QR" })).toBeEnabled();
    await expect(pageB.getByTestId("qr-device-enrollment")).toHaveCount(0);
    await pageB.getByRole("button", { name: "Genera un nuovo QR" }).click();
    await expect(pageB.getByTestId("qr-device-enrollment")).toBeVisible();
    expect(enrollmentStartCount).toBe(2);
    expect(await pageB.getByTestId("qr-device-enrollment").innerHTML()).not.toBe(firstQrMarkup);

    await pageB.getByRole("button", { name: "Annulla richiesta" }).click();
    await expect(pageB.getByText("Richiesta annullata.")).toBeVisible();
    const cancelledApprovalUrl = new URL(approvalUrl);
    expect(cancelledApprovalUrl.searchParams.get("deviceEnrollment")).toBe(replacementEnrollmentId);
    cancelledApprovalUrl.port = String(localOrigin.port);
    await pageA.goto(cancelledApprovalUrl.toString());
    await expect(pageA.getByText(/Richiesta annullata/)).toBeVisible();
    await expect(pageA.getByRole("button", { name: "Approva e verifica con passkey" })).toHaveCount(0);

    await pageB.getByRole("button", { name: "Mostra il QR di autorizzazione" }).click();
    await expect(pageB.getByTestId("qr-device-enrollment")).toBeVisible();
    expect(enrollmentStartCount).toBe(3);

    const expiredApprovalUrl = new URL(
      `https://imagestudiofotografico.com/admin/authorize-device?deviceEnrollment=${enrollmentId}`,
    );
    expect(expiredApprovalUrl.origin).toBe("https://imagestudiofotografico.com");
    expect(expiredApprovalUrl.pathname).toBe("/admin/authorize-device");
    expect(expiredApprovalUrl.searchParams.get("deviceEnrollment")).toBe(enrollmentId);
    expiredApprovalUrl.port = String(localOrigin.port);
    await pageA.goto(expiredApprovalUrl.toString());
    await expect(pageA.getByText(/Questo QR è scaduto/)).toBeVisible();
    await expect(pageA.getByRole("button", { name: "Approva e verifica con passkey" })).toHaveCount(0);
    const staleApprovalResponse = await pageA.evaluate(async (id) => {
      const response = await fetch(`/api/admin/security/device-enrollment/${id}/authentication/options`, {
        method: "POST",
      });
      return response.status;
    }, enrollmentId);
    expect(staleApprovalResponse).toBe(404);
    expect(staleApprovalOptionsAttempts).toBe(1);

    const parsedApprovalUrl = new URL(approvalUrl);
    expect(parsedApprovalUrl.origin).toBe("https://imagestudiofotografico.com");
    expect(parsedApprovalUrl.pathname).toBe("/admin/authorize-device");
    expect(parsedApprovalUrl.searchParams.get("deviceEnrollment")).toBe(approvedEnrollmentId);
    expect([...parsedApprovalUrl.searchParams.keys()]).toEqual(["deviceEnrollment"]);

    // Il QR punta al dominio ufficiale; il test sostituisce solo la porta per
    // servire in locale la stessa origine sicura e non contattare la produzione.
    parsedApprovalUrl.port = String(localOrigin.port);
    await pageA.goto(parsedApprovalUrl.toString());
    await expect(pageA.getByRole("heading", { name: "Autorizza un nuovo dispositivo" })).toBeVisible();
    await expect(pageA.getByText(deviceLabel)).toBeVisible();
    await pageA.getByRole("button", { name: "Approva e verifica con passkey" }).click();
    await expect(pageA.getByText(/Autorizzazione completata/)).toBeVisible();
    expect(approvalVerificationCount).toBe(1);

    await expect(pageB.getByTestId("button-register-approved-device")).toBeVisible({
      timeout: 10_000,
    });
    await pageB.getByTestId("button-register-approved-device").click();
    await expect(pageB.getByText(/Passkey aggiunta/)).toBeVisible();

    // L’approvazione non trasferisce la sessione e la sola registrazione non
    // sblocca il pannello: chiudi il dialogo e verifica la nuova passkey.
    await pageB.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(pageB.getByRole("heading", { name: "Verifica passkey" })).toBeVisible();
    await expect(pageB.getByTestId("button-verify-passkey")).toBeVisible();
    await expect(pageB.getByTestId("button-register-approved-device")).toHaveCount(0);
    await pageA.reload();
    await expect(pageA.getByText(/La registrazione è già stata completata/)).toBeVisible();
    await expect(pageA.getByRole("button", { name: "Approva e verifica con passkey" })).toHaveCount(0);
    expect(newDeviceAuthenticationCount).toBe(0);
    expect(approvedEnrollmentStatus).toBe("registered");
    expect(passkeys).toHaveLength(2);
  } finally {
    await Promise.allSettled([contextA.close(), contextB.close()]);
    await browser.close().catch(() => undefined);
    await localOrigin.close();
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

test("admin grouped jobs list keeps filters, selection, paging, and row actions working", async () => {
  test.setTimeout(150_000);
  requireLoopbackEndpoint(baseURL, "ADMIN_PASSKEY_E2E_BASE_URL");
  requireLoopbackEndpoint(authEmulator, "ADMIN_PASSKEY_E2E_AUTH_EMULATOR");
  requireLoopbackEndpoint(firestoreEmulator, "ADMIN_PASSKEY_E2E_FIRESTORE_EMULATOR");
  await resetDisposableEmulators();

  const password = `Test-${randomBytes(18).toString("hex")}!`;
  const idToken = await seedDisposableAdmin(password);
  const clientId = "e2e-grouped-jobs-client";
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const dayAt = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    date.setHours(12, 0, 0, 0);
    return date;
  };
  const dateAt = (year: number, month: number, day: number, hour = 12, minute = 0) =>
    new Date(year, month, day, hour, minute, 0, 0);
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const makeJob = (
    id: string,
    nomeEvento: string,
    status: string,
    eventDate?: Date,
    jobType = "matrimonio",
  ) => ({
    id,
    nomeEvento,
    clientiIds: [clientId],
    jobType,
    dataNonDefinita: !eventDate,
    allDay: false,
    ...(eventDate ? { eventDate: eventDate.toISOString() } : {}),
    startTime: "12:00",
    endTime: "13:00",
    eventLocation: "Luogo sintetico",
    status,
    financials: {
      totalePreventivato: 200,
      totaleOrdini: 200,
      totalePagato: 50,
      saldoResiduo: 150,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const todayJob = makeJob(
    "e2e-grouped-today",
    "E2E - Evento di oggi",
    "confermato",
    today,
  );
  const nextJob = makeJob(
    "e2e-grouped-next",
    "E2E - Evento confermato con un titolo molto lungo per controllare la leggibilità sullo schermo stretto",
    "confermato",
    dayAt(1),
  );
  const undatedJob = makeJob(
    "e2e-grouped-undated",
    "E2E - Data da definire",
    "confermato",
  );
  const pastJob = makeJob(
    "e2e-grouped-past",
    "E2E - Evento passato",
    "consegnato",
    dayAt(-1),
  );
  const leadJob = makeJob(
    "e2e-grouped-lead",
    "E2E - Richiesta in arrivo",
    "lead",
  );
  const printJob = makeJob(
    "e2e-grouped-print",
    "E2E - Lavoro stampa",
    "confermato",
    dayAt(2),
    "stampa",
  );
  const rangeEndDate = dayAt(2);
  rangeEndDate.setHours(18, 45, 0, 0);
  const rangeEndJob = makeJob(
    "e2e-grouped-range-end",
    "E2E - Fine intervallo",
    "confermato",
    rangeEndDate,
  );
  const semesterYear = today.getFullYear() + 3;
  const semesterJobs = [
    makeJob(
      "e2e-grouped-semester-jan",
      "E2E - Primo semestre gennaio",
      "confermato",
      dateAt(semesterYear, 0, 15),
    ),
    makeJob(
      "e2e-grouped-semester-jun",
      "E2E - Primo semestre giugno",
      "confermato",
      dateAt(semesterYear, 5, 30),
    ),
    makeJob(
      "e2e-grouped-semester-jul",
      "E2E - Secondo semestre luglio",
      "confermato",
      dateAt(semesterYear, 6, 1),
    ),
    makeJob(
      "e2e-grouped-semester-dec",
      "E2E - Secondo semestre dicembre",
      "confermato",
      dateAt(semesterYear, 11, 15),
    ),
  ];
  const bulkJob = makeJob(
    "e2e-grouped-bulk-delete",
    "E2E - Eliminazione sicura",
    "confermato",
  );
  const fillerJobs = Array.from({ length: 27 }, (_, index) =>
    makeJob(
      `e2e-grouped-filler-${index + 1}`,
      `E2E - Futuro ${String(index + 1).padStart(2, "0")}`,
      "confermato",
      dayAt(index + 3),
    ),
  );
  const fixtureJobs = [
    todayJob,
    nextJob,
    undatedJob,
    pastJob,
    leadJob,
    printJob,
    rangeEndJob,
    ...semesterJobs,
    ...fillerJobs,
    bulkJob,
  ];
  const deletedJobIds = new Set<string>();
  const collaboratorAssignment = {
    id: "e2e-grouped-assignment",
    jobId: todayJob.id,
    collaboratoreId: "e2e-grouped-collaborator",
    status: "accepted",
  };

  await Promise.all([
    seedFirestoreDocument(idToken, `clienti/${clientId}`, {
      nome: "Cliente",
      cognome: "Test Raggruppamento",
      email: "grouped-jobs@example.invalid",
      lifecycle: { lastInteractionAt: new Date(), status: "lead" },
      sourceRefs: { jobIds: [todayJob.id, bulkJob.id] },
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    seedFirestoreDocument(idToken, `jobTypes/matrimonio`, {
      slug: "matrimonio",
      nome: "Matrimonio",
      colore: "#53745f",
      attivo: true,
      ordine: 1,
    }),
    seedFirestoreDocument(idToken, `jobTypes/stampa`, {
      slug: "stampa",
      nome: "Stampa",
      colore: "#5278a5",
      attivo: true,
      ordine: 2,
    }),
    seedFirestoreDocument(idToken, `jobs/${todayJob.id}`, todayJob),
    seedFirestoreDocument(idToken, `jobs/${bulkJob.id}`, bulkJob),
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
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];

  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      await route.abort("blockedbyclient");
      return;
    }

    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
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
    if (url.pathname === "/api/jobs/list-aggregates") {
      await json({
        transactionCounts: { [todayJob.id]: 2 },
        quotesStatus: {
          [leadJob.id]: {
            hasQuote: true,
            isSigned: false,
            isEmailSent: true,
          },
        },
        financialsByJob: {
          [todayJob.id]: { totalePagato: 50, saldoResiduo: 150 },
        },
      });
      return;
    }
    if (url.pathname === "/api/jobs" && route.request().method() === "GET") {
      await json({
        jobs: fixtureJobs.filter((job) => !deletedJobIds.has(job.id)),
      });
      return;
    }
    if (
      url.pathname.startsWith("/api/jobs/") &&
      url.pathname.endsWith("/calendar-event") &&
      route.request().method() === "DELETE"
    ) {
      const jobId = url.pathname.split("/")[3];
      deletedJobIds.add(jobId);
      await json({ ok: true });
      return;
    }
    const jobDetailMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (jobDetailMatch && route.request().method() === "GET") {
      const job = fixtureJobs.find((entry) => entry.id === jobDetailMatch[1]);
      await json(job ? { job } : { error: "not found" }, job ? 200 : 404);
      return;
    }
    if (url.pathname === "/api/collaboratori") {
      await json([
        {
          id: collaboratorAssignment.collaboratoreId,
          nome: "Collaboratore",
          cognome: "Sintetico",
          attivo: true,
        },
      ]);
      return;
    }
    if (url.pathname === "/api/collaboratori/assignments") {
      await json([collaboratorAssignment]);
      return;
    }
    if (url.pathname.startsWith("/api/collaboratori/assignments/job/")) {
      await json([]);
      return;
    }

    await route.continue();
  });
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));

  try {
    await page.goto(localUrl("/admin"));
    await signIn(page, password);
    await page.goto(localUrl("/admin/jobs"));
    await expect(
      page.getByRole("heading", {
        name: "Gestione Lavori",
        exact: true,
        level: 2,
      }),
    ).toBeVisible();

    // Controlla la vista raggruppata sul display più stretto richiesto prima
    // delle verifiche desktop di filtri, selezione e paginazione.
    await page.setViewportSize({ width: 320, height: 874 });
    await page.getByTestId("select-filter-time").click();
    await page.getByRole("option", { name: "Tutti i periodi" }).click();
    await page.getByTestId("select-items-per-page").click();
    await page.getByRole("option", { name: "100", exact: true }).click();

    const jobsTable = page.locator("table").filter({
      has: page.getByTestId(`job-row-${todayJob.id}`),
    });
    const jobsTableScroller = jobsTable.locator("xpath=..");
    const mobileTableSize = await jobsTableScroller.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(mobileTableSize.scrollWidth).toBeGreaterThan(mobileTableSize.clientWidth);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    // Leads remain in their dedicated queue instead of being rendered among
    // grouped, signed jobs.
    await expect(page.getByTestId("card-filter-leads")).toBeVisible();
    await expect(page.getByTestId(`job-row-${leadJob.id}`)).toHaveCount(0);
    await expect(page.getByTestId("jobs-section-today")).toBeVisible();
    await expect(page.getByTestId("jobs-section-upcoming")).toBeVisible();
    await expect(page.getByTestId("jobs-section-undated")).toBeVisible();
    await expect(page.getByTestId("jobs-section-past")).toBeVisible();
    await expect(page.getByTestId("jobs-section-today")).toContainText("Eventi confermati per oggi");
    await expect(page.getByTestId("jobs-section-upcoming")).toContainText("In arrivo");
    await expect(page.getByTestId("jobs-section-past")).toContainText("Eventi passati");
    await expect(page.getByTestId(`job-row-${nextJob.id}`).getByText(nextJob.nomeEvento)).toBeVisible();
    await expect(page.getByTestId(`job-row-${nextJob.id}`)).toContainText(
      "E2E - Evento confermato con un titolo molto lungo per controllare la leggibilità sullo schermo stretto",
    );

    const mobileTodayRow = page.getByTestId(`job-row-${todayJob.id}`);
    const mobileCollaboratorAction = mobileTodayRow.getByRole("button", {
      name: "Aggiungi o gestisci collaboratori (1 assegnati)",
    });
    await expect(mobileCollaboratorAction).toBeVisible();
    expect(await mobileCollaboratorAction.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThanOrEqual(44);
    await mobileCollaboratorAction.click();
    await expect(
      page.getByRole("dialog").getByText(`Collaboratori · ${todayJob.nomeEvento}`),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await jobsTableScroller.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      "lo scorrimento laterale della tabella non deve allargare la pagina",
    ).toBe(true);
    const mobileTypeAction = mobileTodayRow.locator("td").nth(5).getByRole("combobox");
    await expect(mobileTypeAction).toBeVisible();
    await mobileTypeAction.click({ timeout: 10_000 });
    await expect(page.getByRole("option", { name: "Stampa", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await jobsTableScroller.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await mobileTodayRow.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath("jobs-list-mobile-320x874.png"),
    });
    await page.getByTestId("select-items-per-page").click();
    await page.getByRole("option", { name: "25", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });

    // Search is applied within the current view, and leaves only the matching
    // data row plus its own group heading.
    await page.getByTestId("input-search-jobs").fill("E2E - Evento di oggi");
    await expect(page.getByTestId(`job-row-${todayJob.id}`)).toBeVisible();
    await expect(page.locator('[data-testid^="job-row-"]')).toHaveCount(1);
    await expect(page.getByTestId("jobs-section-today")).toBeVisible();
    await page.getByTestId("input-search-jobs").fill("");

    // Type and period filters include the grouped section logic.
    await page.getByTestId("card-filter-stampa").click();
    await expect(page.getByTestId(`job-row-${printJob.id}`)).toBeVisible();
    await expect(page.locator('[data-testid^="job-row-"]')).toHaveCount(1);
    await page.getByTestId("card-filter-all").click();
    await page.getByTestId("select-filter-time").click();
    await page.getByRole("option", { name: "Impegni Passati" }).click();
    await expect(page.getByTestId(`job-row-${pastJob.id}`)).toBeVisible();
    await expect(page.getByTestId(`job-row-${leadJob.id}`)).toHaveCount(0);
    await expect(page.getByTestId("jobs-section-past")).toBeVisible();
    await page.getByTestId("select-filter-time").click();
    await page.getByRole("option", { name: "Tutti i periodi" }).click();
    await expect(page.locator('[data-testid^="job-row-"]')).toHaveCount(25);

    await page.getByTestId("select-filter-quote").click();
    await page.getByRole("option", { name: "Non firmato" }).click();
    await expect(page.getByTestId(`job-row-${leadJob.id}`)).toBeVisible();
    await expect(page.locator('[data-testid^="job-row-"]')).toHaveCount(1);
    await page.getByTestId("select-filter-quote").click();
    await page.getByRole("option", { name: "Tutti i preventivi" }).click();
    await page.getByTestId("card-filter-all").click();

    await page.getByTestId("select-filter-collaboratore").click();
    await page.getByRole("option", { name: "Collaboratore Sintetico" }).click();
    await expect(page.getByTestId(`job-row-${todayJob.id}`)).toBeVisible();
    await expect(page.locator('[data-testid^="job-row-"]')).toHaveCount(1);
    await page.getByTestId("select-filter-collaboratore").click();
    await page.getByRole("option", { name: "Tutti i collaboratori" }).click();

    const currentYear = String(today.getFullYear());
    const currentMonth = [
      "Gennaio",
      "Febbraio",
      "Marzo",
      "Aprile",
      "Maggio",
      "Giugno",
      "Luglio",
      "Agosto",
      "Settembre",
      "Ottobre",
      "Novembre",
      "Dicembre",
    ][today.getMonth()];
    await page.getByTestId("select-filter-year").click();
    await page.getByRole("option", { name: currentYear, exact: true }).click();
    await page.getByTestId("select-filter-month").click();
    await page.getByRole("option", { name: currentMonth, exact: true }).click();
    await expect(page.getByTestId(`job-row-${todayJob.id}`)).toBeVisible();
    await page.getByTestId("select-filter-year").click();
    await page.getByRole("option", { name: "Tutti gli anni" }).click();

    // The custom range includes both calendar dates in full, including events
    // later than midnight on the selected end date. The section badge must
    // reflect only the two rows in the range.
    await page.getByTestId("card-filter-matrimonio").click();
    const rangeStartDate = dayAt(1);
    const rangeJobIds = [nextJob.id, rangeEndJob.id];
    await page.getByTestId("button-custom-date-range").click();
    await page
      .locator(`[data-day="${dateKey(rangeStartDate)}"]:not([data-outside]) button`)
      .click();
    await page
      .locator(`[data-day="${dateKey(rangeEndDate)}"]:not([data-outside]) button`)
      .click({ timeout: 10_000 });
    await expect(page.locator('[data-testid^="job-row-"]')).toHaveCount(2);
    for (const jobId of rangeJobIds) {
      await expect(page.getByTestId(`job-row-${jobId}`)).toBeVisible();
    }
    await expect(page.getByTestId(`job-row-${todayJob.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`job-row-${fillerJobs[0].id}`)).toHaveCount(0);
    await expect(
      page.getByTestId("jobs-section-upcoming").getByText("2", { exact: true }),
    ).toBeVisible();

    // The semester controls use synthetic dates in all four boundary months,
    // proving both halves include their start/end months and show matching
    // grouped rows and section totals.
    await page.getByTestId("button-clear-filters").click();
    await page.getByTestId("select-filter-time").click();
    await page.getByRole("option", { name: "Tutti i periodi" }).click();
    await page.getByTestId("select-filter-year").click();
    await page.getByRole("option", { name: String(semesterYear), exact: true }).click();
    await page.getByTestId("select-filter-semester").click();
    await page.getByRole("option", { name: "1° Sem", exact: true }).click();
    const firstSemesterJobIds = semesterJobs.slice(0, 2).map((job) => job.id);
    await expect(page.locator('[data-testid^="job-row-"]')).toHaveCount(2);
    for (const jobId of firstSemesterJobIds) {
      await expect(page.getByTestId(`job-row-${jobId}`)).toBeVisible();
    }
    await expect(
      page.getByTestId("jobs-section-upcoming").getByText("2", { exact: true }),
    ).toBeVisible();

    await page.getByTestId("select-filter-semester").click();
    await page.getByRole("option", { name: "2° Sem", exact: true }).click();
    const secondSemesterJobIds = semesterJobs.slice(2).map((job) => job.id);
    await expect(page.locator('[data-testid^="job-row-"]')).toHaveCount(2);
    for (const jobId of secondSemesterJobIds) {
      await expect(page.getByTestId(`job-row-${jobId}`)).toBeVisible();
    }
    await expect(
      page.getByTestId("jobs-section-upcoming").getByText("2", { exact: true }),
    ).toBeVisible();
    await page.getByTestId("button-clear-filters").click();
    await page.getByTestId("card-filter-all").click();

    // Single and page-wide selection count only actual job rows, never group
    // headings. Selection stays attached to the chosen page when paging.
    await page.getByTestId(`checkbox-job-${todayJob.id}`).click();
    await expect(page.getByText("1 lavori selezionati")).toBeVisible();
    await page.getByTestId(`checkbox-job-${todayJob.id}`).click();
    await page.getByTestId("checkbox-select-all").click();
    await expect(page.getByText("25 lavori selezionati")).toBeVisible();
    await expect(
      page.locator('[data-testid^="jobs-section-"] [role="checkbox"]'),
    ).toHaveCount(0);
    await page.getByTestId("checkbox-select-all").click();
    await expect(page.getByText("lavori selezionati")).toHaveCount(0);

    await page.getByTestId("select-items-per-page").click();
    await page.getByRole("option", { name: "10", exact: true }).click();
    await expect(page.locator('[data-testid^="job-row-"]')).toHaveCount(10);
    await page.getByTestId("button-next-page").click();
    await expect(page.getByTestId("select-page-number")).toContainText("Pagina 2/4");
    await page.getByTestId("checkbox-select-all").click();
    await expect(page.getByText("10 lavori selezionati")).toBeVisible();
    await page.getByTestId("button-first-page").click();
    await expect(page.getByText("10 lavori selezionati")).toBeVisible();

    // A search change clears selection for jobs no longer in the results.
    await page.getByTestId("input-search-jobs").fill("E2E - Evento di oggi");
    await expect(page.getByTestId(`job-row-${todayJob.id}`)).toBeVisible();
    await expect(page.getByText("lavori selezionati")).toHaveCount(0);
    await expect(page.getByTestId("button-delete-selected")).toHaveCount(0);
    await page.getByTestId("input-search-jobs").fill("");

    // A type-filter change follows the same rule, even when the selection was
    // made while the selected job was visible in the unfiltered list.
    await page.getByTestId(`checkbox-job-${printJob.id}`).click();
    await expect(page.getByText("1 lavori selezionati")).toBeVisible();
    await page.getByTestId("card-filter-matrimonio").click();
    await expect(page.getByTestId(`job-row-${printJob.id}`)).toHaveCount(0);
    await expect(page.getByText("lavori selezionati")).toHaveCount(0);
    await expect(page.getByTestId("button-delete-selected")).toHaveCount(0);
    await page.getByTestId("card-filter-all").click();

    // The row-level event type, collaborator action, and payment tooltip remain
    // usable even though section headers are inserted between data rows.
    const todayRow = page.getByTestId(`job-row-${todayJob.id}`);
    await todayRow.locator("td").nth(5).getByRole("combobox").click();
    await page.getByRole("option", { name: "Stampa", exact: true }).click();
    await expect(page.getByText("Tipo aggiornato")).toBeVisible();
    const changedJobResponse = await fetch(
      `${firestoreEmulator}/v1/projects/${projectId}/databases/(default)/documents/jobs/${todayJob.id}`,
      { headers: { Authorization: `Bearer ${idToken}` } },
    );
    expect(changedJobResponse.ok).toBe(true);
    const changedJobDocument = (await changedJobResponse.json()) as {
      fields?: { jobType?: { stringValue?: string } };
    };
    expect(changedJobDocument.fields?.jobType?.stringValue).toBe("stampa");

    await todayRow.getByRole("button", {
      name: "Aggiungi o gestisci collaboratori (1 assegnati)",
    }).click();
    await expect(
      page.getByRole("dialog").getByText(`Collaboratori · ${todayJob.nomeEvento}`),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    const paymentCell = todayRow.locator("td").nth(8);
    await expect(paymentCell.getByText("2", { exact: true })).toBeVisible();
    await paymentCell.hover();
    await expect(page.getByText(/Preventivato:/)).toBeVisible();
    await expect(page.getByText(/Pagato:/)).toBeVisible();
    await expect(page.getByText(/Residuo:/)).toBeVisible();

    await todayRow.getByText(todayJob.nomeEvento, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/jobs/${todayJob.id}$`));
    await expect(
      page.getByRole("heading", { name: todayJob.nomeEvento, exact: true }),
    ).toBeVisible();

    // Confirm the destructive action only against an isolated emulator fixture.
    await page.goto(localUrl("/admin/jobs"));
    await page.getByTestId("input-search-jobs").fill("E2E - Eliminazione sicura");
    await expect(page.locator('[data-testid^="job-row-"]')).toHaveCount(1);
    await page.getByTestId(`checkbox-job-${bulkJob.id}`).click();
    await page.getByTestId("button-delete-selected").click();
    await expect(page.getByText(/Stai per eliminare/)).toContainText("1 lavori");
    await expect(page.getByTestId(`delete-target-${bulkJob.id}`)).toHaveText(bulkJob.nomeEvento);
    await page.getByRole("button", { name: "Elimina 1 lavori" }).click();
    await expect(page.getByText("Lavori eliminati", { exact: true })).toBeVisible();
    await expect(page.getByTestId(`job-row-${bulkJob.id}`)).toHaveCount(0);

    const deletedJobResponse = await fetch(
      `${firestoreEmulator}/v1/projects/${projectId}/databases/(default)/documents/jobs/${bulkJob.id}`,
      { headers: { Authorization: `Bearer ${idToken}` } },
    );
    expect(deletedJobResponse.status).toBe(404);
    expect(pageErrors, "errori non gestiti della pagina").toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});