---
name: Real Wedding cover contract
description: Shared cover and fallback behavior between the public homepage preview and Real Wedding article.
---

La copertina pubblica va risolta lato server in modo coerente nei due endpoint: la Home usa `coverImage` della preview, mentre la hero dell’articolo usa `photos[0]`. Se la cover selezionata non è più disponibile, entrambi devono restituire la stessa prima foto valida selezionata; il client non deve inventare un ordine o una cover alternativa.

**Why:** preview e dettaglio sono richieste separate; differenze di risoluzione o cache possono far vedere due copertine diverse anche se l’editor ha salvato una sola selezione.

**How to apply:** quando cambia il contratto delle foto Real Wedding, controllare insieme preview, dettaglio, fallback e cache pubblica; verificare anche un ricaricamento browser delle due viste.
