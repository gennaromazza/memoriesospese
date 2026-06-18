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

## La finestra vale SOLO per la vista standard del fotografo
`hasMoreToRender` è gated da `activeTab === 'photographer' && !chaptersEnabled`. Capitoli (group.photos)
e tab Ospiti (guestPhotos) renderizzano liste complete e NON usano la finestra: senza il gate, l'observer
incrementerebbe a vuoto `visiblePhotoLimit` (stato non visualizzato) generando re-render inutili.
