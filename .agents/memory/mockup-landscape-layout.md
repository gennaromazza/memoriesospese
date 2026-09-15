---
name: Mockup landscape layout rules
description: Vincoli di layout del chooser/configuratore fotolibro in landscape mobile e trappole CSS/test incontrate.
---
Regole
- Landscape mobile è il formato di riferimento del configuratore; il chooser è una composizione a due zone (testo a sinistra, colonna card scrollabile a destra) con la barra azioni **in flusso** (sticky/flex), mai position:fixed.
- **Why:** una barra fixed più un contenitore overflow:hidden copriva le card e impediva lo scroll (bug segnalato dall'utente con screenshot 1024×478).
- **How to apply:** ogni nuova superficie del configuratore va verificata con e2e/photobook-landscape-screens.browser.mjs (844×390, 1024×478, desktop, portrait); gli screenshot finiscono in screenshots/photobook-landscape/.

Trappole
- Griglie di card composte da <button> in una colonna scrollabile: Chromium distribuisce le righe auto come se fossero stretch e clippa il contenuto; serve grid-auto-rows: max-content oltre ad align-content: start.
- Playwright valuta page.route dall'ultima registrata: il catch-all **/api/** va registrato prima della route specifica o inghiotte tutto.
- I token --mockup-* devono stare sia su .mockup-entry-shell sia sul DialogContent (portal sotto body), altrimenti le sezioni admin/offer nel dialog perdono colori e bordi.
- Il test lifecycle cerca testi esatti sulla card di stato ("Bozza · revisione N", frase read-only): i redesign del copy devono mantenere quei testi in un unico elemento.
