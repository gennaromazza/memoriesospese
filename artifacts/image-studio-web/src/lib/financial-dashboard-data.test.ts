import { collection, getDocs } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFinanceDashboard } from "./financial-dashboard-data";
import { apiRequest } from "./queryClient";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => path),
  getDocs: vi.fn(),
}));

vi.mock("./firebase", () => ({ db: {} }));
vi.mock("./queryClient", () => ({
  apiRequest: vi.fn(async () => ({ json: async () => ({ orders: [] }) })),
}));

const mockedCollection = vi.mocked(collection);
const mockedGetDocs = vi.mocked(getDocs);
const mockedApiRequest = vi.mocked(apiRequest);

beforeEach(() => {
  vi.clearAllMocks();
  mockedCollection.mockImplementation(((_db: unknown, path: string) => path) as typeof collection);
  mockedApiRequest.mockResolvedValue({ json: async () => ({ orders: [] }) } as any);
});

describe("loadFinanceDashboard", () => {
  it("keeps the main dashboard available and warns when lab statements are denied", async () => {
    mockedGetDocs.mockImplementation((async (reference: unknown) => {
      if (reference === "labSupplierStatements") {
        throw Object.assign(new Error("Permission denied"), { code: "permission-denied" });
      }
      return { docs: [] };
    }) as typeof getDocs);

    const data = await loadFinanceDashboard();

    expect(data.ledger).toEqual([]);
    expect(data.labCosts).toEqual([]);
    expect(data.warnings).toContain(
      "Dati laboratorio non disponibili: Firestore ha negato la lettura. I totali della sezione Laboratori non sono inclusi.",
    );
    expect(mockedGetDocs).toHaveBeenCalledTimes(8);
  });

  it("loads private print margins through the authenticated admin API and converts dates", async () => {
    mockedGetDocs.mockResolvedValue({ docs: [] } as any);
    mockedApiRequest.mockResolvedValue({
      json: async () => ({
        orders: [{
          orderId: "print-1",
          orderNumber: "P-1",
          customerName: "Cliente",
          date: "2026-11-12T10:00:00.000Z",
          paymentMethod: "paypal",
          revenueCents: 2500,
          estimatedPrintCostCents: 500,
          supplierCostCents: null,
          productionCostCents: 500,
          productionCostBasis: "estimated",
          paypalFeeCents: 50,
          marginCents: 1950,
          marginStatus: "estimated",
          missingReasons: [],
        }],
      }),
    } as any);

    const data = await loadFinanceDashboard();

    expect(data.printShopMargins).toHaveLength(1);
    expect(data.printShopMargins[0].date).toBeInstanceOf(Date);
    expect(data.printShopMargins[0].marginCents).toBe(1950);
  });

  it("warns explicitly when protected print margins cannot be loaded", async () => {
    mockedGetDocs.mockResolvedValue({ docs: [] } as any);
    mockedApiRequest.mockRejectedValue(new Error("forbidden"));

    const data = await loadFinanceDashboard();

    expect(data.printShopMargins).toEqual([]);
    expect(data.warnings).toContain(
      "Margini delle stampe non caricati. Riprova ad aggiornare; i totali finanziari di cassa restano disponibili.",
    );
  });

  it("still fails explicitly when a core financial collection cannot be loaded", async () => {
    mockedGetDocs.mockImplementation((async (reference: unknown) => {
      if (reference === "cashMovements") {
        throw Object.assign(new Error("Permission denied"), { code: "permission-denied" });
      }
      return { docs: [] };
    }) as typeof getDocs);

    await expect(loadFinanceDashboard()).rejects.toMatchObject({ code: "permission-denied" });
  });
});