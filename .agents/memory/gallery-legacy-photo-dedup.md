---
name: Dedup foto legacy cross-pagina
description: Le foto della subcollezione legacy galleries/<id>/photos vengono unite alla prima pagina; il dedup per nome deve avvenire cross-pagina o compaiono doppioni come capitolo "Altre Foto".
---

Alcune gallerie hanno le stesse foto in DUE posti: collezione principale `photos` (con `chapterId`) e vecchia subcollezione `galleries/<id>/photos` (SENZA `chapterId`, id client `legacy-*`).

**Regola:** il servizio di paginazione unisce le legacy alla PRIMA pagina, quando conosce solo i primi ~50 nomi → il dedup per nome va rifatto lato Gallery.tsx sull'elenco completo (memo `photos`): scartare ogni `legacy-*` il cui `name` esiste tra le foto non-legacy.

**Why:** senza questo, con la paginazione lazy i doppioni legacy delle pagine successive compaiono come capitolo fittizio "Altre Foto" (senza capitolo) nella vista cliente, con conteggi gonfiati (es. 1016 foto reali → 1237 mostrate).

**How to apply:** qualsiasi nuovo consumer della paginazione foto deve dedupare per nome cross-pagina, preferendo il doc della collezione principale. I dati in Firestore sono corretti: il problema è solo client-side.
