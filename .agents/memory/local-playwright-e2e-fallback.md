---
name: Local Playwright fallback when the e2e tester is down
description: How to run browser e2e checks locally when the testing subagent fails with infra errors.
---

# Fallback e2e locale con Playwright

Quando il testing subagent fallisce ripetutamente con "Replit infrastructure issue", si può testare in browser localmente:

- `playwright` (npm) è già nelle dipendenze del progetto; `npx playwright install chromium` NON funziona (download fallisce silenziosamente, nessuna cache in ~/.cache/ms-playwright).
- Soluzione: installare `chromium` come dipendenza di sistema Nix e lanciarlo con `chromium.launch({ executablePath: which chromium, args: ['--no-sandbox'] })`.
- Lo script va eseguito DENTRO la root del progetto (per risolvere il package `playwright`), es. copia temporanea `gallery-e2e.tmp.mjs`, poi rimuoverla.
- Ricordarsi di rimuovere la dipendenza chromium da replit.nix a fine test se era solo per il collaudo (pesa su build/deploy).

**Why:** il tester e2e è rimasto indisponibile per più sessioni; questo fallback ha permesso di completare verifiche browser (localStorage, scroll, lightbox, console) senza il harness.

**Nota galleria di test:** la galleria `OvZM1Zt0` ha solo 5 foto in 2 capitoli (capitoli abilitati ⇒ render window inattiva by design). Non può esercitare la crescita della finestra masonry (~60+): per quello serve una galleria grande senza capitoli.

## Test mobile con il browser disponibile

**Regola:** per le spec mobile, il preset iPhone può essere usato per viewport, touch e user agent, ma va sovrascritto `browserName: "chromium"` quando WebKit non è installato; inoltre il consenso cookie va preimpostato prima del caricamento se il banner copre i controlli.

**Why:** nell’ambiente task il preset iPhone seleziona WebKit, mentre il browser eseguibile disponibile è Chromium; il banner cookie può rendere i test di interazione falsamente non cliccabili.

**How to apply:** usa `test.use({ ...devices["iPhone 13"], browserName: "chromium" })` e inizializza il consenso cookie con `page.addInitScript` nelle spec che esercitano pagine pubbliche. Se la stessa spec deve coprire più browser, rimuovi `defaultBrowserType` dal descriptor nel test e definisci il browser nei progetti Playwright.

## WebKit iOS nel runner locale

Il browser WebKit di Playwright richiede librerie native con soname specifici della build Ubuntu (tra cui `libharfbuzz-icu`, `libgles2` e il plugin GStreamer). I pacchetti Nix disponibili possono coprire solo parte delle dipendenze, quindi il progetto WebKit va eseguito in CI o in un runner con dipendenze Playwright complete; non aggiungere librerie test-only all’applicazione solo per forzare il collaudo locale.

**Why:** nell’ambiente Replit il browser WebKit è scaricabile ma il controllo preliminare di Playwright blocca l’avvio quando mancano quei soname, anche dopo l’installazione dei pacchetti Nix equivalenti.

**How to apply:** mantieni il progetto Playwright WebKit esplicito e limita il suo `testMatch` alle spec compatibili; verifica localmente la selezione con `npx playwright test --list --project=webkit-ios` e usa un runner WebKit completo per l’esecuzione.
