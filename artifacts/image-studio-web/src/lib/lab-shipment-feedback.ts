import type { LabShipment } from "@shared/lab-types";
import { tsToDate } from "./labShipments";

export function shipmentHasNewFiles(shipment: LabShipment) {
  const sentAt = tsToDate(shipment.sentAt)?.getTime();
  return sentAt != null && (shipment.files || []).some(file =>
    (tsToDate(file.uploadedAt)?.getTime() ?? 0) > sentAt,
  );
}

/** A repeatable golden-angle hue keeps shipment accents distinct and stable. */
export function shipmentAccentHue(sequence: number): number {
  return (((Math.max(1, Math.floor(sequence)) - 1) * 137.508) % 360 + 360) % 360;
}

/** Stable creation numbers, with the most recently active shipment first. */
export function shipmentPresentation(shipments: LabShipment[]) {
  const created = [...shipments].sort((a, b) =>
    (tsToDate(a.createdAt)?.getTime() ?? 0) - (tsToDate(b.createdAt)?.getTime() ?? 0)
    || a.id.localeCompare(b.id),
  );
  const numbers = new Map(created.map((shipment, index) => [shipment.id, index + 1]));
  return created.sort((a, b) =>
    (tsToDate(b.sentAt || b.createdAt)?.getTime() ?? 0)
      - (tsToDate(a.sentAt || a.createdAt)?.getTime() ?? 0)
    || b.id.localeCompare(a.id),
  ).map(shipment => ({ shipment, sequence: numbers.get(shipment.id)! }));
}
