---
name: Nomi originali delle pagine del fotolibro
description: Conservare e mostrare il nome del file caricato anche dopo riordino, preview e riapertura.
---

Per le pagine dei fotolibri, il nome originale del file caricato è un’etichetta utile e deve restare visibile nell’editor e nell’anteprima cliente. Il numero di pagina resta separato e continua a determinare l’ordine.

**Why:** L’admin vuole riconoscere le pagine usando i nomi dati ai file in fase di preparazione dell’album; sostituirli visivamente con “Pagina N” fa sembrare che il nome sia stato perso.

**How to apply:** Conserva il `fileName` salvato durante l’upload e usalo nelle etichette e nel testo alternativo. Mantieni numerazione, ordinamento e riferimenti alle richieste di modifica basati sul `pageNumber`; per i dati legacy senza nome usa il numero pagina come fallback.
