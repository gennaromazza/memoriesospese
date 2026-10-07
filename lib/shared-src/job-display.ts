/**
 * Helper puri per la visualizzazione dei job (lista lavori).
 *
 * `toDisplayDate` gestisce tutti i formati timestamp che arrivano al client:
 * - Date native
 * - Firestore Timestamp Web SDK ({ toDate() } o { seconds })
 * - Timestamp serializzati via /api Admin SDK ({ _seconds })
 * - stringhe ISO / numeri epoch
 */
export function toDisplayDate(value: any): Date | null {
  if (value == null) return null;
  try {
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === "object") {
      if (typeof value.toDate === "function") {
        const d = value.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
      }
      if (typeof value._seconds === "number") {
        return new Date(value._seconds * 1000);
      }
      if (typeof value.seconds === "number") {
        return new Date(value.seconds * 1000);
      }
      return null;
    }
    if (typeof value === "string" || typeof value === "number") {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Data mostrata nel badge "Compilato il" della lista lavori:
 * - `quickQuoteCompiledAt` se presente e valido (ultima compilazione Preventivo Rapido)
 * - fallback su `createdAt` per i job vecchi senza il campo
 */
export function getQuickQuoteDisplayDate(job: {
  quickQuoteCompiledAt?: any;
  createdAt?: any;
}): Date | null {
  return toDisplayDate(job?.quickQuoteCompiledAt) ?? toDisplayDate(job?.createdAt);
}
