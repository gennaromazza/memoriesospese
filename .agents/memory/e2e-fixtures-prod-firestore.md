---
name: E2E e Firestore - mai la produzione
description: Regola: i test e2e/fixture non devono mai scrivere sul Firestore di produzione; usare l'emulatore
---

I test e2e o i fixture NON devono mai scrivere sul Firestore reale: i task env hanno `FIREBASE_ADMIN_CREDENTIALS` e le gallerie di prova appaiono al fotografo in dashboard (successo ad ago 2026, review rifiutata per questo).

**Come applicare:** usare l'emulatore Firestore (pattern in `playwright.emulator.config.ts` + guardia `FIRESTORE_EMULATOR_HOST` nel fixture PRIMA di importare l'Admin SDK). Avvio: `firebase emulators:exec --only firestore --project wedding-gallery-397b6 "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx playwright test --config playwright.emulator.config.ts"` con Java nel PATH (nix store, adoptopenjdk 11). Il client Vite si collega all'emulatore solo con `VITE_FIRESTORE_EMULATOR_HOST` (opt-in, solo DEV).

**Trappola HMR:** una seconda istanza dev (porta ≠5000) non può fare il bind della porta HMR 24678 → il client Vite entra in loop di reload che azzera lo stato React durante i test. Fix: `VITE_HMR_PORT` dedicata (gestita in server/index.ts).

**Trappola shell:** `firebase emulators:start` in background muore al SIGHUP di fine sessione; usare `emulators:exec` nella stessa sessione. Attenzione a `pkill -f`: il pattern può matchare la shell corrente (usare classi tipo `[c]loud-firestore`).
