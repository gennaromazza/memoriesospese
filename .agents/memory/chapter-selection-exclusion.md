---
name: Esclusione capitoli dalla selezione
description: Come funziona il flag excludeFromSelection sui capitoli galleria e dove va applicato lato cliente
---

Il flag vive sul capitolo (`Chapter.excludeFromSelection`), impostato in ChaptersManager (crea/modifica capitolo), NON sulla galleria. Le foto restano visibili al cliente ma non selezionabili, in modalità normale, inversa e multi-prodotto.

**Perché:** il fotografo vuole flaggare una volta il capitolo e avere l'esclusione valida anche per selezioni attivate mesi dopo; un campo sulla galleria (tentato prima) non era visibile in EditGalleryModal perché lì la prop gallery non sempre porta i capitoli.

**Come applicare:** in Gallery.tsx (client) l'enforcement è in PIÙ punti che vanno tenuti allineati: `excludedChapterIds`/`isPhotoExcludedFromSelection`/`selectablePhotos`, guardia in handleTogglePhotoSelection E handleToggleProductAssignment (la card non è un boundary: il lightbox chiama i toggle direttamente), filtro al salvataggio (finalSelectedPhotoIds + photoAssignments), effect di sanificazione degli stati caricati (selezioni salvate prima dell'esclusione), contatori con selectablePhotos, badge rossi su card/header capitolo e badge nel lightbox via `selectionInfo.excludedPhotoIds`. Se si aggiunge un nuovo percorso di selezione, aggiungere anche lì la guardia.

**Test e2e:** `e2e/gallery-excluded-chapters.spec.ts` copre le 3 modalità (fixture `e2e/fixtures/selection-gallery.ts`, SOLO emulatore Firestore — vedi e2e-fixtures-prod-firestore.md). Trappole UI per i test: i capitoli partono TUTTI collassati (cliccare la card per espandere); a selezione completa il riepilogo si apre DA SOLO e va confermato da lì — un Escape chiude modale Radix E lightbox insieme (click successivi si bloccano); chiudere il banner cookie ("Solo Necessari") subito dopo il goto.
