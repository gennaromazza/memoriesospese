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

**Script standalone & credenziali:** gli script tsx devono importare `db`/`FieldValue` da `server/firebase-admin.ts` (usa env `FIREBASE_ADMIN_CREDENTIALS`). NON usare `admin.credential.applicationDefault()`: `GOOGLE_APPLICATION_CREDENTIALS` non è settato e fallisce. L'app usa UN'UNICA istanza Firestore (progetto `wedding-gallery-397b6`) condivisa tra dev e produzione: un backfill one-shot copre già entrambi gli ambienti.

## Incassi: financials.totalePagato/saldoResiduo NON affidabili
Sul job ci sono anche `financials.totalePreventivato` (affidabile), `financials.totalePagato` e `financials.saldoResiduo`: questi ultimi due NON sono mantenuti freschi (osservato: `totalePagato` denormalizzato ≈ metà del reale; `saldoResiduo` calcolato su `totaleOrdini`, spesso 0 → "da incassare" azzerato/sottostimato).

**Regola:** per qualsiasi aggregato di incassi (Incassato / Da Incassare) la fonte di verità è `paymentSchedules.payments[].importoPagato` sommato per `jobId` (come fa `useJobFinancials`); NON sommare i campi `financials.totalePagato/saldoResiduo`. `Da incassare = max(0, totalePreventivato - incassato)` (clamp overpayment). Job CON schedule → usa sempre la somma schedule (anche 0); job SENZA schedule → fallback al denormalizzato. `financials.totalePreventivato` resta valido per il "Preventivato".

**Dove:** `GET /api/jobs/list-aggregates` ritorna anche `financialsByJob` (incassi reali) usato dalla barra metriche della Lista Lavori.

**Why:** i write-path dei pagamenti non aggiornano in modo affidabile i campi monetari denormalizzati; lo schedule è l'unica fonte reale.
