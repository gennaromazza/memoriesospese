---
name: Questionnaire question types
description: How FaqSet question types are defined and the Instagram→cliente auto-sync flow
---

# Tipi di domanda del questionario (FaqSet)

Il tipo di una domanda del FaqSet (`questions[].type`) è definito/usato in 3 punti che
DEVONO restare allineati, altrimenti si rompe il salvataggio o il rendering:

1. `shared/schema.ts` — interfaccia `FaqSet` **e** `insertFaqSetSchema` (z.enum). Se aggiungi
   un tipo all'interfaccia ma non all'enum Zod, il salvataggio del set fallisce in validazione.
2. `client/src/pages/admin/Faq.tsx` — interfaccia locale `QuestionFormData` + UI editor.
3. `client/src/pages/QuestionnaireForm.tsx` — rendering: `textarea` → Textarea, **tutto il
   resto** → Input. Un tipo sconosciuto non crasha (cade su Input) ma non ha UI dedicata.

**Why:** i tipi sono "hardcoded" in più file senza un'unica fonte; un'aggiunta parziale
crea disallineamenti silenziosi (UI ok ma save che fallisce, o viceversa).

# Sync Instagram → cliente

- `cliente.instagram` (collection `clienti`) è salvato come **handle puro senza @**
  (ClienteForm strippa @ e URL). NON confondere con `studioSettings.socialLinks.instagram`
  (Instagram dello studio, usato in footer/homepage).
- L'aggiornamento avviene LATO SERVER in `POST /api/email/questionnaire-completed`
  (server/email-routes.ts), perché gli sposi compilano via token (non admin).
- Due strategie: (a) esplicita — domande `type:"instagram"` con `clientTarget`
  client1/client2 = primo/secondo `gallery.clientiIds`; (b) fallback legacy — domanda
  riconosciuta dal testo contenente "instagram" + match cliente per email/nome del ruolo.
- La sync è in try/catch non bloccante: non deve impedire l'invio della notifica admin.
- Il valore instagram proviene dalle `answers` salvate (non dal body della request).
