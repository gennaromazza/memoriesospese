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

## Spostamenti e calendario dall’esito incerto

Tenere protetti sia l’orario originale sia la destinazione finché non è
riconciliato lo spostamento Google. Consumare il cambio autonomo solo quando il
nuovo appuntamento viene registrato; un errore email successivo non lo annulla.

**Why:** Google e il database non possono confermare nella stessa transazione.
Un timeout può arrivare dopo uno spostamento riuscito: liberare la destinazione
in quel caso permette una seconda prenotazione sopra l’appuntamento reale.

**How to apply:** separare riserva, sincronizzazione idempotente e comunicazione.
Usare l’evento esistente o un’identità deterministica per un inserimento incerto.
Rilasciare riserve soltanto davanti a un rifiuto certo; dopo un tentativo di
modifica dall’esito sconosciuto privilegiare riconciliazione e verifica dello
studio, senza azzerare l’acconto né ritentare alla cieca l’invio email.

## Condizioni originali e rimborsi incerti

Applicare all'annullamento autonomo soltanto le condizioni effettivamente
mostrate e salvate nella prenotazione. Per le vecchie prenotazioni senza copia,
serve gestione dello studio, non una nuova regola retroattiva.

Non ripetere un POST di rimborso dall'esito incerto: verificare con GET e,
se necessario, mantenere un caso esplicito da controllare. Conservare sempre
l'incasso originale e contabilizzare separatamente il rimborso verificato.

**Why:** il consenso sulle condizioni non si può ricostruire dalle impostazioni
attuali; le chiavi di idempotenza PayPal hanno una conservazione limitata e
un rimborso accettato può precedere un timeout della risposta.

**How to apply:** distinguere annullamento, decisione amministrativa e denaro
effettivamente restituito. Solo una nuova conferma esplicita può riprovare una
richiesta di rimborso che certamente non è ancora arrivata al provider.

## Rifiuti server e azioni legacy

La prima creazione Calendar deve essere riconciliata prima di consentire
annullamenti o spostamenti: una risposta persa non prova che l'evento non esista.
Conservare la riserva e riutilizzare la stessa identità evento.

**Why:** liberare o spostare lo slot mentre un inserimento è ancora incerto
può lasciare un evento tardivo su una data che si crede già liberata.

**How to apply:** distinguere incasso valido, calendario riconciliato e email
inviata; non usare un cambio data come riparazione implicita della prima
sincronizzazione ancora in corso.

Quando si protegge un'azione sul server, verificare anche gli effetti precedenti
del vecchio client: notificare l'annullamento soltanto dopo il suo completamento
autoritativo e indirizzare le prenotazioni pagate alla gestione dell'acconto,
non all'eliminazione.

**Why:** un rifiuto alla DELETE non può annullare un'email già partita né
recuperare file che una cancellazione a cascata ha già rimosso.

**How to apply:** provare anche snapshot client obsoleti e rifiuti 409/500,
asserendo l'assenza di notifiche e di eliminazioni collaterali.

## Acconto come parte del prezzo e impegno

L'acconto online è una quota già pagata del servizio: deve ridurre il saldo
dell'ordine prodotti, non essere un costo aggiuntivo né un secondo incasso in cassa.
Prima della scelta degli slot, le campagne che lo richiedono devono indicarne
l'importo deciso dall'admin e spiegare che serve come impegno, per limitare
le assenze e consentire a tutti di partecipare all'evento.

**Why:** il titolare ha richiesto chiarezza prima della prenotazione e ha segnalato
che vedere zero pagato sull'ordine dopo un acconto PayPal è fuorviante.

**How to apply:** mantenere coerenti comunicazione cliente e saldo amministrativo;
distinguere pagamento immediato da link inviato dopo approvazione. Usare il
marchio PayPal ufficiale senza inventare certificazioni o garanzie.

## Conferma manuale distinta dall’approvazione

Il cambio di stato amministrativo a “Confermata” esonera dalla richiesta di acconto.
Il pulsante “Approva” resta invece il normale flusso configurato nella campagna
e può richiedere il pagamento prima della conferma.

**Why:** il titolare usa il selettore di stato per confermare direttamente gli
accordi gestiti dallo studio e non vuole che questa azione avvii un pagamento.

**How to apply:** non unificare nuovamente le due intenzioni lato client.
L’esonero non è un incasso e non autorizza a ignorare pagamenti già in corso
o incerti; gli eventuali vecchi link di pagamento devono essere disattivati.

## Recupero dopo la scadenza dell’acconto

Il recupero deve essere attivabile separatamente per ogni campagna: un invito
a riprenotare circa un’ora dopo la scadenza, senza riservare di nuovo lo slot
né riattivare il vecchio link di pagamento. Escludere chi ha pagato o
riprenotato e le campagne non più aperte.

**Why:** il titolare ha richiesto un modo per ricontattare chi non conclude
l’acconto, mantenendo il controllo sulle singole campagne.

**How to apply:** l’opzione parte spenta e vale per nuove scadenze dopo
l’attivazione, non per invii retroattivi alle prenotazioni già annullate.
Un solo invito per indirizzo email nella stessa campagna evita solleciti
duplicati da tentativi ripetuti; un esito di invio incerto non autorizza retry
automatici. Eventuali recuperi dello storico richiedono un’autorizzazione distinta.

## Avanzamento automatico del workflow

Quando viene creato il primo ordine collegato a una prenotazione in stato
“Shooting da svolgere” (o priva di stato), lo shooting passa a “Shooting
completato”. Non retrocedere mai stati già successivi come “In attesa
selezione”, “In lavorazione”, “Pronto per il ritiro” o “Consegnato”.

**Why:** per questo studio la creazione dell’ordine avviene dopo lo shooting;
lasciare la prenotazione in “Da svolgere” rende incoerenti lista e avanzamento.

**How to apply:** applicare la transizione dopo il salvataggio riuscito
dell’ordine, aggiornare prenotazione e ordine collegato, invalidare i dati
visualizzati e segnalare chiaramente se l’aggiornamento non è riuscito.
