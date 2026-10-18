---
name: QR passkey enrollment
description: Security boundary for authorizing passkey registration on a new device.
---

A QR approval from an existing device authorizes only one new WebAuthn credential registration. It must not transfer the existing Firebase session or mint the general admin-verification claim. Require a fresh assertion from an existing production passkey, bind the request to the same admin identity and a short expiry, then require the new device to complete its own registration and normal passkey verification.

**Why:** Adding a second device must not turn the QR into an MFA bypass or a portable admin session.

**How to apply:** Keep QR approval on a restricted route separate from admin settings and desktop handoff. Tests must verify that neither approval nor registration grants general admin access before the new credential is explicitly verified.
