---
name: Gallery thumbnails generation
description: Come/perché le miniature delle gallerie si generano lato server; vincoli su Storage rules e doppia posizione delle foto.
---

# Miniature gallerie (thumbnails)

## Regola: per scritture su Storage che richiederebbero una rule nuova, genera lato server con l'admin SDK
Le miniature si generano SEMPRE lato server (`server/thumbnails.ts`, Firebase Admin SDK), non dal client.
**Why:** modificare `storage.rules` in questo ambiente è INERTE in produzione finché non viene fatto il deploy con la Firebase CLI (qui non disponibile). Storicamente 0 foto su ~47k avevano `thumbnailUrl` perché la rule per il path `thumbnails/` mancava (deny silenzioso) e l'errore veniva inghiottito. L'admin SDK bypassa le rules, quindi funziona a prescindere dal deploy.
**How to apply:** se un task richiede di scrivere su un nuovo path Storage dal client, o aggiungi la rule E ricorda all'utente di fare `firebase deploy`, oppure (preferibile) sposta la scrittura lato server con l'admin SDK.

## Le foto vivono in DUE posti
- Collezione moderna `photos` (con campo `galleryId`).
- Subcollection legacy `galleries/{galleryId}/photos`.
I path Storage variano: `galleries/{id}/...`, `galleries/{id}/photos/...`, `gallery-photos/{id}/...`.
**How to apply:** qualunque operazione batch sulle foto deve gestire ENTRAMBE le collezioni e non assumere un singolo prefisso di path. Il path Storage si ricava dal download URL (parte tra `/o/` e `?`, url-decoded), non dal nome galleria.

## La qualità per il cliente non cala mai
Griglia usa `thumbnailUrl || url`; lightbox (`ImageLightbox`) e download usano SEMPRE l'originale `currentPhoto.url`. La miniatura è un file separato in `thumbnails/{galleryId}/{docId}.jpg`, l'originale non viene mai toccato.
**How to apply:** non sostituire mai `url` con la miniatura; le miniature sono solo per anteprime in griglia.

## Fallimenti permanenti vanno marcati, non ritentati all'infinito
Una foto con originale irrecuperabile (URL non interpretabile, 404, file non-immagine) viene marcata `thumbnailFailed: true` ed esclusa dalle run successive.
**Why:** altrimenti le foto rotte occupano gli slot del batch a ogni chiamata e bloccano quelle sane dietro di loro (head-of-line blocking), fermando il loop client quando `generated===0`. I fallimenti transitori (rete) NON vanno marcati, vanno ritentati.
