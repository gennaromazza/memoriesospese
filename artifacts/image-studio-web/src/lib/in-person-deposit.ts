import { IN_PERSON_METHODS, type InPersonMethod } from '@shared/booking-deposit-receipt';

export { IN_PERSON_METHODS, type InPersonMethod };
/** Stesso tetto del server (10.000 euro): intercetta gli errori di digitazione prima dell'invio. */
export const MAX_IN_PERSON_DEPOSIT_CENTS = 1_000_000;
export const IN_PERSON_METHOD_LABELS: Record<InPersonMethod, string> = {
  contante: 'Contanti', carta: 'Carta / POS', bonifico: 'Bonifico',
};

/** "20", "20,5", "20.50" -> centesimi. Null se non e' un importo in euro valido e maggiore di zero. */
export function parseEuroToCents(text: string): number | null {
  const value = text.trim();
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + (match[2] ? Number(match[2].padEnd(2, '0')) : 0);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function formatCentsForInput(cents: number | null | undefined): string {
  if (!cents || !Number.isSafeInteger(cents) || cents <= 0) return '';
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

export interface InPersonDepositBody { amountCents: number; method: InPersonMethod; requestId: string; note?: string }

export function buildInPersonDepositRequest(input: { amountText: string; method: InPersonMethod; note: string; requestId: string }):
  { ok: true; body: InPersonDepositBody } | { ok: false; error: string } {
  const amountCents = parseEuroToCents(input.amountText);
  if (amountCents === null) return { ok: false, error: 'Inserisci un importo in euro maggiore di zero, per esempio 20 oppure 20,50.' };
  if (amountCents > MAX_IN_PERSON_DEPOSIT_CENTS) return { ok: false, error: 'Importo troppo alto: controlla la cifra.' };
  const note = input.note.trim();
  return { ok: true, body: { amountCents, method: input.method, requestId: input.requestId, ...(note ? { note } : {}) } };
}
