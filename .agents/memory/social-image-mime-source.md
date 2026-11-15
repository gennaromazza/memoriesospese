---
name: Social image MIME source
description: How Open Graph image MIME types are chosen when image URLs have unreliable extensions.
---

Per le immagini Open Graph, usare un MIME type noto dai dati del file o dell'upload; l'estensione dell'URL non prova il formato dei byte. Se il MIME attendibile manca, omettere il tag `og:image:type`.

**Why:** alcune cover legacy hanno un suffisso diverso dal formato servito; dichiarare `image/jpeg` solo perché l'URL termina in `.jpg` può confondere i crawler.

**How to apply:** mantenere allineati upload, anteprima condivisa e prerender server; coprire con test sia un URL `.jpg` con MIME PNG noto sia una cover legacy senza MIME.
