# Istruzioni per Codex

Questo file definisce le regole operative che Codex deve seguire quando lavora su questa repository.

## Contesto della piattaforma

- L'intera applicazione è una piattaforma complessa, cresciuta passo dopo passo nel tempo.
- Una parte significativa del codice è stata realizzata quando gli strumenti di intelligenza artificiale erano meno maturi di oggi: non assumere che una soluzione apparentemente semplice sia isolata o priva di dipendenze implicite.
- Procedi con particolare cautela: studia il flusso completo, i dati coinvolti, le integrazioni e gli effetti sulle altre sezioni prima di intervenire.
- Durante ogni intervento, cerca codice morto, duplicazioni, percorsi obsoleti, incoerenze e debito tecnico. Segnalali con evidenze e rimuovili o correggili solo se l'intervento è sicuro e coerente con la richiesta.

## Hosting e fonte di verità

- La piattaforma è ospitata e pubblicata tramite Replit.
- GitHub è la fonte di verità per il codice versionato; Replit è la fonte di verità per il deployment e il comportamento dell'applicazione pubblicata; Firebase è la fonte di verità per dati, autenticazione, Firestore, Storage e relative regole.
- Per verificare lo stato effettivo della piattaforma, considera sia il repository remoto sia l'applicazione pubblicata su Replit.
- Non considerare conclusa una modifica finché non è coerente con l'ambiente Replit e con le configurazioni di build, avvio e deployment del progetto.
- La repository contiene anche configurazioni Firebase Hosting: prima di modificare `firebase.json`, `.replit`, workflow, build o deployment, identifica quale ambiente e quale percorso di pubblicazione siano realmente interessati.

## Sicurezza, dati e configurazione

- Non esporre, stampare nei log, committare o inserire nel codice segreti, token, password, chiavi API, credenziali SMTP, configurazioni Firebase riservate o dati personali reali.
- Non modificare, eliminare o sovrascrivere dati reali, regole Firestore/Storage, configurazioni di autenticazione o risorse esterne senza autorizzazione esplicita dell'utente e una procedura di ripristino chiara.
- Prima di intervenire su autenticazione, autorizzazioni, Firestore, Storage, email, fatture, pagamenti o dati dei clienti, valuta i permessi coinvolti, i dati storici e le conseguenze sulla privacy.
- Le variabili d'ambiente devono essere lette dalla configurazione dell'ambiente e mai sostituite con valori sensibili hard-coded.

## Compatibilità e migrazioni

- Prima di modificare o rimuovere tipi, documenti Firestore, campi, endpoint, URL, percorsi Storage, formati di file o flussi utente, verifica i dati e i client già esistenti.
- Mantieni la retrocompatibilità quando possibile; se non è possibile, prepara una migrazione, un fallback di lettura o un piano esplicito di transizione prima di rimuovere il comportamento precedente.
- Non rimuovere codice storico solo perché sembra inutilizzato: prima cerca riferimenti dinamici, dati legacy, documentazione e dipendenze esterne.

## Modifiche al codice

- Prima di modificare il codice, analizza l'implementazione esistente e le dipendenze coinvolte.
- Dopo ogni modifica locale, esegui verifiche proporzionate al cambiamento: controlli strutturali, test, type-check, build e/o avvio dell'applicazione quando disponibili.
- La verifica deve coprire non solo la correttezza strutturale del codice, ma anche la logica di business e il comportamento funzionale nella piattaforma.
- Non limitarti a verificare che il codice compili: controlla che l'esperienza e i flussi interessati funzionino come previsto.
- Effettua verifiche ripetute durante il lavoro e al termine: il debugging, la validazione dei casi limite e i controlli di regressione sono parte essenziale di ogni modifica.
- Quando una sezione viene modificata, verifica anche le sezioni, i dati e le integrazioni che dipendono da essa; non considerare sufficiente un controllo isolato del singolo file.
- Mantieni le funzionalità esistenti, salvo quando la richiesta richiede espressamente di modificarle o rimuoverle.

## API, integrazioni e test

- Per ogni endpoint, route server, Cloud Function o integrazione modificata, verifica autenticazione, autorizzazione, validazione degli input, gestione degli errori, idempotenza quando necessaria e compatibilità con il client.
- Verifica le integrazioni coinvolte dal cambiamento, incluse Firebase, Google Calendar, email, servizi di pagamento, Storage e Replit.
- Per ogni correzione di bug, aggiungi o aggiorna un test che riproduca il difetto e ne impedisca la regressione, quando tecnicamente praticabile.
- Scegli e documenta brevemente le verifiche in base al rischio: test unitari per la logica, type-check e build per l'integrazione, controlli manuali mirati per i flussi utente e le integrazioni esterne.
- Non avviare automaticamente il server: esegui solo verifiche non interattive e non avvianti disponibili, salvo istruzione esplicita dell'utente.

## Git, qualità e ripristino

- Mantieni i commit atomici: ogni commit deve rappresentare una modifica logica coerente e non includere file generati, artefatti, dipendenze o modifiche estranee se non strettamente necessari.
- Prima di ogni commit e push, esegui `git diff --check`, controlla i file inclusi e confronta la branch locale con il remoto.
- Per modifiche ad alto rischio, descrivi nel riepilogo finale l'impatto, le verifiche svolte e il modo sicuro per ripristinare il comportamento precedente.
- Non eseguire operazioni Git distruttive, riscritture della storia, migrazioni irreversibili o eliminazioni materiali senza conferma esplicita dell'utente.

## Documentazione e debito tecnico

- Aggiorna README o documentazione tecnica quando cambiano flussi, variabili d'ambiente, endpoint, regole, configurazioni, comportamenti amministrativi o procedure di deployment.
- Registra con evidenze il codice morto, le duplicazioni, i percorsi legacy e il debito tecnico individuati quando non è sicuro risolverli nel task corrente.
- Ogni documentazione deve distinguere chiaramente tra comportamento verificato, ipotesi e punti da validare nell'ambiente Replit.

## Versionamento e pubblicazione

- Ogni modifica locale completata deve essere inclusa in un commit Git descrittivo.
- Dopo le verifiche riuscite, esegui sempre il push del commit sul repository remoto, così Replit può ricevere la versione aggiornata.
- Prima del push, verifica che la branch remota sia aggiornata e che non vengano inclusi file estranei alla modifica.
- Dopo il push, verifica quando possibile che la versione pubblicata su Replit rifletta il comportamento atteso.
- I commit e i push non devono includere né attivare comandi destinati ad avviare il server o il workflow di sviluppo/produzione.
- L'avvio del server su Replit viene eseguito manualmente dall'utente: Codex non deve avviarlo automaticamente né aggiungere automatismi di avvio al solo scopo di completare una modifica.
