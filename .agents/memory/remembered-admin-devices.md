---
name: Dispositivi admin ricordati
description: Scelta di prodotto per ridurre le verifiche passkey ripetute senza rimuovere MFA.
---

La soluzione concordata è una scelta esplicita “Ricorda questo dispositivo per 30 giorni” per browser personali, con elenco e revoca dei dispositivi. Dispositivi nuovi e operazioni di sicurezza richiedono ancora la passkey.

La fiducia del browser è un riferimento a un record server-side revocabile, non una credenziale autonoma: il claim Firebase porta solo l'ID del dispositivo; l'API e le regole Firestore verificano stato e scadenza del record. L'accesso ricordato non deve diventare sufficiente per modifiche di sicurezza.

**Why:** Il titolare ha approvato questa alternativa alle richieste ripetute a ogni accesso; non ha chiesto di disattivare la protezione.

**How to apply:** Separare fiducia del dispositivo, login e verifica fresca per operazioni sensibili. La revoca deve bloccare anche richieste Firestore dirette, non solo endpoint API. Non considerare la sola registrazione QR come fiducia e non estendere automaticamente l'autorizzazione alla Preview.
