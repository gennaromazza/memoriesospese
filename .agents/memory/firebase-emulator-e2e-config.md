---
name: Firebase emulator config for browser E2E
description: Keep browser-test Auth and Firestore emulator ports isolated from the general project configuration.
---

# Configurazione Firebase per E2E browser

Le suite Playwright che puntano Auth e Firestore emulator su porte esplicite devono avere una configurazione dedicata alla suite. Non modificare la configurazione Firebase generale solo per adattarla ai test.

**Why:** le fixture e2e spesso fissano le porte localhost nel codice; riutilizzare la config generale può avviare Firestore su un'altra porta o non avviare Auth, facendo fallire i test prima delle asserzioni UI.

**How to apply:** quando aggiungi una suite emulator-backed, allinea una config dedicata alle porte richieste dai suoi helper e fai puntare a quella lo script di test.
