# Mockup album — Custodia, cataloghi e verifica dello studio

Implementazione locale del 9 settembre 2026. Non implica un deploy su Replit o la verifica dei dati di produzione.

## Nome e provenienza

**Custodia** è il nome confermato per il modello Peppe Lab con custodia a cornice e foto a tutta facciata oppure con taglio obliquo. Importato dal prototipo `Album-3D-prototipo/v2`, conservando gli ID del modello e dei 37 rivestimenti (Alcantara, Cablo, City, Mist). I codici interni non sono codici commerciali del fornitore. L’ID locale Peppe Lab non viene usato come ID dell’anagrafica Firestore `labs`.

Nomi ancora disponibili, non assegnati ad altri modelli: Attimo, Essenza, Incanto, Sempre, Intreccio, Batticuore, Riflessi, Memoria, Emozione, Istanti, Legami, Promessa, Meraviglia, Frammenti, Infinito, Risonanza, Sussurri, Radici, Eterna, Luce, Prezioso.

## Percorso operativo

Il [piano completo](./PIANO-MOCKUP-WORKFLOW.md) conserva decisioni, ordine di implementazione e assunzioni.

1. **Anagrafica laboratori → Modelli album**: importare il campionario Custodia nell’anagrafica del suo fornitore reale. Aggiungere il modello, impostare nome e codice fornitore, scegliere l’asset Custodia e i rivestimenti compatibili. Nomi/codici del campionario sono comuni ai modelli del laboratorio. Gli altri modelli possono essere censiti senza asset e restano non proponibili.
2. **Lavoro → Operativo → Album e personalizzazione**, oppure editor fotolibro: aprire il mockup e **Laboratori e modelli per questo lavoro**. Selezionare laboratori/modelli e pubblicare la proposta. Questa azione aggiorna il link cliente già esistente; non invia email/WhatsApp.
3. Il cliente prima approva le pagine della versione corrente, poi apre il mockup. Sul telefono sceglie modello ed esempio nei due caroselli e usa soltanto foto della galleria associata. Da desktop rimane anche il caricamento JPG/PNG/WebP (20 MB, 40 megapixel massimo). Modifica testi/ritaglio e salva; può esplorare il modello e scaricare l’anteprima con otto viste. Salvataggio e download non sono conferme.
4. **Invia allo studio per verifica** porta il mockup a **Da verificare**, senza congelare definitivamente le modifiche. Il cliente può salvare una nuova revisione fino all’invio in stampa. **Apri WhatsApp** apre la conversazione senza inviare messaggi automaticamente.
5. Una nuova modifica del cliente dopo invio/conferma crea una bozza e conserva la revisione precedente. L’approvazione delle pagine non blocca la copertina. Il blocco **in stampa** impedisce modifiche del mockup a cliente e studio; lo studio può ancora allegare/verificare il report già confermato. **Richiedi modifiche al cliente** conserva il messaggio e la transizione nello storico.
6. **Conferma mockup** richiede una configurazione salvata e genera una copia privata statica HTML con otto viste e riepilogo. Una modifica successiva conserva la vecchia conferma nello storico e richiede una nuova conferma. Versioni storiche del fotolibro rimangono in sola lettura.
7. Preparare la spedizione con il flusso **Manda in stampa** già esistente. Attendere la fine del trasferimento pagine, selezionare lo stesso laboratorio del mockup e verificare il DPA. **Allega all’invio fotolibro su Drive** aggiunge la copia confermata, con nome comprendente versione/revisione, senza sostituire altri file o inviare email. L’invio email rimane un’azione distinta.
8. **Verifica allegato Drive dopo un errore** recupera solo una copia già presente e identica byte per byte. Non genera un altro upload. Se il file non è trovato o esistono copie ambigue, il blocco resta attivo e serve verifica operativa.

Il materiale è comune a copertina, dorso e custodia, come nel prototipo. Le misure e i tessuti sono indicativi: il configuratore non produce file tecnici di stampa. Nessun invio commerciale o servizio di vendita B2B è stato aggiunto.

## Dati e autorizzazione

Il configuratore si apre in un modale dedicato, a schermo intero sui telefoni, e non espande più la pagina delle foto. La chiusura rimuove l’iframe e chiede conferma prima di abbandonare modifiche non salvate; durante salvataggi/upload/conferme la chiusura è bloccata. Alla riapertura si riparte dalla configurazione salvata. I controlli Salva e Invia allo studio rimangono fuori dall’area scorrevole.

Le revisioni non sono un autosalvataggio di ogni interazione: aumentano al salvataggio e nelle transizioni del flusso. Lo studio consulta le precedenti da **Storico revisioni**; per le confermate può scaricare il report con otto viste. Non è presente un pulsante di ripristino automatico di una revisione precedente. Lo storico è separato per versione del fotolibro e riservato allo studio.

- `photobooks/{id}/mockups/v{version}`: configurazione validata, versione, revisione progressiva, data aggiornamento.
- `labs/{id}.mockupCatalog`: revisione del catalogo, campionario comune e modelli (nome, codice, asset registrato, compatibilità materiali).
- `photobooks/{id}/mockupOffers/v{version}`: snapshot delle sole opzioni scelte dallo studio, nomi e campionario congelati alla pubblicazione.
- `photobooks/{id}/mockupHistory/v{version}-r{revision}`: copia della revisione precedente prima di ogni transizione/salvataggio. Autore registrato come studio o cliente tramite link, non come identità individuale certificata del cliente.
- `photobooks/{id}/mockupAttachments/v{version}-r{revision}`: tentativo e stato allegato, con claim persistente. `labShipments` conserva `mockupSnapshot`, `mockupTransfer` e blocco di invio `mockupDispatching`.
- `photobooks/{id}/mockupAssets/{uuid}`: provenienza (upload/galleria), eventuale ID foto, nome, dimensioni, versione e percorso della copia.
- Storage privato `photobook-mockups/{id}/v{version}/{uuid}.jpg`: copia per anteprima entro 2048 px, JPEG normalizzato senza metadati EXIF. Gli originali restano invariati.
- Le copie, comprese quelle caricate e poi sostituite, rimangono associate al fotolibro e rientrano nella cancellazione esplicita del fotolibro. La pulizia Storage mantiene la semantica best-effort del flusso esistente; nessuna cancellazione periodica aggiunta.
- Route admin `/api/photobooks/:id/mockup`; route cliente `/api/photobooks/by-token/:token/mockup`, con accesso limitato al fotolibro risolto dal token.
- API mockup: `GET /`, `PUT /`, `POST /upload`, `POST /gallery-photo`, `GET /photos/:assetId`, `PUT /offer` (admin), `POST /submit`, `POST /request-changes` (admin), `POST /confirm` (admin), `GET /history` e `/report/:revision` (admin), `POST /attach` e `/reconcile-attachment` (admin). Query `version` esplicita. Il token non viene passato al renderer.
- API admin catalogo: `GET/PUT /api/labs/:labId/mockup-catalog`; vista operativa read-only: `GET /api/photobooks/mockup-jobs/:jobId`.
- Le selezioni galleria vengono risolte dal server tramite il lettore moderno/legacy esistente. Sono trasferibili solo URL del bucket dello studio. Nessun URL esterno arbitrario viene scaricato.
- Le letture foto passano dal server con `private, no-store` e `noindex`. Nessun download token Firebase pubblico viene creato; le regole Firebase restano invariate (default deny per i nuovi percorsi).
- Ogni salvataggio ricontrolla versione, associazione lavoro/galleria, blocco stampa, revisione e proposta in transazione; per il cliente verifica anche l’approvazione delle pagine correnti. Il controllo vale anche per invio e acquisizione foto, non soltanto per la visibilità del pulsante. Una sessione obsoleta riceve 409: **Ricarica proposta** recupera lo stato aggiornato chiedendo conferma prima di scartare modifiche locali. Lo studio può preparare il mockup prima dell’approvazione. Nessuna regola Firebase modificata.
- La conferma valida che le viste dichiarino la configurazione salvata e ricodifica le immagini raster; il server genera l’HTML con escaping. Nessun HTML fornito dal browser viene pubblicato. Il renderer è client-side: non è una firma crittografica delle immagini né un rendering server certificato.
- L’allegato verifica lavoro, fotolibro, laboratorio, DPA, stato spedizione e blocchi concorrenti. Errori post-upload/post-commit non liberano automaticamente il claim e non regrediscono un allegato già registrato. L’email di una spedizione fotolibro usa un blocco per evitare sovrapposizioni con il mockup; un errore dall’esito incerto richiede controllo, senza reinvio automatico.
- Limite per le scritture: 60 richieste ogni dieci minuti per identità/IP, riutilizzando la utility già esistente. Il controllo è in memoria per processo, non una quota commerciale distribuita.

## Renderer e riuso

### Percorso cliente guidato, mobile-first

Durante il caricamento iniziale e il cambio modello il documento del renderer resta invisibile (ma mantiene le dimensioni per inizializzare il canvas). Compare **Preparazione del tuo configuratore…** fino all'installazione del percorso cliente e del relativo passaggio: non viene mostrata per un istante l'interfaccia autonoma con gli strumenti studio. `node e2e/mockup-touch.browser.mjs` verifica questa regressione trattenendo le risposte degli script dei due renderer e usa tocchi reali simulati (`tap`) per Plaza, finiture, estrazione e navigazione. La prova Chromium mobile non certifica Safari su iPhone reale.

Il cliente accede solo dopo l’approvazione delle pagine correnti. La pubblicazione di una nuova versione richiede prima una nuova approvazione: il mockup copiato e lo storico non vengono cancellati. Su telefono la pagina del fotolibro ha un header essenziale (nome, versione, stato, approvazione/album, guida), senza scheda mockup o banner lunghi sopra le foto. I dettagli sono nella guida apribile in entrambi gli orientamenti. Mentre il mockup è aperto, focus e riconnessione non ricaricano automaticamente la pagina sottostante, evitando di smontare una bozza locale; il server continua a verificare eventuali cambiamenti concorrenti.

Dal link cliente, **Apri mockup** su desktop conserva quattro passaggi: **Modello → Rivestimento e copertina → Foto e scritte → Riepilogo e invio**. Su smartphone **Personalizza album** apre prima il carosello dei modelli reali della proposta (per esempio Plaza), poi quello degli esempi compatibili. Soltanto **Personalizza questo** carica il renderer. Custodia propone foto obliqua/intera; il girevole incisione, foto intera/foto piccola. Cinque anteprime statiche locali (circa 172 KB complessivi), derivate dai renderer, non trasferiscono mai fotografie o nomi dimostrativi alla configurazione. Anche una proposta con un solo modello richiede una scelta esplicita. Riaprire un mockup salvato porta invece direttamente al suo editor. Lo studio conserva i propri strumenti amministrativi, senza questo nuovo percorso mobile.

- Su telefono pagine e 3D richiedono orientamento orizzontale; i caroselli e i modali di servizio funzionano anche in verticale. Header 48 px; anteprima maggioritaria a sinistra, opzioni scorrevoli e navigazione a destra. Nessuna barra inferiore a tutta larghezza. Icone quadrate visivamente piccole, con area touch di 44 px, per Fronte/Retro/Estrai/Zoom/Reimposta e rotazione interna dello scrigno girevole. La guida ai gesti è richiudibile e riapribile dal punto interrogativo. Un dito cambia la vista; due dita ingrandiscono e spostano il dettaglio, per osservare la trama. Il dialog segue il viewport visibile quando compare la tastiera. Desktop invariato.
- Dopo i caroselli: **Tessuto → Struttura (solo girevole) → Copertina → Plexiglass del box (solo girevole) → Riepilogo e invio**. Custodia salta il passaggio struttura privo di scelte autonome. Indietro funziona anche dal riepilogo; dal primo passaggio torna ai modelli. **Cambia** riapre i caroselli senza scartare subito il lavoro; cambiare tipo di renderer con modifiche non salvate richiede conferma. Su mobile le famiglie di tessuti sono inizialmente chiuse ed espandibili; le finiture e i layout usano pulsanti collegati ai controlli esistenti.
- Su mobile le foto del mockup si scelgono esclusivamente dalla galleria del servizio, in passaggi separati per copertina e retro. I modali di galleria, note, azioni, approvazione e conferma funzionano sia in verticale sia in orizzontale: non chiedono più di tornare in verticale. Ruotare non cancella le scelte.
- Foto e scritte personalizzano solo copertina e retro, non le pagine interne. L'incisione non impone una foto. Le copertine fotografiche e il retro fotografico bloccano Avanti fino alla presenza delle immagini richieste. Il ritaglio automatico esistente resta modificabile in **Sistema la foto**.
- Fronte, Retro ed Estrai/Reinserisci sono preset di visualizzazione. **In casa** sul mobile è sempre nell’header dell’editor, non soltanto nel riepilogo: quattro ambienti, tredici finiture, misure, luci e spostamento/rotazione del solo album. **Solo album / Torna a personalizzare** riporta al passaggio lasciato. La visita non modifica l’ordine né crea revisioni. Desktop conserva la collocazione precedente.
- **Salva bozza** usa il salvataggio esistente e crea una revisione. **Invia allo studio per verifica** salva prima le eventuali modifiche, poi invia usando la revisione restituita dal server. Un salvataggio fallito interrompe l'invio. Dopo un invio riuscito il pulsante resta disabilitato finché non ci sono nuove modifiche. Non equivale alla stampa.
- Nel riepilogo, **Recupera la proposta dello studio → Ricarica proposta** consente di riallineare una sessione obsoleta, chiedendo conferma prima di abbandonare le modifiche locali. Chiudere senza salvare mantiene la stessa protezione.
- `mockup-wizard-layout.ts` adatta la presentazione del documento same-origin del renderer: mantiene ID, handler, texture e canvas, ospitando i controlli React nel pannello e nell’area delle icone. Il cambio di passaggio non rimonta il renderer; il cambio di modello continua a usare il percorso esistente. Nessun nuovo endpoint o campo Firestore per il wizard. La revisione asset 4 è necessaria soltanto per la correzione fisica del plexiglass descritta sotto.

La suite browser copre navigazione e conservazione del canvas/testi, scorrimento indipendente dell'anteprima, galleria, salvataggio prima dell'invio, errore di salvataggio senza invio, incisione senza foto, requisiti fronte/retro, ritaglio, nuova bozza e sola lettura a 390 e 320 px. Sono prove locali con API simulate: restano da provare Replit e Safari su iPhone reale, inclusa la tastiera fisica del dispositivo.

Le prove touch dedicate (`node e2e/mockup-touch.browser.mjs` e `node e2e/photobook-versions.browser.mjs`) verificano 390×844, 667×375 e 844×390, anche riducendo l’editor a 667×280 e 844×300 per simulare lo spazio sottratto dal browser: galleria con 65 foto e paginazione, rotazione con modale aperto, permanenza di foto/nota, scelta pagina, azione sulla X, approvazione, riepilogo invio e conferme di cancellazione. Coprono caroselli prima del 3D, nessun flash dell’interfaccia studio, assenza dei selettori file nativi mobile, In casa e ritorno, riapertura salvata e nuova revisione dopo invio. Le API sono isolate: nessun invio email reale o modifica di dati cliente.

`client/public/mockups/custodia-v1/` contiene modello, materiali, report e soli moduli Three.js 0.180.0 necessari, con licenza MIT. Viene caricato alla prima apertura tramite iframe dello stesso dominio; il resto dell’applicazione non importa Three.js. Il bridge accetta messaggi solo dal contenitore atteso e dalla stessa origine. La foto passa come Blob, senza token né URL privati. Le immagini dimostrative incorporate nel GLB originale sono state sostituite con un campione neutro.

`shared/mockup-catalog.ts` mantiene gli ID e le revisioni accettati dal backend. Il catalogo pubblico esclude i link alle scansioni sorgenti. Le revisioni degli asset vanno conservate: aggiornamenti grafici futuri devono usare una nuova cartella/registrazione, senza cambiare retroattivamente quelle già salvate.

Il catalogo comprende Custodia e Album girevole, con i 37 rivestimenti esistenti. Ulteriori modelli/campionari richiedono integrazione e verifica degli asset reali: non si possono caricare URL o script arbitrari dal pannello. Non implementa account laboratorio, licenze, isolamento tra aziende o pagamenti B2B. Il workflow iniziale riutilizza fotolibro, galleria e token esistenti; non crea inviti autonomi prima del fotolibro.

## Album girevole — secondo modello

`client/public/mockups/girevole-v1/` ricostruisce in Three.js la struttura delle tre fotografie di riferimento. Il modello ha identità `album-girevole`, revisione 1, separata da Custodia; riutilizza i moduli Three.js e il campionario già presenti. Nessuna dipendenza aggiunta e nessun asset Custodia sostituito.

- Cornice esterna fissa, perni centrali superiori/inferiori e supporto interno girevole con album e pannelli trasparenti sagomati per la presa. Cursore da −180° a +180° e rotazione automatica; l’esplorazione con il mouse cambia soltanto la vista.
- Struttura in legno naturale, bianco oppure tessuto coordinato al rivestimento scelto per l’album. I legni sono una resa procedurale indicativa, non una scansione del prodotto.
- Copertina fotografica intera, placchetta in legno con due righe di incisione oppure fotografia nella stessa posizione e dimensione della placchetta.
- La variante incisa accetta `photoAssetId: null`. Le due varianti fotografiche richiedono ancora una foto appartenente alla versione del fotolibro. Custodia mantiene il suo obbligo di foto.
- Formato dichiarato dall’utente: 30 × 80 cm. **Interpretazione provvisoria da confermare:** formato aperto, album chiuso 40 × 30 cm; cornice stimata 48 × 37 × 9 cm. La luce interna supera la diagonale del supporto e permette la rotazione completa. L’anteprima non è un disegno esecutivo.
- Il nome iniziale “Album girevole” può essere modificato dal laboratorio. Nessun laboratorio reale viene assegnato automaticamente.
- Il contenitore sceglie il renderer registrato dalla configurazione salvata o dall’opzione autorizzata. Il cambio modello conserva la fotografia corrente; incisione, layout e finitura vengono impostati nel nuovo modello. Salvataggio, invio allo studio, conferma e allegato continuano a usare le route e i controlli esistenti.
- L’export produce otto viste statiche, comprese rotazioni a 90°/180°, e il riepilogo della finitura esterna.

Il test browser copre entrambi i renderer, il ripristino dei salvataggi girevoli, tutte le finiture/copertine, l’incisione senza foto, il blocco dei layout fotografici privi di immagine, la conferma con otto viste, il mobile e la sola lettura. Le API restano simulate: nessuna verifica o scrittura sui dati di produzione.

### Revisione 2 — album estraibile e foto retro su plexiglass

La revisione storica `client/public/mockups/girevole-v2/` è conservata insieme a v1. Le configurazioni v1 restano valide e mantengono il retro in tessuto. Nell’editor v2 la prima modifica di personalizzazione crea una configurazione con `assetRevision: 2`; la sola esplorazione non modifica il salvataggio.

- Il cursore **Estrai l’album** muove esclusivamente il libro e le sue personalizzazioni. Guide e pannelli trasparenti rimangono nel supporto. Prima dell’uscita il supporto si orienta a −90°; la rotazione viene sospesa finché l’album non è rientrato. L’inquadratura si adatta e **Ripristina vista** reinserisce l’album. Anche in sola lettura si può esplorare l’estrazione.
- In **Dettagli → Finitura retro** si sceglie tessuto oppure foto a tutta superficie su plexiglass. La seconda immagine e il suo ritaglio sono indipendenti dalla copertina. Nel gestionale il selettore **Foto da personalizzare** indirizza upload e scelta galleria alla copertina o al retro. Nella prova autonoma sono disponibili due input file distinti.
- I campi v2 sono `backCover`, `backPhotoAssetId`, `backCrop`. Il server esige una foto per il retro fotografico e controlla l’appartenenza di entrambe le immagini alla versione del fotolibro, anche quando un’immagine conservata non è attualmente visibile. Nessun nuovo endpoint, percorso Storage o permesso.
- La scheda confermata descrive il retro scelto; le otto viste includono il retro e due prospettive dell’album estratto. L’export ripristina l’estrazione e la rotazione visualizzate prima del download.
- Verifiche aggiunte: foto retro assente/estranea/di altra versione, ritaglio invalido, persistenza dei due asset, ripristino, estrazione senza modifiche da salvare, conferma ed estrazione in sola lettura.

### Revisione 3 — incisione botanica personalizzata

La revisione storica `client/public/mockups/girevole-v3/` è conservata insieme a v1 e v2. La placchetta riprende la composizione del riferimento: croce sottile, iniziale e nome nel quadrante superiore sinistro, secondo nome e iniziale in quello inferiore destro, rami negli altri due quadranti. È una ricostruzione vettoriale disegnata su Canvas, non un file esecutivo per incisione.

- I due campi nome generano automaticamente le iniziali; i nomi lunghi vengono adattati allo spazio disponibile. L’anteprima 2D e la texture 3D usano lo stesso disegno.
- La configurazione v3 salva `engravingNames.first` e `engravingNames.second`, ciascuno entro 50 caratteri. Il riepilogo e la scheda confermata riportano entrambi i nomi e la grafica scelta.
- Le configurazioni precedenti mantengono le due righe originali: non si interpretano automaticamente dediche o date come nomi. Nell’editor corrente l’inserimento dei nomi attiva la nuova grafica.
- Verificati salvataggio/ripristino, nomi accentati, aggiornamento dell’immagine, validazione dei limiti e conservazione delle configurazioni precedenti. Estrazione e retro fotografico restano disponibili.

### Revisione corrente 4 — stampa sul plexiglass dello scrigno

Il renderer registrato è `client/public/mockups/girevole-v4/`. La cornice esterna resta ferma; album e pannelli di plexiglass appartengono al supporto interno girevole. La stampa posteriore copre la lastra, con il suo incavo: ruota con lo scrigno e non segue il libro durante l’estrazione. Il retro del libro resta in tessuto. Il riepilogo e il report distinguono le due superfici.

Le configurazioni 1–3 sono caricate ed esportate nella loro semantica originale. La sola esplorazione non le migra. Una modifica esplicita crea la configurazione v4; le incisioni legacy a righe rimangono tali finché non vengono inseriti i nomi. Nessuna migrazione o cancellazione di documenti reali. Il valore storico `backCover: fabric` rappresenta in v4 la lastra trasparente senza stampa, attraverso cui si vede il tessuto dell’album.

`mobile-view.js` migliora inquadratura e zoom solo sui telefoni: adatta il volume del prodotto al canvas effettivo, consente dettagli ravvicinati e spostamento a due dita. Le prove renderer controllano geometria, pinch/pan, reset, estrazione e otto viste, non soltanto i valori degli input.

## Ambientazioni domestiche (solo esplorazione)

Interfaccia uniformata: quattro schede (Tessuti, Dettagli, Riepilogo, In casa), pannello centrale scorrevole e download separato sempre raggiungibile sul desktop. Nel gestionale i comandi amministrativi di conferma e allegato seguono l’anteprima; autorizzazioni, transizioni e controlli restano invariati.

**Posiziona l’album** muove esclusivamente il prodotto (album e relativo box) sul piano del mobile tramite cursori sinistra/destra, avanti/indietro e rotazione ±180°. Gli arredi restano fissi. L’ingombro ruotato determina i limiti di spostamento senza alterare la scala; se il box è più profondo del mobile compare un avviso di sporgenza. **Ricentra album** azzera la posa. La posa neutra viene ripristinata per gli export e tornando a Solo album. Comandi disponibili anche su telefono e in sola lettura, senza salvare la posa nell’ordine.

I renderer correnti Custodia e Album girevole condividono `client/public/mockups/home-scenes.js`: quattro scene geometriche leggere (parete attrezzata, madia scandinava, living con doghe e consolle), con tredici finiture del mobile. Non sono fotografie o riproduzioni esatte di arredi commerciali.

Ricerca del 9 settembre 2026 su fonti del produttore: [Amburgo e relativi abbinamenti](https://www.mondoconv.it/amburgo-f83e.html), [madie](https://www.mondoconv.it/soggiorni/madie-moderne.html), [stile nordico](https://blog.mondoconv.it/guide-arredo/soggiorno-stile-nordico/), [vetrine e LED](https://www.mondoconv.it/soggiorni/credenze-e-vetrine.html). Da questi riferimenti derivano le famiglie bianco lucido/rovere, cashmere/noce, cemento e gli effetti opachi/lucidi. Texture legno e cemento generate proceduralmente; nessuna immagine del produttore incorporata, nessuna fedeltà cromatica certificata.

**Misure del tuo mobile** imposta larghezza (80–300 cm), altezza complessiva (50–110 cm) e profondità (30–65 cm) del mobile d’appoggio, non della parete completa. Valori vuoti, non interi o fuori limite mantengono l’ultima geometria valida e mostrano un messaggio. Si ricostruiscono mobile e ambiente, senza riscalare il prodotto. Le decorazioni laterali vengono omesse sotto 120 cm per non sovrapporle all’album. L’inquadratura si adatta alle nuove dimensioni e al telefono.

**Illuminazione** alterna luce naturale e sera con strisce e luci LED calde. Luci originali e intensità dell’ambiente vengono ripristinate sia tornando alla vista neutra sia durante l’export. Dimensioni, luce e finiture rimangono preferenze di esplorazione temporanee; non fanno parte dell’ordine. AR non implementata, rinviata su richiesta dell’utente.

La scelta **Visualizza in casa** imposta l’inquadratura fissa e una posa iniziale, modificabile tramite i cursori del solo album. **Solo album** ripristina scala, estrazione, custodia e vista precedenti. Le ambientazioni funzionano anche in sola lettura e non rendono il mockup da salvare: non modificano configurazione, Firestore, conferme o permessi. Gli export conservano le otto viste neutre, sospendendo temporaneamente ambiente e scala esplorativa.

L’album ha larghezza di riferimento 40 cm (formato dichiarato 30 × 40 chiuso); il GLB storico viene scalato uniformemente solo nella vista ambientata, senza deformarlo o cambiare le revisioni di produzione. Gli ingombri dei box e le proporzioni storiche restano indicativi in attesa delle misure definitive. Nessuna revisione dati aggiunta, perché la grafica del prodotto e le schede salvate restano invariate.

Il test browser copre quattro ambienti e tredici finiture su entrambi i renderer, misure minime/massime, valori invalidi, luce naturale/LED, ritorno alla vista neutra, mobile, sola lettura ed export mentre è attiva un’ambientazione. Nessun test sui dati di produzione.

## Verifiche ripetibili

- `npx vitest run server/photobook-mockup-routes.test.ts server/photobook-mockup-delivery.test.ts server/lab-mockup-workflow.test.ts server/mockup-drive-recovery.test.ts server/photobook-mockup-delete.test.ts server/photobook-association.test.ts server/photobook-lab-shipment.test.ts server/lab-routes.dpa.test.ts`: suite mirata per catalogo, permessi, transizioni, conferme, allegato/idempotenza e regressioni fotolibro.
- `node e2e/photobook-mockup.browser.mjs`: browser reale con Firebase sostituito e tutte le API simulate, senza dati produzione. Su Windows usa Edge se presente, altrimenti Chromium Playwright.
- `node e2e/mockup-chooser.browser.mjs`: caroselli statici con tap/swipe, quattro viewport, filtri e nessun trasferimento di dati dimostrativi.
- `node e2e/mockup-touch.browser.mjs`: percorso cliente completo su telefono con renderer reale e API isolate.
- `node e2e/renderer-mobile.browser.mjs`: zoom ravvicinato, pinch/pan, estrazione, posizione fisica plexiglass e compatibilità v1–v4.
- `node e2e/photobook-versions.browser.mjs`: approvazione, versioni, header mobile e modali nei due orientamenti.
- `npx vitest run server/mockup-renderer-revisions.test.ts`: schemi e report v4, compatibilità incisioni/revisioni precedenti.
- `npm run build`
- `npx tsc --noEmit --pretty false`: dopo l'allineamento al commit Replit `bce512fd` restano tre errori già presenti nel codice remoto in `server/follow-up-routes.ts`: `data`/`exists` alle righe 530/532 e il tipo dell'evento `followup_recovery_pending` alla riga 567. Non sono introdotti dai mockup.

Prima della pubblicazione verificare su ambiente di prova le regole effettivamente distribuite e il caricamento/scaricamento nel bucket reale. Le prove locali non certificano i permessi Firebase pubblicati o Safari/iOS.
