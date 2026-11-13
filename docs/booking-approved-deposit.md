# Acconto dopo l'approvazione dello studio

Le campagne con acconto e approvazione mantengono la richiesta in `in_attesa`.
L'approvazione amministrativa crea una richiesta di pagamento esplicita e una
prenotazione privata dello slot per un'ora. Non crea un evento definitivo,
non invia la conferma finale e non registra un incasso.

## Flusso

1. Il cliente invia la richiesta senza pagare.
2. L'admin approva. Disponibilità, campagna, importo e configurazione PayPal
   vengono verificati prima di creare la richiesta.
3. Il cliente riceve un'email operativa Gmail con importo, appuntamento,
   scadenza assoluta in Europe/Rome e link personale.
4. Il link apre direttamente il pagamento, senza compilare nuovamente i dati.
   L'importo viene sempre dal server; una variazione successiva del listino
   non cambia la richiesta già approvata.
5. Solo la cattura PayPal verificata conferma la prenotazione e registra
   incasso/commissioni con lo stesso registro idempotente del pagamento immediato.
   Un acconto già registrato manualmente o una ricevuta già presente blocca
   una nuova cattura e richiede verifica, invece di addebitare ancora.
6. La scadenza libera logicamente lo slot anche senza attendere il worker.
   Il worker chiude i documenti scaduti. Un incasso tardivo viene conservato
   e segnalato da verificare, senza riassegnare un orario ormai libero.

La sincronizzazione finale Calendar e l'invio della conferma finale dopo
l'incasso rimangono affidati al successivo completamento del flusso:
questa modifica non richiama il vecchio helper che può cancellare una
prenotazione se l'email o Calendar falliscono.

## Link e sicurezza

- `/prenota/acconto/:bookingId#token` sul dominio pubblico verificato.
- Il token non passa nella query URL. Prima di caricare App/Analytics viene
  spostato in memoria/sessione e rimosso dal frammento.
- Il server verifica l'hash del token. Non esiste un endpoint pubblico che
  trasformi un hold immediato in una richiesta approvata.
- Il token è derivabile solo lato server dalla chiave `SESSION_SECRET`
  (almeno 32 caratteri) e da un nonce privato. Nessun nuovo segreto è richiesto.
- La rotazione della chiave non rigenera link o scadenze: gli originali già
  spediti continuano a essere validati dal loro hash, ma un reinvio bloccato
  dalla nuova chiave richiede assistenza.
- La route è registrata anche nel server produzione ed esclusa dall'indicizzazione.
- Un link già pagato mostra la ricevuta: verificare non esegue una nuova cattura.

## Retry e invio email

L'invio usa una presa in carico transazionale. Approvazioni ripetute o
concorrenti non rinnovano l'ora, non cambiano l'importo e non duplicano l'email.
Un rifiuto certo 400/401/403/404/413/422/429 può essere ritentato esplicitamente,
entro la scadenza originaria, fino a tre tentativi.

Timeout, errori ambigui e una presa in carico abbandonata diventano `unknown`:
non autorizzano un nuovo invio automatico. Verificare prima la Posta inviata.
Le email dichiarano che la prenotazione non è confermata, che sono automatiche
e mostrano i recapiti dello studio.

Annullare la finestra PayPal non annulla la prenotazione approvata né libera
anticipatamente lo slot. Le cancellazioni cliente e i rimborsi sono fuori
da questa modifica. Le campagne senza acconto conservano il flusso precedente;
quelle senza approvazione conservano il pagamento immediato di dieci minuti.

## Verifica senza dati reali

Test in memoria con PayPal/Gmail/Calendar simulati:

- richiesta, un'ora fissa, retry noto e ambiguo, invio concorrente, scadenza;
- esclusione della sola prenotazione corrente e conflitti fra campagne;
- cattura della richiesta approvata, importo congelato, incasso tardivo;
- protezione contro conferma/ripristino manuale di richieste non pagate/scadute;
- apertura del link in StrictMode, annullamento/errore SDK, ricevuta al reload;
- route privata raggiungibile con il server produzione e header noindex.

Nessuna email, cattura PayPal, prenotazione o fixture viene creata nel database
reale durante questi test. Non pubblicare l'intero flusso finché i task
successivi e la verifica completa non sono conclusi.
