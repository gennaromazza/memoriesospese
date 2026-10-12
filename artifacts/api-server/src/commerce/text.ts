import { createHash } from 'node:crypto';

/** Testo senza caratteri di controllo, tagliato alla lunghezza massima. */
export function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ');
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

export function hashId(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function centsToEuros(cents: number): number {
  if (!Number.isSafeInteger(cents)) throw new Error('Importo in centesimi non valido');
  return cents / 100;
}

export function timestampMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const seconds = value.seconds ?? value._seconds;
  if (typeof seconds === 'number') return seconds * 1000;
  if (typeof value === 'string') return Date.parse(value) || 0;
  return 0;
}

/** Prefisso del numero ordine: `ST` per le stampe, `SH` per lo shop. */
export function createOrderNumber(id: string, date: Date, prefix = 'ST'): string {
  const year = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    timeZone: 'Europe/Rome',
  }).format(date);
  return `${prefix}-${year}-${id.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}`;
}

export function splitCustomerName(
  value: string,
  fallbackLast = 'Shop stampe',
): { first: string; last: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return {
    first: parts.shift() || 'Cliente',
    last: parts.join(' ') || fallbackLast,
  };
}
