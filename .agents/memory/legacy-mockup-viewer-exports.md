---
name: Legacy mockup viewer exports
description: Vincoli dei renderer girevoli legacy incorporati nel configuratore cliente.
---

I renderer girevoli legacy non condividono sempre il DOM del wizard: possono non avere `.panel-content` e contenere il download in un pannello inizialmente nascosto. In sola lettura il download va esposto fuori dal wizard; durante l’export il `ResizeObserver` non deve ridimensionare il canvas, altrimenti le immagini risultano nelle dimensioni del viewport invece del profilo export.

**Why:** l’e2e browser deve verificare lo stesso percorso locked e le stesse dimensioni per custodia e tutte le varianti girevoli; affidarsi solo ai marker del wizard lascia scoperti i viewer legacy.

**How to apply:** quando si aggiunge o si sostituisce un renderer girevole, verificare il DOM di caricamento, il fallback del download locked e che il resize sia sospeso mentre l’export è in corso.