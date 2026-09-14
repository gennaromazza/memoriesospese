---
name: Mockup texture tiling
description: Regola per correggere cuciture visibili nelle texture periodiche dei renderer 3D.
---

Per usare `RepeatWrapping` su una texture fotografica non tileable, raccordare i bordi della mappa colore e della height map nello stesso asset revisionato e verificare che i bordi opposti coincidano. La dimensione dell’asset e la misura fisica dichiarata devono restare invariate: il raccordo corregge la continuità, non la densità del tessuto.

**Why:** `MirroredRepeatWrapping` nasconde una discontinuità ma crea simmetrie a rombo facilmente visibili sui rivestimenti; cambiare `estimatedRepeatMeters` per compensare altererebbe la scala reale del motivo.

**How to apply:** quando si prepara una nuova revisione di una texture del mockup, aggiornare insieme colore, height map, hash/revisione catalogo e i due renderer che la caricano, aggiungendo una verifica automatica dei bordi.