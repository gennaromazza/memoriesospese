---
name: Condivisione manuale dei mockup fotolibri
description: Perché l’anteprima cliente deve essere condivisibile anche fuori dal flusso email automatico.
---

L’approvazione manuale delle pagine e la preparazione del mockup da parte dello studio devono permettere l’invio manuale di un semplice link di anteprima al cliente.

Quando il cliente cambia modello partendo da una bozza salvata, il browser può chiedere conferma prima di sostituire configurazioni incompatibili. Nei test Playwright la finestra va accettata esplicitamente: se viene chiusa, il selettore resta aperto senza procedere.

**Why:** I test browser possono chiudere automaticamente `window.confirm`; il passaggio sembra bloccato anche se l’interfaccia sta proteggendo le personalizzazioni esistenti.

**How to apply:** Nei test E2E che passano da una bozza salvata a un altro modello, gestire la conferma prima di controllare l’avvio del renderer.

**Why:** Lo studio può aver già concordato il risultato con il cliente fuori dalla piattaforma: prepara il mockup e vuole inviare un link perché il cliente lo controlli e lo approvi, senza personalizzarlo.

**How to apply:** La conferma tecnica dello studio prepara il mockup condivisibile; l’approvazione del cliente è un passaggio distinto, riferito alla revisione vista. Il cliente non deve personalizzare il modello. Nessuna di queste azioni avvia automaticamente la stampa. Una modifica successiva richiede una nuova approvazione.
