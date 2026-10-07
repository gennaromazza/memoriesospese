import React, { useSyncExternalStore } from "react";
const user = { uid: "fixture-user", email: "customer@example.test", displayName: "Fixture Customer" };
const userProfile = { displayName: user.displayName };
export function useFirebaseAuth() {
  const signedIn = useSyncExternalStore(
    callback => {
      window.addEventListener('fixture-auth', callback);
      return () => window.removeEventListener('fixture-auth', callback);
    },
    () => !new URLSearchParams(window.location.search).has('loginFixture')
      || sessionStorage.getItem('fixtureSignedIn') === '1',
  );
  const login = async () => {
    sessionStorage.setItem('fixtureSignedIn', '1');
    window.dispatchEvent(new Event('fixture-auth'));
    return { user, redirecting: false };
  };
  return { user: signedIn ? user : null, userProfile: signedIn ? userProfile : null,
    isLoading: false, isAuthenticated: signedIn, isAdmin: true,
    login, register: login, loginWithGoogle: login,
    resetPassword: async () => undefined, googleLinkRequest: null };
}
export default function FirebaseAuthProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }