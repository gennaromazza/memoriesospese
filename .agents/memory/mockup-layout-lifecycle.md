---
name: Mockup layout lifecycle
description: Invarianti per verificare cleanup e sostituzione rapida del layout wizard negli iframe.
---

Quando un disposer viene registrato in uno stato React, passarlo come updater (`setDispose(dispose)`) lo esegue immediatamente; usare un wrapper (`setDispose(() => dispose)`). I test del wizard devono mantenere osservabili separati per il marker `data-wizard-layout` e per gli stili iniettati, verificando entrambi dopo ogni sostituzione.

**Why:** il primo harness sembrava installare il layout ma React interpretava la funzione come updater e lo smontava subito; controllare solo l’iframe attivo non avrebbe distinto questo errore da un renderer non pronto.

**How to apply:** nei test di sostituzione iframe, registrare il disposer come valore funzione, conservare snapshot del documento precedente dopo il cleanup e asserire zero marker/stili per i layout rimossi e un solo blocco di stili per quello attivo.