# Scadenze dei pagamenti delle prenotazioni

- Il checkout immediato conserva i dieci minuti originali. Letture, reload,
  retry e ordini PayPal non rinnovano il termine.
- Il percorso dopo approvazione usa `depositPaymentRequest` nella prenotazione:
  `status`, `amountCents`, `currency`, `requestedAt`, `expiresAt`.
  `createApprovedDepositRequest` prepara un'ora effettiva, anche al cambio
  dell'ora legale; rifiuta shooting distanti un'ora o meno.
- Il termine effettivo non può superare `requestedAt + 1 ora`, anche se un
  valore salvato erroneamente fosse più lungo. Date mancanti o incoerenti
  non liberano arbitrariamente gli slot.
- L'azione di approvazione con email sarà integrata nel passaggio dedicato:
  deve riutilizzare una richiesta già creata, non ricostruirla a ogni retry.
  Deve copiare il termine originario nell'eventuale hold PayPal associato.
  Prima dell'incasso non deve creare l'evento Google Calendar né mandare
  la conferma finale: un evento esterno prematuro terrebbe lo slot occupato.

## Disponibilità e manutenzione

Le letture delle disponibilità booking/consulenze e le transazioni che
riservano gli slot ignorano subito le richieste non pagate scadute, al limite
`adesso >= scadenza`, anche se la manutenzione non è ancora passata.

Un worker ogni minuto chiude le riserve abbandonate e marca `expired` le
richieste dovute, annullando solo prenotazioni ancora in attesa/confermate
senza incasso confermato. Non elimina documenti o transazioni finanziarie.
Le pagine limitate e i cursori per ID evitano scansioni della cronologia e
non richiedono nuovi indici compositi. Il cursore avanza anche oltre pagine
ancora valide; dopo l'ultima pagina riparte dall'inizio.

Le transazioni rileggono lo stato prima di modificare: sweep simultanei,
retry e incassi concorrenti non possono annullare un pagamento già registrato.
Le prenotazioni legacy senza richiesta esplicita non vengono modificate.
Non è una scadenza generale delle richieste di approvazione ancora non inviate.
Le due azioni amministrative di approvazione non possono saltare un acconto
pendente o riaprire una richiesta scaduta, nemmeno prima del passaggio del
worker. Un retry non rinnova il tempo concesso.

## Denaro tardivo

Un ordine non pagato scaduto non può avviare una nuova cattura. Se PayPal
ha già incassato, si registra invece il denaro una sola volta con
`paid_action_required` e `paymentReviewRequired`, senza confermare il posto,
anche se risulta ancora libero. Un altro cliente già assegnato resta intatto.
Le commissioni e l'incasso restano in cassa. Nessun rimborso, email o
riassegnazione automatica viene eseguito dalla manutenzione.
