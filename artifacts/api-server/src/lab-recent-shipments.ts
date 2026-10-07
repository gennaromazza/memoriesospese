interface ShipmentRecord {
  id: string;
  data: Record<string, any>;
}

/** Only evidence of an actual send is eligible, not uploads or failed attempts. */
export function recentLabShipments(records: ShipmentRecord[], labId: string) {
  return records.flatMap(({ id, data }) => {
    if (data.labId !== labId || data.status === "da_inviare" ||
        (data.sendState && data.sendState.status !== "sent")) return [];
    // This feed is used to suggest a job when recording a laboratory expense;
    // walk-in orders must not be presented as unlinked jobs.
    if (data.sourceType === "walk_in") return [];
    const value = data.sentAt;
    const date = value?.toDate?.() ?? (
      typeof value?.seconds === "number" ? new Date(value.seconds * 1000) :
      typeof value?._seconds === "number" ? new Date(value._seconds * 1000) :
      typeof value === "string" || value instanceof Date ? new Date(value) : null
    );
    if (!date || !Number.isFinite(date.getTime())) return [];
    return [{
      id,
      labId,
      ...(typeof data.jobId === "string" && data.jobId ? { jobId: data.jobId } : {}),
      sourceType: data.sourceType === "print_shop" ? "print_shop" as const :
        data.sourceType === "photobook" ? "photobook" as const : "job" as const,
      descrizione: typeof data.descrizione === "string" ? data.descrizione : "",
      sentAt: date.toISOString(),
    }];
  }).sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 100);
}
