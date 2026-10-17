import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const projectId = "wedding-gallery-397b6";
const authEmulator = "http://127.0.0.1:9099";
const firestoreEmulator = "http://127.0.0.1:8089";
const adminEmail = "gennaro.mazzacane@gmail.com";
const jobId = "e2e-job-cost-payment";
const advancesJobId = "e2e-job-collaborator-advances";
const advancesAssignmentId = "e2e-job-collaborator-advances-assignment";
const advancesCostId = "e2e-job-collaborator-existing-cost";
const costId = "e2e-job-cost";
const movementId = "e2e-cash-payment";
const jobName = "E2E - Abbinamento pagamento";
const labJobId = "e2e-lab-payment-photobook";
const labJobName = "E2E - Fotolibro Caffè";
const rossiJobId = "e2e-lab-payment-rossi";
const rossiJobName = "E2E - Album consegna";
const fillerLabJobs = Array.from({ length: 4 }, (_, index) => ({
  id: `e2e-lab-payment-filler-${index + 1}`,
  nomeEvento: `E2E - Invio laboratorio ${index + 1}`,
  jobType: "stampa",
  clientNames: [`Cliente di prova ${index + 1}`],
}));
const firstLabId = "e2e-lab-aversa";
const secondLabId = "e2e-lab-napoli";
const costDescription = "Costo di prova abbinamento";
const amount = 145.5;
const paymentDate = new Date("2026-10-01T10:00:00.000Z");

type FirestoreRestValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreRestValue[] } }
  | { mapValue: { fields: Record<string, FirestoreRestValue> } };

interface LocalCollaboratorApiState {
  assignments: Array<Record<string, any>>;
  assignmentReads: number;
  paymentWrites: Array<{ assignmentId: string; payload: Record<string, any> }>;
  paymentRequestCount?: number;
  failNextPaymentRequests?: number;
}

function requireLoopback(raw: string, label: string): void {
  const hostname = new URL(raw).hostname.replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(`${label} must use a loopback host; refusing to touch non-local services`);
  }
}

function toFirestoreValue(value: unknown): FirestoreRestValue {
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
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value)
            .filter(([, fieldValue]) => fieldValue !== undefined)
            .map(([key, fieldValue]) => [key, toFirestoreValue(fieldValue)]),
        ),
      },
    };
  }
  throw new Error(`Unsupported Firestore fixture value: ${typeof value}`);
}

function fromFirestoreValue(value: FirestoreRestValue): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return new Date(value.timestampValue);
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields).map(([key, field]) => [
        key,
        fromFirestoreValue(field),
      ]),
    );
  }
  throw new Error("Unrecognized Firestore emulator value.");
}

function documentsUrl(path: string): string {
  return `${firestoreEmulator}/v1/projects/${projectId}/databases/(default)/documents/${path}`;
}

async function resetDisposableEmulators(): Promise<void> {
  requireLoopback(authEmulator, "Auth emulator");
  requireLoopback(firestoreEmulator, "Firestore emulator");
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

async function createAdminSession(): Promise<{ password: string; idToken: string }> {
  const password = `E2E-${randomBytes(18).toString("hex")}!`;
  const response = await fetch(
    `${authEmulator}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=job-cost-payment-e2e`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: adminEmail,
        password,
        returnSecureToken: true,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Auth emulator fixture setup failed: ${response.status} ${await response.text()}`);
  }
  const { idToken } = (await response.json()) as { idToken: string };
  return { password, idToken };
}

async function writeFirestoreDocument(
  idToken: string,
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(documentsUrl(path), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: Object.fromEntries(
        Object.entries(data)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, toFirestoreValue(value)]),
      ),
    }),
  });
  if (!response.ok) {
    throw new Error(`Firestore fixture setup failed for ${path}: ${response.status} ${await response.text()}`);
  }
}

async function updateFirestoreField(
  idToken: string,
  path: string,
  field: string,
  value: unknown,
): Promise<void> {
  const url = new URL(documentsUrl(path));
  url.searchParams.append("updateMask.fieldPaths", field);
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: { [field]: toFirestoreValue(value) } }),
  });
  if (!response.ok) {
    throw new Error(`Firestore concurrent-change fixture failed: ${response.status} ${await response.text()}`);
  }
}

async function readFirestoreDocument(
  idToken: string,
  path: string,
): Promise<Record<string, any>> {
  const response = await fetch(documentsUrl(path), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) {
    throw new Error(`Could not read Firestore fixture ${path}: ${response.status} ${await response.text()}`);
  }
  const document = (await response.json()) as {
    fields?: Record<string, FirestoreRestValue>;
  };
  return Object.fromEntries(
    Object.entries(document.fields ?? {}).map(([key, value]) => [
      key,
      fromFirestoreValue(value),
    ]),
  );
}

async function listFirestoreCollection(
  idToken: string,
  collection: string,
): Promise<Record<string, any>[]> {
  const response = await fetch(`${documentsUrl(collection)}?pageSize=100`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) {
    throw new Error(`Could not list Firestore collection ${collection}: ${response.status} ${await response.text()}`);
  }
  const result = (await response.json()) as {
    documents?: Array<{ name: string; fields?: Record<string, FirestoreRestValue> }>;
  };
  return (result.documents ?? []).map((document) => ({
    id: document.name.split("/").at(-1),
    ...Object.fromEntries(
      Object.entries(document.fields ?? {}).map(([key, value]) => [key, fromFirestoreValue(value)]),
    ),
  }));
}

async function seedFixture(idToken: string): Promise<{
  job: Record<string, any>;
  movement: Record<string, any>;
}> {
  const job = {
    nomeEvento: jobName,
    jobType: "matrimonio",
    status: "confermato",
    clientiIds: [],
    costi: [
      {
        id: costId,
        descrizione: costDescription,
        importo: amount,
        tipo: "materiale",
        data: paymentDate,
      },
    ],
    financials: {
      totalePreventivato: 400,
      totaleOrdini: 0,
      totalePagato: 0,
      saldoResiduo: 0,
    },
    eventDate: paymentDate,
    createdAt: paymentDate,
    updatedAt: paymentDate,
  };
  const movement = {
    tipo: "uscita",
    importo: amount,
    data: paymentDate,
    metodoPagamento: "bonifico",
    categoria: "Fornitori",
    descrizione: "Pagamento sintetico di prova",
    createdAt: paymentDate,
    updatedAt: paymentDate,
  };
  const labJob = {
    nomeEvento: labJobName,
    jobType: "fotolibro",
    clientNames: ["Giulia D'Ambrósio"],
    status: "confermato",
    clientiIds: [],
    costi: [],
    financials: { totalePreventivato: 0, totaleOrdini: 0, totalePagato: 0, saldoResiduo: 0 },
    eventDate: paymentDate,
    createdAt: paymentDate,
    updatedAt: paymentDate,
  };
  await Promise.all([
    writeFirestoreDocument(idToken, `jobs/${jobId}`, job),
    writeFirestoreDocument(idToken, `cashMovements/${movementId}`, movement),
    writeFirestoreDocument(idToken, `jobs/${labJobId}`, labJob),
  ]);
  return { job, movement };
}

async function seedAdvancesFixture(idToken: string): Promise<{
  job: Record<string, any>;
  assignment: Record<string, any>;
}> {
  const existingCost = {
    id: advancesCostId,
    descrizione: "Costi già registrati",
    importo: 570,
    tipo: "materiale",
    data: paymentDate,
  };
  const payments = [
    {
      id: "e2e-advance-400",
      tipo: "acconto",
      importo: 400,
      data: paymentDate,
      metodo: "bonifico",
      note: "Primo acconto",
    },
    {
      id: "e2e-advance-250",
      tipo: "acconto",
      importo: 250,
      data: new Date("2026-10-02T10:00:00.000Z"),
      metodo: "bonifico",
      note: "Secondo acconto",
    },
  ];
  const job = {
    nomeEvento: "E2E - Acconti collaboratore",
    jobType: "matrimonio",
    status: "confermato",
    clientiIds: [],
    costi: [existingCost],
    financials: {
      totalePreventivato: 3000,
      totaleOrdini: 0,
      totalePagato: 0,
      saldoResiduo: 3000,
    },
    eventDate: paymentDate,
    createdAt: paymentDate,
    updatedAt: paymentDate,
  };
  const assignment = {
    jobId: advancesJobId,
    collaboratoreId: "e2e-collaborator-advances",
    ruoloInJob: "fotografo_secondario",
    compenso: 900,
    tipoPagamento: "forfait",
    status: "accepted",
    isPagato: false,
    pagamenti: payments,
    saldoResiduo: 250,
    dataRichiesta: paymentDate,
    createdAt: paymentDate,
    updatedAt: paymentDate,
  };

  await writeFirestoreDocument(idToken, `jobs/${advancesJobId}`, job);
  return { job, assignment: { id: advancesAssignmentId, ...assignment } };
}

async function installLocalRoutes(
  page: Page,
  idToken: string,
  securityStatus: Record<string, unknown> = {
    passkeyRequired: false,
    passkeys: [],
    recoveryCodesRemaining: 0,
    recoveryCodesGeneratedAt: null,
    lockedUntil: null,
    verified: false,
    activationReady: false,
    verifiedUntil: null,
    expectedClaim: null,
  },
  localState: LocalCollaboratorApiState = {
    assignments: [],
    assignmentReads: 0,
    paymentWrites: [],
  },
): Promise<void> {
  requireLoopback(process.env.JOB_COST_PAYMENT_E2E_BASE_URL || "http://127.0.0.1:4181", "App URL");
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      await route.abort("blockedbyclient");
      return;
    }
    if (!url.pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const method = route.request().method();
    const addPaymentMatch = url.pathname.match(
      /^\/api\/collaboratori\/assignments\/([^/]+)\/add-payment$/,
    );
    if (method === "POST" && addPaymentMatch) {
      localState.paymentRequestCount = (localState.paymentRequestCount ?? 0) + 1;
      if ((localState.failNextPaymentRequests ?? 0) > 0) {
        localState.failNextPaymentRequests = (localState.failNextPaymentRequests ?? 0) - 1;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Errore temporaneo di registrazione." }),
        });
        return;
      }

      const assignmentId = decodeURIComponent(addPaymentMatch[1]);
      const assignment = localState.assignments.find((item) => item.id === assignmentId);
      if (!assignment) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "Fixture incarico non trovato." }),
        });
        return;
      }

      const payload = route.request().postDataJSON() as {
        importo: number;
        tipo: string;
        metodo: string;
        note?: string;
        data: string;
      };
      localState.paymentWrites.push({ assignmentId, payload });
      const paymentDate = new Date(`${payload.data}T12:00:00.000Z`);
      const payment = {
        id: `e2e-payment-${localState.paymentWrites.length}`,
        tipo: payload.tipo,
        importo: payload.importo,
        metodo: payload.metodo,
        ...(payload.note ? { note: payload.note } : {}),
        data: {
          _seconds: Math.floor(paymentDate.getTime() / 1000),
          _nanoseconds: 0,
        },
        cashMovementId: `e2e-cash-movement-${localState.paymentWrites.length}`,
      };
      const pagamenti = [...(assignment.pagamenti || []), payment];
      const totalePagato = pagamenti.reduce((sum, item) => sum + item.importo, 0);
      const saldoResiduo = Math.max(0, assignment.compenso - totalePagato);
      localState.assignments = localState.assignments.map((item) =>
        item.id === assignmentId
          ? {
              ...item,
              pagamenti,
              saldoResiduo,
              isPagato: assignment.compenso > 0 && saldoResiduo <= 0,
            }
          : item,
      );
      await json({ success: true });
      return;
    }
    if (method !== "GET") {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "API writes are disabled in this isolated test." }),
      });
      return;
    }
    if (url.pathname === `/api/jobs/${jobId}`) {
      const job = await readFirestoreDocument(idToken, `jobs/${jobId}`);
      await json({ job: { ...job, id: jobId } });
      return;
    }
    if (url.pathname === `/api/jobs/${advancesJobId}`) {
      const job = await readFirestoreDocument(idToken, `jobs/${advancesJobId}`);
      await json({ job: { ...job, id: advancesJobId } });
      return;
    }
    if (
      url.pathname === `/api/jobs/${jobId}/timeline`
      || url.pathname === `/api/jobs/${advancesJobId}/timeline`
    ) {
      await json({ events: [] });
      return;
    }
    if (url.pathname.startsWith("/api/payment-schedules/job/")) {
      await json([]);
      return;
    }
    if (url.pathname === "/api/admin/security/status") {
      await json(securityStatus);
      return;
    }
    if (url.pathname === "/api/gift-cards/shop") {
      await json({ types: [] });
      return;
    }
    if (url.pathname === "/api/reminders/status") {
      await json({
        success: true,
        timestamp: paymentDate.toISOString(),
        bookings: { total: 0, withReminder: 0, pending: 0, list: [] },
        consultations: { total: 0, withReminder: 0, pending: 0, list: [] },
      });
      return;
    }
    if (url.pathname === "/api/jobs/list-aggregates") {
      await json({ transactionCounts: {}, quotesStatus: {}, financialsByJob: {} });
      return;
    }
    if (url.pathname === "/api/jobs") {
      const job = await readFirestoreDocument(idToken, `jobs/${jobId}`);
      const labJob = await readFirestoreDocument(idToken, `jobs/${labJobId}`);
      await json({
        jobs: [
          { ...job, id: jobId },
          { ...labJob, id: labJobId },
          {
            id: rossiJobId,
            nomeEvento: rossiJobName,
            jobType: "fotolibro",
            clientNames: ["Marco Rossi"],
          },
          ...fillerLabJobs,
        ],
      });
      return;
    }
    if (url.pathname === "/api/calendar/events") {
      await json({ events: [] });
      return;
    }
    if (url.pathname === "/api/labs") {
      await json([
        { id: firstLabId, nome: "Laboratorio Aversa", email: "aversa@example.test", attivo: true },
        { id: secondLabId, nome: "Laboratorio Napoli", email: "napoli@example.test", attivo: true },
      ]);
      return;
    }
    if (url.pathname === "/api/gift-cards/shop") {
      await json({
        types: [],
        paypal: { enabled: false, clientId: null, environment: "sandbox", currency: "EUR" },
      });
      return;
    }
    if (url.pathname === "/api/collaboratori" || url.pathname === "/api/collaboratori/assignments") {
      await json([]);
      return;
    }
    if (url.pathname.startsWith("/api/collaboratori/assignments/job/")) {
      localState.assignmentReads += 1;
      await json(localState.assignments);
      return;
    }
    if (url.pathname.startsWith("/api/photobooks/mockup-jobs/")) {
      await json({ contacts: [], books: [] });
      return;
    }
    if (url.pathname === "/api/lab-shipments/recent") {
      const labId = url.searchParams.get("labId");
      await json(labId === firstLabId ? [
        {
          id: "e2e-photobook-old",
          labId: firstLabId,
          jobId: labJobId,
          sentAt: "2026-09-18T10:00:00.000Z",
          sourceType: "photobook",
          descrizione: "Invio precedente",
        },
        {
          id: "e2e-photobook-latest",
          labId: firstLabId,
          jobId: labJobId,
          sentAt: "2026-10-02T14:30:00.000Z",
          sourceType: "photobook",
          descrizione: "Album di prova",
        },
        {
          id: "e2e-photobook-rossi",
          labId: firstLabId,
          jobId: rossiJobId,
          sentAt: "2026-10-01T14:30:00.000Z",
          sourceType: "photobook",
          descrizione: "Album Marco",
        },
        ...fillerLabJobs.map((job, index) => ({
          id: `e2e-shipment-filler-${index + 1}`,
          labId: firstLabId,
          jobId: job.id,
          sentAt: new Date(Date.UTC(2026, 8, 30 - index, 12)).toISOString(),
          sourceType: "photobook",
          descrizione: `Invio test ${index + 1}`,
        })),
      ] : []);
      return;
    }
    if (url.pathname.startsWith("/api/lab-shipments/job/")) {
      await json([]);
      return;
    }
    await json({});
  });
}

async function loginAdminSession(
  page: Page,
  securityStatus?: Record<string, unknown>,
  localState?: LocalCollaboratorApiState,
): Promise<{ idToken: string; password: string }> {
  await resetDisposableEmulators();
  const session = await createAdminSession();
  await seedFixture(session.idToken);
  await installLocalRoutes(page, session.idToken, securityStatus, localState);

  await page.goto("/admin");
  const cookieButton = page.getByRole("button", { name: "Solo Necessari" });
  if (await cookieButton.isVisible().catch(() => false)) await cookieButton.click();
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByRole("textbox", { name: "Password" }).fill(session.password);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard(?:$|[?#])/);
  return session;
}

async function preparePage(
  page: Page,
  localState?: LocalCollaboratorApiState,
): Promise<{ idToken: string; password: string }> {
  const session = await loginAdminSession(page, undefined, localState);
  await page.goto(`/admin/jobs/${jobId}`);
  await expect(page.getByTestId(`row-costo-${costId}`)).toContainText(costDescription);
  return session;
}

test("saved collaborator advances appear as separate costs without mutating payments or compensation", async ({ page }) => {
  test.setTimeout(120_000);
  const { idToken } = await loginAdminSession(page);
  const { assignment } = await seedAdvancesFixture(idToken);
  const pristineJob = await readFirestoreDocument(idToken, `jobs/${advancesJobId}`);
  const pristineAssignment = structuredClone(assignment);
  const unexpectedMutations: string[] = [];

  const asApiTimestamp = (date: Date) => ({
    _seconds: Math.floor(date.getTime() / 1000),
    _nanoseconds: (date.getTime() % 1000) * 1_000_000,
  });
  await page.route(`**/api/collaboratori/assignments/job/${advancesJobId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        ...assignment,
        dataRichiesta: asApiTimestamp(assignment.dataRichiesta),
        createdAt: asApiTimestamp(assignment.createdAt),
        updatedAt: asApiTimestamp(assignment.updatedAt),
        pagamenti: assignment.pagamenti.map((payment) => ({
          ...payment,
          data: asApiTimestamp(payment.data),
        })),
      }]),
    });
  });

  page.on("request", (request) => {
    const url = new URL(request.url());
    const method = request.method();
    const isRelevantApiWrite = url.pathname.startsWith("/api/collaboratori/assignments")
      || url.pathname.startsWith("/api/payment-schedules")
      || (url.pathname === `/api/jobs/${advancesJobId}` && method !== "GET");
    const isFirestoreDocumentWrite = url.hostname === "127.0.0.1"
      && url.port === "8089"
      && method !== "GET"
      && (url.pathname.endsWith("documents:commit")
        || url.pathname.endsWith("documents:batchWrite")
        || (url.pathname.includes("/documents/")
          && ["PATCH", "PUT", "DELETE"].includes(method)));
    const firestoreWriteBody = request.postData() || "";
    const isPaymentOrCompensationWrite = isFirestoreDocumentWrite
      && (firestoreWriteBody.includes("/documents/jobCollaboratoreAssignments/")
        || firestoreWriteBody.includes("/documents/paymentSchedules/"));
    if ((isRelevantApiWrite && method !== "GET") || isPaymentOrCompensationWrite) {
      unexpectedMutations.push(`${method} ${url.pathname}`);
    }
  });

  await page.goto(`/admin/jobs/${advancesJobId}`);
  await expect(page.getByTestId("card-financial-summary")).toBeVisible();
  const costDetails = page.getByTestId("job-cost-details");
  await costDetails.locator(":scope > summary").click();

  const firstPaymentRow = page.getByTestId("row-automatic-collaborator-payment-e2e-advance-400");
  const secondPaymentRow = page.getByTestId("row-automatic-collaborator-payment-e2e-advance-250");
  await expect(firstPaymentRow).toContainText("Acconto collaboratore");
  await expect(firstPaymentRow).toContainText("€400.00");
  await expect(secondPaymentRow).toContainText("Acconto collaboratore");
  await expect(secondPaymentRow).toContainText("€250.00");
  await expect(page.locator('[data-testid^="row-automatic-collaborator-payment-"]')).toHaveCount(2);
  await expect(page.getByTestId(`row-costo-${advancesCostId}`)).toContainText("€570.00");

  await expect(page.getByTestId("text-job-total-costs")).toHaveText("€1220.00");
  await expect(page.getByTestId("text-job-margin")).toHaveText("€1780.00");
  await expect(page.getByTestId("text-job-margin-percentage")).toHaveText("59,3%");
  expect((await page.getByTestId("text-costi-totali").innerText()).replace(/\D/g, "")).toBe("1220");
  expect((await page.getByTestId("text-margine").innerText()).replace(/\D/g, "")).toBe("1780");
  await expect(page.getByTestId("text-margine-percentage")).toContainText("59,3%");
  await expect(page.getByTestId("text-collaborator-cost-breakdown"))
    .toContainText(/650\s*€/);
  await expect(page.getByTestId("text-collaborator-cost-breakdown"))
    .toContainText("non incluso");

  expect(unexpectedMutations).toEqual([]);
  expect(await readFirestoreDocument(idToken, `jobs/${advancesJobId}`)).toEqual(pristineJob);
  expect(assignment).toEqual(pristineAssignment);
  expect(pristineAssignment).toMatchObject({
    compenso: assignment.compenso,
    pagamenti: assignment.pagamenti,
  });
});

test("notification bell opens the linked booking, consultation, ecommerce order, and photobook", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAdminSession(page);
  await page.route("**/api/jobs/notifications", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        notifications: [
          {
            id: "booking-notification",
            type: "booking",
            title: "Nuova prenotazione",
            description: "Cliente test",
            createdAt: null,
            isRead: false,
            resourceId: "booking-for-notification",
            deepLink: "/admin/dashboard?tab=prenotazioni&booking=booking-for-notification",
          },
          {
            id: "consultation-notification",
            type: "consultation",
            title: "Nuova consulenza",
            description: "Cliente test",
            createdAt: null,
            isRead: false,
            resourceId: "consultation-for-notification",
            deepLink: "/admin/dashboard?tab=consulenze&consultation=consultation-for-notification",
          },
          {
            id: "shop-notification",
            type: "print_shop_order",
            title: "Nuovo ordine e-commerce",
            description: "Ordine ST-TEST",
            createdAt: null,
            isRead: false,
            resourceId: "shop-order-for-notification",
            deepLink: "/admin?printOrderId=shop-order-for-notification",
          },
          {
            id: "photobook-notification",
            type: "photobook",
            title: "Fotolibro approvato",
            description: "Cliente test ha approvato il fotolibro",
            createdAt: null,
            isRead: false,
            resourceId: "photobook-for-notification",
            deepLink: "/admin/photobooks/photobook-for-notification",
          },
        ],
      }),
    });
  });
  await page.route("**/api/consultations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "consultation-for-notification",
          templateId: "template-for-notification",
          templateNome: "Consulenza test",
          jobType: "matrimonio",
          durataMinuti: 60,
          jobDataFieldsSnapshot: [],
          cliente: {
            nome: "Cliente",
            cognome: "Test",
            email: "cliente@example.test",
            whatsapp: "+390000000000",
          },
          dataConsulenza: "2026-10-20T10:00:00.000Z",
          orarioInizio: "12:00",
          orarioFine: "13:00",
          jobDataCollected: {},
          note: "",
          stato: "in_attesa",
          emailRicevutaInviata: true,
          emailConfermataInviata: false,
          emailAdminInviata: true,
          dataVisualizzazione: "2026-10-06T10:00:00.000Z",
          jobCreated: false,
          createdAt: "2026-10-06T09:00:00.000Z",
          updatedAt: "2026-10-06T09:00:00.000Z",
        },
      ]),
    });
  });
  await page.route("**/api/consultations/templates", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });
  await page.reload();
  await expect(page.getByTestId("button-notifications")).toBeVisible();

  await page.getByTestId("button-notifications").click();
  await page.getByTestId("notification-booking-booking-for-notification").click();
  await expect(page).toHaveURL(/booking=booking-for-notification/);
  await expect(page.getByRole("heading", { name: "Gestione Prenotazioni", exact: true })).toBeVisible();

  await expect(page.getByTestId("button-notifications")).toHaveAttribute("aria-expanded", "false");
  await page.getByTestId("button-notifications").click();
  await expect(page.getByTestId("button-notifications")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("notification-consultation-consultation-for-notification")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("notification-consultation-consultation-for-notification").click();
  await expect(page).toHaveURL(/consultation=consultation-for-notification/);
  await expect(page.getByTestId("row-consultation-consultation-for-notification")).toBeVisible();

  await expect(page.getByTestId("button-notifications")).toBeVisible({ timeout: 5_000 });

  // The consultation deep link scrolls to its row; reset the dashboard before
  // opening the bell again so the test exercises a visible trigger.
  await page.goto("/admin/dashboard");
  await page.getByTestId("button-notifications").click();
  const orderDetailsRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/print-shop/admin/orders/shop-order-for-notification";
  });
  await page.getByTestId("notification-print_shop_order-shop-order-for-notification").click();
  await expect(page).toHaveURL(/\/admin\/dashboard\?printOrderId=shop-order-for-notification/);
  await orderDetailsRequest;
  await expect(page.getByText("Dettaglio ordine", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/printOrderId=/);
  await page.goto("/admin/dashboard");
  await page.getByTestId("button-notifications").click();
  await page.route("**/api/photobooks/photobook-for-notification", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        photobook: {
          id: "photobook-for-notification",
          name: "Album di prova",
          galleryId: "gallery-test",
          galleryName: "Galleria di prova",
          clientName: "Cliente test",
          token: "photobook-test-token",
          currentVersion: 1,
          versions: [],
          createdAt: "2026-10-06T09:00:00.000Z",
        },
      }),
    });
  });
  await page.route("**/api/photobooks/photobook-for-notification/pages**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ pages: [] }),
    });
  });
  await page.route("**/api/photobooks/photobook-for-notification/gallery-photos", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ photos: [] }),
    });
  });
  const photobookRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/photobooks/photobook-for-notification";
  });
  await page.getByTestId("notification-photobook-photobook-for-notification").click();
  await expect(page).toHaveURL(/\/admin\/photobooks\/photobook-for-notification/);
  await photobookRequest;
  await expect(page.getByRole("heading", { name: "Album di prova" })).toBeVisible();
});

test("auth regression: restored Firebase admin stays on dashboard without local flag", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await preparePage(page);
  await page.evaluate(() => localStorage.removeItem("isAdmin"));

  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/admin\/dashboard(?:$|[?#])/);
  await expect(page.getByTestId("nav-cassa")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("isAdmin"))).toBeNull();
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/dashboard(?:$|[?#])/);
  await expect(page.getByTestId("nav-cassa")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("isAdmin"))).toBeNull();
  await page.screenshot({ path: testInfo.outputPath("admin-restored-session-dashboard.png") });

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/dashboard(?:$|[?#])/);
  await expect(page.getByTestId("nav-cassa")).toBeVisible();
  const redirectedUrl = page.url();
  await page.waitForTimeout(750);
  expect(page.url()).toBe(redirectedUrl);
  await expect(page.getByText(/Maximum update depth|ErrorBoundary|application error/i)).toHaveCount(0);
  await expect(page.getByText("Oops! Qualcosa è andato storto")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("auth regression: fake local admin flag cannot bypass unauthenticated guard", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // The browser context is fresh and has no Firebase sign-in; only the forged local flag is present.
  await resetDisposableEmulators();
  const localFixtureSession = await createAdminSession();
  await seedFixture(localFixtureSession.idToken);
  await installLocalRoutes(page, localFixtureSession.idToken);
  await page.addInitScript(() => localStorage.setItem("isAdmin", "true"));
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/admin(?:$|[?#])/);
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByTestId("nav-cassa")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("isAdmin"))).toBeNull();
  expect(pageErrors).toEqual([]);
});

test("auth regression: passkey-required Firebase admin remains blocked before dashboard", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await loginAdminSession(page, {
    passkeyRequired: true,
    passkeys: [],
    recoveryCodesRemaining: 0,
    recoveryCodesGeneratedAt: null,
    lockedUntil: null,
    verified: false,
    activationReady: false,
    verifiedUntil: null,
    expectedClaim: null,
  });
  await expect(page.getByRole("heading", { name: "Verifica passkey" })).toBeVisible();
  await expect(page.getByTestId("nav-cassa")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("lab drag/drop: resilient multi-file upload, shipment feedback and responsive layout", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const targetShipmentId = "e2e-lab-shipment-target";
  const middleShipmentId = "e2e-lab-shipment-middle";
  const newestShipmentId = "e2e-lab-shipment-newest";
  const firstName = "upload-first.jpg";
  const secondName = "upload-second.jpg";
  const ignoredName = "ignored-second-drop.jpg";
  const filesRegistered: string[] = [];
  const sessionsRequested: string[] = [];
  const sessionFiles = new Map<string, string>();
  const putAttempts = new Map<string, number>();
  const failedSecondOnce = new Set<string>();
  let uploadSerial = 0;
  let sendSerial = 0;
  let heldFirstSession = true;
  let releaseHeldSession!: () => void;
  let signalFirstSession!: () => void;
  const bodyWidths: Record<number, number> = {};
  const firstSessionGate = new Promise<void>((resolve) => { releaseHeldSession = resolve; });
  const firstSessionEntered = new Promise<void>((resolve) => { signalFirstSession = resolve; });

  const sentEarlier = "2026-10-01T10:00:00.000Z";
  let shipments: Array<Record<string, any>> = [
    {
      id: targetShipmentId, jobId, labId: firstLabId, labNome: "Laboratorio Aversa",
      labEmail: "aversa@example.test", descrizione: "Consegna target", status: "inviato",
      files: [{
        driveFileId: "drive-original-target", name: "originale.jpg", size: 128,
        mimeType: "image/jpeg", kind: "other", uploadedAt: "2026-10-01T09:00:00.000Z",
      }],
      driveFolderId: "folder-target", shareableLink: "https://drive.example.test/target",
      sentAt: sentEarlier, expiresAt: "2030-10-21T10:00:00.000Z", expiryDays: 20,
      createdAt: "2026-09-28T10:00:00.000Z", updatedAt: sentEarlier,
    },
    {
      id: middleShipmentId, jobId, labId: firstLabId, labNome: "Laboratorio Aversa",
      labEmail: "aversa@example.test", descrizione: "Consegna intermedia", status: "inviato",
      files: [], sentAt: "2026-10-05T10:00:00.000Z",
      expiresAt: "2030-10-25T10:00:00.000Z", expiryDays: 20,
      createdAt: "2026-09-29T10:00:00.000Z", updatedAt: "2026-10-05T10:00:00.000Z",
    },
    {
      id: newestShipmentId, jobId, labId: firstLabId, labNome: "Laboratorio Aversa",
      labEmail: "aversa@example.test", descrizione: "Consegna recente", status: "da_inviare",
      files: [], expiryDays: 20, createdAt: "2026-10-04T10:00:00.000Z",
      updatedAt: "2026-10-04T10:00:00.000Z",
    },
  ];
  const fulfillJson = (route: any, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.setViewportSize({ width: 1280, height: 800 });
  await preparePage(page);
  await page.route("**/api/lab-shipments/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === "GET" && url.pathname === `/api/lab-shipments/job/${jobId}`) {
      await fulfillJson(route, shipments);
      return;
    }
    const uploadSession = url.pathname.match(/^\/api\/lab-shipments\/([^/]+)\/upload-session$/);
    if (method === "POST" && uploadSession) {
    const fileName = sessionFiles.get(sessionId)!;
      sessionsRequested.push(fileName);
    const sessionId = new URL(route.request().url()).pathname.split("/").at(-1)!;
      sessionFiles.set(sessionId, fileName);
      if (fileName === firstName && heldFirstSession) {
        heldFirstSession = false;
        signalFirstSession();
        await firstSessionGate;
      }
      const port = Number(process.env.JOB_COST_PAYMENT_E2E_PORT || 4181);
      await fulfillJson(route, {
        sessionUrl: `http://127.0.0.1:${port}/__e2e-drive-upload/${sessionId}`,
        driveFolderId: "emulator-fixture-folder",
        shareableLink: "https://drive.example.test/fixture",
      });
      return;
    }
    const fileUploaded = url.pathname.match(/^\/api\/lab-shipments\/([^/]+)\/file-uploaded$/);
    if (method === "POST" && fileUploaded) {
      const data = route.request().postDataJSON();
      filesRegistered.push(data.name);
      uploadSerial++;
      const uploadedAt = data.name === "browse-after-send.png"
        ? "2026-10-10T16:00:00.000Z"
        : new Date(Date.parse("2026-10-10T12:00:00.000Z") + uploadSerial * 60_000).toISOString();
      const shipment = shipments.find((item) => item.id === send[1])!;
      shipment.files.push({
        driveFileId: data.driveFileId,
        name: data.name,
        size: data.size,
        mimeType: data.mimeType,
        kind: data.kind,
        uploadedAt,
      });
      shipment.updatedAt = uploadedAt;
      await fulfillJson(route, shipment);
      return;
    }
    const send = url.pathname.match(/^\/api\/lab-shipments\/([^/]+)\/send$/);
    if (method === "POST" && send) {
      const shipment = shipments.find((item) => item.id === send[1])!;
      sendSerial++;
      const sentAt = sendSerial === 1
        ? "2026-10-10T13:00:00.000Z"
        : "2026-10-10T13:30:00.000Z";
      Object.assign(shipment, {
        sentAt,
        status: "inviato",
        expiresAt: "2030-10-30T13:00:00.000Z",
        updatedAt: sentAt,
      });
      await fulfillJson(route, shipment);
      return;
    }
    await route.fallback();
  });
  await page.route("**/__e2e-drive-upload/**", async (route) => {
    const sessionId = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const fileName = sessionFiles.get(sessionId)!;
    const attempt = (putAttempts.get(fileName) || 0) + 1;
    putAttempts.set(fileName, attempt);
    if (fileName === secondName && !failedSecondOnce.has(fileName)) {
      failedSecondOnce.add(fileName);
      await route.fulfill({ status: 400, body: "fixture second-file failure" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: `drive-${fileName}` }),
    });
  });
  await page.reload();

  await expect(page.getByText("Laboratorio di stampa", { exact: true })).toBeVisible();
  await expect(page.getByTestId("shipment-summary")).toContainText("3 spedizioni");
  await expect(page.getByTestId("shipment-summary")).toContainText("2 con email inviata");
  await expect(page.getByTestId("shipment-summary")).toContainText("1 da inviare");
  const shipmentCards = page.locator('[data-testid^="shipment-e2e-lab-shipment-"]');
  await expect(shipmentCards).toHaveCount(3);
  const initialOrder = await shipmentCards.evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-testid")),
  );
  expect(initialOrder).toEqual([
    `shipment-${middleShipmentId}`,
    `shipment-${newestShipmentId}`,
    `shipment-${targetShipmentId}`,
  ]);
  await expect(page.getByTestId(`shipment-${targetShipmentId}`)).toContainText("Spedizione #1");
  await expect(page.getByTestId(`shipment-${middleShipmentId}`)).toContainText("Spedizione #2");
  await expect(page.getByTestId(`shipment-${newestShipmentId}`)).toContainText("Spedizione #3");

  await expect(page.getByTestId(`shipment-toggle-${middleShipmentId}`)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId(`shipment-toggle-${newestShipmentId}`)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId(`shipment-toggle-${targetShipmentId}`)).toHaveAttribute("aria-expanded", "false");
  const shipmentAccents = await Promise.all(
    [targetShipmentId, middleShipmentId, newestShipmentId].map((id) =>
      page.getByTestId(`shipment-color-${id}`).evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      ),
    ),
  );
  expect(new Set(shipmentAccents).size).toBe(3);
  await page.getByTestId(`shipment-toggle-${targetShipmentId}`).click();
  await expect(page.getByTestId(`shipment-toggle-${targetShipmentId}`)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId(`shipment-toggle-${middleShipmentId}`)).toHaveAttribute("aria-expanded", "false");

  const targetCard = page.getByTestId(`shipment-${targetShipmentId}`);
  const dropzone = page.getByTestId(`dropzone-${targetShipmentId}`);
  const checkResponsive = async (width: number, height: number, screenshotName: string) => {
    await page.setViewportSize({ width, height });
    await dropzone.scrollIntoViewIfNeeded();
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    bodyWidths[width] = dimensions.body;
    expect(dimensions.document).toBeLessThanOrEqual(width);
    const cardDimensions = await targetCard.evaluate((card) => ({
      client: card.clientWidth,
      scroll: card.scrollWidth,
    }));
    expect(cardDimensions.scroll).toBeLessThanOrEqual(cardDimensions.client + 1);
    const cardBox = await targetCard.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.x).toBeGreaterThanOrEqual(0);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(width + 1);
    await expect(page.getByTestId(`button-upload-${targetShipmentId}`)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(screenshotName) });
  };
  await checkResponsive(1280, 800, "lab-dropzone-desktop-1280x800.png");
  await checkResponsive(390, 844, "lab-dropzone-mobile-390x844.png");
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.evaluate((id) => {
    const zone = document.querySelector(`[data-testid="dropzone-${id}"]`)!;
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([1, 2, 3])], "upload-first.jpg", { type: "image/jpeg" }));
    zone.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, targetShipmentId);
  await expect(dropzone).toContainText("Rilascia qui i file per caricarli");
  await expect(dropzone).toHaveClass(/border-blue-500/);
  await page.evaluate((id) => {
    const zone = document.querySelector(`[data-testid="dropzone-${id}"]`)!;
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([1, 2, 3])], "upload-first.jpg", { type: "image/jpeg" }));
    transfer.items.add(new File([new Uint8Array([4, 5, 6])], "upload-second.jpg", { type: "image/jpeg" }));
    zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, targetShipmentId);
  await firstSessionEntered;
  const uploadStatus = targetCard.getByRole("status").first();
  await expect(uploadStatus).toContainText("File 1/2: upload-first.jpg");
  await expect(uploadStatus).toContainText("Gruppo di file:");
  await expect(page.getByTestId(`button-send-${targetShipmentId}`)).toBeDisabled();

  await page.evaluate((id) => {
    const zone = document.querySelector(`[data-testid="dropzone-${id}"]`)!;
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([9])], "ignored-second-drop.jpg", { type: "image/jpeg" }));
    zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, targetShipmentId);
  expect(sessionsRequested).toEqual([firstName]);
  releaseHeldSession();

  const retryButton = page.getByTestId(`retry-upload-${targetShipmentId}`);
  await expect(retryButton).toBeVisible({ timeout: 15_000 });
  await expect(targetCard.locator("ul")).toContainText(firstName);
  await expect(targetCard.locator("ul").getByText(firstName, { exact: true })).toHaveCount(1);
  await expect(targetCard.getByRole("alert")).toContainText("1/2 file caricati");
  await retryButton.click();
  await expect(retryButton).toHaveCount(0);
  await expect(targetCard.locator("ul")).toContainText(secondName);
  await expect(targetCard.locator("ul").getByText(firstName, { exact: true })).toHaveCount(1);
  await expect(targetCard.locator("ul").getByText(secondName, { exact: true })).toHaveCount(1);
  expect(sessionsRequested).toEqual([firstName, secondName, secondName]);
  expect(filesRegistered).toEqual([firstName, secondName]);

  const sendFeedback = targetCard.getByTestId(`send-feedback-${targetShipmentId}`);
  const sendButton = page.getByTestId(`button-send-${targetShipmentId}`);
  await expect(sendFeedback).toContainText("File aggiunti dopo l’ultima email");
  await sendButton.click();
  await expect(sendFeedback).toContainText("Ultima email inviata");
  await expect(sendFeedback).toContainText("15:00");
  await expect(sendFeedback).not.toContainText("File aggiunti dopo l’ultima email");
  const firstSendText = await sendFeedback.innerText();
  await expect(page.getByTestId("shipment-summary")).toContainText("2 con email inviata");
  await expect(shipmentCards.first()).toHaveAttribute("data-testid", `shipment-${targetShipmentId}`);
  await expect(targetCard).toContainText("Spedizione #1");

  await sendButton.click();
  await expect(sendFeedback).toContainText("15:30");
  const secondSendText = await sendFeedback.innerText();
  expect(secondSendText).not.toBe(firstSendText);

  const browseChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId(`button-upload-${targetShipmentId}`).click();
  const browseChooser = await browseChooserPromise;
  await browseChooser.setFiles({
    name: "browse-after-send.png",
    mimeType: "image/png",
    buffer: Buffer.from([7, 8, 9]),
  });
  await expect(targetCard.locator("ul")).toContainText("browse-after-send.png");
  await expect(sendFeedback).toContainText("File aggiunti dopo l’ultima email");
  expect(bodyWidths[1280]).toBeLessThanOrEqual(1280);
  expect(bodyWidths[390]).toBeLessThanOrEqual(390);
});

async function openPaymentLink(page: Page): Promise<void> {
  await page.getByTestId(`button-link-payment-${costId}`).click({ timeout: 15_000 });
  const dialog = page.getByTestId("dialog-link-job-cost-payment");
  await expect(dialog).toBeVisible();
  const confirmButton = page.getByTestId("button-confirm-payment-link");
  await expect(confirmButton).toBeDisabled();
  await page.getByRole("radio").click();
  await page.getByLabel("Riferimento documento verificato *").fill("FATT-E2E-2026-17");
  await expect(confirmButton).toBeDisabled();
  await page.getByLabel("Fornitore verificato *").fill("Fornitore E2E");
  await expect(confirmButton).toBeEnabled();
}

test("lab payment suggests recent photobooks and saves one job-free print expense", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const { idToken } = await preparePage(page);
  await page.goto("/admin/dashboard");
  await page.getByTestId("nav-cassa").click({ timeout: 15_000 });
  await expect(page.getByTestId("financial-dashboard")).toBeVisible();
  await page.getByTestId("cash-tab-register").click();
  await page.getByRole("button", { name: "Nuovo Movimento" }).click();

  const movementType = page.getByRole("combobox").first();
  await movementType.click();
  await page.getByRole("option", { name: "Uscita" }).click();
  await page.getByTestId("cash-lab-payment-toggle").click();
  await expect(page.getByTestId("lab-payment-fields")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);

  const labSelect = page.getByTestId("lab-payment-lab");
  await labSelect.click();
  await page.getByRole("option", { name: "Laboratorio Aversa" }).click();
  await expect(page.getByTestId("lab-payment-statement")).toBeVisible();
  await expect(page.getByTestId("lab-payment-recent-jobs")).toContainText(labJobName);
  await expect(page.getByTestId("lab-payment-recent-jobs")).toContainText("02/10/2026");
  await expect(page.getByTestId("lab-payment-recent-jobs")).toContainText("Album di prova");
  await expect(page.getByTestId("lab-payment-recent-jobs")).not.toContainText("Invio precedente");

  const search = page.getByTestId("lab-payment-job-search");
  const suggestions = page.getByTestId("lab-payment-recent-jobs");
  await search.fill("GIULIA D'AMBROSIO");
  await expect(suggestions).toContainText("Giulia D'Ambrósio");
  await expect(suggestions).toContainText(labJobName);
  await page.getByTestId("lab-payment-add-job").click();
  await expect(page.getByRole("option", { name: /Fotolibro Caffè.*Giulia D'Ambrósio/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await search.fill("ROSSI");
  await expect(suggestions).toContainText("Marco Rossi");
  await expect(suggestions).toContainText(rossiJobName);
  await page.getByTestId("lab-payment-add-job").click();
  await expect(page.getByRole("option", { name: /Album consegna.*Marco Rossi/ })).toBeVisible();
  await page.keyboard.press("Escape");

  const dialog = page.getByRole("dialog");
  const inspectResponsiveLayout = async (width: number, height: number, screenshotName: string) => {
    await page.setViewportSize({ width, height });
    const pageWidths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(pageWidths.document).toBeLessThanOrEqual(width);
    expect(pageWidths.body).toBeLessThanOrEqual(width);
    const dialogWidths = await dialog.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(dialogWidths.scroll).toBeLessThanOrEqual(dialogWidths.client + 1);

    await search.fill("");
    await expect(suggestions).toBeVisible();
    const suggestionScroller = suggestions.locator("div.overflow-y-auto");
    await expect(suggestionScroller).toBeVisible();
    await suggestions.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(screenshotName) });
    const scrollMetrics = await suggestionScroller.evaluate((element) => ({
      client: element.clientHeight,
      scroll: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(scrollMetrics.overflowY).toMatch(/auto|scroll/);
    expect(scrollMetrics.scroll).toBeGreaterThan(scrollMetrics.client);
    await suggestionScroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await suggestionScroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await suggestionScroller.evaluate((element) => { element.scrollTop = 0; });

    for (const input of [
      search,
      page.getByTestId("lab-payment-balance"),
      page.getByTestId("input-cash-amount"),
      page.getByPlaceholder("Es: Acquisto obiettivo 50mm"),
    ]) {
      await input.scrollIntoViewIfNeeded();
      const metrics = await input.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        };
      });
      expect(metrics.width).toBeGreaterThanOrEqual(160);
      expect(metrics.height).toBeGreaterThanOrEqual(32);
      expect(metrics.fontSize).toBeGreaterThanOrEqual(12);
      expect(metrics.left).toBeGreaterThanOrEqual(0);
      expect(metrics.right).toBeLessThanOrEqual(width + 1);
    }
    await dialog.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const submit = page.getByRole("button", { name: "Registra Movimento" });
    await expect(submit).toBeVisible();
    const actionBox = await submit.boundingBox();
    expect(actionBox).not.toBeNull();
    expect(actionBox!.y).toBeGreaterThanOrEqual(0);
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(height);
  };
  await inspectResponsiveLayout(1280, 800, "lab-payment-desktop-1280x800.png");
  await inspectResponsiveLayout(390, 844, "lab-payment-phone-390x844.png");

  await page.getByTestId("lab-payment-balance").fill("15.00");
  await page.getByTestId("lab-payment-add-unassigned-cost").click();
  await page.getByLabel("Descrizione del costo non attribuito").fill("Stampe fotografiche senza Job");
  await page.getByLabel("Importo del costo non attribuito").fill("42.75");
  await page.getByTestId("input-cash-amount").fill("42.75");
  await page.getByPlaceholder("Es: Acquisto obiettivo 50mm").fill("Pagamento stampe laboratorio");
  await search.fill("ROSSI");
  await expect(suggestions).toContainText("Marco Rossi");
  await search.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(search).toHaveValue("ROSSI");
  expect((await listFirestoreCollection(idToken, "labSupplierStatements"))
    .filter((statement) => statement.labId === firstLabId)).toHaveLength(0);
  expect((await listFirestoreCollection(idToken, "cashMovements"))
    .filter((movement) => movement.pagamentoLaboratorio?.labId === firstLabId)).toHaveLength(0);

  await labSelect.click();
  await page.getByRole("option", { name: "Laboratorio Napoli" }).click();
  await expect(page.getByTestId("lab-payment-recent-jobs")).toHaveCount(0);
  await expect(page.getByTestId(`lab-payment-job-${labJobId}`)).toHaveCount(0);
  await expect(page.getByTestId("lab-payment-job-search")).toBeVisible();
  await page.getByTestId("lab-payment-balance").fill("15.00");
  await page.getByTestId("lab-payment-add-unassigned-cost").click();
  await page.getByLabel("Descrizione del costo non attribuito").fill("Stampe fotografiche senza Job");
  await page.getByLabel("Importo del costo non attribuito").fill("42.75");
  await page.getByTestId("input-cash-amount").fill("42.75");
  await page.getByPlaceholder("Es: Acquisto obiettivo 50mm").fill("Pagamento stampe laboratorio");
  await expect(page.getByTestId(`lab-payment-job-${labJobId}`)).toHaveCount(0);
  await expect(page.getByLabel("Descrizione del costo non attribuito")).toHaveValue("Stampe fotografiche senza Job");
  await page.getByRole("button", { name: "Registra Movimento" }).click();
  await expect(page.getByRole("heading", { name: "Nuovo Movimento Cassa" })).toHaveCount(0);

  const statements = (await listFirestoreCollection(idToken, "labSupplierStatements"))
    .filter((statement) => statement.labId === secondLabId);
  const movements = (await listFirestoreCollection(idToken, "cashMovements"))
    .filter((movement) => movement.pagamentoLaboratorio?.labId === secondLabId);
  expect(statements).toHaveLength(1);
  expect(movements).toHaveLength(1);
  expect(movements[0]).toMatchObject({
    tipo: "uscita",
    importo: 42.75,
    descrizione: "Pagamento stampe laboratorio",
    pagamentoLaboratorio: { labId: secondLabId, jobIds: [], jobNomi: [] },
  });
  expect(statements[0]).toMatchObject({
    labId: secondLabId,
    lavori: [],
    costi: [expect.objectContaining({
      descrizione: "Stampe fotografiche senza Job",
      importo: 42.75,
    })],
  });
});

test("authenticated payment confirmation persists once and refreshes job and expense totals", async ({ page }) => {
  test.setTimeout(120_000);
  const { idToken } = await preparePage(page);
  const pristineJob = await readFirestoreDocument(idToken, `jobs/${jobId}`);
  const pristineMovement = await readFirestoreDocument(idToken, `cashMovements/${movementId}`);
  await openPaymentLink(page);

  const beforeJob = await readFirestoreDocument(idToken, `jobs/${jobId}`);
  const beforeMovement = await readFirestoreDocument(idToken, `cashMovements/${movementId}`);
  expect(beforeJob).toEqual(pristineJob);
  expect(beforeMovement).toEqual(pristineMovement);
  expect(beforeJob.costi[0]).not.toHaveProperty("cashMovementId");
  expect(beforeJob.costi[0]).not.toHaveProperty("pagamentoVerificato");
  expect(beforeMovement).not.toHaveProperty("jobCostAssociation");
  expect(beforeJob.costi[0]).toEqual(expect.objectContaining({
    id: costId,
    importo: amount,
    descrizione: costDescription,
  }));
  expect(beforeMovement).toEqual(expect.objectContaining({
    tipo: "uscita",
    importo: amount,
    data: paymentDate,
    metodoPagamento: "bonifico",
  }));

  await page.getByTestId("button-confirm-payment-link").click();
  await expect(page.getByTestId("dialog-link-job-cost-payment")).toHaveCount(0);

  const savedJob = await readFirestoreDocument(idToken, `jobs/${jobId}`);
  const savedMovement = await readFirestoreDocument(idToken, `cashMovements/${movementId}`);
  expect(savedJob.costi[0]).toMatchObject({
    cashMovementId: movementId,
    pagamentoVerificato: {
      supplierName: "Fornitore E2E",
      evidenceReference: "FATT-E2E-2026-17",
      paymentAmount: amount,
      verifiedBy: expect.any(String),
    },
  });
  expect(savedMovement).toMatchObject({
    tipo: "uscita",
    importo: amount,
    data: paymentDate,
    metodoPagamento: "bonifico",
    jobCostAssociation: {
      jobId,
      jobCostId: costId,
      supplierName: "Fornitore E2E",
      evidenceReference: "FATT-E2E-2026-17",
    },
  });

  await page.reload();
  const paymentLink = page.getByTestId(`payment-link-${costId}`);
  await expect(paymentLink).toContainText(movementId);
  await expect(paymentLink).toContainText("Fornitore E2E");
  await expect(paymentLink).toContainText("FATT-E2E-2026-17");

  await page.goto("/admin/dashboard");
  await page.getByTestId("nav-cassa").click({ timeout: 15_000 });
  await expect(page.getByTestId("financial-dashboard")).toBeVisible();
  await expect(page.getByTestId("finance-expense-total")).toHaveText(/145,50\s*€/);
});

test("cash register requires an explicit unlink choice before changing a verified payment", async ({ page }) => {
  test.setTimeout(120_000);
  const { idToken } = await preparePage(page);
  await openPaymentLink(page);
  await page.getByTestId("button-confirm-payment-link").click();
  await expect(page.getByTestId("dialog-link-job-cost-payment")).toHaveCount(0);

  await page.goto("/admin/dashboard");
  await page.getByTestId("nav-cassa").click({ timeout: 15_000 });
  await expect(page.getByTestId("financial-dashboard")).toBeVisible();
  await page.getByTestId("cash-tab-register").click();
  await expect(page.getByTestId(`link-cash-job-${movementId}`)).toContainText("pagamento verificato");

  const linkedJob = await readFirestoreDocument(idToken, `jobs/${jobId}`);
  const linkedMovement = await readFirestoreDocument(idToken, `cashMovements/${movementId}`);
  await page.getByTestId(`button-edit-cash-${movementId}`).click();
  await page.getByPlaceholder("Note aggiuntive (opzionali)").fill("Nota aggiornata senza toccare la verifica");
  await page.getByRole("button", { name: "Salva Modifiche" }).click();
  await expect(page.getByRole("heading", { name: "Modifica Movimento" })).toHaveCount(0);

  const verifiedJob = await readFirestoreDocument(idToken, `jobs/${jobId}`);
  const verifiedMovement = await readFirestoreDocument(idToken, `cashMovements/${movementId}`);
  expect(verifiedJob).toEqual(linkedJob);
  expect(verifiedMovement).toMatchObject({
    note: "Nota aggiornata senza toccare la verifica",
    jobCostAssociation: linkedMovement.jobCostAssociation,
  });

  await page.getByTestId(`button-edit-cash-${movementId}`).click();
  const amountInput = page.getByLabel("Importo (€) *");
  await amountInput.fill("146.50");
  await page.getByRole("button", { name: "Salva Modifiche" }).click();

  const confirmation = page.getByTestId("dialog-unlink-job-cost-before-cash-edit");
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("Il pagamento");
  await expect(confirmation).toContainText("Il movimento originale resterà nel registro");
  await page.getByTestId("button-cancel-unlink-job-cost-cash-edit").click();
  await expect(confirmation).toHaveCount(0);
  expect(await readFirestoreDocument(idToken, `jobs/${jobId}`)).toEqual(verifiedJob);
  expect(await readFirestoreDocument(idToken, `cashMovements/${movementId}`)).toEqual(verifiedMovement);

  await amountInput.fill("146.50");
  await page.getByRole("button", { name: "Salva Modifiche" }).click();
  await page.getByTestId("button-confirm-unlink-job-cost-cash-edit").click();
  await expect(confirmation).toHaveCount(0);

  const updatedJob = await readFirestoreDocument(idToken, `jobs/${jobId}`);
  const updatedMovement = await readFirestoreDocument(idToken, `cashMovements/${movementId}`);
  expect(updatedJob.costi[0]).not.toHaveProperty("cashMovementId");
  expect(updatedJob.costi[0]).not.toHaveProperty("pagamentoVerificato");
  expect(updatedMovement).toMatchObject({
    tipo: "uscita",
    importo: 146.5,
    metodoPagamento: "bonifico",
  });
  expect(updatedMovement.data).toEqual(paymentDate);
  expect(updatedMovement).not.toHaveProperty("jobCostAssociation");
});

test("a payment that changes after selection is rejected without a partial job update", async ({ page }) => {
  test.setTimeout(120_000);
  const { idToken } = await preparePage(page);
  const pristineJob = await readFirestoreDocument(idToken, `jobs/${jobId}`);
  const pristineMovement = await readFirestoreDocument(idToken, `cashMovements/${movementId}`);
  await openPaymentLink(page);
  await updateFirestoreField(idToken, `cashMovements/${movementId}`, "importo", amount + 1);

  await page.getByTestId("button-confirm-payment-link").click();
  await expect(page.getByRole("alert")).toContainText("Data o importo del movimento non coincidono più");

  const savedJob = await readFirestoreDocument(idToken, `jobs/${jobId}`);
  const changedMovement = await readFirestoreDocument(idToken, `cashMovements/${movementId}`);
  expect(savedJob).toEqual(pristineJob);
  expect(changedMovement).toEqual({ ...pristineMovement, importo: amount + 1 });
});

test("a payment claimed by another cost is rejected without a partial job update", async ({ page }) => {
  test.setTimeout(120_000);
  const { idToken } = await preparePage(page);
  const pristineJob = await readFirestoreDocument(idToken, `jobs/${jobId}`);
  const pristineMovement = await readFirestoreDocument(idToken, `cashMovements/${movementId}`);
  await openPaymentLink(page);
  const existingAssociation = {
    jobId: "another-job",
    jobName: "Lavoro già collegato",
    jobCostId: "another-cost",
    jobCostDescription: "Altro costo",
    supplierName: "Altro fornitore",
    paymentDate,
    paymentAmount: amount,
    evidenceReference: "DOCUMENTO-GIA-COLLEGATO",
    verifiedAt: paymentDate,
    verifiedBy: "test-fixture",
  };
  await updateFirestoreField(
    idToken,
    `cashMovements/${movementId}`,
    "jobCostAssociation",
    existingAssociation,
  );

  await page.getByTestId("button-confirm-payment-link").click();
  await expect(page.getByRole("alert")).toContainText("Questo movimento è già abbinato a un altro costo");

  const savedJob = await readFirestoreDocument(idToken, `jobs/${jobId}`);
  const claimedMovement = await readFirestoreDocument(idToken, `cashMovements/${movementId}`);
  expect(savedJob).toEqual(pristineJob);
  expect(claimedMovement).toEqual({
    ...pristineMovement,
    jobCostAssociation: existingAssociation,
  });
});

test("a failed collaborator advance can be retried without phantom costs or duplicate payments", async ({ page }) => {
  test.setTimeout(120_000);
  const assignmentId = "e2e-collaborator-advance";
  const localState: LocalCollaboratorApiState = {
    assignments: [
      {
        id: assignmentId,
        jobId,
        collaboratoreId: "e2e-collaboratore",
        ruoloInJob: "assistente",
        status: "pending",
        compenso: 500,
        saldoResiduo: 500,
        isPagato: false,
        pagamenti: [],
        prodottiAssegnati: [],
      },
    ],
    assignmentReads: 0,
    paymentWrites: [],
    failNextPaymentRequests: 1,
  };
  const documentNavigations: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.resourceType() === "document") {
      documentNavigations.push(request.url());
    }
  });

  await preparePage(page, localState);
  await expect.poll(() => localState.assignmentReads).toBeGreaterThan(0);
  await page.getByTestId("job-cost-details").locator("summary").first().click();
  await expect(page.getByTestId("text-job-total-costs")).toHaveText("€145.50");
  await expect(page.getByTestId("text-job-margin")).toHaveText("€254.50");
  await expect(page.getByTestId("text-margine")).toContainText("255");

  await page.getByTestId("collaborator-assignments-details").locator("summary").click();
  const assignmentRow = page.locator(
    `[data-testid="job-collaborator-assignment-${assignmentId}"]:visible`,
  );
  await expect(assignmentRow).toContainText("€500");
  const assignmentReadsBeforePayment = localState.assignmentReads;
  const navigationsBeforePayment = documentNavigations.length;
  const jobUrlBeforePayment = page.url();

  await page
    .locator(`[data-testid="button-registra-pagamento-${assignmentId}"]:visible`)
    .click();
  await expect(page.getByTestId("text-limite-pagamento")).toHaveText(
    "Importo massimo registrabile ora: €500.00",
  );
  await expect(page.getByTestId("input-importo-pagamento")).toHaveAttribute("max", "500");
  await page.getByTestId("input-importo-pagamento").fill("100");
  await page.getByTestId("input-data-pagamento").fill("2026-10-15");

  const paymentResponsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      new URL(response.url()).pathname ===
        `/api/collaboratori/assignments/${assignmentId}/add-payment`
    );
  });
  await page.getByTestId("button-submit-pagamento").click();
  const failedPaymentResponse = await paymentResponsePromise;
  expect(failedPaymentResponse.status()).toBe(500);
  await expect(page.getByText("❌ Errore registrazione pagamento", { exact: true })).toBeVisible();
  await expect(page.getByTestId("input-importo-pagamento")).toBeVisible();
  await expect(page.getByTestId("input-importo-pagamento")).toHaveValue("100");
  await expect(page.getByTestId("input-data-pagamento")).toHaveValue("2026-10-15");
  await expect(page.getByTestId("row-automatic-collaborator-payment-e2e-payment-1")).toHaveCount(0);
  await expect(page.getByTestId("text-job-total-costs")).toHaveText("€145.50");
  await expect(page.getByTestId("text-job-margin")).toHaveText("€254.50");
  await expect(page.getByTestId("text-margine")).toContainText("255");
  expect(localState.paymentWrites).toHaveLength(0);
  expect(localState.assignments[0].pagamenti).toHaveLength(0);

  const assignmentReadsBeforeRetry = localState.assignmentReads;
  const retryResponsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      new URL(response.url()).pathname ===
        `/api/collaboratori/assignments/${assignmentId}/add-payment`
    );
  });
  await page.getByTestId("button-submit-pagamento").click();
  const paymentResponse = await retryResponsePromise;
  expect(paymentResponse.ok()).toBeTruthy();
  await expect.poll(() => localState.paymentRequestCount).toBe(2);
  await expect.poll(() => localState.paymentWrites.length).toBe(1);
  await expect
    .poll(() => localState.assignmentReads)
    .toBeGreaterThan(assignmentReadsBeforeRetry);

  const paymentId = "e2e-payment-1";
  await expect(page.getByTestId(`row-automatic-collaborator-payment-${paymentId}`)).toHaveCount(1);
  await expect(page.getByTestId("text-job-total-costs")).toHaveText("€245.50");
  await expect(page.getByTestId("text-job-margin")).toHaveText("€154.50");
  await expect(page.getByTestId("text-margine")).toContainText("155");
  await expect(assignmentRow).toContainText("€500");
  await expect(assignmentRow).toContainText("€400.00");
  expect(localState.assignments[0].compenso).toBe(500);
  expect(localState.assignments[0].pagamenti).toHaveLength(1);
  expect(localState.paymentWrites).toHaveLength(1);
  expect(localState.paymentWrites[0]).toMatchObject({
    assignmentId,
    payload: {
      importo: 100,
      tipo: "acconto",
      metodo: "bonifico",
      data: "2026-10-15",
    },
  });
  expect(page.url()).toBe(jobUrlBeforePayment);
  expect(documentNavigations).toHaveLength(navigationsBeforePayment);
});
