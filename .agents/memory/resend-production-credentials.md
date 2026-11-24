---
name: Resend in produzione
description: Credenziali Resend per codice server eseguito nel runtime pubblicato.
---

Il proxy `@replit/connectors-sdk` può fallire nel runtime pubblicato quando non è disponibile l’identità di deployment (`Could not mint an audience-scoped deployment identity`). L’integrazione API connessa non equivale a un secret disponibile al server pubblicato.

**Why:** La documentazione Replit indica i connettori e identity token per lo sviluppo e i secrets dell’app per le chiamate API delle applicazioni pubblicate.

**How to apply:** In produzione leggere `RESEND_API_KEY` da Replit Secrets e chiamare l’API Resend direttamente; in sviluppo senza il secret mantenere il proxy connettori. Non stampare, esporre o tentare di estrarre la chiave del connettore.
