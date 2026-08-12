---
name: Push GitHub via connector token
description: Come fare git push dal workspace quando il git shell non ha credenziali
---
Il git shell del workspace NON ha credenziali GitHub (push → "Invalid username or token"); la connessione GitHub del pannello Git di Replit non è usabile dall'agente, e non esiste una callback `gitPush`.

**Come fare push:** proporre/usare il connector GitHub (`listConnections('github')` in "use impure"), leggere `conn.settings.access_token` SOLO dentro il sandbox (mai stamparlo), e lanciare `git push` con GIT_ASKPASS script che risponde `x-access-token` / token. Funziona anche `--force`.

**Why:** il proxy connectors non copre il protocollo git; serve il token nell'askpass ma deve restare nel sandbox.
**How to apply:** ogni volta che serve un push/pull autenticato verso GitHub dall'agente.

Nota storica (ago 2026): dopo la pulizia della cronologia (.env con chiavi), `main` su GitHub è stato sovrascritto con force push; rami residui da cancellare lato utente: `main-clean`, `snyk-fix-*`. Tag locale `backup-pre-purge` + remote `gitsafe-backup` come backup.
