---
name: Info Form field types & Instagram→cliente sync
description: Where InfoFormField.type is constrained (must stay aligned) and how the Instagram auto-sync to clienti works
---

# Tipi di campo dei Moduli Informativi (InfoFormField.type)

Il tipo di un campo (`InfoFormField.type`) è vincolato in più punti che DEVONO restare
allineati, altrimenti si hanno disallineamenti silenziosi (UI ok ma salvataggio/rendering
incoerente):

- `shared/info-form-types.ts` — union dei tipi (fonte).
- `InfoFormTemplateManager.tsx` — `FIELD_TYPE_LABELS` (Record esaustivo: TS rompe se manca
  un tipo) **e** la allowlist in `normalizeImportedFields` (import preset/AI).
- `InfoFormPublic.tsx` — switch in `renderFieldInput` (un tipo senza case non viene reso).
- `InfoFormJobSection.tsx` — secondo `FIELD_TYPE_LABELS` (Record<string,string>, non
  esaustivo: un tipo mancante qui NON dà errore TS ma mostra label vuota in admin review).

**Why:** i tipi sono hardcoded in più file senza un'unica fonte runtime.
**How to apply:** aggiungendo un nuovo tipo, toccare tutti e 4 i punti sopra.

# Sync Instagram → cliente (Moduli Informativi)

- `cliente.instagram` (collection `clienti`) è salvato come **handle puro senza @**
  (ClienteForm strippa @ e URL). NON confondere con `studioSettings.socialLinks.instagram`
  (Instagram dello studio, footer/homepage).
- Campo dedicato `type: 'instagram'` con `clientTarget?: 'client1'|'client2'`. La sync è
  LATO SERVER in `POST /api/info-forms/by-token/:token/submit` (i clienti compilano via
  token, non sono admin).
- Mappatura target: `client1`/`client2` → `job.clientiIds[0]`/`[1]`; senza `clientTarget`
  → `submission.clienteId` (destinatario del modulo). I `templateFields` (con clientTarget)
  arrivano al backend dentro la submission, non dal body pubblico → il target non è
  manipolabile dal client.
- Handle normalizzato (strip @, estrazione da URL instagram.com, strip slash) e validato
  `^[A-Za-z0-9._]{1,30}$` prima dell'update.
- Sync non bloccante: try/catch esterno + try/catch per-campo (un fallimento non blocca
  gli altri né la conferma di invio al cliente).

**Why:** richiesta utente — un solo sposo deve poter inserire entrambi gli Instagram.
**Nota storica:** un primo tentativo errato fu fatto sul Questionario/FAQ; annullato.
La feature vive SOLO nei Moduli Informativi (Info Forms).
