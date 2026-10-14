import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createVerifier } from './admin-passkey-handoff';

describe('desktop passkey verifier', () => {
  it('matches the hash the server computes from the verifier text', async () => {
    const { verifier, verifierHash } = await createVerifier();
    // Same formula as handoffVerifierMatches in the API server.
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(verifierHash);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifierHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
