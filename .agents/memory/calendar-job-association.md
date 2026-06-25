---
name: Calendar event ↔ Job association
description: Decisione durevole su come collegare eventi Google Calendar ai Job
---

# Associazione evento Google Calendar ↔ Job

L'associazione vive **dentro `job.linkedCalendarEventIds[]`** (array di google event id). Non introdurre collezioni di mapping parallele: è la singola fonte di verità, usata sia dalla creazione evento sia dall'associazione manuale.

**Why:** evita doppie scritture e disallineamenti; un evento può essere risolto in entrambe le direzioni con una sola query.

**How to apply:**
- Per sapere a quale job appartiene un evento google: query `array-contains-any` su `linkedCalendarEventIds` (Firestore limita `in`/`array-contains-any` a 10 valori → chunk ≤10). Gli eventi google "puri" non hanno entità locale, quindi la UI non può basarsi solo su `entityId`.
- Associare = `arrayUnion`, scollegare/spostare = `arrayRemove` dai job precedenti; validare l'esistenza del job target PRIMA di mutare l'evento su Google (un id stale non deve modificare Google e poi rispondere 404).
- **Ogni write che tocca eventi/associazioni deve invalidare `calendarCache`** o i dati risolti restano stale fino alla scadenza del TTL.
