---
name: Contratto social metadata
description: Regole durevoli per canonical, Open Graph, Twitter Card e immagini rappresentative.
---

Il primo HTML del prerender e i metadata dopo l’idratazione devono applicare lo stesso contratto. Per Blog e Real Wedding la precedenza è cover editoriale esplicita, prima immagine pubblica valida del contenuto/selezione, poi fallback globale.

**Why:** Definizioni indipendenti tra server e browser producevano preview diverse; inoltre i gestori ad hoc lasciavano tag della pagina precedente e ignoravano immagini valide nei contenuti esterni.

**How to apply:** Centralizzare URL canonici, validazione HTTPS/stabilità, asset curati e metadata delle landing. Le route private/noindex non devono ricevere immagini social pubbliche. Ogni pagina deve avere un solo set OG/Twitter/canonical.