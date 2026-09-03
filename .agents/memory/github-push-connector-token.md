---
name: Push GitHub via connector token
description: Come fare git push dal workspace quando il git shell non ha credenziali
---
Il git shell del workspace NON ha credenziali GitHub (push → "Invalid username or token"); la connessione GitHub del pannello Git di Replit non è usabile dall'agente, e non esiste una callback `gitPush`.

**Regola corrente:** non assumere che `listConnections('github')` esponga un token. Alcuni runtime restituiscono solo `getClient`/`proxyFetch`; anche `client.auth()` può non restituire il token. In quel caso il push Git autenticato non è possibile dall'agente.

**Why:** il proxy connectors copre le API REST ma non il protocollo Git. La ricostruzione tramite Git Data API può inoltre essere bloccata dal WAF del proxy con un 403 HTML per alcuni blob testuali, anche se la connessione è sana.
**How to apply:** per push/pull autenticati, usare GIT_ASKPASS solo se il token è effettivamente disponibile nel sandbox. Se non lo è, evitare pubblicazioni API parziali e chiedere un push dal pannello Git/terminale autenticato.

Nota storica (ago 2026): dopo la pulizia della cronologia (.env con chiavi), `main` su GitHub è stato sovrascritto con force push; rami residui da cancellare lato utente: `main-clean`, `snyk-fix-*`. Tag locale `backup-pre-purge` + remote `gitsafe-backup` come backup.
