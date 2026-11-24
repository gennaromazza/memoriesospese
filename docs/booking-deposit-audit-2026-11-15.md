# Audit pre-pubblicazione: acconto PayPal per le prenotazioni (15 novembre 2026)

Ambito: checkout immediato con acconto, acconto dopo approvazione, cattura,
webhook, scadenze, rimborsi, link personale, pannello admin e i componenti
PayPal condivisi (shop, gift card, stampe). Codice sul branch
`claude/quadrobook-memorie-sospese`.

## Esito

Il flusso del denaro è solido: importi e identità dell'ordine sono sempre
quelli del server (mai del browser), ogni cattura è verificata con una
rilettura canonica di PayPal prima di scrivere, incasso/commissione/cassa sono
scritti in una sola transazione idempotente, le notifiche webhook sono
verificate e deduplicate, le nuove collezioni Firestore sono chiuse ai client,
i percorsi admin legacy (approva, stato, elimina, rifiuta) non possono più
confermare o cancellare una prenotazione con acconto non pagato o incassato.

Le correzioni applicate in questo commit riguardano robustezza e abuso, non
perdite di denaro.

## Correzioni applicate

1. **Carta rifiutata = cliente bloccato.** Dopo un rifiuto esplicito di PayPal
   (es. `INSTRUMENT_DECLINED`, 422) il tentativo restava `unknown`: la verifica
   rispondeva per sempre "in elaborazione", l'annullamento era vietato e il
   cliente non poteva riprovare con un altro metodo fino alla scadenza dei
   dieci minuti. Ora un 4xx sincrono confermato da una rilettura dell'ordine
   senza alcuna cattura diventa `declined`: nuovo codice
   `PAYPAL_INSTRUMENT_DECLINED` (409), la pagina ripropone i pulsanti PayPal
   sullo stesso ordine e permette di annullare. Timeout, 5xx, 429 e ordini con
   catture presenti restano "incerti" come prima (nessun secondo addebito).
2. **Nessun limite sulle rotte pubbliche.** Creazione riserva, ordine, verifica,
   cattura, link personale e annullamento erano senza rate limit: chiunque
   poteva riservare in serie tutti gli slot di una campagna senza pagare o
   usare il server per martellare PayPal. Aggiunti limiti per visitatore
   (6 riserve / 10 min; 120 chiamate di pagamento / 10 min; 60 per il link
   personale) con risposta 429 e `Retry-After`.
3. **Chiave del limitatore dietro il proxy.** `uidRateLimiter` (shop e stampe)
   usava `req.ip`, che su Replit è l'indirizzo del proxy per tutti: il limite di
   10 ordini / 15 minuti era di fatto globale e chiunque poteva esaurirlo per
   tutti i clienti. Ora usa il primo indirizzo di `X-Forwarded-For`, come già
   facevano le gift card.
4. **Dati personali nei checkout mai pagati.** Le bozze (nome, email, WhatsApp)
   degli hold scaduti o annullati restavano per sempre. Il worker delle scadenze
   ora rimuove bozza e hash del token dopo 30 giorni dalla scadenza, solo se non
   esiste alcun incasso o riconciliazione da fare; il tracciato finanziario e
   l'associazione con l'ordine PayPal restano.

## Verifiche fatte

- `pnpm run typecheck`: ok su tutti i progetti.
- Vitest api-server (booking, commerce, print-shop router): 328 test, tutti ok,
  inclusi i nuovi su rifiuto certo vs esito incerto, annullamento dopo rifiuto,
  anonimizzazione e limitatore.
- Vitest web `BookingPage.outcome`: 28 test ok, incluso il nuovo tentativo dopo
  carta rifiutata senza una seconda riserva.
- Playwright `test:booking-deposit-browser`: 15/15 ok.
- I fallimenti presenti nella suite completa dell'api-server (laboratorio mockup,
  email consulenze, social metadata, `shop/router.test`, `print-shop/auth.test`)
  sono preesistenti e identici sul codice non modificato: mock di
  `firebase-admin` incompleti nei test, non difetti dell'applicazione.

## Da controllare in produzione (non risolvibile da codice)

- `PAYPAL_WEBHOOK_ID` è unico: PayPal firma gli eventi per URL di webhook. Se
  il webhook registrato su PayPal punta a `/api/shop/paypal/webhook` (o gift
  card/stampe) va bene: quelle rotte inoltrano gli eventi `booking:` al
  registro delle prenotazioni. Non registrare un secondo webhook con ID diverso
  su `/api/booking/paypal/webhook` senza aggiornare la variabile.
- `SESSION_SECRET` deve avere almeno 32 caratteri: senza, l'approvazione con
  acconto e il link personale rispondono 503 e nessuna email parte.
- In `live`, senza `PAYPAL_WEBHOOK_ID` il checkout è disattivato di proposito.
- Indici Firestore: `checkSlotReservation` interroga `bookings` con
  `stato ==` più intervallo su `dataShootingInizio` (indice composto, già usato
  dall'approvazione) e `bookingCheckoutHolds` con `status in` più ordinamento
  per ID. Se un indice manca, la prima richiesta reale fallisce con un errore
  che contiene il link per crearlo: testare una riserva su una campagna di prova.

## Limiti noti e accettati dalla policy

- Un incasso catturato negli ultimi secondi della finestra può arrivare dopo la
  scadenza: viene registrato come "da verificare" e non riassegna lo slot, come
  da regole del titolare; l'admin sceglie nuova data o rimborso.
- La riserva di 10 minuti viene liberata anche se il cliente ha la finestra
  PayPal aperta: la pagina spegne i pulsanti e rilascia lo slot allo scadere,
  quindi nessun addebito può avvenire dopo.
