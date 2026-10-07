import { describe, expect, it } from "vitest";
import { recentLabShipments } from "./lab-recent-shipments";
import { GetRecentLabShipmentsQueryParams, GetRecentLabShipmentsResponse } from "@workspace/api-zod";

const shipment = (id: string, fields: Record<string, unknown> = {}) => ({
  id,
  data: { labId: "lab-a", jobId: "job-1", status: "inviato", sentAt: "2026-10-01T10:00:00Z", ...fields },
});

describe("recent laboratory sends", () => {
  it("uses actual sends only and excludes other labs, drafts, invalid dates and failed attempts", () => {
    const result = recentLabShipments([
      shipment("sent"),
      shipment("other-lab", { labId: "lab-b" }),
      shipment("uploaded", { sentAt: undefined }),
      shipment("draft", { status: "da_inviare" }),
      shipment("invalid", { sentAt: "invalid" }),
      shipment("failed", { sendState: { status: "failed" } }),
      shipment("sending", { sendState: { status: "sending" } }),
    ], "lab-a");
    expect(result.map(row => row.id)).toEqual(["sent"]);
    expect(GetRecentLabShipmentsResponse.safeParse(result).success).toBe(true);
  });

  it("keeps sends whose files have expired and print-shop shipments without a Job", () => {
    const result = recentLabShipments([
      shipment("album", { sourceType: "photobook", status: "scaduto", deletedFromDrive: true }),
      shipment("prints", { jobId: undefined, sourceType: "print_shop", sentAt: { seconds: 1790935200 } }),
      shipment("walk-in-order", { jobId: undefined, orderId: "order-731", sourceType: "walk_in" }),
    ], "lab-a");
    expect(result.map(row => row.sourceType)).toEqual(["print_shop", "photobook"]);
    expect(result.find(row => row.id === "prints")).not.toHaveProperty("jobId");
  });

  it("orders by send date and returns at most 100 records without private delivery links", () => {
    const rows = Array.from({ length: 105 }, (_, i) => shipment(String(i), {
      sentAt: new Date(Date.UTC(2026, 0, 1 + i)), shareableLink: "private-link", labEmail: "private-email",
    }));
    const result = recentLabShipments(rows, "lab-a");
    expect(result).toHaveLength(100);
    expect(result[0].id).toBe("104");
    expect(result[0]).not.toHaveProperty("shareableLink");
    expect(result[0]).not.toHaveProperty("labEmail");
  });

  it("validates lab identifiers before querying", () => {
    for (const labId of ["", "labs/a", "x".repeat(129)]) {
      expect(GetRecentLabShipmentsQueryParams.safeParse({ labId }).success).toBe(false);
    }
    expect(GetRecentLabShipmentsQueryParams.safeParse({ labId: "lab-a" }).success).toBe(true);
  });
});
