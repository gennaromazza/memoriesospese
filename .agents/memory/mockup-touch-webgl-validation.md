---
name: Mockup touch WebGL validation
description: Limite del runner locale per la verifica browser touch del configuratore mockup.
---

Il test browser touch del mockup può restare bloccato nel renderer Chromium/WebGL software prima di produrre un esito, anche quando la pagina iniziale è stata caricata. In questo caso il processo tende a rimanere occupato nel GPU process e la chiusura del browser può nascondere il timeout originale.

**Why:** senza un timeout specifico del renderer e una diagnostica per fase, un controllo di regressione può superare il limite del runner senza distinguere un problema dell’app da un blocco dell’ambiente.

**How to apply:** quando si estende o si esegue `e2e/mockup-touch.browser.mjs`, mantenere checkpoint diagnostici e cleanup con timeout; separare il percorso SwiftShader dai controlli che richiedono una GPU reale.