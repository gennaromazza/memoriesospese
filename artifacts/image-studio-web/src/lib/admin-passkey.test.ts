import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as any },
  startAuthentication: vi.fn(async () => ({ id: 'credential-response' })),
}));

vi.mock('./firebase', () => ({ auth: mocks.auth }));
vi.mock('./basePath', () => ({ createUrl: (path: string) => path }));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  platformAuthenticatorIsAvailable: async () => true,
  startAuthentication: mocks.startAuthentication,
  startRegistration: vi.fn(),
}));

import { AdminPasskeyClient, AdminPasskeyRefreshError, AdminSecurityError } from './admin-passkey';

const claim = { req: true, exp: 1_900_000_000_000, at: 1_800_000_000_000, sat: 1_700_000_000 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mocks.auth.currentUser = null;
});

describe('admin passkey session refresh', () => {
  it('retains the server claim and retries refresh without repeating the consumed WebAuthn verification', async () => {
    let tokenRefreshes = 0;
    mocks.auth.currentUser = {
      getIdToken: vi.fn(async () => 'test-id-token'),
      getIdTokenResult: vi.fn(async () => {
        tokenRefreshes += 1;
        if (tokenRefreshes < 4) throw new Error('network unavailable');
        return { claims: { apk: claim } };
      }),
    };

    const fetchMock = vi.fn(async (url: string) => {
      const body = url.endsWith('/authentication/options')
        ? { challenge: 'non-secret-test-challenge' }
        : { verifiedUntil: claim.exp, expectedClaim: claim };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('setTimeout', ((callback: () => void) => {
      callback();
      return 0;
    }) as typeof setTimeout);

    let refreshError: unknown;
    try {
      await AdminPasskeyClient.verify();
    } catch (error) {
      refreshError = error;
    }

    expect(refreshError).toBeInstanceOf(AdminPasskeyRefreshError);
    expect((refreshError as AdminPasskeyRefreshError).expectedClaim).toEqual(claim);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/authentication/verify'))).toHaveLength(1);

    await AdminPasskeyClient.refreshEnforcementClaim((refreshError as AdminPasskeyRefreshError).expectedClaim);
    expect(tokenRefreshes).toBe(4);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/authentication/verify'))).toHaveLength(1);
  });

  it('keeps a real server rejection distinct from a failed browser-token refresh', async () => {
    const getIdTokenResult = vi.fn();
    mocks.auth.currentUser = {
      getIdToken: vi.fn(async () => 'test-id-token'),
      getIdTokenResult,
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/authentication/options')) {
        return new Response(JSON.stringify({ challenge: 'non-secret-test-challenge' }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'Verifica non valida', code: 'challenge_expired' }), { status: 400 });
    });
    vi.stubGlobal('fetch', fetchMock);

    let rejection: unknown;
    try {
      await AdminPasskeyClient.verify();
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(AdminSecurityError);
    expect(rejection).not.toBeInstanceOf(AdminPasskeyRefreshError);
    expect((rejection as AdminSecurityError).code).toBe('challenge_expired');
    expect(getIdTokenResult).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/authentication/verify'))).toHaveLength(1);
  });
});