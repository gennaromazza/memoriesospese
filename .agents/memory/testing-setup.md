---
name: Test framework (vitest) setup
description: How to run unit tests and the pattern for testing Firestore-dependent server logic.
---

# Vitest in questo progetto

Il progetto usa **vitest** (devDependency) ma NON ha uno script npm dedicato
(package.json scripts è vietato modificarlo). Si lancia con:

- `npx vitest run` (tutta la suite) oppure `npx vitest run <file>`.

`vitest.config.ts` è **standalone di proposito**: quando esiste, vitest lo usa al
posto di `vite.config.ts`, evitando di caricare i plugin React/Replit (cartographer,
runtime-error-modal) che richiedono l'ambiente del dev server. Pattern dei file: `**/*.test.ts`
sotto `server/` e `shared/`. `tsconfig.json` esclude già `**/*.test.ts` dal type-check/build.

## Testare logica server che dipende da Firestore

`runVisioneAutoInviteCheck` (e simili) importano `db/Timestamp/FieldValue` da
`./firebase-admin.js`, che **inizializza Firebase Admin all'import** (serve un service
account) → in test va sempre mockato. Pattern usato in `server/reminder-routes.test.ts`:

- `vi.hoisted()` per un holder mutabile (`h.db`, `h.sendGmailEmail`, `h.Timestamp`,
  `h.FieldValue`) — i factory di `vi.mock` sono hoisted, quindi NON possono riferirsi a
  `const` top-level definiti dopo (causa "Cannot access ... before initialization").
- `vi.mock("./firebase-admin.js")` con un `db` Proxy che inoltra ogni accesso a `h.db`
  (fake Firestore in-memory riassegnabile per test).
- `vi.mock("./email-routes.js")` per `sendGmailEmail` (evita SMTP/Gmail reali) e i suoi
  altri export importati a top-level da reminder-routes.
- `vi.mock` anche per gli import lazy che tirano dentro Google Calendar
  (`./consultations/calendar-adapter.js`, `./calendar-engine/index.js`).
- Per testare la race query→lock: il fake fornisce uno `staleQuery` (snapshot della
  query) diverso dallo stato "live" letto dentro la transazione.
