---
name: E2E e Firestore - mai la produzione
description: Isolamento dei test da Firestore e da tutti i provider reali disponibili nell'ambiente
---

I test e2e o i fixture NON devono mai scrivere sul Firestore reale: i task env hanno `FIREBASE_ADMIN_CREDENTIALS` e le gallerie di prova appaiono al fotografo in dashboard (successo ad ago 2026, review rifiutata per questo).

La stessa regola vale per Calendar, email, pagamenti e altri provider: isolare
soltanto il database o Gmail non isola l'intera catena di una conferma.

**Why:** l'ambiente dei test può disporre delle vere credenziali. Collegare un
nuovo servizio a un worker già testato può attivare un provider che la vecchia
prova non aveva necessità di simulare.

**How to apply:** bloccare per default la rete esterna nelle suite server,
consentire soltanto fixture locali e simulare esplicitamente ogni confine
provider. Verificare che ripristinare i mock non riabiliti la rete reale.

**Come applicare:** usare l'emulatore Firestore (pattern in `playwright.emulator.config.ts` + guardia `FIRESTORE_EMULATOR_HOST` nel fixture PRIMA di importare l'Admin SDK). Avvio: `firebase emulators:exec --only firestore --project wedding-gallery-397b6 "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx playwright test --config playwright.emulator.config.ts"` con Java nel PATH (nix store, adoptopenjdk 11). Il client Vite si collega all'emulatore solo con `VITE_FIRESTORE_EMULATOR_HOST` (opt-in, solo DEV).

**Trappola HMR:** una seconda istanza dev (porta ≠5000) non può fare il bind della porta HMR 24678 → il client Vite entra in loop di reload che azzera lo stato React durante i test. Fix: `VITE_HMR_PORT` dedicata (gestita in server/index.ts).

**Trappola shell:** `firebase emulators:start` in background muore al SIGHUP di fine sessione; usare `emulators:exec` nella stessa sessione. Attenzione a `pkill -f`: il pattern può matchare la shell corrente (usare classi tipo `[c]loud-firestore`).
