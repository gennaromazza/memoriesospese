---
name: Calendar event ↔ Job association
description: Come gli eventi Google Calendar vengono collegati ai Job e risolti nel calendario admin
---

# Associazione evento Google Calendar ↔ Job

L'associazione tra un evento Google Calendar e un Job vive **dentro `job.linkedCalendarEventIds[]`** (array di google event id), NON in una collezione dedicata. Stesso array usato sia dalla creazione evento sia dall'associazione manuale via "Modifica" nel calendario.

**Risoluzione (GET /api/calendar/events):** dopo aver caricato google+consulenze+jobs, un blocco best-effort risolve i link e popola il DTO con `linkedJobId / linkedJobName / signedQuoteToken / hasSignedQuote`:
- google→job: query `where('linkedCalendarEventIds','array-contains-any', chunk≤10)`.
- job event: `linkedJobId = entityId`; consulenza: `linkedJobId = c.jobId` (impostato al push).
- nomi/stato: `db.getAll(...jobRefs)`; token preventivo firmato: `quotes where('jobId','in',chunk≤10)` filtrando in memoria `status==='firmato'` (niente filtro status server-side → niente indice composito).

**Scrittura (PATCH /events/:eventId, solo type==='google'):** validare l'esistenza del job target PRIMA di chiamare `updateEvent()` su Google (altrimenti un jobId stale modifica l'evento ma la route risponde 404); poi `arrayRemove` dai job precedenti + `arrayUnion` sul nuovo (null = scollega).

**Why:** la cache `calendarCache` (TTL 2 min) serve i dati già risolti; **ogni write che cambia associazioni/eventi deve fare `calendarCache.clear()`** o i link restano stale fino a 2 minuti.

**How to apply:** per nuovi punti che mostrano "evento collegato a lavoro", leggere `linkedCalendarEventIds`; non introdurre collezioni di mapping parallele. Il gate UI del dettaglio NON può basarsi solo su `entityId` (gli eventi google puri non ce l'hanno) — includere anche `linkedJobId`/`signedQuoteToken`.
