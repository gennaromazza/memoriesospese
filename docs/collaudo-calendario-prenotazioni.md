# Collaudo prima della pubblicazione: calendario, slot e sincronizzazione

Riguarda le modifiche dei commit "Prenotazioni: Google Calendar fail-closed…" e
"Calendar sync: verifica prima di azzerare i riferimenti…" e i punti 5-7 dell'audit
(override consulenze, evento cancelled dei job, approvazione atomica, controllo spostamenti).

## 1. Test automatici (su Replit, senza toccare i dati)

Da eseguire sul ramo allineato. Sono tutti a database simulato: non scrivono su Firestore né su Google.

```text
pnpm --filter @workspace/api-server exec vitest run src/google-calendar src/sync src/booking src/consultation-approval.test.ts src/consultation-override.test.ts src/job-calendar-event.test.ts src/system-alerts.orphans.test.ts src/booking-routes.creation.test.ts src/order-reconciliation.http.test.ts
pnpm --filter @workspace/image-studio-web exec vitest run src/lib/orders src/components/booking
pnpm --filter @workspace/image-studio-web exec playwright test --config playwright.order-reconciliation.config.ts
```

Esito atteso: tutto verde. Su questo ambiente di sviluppo risultavano già rossi (non dipendono da queste modifiche):
`consultation-rejected-email` (3), `lab-mockup-workflow`, `photobook-shipment-integrated`,
`print-shop/*`, `quote-signed-dates`, `shop/router`, `shared/social-metadata`.
Se su Replit falliscono altri file, vanno segnalati e non ignorati.

## 2. Prove manuali con il calendario reale

Usa **un giorno lontano senza impegni veri** (per esempio fra 2-3 settimane) e un cliente di prova.
Alla fine elimina a mano gli eventi e le prenotazioni di prova. Non provare lo scenario "Google non
leggibile" in produzione: è coperto dai test automatici.

| # | Cosa fare | Esito atteso |
|---|---|---|
| 1 | Crea a mano nel calendario Google un evento 10:00-11:00 nel giorno di prova. Apri la pagina pubblica di prenotazione per quel giorno. | Le 10:00 e le 10:30 non sono offerte. Il resto sì. |
| 2 | Imposta lo stesso evento su "Libero" (non occupato). | Lo slot torna disponibile (comportamento voluto: gli eventi "Libero" non bloccano). |
| 3 | Crea un evento "tutto il giorno" nel giorno di prova. | Nessuno slot offerto quel giorno. |
| 4 | Prenota uno slot libero dalla pagina pubblica (campagna con conferma automatica) e verifica su Google. | Un solo evento creato, nessun duplicato. La prenotazione è confermata. |
| 5 | Subito dopo la prenotazione, crea a mano un evento sovrapposto e prova a prenotare lo stesso slot da un secondo browser. | Il secondo tentativo riceve "slot non più disponibile". |
| 6 | Crea una consulenza in attesa e una prenotazione in attesa di pagamento sullo stesso orario, poi approva la consulenza dall'admin. | Risposta 409 "Slot non più disponibile", nessun evento creato su Google. |
| 7 | Approva una consulenza con "forza approvazione" scegliendo di cancellare un tuo evento in conflitto. | La consulenza passa a confermata, il nuovo evento esiste, il tuo evento viene cancellato solo dopo. |
| 8 | Sposta una consulenza confermata (Reminder manager) su un orario occupato da un evento Google. | Errore 409 con il nome dell'evento, nulla viene modificato. Su un orario libero: salva e sposta l'evento. |
| 9 | Annulla una prenotazione confermata dopo aver cancellato a mano il suo evento su Google. | L'annullamento si completa (non resta "in attesa di cancellazione"). |
| 10 | Crea una prenotazione confermata con data fra più di 100 giorni, poi lancia la sincronizzazione (`POST /api/admin/sync-calendar` come admin). | La prenotazione conserva `googleCalendarEventId`. |
| 11 | Cancella a mano su Google l'evento di una prenotazione fra 5-10 giorni e rilancia la sincronizzazione. | Solo in questo caso il riferimento viene rimosso. |
| 12 | Crea a mano un job con data fissa e poi cancellane l'evento su Google; usa "sincronizza con il calendario" sul job. | L'evento viene ricreato (azione "recreated"). |
| 13 | Apri la schermata Prenotazioni (admin). | Si apre subito. Con acconti PayPal da verificare compare "Verifica degli acconti PayPal in corso…" e solo il pannello di quell'ordine resta nascosto finché non finisce. |

## 3. Cosa guardare nei log durante le prove

- `Calendario Google non leggibile`, `CALENDAR_UNAVAILABLE`: non devono comparire durante l'uso normale.
- Email "Eventi da controllare" all'admin: arriva solo se resta un evento creato dal gestionale senza prenotazione collegata (al massimo una ogni 12 ore).
- `CRITICAL` nei log di approvazione: indica un evento da rimuovere a mano (parte anche l'email).

## 4. Prima di pubblicare

- Tutti i test automatici verdi (sezione 1).
- Prove 1-13 eseguite, con data e nota dell'esito.
- Indice Firestore `consultations` (`stato` + `dataConsulenza`): già verificato presente.
- Dopo la pubblicazione, controllare i log per 24 ore e che la sincronizzazione ogni 30 minuti non azzeri riferimenti (la sezione "Repairs" del report deve essere vuota in assenza di eventi cancellati).
