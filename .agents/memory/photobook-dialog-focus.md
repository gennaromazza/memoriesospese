---
name: Photobook dialog focus
description: Accessibile lifecycle per conferme e lightbox del fotolibro su mobile e desktop.
---

Le conferme del fotolibro usano un wrapper comune sopra AlertDialog, con altezza basata sul viewport dinamico e padding safe-area. Il lightbox custom deve separare l’effetto di mount/unmount (focus iniziale e ritorno al trigger) dall’effetto dei comandi tastiera: se vengono combinati, ogni zoom o cambio pagina può restituire il focus fuori dal dialogo.

**Why:** il renderer e i viewport mobile causano rerender frequenti; il focus non deve saltare al trigger finché il lightbox è aperto.

**How to apply:** per nuovi dialoghi o lightbox del fotolibro, riusare il wrapper e mantenere stabile il lifecycle del focus; aggiungere una verifica browser di apertura, viewport e focus return.