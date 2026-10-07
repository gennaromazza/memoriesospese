/**
 * Validazione dati fiscali italiani (condivisa client/server).
 *
 * - Codice fiscale: 16 caratteri, checksum ufficiale (carattere di controllo),
 *   con supporto omocodia (cifre sostituite da lettere LMNPQRSTUV).
 * - Partita IVA: 11 cifre, checksum Luhn (algoritmo ufficiale AdE).
 * - Codice SDI (codice destinatario): 7 caratteri alfanumerici, oppure '0000000'.
 * - PEC: formato email.
 *
 * Tutte le funzioni sono tolleranti: accettano input con spazi e minuscole.
 * Restituiscono `true` per stringa vuota SOLO nelle funzioni `isEmptyOrValid*`
 * (i campi fiscali sono sempre opzionali).
 */

const CF_REGEX = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

const CF_ODD_VALUES: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
  K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14,
  U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

function cfEvenValue(ch: string): number {
  // Cifre 0-9 valgono 0-9; lettere A-Z valgono 0-25
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  return ch.charCodeAt(0) - 65;
}

/** Normalizza (trim + maiuscolo, senza spazi interni) */
export function normalizeFiscalString(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * Valida un codice fiscale persona fisica (16 caratteri) con checksum.
 */
export function isValidCodiceFiscale(raw: string): boolean {
  const cf = normalizeFiscalString(raw);
  if (cf.length !== 16) return false;
  if (!CF_REGEX.test(cf)) return false;

  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const ch = cf[i];
    // posizione 1-based: dispari usa tabella, pari usa valore naturale
    sum += (i % 2 === 0) ? CF_ODD_VALUES[ch] : cfEvenValue(ch);
  }
  const expected = String.fromCharCode(65 + (sum % 26));
  return cf[15] === expected;
}

/**
 * Valida una partita IVA italiana (11 cifre, checksum ufficiale).
 */
export function isValidPartitaIva(raw: string): boolean {
  const piva = normalizeFiscalString(raw).replace(/^IT/, '');
  if (!/^\d{11}$/.test(piva)) return false;

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let n = piva.charCodeAt(i) - 48;
    if (i % 2 === 1) {
      // posizioni pari (1-based) raddoppiate
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === piva.charCodeAt(10) - 48;
}

/**
 * Valida un codice destinatario SDI: 7 caratteri alfanumerici.
 * '0000000' è valido (fattura via PEC / consumatore finale).
 */
export function isValidCodiceSdi(raw: string): boolean {
  const sdi = normalizeFiscalString(raw);
  return /^[A-Z0-9]{7}$/.test(sdi);
}

/** Valida una PEC (formato email). */
export function isValidPec(raw: string): boolean {
  const pec = raw.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(pec);
}

// Varianti "campo opzionale": stringa vuota/assente è OK
export const isEmptyOrValidCodiceFiscale = (v?: string) => !v?.trim() || isValidCodiceFiscale(v);
export const isEmptyOrValidPartitaIva = (v?: string) => !v?.trim() || isValidPartitaIva(v);
export const isEmptyOrValidCodiceSdi = (v?: string) => !v?.trim() || isValidCodiceSdi(v);
export const isEmptyOrValidPec = (v?: string) => !v?.trim() || isValidPec(v);
