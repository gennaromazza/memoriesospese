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
**How to apply:** qualunque operazione batch sulle foto deve gestire ENTRAMBE le collezioni e non assumere un singolo prefisso di path.

## Gli URL delle foto hanno PIÙ formati: il parser del path deve gestirli tutti
Nei dati convivono almeno due formati di URL per lo stesso bucket:
- Firebase download URL: `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path-url-encoded>?alt=media&token=...` → path dopo `/o/`, poi `decodeURIComponent`.
- GCS signed/public URL: `https://storage.googleapis.com/<bucket>/<path>?GoogleAccessId=...&Signature=...` → path = pathname dopo il segmento bucket (NON c'è `/o/`).
**Why:** un parser che cerca solo `/o/` ritorna null sui signed URL; nel sistema miniature questo marcava per errore TUTTE le foto di una galleria come `thumbnailFailed` (224 foto poisonate in produzione). Galleria diversa = formato URL diverso, quindi una galleria può funzionare e un'altra no.
**How to apply:** estrai il path con `new URL()` gestendo sia `/o/` sia path-style/virtual-hosted (`storage.googleapis.com/<bucket>/...` e `<bucket>.storage.googleapis.com/...`). Se marchi fallimenti permanenti, ricordati che un bug del parser può richiedere di azzerare i marker (`thumbnailFailed`) via query `collection('photos').where('thumbnailFailed','==',true)`.

## La UI di upload/gestione foto che usa l'admin è GalleryManagementWorkspace, non EditGalleryModal
La pagina a tutto schermo `/admin/gallery/:id/manage` (`pages/GalleryManagementWorkspace.tsx`, "Gestisci Galleria" / "Carica Foto Bulk") è il vero flusso di caricamento e gestione foto. `EditGalleryModal` è una modale secondaria.
**How to apply:** per feature legate alle foto (pulsanti in toolbar "Foto Caricate", auto-trigger dopo upload), lavora in GalleryManagementWorkspace; mettere roba solo nella modale fa sì che l'admin non la trovi.

## Esistono TRE schermate di upload foto galleria; gli ospiti non possono usare l'endpoint admin
Schermate: `GalleryManagementWorkspace` (admin, principale), `EditGalleryModal` (admin, modale), `GuestUpload` (ospiti/clienti autenticati ma NON admin). L'endpoint admin `/api/admin/galleries/:id/generate-thumbnails` è admin-only (403 per gli ospiti).
**Why:** gli ospiti devono comunque ottenere miniature affidabili (quelle client-side falliscono in prod), ma esporre un endpoint a qualsiasi utente loggato sarebbe abuso di calcolo/enumeration di galleryId.
**How to apply:** per i trigger non-admin usa l'endpoint gallery-scoped `/api/galleries/:id/generate-thumbnails` (`server/gallery-routes.ts`): autorizza se admin OPPURE l'utente ha già una foto propria nella galleria (`photos where galleryId==X && uploaderUid==uid` — sole uguaglianze, niente indice composito). Il client sceglie l'endpoint via `generateGalleryThumbnails(..., {scope:'gallery'})`. NB: `apiRequest` allega il Bearer token solo per i prefissi nella whitelist `firebaseAuthEndpoints` in `client/src/lib/queryClient.ts`: ogni nuovo endpoint autenticato va aggiunto lì o riceve 401. Rete di sicurezza: auto-riparazione one-shot in GalleryManagementWorkspace che genera le miniature mancanti all'apertura della galleria.

## Le copertine NON passano dal generatore miniature
Le copertine standalone sono caricate già compresse in `galleries/{id}/covers/...`, NON sono nella collezione `photos` e si vedono solo nell'hero (`GalleryHeader`) a piena risoluzione: nessuna miniatura necessaria.
**How to apply:** nel cover picker / griglie usa `photo.thumbnailUrl || photo.url` per il display, ma salva sempre `photo.url` come copertina (l'hero deve restare full-res).

## La qualità per il cliente non cala mai
Griglia usa `thumbnailUrl || url`; lightbox (`ImageLightbox`) e download usano SEMPRE l'originale `currentPhoto.url`. La miniatura è un file separato in `thumbnails/{galleryId}/{docId}.jpg`, l'originale non viene mai toccato.
**How to apply:** non sostituire mai `url` con la miniatura; le miniature sono solo per anteprime in griglia.

## Fallimenti permanenti vanno marcati, non ritentati all'infinito
Una foto con originale irrecuperabile (URL non interpretabile, 404, file non-immagine) viene marcata `thumbnailFailed: true` ed esclusa dalle run successive.
**Why:** altrimenti le foto rotte occupano gli slot del batch a ogni chiamata e bloccano quelle sane dietro di loro (head-of-line blocking), fermando il loop client quando `generated===0`. I fallimenti transitori (rete) NON vanno marcati, vanno ritentati.

## Foto con URL pubblici GCS (storage.googleapis.com senza token)
Alcune gallerie hanno foto con URL path-style `storage.googleapis.com/<bucket>/...` che funzionano SOLO se il file ha ACL `allUsers:READER` (makePublic). Se il caricamento avviene con credenziali admin non valide, il makePublic fallisce in silenzio → 403 su copertine/foto. Fix: `file.makePublic()` su tutti i file `galleries/<gid>/photos/`. Sintomo: solo una galleria "rotta", le altre (URL firebasestorage con token) ok.
