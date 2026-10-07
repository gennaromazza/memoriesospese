import { describe, expect, it, vi } from "vitest";
import type { LabShipment } from "@shared/lab-types";

// Isolate the date-only display rules from Firebase/network initializers.
vi.mock("./labShipments", () => ({
  tsToDate: (value: unknown) => value ? new Date(value as string) : null,
}));
import {
  shipmentAccentHue,
  shipmentHasNewFiles,
  shipmentPresentation,
} from "./lab-shipment-feedback";

function shipment(id: string, createdAt: string, sentAt?: string, uploadedAt?: string) {
  return {
    id, createdAt, sentAt,
    files: uploadedAt ? [{ driveFileId: id, name: "foto.jpg", uploadedAt }] : [],
  } as unknown as LabShipment;
}

describe("laboratory shipment visual feedback", () => {
  it("distinguishes genuinely new files from attachments already sent", () => {
    const original = shipment("a", "2026-10-01", "2026-10-03T10:00:00Z", "2026-10-03T09:00:00Z");
    expect(shipmentHasNewFiles(original)).toBe(false);
    const withNewFile = shipment("b", "2026-10-01", "2026-10-03T10:00:00Z", "2026-10-03T10:01:00Z");
    expect(shipmentHasNewFiles(withNewFile)).toBe(true);
    expect(shipmentHasNewFiles({ ...withNewFile, sentAt: undefined })).toBe(false);
    const afterResend = shipment("b", "2026-10-01", "2026-10-03T11:00:00Z", "2026-10-03T10:01:00Z");
    expect(shipmentHasNewFiles(afterResend)).toBe(false);
  });

  it("puts the last active shipment first without renumbering older shipments", () => {
    const first = shipment("a", "2026-10-01", "2026-10-05");
    const second = shipment("b", "2026-10-02", "2026-10-03");
    const third = shipment("c", "2026-10-04");
    const input = [second, first, third];
    expect(shipmentPresentation(input).map(({ shipment, sequence }) => [shipment.id, sequence]))
      .toEqual([["a", 1], ["c", 3], ["b", 2]]);
    expect(input.map(item => item.id)).toEqual(["b", "a", "c"]);
  });

  it("handles legacy missing dates and empty lists predictably", () => {
    expect(shipmentPresentation([])).toEqual([]);
    expect(shipmentPresentation([{ id: "a", files: [] } as unknown as LabShipment]))
      .toEqual([{ shipment: { id: "a", files: [] }, sequence: 1 }]);
    expect(shipmentHasNewFiles({ id: "a" } as LabShipment)).toBe(false);
  });

  it("assigns each shipment a repeatable distinct accent independent of display order", () => {
    const colors = [1, 2, 3, 4, 5, 6].map(shipmentAccentHue);
    expect(new Set(colors).size).toBe(colors.length);
    expect(shipmentAccentHue(2)).toBe(colors[1]);
    expect(shipmentAccentHue(1)).toBe(colors[0]);
  });
});
