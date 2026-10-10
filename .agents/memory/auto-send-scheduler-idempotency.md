---
name: Auto-send email scheduler idempotency
description: How to make recurring auto-send email schedulers (es. auto-invito consulenza) idempotenti senza doppi invii.
---

# Idempotenza scheduler di invio email automatico

Per scheduler ricorrenti che inviano email una-tantum per documento (es. auto-invito
consulenza visione in `reminder-routes.ts`, agganciato al ciclo orario reminder in `server/index.ts`):

**Regola:** imposta il marker di idempotenza in **transazione PRIMA dell'invio**, poi
fai rollback del marker **SOLO se fallisce l'invio email vero e proprio**. Le scritture
post-invio (timeline / workflowEvents / collezioni accessorie) sono **best-effort**:
in caso di errore vanno solo loggate, MAI causare il rollback del marker.

**Why:** un singolo `try/catch` attorno a "send + persist" fa rollback del marker anche
quando l'email è GIÀ partita ma fallisce una scrittura successiva → al giro orario
seguente il cliente riceve un secondo invio. È esattamente l'anti-pattern segnalato in review.

**How to apply:**
- Transazione di lock che ricontrolla, sullo snapshot fresco, sia il marker auto sia
  un eventuale invio MANUALE concorrente (dedup senza race tra query iniziale e lock).
- `sendGmailEmail` in un suo try/catch: on fail → rollback marker + `continue`.
- Dopo invio riuscito: `results.sent++`, poi persistenza timeline in try/catch separato
  che logga soltanto.
- Calcola valori derivati solo-lettura (es. `dateFrom` con `computeEarliestBookableDate`)
  PRIMA del lock: se falliscono, degrada (ometti il valore) senza bloccare l'invio.
- `dateFrom` è solo un hint per il picker: l'endpoint `/v2/available-slots` riapplica
  comunque lead post-produzione + blocco giorno-dopo-all-day. Allinea comunque `dateFrom`
  a quelle regole per coerenza UX.
