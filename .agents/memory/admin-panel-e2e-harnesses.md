---
name: Admin panel browser harnesses
description: I pannelli admin complessi si possono verificare in browser senza Firebase o provider esterni.
---

Per i test browser di pannelli admin con dipendenze esterne, monta il componente reale in una route dev-only e intercetta le sue API same-origin nello spec Playwright.

**Why:** così il test copre caricamento, interazioni, feedback e salvataggio visibili all’utente senza scrivere dati reali o consumare crediti di servizi esterni.

**How to apply:** usa un config Playwright dedicato con un harness abilitato da variabile Vite; mantieni le risposte simulate abbastanza realistiche da verificare anche privacy, stato salvato e numero di azioni.