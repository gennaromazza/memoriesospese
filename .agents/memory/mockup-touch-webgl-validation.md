---
name: Mockup touch WebGL validation
description: Limite del runner locale per la verifica browser touch del configuratore mockup.
---

Il test browser touch del mockup può restare bloccato nel renderer Chromium/WebGL software prima di produrre un esito, anche quando la pagina iniziale è stata caricata. In questo caso il processo tende a rimanere occupato nel GPU process e la chiusura del browser può nascondere il timeout originale.

**Why:** senza un timeout specifico del renderer e una diagnostica per fase, un controllo di regressione può superare il limite del runner senza distinguere un problema dell’app da un blocco dell’ambiente.

**How to apply:** quando si estende o si esegue `e2e/mockup-touch.browser.mjs`, mantenere checkpoint diagnostici e cleanup con timeout; separare il percorso SwiftShader dai controlli che richiedono una GPU reale.

Per i cambi renderer, i gate delle route devono avviare il proprio timeout solo quando la richiesta viene intercettata: il test può rilasciare il gate prima che Chromium apra il nuovo iframe. Per i tap dentro iframe appena sostituiti, usare il locator del frame per il bounding box; una query `document.querySelector('iframe')` può puntare al frame precedente durante la transizione.

**Why:** con SwiftShader il processo GPU può ritardare la sincronizzazione tra frame Playwright e DOM principale, creando falsi timeout o coordinate calcolate sul renderer sbagliato.

**How to apply:** mantenere sempre un timeout globale più ampio dei budget per fase, ma con timeout separati per gate, readiness, gesture e cleanup; in caso di timeout riportare almeno fase, titolo iframe, stato ready, layout wizard e disponibilità WebGL.

Il browser WebKit Playwright scaricato nel runner Nix può restare non avviabile anche dopo l’installazione delle dipendenze generiche: richiede ABI Ubuntu specifiche come `libjpeg.so.8`, oltre a ICU/GStreamer compatibili. Non sostituire queste librerie con symlink ABI-incompatibili.

**Why:** forzare il caricamento di una versione diversa può superare il controllo iniziale ma fallire con simboli mancanti o produrre una verifica Safari non attendibile.

**How to apply:** trattare l’assenza delle librerie WebKit come prerequisito esplicito del runner e usare un ambiente con dipendenze Playwright/Ubuntu compatibili per la conferma WebKit; non modificare il progetto solo per aggirare il linker.