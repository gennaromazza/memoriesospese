---
name: FIREBASE_ADMIN_CREDENTIALS formato doppio
description: il secret può essere JSON puro o base64; storia della chiave revocata da Google
---
Regola: `FIREBASE_ADMIN_CREDENTIALS` può essere JSON puro (inizia con `{`) o base64 di JSON. Tutti i consumer (server/firebase-admin.ts, scripts/) devono fare trim + provare JSON diretto, poi base64.
**Why:** ad agosto 2026 Google ha revocato automaticamente la vecchia chiave service-account dopo l'esposizione del repo GitHub pubblico (sintomo: `16 UNAUTHENTICATED` su ogni chiamata Firestore Admin, sia dev che produzione). La nuova chiave è stata incollata come JSON puro dal fotografo.
**How to apply:** nei nuovi script admin usare il parsing dual-format; se ricompare `16 UNAUTHENTICATED` ovunque, sospettare chiave revocata → rigenerare da Firebase console e ripubblicare (la produzione usa lo snapshot dei secrets al publish).
