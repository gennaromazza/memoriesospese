---
name: Job denormalized aggregates (quoteStatus / transactionCount)
description: I documenti 'jobs' portano aggregati denormalizzati che ogni write-path su quotes/orders deve mantenere freschi.
---

# Aggregati denormalizzati sul job

Ogni documento `jobs` porta due campi riassuntivi letti dalla pagina "Lista Lavori":
- `quoteStatus: { hasQuote, isSigned, isEmailSent }` — OR logico sui preventivi collegati
- `transactionCount: number` — somma transazioni sugli ordini collegati (fallback legacy: `acconto>0` = 1)

`GET /api/jobs/list-aggregates` legge SOLO questi campi (`.select(...)`), non scansiona più le collezioni `orders`/`quotes`. La logica di calcolo è centralizzata in `server/job-aggregates.ts`.

**Regola:** qualunque NUOVO write-path che crea/firma/invia/elimina un preventivo, o aggiunge/rimuove una transazione / collega-scollega-elimina un ordine, DEVE ricalcolare l'aggregato del job interessato, altrimenti i badge e il filtro "stato preventivo" della Lista Lavori restano stale.
- Lato server: chiama `recomputeJobQuoteStatus(jobId)` / `recomputeJobTransactionCount(jobId)` (best-effort, single-job).
- Lato client (Web SDK scrive direttamente su Firestore): chiama `recomputeJobAggregates(jobId)` da `client/src/lib/jobs.ts`, che fa `POST /api/jobs/:id/recompute-aggregates`.

**Why:** la collezione `orders`/`quotes` cresce più dei jobs; la scansione completa ad ogni load costava Firestore reads/latenza.

**Note:** ordini walk-in non hanno `jobId` (nessun ricalcolo necessario). Pagamenti client passano sempre dall'endpoint server `register-payment` (già ricalcola). Esiste `scripts/backfill-job-aggregates.ts` (`npx tsx`) per popolare i job esistenti una-tantum.
