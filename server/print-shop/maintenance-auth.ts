import { createHash, timingSafeEqual } from 'node:crypto';

export function verifyCronSecret(candidate: string | undefined, expected: string | undefined): boolean {
  if (!candidate || !expected || expected.length < 32) return false;
  const candidateHash = createHash('sha256').update(candidate).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}
