# Audit dello shop "Shopping online Natale 2026"

Data: 12 ottobre 2026. Ramo `claude/holiday-gifts-page-ae4521`, unito a `b8b9488c` di Replit.

Questo audit è stato fatto leggendo il codice come farebbe chi vuole romperlo, non rileggendo i test scritti insieme al codice. Chi lo ha scritto è lo stesso che lo ha controllato: dove un parere indipendente conta (soldi, legale, fiscale) lo dico.

## 1. Esito in breve

**Non ho trovato difetti che permettano di rubare soldi, vedere ordini o foto di altri, o incassare senza registrare.** I punti che contano sono tutti dalla parte giusta: i prezzi li decide il server, un incasso si registra una sola volta, ogni cliente vede solo i suoi ordini, il caricamento delle foto è controllato, la vetrina nasce spenta.

Ho trovato **3 difetti precisi e li ho corretti** (sezione 3), **6 punti da decidere** (sezione 4, i primi 5 contano prima di aprire al pubblico) e una serie di limiti minori.

**Si può allineare Replit al ramo.** Dopo l'allineamento lo shop resta invisibile finché non lo accendi dal pannello (vetrina spenta, nessun link nel menu, pagina non indicizzata). Lo shop si apre al pubblico solo dopo i punti 4.1-4.5 e il collaudo della checklist.

## 2. Come ho lavorato

**Letto per intero:** pagamenti (`payments.ts`), rotte (`router.ts`), foto (`uploads.ts`), azioni dello studio (`admin.ts`), email (`mail.ts`, `mail-templates.ts`), creazione ordine, regole Firestore, collegamento con cassa, finanza, notifiche e CRM, pagine di checkout e impostazioni, build.

**Provato:**
- Controllo dei tipi su server e sito.
- Suite complete: server 1266 test passati, sito 296 passati. Le suite che falliscono sono quelle già rotte prima del mio lavoro (sezione 5).
- **Compilazione di produzione** di server e sito: riescono, e le pagine dello shop sono nel pacchetto.
- Nessuna dipendenza nuova e lockfile intatto (l'installazione su Replit non cambia).
- Ricerca di credenziali nel mio lavoro: nessuna.

**Esaminato dal lato avversario:** prezzi manipolati, ordini di altri, campi extra nelle richieste, pagamento di un ordine altrui, cattura PayPal manomessa, webhook senza firma, file travestiti da JPEG, nomi di file ostili, HTML nelle email.

## 3. Difetti corretti in questo audit

| # | Gravità | Problema | Correzione |
|---|---------|----------|------------|
| C1 | Media (obbligo di legge) | Il checkout dello shop non controllava che i dati del venditore (nome, P. IVA, sede, contatti) fossero completi. Quello delle stampe invece sì. Il Codice del Consumo chiede di mostrarli prima dell'acquisto. | Il pagamento resta bloccato finché i dati non sono completi, come per le stampe. Test aggiunto. |
| C2 | Media (costi) | Il catalogo pubblico non ha accesso né limiti: ogni richiesta faceva letture su Firestore, quindi chiunque poteva far salire i costi con richieste ripetute. | Cache di 30 secondi, azzerata quando salvi le impostazioni, con una sola lettura anche per richieste simultanee. I prezzi degli ordini restano calcolati sui dati freschi. 4 test aggiunti. |
| C3 | Bassa | Se annullavi un ordine dopo un rimborso parziale, il resto da rimborsare non veniva segnalato. | `refundPending` ora considera quanto resta da rimborsare. 2 test aggiunti. |

## 4. Da decidere

Ordinati per importanza. I punti 4.1-4.5 vanno chiusi prima di aprire al pubblico.

### 4.1 Account con email non verificata (ereditato dalle stampe) · Media
Il sito non ha nessun flusso di verifica dell'email: gli account con password non sono mai verificati, e il server li accetta. Lo shop si fida di quell'email per due cose: spedire le email dell'ordine e collegare l'ordine alla scheda cliente con la stessa email.
- **Rischio:** qualcuno può registrarsi con l'email di un altro e comprare; le conferme arrivano a quell'indirizzo, e se la scheda è nata da un ordine dello shop o delle stampe i suoi dati (nome, telefono, indirizzo, codice fiscale) vengono sovrascritti.
- **Impatto reale:** basso per un negozio piccolo, perché serve pagare un ordine vero. Non c'è accesso ai dati di altri.
- **Soluzione:** richiedere l'email verificata prima del pagamento (serve costruire il flusso di verifica) oppure non collegare le schede per email se non è verificata.

### 4.2 L'identità amministratore non controlla `email_verified` (ereditato) · Media
Le regole Firestore e il server riconoscono l'amministratore dal solo indirizzo email, mentre il commento nel codice dice "email verificata". Vale per tutta la piattaforma, non solo per lo shop. In pratica Firebase impedisce di aprire un secondo account con la stessa email di un account Google già esistente, e la passkey che Replit ha appena aggiunto protegge l'account amministratore.
- **Soluzione:** aggiungere il controllo nelle regole e in `requireAdmin`. Non l'ho fatto: se l'email del tuo account non risultasse verificata nel token ti chiuderebbe fuori dal pannello. Va provato prima su Replit.

### 4.3 Invio massivo di email e schede dello shop · Media (privacy)
Ogni cliente che paga diventa una scheda nel gestionale (etichetta `shop-online`). L'invio massivo di email seleziona i destinatari per anno, tipo di lavoro e preventivi non firmati, **senza controllare un consenso al marketing**. Una campagna "clienti dell'anno" includerebbe chi ha comprato un regalo e non ha mai accettato comunicazioni promozionali. La privacy policy dice che le promozioni si basano sul consenso.
- **Soluzione:** escludere dall'invio massivo le schede con etichetta `shop-online` (o con origine shop/stampe), oppure aggiungere un campo di consenso. È una scelta tua e del consulente.

### 4.4 La manutenzione gira dentro il server · Media (da verificare)
Promemoria foto, riprova delle email, pulizia delle foto e segnalazione dei ritardi partono ogni ora dal server stesso. Se la pubblicazione su Replit si spegne quando non c'è traffico (tipo "Autoscale"), quei lavori non partono. Con una macchina sempre accesa (tipo "Reserved VM") è tutto a posto. In alternativa c'è già la rotta `/api/shop/internal/maintenance` con token, da chiamare da un pianificatore esterno.
- **Da fare:** controlla il tipo di pubblicazione su Replit.

### 4.5 Regole Firestore non provate in questo ambiente · Media (da verificare)
Le regole nuove (ordini dello shop scrivibili solo dal server, `settings/shop` non scrivibile dal browser) sono corrette alla lettura, ma i test che le eseguono richiedono l'emulatore Firestore, che qui non è disponibile. Quelle suite risultano non eseguite.
- **Da fare:** farle girare con l'emulatore prima di pubblicare le regole, oppure pubblicarle e controllare a mano le tre cose della checklist (A1).

### 4.6 Limiti minori (bassa gravità, nessuna azione urgente)
| Area | Cosa |
|------|------|
| Pagamento | Se arriva un incasso firmato da PayPal che non corrisponde all'ordine (importo diverso, evento fuori percorso), il server risponde con errore e PayPal riprova poi smette; nessun avviso allo studio. È raro, perché la cattura la fa il server stesso e l'ordine è bloccato durante la cattura. Controlla ogni tanto PayPal contro la Cassa. |
| Pagamento | Se il server si ferma proprio durante una cattura, l'ordine resta non modificabile finché il cliente non riprova a pagare. |
| Foto | Un file caricato più grande di quanto dichiarato resta sul bucket fino alla pulizia (entro 24 ore). Serve un account per farlo. |
| Foto | Lo zip delle foto di un ordine si costruisce in memoria: con centinaia di foto grandi potrebbe pesare. Gli ordini normali sono piccoli. |
| Ordini | Il limite di bozze attive per cliente non è atomico: richieste simultanee possono superarlo di poco. |
| Dati | Lo storico degli eventi PayPal ha una data di scadenza ma serve una regola di scadenza (TTL) su Firestore per usarla. Volume trascurabile. |
| Carico | La manutenzione e l'elenco ordini leggono tutti gli ordini shop: va bene per una stagione, poi conviene archiviare. |
| Spedizione | Il telefono del cliente non è obbligatorio, nemmeno per spedire; il corriere di solito lo vuole. |
| Sito | Il carrello sta nel browser: su un computer condiviso resta al prossimo utente. |

## 5. Cosa non ho potuto verificare

- **Pagamenti veri con PayPal**: solo con finti. Serve il collaudo sandbox della checklist e una prova reale rimborsata.
- **Regole Firestore con l'emulatore** (vedi 4.5).
- **Consegna delle email** (spam, limiti di Gmail): il codice le prepara e le invia, non so come le trattano le caselle dei clienti.
- **Pannello nel browser**: ho provato la logica con test e la compilazione, non un clic reale nelle schermate nuove (fasce di peso, condizioni, checkout).
- **Aspetti legali e fiscali**: testi e fatturazione vanno rivisti da chi di competenza.
- **Suite che falliscono già prima del mio lavoro** (identiche sul commit di Replit): `consultation-rejected-email`, `print-shop/auth`, `mockup-catalog-assets`, `print-shop/deployment-config` (server) e le due che richiedono l'emulatore (sito). Nessuna riguarda lo shop.

## 6. Ciò che è risultato corretto

- Prezzi, sconti, spedizione e peso li calcola solo il server; il cliente manda solo prodotto e quantità. Prima del pagamento si ricalcola tutto sul catalogo fresco e si confronta con quanto visto dal cliente.
- Importo, valuta, ordine PayPal, riferimento e venditore della cattura vengono verificati prima di registrare l'incasso.
- Un incasso si registra una sola volta anche con conferma del browser e webhook insieme, ripetizioni e risposte perse; il movimento in Cassa ha un identificativo fisso.
- Rimborsi: totale e parziale, ripetuti senza doppio conto, storno in Cassa e nel ricavo cliente; ordini già spediti segnalati senza annullarli.
- Il webhook senza identificativo configurato rifiuta tutto, non lo salta.
- Ogni rotta del cliente controlla la proprietà dell'ordine; le rotte dello studio richiedono l'amministratore e, quando è attiva, la verifica con passkey.
- Foto: solo JPEG, controllati per firma, dimensione e pixel; nome file sanitizzato; anteprime e originali raggiungibili solo dal proprietario o dallo studio.
- Email: ogni dato del cliente è passato per l'escape HTML; ogni email parte una volta e si riprova se fallisce.
- Le raccolte nuove non hanno regole e quindi sono chiuse al browser; gli ordini sono leggibili solo dall'amministratore.
- Nessun punto d'ingresso per script nelle pagine dello shop.
- Le pulizie di stampe e shop non si toccano a vicenda (test nei due sensi).
- Il testo delle condizioni e il comportamento coincidono (giorni di conservazione e recesso vengono dalle stesse costanti).

## 7. Sequenza consigliata per allineare Replit

1. **Rivedi i file di Replit entrati con l'unione** (`.agents/memory`, 43 file, e `.migration-backup`) prima di spingere: non li ho aperti perché potrebbero contenere credenziali, e uno ha un nome che lo suggerisce. Se lo sono, vanno tolti dal repository prima del push.
2. **Fai un unico push del ramo** `claude/holiday-gifts-page-ae4521` (il push lo fai tu, come d'accordo).
3. **Su Replit**: aggiorna con un'unione che sia un semplice avanzamento (`git merge --ff-only`). Il commit `acda06f1` ("Published your App") ha lo stesso contenuto di `b8b9488c`, quindi non c'è lavoro da perdere; ma non è nel mio ramo, perciò l'avanzamento semplice funziona solo se unisco prima quel commit vuoto. Posso farlo se vuoi.
4. **Nessuna installazione di pacchetti** e nessun cambiamento ai pacchetti: basta riavviare.
5. **Non pubblicare le regole Firestore insieme al codice**: aspetta di aver letto 4.5. Le regole agiscono subito in produzione.
6. **Lascia lo shop spento** finché non chiudi 4.1-4.5 e il collaudo (`docs/checklist-collaudo-shop-natale-2026.md`).

In sintesi: l'allineamento in sé è sicuro e reversibile; l'apertura al pubblico è un passo separato.
