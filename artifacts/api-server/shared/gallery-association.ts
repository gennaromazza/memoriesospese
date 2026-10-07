/**
 * Regole condivise per mantenere coerenti le associazioni galleria ↔ cliente ↔ Job.
 * I documenti legacy possono avere solo clienteId, mentre i nuovi usano clientiIds.
 */

export interface GalleryAssociationJob {
  clientiIds?: readonly unknown[] | null;
  clienteId?: unknown;
  bookingId?: unknown;
  consultationId?: unknown;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getJobClientIds(job: GalleryAssociationJob | null | undefined): string[] {
  if (!job) return [];
  return [
    ...(Array.isArray(job.clientiIds) ? job.clientiIds : []),
    job.clienteId,
  ].filter(nonEmptyString).map((id) => id.trim()).filter((id, index, ids) => ids.indexOf(id) === index);
}

export function jobMatchesClientIds(
  job: GalleryAssociationJob | null | undefined,
  clientIds: readonly string[],
): boolean {
  if (clientIds.length === 0) return false;
  const selected = new Set(clientIds.filter(nonEmptyString));
  return getJobClientIds(job).some((id) => selected.has(id));
}

export function jobMatchesGalleryContext(
  job: GalleryAssociationJob | null | undefined,
  context: {
    clientIds?: readonly string[];
    bookingId?: string;
    consultationId?: string;
  },
): boolean {
  if (!job) return false;
  return (
    jobMatchesClientIds(job, context.clientIds || []) ||
    (nonEmptyString(context.bookingId) && job.bookingId === context.bookingId) ||
    (nonEmptyString(context.consultationId) && job.consultationId === context.consultationId)
  );
}