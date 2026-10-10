---
name: Gallery masonry render-window reset loop
description: Why the public gallery masonry froze ~60 photos while the lightbox showed all — unstable parent callback consumed inside a child effect.
---

# Masonry render-window stuck (~60 foto) ma lightbox completa

La vista pubblica `/view/:id` (vista fotografo, senza capitoli) usa una finestra di
rendering progressiva (`visiblePhotoLimit`, start 60, +40) per la masonry; la
lightbox invece usa l'elenco completo `displayPhotos`. Sintomo storico: la masonry
oscillava e si bloccava intorno a ~60 foto mentre la lightbox le mostrava tutte.

**Causa radice (pattern da ricordare):** un componente figlio (`GalleryFilter`)
chiamava la callback del padre dentro un `useEffect` con la callback tra le
dipendenze:
```
useEffect(() => { onFilterChange({...}); }, [..., onFilterChange]);
```
Nel padre (`Gallery`) la callback era ricreata ad ogni render (nuova identità), e
`onFilterChange` (`handleFilterChange`) chiamava `setVisiblePhotoLimit(60)`. Ogni
render del padre → nuova identità → l'effetto del figlio ri-scatta → reset della
finestra a 60. La finestra avanzava (observer/scroll) e veniva subito riportata a
60: thrash, con valori che salgono e poi DECRESCONO (es. 180→60). Nessun remount
(i log di init non si ripetono), nessun codice che decrementa esplicitamente.

**Fix:** stabilizzare `handleFilterChange` e `resetFilters` con `useCallback([])`.
Verificato: la finestra sale monotòna 60→100→…→855.

**Why:** una callback non-memoizzata passata a un figlio che la consuma DENTRO un
effetto (con la callback nelle deps) fa ri-eseguire quell'effetto ad ogni render del
padre. Se l'effetto scrive stato nel padre, si crea un loop di reset difficile da
diagnosticare (sembra un remount/decremento "impossibile").

**How to apply:** ogni callback passata a un figlio che la mette nelle dipendenze di
un `useEffect`/`useMemo` va memoizzata con `useCallback`. Per diagnosticare oscillazioni
di stato "impossibili", esporre lo stato sospetto su `window` dal render body e fare
polling via Playwright durante lo scroll (vedi `e2e/gallery-render-window.spec.ts`):
mostra subito se lo stato committato sale/scende e con quale passo.
