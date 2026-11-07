import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as any },
  startAuthentication: vi.fn(async () => ({ id: 'credential-response' })),
  signInWithCustomToken: vi.fn(async (_auth: unknown, _token: string) => ({ user: {
    uid: 'admin-uid',
    getIdTokenResult: vi.fn(async () => ({ claims: { adminDeviceTrust: { id: 'D'.repeat(43) } } })),
  } })),
}));

vi.mock('./firebase', () => ({ auth: mocks.auth }));
vi.mock('firebase/auth', () => ({ signInWithCustomToken: mocks.signInWithCustomToken }));
vi.mock('./basePath', () => ({ createUrl: (path: string) => path }));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  platformAuthenticatorIsAvailable: async () => true,
  startAuthentication: mocks.startAuthentication,
  startRegistration: vi.fn(),
}));

import {
  AdminPasskeyClient,
  AdminPasskeyRefreshError,
  AdminSecurityError,
  canOfferDeviceEnrollment,
  getDeviceEnrollmentUnavailableReason,
  type AdminSecurityStatus,
} from './admin-passkey';

const claim = { req: true, exp: 1_900_000_000_000, at: 1_800_000_000_000, sat: 1_700_000_000 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mocks.auth.currentUser = null;
});

describe('autorizzazione QR per nuovo dispositivo', () => {
  const baseStatus: AdminSecurityStatus = {
    passkeyRequired: true,
    rememberedDevices: [],
    rememberedDeviceId: null,
    passkeys: [{
      id: 'phone-passkey',
      label: 'Telefono',
      rpId: 'imagestudiofotografico.com',
      deviceType: 'multiDevice',
      backedUp: true,
      createdAt: 1,
      lastUsedAt: null,
    }],
    recoveryCodesRemaining: 0,
    recoveryCodesGeneratedAt: null,
    lockedUntil: null,
    verified: false,
    activationReady: true,
    verifiedUntil: null,
    expectedClaim: null,
  };

  it('mostra il QR sul portatile anche se l’account ha già una passkey per lo stesso dominio', () => {
    expect(canOfferDeviceEnrollment(baseStatus, 'imagestudiofotografico.com')).toBe(true);
  });

  it('non offre l’autorizzazione se manca un dispositivo fidato o l’obbligo passkey è spento', () => {
    expect(canOfferDeviceEnrollment({ ...baseStatus, passkeys: [] }, 'imagestudiofotografico.com')).toBe(false);
    expect(canOfferDeviceEnrollment({ ...baseStatus, passkeyRequired: false }, 'imagestudiofotografico.com')).toBe(false);
  });

  it('non espone la registrazione QR dalla Preview o da un altro dominio', () => {
    expect(canOfferDeviceEnrollment(baseStatus, 'preview.replit.dev')).toBe(false);
  });

  it('spiega perché il QR non è disponibile e indica un percorso sicuro', () => {
    expect(getDeviceEnrollmentUnavailableReason(baseStatus, 'imagestudiofotografico.com')).toBeNull();
    expect(getDeviceEnrollmentUnavailableReason(baseStatus, 'preview.replit.dev')).toContain(
      'solo sul sito ufficiale',
    );
    expect(getDeviceEnrollmentUnavailableReason(
      { ...baseStatus, passkeys: [] },
      'imagestudiofotografico.com',
    )).toContain('codice di recupero');
    expect(getDeviceEnrollmentUnavailableReason(
      { ...baseStatus, passkeyRequired: false },
      'imagestudiofotografico.com',
    )).toContain('attiva prima l’obbligo passkey');
  });
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

describe('fiducia browser ricordato', () => {
  it('attiva la fiducia solo dopo verifica WebAuthn e scambia il custom token per la stessa identità', async () => {
    const deviceId = 'D'.repeat(43);
    const signedInUser = {
      uid: 'admin-uid',
      getIdTokenResult: vi.fn(async () => ({ claims: { adminDeviceTrust: { id: deviceId } } })),
    };
    mocks.auth.currentUser = {
      uid: 'admin-uid',
      getIdToken: vi.fn(async () => 'test-id-token'),
      getIdTokenResult: vi.fn(async () => ({ claims: {} })),
    };
    mocks.signInWithCustomToken.mockResolvedValueOnce({ user: signedInUser } as any);
    const fetchMock = vi.fn(async (url: string) => {
      const body = url.endsWith('/authentication/options')
        ? { challenge: 'test-challenge' }
        : {
            verifiedUntil: claim.exp,
            expectedClaim: claim,
            customToken: 'remembered-device-custom-token',
            rememberedDevice: { id: deviceId, expiresAt: Date.now() + 30 * 86400_000 },
          };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await AdminPasskeyClient.verify({ rememberDevice: true, deviceLabel: 'Portatile' });

    expect(mocks.signInWithCustomToken).toHaveBeenCalledWith(
      mocks.auth,
      'remembered-device-custom-token',
    );
    expect(signedInUser.getIdTokenResult).toHaveBeenCalledWith(true);
    const verifyRequest = fetchMock.mock.calls.find(([url]) => url.endsWith('/authentication/verify'));
    expect(JSON.parse((verifyRequest?.[1] as RequestInit).body as string)).toMatchObject({
      rememberDevice: true,
      deviceLabel: 'Portatile',
    });
    expect((verifyRequest?.[1] as RequestInit).credentials).toBe('include');
  });

  it('ripristina la sessione soltanto con il custom token ritornato dal server', async () => {
    mocks.auth.currentUser = {
      uid: 'admin-uid',
      getIdToken: vi.fn(async () => 'test-id-token'),
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      restored: true,
      customToken: 'restored-device-token',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(AdminPasskeyClient.restoreRememberedDevice()).resolves.toBe(true);
    expect(mocks.signInWithCustomToken).toHaveBeenCalledWith(mocks.auth, 'restored-device-token');
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include');
  });

  it('non crea una sessione privilegiata quando non esiste un cookie valido', async () => {
    mocks.auth.currentUser = {
      uid: 'admin-uid',
      getIdToken: vi.fn(async () => 'test-id-token'),
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ restored: false }), { status: 200 })));

    await expect(AdminPasskeyClient.restoreRememberedDevice()).resolves.toBe(false);
    expect(mocks.signInWithCustomToken).not.toHaveBeenCalled();
  });
});