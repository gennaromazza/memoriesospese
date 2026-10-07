import type { Lab } from '@shared/lab-types';

/** I laboratori legacy senza campo DPA sono sempre pending, mai signed implicito. */
export function isLabDpaSigned(
  lab: Pick<
    Lab,
    | 'dataProcessingAgreementStatus'
    | 'dataProcessingAgreementSignedAt'
    | 'dataProcessingAgreementReference'
  >,
): boolean {
  return Boolean(
    lab.dataProcessingAgreementStatus === 'signed' &&
    typeof lab.dataProcessingAgreementReference === 'string' &&
    lab.dataProcessingAgreementReference.trim() &&
    timestampMillis(lab.dataProcessingAgreementSignedAt) > 0,
  );
}

export function eligiblePrintShopLabs(labs: readonly Lab[]): Lab[] {
  return labs.filter((lab) => lab.attivo !== false && isLabDpaSigned(lab));
}

/** Supporta sia Timestamp Firestore sia la forma JSON restituita dall'API. */
function timestampMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value !== 'object') return 0;
  const candidate = value as {
    toMillis?: () => number;
    toDate?: () => Date;
    seconds?: number;
    _seconds?: number;
  };
  try {
    if (typeof candidate.toMillis === 'function') return candidate.toMillis();
    if (typeof candidate.toDate === 'function') return candidate.toDate().getTime();
  } catch {
    return 0;
  }
  const seconds = candidate.seconds ?? candidate._seconds;
  return typeof seconds === 'number' && Number.isFinite(seconds) ? seconds * 1_000 : 0;
}
