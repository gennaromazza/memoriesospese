---
name: Gallery public photo completeness & lightbox staleness
description: Perché la galleria pubblica perdeva foto (orderBy Firestore), come riconciliare in sicurezza, e il bug di stale-closure con il comparator memoizzato di PhotoCard.
---

# Galleria pubblica: completezza foto, dislike e lightbox

## Firestore `orderBy(campo)` SCARTA i documenti privi di quel campo
La galleria pubblica (`/view/:id`) pagina con `orderBy('createdAt')` + cursore. Firestore **esclude silenziosamente** i doc senza `createdAt` (foto legacy/importate da script esterni), quindi quelle foto non arrivano MAI al client: "453 foto ma ne vedo ~100".
**Why:** è semantica Firestore, non un bug del codice — una query ordinata per un campo opzionale non vede le righe che ne sono prive. Vale per QUALSIASI lista paginata ordinata su un campo non garantito.
**How to apply:** confronta l'aggregato noto (qui `gallery.photoCount`) col conteggio paginato; se mancano, riconcilia con una query **non ordinata** `where('galleryId','==',id)` SENZA orderBy/limit (non scarta nulla) e fai il merge dedup per id+nome preservando l'ordine. Gate la riconciliazione su `photoCount > pagedCount && accesso valido && paginazione finita` per non raddoppiare le letture sulle gallerie sane. Fix definitivo (follow-up): backfill idempotente del campo data sulle foto importate.

## La riconciliazione deve FALLIRE rumorosamente, mai restituire `[]`
Il metodo di fetch completo deve `throw` sull'errore, non `catch → return []`.
**Why:** se inghiotte l'errore, `reconciledPhotos` diventa `[]` (== "0 extra, sono completo") e un'azione distruttiva può salvare uno stato PARZIALE. In modalità "Non mi piace" la conferma salva "tutte le foto NON escluse": con foto non ancora caricate escluderebbe per sbaglio foto mai viste.
**How to apply:** tieni un flag `arePhotosFullyLoaded` (= `!isLoading && !hasNextPage && (!needsReconciliation || reconciledPhotos!==undefined && !isFetching)`); con `throw`, su errore `reconciledPhotos` resta `undefined` → il flag resta false → la conferma resta bloccata. Nel guard del salvataggio ritenta la riconciliazione (`refetch`) altrimenti l'utente resta bloccato per sempre.

## Stale-closure col comparator memoizzato di PhotoCard
`PhotoCard` è `React.memo` con comparator custom che **ignora di proposito `onClick`** (perf). Quindi `onClick={() => openLightbox(i, sourceArray)}` cattura un `sourceArray` VECCHIO: dopo che l'elenco cresce (riconciliazione), una card non re-renderizzata apre un lightbox con l'array stantio → foto nuove irraggiungibili. Vale sia per la vista standard sia per i capitoli (`group.allPhotos`).
**Why:** se il comparator ignora una prop, quella prop non si aggiorna finché un'ALTRA prop (es. `index`) non cambia e forza il re-render.
**How to apply:** non chiudere mai sull'array. Usa un handler stabile (`useCallback`) che rilegge l'elenco corrente da una `ref` aggiornata via `useEffect`, identificando la sorgente con un valore STABILE (indice per la vista standard; id del capitolo per i capitoli). La closure può catturare solo valori stabili.

## Il progetto NON compila pulito con `tsc` — build via Vite/esbuild
`tsc --noEmit` produce decine di errori PREESISTENTI (es. `useInfiniteQuery` usa l'API v5 `initialPageParam` che i types installati di `@tanstack/react-query` rifiutano → `infiniteData` degrada a `unknown`; `fetchpriority` lowercase; mismatch Timestamp/Date in Home/Campaigns). Il dev/build gira via Vite (esbuild) che NON type-checka.
**How to apply:** non aspettarti `tsc` pulito; verifica solo che le TUE modifiche non aggiungano NUOVI errori (grep dei tuoi file nell'output tsc). Dove `infiniteData` è `unknown`, accedi alle pagine via un cast locale solo-tipi (`as unknown as { pages?: Array<{photos: Photo[]}> }`).
