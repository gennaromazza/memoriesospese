import { describe, expect, it, vi } from 'vitest';
import { runDesktopPasskeyHandoff } from './admin-passkey-handoff';

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
        claims: { auth_time: 1_800_000_000, apk: { sat: 1_800_000_000, exp: now + 60_000 } },
      })),
    };
    const verifiedUser = {
      uid,
      getIdTokenResult: vi.fn(async () => ({
        claims: { auth_time: 1_800_000_000, apk: { sat: 1_800_000_000, exp: now + 60_000 } },
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
        if (path === '/finalize') return {} as T;
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
});