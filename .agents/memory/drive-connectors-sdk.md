---
name: Google Drive via connectors SDK
description: L'endpoint raw connectors v2 non restituisce più le credenziali; tutte le chiamate Drive passano dal proxy @replit/connectors-sdk.
---

La vecchia fetch diretta a `https://connectors.replit.com/api/v2/connection?include_secrets=true&connector_names=google-drive` risponde 200 con `items: []` anche a connessione sana: la piattaforma non serve più i token raw.

**Regola:** ogni chiamata Google Drive dal server passa dal proxy del pacchetto `@replit/connectors-sdk`, con `proxy` oppure `createProxyFetch` quando serve propagare AbortSignal. Nessun access token è necessario nel codice.

**Why:** dopo una riconnessione Drive (luglio 2026) il vecchio metodo continuava a fallire con "Google Drive non connesso" nonostante OAuth completato; solo il proxy SDK funziona.

**How to apply:**
- `server/google-drive.ts` è già migrato: helper `driveFetch`/`driveJson`, upload multipart per i backup, resumable via proxy per stream e per il browser.
- L'init resumable via proxy propaga sia l'header `Origin` (CORS per i PUT del browser) sia il `Location` di Google; la session URI restituita è già autorizzata (PUT senza header Authorization).
- `googleapis` non è più usato per Drive; non reintrodurre client basati su access token.
- `proxy()` serializza i body-oggetto, `createProxyFetch()` applica invece il contratto Fetch: passando da uno all’altro mantenere esplicitamente JSON.stringify e Content-Type per creazione cartelle e permessi.
- Il 401 indica autenticazione da rinnovare; un 403 non implica una riconnessione: leggere il motivo Google. `rateLimitExceeded` e `userRateLimitExceeded` sono temporanei; permessi insufficienti e quota spazio esaurita non si risolvono con retry indiscriminati.

**Why:** Google usa 403 sia per rate limit sia per permessi e quota. Trattarli tutti come credenziali scadute suggerisce una riconnessione inutile e nasconde la causa reale.

**How to apply:** Classificare i motivi strutturati prima di decidere retry o intervento; limitare tentativi e durata. Gli upload con risposta persa non vanno ripetuti con una nuova identità senza riconciliare il commit remoto.
