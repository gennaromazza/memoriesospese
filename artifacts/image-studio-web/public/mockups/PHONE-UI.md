# Standard telefono per i configuratori 3D

Tutti i modelli di album (Quadrobook, Custodia, Album girevole, Plaza e quelli futuri) usano **lo stesso**
foglio di stile per lo smartphone: `public/mockups/phone-ui.css`. Non si scrive CSS telefono per singolo modello.

## Idea (proposta B)

- si sceglie **a schermo pieno**, una cosa per volta;
- il 3D è una **miniatura** nell'angolo ("Vedi in 3D ›"); il 3D grande si apre solo su richiesta e nell'ultima schermata;
- **un solo pulsante principale**, verde pieno (`--mq-accent`), mai bianco su bianco, anche da disattivato;
- salvataggio automatico al cambio di passo; la galleria del cliente è dentro lo slide.

## Come si collega un nuovo modello

1. Nel documento del visualizzatore: `<link rel="stylesheet" href="../phone-ui.css">` (modelli con interfaccia propria, come `scatola-v1`)
   oppure, per i modelli che passano da `installMockupWizard`, non serve nulla: lo aggiunge da solo con `mobile = true`.
2. Mettere le classi del contratto (elenco completo in testa a `phone-ui.css`):
   `body.mq-phone`, `.mq-panel`, `.mq-top`, `.mq-title`, `.mq-progress`, `.mq-content`, `.mq-nav` (`.mq-prev`, `.mq-primary`),
   `.mq-stage`, `.mq-pip-open`, `.mq-pip-close`, `.mq-only-3d`; stati `body.mq-3d` e `body.mq-final`.
3. Galleria nello slide: `PhotobookInlineGallery` (React, per i modelli con wizard) oppure `.mq-gallery > .mq-chips + .mq-thumbs` (viewer autonomi).
4. Aggiungere il modello al test `e2e/mockup-phone.spec.ts` (elenco `models`).

Colori, dimensione della miniatura e altezza del 3D finale sono variabili CSS (`--mq-*`) in testa al file: si cambiano una volta sola, per tutti.
