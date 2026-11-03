---
name: Test framework (vitest) setup
description: How to run unit tests and the pattern for testing Firestore-dependent server logic.
---

# Vitest in questo progetto

Usare configurazioni Vitest separate da quelle del dev server.

**Why:** caricare i plugin React/Replit del server nei test unitari può richiedere
un ambiente di sviluppo completo e avviare integrazioni non necessarie.

**How to apply:** cercare la configurazione nell'artifact interessato; non assumere
che la struttura legacy `server/` alla radice o le vecchie istruzioni npm siano
ancora valide nel monorepo.

## Import browser dentro Vitest

Le funzioni passate a Playwright da un test Vitest non devono contenere
direttamente import dinamici destinati al browser.

**Why:** Vitest li riscrive usando il proprio helper SSR, che non esiste nella
pagina del browser; il test fallisce prima di raggiungere il codice applicativo.

**How to apply:** caricare un modulo browser dedicato oppure mantenere l'import
fuori dalla trasformazione SSR (ad esempio un import nativo creato nel contesto
browser). Non sostituire il client applicativo con risposte API simulate per
aggirare il problema.

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

## Contratti fra server Node e hook del frontend

**Regola:** nei test Node che eseguono un hook di un altro artifact, importare il
modulo DOM a runtime tramite un percorso assoluto e mockare React risolto dal
frontend, non un generico import React del server.

**Why:** l'import statico trascina i tipi DOM nel typecheck Node; con pnpm, il mock
del React risolto dal server può non intercettare quello usato dal frontend e
causare un falso «Invalid hook call». Gli import dinamici relativi a variabile
possono inoltre essere risolti rispetto alla radice di Vitest anziché al test.

**How to apply:** usare `fileURLToPath(new URL(..., import.meta.url))` per
l'import dinamico nei test di contratto e risolvere esplicitamente il modulo
React del frontend quando si sostituisce `useEffect`.

## Contesti browser Playwright separati

**Regola:** ogni nuovo `BrowserContext` parte con storage e consenso cookie indipendenti. Sulle pagine pubbliche, chiudere il banner dei cookie prima di interagire con elementi sottostanti.

**Why:** il banner può coprire un pulsante visibile e attivo; Playwright ritenta il click fino al timeout invece di attivare il controllo.

**How to apply:** nei test che separano la sessione cliente da quella admin, gestire il consenso in ciascun contesto, non solo nella pagina admin già autenticata.

## Mock Firebase nei test browser isolati

**Regola:** un harness Vite che monta componenti con moduli Firebase sostituiti deve coprire tutte le forme d'import usate dal grafo importato, incluse quelle relative (per esempio `./firebase`), oltre agli alias `@/...`.

**Why:** gli alias Vite non intercettano un import relativo solo perché punta allo stesso file; un modulo Firebase reale può quindi inizializzarsi anche quando il componente principale è mockato.

**How to apply:** prima di eseguire un browser test isolato, cerca le varianti degli import Firebase nelle dipendenze del componente e reindirizzale tutte allo stesso fake in-memory.

## Verificare l’idratazione dei dati persistiti

**Regola:** una verifica browser della riapertura deve partire da una pagina nuova senza reinserire la fixture nella cache delle query.

**Why:** una fixture iniziale o il precedente stato del form possono far sembrare corretto il caricamento senza dimostrare che il documento persistito venga davvero letto; rimuovere soltanto una query con osservatori ancora montati non equivale a una nuova sessione dell’editor.

**How to apply:** mantieni le dipendenze ausiliarie isolate, ma al secondo caricamento lascia che il componente legga il documento dall’emulatore. Verifica valori modificati che differiscono dalla fixture originale.

## Cache condivisa nei test SEO

**Regola:** i test che esercitano più pagine SEO nello stesso processo devono impostare i dati del catalogo prima del primo render, oppure isolare esplicitamente la cache del modulo.

**Why:** la cache del catalogo shop sopravvive tra le richieste e non viene azzerata quando cambia il mock Firestore; un render precedente della vetrina vuota può far risultare inesistente una categoria fixture in un test successivo.

**How to apply:** eseguire il caso categoria prima dei render che caricano la vetrina senza fixture, o isolare il modulo/cache; cambiare solo il mock non garantisce una nuova lettura.
