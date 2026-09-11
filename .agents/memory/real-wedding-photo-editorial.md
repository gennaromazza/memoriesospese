---
name: Real Wedding photo editorial metadata
description: Regole per selezionare le foto Real Wedding per capitolo e pubblicare alt text personalizzati senza rompere le storie storiche.
---

La selezione Real Wedding resta una lista ordinata di ID, mentre i testi alt sono una mappa opzionale indicizzata dallo stesso ID. La mappa viene sanificata limitandola alle foto selezionate e a 200 caratteri. Un draft temporaneo è valido solo se accompagnato dal relativo timestamp di aggiornamento. La copertina usa punti focali distinti per hero e card, ciascuno desktop/mobile, con fallback ai punti hero e poi al centro per i record storici.

**Why:** l'editor deve permettere di assegnare le foto capitolo per capitolo senza cambiare l'ordine narrativo, e un draft vecchio o vuoto non deve nascondere le foto già associate alla storia pubblicata. I rapporti hero/card cambiano tra desktop e smartphone e anche tra pagina completa e card.

**How to apply:** mantenere la navigazione capitoli come filtro dell'editor, salvare alt e selezione nello stesso flusso automatico, e usare sempre un fallback pubblico sicuro (titolo del capitolo o della storia).