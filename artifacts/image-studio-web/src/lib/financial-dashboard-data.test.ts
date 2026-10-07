import { collection, getDocs } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFinanceDashboard } from "./financial-dashboard-data";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => path),
  getDocs: vi.fn(),
}));

vi.mock("./firebase", () => ({ db: {} }));

const mockedCollection = vi.mocked(collection);
const mockedGetDocs = vi.mocked(getDocs);

beforeEach(() => {
  vi.clearAllMocks();
  mockedCollection.mockImplementation(((_db: unknown, path: string) => path) as typeof collection);
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