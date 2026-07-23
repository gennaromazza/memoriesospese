---
name: Date all-day da istante UTC
description: Estrarre la data di un evento all-day da un Date/ISO con Europe/Rome, mai con toISOString().split.
---

**Regola:** quando da un `Date`/stringa ISO (istante) serve la DATA di calendario (eventi all-day Google, confronti per giorno), usare `toRomeDateTime(d).toISODate()` (server/utils/timezone.ts), MAI `d.toISOString().split('T')[0]`.

**Why:** il browser del cliente serializza la mezzanotte locale (Rome) come `...T22:00Z` del giorno prima; l'estrazione UTC sposta l'evento di -1 giorno. Bug reale: preventivo rapido → matrimonio 15/09/2027 finito il 14/09 su Google Calendar (luglio 2026). Il percorso job normale (ensureJobCalendarEvent) era già corretto.

**How to apply:** ogni nuovo punto che crea eventi all-day o confronta date da `eventDate` deve passare per il fuso Europe/Rome. Ricontrollare con grep `toISOString().split` sui nuovi write-path calendario.
