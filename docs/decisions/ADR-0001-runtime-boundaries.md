# ADR-0001 — Mantenere distinti Express, Firebase Hosting e Firebase Functions

- **Stato:** accettato dal codice esistente
- **Data:** 2026-09-02

## Contesto

Il repository contiene un server Express che serve API e SPA, una configurazione Firebase Hosting separata e due codebase Firebase Functions. Il deploy Replit usa `dist/index.js`, mentre Firebase Hosting usa `dist/app`.

## Decisione

Documentare e mantenere distinti i tre runtime:

1. Express/Replit è il backend applicativo principale e ospita i router di dominio.
2. Firebase Hosting è una pipeline/configurazione separata con rewrite SPA.
3. Firebase Functions ospita funzioni email/metadata legacy e il heartbeat retention.

Le integrazioni tra runtime devono essere esplicite, come il POST OIDC della retention verso Express.

## Conseguenze

- una modifica a route Express non implica automaticamente una modifica a Hosting o Functions;
- i log e i deploy vanno diagnosticati nel runtime corretto;
- non bisogna assumere che `npm start` avvii le Functions;
- le URL e le cache devono essere verificate per ogni percorso di pubblicazione.

## Alternative scartate

Trattare Firebase Hosting, Express e Functions come un unico server avrebbe nascosto differenze di runtime, autenticazione, build e deploy già presenti nel repository.