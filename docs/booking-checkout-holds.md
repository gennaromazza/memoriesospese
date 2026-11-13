# Riserve server per checkout immediato

Base per il percorso **approvazione disattivata + acconto attivo**.
Non crea ordini PayPal, non incassa e non invia email. Le regole funzionali
approvate restano in `booking-deposit-policy.md`.

## Contratto

- `POST /api/booking/v2/checkout-holds`: campagna, cliente, date dello slot,
  prodotto opzionale e note. Importo e scadenza sono esclusivamente server-side.
- La risposta contiene `bookingId`, token casuale, importo in centesimi,
  `expiresAt` e ora server. Il token va conservato per la sessione di checkout:
  non va inserito in URL, log o analytics.
- `POST /:bookingId/resume` e `POST /:bookingId/release`, sotto la stessa base,
  ricevono `{token}`. Resume non modifica la scadenza. Release abbandona soltanto
  la riserva autenticata, non una prenotazione pagata.
- La chiusura della pagina senza release lascia scadere la riserva dopo dieci
  minuti. All'istante esatto del termine non è più utilizzabile.
- La disponibilità ignora direttamente i record scaduti: non dipende da
  un processo periodico o da una cancellazione TTL.

## Bozze e concorrenza

`bookingCheckoutHolds/{bookingId}` è una bozza privata della futura prenotazione.
L'ID è già quello da usare per la prenotazione finale, ma non si crea ancora un
documento in `bookings`: un checkout incompleto non è una richiesta da approvare.
La bozza conserva cliente e prodotto, l'importo congelato, gli estremi dello
slot e solo l'hash del token.

`bookingSlotLocks` fornisce guardie giornaliere condivise tra campagne e tra
checkout e prenotazioni pubbliche. Leggere e aggiornare la guardia nella stessa
transazione protegge anche due query inizialmente vuote. Tutte le letture
precedono le scritture. Gli slot adiacenti non sono sovrapposti.

Le riserve sono incluse nella disponibilità booking V2, nella versione legacy
e nella fonte centrale delle consulenze. Le query delle riserve usano un unico
campo data, evitando la necessità di nuovi indici compositi.

La creazione diretta di `bookings` è negata dalle regole Firestore anche ai
client admin: le schermate di creazione pubblica e manuale usano già le API
server. Un test con l'emulatore verifica che non sia possibile saltare guardie e
controlli creando una prenotazione direttamente con il Web SDK. Letture e
aggiornamenti admin dei documenti esistenti restano consentiti.

## Vincoli per i passaggi PayPal successivi

- Usare l'ID, l'importo e la scadenza della riserva esistente, senza ricalcolarli
  dal browser o rinnovare il termine creando una nuova riserva al refresh.
- Dopo un errore certo di creazione/pagamento, chiamare
  `releaseCheckoutHold(..., 'payment_failed')`. Un esito di incasso ambiguo
  richiede riconciliazione, non rilascio indiscriminato.
- Il consumo dopo incasso deve verificare nuovamente stato e termine nella
  transazione che chiude la riserva e crea la prenotazione finale con lo stesso
  ID. La transizione a `consumed` impedisce release tardivi.
- Un incasso tardivo non deve riattivare la riserva né riassegnare lo slot.
- I test usano un database finto con versioni dei documenti e retry ottimistici,
  non il Firestore reale, per verificare le corse senza prenotazioni o email vere.
