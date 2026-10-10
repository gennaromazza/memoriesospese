import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp();
}

/**
 * Compatibility facade for the legacy Functions code while using the
 * modular Admin SDK API supported by current firebase-admin versions.
 */
export const admin = {
  get apps() {
    return getApps();
  },
  initializeApp,
  auth: getAuth,
  firestore: getFirestore,
};