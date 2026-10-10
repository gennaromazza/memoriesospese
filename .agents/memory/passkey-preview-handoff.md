---
name: Passkey in Preview
description: Sicurezza admin quando la Preview Replit usa un'origine diversa dal dominio WebAuthn di produzione.
---

**Regola:** Per usare il pannello admin dalla Preview, mantenere attiva la MFA di produzione e completare una verifica passkey temporanea sul dominio WebAuthn ufficiale. Non disattivare l'obbligo MFA né tentare di riutilizzare sul dominio Preview una passkey registrata per il sito.

**Why:** La Preview ha un'origine diversa, mentre la sessione Firebase può accedere agli stessi dati live; un bypass allargherebbe l'accesso amministrativo e una passkey è legata al dominio che l'ha registrata.

**How to apply:** Usare un handoff monouso, breve e legato alla sessione Preview, con la passkey verificata sul dominio ufficiale. Separare inoltre Firebase di sviluppo dalla produzione prima di fare test che possono modificare dati.
