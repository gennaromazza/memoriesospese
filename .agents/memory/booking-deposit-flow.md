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

**Why:** il denaro già incassato non viene annullato dal fallimento di un
servizio esterno; trattare la sincronizzazione come una creazione reversibile
può perdere una prenotazione pur conservando il pagamento.

**How to apply:** confermare e registrare atomicamente il pagamento; eseguire
successivamente sincronizzazione e comunicazioni idempotenti. Distinguere
sempre incasso ricevuto da slot confermato nei casi tardivi o da riconciliare.
