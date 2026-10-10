---
name: Ambienti task isolati senza connettori Replit
description: I task env isolati non hanno accesso ai connettori (Google Drive ecc.) — testare quei flussi con mock, non end-to-end.
---

# Ambienti task isolati: niente connettori Replit

`listConnections('google-drive')` ritorna vuoto negli ambienti task isolati anche
se l'integrazione è installata nell'app principale: le route che usano Drive
falliscono con `GOOGLE_DRIVE_RECONNECTION_NEEDED`.

**Why:** le credenziali dei connettori vivono nell'app principale; l'ambiente
isolato non le riceve.

**How to apply:** per verificare flussi Drive/Gmail-connector in un task
isolato, testare la meccanica con vitest mockando `./google-drive.js` (pattern
in `server/photobook-lab-shipment.test.ts`: fake Firestore con patch dotted-path
+ upload con delay/fallimenti configurabili). Un eventuale script e2e reale va
lasciato per l'app principale (`scripts/test-photobook-transfer.ts`).

Nota correlata: il trasferimento pagine fotolibro → Drive gira in background
(risposta 202 immediata, stato in `labShipments.pageTransfer` con heartbeat);
qualsiasi operazione lunga dentro una route HTTP va spostata così, o i proxy
troncano la richiesta con fotolibri 50+ pagine.
