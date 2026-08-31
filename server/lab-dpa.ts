import type { Timestamp } from 'firebase-admin/firestore';

export type LabDpaStatus = 'pending' | 'signed';

export class LabDpaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LabDpaValidationError';
  }
}

interface LabDpaState {
  dataProcessingAgreementStatus?: unknown;
  dataProcessingAgreementSignedAt?: unknown;
  dataProcessingAgreementReference?: unknown;
}

interface LabDpaPatch {
  dataProcessingAgreementStatus?: unknown;
  dataProcessingAgreementReference?: unknown;
}

/**
 * Costruisce lo stato DPA iniziale. La data di firma è sempre server-side e
 * un laboratorio pending non conserva riferimenti che sembrino una firma.
 */
export function createLabDpaFields(
  patch: LabDpaPatch,
  now: Timestamp,
): Record<string, unknown> {
  const status = parseStatus(patch.dataProcessingAgreementStatus, 'pending');
  if (status === 'pending') {
    return { dataProcessingAgreementStatus: 'pending' };
  }

  const reference = parseReference(patch.dataProcessingAgreementReference);
  if (!reference) {
    throw new LabDpaValidationError(
      'Indica il riferimento dell’accordo sul trattamento dei dati firmato',
    );
  }
  return {
    dataProcessingAgreementStatus: 'signed',
    dataProcessingAgreementSignedAt: now,
    dataProcessingAgreementReference: reference,
  };
}

/**
 * Applica una patch DPA mantenendo l'invariante signed => data+riferimento.
 * Il passaggio a pending elimina entrambi i campi di firma; deleteValue è il
 * sentinel Firestore passato dal chiamante per mantenere questo modulo puro.
 */
export function updateLabDpaFields(
  current: LabDpaState,
  patch: LabDpaPatch,
  now: Timestamp,
  deleteValue: unknown,
): Record<string, unknown> {
  const touchesStatus = patch.dataProcessingAgreementStatus !== undefined;
  const touchesReference = patch.dataProcessingAgreementReference !== undefined;
  if (!touchesStatus && !touchesReference) return {};

  const status = parseStatus(
    touchesStatus
      ? patch.dataProcessingAgreementStatus
      : current.dataProcessingAgreementStatus,
    'pending',
  );
  if (status === 'pending') {
    return {
      dataProcessingAgreementStatus: 'pending',
      dataProcessingAgreementSignedAt: deleteValue,
      dataProcessingAgreementReference: deleteValue,
    };
  }

  const reference = parseReference(
    touchesReference
      ? patch.dataProcessingAgreementReference
      : current.dataProcessingAgreementReference,
  );
  if (!reference) {
    throw new LabDpaValidationError(
      'Indica il riferimento dell’accordo sul trattamento dei dati firmato',
    );
  }

  return {
    dataProcessingAgreementStatus: 'signed',
    dataProcessingAgreementReference: reference,
    ...(!isValidSignedAt(current.dataProcessingAgreementSignedAt) ||
    current.dataProcessingAgreementStatus !== 'signed'
      ? { dataProcessingAgreementSignedAt: now }
      : {}),
  };
}

/** Confine usato dallo shop prima di trasferire qualsiasi fotografia al lab. */
export function hasValidLabDpa(value: LabDpaState): boolean {
  return (
    value?.dataProcessingAgreementStatus === 'signed' &&
    Boolean(parseReferenceForCheck(value.dataProcessingAgreementReference)) &&
    isValidSignedAt(value.dataProcessingAgreementSignedAt)
  );
}

function parseStatus(value: unknown, fallback: LabDpaStatus): LabDpaStatus {
  if (value === undefined) return fallback;
  if (value !== 'pending' && value !== 'signed') {
    throw new LabDpaValidationError('Stato accordo trattamento dati non valido');
  }
  return value;
}

function parseReference(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new LabDpaValidationError('Riferimento accordo trattamento dati non valido');
  }
  const normalized = value.trim();
  if (normalized.length > 200) {
    throw new LabDpaValidationError('Riferimento accordo trattamento dati troppo lungo');
  }
  return normalized || undefined;
}

function parseReferenceForCheck(value: unknown): string | undefined {
  try {
    return parseReference(value);
  } catch {
    return undefined;
  }
}

function isValidSignedAt(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {
    toMillis?: () => number;
    toDate?: () => Date;
  };
  try {
    if (typeof candidate.toMillis === 'function') {
      const millis = candidate.toMillis();
      return Number.isFinite(millis) && millis > 0;
    }
    if (typeof candidate.toDate === 'function') {
      return Number.isFinite(candidate.toDate().getTime());
    }
  } catch {
    return false;
  }
  return false;
}
