---
name: Acconto per prenotazioni shooting
description: Impostazioni per campagna su approvazione admin e acconto, con conferma cliente.
---

Le campagne devono poter configurare separatamente se richiedono approvazione admin e se richiedono un acconto. Se serve l'acconto, l'amministratore sceglie direttamente nella campagna l'importo fisso da richiedere. Se servono sia approvazione sia acconto, il cliente invia la richiesta, l'admin approva e riceve una richiesta PayPal con un'ora di scadenza; il pagamento riuscito finalizza la prenotazione, mentre la scadenza libera lo slot. Se l'approvazione è disattivata ma l'acconto è attivo, il pagamento PayPal parte subito dopo la scelta dello slot: non si invia una richiesta differita di un'ora; si tiene lo slot solo mentre il checkout è in corso e il pagamento riuscito conferma la prenotazione. Se l'acconto è disattivato, non si avvia PayPal e vale il percorso di approvazione selezionato per quella campagna.

La mail di conferma finale contiene sempre il link personale sicuro per gestire la prenotazione e il collegamento al calendario; il cliente non deve creare un account con password.

**Why:** alcune campagne richiedono approvazione e/o acconto e altre no; le regole devono essere selezionabili per campagna senza cambiare il comportamento globale.

**How to apply:** mantenere indipendenti le due impostazioni nel pannello admin e applicarle lato server; salvare per campagna l'importo fisso deciso dall'admin. La finestra di un'ora vale solo per l'acconto richiesto dopo approvazione; il checkout immediato ha un hold breve limitato alla sessione di pagamento. Gestire esplicitamente scadenze, slot liberati e catture PayPal tardive. Inviare il link di gestione solo nell'email di conferma finale.

## Limiti e condizioni approvati

Il titolare ha confermato: checkout di 10 minuti senza rinnovo al refresh;
attesa approvazione massima di 24 ore, mai oltre lo shooting; un solo cambio
autonomo nella stessa campagna fino a 24 ore prima, conservando l'acconto.
Annullare non significa rimborsare: i movimenti richiedono conferma admin.
Un incasso tardivo non assegna lo slot neppure se libero. Scegliere i prodotti
in studio non esonera dall'acconto. Le campagne legacy mantengono approvazione
attiva e acconto disattivato, senza modificare prenotazioni esistenti.

**Why:** il titolare ha approvato esplicitamente questi limiti prima
dell'implementazione; non sono decisioni da reinventare nei singoli task.

**How to apply:** consultare `docs/booking-deposit-policy.md` per la matrice
completa, i confini temporali e i casi eccezionali, inclusa la gestione diretta
dello studio quando manca un'ora o meno allo shooting.

## Creazione protetta degli slot

I form pubblici possono restare anonimi, ma tutte le creazioni di prenotazioni
devono passare dal server. Non riaprire la creazione diretta dai client per
compatibilità con una schermata amministrativa.

**Why:** una transazione che riserva correttamente uno slot è comunque
aggirabile se le regole del database consentono di creare prenotazioni
direttamente. La protezione va verificata anche sul percorso Web SDK.

**How to apply:** quando si modificano hold o prenotazioni, controllare sia
le corse delle API sia le regole client; adattare eventuali form legacy al
percorso server protetto, mantenendo separati i permessi di lettura e gestione.

## Incassi separati dai servizi esterni

Dopo un incasso verificato si usa lo snapshot monetario concordato, non il
listino corrente della campagna. Errori di Calendar o email non autorizzano
la cancellazione della prenotazione pagata, la riapertura dello slot o
l'eliminazione dei movimenti: serve un retry separato.

Una richiesta di acconto già approvata congela importo e scadenza anche
prima dell'incasso: modificare la campagna o ripetere l'approvazione non
deve cambiare quanto promesso al cliente né concedere un'altra ora.

**Why:** il denaro già incassato non viene annullato dal fallimento di un
servizio esterno; trattare la sincronizzazione come una creazione reversibile
può perdere una prenotazione pur conservando il pagamento.

**How to apply:** confermare e registrare atomicamente il pagamento; eseguire
successivamente sincronizzazione e comunicazioni idempotenti. Distinguere
sempre incasso ricevuto da slot confermato nei casi tardivi o da riconciliare.

La verifica dell'esito dopo un errore di rete o un reload deve leggere
l'ordine del provider, non avviare un incasso come controllo.

**Why:** un ordine autorizzato può essere ancora non incassato; usare la
cattura per un pulsante “verifica” può addebitare senza una nuova intenzione
esplicita del cliente. Un'altra scheda non deve liberare prematuramente
un tentativo dall'esito incerto.

**How to apply:** separare verifica e cattura. Conservare la possibilità di
riconciliare gli incassi effettivi, con il termine originario invariato.

## Scadenze senza effetti retroattivi

Applicare la scadenza di pagamento solo a una richiesta esplicitamente
registrata sul server. Non ricostruirla dalla configurazione attuale della
campagna per le prenotazioni storiche.

**Why:** modificare oggi una campagna non deve annullare appuntamenti presi
prima dell'introduzione degli acconti né interpretare vecchi importi come
richieste di pagamento ancora aperte.

**How to apply:** mantenere separati scadenza del checkout, ora dopo
approvazione e attesa di approvazione. Le letture liberano subito gli slot
scaduti anche se la manutenzione è in ritardo; la manutenzione non rimuove
incassi verificati o eventi storici.

## Email di acconto dall'esito incerto

Una richiesta di pagamento è una comunicazione operativa, non una campagna
marketing. Se il provider non garantisce che l'invio sia stato rifiutato,
non autorizzare un altro invio automatico: mantenere la richiesta originale
e chiedere una verifica della Posta inviata.

**Why:** un timeout può arrivare dopo che l'email è stata spedita. Ripetere
alla cieca confonde il cliente e può far sembrare rinnovata l'ora di pagamento.

**How to apply:** distinguere rifiuti certi da esiti sconosciuti; i retry
espliciti conservano importo, link e termine originari. Un problema tecnico
non deve generare una nuova richiesta né rimettere in gioco uno slot scaduto.

## Visibilità admin senza conferme artificiali

Un checkout immediato non ancora pagato deve essere visibile all'admin come
blocco temporaneo, senza creare una prenotazione confermata per poterlo elencare.

**Why:** anticipare il documento definitivo cambia le condizioni con cui
l'incasso può confermare lo slot e rischia di confondere pagamenti e disponibilità.

**How to apply:** separare nel pannello i checkout non conclusi dalle prenotazioni
reali; deduplicare per identità quando l'incasso crea la prenotazione. Non
ripetere scansioni periodiche di tutte le prenotazioni per aggiornare un pagamento:
preferire notifiche in tempo reale e verifiche mirate. Il refresh manuale non
deve sovrascrivere un evento di pagamento più recente ricevuto durante la lettura.

## Link personali e destinatari delle conferme

Il link del portale è distinto dal token di pagamento e si emette solo dopo la
conferma effettiva. I retry conservano il link attivo e non annullano mai una
revoca esplicita. L’autorizzazione a leggere il portale non autorizza da sola
riprogrammazioni o annullamenti: ogni azione deve verificare stato e termini.

**Why:** il cliente deve poter vedere anche l’esito di un annullamento, senza
acquisire il diritto di cambiare ancora una prenotazione chiusa. Un cambio del
cliente o la ricreazione di un documento non deve trasferire il vecchio accesso.

**How to apply:** vincolare l’accesso all’identità della prenotazione e al
destinatario. Prima di generare il link per un’email, confrontare il destinatario
effettivo con l’anagrafica riletta: altrimenti un vecchio snapshot può spedire al
vecchio indirizzo il token appena generato per il nuovo cliente. Rimuovere il
frammento riservato dall’URL prima dell’analisi delle visite e costruire risposte
pubbliche esplicite, senza serializzare note interne o dati amministrativi.
