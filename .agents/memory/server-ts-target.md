---
name: Server TS target < ES2020
description: BigInt literals non compilano nel typecheck del server; usare BigInt(n)
---
Regola: nel codice server non usare BigInt literal (`0n`, `1n`, `<< 1n`); definire costanti `const BIG_0 = BigInt(0)` ecc.
**Why:** il tsconfig ha target inferiore a ES2020 → `npx tsc --noEmit` fallisce con TS2737, anche se `tsx` (esbuild) esegue il file senza problemi. Scoperto implementando il matching perceptual-hash del fotolibro.
**How to apply:** ogni volta che serve aritmetica a 64 bit / hash con bigint lato server, usare `BigInt(...)` al posto dei literal, oppure valutare l'aggiornamento del target nel tsconfig (non fatto per non toccare configurazioni condivise).
