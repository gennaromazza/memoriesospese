# Checkout pubblico con acconto

PayPal viene mostrato dopo il modulo solo se la campagna richiede acconto
e non richiede approvazione. Gli altri tre percorsi usano la creazione
ordinaria; scegliere i prodotti in studio non evita l'acconto.

L'importo del modulo è informativo. La schermata PayPal usa lo snapshot
restituito dal server; ordine e cattura ricevono soltanto ID del checkout e
token proprietario, mai importi o ID PayPal scelti dal browser.

## Stato e sicurezza del cliente

- I pulsanti riusano lo SDK già usato da gift card e shop.
- Un checkout per campagna viene ripreso da sessionStorage; si conservano
  solo credenziali opache e il flag di tentativo, non dati anagrafici.
  Il token non compare negli URL o negli eventi analytics.
- Il timer usa durata e orario server con tempo monotono locale, non un
  nuovo termine a ogni reload. React StrictMode non crea due riserve.
- Dopo un reload, la ricevuta può essere letta anche se PayPal è stato
  disattivato. Date e importi visualizzati provengono dal server. Le sue
  credenziali restano nella sessione anche dopo il successo; solo la scelta
  esplicita “Prenota un altro appuntamento” riapre il modulo.
- La verifica dell'esito legge PayPal e può riconciliare una cattura già
  completata, ma non chiama mai l'operazione di incasso. Non usare la cattura
  come generico pulsante di controllo.
- Annullamento ed errori prima dell'incasso verificano e rilasciano la
  riserva, conservando in memoria il modulo. Errori di rete durante una
  cattura producono invece “esito da verificare”: niente secondo pagamento,
  né promesse che il denaro non sia stato addebitato.
- Un'altra scheda non può annullare un tentativo di cattura ancora da
  verificare. Il blocco resta comunque soggetto al termine originale.
- Incassi tardivi o senza prenotazione confermata mostrano richiesta di
  verifica con riferimento, non una conferma falsa o un nuovo checkout.

Le campagne con acconto non ignorano una gift card già applicata: il flusso
spiega di contattare lo studio prima di pagare. Non sono stati introdotti
usi combinati di credito gift card e acconto PayPal.

## Confini dei passaggi successivi

Le comunicazioni finali con link personale e la sincronizzazione Calendar
dei nuovi incassi devono seguire il percorso idempotente, senza rollback
del pagamento, descritto in booking-deposit-payments.md. Questa schermata
non dichiara già inviata un'email che il server non ha ancora spedito.
La richiesta di acconto dopo approvazione resta nel passaggio dedicato.
