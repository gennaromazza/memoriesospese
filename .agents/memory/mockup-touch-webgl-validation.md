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

Per Playwright WebKit su Nix, aggiungere le ABI Ubuntu richieste (in particolare ICU 74 e libjpeg 8) a `replit.nix`, ma non creare symlink ABI-incompatibili. Il controllo `ldconfig` di Playwright non riconosce sempre i percorsi Nix: il runner WebKit deve saltarlo solo dopo avere verificato l'avvio reale. I plugin GStreamer ereditati dalla shell GTK possono caricare libsoup 2 insieme a libsoup 3 del bundle WebKit e causare un abort; azzerare i percorsi plugin solo nel processo del test.

**Why:** il bundle WebKit Playwright funziona con le librerie Nix corrette, ma il probe Debian e i plugin globali possono fallire prima o durante l'avvio pur senza un problema dell'applicazione.

**How to apply:** per nuovi harness WebKit, usare un ambiente di lancio isolato e verificare prima un avvio headless; se il test cambia solo il viewport per simulare la rotazione, aggiornare anche `screen.orientation` nel contesto WebKit perché il browser non sempre lo cambia automaticamente.

Per testare un timeout di readiness del client senza aggiungere 45–90 secondi reali al percorso touch, avanzare il clock Playwright dopo aver trattenuto la richiesta del renderer; riprenderlo subito dopo il retry prima di continuare la navigazione.

**Why:** il renderer software può già consumare gran parte del budget globale, mentre un clock lasciato in pausa blocca timer e aggiornamenti delle pagine successive.

**How to apply:** usare l’orologio simulato solo nel checkpoint deterministico del timeout e mantenere il timeout del renderer configurabile nel server Vite isolato, senza cambiare il limite di produzione.

Il browser WebKit Playwright scaricato nel runner Nix può restare non avviabile anche dopo l’installazione delle dipendenze generiche: richiede ABI Ubuntu specifiche come `libjpeg.so.8`, oltre a ICU/GStreamer compatibili. Non sostituire queste librerie con symlink ABI-incompatibili.

**Why:** forzare il caricamento di una versione diversa può superare il controllo iniziale ma fallire con simboli mancanti o produrre una verifica Safari non attendibile.

**How to apply:** trattare l’assenza delle librerie WebKit come prerequisito esplicito del runner e usare un ambiente con dipendenze Playwright/Ubuntu compatibili per la conferma WebKit; non modificare il progetto solo per aggirare il linker.

Il harness amministrativo completo può inoltre restare occupato nel primo export della custodia con SwiftShader, prima di raggiungere le fasi successive; un controllo mirato del renderer girevole è più affidabile per validare una regressione specifica di copertina.

**Why:** il percorso completo combina molte esportazioni WebGL e può superare il budget del runner senza fornire un segnale utile sulla fase appena modificata.

**How to apply:** per nuove asserzioni di contenuto del mockup, mantenere il test nel punto del wizard che esercita direttamente la configurazione interessata e usare il gate lifecycle separatamente per la copertura cliente già stabile.