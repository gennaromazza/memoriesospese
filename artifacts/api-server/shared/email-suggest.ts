/**
 * Suggerimento correzione typo nei domini email ("gnail.com" → "gmail.com").
 *
 * Pensato per i form pubblici (preventivo rapido, prenotazioni): un dominio
 * sbagliato = il cliente non riceve mai l'OTP/la conferma.
 *
 * Strategia conservativa: suggeriamo SOLO quando il dominio digitato è "vicino"
 * (distanza di edit ≤ 2, proporzionata alla lunghezza) a uno dei domini più
 * comuni in Italia, e non è già un dominio noto. Mai bloccare l'invio: è solo
 * un suggerimento che l'utente può accettare o ignorare.
 */

/** Domini email più comuni tra i clienti italiani */
export const COMMON_EMAIL_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'hotmail.it',
  'outlook.com',
  'outlook.it',
  'yahoo.com',
  'yahoo.it',
  'libero.it',
  'icloud.com',
  'virgilio.it',
  'tiscali.it',
  'alice.it',
  'live.com',
  'live.it',
  'msn.com',
  'email.it',
  'inwind.it',
  'fastwebnet.it',
  'tim.it',
  'tin.it',
  'aruba.it',
  'pec.it',
  'protonmail.com',
  'proton.me',
] as const;

/** Typo frequentissimi mappati direttamente (più affidabile della distanza) */
const DIRECT_TYPO_MAP: Record<string, string> = {
  'gnail.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.it': 'gmail.com', // gmail.it non esiste come servizio email
  'gmail.comm': 'gmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'libero.com': 'libero.it',
  'icloud.it': 'icloud.com',
  'iclod.com': 'icloud.com',
  'outlok.com': 'outlook.com',
  'yaho.com': 'yahoo.com',
};

/** Distanza di Levenshtein classica (iterativa, O(n*m)) */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * Se l'email sembra contenere un typo nel dominio, ritorna l'email corretta
 * suggerita. Altrimenti null (incluso quando l'email è già corretta o troppo
 * diversa da qualsiasi dominio noto per suggerire con fiducia).
 */
export function suggestEmailCorrection(email: string): string | null {
  const trimmed = (email || '').trim().toLowerCase();
  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx <= 0 || atIdx === trimmed.length - 1) return null;

  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);
  // Dominio senza punto o ancora in digitazione: non suggerire
  if (!domain.includes('.') || domain.endsWith('.')) return null;
  // TLD ancora incompleto (es. "gmail.c"): aspetta che finisca di digitare
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (tld.length < 2) return null;

  // Già un dominio noto → nessun suggerimento
  if ((COMMON_EMAIL_DOMAINS as readonly string[]).includes(domain)) return null;

  // Typo mappato direttamente
  const direct = DIRECT_TYPO_MAP[domain];
  if (direct) return `${local}@${direct}`;

  // Distanza di edit: soglia 1 per domini corti, 2 per domini più lunghi
  let best: string | null = null;
  let bestDist = Infinity;
  for (const known of COMMON_EMAIL_DOMAINS) {
    const maxDist = known.length <= 8 ? 1 : 2;
    const d = editDistance(domain, known);
    if (d <= maxDist && d < bestDist) {
      best = known;
      bestDist = d;
    }
  }
  return best ? `${local}@${best}` : null;
}
