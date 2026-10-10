---
name: Firestore vieta gli array annidati
description: Come salvare array-di-array (es. tratti di disegno) in Firestore senza errore INVALID_ARGUMENT
---

Regola: Firestore rifiuta qualsiasi array direttamente dentro un altro array — il write fallisce con `3 INVALID_ARGUMENT: Nested arrays are not allowed` (→ 500 lato API).

**Why:** l'invio delle richieste fotolibro salvava i tratti della X come `PhotobookMarkPoint[][]` e ogni submit falliva in produzione nonostante tsc/build puliti: l'errore emerge solo a runtime al commit del batch.

**How to apply:** quando un campo è concettualmente array-di-array, avvolgere il livello interno in una mappa (es. `strokes.map(points => ({ points }))`) prima del write e riconvertire in lettura nel serializer API, mantenendo la forma array-di-array verso il client. Array > mappa > array > mappa è consentito.
