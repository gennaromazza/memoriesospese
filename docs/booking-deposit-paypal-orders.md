# Ordini PayPal per acconti

## Cosa è disponibile

`POST /api/booking/v2/checkout-holds/:bookingId/paypal-order` riceve soltanto
`{ token }`. La risposta contiene ID prenotazione, ID ordine PayPal, importo
in centesimi, valuta EUR e la scadenza originale del checkout.

Il percorso riguarda per ora le campagne con checkout immediato: campagna attiva,
acconto configurato, approvazione disattivata e una riserva server valida.
Non cattura il pagamento, non crea la prenotazione definitiva, non invia email.

Le creazioni pubbliche via `/api/booking/create` e `/api/booking/v2/create`
rifiutano queste campagne con `CHECKOUT_REQUIRED`, senza lasciare richieste
permanenti. L'errore non viene presentato come un orario occupato. La creazione
manuale autenticata dell'admin e il percorso con approvazione restano distinti.

## Valori e associazioni

- Il prezzo è lo snapshot della riserva. Prima di aprire PayPal viene verificato
  che coincida ancora con l'importo della campagna; un cambiamento richiede un
  nuovo checkout, non un addebito modificato tacitamente.
- Gli ID interni PayPal sono `booking:<bookingId>`; la fattura è
  `BOOKING-<bookingId>`, separata dagli ordini dello shop stampe.
- Il server rilegge l'ordine da PayPal e verifica ID, riferimenti, fattura,
  stato non incassato, valuta, importo ed eventuale merchant configurato.
- `bookingPayPalOrders/<paypalOrderId>` conserva l'associazione privata verificata.
  Anche la riserva conserva il riferimento PayPal, senza cambiare la scadenza.
- Gli accessi diretti dei client a questa associazione sono negati dalle regole.

## Idempotenza e risposte tardive

- Una breve lease transazionale impedisce creazioni simultanee. Una seconda
  richiesta riceve `PAYPAL_ORDER_CREATING`; dopo il successo riusa lo stesso ID.
- La chiave PayPal è deterministica per la riserva e distinta da quella dello
  shop. Un timeout ambiguo mantiene la stessa chiave per il retry; non rilascia
  automaticamente lo slot e non inventa un nuovo ordine.
- Il fingerprint dell'account impedisce di riprendere un checkout con credenziali
  di un account o ambiente differente.
- Se PayPal risponde dopo scadenza o annullamento, l'associazione viene conservata
  per riconciliazione ma non è restituita come checkout utilizzabile.
- Una risposta lenta duplicata non sovrascrive successivi stati finanziari.

## Cattura e prossime integrazioni

La cattura verificata e la registrazione atomica sono descritte in
`docs/booking-deposit-payments.md`. Verificano l'associazione e lo snapshot
monetario prima di registrare incassi, consumare la riserva e confermare.
Il flusso con pagamento dopo approvazione richiede la propria autorizzazione
temporanea; non deve aggirare i controlli del checkout immediato.
