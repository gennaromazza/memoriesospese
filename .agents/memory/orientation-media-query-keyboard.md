---
name: Orientation via schermo fisico, non media query
description: Le media query (orientation)/(max-width) mentono con la tastiera aperta se il meta viewport usa interactive-widget=resizes-content
---

Regola: per rilevare telefono/orientamento nelle pagine mobile usare l'hook condiviso `usePhoneOrientation` (`client/src/hooks/use-phone-orientation.ts`), basato su `screen.orientation` (schermo fisico), MAI media query `(orientation: ...)` o `(max-width: ...)`.

**Why:** il meta viewport include `interactive-widget=resizes-content`: quando la tastiera si apre il layout viewport si restringe e diventa più largo che alto → `(orientation: portrait)` risulta falsa col telefono in verticale. Questo faceva riapparire l'overlay "Ruota in verticale" mentre l'utente scriveva la nota nel fotolibro.

**How to apply:** qualsiasi overlay/UI condizionata all'orientamento su pagine con input testuali deve leggere `screen.orientation.type` (fallback `window.orientation` per vecchi iOS). `screen.*` non cambia mai con la tastiera. Rilevamento phone: `pointer: coarse` + lato corto dello schermo fisico ≤ 700px. Negli harness browser, viewport e `hasTouch` non bastano sempre: simulare esplicitamente sia `(pointer: coarse)` sia `screen.orientation`, poi emettere `orientationchange` quando si cambia orientamento.

Decisione UX: il configuratore mockup non deve bloccare il portrait con un overlay. In verticale il wizard usa anteprima sopra e opzioni sotto; il landscape resta una composizione ampliata opzionale.

**Why:** obbligare il cliente a ruotare il telefono interrompe il percorso, è scomodo con una mano e rende il mockup inutilizzabile su dispositivi con orientamento bloccato.

**How to apply:** usare l'orientamento solo per la composizione responsive, non per impedire l'interazione o mostrare “Ruota il telefono” dentro `PhotobookMockup`.
