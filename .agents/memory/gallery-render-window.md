---
name: Gallery render window (masonry)
description: Perché la finestra di rendering progressiva della galleria pubblica può bloccarsi, e l'invariante che la tiene viva.
---

# Finestra di rendering galleria pubblica (client/src/pages/Gallery.tsx, /view/:id)

I metadati di TUTTE le foto si caricano in background (auto-fetch HYBRID su useInfiniteQuery),
ma nel DOM si montano solo le prime N card: `displayPhotosForGrid = displayPhotos.slice(0, visiblePhotoLimit)`.
`visiblePhotoLimit` cresce a step quando una sentinella in fondo entra nel viewport (IntersectionObserver).

## Invariante: l'IntersectionObserver della sentinella va RI-ARMATO
L'effetto che crea l'observer DEVE dipendere da `visiblePhotoLimit` (e dalla lunghezza dei metadati),
così viene ricreato ad ogni incremento.

**Why:** un IntersectionObserver a istanza singola scatta solo sulle TRANSIZIONI di intersezione.
Dopo il primo incremento (es. 60→100) non rivede una transizione affidabile e si blocca → sintomo
classico: la galleria mostra solo ~100 foto pur avendone centinaia. Ricreando l'observer ad ogni
incremento esso ri-valuta lo stato corrente e "riempie" fino a coprire viewport+margine, poi prosegue
durante lo scroll. Il loop è limitato perché le PhotoCard riservano altezza (aspectRatio 3/4) prima del load.

**How to apply:** se un futuro refactor "ottimizza" le deps dell'observer rimuovendo `visiblePhotoLimit`,
il bug del blocco a ~100 ritorna. Non rimuoverlo.

## L'IntersectionObserver da solo NON basta: serve un fallback scroll/resize
L'observer è solo un FAST-PATH. Su gallerie grandi (600-700 foto) la griglia poteva restare bloccata
pur avendo TUTTI i metadati in memoria (sintomo riportato: la lightbox mostra tutte le foto, la griglia
no, scrollando "si bugga e non carica"). Cause: lazy-load immagini che cambiano altezza reale dopo il
placeholder 3/4 (layout churn), scroll anchoring, e — col fetch completo dei metadati — la sentinella
si SMONTA quando `hasMoreToRender` diventa false (finestra esaurita sulle foto già caricate) e si
ri-monta solo quando la riconciliazione/auto-fetch aggiunge altre foto: in quella finestra temporale
l'observer perde la transizione.

**Why:** affidare l'avanzamento della finestra all'UNICO trigger "transizione di intersezione" è fragile.

**How to apply:** mantenere accanto all'observer un effetto fallback (deps
[renderWindowActive, visiblePhotoLimit, displayPhotos.length]) che su `scroll`(capture)+`resize`
(passive, rAF) avanza `visiblePhotoLimit` quando `galleryGridRef` bottom è entro ~1200px dal viewport,
e che chiama l'avanzamento SUBITO ad ogni run (copre il remount sentinella durante la riconciliazione,
quando i metadati crescono una seconda volta dopo che `hasNextPage` è già false). Clamp con
`Math.min(prev + step, displayPhotosRef.current.length)` e leggere la lunghezza da ref (no stale closure).
NON rimuovere la finestra: montare 600-700 PhotoCard insieme su mobile è troppo pesante.

## La finestra vale SOLO per la vista standard del fotografo
`hasMoreToRender` è gated da `activeTab === 'photographer' && !chaptersEnabled`. Capitoli (group.photos)
e tab Ospiti (guestPhotos) renderizzano liste complete e NON usano la finestra: senza il gate, l'observer
incrementerebbe a vuoto `visiblePhotoLimit` (stato non visualizzato) generando re-render inutili.

## Test e2e: il totale della lightbox cresce in background
Il denominatore del contatore lightbox ("N / TOTALE") = `displayPhotos.length`, che cresce mentre
l'auto-fetch HYBRID scarica le pagine restanti. Leggerlo UNA volta all'apertura iniziale dà un totale
PARZIALE (osservato: 232 mentre il totale reale era 582). Per un test deterministico (niente totale
hardcoded) far CONVERGERE masonry e totale: alternare scroll (avanza la finestra) e ri-lettura del
denominatore finché `count(.gallery-image) >= totale - tolleranza`. Vedi `e2e/gallery-render-window.spec.ts`.
