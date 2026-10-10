---
name: Calendar SA fallback & fail-closed availability
description: Auth Google Calendar con fallback FIREBASE_ADMIN_CREDENTIALS; disponibilità fail-closed quando il calendario non è leggibile
---
La chiave dedicata GOOGLE_CALENDAR_* (calendar-service@...) è stata revocata da Google (ago 2026, "Invalid JWT Signature"). `getServiceAccountAuth` in server/google-calendar.ts ora prova le credenziali dedicate e poi FIREBASE_ADMIN_CREDENTIALS (dual-format) come fallback; il calendario di GOOGLE_CALENDAR_ID (gennaro.mazzacane@gmail.com) va condiviso con la client_email del SA attivo — serve permesso "Apportare modifiche agli eventi" per la creazione eventi all'approvazione (la sola lettura fa fallire gli insert).

**Regola fail-closed:** se Google Calendar non è leggibile, la disponibilità pubblica NON deve degradare a "tutto libero". `checkGoogleCalendarBusyPeriods` lancia errore code `CALENDAR_UNAVAILABLE` (mai `return []`), gli adapter lo propagano, gli endpoint pubblici di disponibilità rispondono 503 con code CALENDAR_UNAVAILABLE. L'event-sync-guard invece SALTA la riconciliazione quando Google è giù (un set vuoto cancellerebbe i googleCalendarEventId validi in Firestore).

**Why:** con il fail-open un cliente ha prenotato sopra un impegno reale (Prima comunione) senza che nessuno se ne accorgesse.
**How to apply:** ogni nuovo consumer di eventi calendario deve distinguere "nessun evento" da "calendario non leggibile" e mai assorbire l'errore restituendo lista vuota.
