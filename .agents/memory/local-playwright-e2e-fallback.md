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
