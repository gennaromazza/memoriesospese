import { describe, expect, it, vi } from 'vitest';
import {
  DesktopPasskeyFinalizeRetryError,
  DesktopPasskeySessionRefreshError,
  finalizeDesktopPasskeySession,
  refreshDesktopPasskeySession,
  runDesktopPasskeyHandoff,
} from './admin-passkey-handoff';

describe('Windows passkey handoff', () => {
  it('opens the trusted browser flow, waits for approval, then establishes a verified app session', async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    const uid = 'isolated-admin';
    let now = 1_800_000_000_000;
    let statusReads = 0;
    let activeUser: {
      uid: string;
      getIdTokenResult(forceRefresh?: boolean): Promise<{ claims: Record<string, unknown> }>;
    } | null = {
      uid,
      getIdTokenResult: vi.fn(async () => ({
        claims: { auth_time: 1_800_000_000, apk: { req: true, at: 1_800_000_000, sat: 1_800_000_000, exp: now + 60_000 } },
      })),
    };
    const verifiedUser = {
      uid,
      getIdTokenResult: vi.fn(async () => ({
        claims: { auth_time: 1_800_000_000, apk: { req: true, at: 1_800_000_000, sat: 1_800_000_000, exp: now + 60_000 } },
      })),
    };

    await runDesktopPasskeyHandoff({
      request: vi.fn(async <T>(path: string, body: unknown): Promise<T> => {
        calls.push({ path, body });
        if (path === '/start') {
          return {
            handoffId: 'request-id',
            verificationUrl: 'https://imagestudiofotografico.com/admin/sicurezza?desktopHandoff=request-id',
            expiresAt: now + 600_000,
          } as T;
        }
        if (path.endsWith('/status')) {
          statusReads += 1;
          return { status: statusReads === 1 ? 'pending' : 'verified' } as T;
        }
        if (path.endsWith('/redeem')) return { customToken: 'isolated-custom-token' } as T;
        if (path === '/finalize') return {
          expectedClaim: { req: true, at: 1_800_000_000, sat: 1_800_000_000, exp: now + 60_000 },
        } as T;
        throw new Error(`Unexpected request ${path}`);
      }),
      openExternal: vi.fn(async () => undefined),
      signIn: vi.fn(async (token: string) => {
        expect(token).toBe('isolated-custom-token');
        activeUser = verifiedUser;
      }),
      getCurrentUser: () => activeUser,
      createVerifier: vi.fn(async () => ({
        verifier: 'V'.repeat(43),
        verifierHash: 'H'.repeat(43),
      })),
      sleep: vi.fn(async (milliseconds: number) => {
        now += milliseconds;
      }),
      now: () => now,
      pollIntervalMs: 2,
    });

    expect(statusReads).toBe(2);
    expect(calls.map(({ path }) => path)).toEqual([
      '/start',
      '/request-id/status',
      '/request-id/status',
      '/request-id/redeem',
      '/finalize',
    ]);
    expect(calls[0].body).toEqual({ verifierHash: 'H'.repeat(43) });
    expect(calls[1].body).toEqual({ verifier: 'V'.repeat(43) });
    expect(verifiedUser.getIdTokenResult).toHaveBeenCalledWith(true);
  });

  it('retries only the token refresh after finalization, without replaying the consumed handoff', async () => {
    const calls: string[] = [];
    const uid = 'isolated-admin';
    const now = 1_800_000_000_000;
    const expectedClaim = { req: true as const, at: 1_800_000_000, sat: 1_800_000_000, exp: now + 60_000 };
    let refreshAttempts = 0;
    let activeUser: any = { uid, getIdTokenResult: async () => ({ claims: {} }) };
    const verifiedUser = {
      uid,
      getIdTokenResult: vi.fn(async () => {
        refreshAttempts += 1;
        if (refreshAttempts === 1) throw new Error('network unavailable');
        return { claims: { auth_time: expectedClaim.sat, apk: expectedClaim } };
      }),
    };
    const dependencies = {
      request: vi.fn(async <T>(path: string): Promise<T> => {
        calls.push(path);
        if (path === '/start') {
          return {
            handoffId: 'request-id',
            verificationUrl: 'https://imagestudiofotografico.com/admin/sicurezza?desktopHandoff=request-id',
            expiresAt: now + 600_000,
          } as T;
        }
        if (path.endsWith('/status')) return { status: 'verified' } as T;
        if (path.endsWith('/redeem')) return { customToken: 'isolated-custom-token' } as T;
        if (path === '/finalize') return { expectedClaim } as T;
        throw new Error(`Unexpected request ${path}`);
      }),
      openExternal: vi.fn(async () => undefined),
      signIn: vi.fn(async () => { activeUser = verifiedUser; }),
      getCurrentUser: () => activeUser,
      createVerifier: vi.fn(async () => ({ verifier: 'V'.repeat(43), verifierHash: 'H'.repeat(43) })),
      sleep: vi.fn(async () => undefined),
      now: () => now,
      pollIntervalMs: 2,
    };

    let refreshError: DesktopPasskeySessionRefreshError | null = null;
    try {
      await runDesktopPasskeyHandoff(dependencies);
    } catch (error) {
      if (error instanceof DesktopPasskeySessionRefreshError) refreshError = error;
      else throw error;
    }

    expect(refreshError).not.toBeNull();
    await refreshDesktopPasskeySession(refreshError!.expectedClaim, refreshError!.expectedUid, dependencies);
    expect(calls.filter((path) => path.endsWith('/redeem'))).toHaveLength(1);
    expect(calls.filter((path) => path === '/finalize')).toHaveLength(1);
    expect(verifiedUser.getIdTokenResult).toHaveBeenCalledTimes(2);
  });

  it('retries an unconfirmed finalization without reopening the browser or replaying the passkey', async () => {
    const uid = 'isolated-admin';
    const now = 1_800_000_000_000;
    const expectedClaim = { req: true as const, at: 1_800_000_000, sat: 1_800_000_000, exp: now + 60_000 };
    let activeUser: any = { uid, getIdTokenResult: async () => ({ claims: {} }) };
    const verifiedUser = {
      uid,
      getIdTokenResult: vi.fn(async () => ({
        claims: { auth_time: expectedClaim.sat, apk: expectedClaim },
      })),
    };
    const requests: string[] = [];
    let finalizeAttempts = 0;
    const dependencies = {
      request: vi.fn(async <T>(path: string): Promise<T> => {
        requests.push(path);
        if (path === '/start') {
          return {
            handoffId: 'request-id',
            verificationUrl: 'https://imagestudiofotografico.com/admin/sicurezza?desktopHandoff=request-id',
            expiresAt: now + 600_000,
          } as T;
        }
        if (path.endsWith('/status')) return { status: 'verified' } as T;
        if (path.endsWith('/redeem')) return { customToken: 'isolated-custom-token' } as T;
        if (path === '/finalize') {
          finalizeAttempts += 1;
          if (finalizeAttempts === 1) throw new TypeError('connection dropped after server response');
          return { expectedClaim } as T;
        }
        throw new Error(`Unexpected request ${path}`);
      }),
      openExternal: vi.fn(async () => undefined),
      signIn: vi.fn(async () => { activeUser = verifiedUser; }),
      getCurrentUser: () => activeUser,
      createVerifier: vi.fn(async () => ({ verifier: 'V'.repeat(43), verifierHash: 'H'.repeat(43) })),
      sleep: vi.fn(async () => undefined),
      now: () => now,
      pollIntervalMs: 2,
    };

    let retryError: DesktopPasskeyFinalizeRetryError | null = null;
    try {
      await runDesktopPasskeyHandoff(dependencies);
    } catch (error) {
      if (error instanceof DesktopPasskeyFinalizeRetryError) retryError = error;
      else throw error;
    }

    expect(retryError).not.toBeNull();
    await finalizeDesktopPasskeySession(retryError!.expectedUid, dependencies);
    expect(requests.filter((path) => path.endsWith('/status'))).toHaveLength(1);
    expect(requests.filter((path) => path.endsWith('/redeem'))).toHaveLength(1);
    expect(requests.filter((path) => path === '/finalize')).toHaveLength(2);
    expect(dependencies.openExternal).toHaveBeenCalledTimes(1);
    expect(dependencies.createVerifier).toHaveBeenCalledTimes(1);
  });

  it('rejects a token that is unbound to the expected Firebase auth_time', async () => {
    const expectedClaim = { req: true as const, at: 1_800_000_000, sat: 1_800_000_000, exp: 1_800_000_060_000 };
    const user = {
      uid: 'isolated-admin',
      getIdTokenResult: vi.fn(async () => ({
        claims: { auth_time: expectedClaim.sat + 1, apk: expectedClaim },
      })),
    };
    const dependencies = {
      getCurrentUser: () => user,
      now: () => 1_800_000_000_000,
    } as any;
    await expect(
      refreshDesktopPasskeySession(expectedClaim, user.uid, dependencies),
    ).rejects.toBeInstanceOf(DesktopPasskeySessionRefreshError);
  });

  it('accepts the server claim when the passkey requirement was disabled during handoff', async () => {
    const expectedClaim = { req: false, at: 1_800_000_000, sat: 1_800_000_000, exp: 1_800_000_060_000 };
    const user = {
      uid: 'isolated-admin',
      getIdTokenResult: vi.fn(async () => ({
        claims: { auth_time: expectedClaim.sat, apk: expectedClaim },
      })),
    };
    const dependencies = {
      getCurrentUser: () => user,
      now: () => 1_800_000_000_000,
    } as any;
    await expect(
      refreshDesktopPasskeySession(expectedClaim, user.uid, dependencies),
    ).resolves.toBeUndefined();
  });
});