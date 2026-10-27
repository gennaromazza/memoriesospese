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

## Fotolibri autonomi

Un fotolibro senza lavoro e senza galleria è un elemento distinto dai fotolibri collegati e va mostrato in una sezione separata, anche nell’archivio delle stampe. L’editor deve accettare pagine caricate direttamente e la spedizione al laboratorio non deve inventare o richiedere un lavoro associato.

**Why:** Alcuni fotolibri vengono preparati o ristampati indipendentemente da un servizio fotografico registrato; mescolarli ai lavori collegati crea confusione e un job fittizio altererebbe i dati operativi.

**How to apply:** Mantieni il link cliente copiabile per la condivisione manuale. Senza una galleria non proporre foto sostitutive; nella spedizione usa le pagine del fotolibro e le istruzioni inserite per quella consegna, senza snapshot o timeline di un job.
