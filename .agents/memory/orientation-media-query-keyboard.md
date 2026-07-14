---
name: Orientation via schermo fisico, non media query
description: Le media query (orientation)/(max-width) mentono con la tastiera aperta se il meta viewport usa interactive-widget=resizes-content
---

Regola: per rilevare telefono/orientamento nelle pagine mobile usare l'hook condiviso `usePhoneOrientation` (`client/src/hooks/use-phone-orientation.ts`), basato su `screen.orientation` (schermo fisico), MAI media query `(orientation: ...)` o `(max-width: ...)`.

**Why:** il meta viewport include `interactive-widget=resizes-content`: quando la tastiera si apre il layout viewport si restringe e diventa più largo che alto → `(orientation: portrait)` risulta falsa col telefono in verticale. Questo faceva riapparire l'overlay "Ruota in verticale" mentre l'utente scriveva la nota nel fotolibro.

**How to apply:** qualsiasi overlay/UI condizionata all'orientamento su pagine con input testuali deve leggere `screen.orientation.type` (fallback `window.orientation` per vecchi iOS). `screen.*` non cambia mai con la tastiera. Rilevamento phone: `pointer: coarse` + lato corto dello schermo fisico ≤ 700px.
