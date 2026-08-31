import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  credentialFromError: vi.fn(),
  fetchSignInMethodsForEmail: vi.fn(),
  getRedirectResult: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: null },
  db: {},
}));

vi.mock('firebase/auth', () => {
  class GoogleAuthProviderMock {
    static credentialFromError = authMocks.credentialFromError;
    static credentialFromResult = vi.fn();

    addScope() {}
    setCustomParameters() {}
  }

  return {
    GoogleAuthProvider: GoogleAuthProviderMock,
    createUserWithEmailAndPassword: vi.fn(),
    fetchSignInMethodsForEmail: authMocks.fetchSignInMethodsForEmail,
    getRedirectResult: authMocks.getRedirectResult,
    linkWithCredential: vi.fn(),
    linkWithPopup: vi.fn(),
    linkWithRedirect: vi.fn(),
    onAuthStateChanged: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signInWithCredential: vi.fn(),
    signInWithPopup: authMocks.signInWithPopup,
    signInWithRedirect: authMocks.signInWithRedirect,
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  };
});

vi.mock('firebase/firestore', () => ({
  arrayUnion: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

import { AuthService, GoogleAccountLinkRequiredError } from '@/lib/auth';

describe('Google redirect account linking', () => {
  beforeEach(() => {
    authMocks.credentialFromError.mockReset();
    authMocks.fetchSignInMethodsForEmail.mockReset();
    authMocks.getRedirectResult.mockReset();
    authMocks.signInWithPopup.mockReset();
    authMocks.signInWithRedirect.mockReset();
  });

  it('keeps the collision in memory and asks for linking without reopening Google', async () => {
    const storage = {
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: storage,
    });

    const collision = {
      code: 'auth/account-exists-with-different-credential',
      customData: { email: 'cliente@example.com' },
    };
    authMocks.getRedirectResult.mockRejectedValueOnce(collision);
    authMocks.credentialFromError.mockReturnValueOnce({
      providerId: 'google.com',
      signInMethod: 'google.com',
    });
    authMocks.fetchSignInMethodsForEmail.mockResolvedValueOnce(['password']);

    await expect(AuthService.completeGoogleRedirectSignIn()).rejects.toMatchObject({
      code: 'auth/google-account-link-required',
      email: 'cliente@example.com',
    });

    await expect(AuthService.loginWithGoogle()).rejects.toBeInstanceOf(GoogleAccountLinkRequiredError);
    expect(authMocks.signInWithPopup).not.toHaveBeenCalled();
    expect(authMocks.signInWithRedirect).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).toHaveBeenCalledWith('print_shop_google_redirect');
  });

  it('distinguishes a current Google session from a legacy password session', async () => {
    const legacyUser = {
      emailVerified: true,
      providerData: [{ providerId: 'google.com' }],
      getIdTokenResult: vi.fn().mockResolvedValue({ signInProvider: 'password' }),
    };
    const googleUser = {
      emailVerified: true,
      providerData: [{ providerId: 'google.com' }],
      getIdTokenResult: vi.fn().mockResolvedValue({ signInProvider: 'google.com' }),
    };

    await expect(AuthService.isGoogleSession(legacyUser as never)).resolves.toBe(false);
    await expect(AuthService.isGoogleSession(googleUser as never)).resolves.toBe(true);
  });
});
