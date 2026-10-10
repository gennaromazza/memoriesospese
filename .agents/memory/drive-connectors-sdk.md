---
name: Google Drive via connectors SDK
description: L'endpoint raw connectors v2 non restituisce più le credenziali; tutte le chiamate Drive passano dal proxy @replit/connectors-sdk.
---

La vecchia fetch diretta a `https://connectors.replit.com/api/v2/connection?include_secrets=true&connector_names=google-drive` risponde 200 con `items: []` anche a connessione sana: la piattaforma non serve più i token raw.

**Regola:** ogni chiamata Google Drive dal server passa da `new ReplitConnectors().proxy('google-drive', path, opts)` (pacchetto `@replit/connectors-sdk`). Nessun access token è più disponibile/necessario nel codice.

**Why:** dopo una riconnessione Drive (luglio 2026) il vecchio metodo continuava a fallire con "Google Drive non connesso" nonostante OAuth completato; solo il proxy SDK funziona.

**How to apply:**
- `server/google-drive.ts` è già migrato: helper `driveFetch`/`driveJson`, upload multipart per i backup, resumable via proxy per stream e per il browser.
- L'init resumable via proxy propaga sia l'header `Origin` (CORS per i PUT del browser) sia il `Location` di Google; la session URI restituita è già autorizzata (PUT senza header Authorization).
- `googleapis` non è più usato per Drive; non reintrodurre client basati su access token.
- Errori 401/403 dal proxy → messaggio `GOOGLE_DRIVE_RECONNECTION_NEEDED:` per il flusso di riconnessione esistente.
