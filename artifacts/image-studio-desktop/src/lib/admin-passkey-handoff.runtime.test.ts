import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  auth: { currentUser: null as any, authStateReady: vi.fn() },
  signIn: vi.fn(),
}));
vi.mock('./firebase', () => ({ auth: h.auth }));
vi.mock('firebase/auth', () => ({ signInWithCustomToken: h.signIn }));
vi.mock('./api', () => ({ getApiUrl: (path: string) => `https://api.example.test${path}` }));

import { DesktopPasskeySessionRefreshError, runDesktopPasskeyHandoff } from './admin-passkey-handoff';

const serverNow = 1_800_000_000_000;
const expectedClaim = {
  req: true, at: serverNow, sat: serverNow / 1000,
  exp: serverNow + 12 * 60 * 60_000,
};
const handoffId = 'R'.repeat(43);
const basePath = '/api/admin/security/desktop-handoff';
let initialUser: any;
let verifiedUser: any;
let openExternal: ReturnType<typeof vi.fn>;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockFlow({ rejectFirstStatus = false, verified = true, failRedeem = false } = {}) {
  let statusReads = 0;
  const fetch = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path === `${basePath}/start`) return json({
      handoffId,
      verificationUrl: `https://imagestudiofotografico.com/admin/sicurezza?desktopHandoff=${handoffId}`,
      expiresAt: serverNow + 600_000,
    });
    if (path === `${basePath}/${handoffId}/status`) {
      if (++statusReads === 1 && rejectFirstStatus) return json({ error: 'Token expired' }, 401);
      return json({ status: 'verified' });
    }
    if (path === `${basePath}/${handoffId}/redeem`) {
      if (failRedeem) throw new TypeError('Connection lost after redemption');
      return json({ customToken: 'isolated-custom-token' });
    }
    if (path === `${basePath}/finalize`) return json({ expectedClaim });
    if (path === '/api/admin/security/status') {
      expect(options?.method).toBe('GET');
      expect(options?.cache).toBe('no-store');
      expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer verified-id-token');
      return json({ passkeyRequired: true, verified, verifiedUntil: expectedClaim.exp });
    }
    throw new Error(`Unexpected request ${path}`);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  initialUser = {
    uid: 'isolated-admin',
    getIdToken: vi.fn(async (force: boolean) => force ? 'renewed-id-token' : 'initial-id-token'),
  };
  verifiedUser = {
    uid: 'isolated-admin',
    getIdToken: vi.fn(async () => 'verified-id-token'),
    getIdTokenResult: vi.fn(async () => ({
      claims: { auth_time: expectedClaim.sat, apk: expectedClaim },
    })),
  };
  h.auth.currentUser = initialUser;
  h.auth.authStateReady.mockImplementation(async () => {
    h.auth.currentUser ??= initialUser;
  });
  h.signIn.mockImplementation(async () => { h.auth.currentUser = verifiedUser; });
  openExternal = vi.fn(async () => undefined);
  vi.stubGlobal('window', { imageStudioDesktop: { openExternal } });
  // The server and Windows clocks deliberately differ by a full day.
  vi.spyOn(Date, 'now').mockReturnValue(serverNow + 24 * 60 * 60_000);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Windows handoff runtime with isolated Firebase and HTTP boundaries', () => {
  it('restores auth, renews a rejected token and confirms success using server time', async () => {
    h.auth.currentUser = null;
    const fetch = mockFlow({ rejectFirstStatus: true });
    await runDesktopPasskeyHandoff();
    expect(h.auth.authStateReady).toHaveBeenCalled();
    expect(initialUser.getIdToken.mock.calls.map(([force]: [boolean]) => force)).toEqual([false, false, true, false]);
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(h.signIn).toHaveBeenCalledWith(h.auth, 'isolated-custom-token');
    expect(verifiedUser.getIdTokenResult).toHaveBeenCalledWith(true);
    expect(fetch.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      `${basePath}/start`,
      `${basePath}/${handoffId}/status`,
      `${basePath}/${handoffId}/status`,
      `${basePath}/${handoffId}/redeem`,
      `${basePath}/finalize`,
      '/api/admin/security/status',
    ]);
  });

  it('limits authentication rejection to one token renewal instead of looping', async () => {
    const fetch = vi.fn(async () => json({ error: 'Sessione non autorizzata' }, 401));
    vi.stubGlobal('fetch', fetch);
    await expect(runDesktopPasskeyHandoff()).rejects.toThrow('Sessione non autorizzata');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(initialUser.getIdToken.mock.calls.map(([force]: [boolean]) => force)).toEqual([false, true]);
    expect(openExternal).not.toHaveBeenCalled();
    expect(h.signIn).not.toHaveBeenCalled();
  });

  it('does not replay a one-time redemption after an uncertain network response', async () => {
    const fetch = mockFlow({ failRedeem: true });
    await expect(runDesktopPasskeyHandoff()).rejects.toThrow('Connection lost after redemption');
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/redeem'))).toHaveLength(1);
    expect(h.signIn).not.toHaveBeenCalled();
  });

  it('does not announce success when the server rejects the refreshed proof', async () => {
    mockFlow({ verified: false });
    await expect(runDesktopPasskeyHandoff()).rejects.toBeInstanceOf(DesktopPasskeySessionRefreshError);
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(h.signIn).toHaveBeenCalledTimes(1);
  });
});
