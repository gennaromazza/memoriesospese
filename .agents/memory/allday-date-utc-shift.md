---
name: Date all-day da istante UTC
description: Estrarre e mostrare le date di calendario da istanti UTC usando esplicitamente Europe/Rome, anche nelle email.
---

**Regola:** quando da un `Date`/stringa ISO (istante) serve la DATA di calendario (eventi all-day Google, confronti per giorno), usare `toRomeDateTime(d).toISODate()` (server/utils/timezone.ts), MAI `d.toISOString().split('T')[0]`. Anche la visualizzazione nelle email deve specificare Europe/Rome: locale `it-IT` da solo non imposta il fuso.

**Why:** il browser del cliente serializza la mezzanotte locale (Rome) come `...T22:00Z` in estate o `...T23:00Z` in inverno del giorno prima; l'estrazione UTC sposta l'evento di -1 giorno. Bug reale: preventivo rapido → matrimonio 15/09/2027 finito il 14/09 su Google Calendar (luglio 2026). Il percorso job normale (ensureJobCalendarEvent) era già corretto. Lo stesso errore può comparire solo nell'email quando il contratto e l'istante salvato sono corretti: non riscrivere i dati per correggere un problema di visualizzazione.

**How to apply:** ogni nuovo punto che crea eventi all-day, confronta date da `eventDate` o le mostra nelle email deve passare per il fuso Europe/Rome. Ricontrollare con grep `toISOString().split` sui nuovi write-path calendario; nelle email usare un formatter con fuso esplicito e verificare mezzanotte italiana con processo server in UTC.
