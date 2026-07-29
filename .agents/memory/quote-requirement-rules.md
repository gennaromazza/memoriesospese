---
name: Requirement/exclusion rules per preventivi variabili
description: Convenzioni del motore Requisiti/Esclusioni (shared/quote-requirements.ts) e insidie di chiavi/nomi tra le pagine preventivo
---

Motore puro in `shared/quote-requirements.ts` (specchia quote-benefits): `computeBlockedProducts`, `sanitizeSelection` (fixpoint a cascata), `findInvalidSelections`, `migrateRequirementRules`. Regole per NOME prodotto.

**Insidie chiave:**
- QuickQuotePage tiene la selezione per chiave `productId || nome`; QuotePublicViewPage per `nome`. Ogni consumo delle regole deve mappare chiave↔nome.
- "Sempre inclusi" = `selectable === false` OPPURE `isOmaggio`: contano SEMPRE come selezionati per i trigger e NON sono mai rimovibili a cascata né motivo di 400 lato server — altrimenti loop nell'useEffect di sanificazione o errori senza rimedio per il cliente.
- Gli useEffect di sanificazione devono filtrare `removed` sui soli nomi realmente presenti nella selezione (guardia no-op) per garantire convergenza.
- La firma pubblica (`acceptQuote` in client/src/lib/quotes.ts) scrive direttamente su Firestore dal client: la validazione lì è client-side (defense-in-depth), non autoritativa; l'unica validazione server è in POST /quick/:token/activate.

**Why:** rilevato in code review: rischio loop infinito e selezioni manomettibili.
**How to apply:** ogni nuovo percorso che modifica la selezione prodotti di un preventivo variabile deve passare da sanitizeSelection con queste guardie e copiare `requirementRules` dal template nel documento quote.
