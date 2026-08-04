---
name: Fixture e2e nel Firestore di produzione
description: I test/agent e2e possono sporcare il DB reale perché FIREBASE_ADMIN_CREDENTIALS è disponibile anche nei task env
---

Gli ambienti task isolati NON hanno i connettori ma HANNO i secrets, incluso `FIREBASE_ADMIN_CREDENTIALS`: un test e2e che crea gallerie/foto di prova scrive nel Firestore di produzione e il fotografo le vede in dashboard (es. gallerie "E2E Fixture – …" con code `e2e-...-fixture-<ts>`).

**Perché:** successo ad agosto 2026 con i fixture del test esclusione capitoli; ripulite manualmente (docs in `galleries` + `photos` per galleryId).

**Come applicare:** nei test usare SEMPRE mock Firestore (pattern in testing-setup.md), mai l'Admin SDK reale. Se compaiono gallerie fixture, eliminarle con script admin: query `galleries` per prefisso code + `photos` con `galleryId in [...]`, batch delete.
