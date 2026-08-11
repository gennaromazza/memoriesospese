---
name: Gallery public access gate
description: gate di /view/:id, redirect corretto e test locale
---
Il gate di autenticazione client di /view/:id reindirizza chi non ha `localStorage gallery_auth_<id>` a `/gallery/:id` (pagina password GalleryAccess). Fino ad ago 2026 puntava a `/access/:id`, route inesistente → 404 globale per i visitatori anonimi (fixato).
**How to apply:** per testare /view/:id senza password impostare `localStorage gallery_auth_<id>`; per link pubblici usare /gallery/:code.
