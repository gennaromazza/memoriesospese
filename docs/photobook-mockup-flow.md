# Mappa del flusso mockup del fotolibro

## Scopo e regole di lettura

Questa mappa descrive il comportamento presente e propone una sequenza di riferimento per le prossime revisioni dell’interfaccia e i test E2E. È limitata all’assegnazione, configurazione, condivisione e revisione del mockup; non modifica il codice, le email, i permessi del link o le regole di stampa.

“Approvare l’impaginato” e “approvare il mockup” sono due decisioni diverse:

| Stato | Che cosa approva | Dove si registra | Effetto |
|---|---|---|---|
| Impaginato approvato | Le pagine interne della versione corrente | Link cliente `/fotolibro/:token`; `approval.version` | Chiude le richieste di correzione delle pagine per quella versione. Non avvia la stampa. È attualmente il prerequisito server per le modifiche del cliente al mockup e per la sua consultazione. |
| Mockup confermato dallo studio | Configurazione, materiali, foto e viste 3D di una revisione | Stato mockup `confirmed`; la conferma produce una revisione e un report | Rende disponibile l’anteprima definitiva secondo le regole di accesso esistenti. Non avvia la stampa. |
| Mockup approvato dal cliente | La revisione confermata specifica che il cliente ha visto | Link diretto `/fotolibro/:token/mockup?version=…`; `clientApproval.revision` | Registra l’approvazione di quella revisione. Non approva le pagine e non avvia la stampa. È presente nel percorso di sola lettura del mockup preparato dallo studio. |
| Fotolibro in stampa | Chiusura delle modifiche e avvio del percorso di stampa | Stato `locked` del fotolibro | Impedisce ulteriori modifiche. È un’azione amministrativa distinta dalle approvazioni. |

La versione del fotolibro e la revisione del mockup sono coordinate separate. Una nuova revisione può essere salvata e poi inviata o confermata; una nuova versione del fotolibro cambia invece la versione delle pagine a cui il mockup si riferisce.

## Percorso attuale dello studio

### 1. Gestione fotolibri e associazioni

1. Dalla scheda **Fotolibri**, lo studio vede le schede attive e l’archivio dei fotolibri mandati in stampa. Ogni scheda mostra nome, galleria/cliente, versione, conteggio pagine/versioni, approvazione, eventuali richieste pendenti e una riga di stato del mockup.
2. **Nuovo Fotolibro** apre un dialogo con nome, galleria e lavoro associato. La galleria può impostare automaticamente il lavoro; la scelta di un lavoro può selezionare automaticamente una galleria collegata. Se non esiste una galleria collegata, la scelta manuale è richiesta.
3. Un conflitto fra associazioni (galleria collegata a un altro lavoro o clienti discordanti) mostra un avviso e richiede una conferma esplicita. La conferma non modifica i collegamenti originali della galleria.
4. **Crea Fotolibro** salva associazioni e nome, imposta inizialmente `mockupPath: studio` e apre l’editor. Il modello e le pagine non sono ancora assegnati/caricati.

### 2. Editor, versioni e pagine interne

1. **Apri editor** porta a `/admin/photobooks/:id`. L’editor seleziona la bozza più recente, se presente; altrimenti la versione corrente.
2. **Carica pagine** o trascina file nell’area di caricamento per aggiungere JPEG, PNG o WebP alla versione selezionata. Il numero nel nome del file viene usato se disponibile e libero. Le pagine vengono salvate singolarmente; la pubblicazione della versione è un’azione separata.
3. **Nuova versione** crea una bozza privata e lascia visibile al cliente la versione pubblicata. **Pubblica versione e avvisa cliente** pubblica la bozza completa e avvia la notifica prevista. Questi controlli riguardano le pagine, non la conferma del mockup.
4. Il mockup è presentato fra il pannello versioni e la griglia delle pagine. Il pannello di flusso usa la versione selezionata. Una versione non corrente o un fotolibro bloccato è in sola lettura; l’avviso di versione non corrente offre **Passa alla vN**.
5. Nell’header **Copia link cliente** copia il link generale del fotolibro, non il link diretto di sola lettura del mockup.

### 3. Impostare proposta e modalità

Il pannello **Mockup dell’album** elenca quattro passi; la card non rende però il primo passo un blocco per le azioni amministrative.

1. **Pagine approvate dal cliente** mostra se la versione corrente è stata approvata. Il testo attuale dice che il mockup “si apre al cliente solo dopo”; questo descrive il limite lato cliente, non impedisce allo studio di lavorarci.
2. **Modello assegnato** mostra i modelli correnti. **Assegna modello** o **Cambia modello** apre la scheda **1 · Modello** del configuratore. La proposta deve essere associata a un lavoro; il server rifiuta il salvataggio se manca.
3. Nella scheda modello, **Configura modello fotolibro** carica i cataloghi dei laboratori solo quando il pannello viene aperto. Lo studio sceglie:
   - **Un solo modello, deciso da me** (offerta fissa); oppure
   - **Il cliente sceglie tra più modelli** (offerta a scelta).
   
   Si seleziona un modello attivo con renderer e materiali disponibili. Per il Quadrobook lo studio imposta anche larghezza/altezza e modalità copertina. Se la copertina deve usare la grafica dello studio, questa viene caricata ora, durante l’assegnazione, non dal cliente.
4. **Salva modello** o **Salva modelli proposti** pubblica l’offerta per la versione. La nuova offerta incrementa la revisione e, se esisteva un mockup salvato, conserva quello precedente nello storico e lo riporta a bozza da riverificare.
5. **Vedi in 3D** apre la scheda di revisione/anteprima del configuratore; non conferma nulla.

### 4. Scegliere chi prepara e preparare la bozza

1. In **Chi prepara la bozza?**, lo studio seleziona e salva una delle due modalità:
   - **Io preparo e confermo** (`mockupPath: studio`);
   - **Il cliente sceglie tra i modelli assegnati** (`mockupPath: client`).
   
   Il cambio di modalità non invia un’email retroattiva. La selezione è una scelta di percorso, non un’approvazione.
2. Nella modalità studio, **Prepara la bozza** oppure **Modifica la bozza** apre **2 · Bozza**. È disabilitato se manca un’offerta o se la versione è in sola lettura. L’editor permette di scegliere laboratorio/modello, configurare tessuti, colori, finiture, copertina, testi e, in base al modello, retro o box.
3. **Carica una foto** e **Scegli dalla galleria** sono disponibili nello studio per i modelli non-Quadrobook. Per Quadrobook le scelte delle foto sono integrate nei suoi slide 3D. Per girevole/Plaza la scelta indica se si sta lavorando sulla copertina album o sul retro dello scrigno.
4. La selezione di una foto crea subito una copia privata fra gli asset del mockup della versione. La configurazione che la usa viene conservata con **Salva bozza**; chiudere o abbandonare prima del salvataggio può lasciare un asset non referenziato dalla configurazione.
5. **Ricarica proposta** rilegge lo stato del server; se ci sono modifiche non salvate chiede conferma prima di abbandonarle. Sul percorso studio l’endpoint amministrativo consente di preparare e confermare anche quando l’impaginato non è ancora approvato.

### 5. Verifica, conferma e condivisione

1. **Rivedi e conferma** oppure **Vedi in 3D** apre **3 · Verifica e conferma**. La scheda espone stato, numero di revisione, modello, materiale, autore/data e note. Il controllo **Conferma mockup** non equivale a **Approva l’impaginato**.
2. La conferma richiede un modello valido, configurazione salvata e pulita, anteprima pronta e viste coerenti con la configurazione. Il sistema genera otto viste dal renderer, salva il report HTML e registra una nuova revisione `confirmed`. Se esistono modifiche non salvate, modello mancante o renderer non pronto, il controllo mostra un motivo e resta disabilitato.
3. Se la pagina non è approvata, la conferma del percorso studio viene comunque salvata. L’email automatica passa allo stato **in attesa dell’approvazione delle pagine**; non parte ancora.
4. **Invia email: mockup pronto** e i controlli di verifica dell’esito email si trovano nella card di flusso, non nel report. Gli stati distinguono: inviata, email mancante, non consegnata verificata, esito incerto/in attesa e attesa approvazione. Per esito incerto si deve prima controllare la posta inviata e registrare l’esito, non ripetere automaticamente l’invio.
5. **Copia link mockup** compare solo per mockup confermato della versione corrente con impaginato approvato. Copia `/fotolibro/:token/mockup?version=N`. **Copia link cliente** resta invece disponibile dalla gestione e dall’editor anche prima; conduce alla revisione generale del fotolibro.
6. Nel percorso studio il cliente apre il link diretto in sola lettura e può **Approva mockup** per la revisione esatta mostrata. La UI non permette di personalizzare la configurazione; la stampa resta separata.
7. **Scarica conferma** scarica il report salvato. **Allega all’invio fotolibro su Drive** e **Verifica allegato Drive dopo un errore** sono azioni di consegna successive, non di approvazione o condivisione col cliente.
8. **Storico revisioni** mostra revisioni precedenti. **Esamina in 3D** cambia solo la visualizzazione; **Ripristina come attiva** carica una revisione come bozza, poi richiede **Salva bozza**. Una revisione già confermata è storica e non sostituisce quella attiva senza un nuovo salvataggio/conferma.
9. **Manda in stampa** dalla scheda fotolibro è l’azione separata che blocca le modifiche. **Sblocca** riapre la modifica. **Annulla approvazione** annulla l’approvazione delle pagine e non deve essere interpretato come annullamento della conferma mockup.

## Percorso attuale del cliente

### 1. Arrivo dal link fotolibro e revisione delle pagine

1. Il cliente apre il link tokenizzato `/fotolibro/:token`. Link scaduto/non valido mostra **Fotolibro non trovato**.
2. La pagina mostra versione, pagine e controlli per sfogliare/annotare. Le richieste di correzione delle pagine sono un flusso distinto: il cliente segna le pagine, compone bozze, poi **Invia richieste**. Una richiesta in bozza non è ancora arrivata allo studio; richieste inviate e non lavorate impediscono l’approvazione dell’impaginato.
3. Su desktop l’azione è nel riquadro **L’impaginato ti piace così com’è?** con **Approva l’impaginato**. Su telefono è nel header fisso **Approva pagine**. Entrambi sono disabilitati se esistono richieste locali in bozza o richieste inviate ancora pendenti.
4. Il dialog **Approvi l’impaginato?** spiega che non si potranno più inviare correzioni delle pagine e che l’azione non avvia la stampa; include nota facoltativa e **Sì, approvo l’impaginato**. L’esito aggiorna lo stato:
   - nel percorso cliente, apre la personalizzazione del mockup;
   - nel percorso studio, può inviare la notifica del mockup già confermato, oppure segnala che lo studio lo preparerà / che l’email non è disponibile o ha esito incerto.
5. Approvare l’impaginato non approva automaticamente alcun mockup.

### 2A. Il cliente sceglie e configura il modello (`mockupPath: client`)

1. Dopo l’approvazione delle pagine, il mockup compare nel link fotolibro. Su telefono è una card dedicata; su desktop è la sezione sotto la guida al controllo pagine. **Personalizza il tuo album** apre il configuratore.
2. Se lo studio ha pubblicato più modelli, il cliente sceglie il modello e poi un esempio/layout di copertina. **Cambia modello** torna alla scelta. L’offerta fissa presenta il modello già deciso dallo studio; non richiede al cliente di sceglierlo di nuovo. Se nessun modello è disponibile, viene mostrato un messaggio che invita a chiedere allo studio di aggiornare l’offerta.
3. Nel configuratore il cliente definisce finiture/materiali e le personalizzazioni compatibili. Il modello determina i passaggi visibili: tessuti e colore; struttura dello scrigno per i modelli che la prevedono; disposizione e personalizzazione copertina; eventuale retro; eventuale visualizzazione ambientata (facoltativa); riepilogo.
4. L’associazione di una foto a una scelta avviene nel passaggio in cui quella foto serve:
   - copertina: foto da galleria o, su desktop, anche caricamento dal dispositivo;
   - retro in plexiglass: foto solo se il cliente ha scelto il retro fotografico;
   - Quadrobook: foto del quadro, della cornice/tappo e, se la copertina è impostata a foto, foto copertina. Il formato resta quello deciso dallo studio; la grafica caricata dallo studio non viene ricaricata dal cliente.
   
   Le immagini non sono necessarie per scegliere un modello o un materiale. Scegliere una foto la copia negli asset privati della versione; la selezione viene conservata nella configurazione solo al salvataggio.
5. **Salva bozza** conserva il lavoro senza inviarlo allo studio. Su desktop è esplicito. Nel wizard su telefono, **Avanti** salva automaticamente quando esistono modifiche e la configurazione è completa; all’ultimo passo **Invia allo studio** salva prima l’eventuale modifica valida e poi invia.
6. **Invia allo studio per verifica** registra la proposta come `submitted` e invia la notifica allo studio. Un doppio invio della stessa revisione viene rifiutato; se l’esito email è incerto, l’interfaccia comunica che la proposta è stata acquisita e non serve reinviarla.
7. La proposta inviata resta modificabile dal cliente fino alla stampa. Ogni modifica salvata crea una nuova bozza e richiede una nuova verifica. Il riepilogo mostra bozza, inviata, modifiche richieste o confermata dallo studio.
8. Lo studio può **Richiedi modifiche al cliente**, con nota obbligatoria. Al cliente arriva la notifica e lo stato `changes_requested`; riapre il mockup, aggiorna, salva/invia di nuovo. Questo controllo non è disponibile nel percorso in cui lo studio prepara direttamente la bozza.
9. Dopo la conferma dello studio, il cliente vede la configurazione confermata nello stesso link fotolibro. Può ancora proporre un’altra configurazione fino alla stampa; ogni modifica torna a richiedere verifica. In questo percorso non viene mostrato il controllo separato **Approva mockup** del link di sola lettura.

### 2B. Lo studio prepara il mockup (`mockupPath: studio`)

1. Il cliente continua a usare il link fotolibro per l’impaginato. Finché le pagine non sono approvate, non vede il configuratore né l’anteprima definitiva.
2. Dopo l’approvazione delle pagine, il riquadro mockup mostra lo stato e **Apri mockup** / **Apri il tuo album**; apre in sola lettura le scelte confermate dallo studio. Eventuali richieste di cambiamento al mockup vanno concordate con lo studio, non inviate dal configuratore.
3. In alternativa, lo studio invia il link diretto `/mockup?version=N`. La pagina **Il tuo mockup** mostra l’anteprima confermata; **Approva mockup** richiede prima la casella di conferma e registra l’approvazione per la revisione mostrata. Se il mockup non è confermato o la versione non è approvata, il cliente riceve uno stato informativo, non un editor.
4. Una nuova conferma/revisione deve essere controllata di nuovo. L’approvazione cliente di una revisione precedente non approva la nuova revisione. Nessun passaggio avvia automaticamente la stampa.

### Differenze telefono / desktop nel configuratore

| Aspetto | Telefono | Desktop |
|---|---|---|
| Ingresso | Card mockup dopo l’approvazione dell’impaginato; guida touch disponibile una volta. | Sezione mockup dopo l’approvazione; il dialog ampio mostra progressione, anteprima 3D e pannello strumenti. |
| Scelta modello/layout | Chooser a due fasi; il wizard touch può mostrare prima le scelte e poi la miniatura 3D. Il modello fisso resta selezionato dallo studio. | Chooser a due fasi quando serve; un’unica offerta fissa viene selezionata automaticamente e il viewer parte direttamente. |
| Foto copertina/retro | Per i renderer standard la galleria è incorporata nello slide; non viene esposto il caricamento file per la copertina standard. Per il Quadrobook le scelte sono nei suoi controlli/slide. | Picker a dialog con ricerca, filtro per capitolo, pagine da 60 miniature; copertina standard permette anche upload file. Il retro fotografico apre il picker. |
| Salvataggio | **Avanti** fa autosave se la configurazione è valida; all’ultimo passo **Invia allo studio** salva le modifiche prima dell’invio. | **Salva bozza** è esplicito; all’ultimo passo si invia separatamente allo studio per la verifica. |
| Anteprima 3D | Di norma miniatura; **Vedi in 3D** apre l’area 3D a schermo pieno e comandi touch; **Torna alle scelte** rientra nel wizard. | Renderer visibile accanto agli strumenti; controlli di vista e zoom del renderer. |
| Chiusura | **Chiudi mockup**; se ci sono modifiche non salvate, chiede conferma. | Stessa protezione per le modifiche non salvate. Il click fuori dal dialog non lo chiude. |

## Flusso obiettivo di riferimento

Questa sequenza elimina l’idea che l’approvazione delle pagine sia un prerequisito per il lavoro interno dello studio, ma conserva esplicitamente la distinzione fra preparare, mostrare e approvare.

### Studio

1. Creare/associare fotolibro, lavoro e galleria una volta sola; verificare eventuali mismatch prima di salvare.
2. Caricare/pubblicare le pagine nella versione desiderata. La pagina interna del fotolibro può essere ancora in revisione.
3. Assegnare il modello e le sole opzioni necessarie. Caricare la grafica di copertina dello studio qui, solo se il modello/opzione la richiede.
4. Scegliere il responsabile del mockup: studio oppure cliente. La decisione non deve confondersi con l’approvazione delle pagine.
5. Preparare e salvare il mockup. Caricare/associare ogni foto utente solo nello specifico passaggio che la richiede, non all’apertura del configuratore.
6. Verificare la configurazione e le viste; confermare il mockup. La conferma deve restare distinta dalla pubblicazione delle pagine e dall’azione di stampa.
7. Mostrare in modo separato: **mockup preparato/confermato**, **approvazione impaginato**, **email**, **link copiabile**, **approvazione del cliente sul mockup**.
8. Consentire allo studio di copiare e condividere manualmente il link mockup una volta confermato, senza usare l’approvazione impaginato come condizione per la preparazione o per il comando di condivisione. L’accesso effettivo al link resta quello attuale: prima dell’approvazione delle pagine il cliente vede il messaggio che segnala che l’anteprima non è ancora disponibile. Non promettere un’anteprima consultabile prima di quel passaggio.
9. Dopo l’approvazione delle pagine, sbloccare l’accesso cliente secondo le regole attuali e gestire l’eventuale email. La notifica automatica rimane distinta dall’invio manuale del link.
10. Trattare stampa/blocco come una decisione finale separata.

### Cliente — scelta e configurazione

1. Aprire il link fotolibro e rivedere le pagine; inviare o annullare le richieste di correzione prima di approvare.
2. Approvare l’impaginato quando le pagine sono definitive. Non interpretare questa azione come approvazione mockup o stampa.
3. Aprire il configuratore solo quando il mockup è attivo e il server consente le modifiche; scegliere modello/layout se l’offerta lascia la scelta.
4. Configurare le opzioni non fotografiche, poi associare la foto solo quando si raggiunge lo slot che la richiede. Saltare gli slot non necessari (es. retro senza stampa, copertina a placchetta o grafica imposta).
5. Salvare la bozza e controllare l’anteprima; inviare una volta allo studio per la verifica.
6. Se lo studio chiede modifiche, leggere la nota, aggiornare e inviare una nuova revisione. Se la conferma arriva, le modifiche successive devono essere chiaramente presentate come una nuova proposta.

### Cliente — mockup preparato dallo studio

1. Rivedere/approvare le pagine nel link del fotolibro; questa azione non approva il mockup.
2. Aprire il link mockup confermato in sola lettura e controllare le viste, foto, rivestimento e scritte.
3. Approvare la revisione esatta del mockup oppure contattare lo studio per chiedere cambiamenti.
4. Non mostrare **Invia allo studio** né strumenti di scelta/associazione foto in sola lettura. Non avviare la stampa con nessuna delle due approvazioni.

## Matrice dei controlli, ripetizioni e stati

| Controllo / posizione attuale | Stato precedente e risultato attuale | Duplicazione o rischio di confusione | Riferimento per la revisione / verifica |
|---|---|---|---|
| **Nuovo Fotolibro** → dialog → **Crea Fotolibro** | Nessun libro; salva nome, lavoro, galleria e `mockupPath=studio`, poi apre editor. | Associazione galleria/lavoro è modificabile da due picker con selezione automatica bidirezionale. | Verificare valore finale mostrato e mismatch confermato; nessuna doppia creazione al doppio click. |
| **Apri editor** nella scheda libro | Apre editor e versione corrente/bozza. | Ingresso principale nella gestione del mockup. | La versione selezionata deve essere sempre visibile e corrispondere a pagine/offerta/mockup. |
| **Copia link cliente** in manager e header editor | Copia link fotolibro generale. | Stessa etichetta in due luoghi; non è il link diretto mockup. | Etichetta o helper devono distinguere chiaramente link fotolibro da link anteprima mockup. |
| **Pagine approvate dal cliente** nel pannello 4 passi | Indica `approval.version === currentVersion`. | Il posizionamento come passo 1 e il testo “il mockup si apre al cliente solo dopo” sembrano un prerequisito anche per preparazione/conferma dello studio. | Verificare che il messaggio distingua accesso cliente da preparazione interna; le azioni studio restano disponibili prima dell’approvazione. |
| **Assegna modello / Cambia modello** e tab **1 · Modello** | Nessuna offerta oppure offerta corrente; salva la nuova offerta di quella versione. | Stessi controlli aprono lo stesso pannello con label diversa. | Modello singolo o multiplo, requisiti del lavoro, catalogo vuoto/obsoleto, Quadrobook incompleto; nessuna conferma implicita del mockup. |
| **Vedi in 3D** e **Rivedi e conferma** nel passo 4 | Apre entrambi la tab `review`. | “Vedi” può sembrare sola consultazione, “Rivedi e conferma” un’approvazione; in realtà aprono la stessa verifica. | Verificare label e destinazione nei diversi stati: bozza assente, bozza, submitted, confirmed. |
| **Prepara la bozza / Modifica la bozza** e tab **2 · Bozza** | Apertura configuratore admin; selezione di foto/materiali. | Due ingressi alla stessa attività; **Prepara** scompare nel percorso client. | Ogni azione apre lo stesso fotolibro/versione e la giusta modalità; bozza non equivale a mockup confermato. |
| **Salva bozza** admin | Configurazione dirty valida → salva la revisione e asset selezionati. | Le foto vengono copiate negli asset prima del salvataggio; possibile asset orfano se si chiude/abbandona. | Un salvataggio fallito deve mantenere la possibilità di riprovare; verifica che nessuna foto sia associata alla config prima del salvataggio riuscito. |
| **Conferma mockup** (tab 3) | Bozza salvata, non dirty e renderer pronto → esporta viste, salva report, stato confirmed. | Nome simile a “Approva impaginato”; in realtà operatore e oggetto approvato sono diversi. | Conferma distinta da approvazione pagine, email e stampa; non confermare vista non sincronizzata. |
| **Copia link mockup** (passo 4) | Visibile solo se confirmed, pagine approvate e versione corrente. | La condizione UI accoppia condivisione manuale e approvazione pagine; il link generale resta copiabile altrove. | Riferimento obiettivo: link manualmente copiabile dopo la conferma, con testo trasparente sulla disponibilità dell’anteprima. Permessi/accesso invariati in questa task. |
| **Invia email: mockup pronto** | Email mancante/non consegnata o notifica pronta secondo il percorso; può essere in attesa dell’approvazione. | Facilmente confondibile con **Copia link mockup** e con il link fotolibro. | Esito invio separato: inviata, mancante, non consegnata, incerta, in attesa. Niente retry cieco su esito incerto. |
| **Approva l’impaginato / Approva pagine** | Versione attuale, nessuna bozza di richiesta o richiesta pendente; salva l’approvazione pagine. | Due posizioni responsive; può essere letta come approvazione finale dell’intero prodotto. | Dialog esplicita che non avvia stampa; verificare che lo stato mockup non cambi implicitamente. |
| **Approva mockup** nel link diretto read-only | Revisione confirmed, corrente, impaginato approvato e non locked → registra `clientApproval.revision`. | Condivide il verbo “approva” con le pagine, ma agisce su un oggetto diverso. | Deve mostrare numero/revisione e data; seconda approvazione identica non duplica effetti; revisione nuova richiede nuova approvazione. |
| **Invia allo studio** nel wizard cliente | Configurazione completa e valida; salva se dirty, poi status submitted e notifica studio. | Desktop mostra esplicitamente anche **Salva bozza**; telefono usa autosave su **Avanti** e save implicito prima dell’invio. | Verificare che l’utente distingua bozza salvata da proposta inviata e riceva esito in caso di errore email. |
| **Richiedi modifiche al cliente** (studio, percorso client) | Mockup salvato e non dirty; invia nota e status changes_requested. | Non disponibile nel percorso studio, dove lo studio modifica direttamente: la stessa etichetta non deve essere presentata. | Verificare nota obbligatoria, email, ritorno cliente in bozza e invio di nuova revisione. |
| **Manda in stampa / Sblocca** nella scheda manager | Blocca/sblocca fotolibro, con eventuale spedizione. | È visivamente vicino agli stati di approvazione ma non è una loro conseguenza. | Confermare che solo l’azione esplicita di stampa blocchi il configuratore; sblocco non cancella approvazioni/storico. |
| **Storico revisioni / Esamina / Ripristina come attiva** | Lo studio carica una revisione storica; esamina in sola vista o la rende una nuova bozza attiva. | “Ripristina” può sembrare rollback distruttivo; lo storico resta conservato. | Verificare prompt, save richiesto dopo il ripristino, storico preservato, approvazione precedente non riutilizzata. |

## Matrice delle immagini e momento del caricamento

| Immagine / dato | Studio: comportamento osservato | Cliente: comportamento osservato | Momento corretto nel flusso di riferimento |
|---|---|---|---|
| Foto pagine interne | L’editor carica pagine/versione; upload JPEG/PNG/WebP nell’editor e pubblicazione sono separati dal mockup. | Le pagine mostrate nel link sono la base per l’approvazione; eventuali foto sostitutive appartengono al flusso correzioni. | Gestire nella revisione/pubblicazione pagine, non nella configurazione del mockup. |
| Foto galleria e miniature | L’editor richiede le foto galleria al montaggio per mostrarne il conteggio; il picker mockup desktop apre la propria query quando viene aperto. | La pagina fotolibro carica la galleria per le sostituzioni; in più, il componente mockup su telefono carica la galleria anche prima di aprire il configuratore. Desktop la carica al bisogno, aprendo il picker. | Caricare i metadati/minimizzazioni quando il cliente entra nel passaggio che può scegliere una foto; evitare una seconda richiesta o il caricamento anticipato se l’interfaccia non lo usa ancora. |
| Foto copertina del cliente | Il picker/upload compare nella scheda bozza quando il renderer/modello la richiede. | Si sceglie allo step copertina; su telefono renderer standard usa galleria inline, desktop usa picker e permette upload file. | Caricare/associare soltanto entrando nello slot copertina che richiede la foto; non al cambio modello/layout o all’apertura del viewer. |
| Foto retro in plexiglass | Lo studio sceglie lo slot copertina/retro per girevole/Plaza; può scegliere dalla galleria o caricare secondo il pannello. | Serve solo se il cliente sceglie il retro fotografico; se sceglie tessuto/nessuna stampa, nessuna foto. | Caricare solo dopo che il cliente sceglie il retro fotografico. La validazione impedisce di avanzare se manca la foto necessaria. |
| Foto Quadrobook: quadro, cornice, copertina | Lo studio sceglie foto dalla galleria del fotolibro direttamente negli slot 3D. | Il formato è deciso dallo studio; le foto di quadro/cornice sono richieste; la copertina è foto del cliente o grafica studio secondo l’offerta. | Associare nel singolo slot; non chiedere una foto copertina se la grafica è imposta. |
| Grafica di copertina studio | Caricata durante la configurazione dell’offerta Quadrobook se modalità graphic/choice. Una copia privata è collegata all’offerta; il renderer la scarica quando applica quell’opzione. | Non viene caricata né cambiata dal cliente; il cliente può scegliere la grafica se la proposta lo consente. | Caricare una volta quando si definisce l’offerta, solo se necessaria; riusare l’asset quando si apre il mockup. |
| Foto asset mockup selezionata | La selezione da galleria o upload copia/normalizza la foto e crea asset per fotolibro/versione. Il salvataggio della configurazione conserva l’ID nello stato mockup. | Stesso modello: endpoint galleria o upload crea asset per versione; il wizard salva la configurazione al passo successivo o prima dell’invio. | Un’associazione per slot selezionato, poi un salvataggio; evitare richieste duplicate sullo stesso click e indicare che la foto è pronta ma non ancora conservata se il salvataggio non è avvenuto. |
| Foto configurazione già salvata | Al caricamento/riapertura del renderer vengono scaricati gli asset effettivamente referenziati dalla configurazione; in sola lettura si ricarica la configurazione salvata. | Il viewer rilegge gli asset della revisione confermata o salvata. | Scaricare solo gli asset usati dalla revisione visualizzata, non tutte le foto della galleria. |
| Immagini di esempio modello/copertina | Non sono foto della galleria e non diventano asset del fotolibro. | Il chooser carica eager la prima immagine mostrata e lazy le successive. | Possono essere caricate nel chooser, senza anticipare download di foto personali o del renderer 3D completo. |
| Viste/report di conferma | L’esportazione genera otto viste dal renderer dopo che lo studio ha scelto **Conferma mockup**; il server salva il report per la revisione. | Il cliente non genera il report. | Solo durante la conferma esplicita; non durante scelta modello o salvataggio della bozza. |

## Scenari E2E da usare nelle revisioni successive

I seguenti scenari sono criteri di verifica, non test eseguiti da questa task.

1. **Creazione e associazione** — Selezionare un lavoro senza gallerie collegate; associare manualmente galleria; verificare auto-selezione quando la galleria ha un lavoro; mismatch richiede conferma; nessun collegamento originale viene modificato.
2. **Modello fisso** — Pubblicare un modello singolo; cliente approva pagine; configuratore non richiede una scelta modello superflua, ma lascia scegliere le personalizzazioni consentite.
3. **Scelta cliente fra modelli** — Pubblicare più opzioni; verificare scelta modello, layout copertina, ritorno a **Cambia modello**, selezione persistente e nessuna bozza inviata prima della CTA finale.
4. **Offerta Quadrobook** — Provare foto, grafica e scelta fra entrambe; formato imposto non modificabile; grafica richiesta quando serve; nessuna foto cliente per copertina grafica; ogni slot foto obbligatorio viene validato.
5. **Percorso studio prima dell’approvazione pagine** — Preparare, salvare e confermare; verificare che il lavoro interno non sia bloccato. Verificare stato email “in attesa approvazione” e che il cliente non possa ancora vedere il mockup secondo il gate attuale.
6. **Condivisione manuale e link** — Dopo conferma, verificare link generale vs link mockup e che il secondo punti alla versione corretta. Verificare UI proposta per copiare/condividere manualmente senza confonderla con email; il link continua a rispettare l’accesso corrente pre/post approvazione pagine.
7. **Separazione approvazioni** — Approvare impaginato e mockup in momenti distinti; ciascuna azione aggiorna solo il proprio stato; nessuna avvia la stampa.
8. **Link diretto studio-preparato** — Versione confirmed, corrente e pagine approvate apre il renderer read-only; approvare registra la revisione esatta. Un link con versione non valida/obsoleta o un mockup non confirmed mostra errore/stato informativo e non un editor.
9. **Richiesta modifiche nel percorso client** — Studio invia una nota; cliente la vede e può modificare/inviare una nuova revisione; conferma del mockup non viene confusa con approvazione pagine.
10. **Modifica dopo invio/conferma** — Salvare una modifica crea una nuova revisione e richiede nuova verifica; l’approvazione cliente della revisione precedente non si trasferisce.
11. **Telefono e desktop** — Ripetere scelta modello, selezione foto, salvataggio e invio sui due layout. Verificare autosave su **Avanti**, save esplicito desktop, keyboard virtuale e picker/inline gallery senza blocchi.
12. **Caricamenti al momento giusto** — Desktop: aprire fotolibro senza aprire picker e verificare che il picker mockup non carichi la galleria una seconda volta in anticipo. Telefono: misurare query galleria anticipata dal componente mockup; verificare che le successive selezioni non clonino più volte la stessa foto per doppio click. Riaprire configurazione salvata e confermare che vengano scaricati gli asset usati, non tutta la galleria.
13. **Errori e recupero** — Catalogo assente/obsoleto, upload oltre 20 MB o immagine invalida, foto non più disponibile, errore salvataggio, renderer offline, conferma/export scaduto e risposta di rete incerta. Ogni stato deve indicare se la bozza è stata salvata e se occorre o non occorre ripetere un invio.
14. **Versioni e stampa** — Versione precedente in sola lettura; nuova versione non eredita una falsa approvazione del mockup; lock impedisce edit e sblocco ripristina la modifica senza cancellare storico.

## Punti da chiarire nelle future revisioni

- La card mette “Pagine approvate” come passo 1, ma non è un prerequisito per il lavoro interno studio; riformulare come stato parallelo, non come blocco di preparazione.
- Il requisito corrente per copiare il link mockup unisce conferma mockup, approvazione pagine e versione corrente. Il link cliente generale è copiabile senza questa condizione. Separare i due comandi e indicare con precisione quando l’anteprima è effettivamente consultabile.
- L’approvazione del mockup esiste solo nel percorso di anteprima studio in sola lettura; nel percorso con configurazione cliente l’azione finale è “Invia allo studio per verifica” e la conferma è dello studio. Le etichette devono descrivere chi verifica cosa.
- **Vedi in 3D**, **Rivedi e conferma**, i tab numerati del configuratore e i pulsanti di apertura del link cliente hanno destinazioni parzialmente sovrapposte. Una revisione dovrebbe dare a ogni controllo un unico significato e indicare se apre scelta, modifica o sola lettura.
- Il componente cliente su telefono richiede le foto galleria al montaggio del mockup anche se il configuratore non è aperto; la pagina del fotolibro ha già una query galleria per le sostituzioni. Verificare l’opportunità di riusare la query/cache e caricare al momento d’uso, senza eliminare le foto necessarie al flusso separato di revisione pagine.

## Riferimenti nel codice

- Gestione, associazioni, scheda libro e dialog di creazione: `artifacts/image-studio-web/src/components/photobook/PhotobooksManager.tsx`
- Versioni e pagine interne, pannello mockup: `artifacts/image-studio-web/src/pages/admin/PhotobookEditorPage.tsx`
- Passi amministrativi e stato email/link: `artifacts/image-studio-web/src/components/photobook/MockupAdminFlow.tsx`
- Configurazione proposta e cataloghi: `artifacts/image-studio-web/src/components/photobook/MockupOfferEditor.tsx`
- Renderer, wizard, salvataggi, immagini, approvazione e storico: `artifacts/image-studio-web/src/components/photobook/PhotobookMockup.tsx`
- Link cliente e approvazione impaginato: `artifacts/image-studio-web/src/pages/PhotobookViewPage.tsx`
- Link mockup cliente read-only: `artifacts/image-studio-web/src/pages/PhotobookMockupViewPage.tsx`
- Scelta modello/layout, picker e galleria inline: `MockupModelChooser.tsx`, `PhotobookPhotoPicker.tsx`, `PhotobookInlineGallery.tsx`
- Permessi/stati e salvataggi mockup: `artifacts/api-server/src/photobook-mockup-routes.ts`
- Stati, modelli e validazione configurazioni: `artifacts/api-server/shared/mockup-workflow.ts`, `artifacts/api-server/shared/mockup-types.ts`
- Test di riferimento attuali: `MockupAdminFlow.test.tsx`, `PhotobookMockupViewPage.test.tsx`, `MockupClientApproval.test.tsx`
