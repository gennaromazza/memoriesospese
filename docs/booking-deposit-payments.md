# Cattura degli acconti e registrazione finanziaria

## Contratto

`POST /api/booking/v2/checkout-holds/:bookingId/paypal-capture` accetta solo
`{ token }`. L'ID PayPal, importo e valuta provengono dall'associazione privata
creata dal server. La risposta distingue `paid` da `paid_action_required`
e include `bookingConfirmed`: un incasso non implica sempre uno slot confermato.

Il server rilegge sempre PayPal prima di un nuovo tentativo di cattura e dopo
la richiesta di incasso. Verifica ordine, riferimenti, fattura, merchant quando
configurato, unica cattura completata, importo EUR e corrispondenza allo snapshot.
Le impostazioni attuali della campagna non rivalutano un pagamento già preparato.

Un timeout non autorizza un nuovo ordine o una nuova chiave di cattura. Le richieste
concorrenti usano una lease e una chiave deterministica; una risposta persa viene
riconciliata leggendo lo stesso ordine dal provider.

## Una sola scrittura finanziaria

La transazione Firestore registra insieme:
- `bookingPaymentCaptures`: identificativo univoco della cattura;
- acconto PayPal nella riserva, nell'associazione e nella prenotazione confermata;
- unica riga `transactions` con l'importo lordo in euro;
- `cashMovements`: entrata lorda e, se disponibile, uscita separata per la commissione.

Gli ID dei movimenti sono deterministici per cattura. Le commissioni mancanti
restano **sconosciute**, non diventano zero. Un webhook successivo può aggiungere
la commissione una sola volta, anche quando la cattura era già stata registrata.
La dashboard finanziaria usa gli stessi riferimenti `bookingId`/`origineRef`
per non contare nuovamente il pagamento presente nella prenotazione.

La conferma controlla nuovamente il possesso dello slot con i guard condivisi,
escludendo solo la propria riserva. Riserva consumata e prenotazione confermata
sono scritte nella stessa transazione. Una cattura fuori tempo, annullata o con
slot occupato registra comunque il denaro, ma resta `paid_action_required` senza
creare o sovrascrivere una prenotazione.

## Webhook già configurati

È disponibile `/api/booking/paypal/webhook`. Non serve però spostare i webhook
già usati da shop, stampe o gift card: dopo aver verificato la firma con il proprio
webhook ID, questi percorsi inoltrano le catture associate alle prenotazioni al
medesimo registro. Gli eventi non relativi alle prenotazioni restano nel percorso
originale. Un ordine di prenotazione non ancora associato richiede retry, non viene
riconosciuto come elaborato ignorando l'incasso.

Nessun campo browser o webhook non verificato conferma direttamente un pagamento.

## Confine con le prossime integrazioni

Questa operazione non invia email, non rimborsa e non chiama Google Calendar.
La prenotazione pagata ha `calendarSyncPending: true` ed email ancora non inviate.
Il prossimo collegamento del checkout deve completare la sincronizzazione Calendar
e il percorso di comunicazione senza rifare l'incasso.

**Non usare `confirmPublicBooking` per le prenotazioni già pagate**: il suo rollback
può eliminare una prenotazione se Calendar fallisce. Dopo un incasso verificato,
errori di Calendar/email richiedono un retry dedicato, mai la cancellazione della
prenotazione o la riapertura dello slot. La disponibilità rimane protetta dal
documento confermato in Firestore anche se il calendario esterno non è aggiornato.
