---
name: Admin panel browser harnesses
description: I pannelli admin complessi si possono verificare in browser senza Firebase o provider esterni.
---

Per i test browser di pannelli admin con dipendenze esterne, monta il componente reale in una route dev-only e intercetta le sue API same-origin nello spec Playwright.

**Why:** così il test copre caricamento, interazioni, feedback e salvataggio visibili all’utente senza scrivere dati reali o consumare crediti di servizi esterni.

**How to apply:** usa un config Playwright dedicato con un harness abilitato da variabile Vite; mantieni le risposte simulate abbastanza realistiche da verificare anche privacy, stato salvato e numero di azioni.

I test browser lunghi devono mantenere un checkpoint testuale della fase e dell’ultimo controllo, e in caso di timeout raccogliere URL, dataset e stato essenziale del frame incorporato. La diagnostica va emessa nel terminale, non come screenshot aggiuntivo.

**Why:** una suite con molti scenari consecutivi altrimenti espone solo il timeout globale, rendendo indistinguibili renderer lenti, caricamenti incompleti e azioni UI bloccate.

**How to apply:** aggiorna il checkpoint prima di ogni blocco principale e nei helper di interazione; arricchisci il rethrow finale senza alterare i dati simulati o aggiungere artefatti.

Per il photobook conviene mantenere anche una modalità mirata per la gerarchia admin, separata dagli scenari completi di export: il renderer software può impiegare oltre il timeout standard per generare otto viste.

**Why:** un test UI del pannello non deve risultare fallito solo perché sta ripetendo il gate 3D già verificato dalla suite lifecycle.

**How to apply:** nel controllo admin verifica desktop/mobile, salvataggio, messaggi di stato e richiesta modifiche; lascia conferma/export 8 viste alla suite 3D dedicata.