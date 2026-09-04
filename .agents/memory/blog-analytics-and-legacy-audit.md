---
name: Blog analytics and legacy audit
description: Regole per attribuzione conversioni Blog e audit dei contenuti HTML legacy.
---

Le pageview di Replit Analytics sono automatiche; il codice deve inviare solo eventi personalizzati tramite il wrapper best-effort. Le conversioni Blog vanno attribuite solo quando esiste una visita Blog nella sessione e usando slug, mai dati personali.

**Why:** un evento page_view manuale duplicava il conteggio nativo; inoltre i contenuti Blog non sono tutti nel campo Firestore `content`, perché quattro articoli usano HTML in `contentUrl`.

**How to apply:** quando si aggiungono eventi, usare il wrapper Analytics condiviso senza reinviare pageview. Quando si analizzano alt, link o contenuti Blog, leggere `content` e recuperare anche gli HTML autorizzati indicati da `contentUrl`.