/**
 * Codici di accesso all'Area Cliente (6 cifre via email).
 *
 * Il codice non viene mai salvato in chiaro: in Firestore
 * (`clientAreaLoginCodes/{emailKey}`) resta solo l'hash. Ogni codice vale
 * 10 minuti e 5 tentativi; per ogni email si possono chiedere al massimo
 * 5 codici ogni 15 minuti.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const SEND_WINDOW_MS = 15 * 60 * 1000;
export const MAX_SENDS_PER_WINDOW = 5;

export interface LoginCodeRecord {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  sendWindowStart: number;
  sendCount: number;
}

/** Chiave del documento: hash dell'email, così l'id non contiene dati personali. */
export function emailKey(normalizedEmail: string): string {
  return createHash('sha256').update(`client-area:${normalizedEmail}`).digest('hex').slice(0, 40);
}

/** Uid Firebase dedicato all'Area Cliente: separato da ogni altro account esistente. */
export function clientAreaUid(normalizedEmail: string): string {
  return `ca_${createHash('sha256').update(`client-area-uid:${normalizedEmail}`).digest('hex').slice(0, 26)}`;
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashCode(normalizedEmail: string, code: string): string {
  return createHash('sha256').update(`${normalizedEmail}:${code}`).digest('hex');
}

export type SendDecision =
  | { allowed: true; record: LoginCodeRecord }
  | { allowed: false; reason: 'rate_limited' };

export function prepareSend(
  previous: LoginCodeRecord | null,
  normalizedEmail: string,
  code: string,
  now: number,
): SendDecision {
  const inWindow = previous && now - previous.sendWindowStart < SEND_WINDOW_MS;
  const sendCount = inWindow ? previous.sendCount + 1 : 1;
  if (sendCount > MAX_SENDS_PER_WINDOW) return { allowed: false, reason: 'rate_limited' };
  return {
    allowed: true,
    record: {
      codeHash: hashCode(normalizedEmail, code),
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      sendWindowStart: inWindow ? previous.sendWindowStart : now,
      sendCount,
    },
  };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'expired' | 'too_many_attempts' }
  | { ok: false; reason: 'wrong_code'; attemptsLeft: number };

export function verifyCode(
  record: LoginCodeRecord | null,
  normalizedEmail: string,
  code: string,
  now: number,
): VerifyResult {
  if (!record || !record.codeHash) return { ok: false, reason: 'missing' };
  if (now > record.expiresAt) return { ok: false, reason: 'expired' };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
  const expected = Buffer.from(record.codeHash, 'hex');
  const actual = Buffer.from(hashCode(normalizedEmail, code.trim()), 'hex');
  if (expected.length === actual.length && timingSafeEqual(expected, actual)) return { ok: true };
  return { ok: false, reason: 'wrong_code', attemptsLeft: Math.max(0, MAX_ATTEMPTS - record.attempts - 1) };
}
