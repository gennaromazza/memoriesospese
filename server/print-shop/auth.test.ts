import { describe, expect, it, vi } from 'vitest';
import { createPrintShopAuthenticator, requireVerifiedGoogle } from './auth.js';

function response() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { value: { status } as any, status, json };
}

describe('print-shop Firebase authentication', () => {
  it('uses one Admin SDK token verification and exposes only verified identity fields', async () => {
    const verify = vi.fn(async () => ({
      uid: 'firebase-user',
      email: 'user@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    } as any));
    const authenticate = createPrintShopAuthenticator(verify);
    const req: any = { headers: { authorization: 'Bearer firebase-token' } };
    const res = response();
    const next = vi.fn();

    await authenticate(req, res.value, next);

    expect(verify).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith('firebase-token');
    expect(req.user).toEqual({
      uid: 'firebase-user',
      email: 'user@example.com',
      emailVerified: true,
      provider: 'google.com',
    });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects invalid tokens, unverified email and non-Google providers', async () => {
    const rejected = createPrintShopAuthenticator(async () => {
      throw new Error('revoked');
    });
    const unauthorized = response();
    await rejected(
      { headers: { authorization: 'Bearer bad-token' } } as any,
      unauthorized.value,
      vi.fn(),
    );
    expect(unauthorized.status).toHaveBeenCalledWith(401);

    const unverified = response();
    requireVerifiedGoogle(
      { user: { emailVerified: false, provider: 'google.com' } } as any,
      unverified.value,
      vi.fn(),
    );
    expect(unverified.status).toHaveBeenCalledWith(403);
    expect(unverified.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'email_not_verified' }),
    }));

    const password = response();
    requireVerifiedGoogle(
      { user: { emailVerified: true, provider: 'password' } } as any,
      password.value,
      vi.fn(),
    );
    expect(password.status).toHaveBeenCalledWith(403);
    expect(password.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'google_account_required' }),
    }));
  });
});
