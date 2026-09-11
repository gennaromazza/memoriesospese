---
name: Real Wedding photo editorial metadata
description: Regole per selezionare le foto Real Wedding per capitolo e pubblicare alt text personalizzati senza rompere le storie storiche.
---

La selezione Real Wedding resta una lista ordinata di ID, mentre i testi alt sono una mappa opzionale indicizzata dallo stesso ID. La mappa viene sanificata limitandola alle foto selezionate e a 200 caratteri.

**Why:** l'editor deve permettere di assegnare le foto capitolo per capitolo senza cambiare l'ordine narrativo, e le storie già pubblicate non hanno alt personalizzati.

**How to apply:** mantenere la navigazione capitoli come filtro dell'editor, salvare alt e selezione nello stesso flusso automatico, e usare sempre un fallback pubblico sicuro (titolo del capitolo o della storia).