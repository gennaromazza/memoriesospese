---
name: QR passkey enrollment
description: Security boundary for authorizing passkey registration on a new device.
---

A QR approval from an existing device authorizes only one new WebAuthn credential registration. It must not transfer the existing Firebase session or mint the general admin-verification claim. Require a fresh assertion from an existing production passkey, bind the request to the same admin identity and a short expiry, then require the new device to complete its own registration and normal passkey verification. A passkey listed for an RP belongs to the account; it does not prove the current browser has that credential, so never hide the QR enrollment option on that basis.

**Why:** Adding a second device must not turn the QR into an MFA bypass or a portable admin session. RP-scoped credential metadata cannot distinguish a credential on this laptop from one held by a phone.

**How to apply:** Keep QR approval on a restricted route separate from admin settings and desktop handoff. Offer it on the production origin whenever enforcement is active and a trusted production passkey exists. For browser E2E, map the official RP hostname to a local HTTPS proxy, use disposable Firebase emulators, and perform real WebAuthn ceremonies with a virtual authenticator; never proxy test API traffic to production. Tests must verify visibility on a second browser sharing the same RP and ensure neither approval nor registration grants general admin access before the new credential is explicitly verified.

## Firestore emulator concurrency tests

**Rule:** To force two enrollment requests into the same transaction window, synchronize them after the direct enrollment preflight reads return, before either consumes the registration challenge. Do not block inside competing Firestore transactions.

**Why:** The Firestore server client can hold document locks during a transaction. A test barrier inside `transaction.get()` can prevent the second transaction from reaching the barrier and deadlock instead of exercising Firestore's retry/serialization behavior.

**How to apply:** Use a dedicated `demo-*` project, a loopback `FIRESTORE_EMULATOR_HOST`, and no production credentials. Let both requests observe the approved enrollment, then allow the real emulator transactions to race; assert one registration succeeds and the other cannot change the stored keys.
