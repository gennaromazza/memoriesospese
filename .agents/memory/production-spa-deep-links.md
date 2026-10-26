---
name: Deep link SPA in produzione
description: Perché una pagina funzionante in Preview può rispondere 404 quando viene condivisa in produzione.
---

Per ogni nuova pagina SPA condivisibile verificare l'apertura diretta attraverso il server di produzione, includendo la classificazione riservata per i link a token.

**Why:** Vite restituisce la SPA anche per percorsi non riconosciuti, mentre il server di produzione consente solo le route note. La navigazione interna e la Preview possono quindi nascondere un 404 reale sui link inviati ai clienti, anche quando tutte le API funzionano.

**How to apply:** Affiancare ai test React un test HTTP del server di produzione: documento HTML 200, header noindex/no-store per pagine riservate e 404 conservato per percorsi non validi. Non allargare indiscriminatamente il fallback SPA.
