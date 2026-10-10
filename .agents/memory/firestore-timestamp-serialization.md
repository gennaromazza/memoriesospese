---
name: Firestore Timestamp serialization (API vs Web SDK)
description: Dati job/order presi via /api hanno i Timestamp Admin-SDK serializzati come {_seconds}, mentre le letture client Web SDK danno Timestamp reali; i parser date devono gestire entrambi.
---

- Dati presi via API Express (es. `getAllJobs` → `/api/jobs`, `getAllOrders`) sono JSON puro: un `Timestamp` di firebase-admin si serializza come `{ _seconds, _nanoseconds }`.
- Dati letti direttamente col Firebase Web SDK lato client danno istanze `Timestamp` reali (`.toDate()`); alcuni path serializzati danno invece `{ seconds, nanoseconds }`.

**Regola:** qualunque helper di parsing data che può ricevere date di job/costi/ordini deve accettare TUTTI: istanza `Timestamp`, `{seconds}`, `{_seconds}`, `Date`, stringa ISO. Convertire i timestamp serializzati con `(v.seconds ?? v._seconds) * 1000`.

**Why:** la dashboard finanziaria escludeva tutti i `job.costi` quando era attivo un filtro mese/anno, perché i suoi helper controllavano solo `seconds` e non `_seconds` → totali annuali sbagliati. `CostiLavoroTable` gestiva già entrambi: usalo come riferimento.

**How to apply:** prima di filtrare/sommare per data dati provenienti da `/api`, verifica che il parser gestisca `_seconds`; non assumere mai che le date arrivino come Web SDK `Timestamp`.
