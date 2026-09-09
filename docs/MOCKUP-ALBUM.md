# Mockup album — Custodia, cataloghi e verifica dello studio

Implementazione locale del 9 settembre 2026. Non implica un deploy su Replit o la verifica dei dati di produzione.

## Nome e provenienza

**Custodia** è il nome confermato per il modello Peppe Lab con custodia a cornice e foto a tutta facciata oppure con taglio obliquo. Importato dal prototipo `Album-3D-prototipo/v2`, conservando gli ID del modello e dei 37 rivestimenti (Alcantara, Cablo, City, Mist). I codici interni non sono codici commerciali del fornitore. L’ID locale Peppe Lab non viene usato come ID dell’anagrafica Firestore `labs`.

Nomi ancora disponibili, non assegnati ad altri modelli: Attimo, Essenza, Incanto, Sempre, Intreccio, Batticuore, Riflessi, Memoria, Emozione, Istanti, Legami, Promessa, Meraviglia, Frammenti, Infinito, Risonanza, Sussurri, Radici, Eterna, Luce, Prezioso.

## Percorso operativo

Il [piano completo](./PIANO-MOCKUP-WORKFLOW.md) conserva decisioni, ordine di implementazione e assunzioni.

1. **Anagrafica laboratori → Modelli album**: importare il campionario Custodia nell’anagrafica del suo fornitore reale. Aggiungere il modello, impostare nome e codice fornitore, scegliere l’asset Custodia e i rivestimenti compatibili. Nomi/codici del campionario sono comuni ai modelli del laboratorio. Gli altri modelli possono essere censiti senza asset e restano non proponibili.
2. **Lavoro → Operativo → Album e personalizzazione**, oppure editor fotolibro: aprire il mockup e **Laboratori e modelli per questo lavoro**. Selezionare laboratori/modelli e pubblicare la proposta. Questa azione aggiorna il link cliente già esistente; non invia email/WhatsApp.
3. Il cliente sceglie un’opzione, carica JPG/PNG/WebP (20 MB, 40 megapixel massimo) oppure sceglie dalla galleria associata, modifica testi/ritaglio e salva. Può esplorare il modello e scaricare l’anteprima con otto viste. Salvataggio e download non sono conferme.
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
- Ogni salvataggio ricontrolla versione, associazione lavoro/galleria, blocco stampa, revisione e proposta in transazione. Una sessione obsoleta riceve 409: **Ricarica proposta** recupera lo stato aggiornato chiedendo conferma prima di scartare modifiche locali.
- La conferma valida che le viste dichiarino la configurazione salvata e ricodifica le immagini raster; il server genera l’HTML con escaping. Nessun HTML fornito dal browser viene pubblicato. Il renderer è client-side: non è una firma crittografica delle immagini né un rendering server certificato.
- L’allegato verifica lavoro, fotolibro, laboratorio, DPA, stato spedizione e blocchi concorrenti. Errori post-upload/post-commit non liberano automaticamente il claim e non regrediscono un allegato già registrato. L’email di una spedizione fotolibro usa un blocco per evitare sovrapposizioni con il mockup; un errore dall’esito incerto richiede controllo, senza reinvio automatico.
- Limite per le scritture: 60 richieste ogni dieci minuti per identità/IP, riutilizzando la utility già esistente. Il controllo è in memoria per processo, non una quota commerciale distribuita.

## Renderer e riuso

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

Il renderer corrente è `client/public/mockups/girevole-v2/`; la cartella v1 è conservata. Le configurazioni v1 restano valide e mantengono il retro in tessuto. Nell’editor v2 la prima modifica di personalizzazione crea una configurazione con `assetRevision: 2`; la sola esplorazione non modifica il salvataggio.

- Il cursore **Estrai l’album** muove esclusivamente il libro e le sue personalizzazioni. Guide e pannelli trasparenti rimangono nel supporto. Prima dell’uscita il supporto si orienta a −90°; la rotazione viene sospesa finché l’album non è rientrato. L’inquadratura si adatta e **Ripristina vista** reinserisce l’album. Anche in sola lettura si può esplorare l’estrazione.
- In **Dettagli → Finitura retro** si sceglie tessuto oppure foto a tutta superficie su plexiglass. La seconda immagine e il suo ritaglio sono indipendenti dalla copertina. Nel gestionale il selettore **Foto da personalizzare** indirizza upload e scelta galleria alla copertina o al retro. Nella prova autonoma sono disponibili due input file distinti.
- I campi v2 sono `backCover`, `backPhotoAssetId`, `backCrop`. Il server esige una foto per il retro fotografico e controlla l’appartenenza di entrambe le immagini alla versione del fotolibro, anche quando un’immagine conservata non è attualmente visibile. Nessun nuovo endpoint, percorso Storage o permesso.
- La scheda confermata descrive il retro scelto; le otto viste includono il retro e due prospettive dell’album estratto. L’export ripristina l’estrazione e la rotazione visualizzate prima del download.
- Verifiche aggiunte: foto retro assente/estranea/di altra versione, ritaglio invalido, persistenza dei due asset, ripristino, estrazione senza modifiche da salvare, conferma ed estrazione in sola lettura.

### Revisione 3 — incisione botanica personalizzata

Il renderer corrente è `client/public/mockups/girevole-v3/`; v1 e v2 restano conservati. La placchetta riprende la composizione del riferimento: croce sottile, iniziale e nome nel quadrante superiore sinistro, secondo nome e iniziale in quello inferiore destro, rami negli altri due quadranti. È una ricostruzione vettoriale disegnata su Canvas, non un file esecutivo per incisione.

- I due campi nome generano automaticamente le iniziali; i nomi lunghi vengono adattati allo spazio disponibile. L’anteprima 2D e la texture 3D usano lo stesso disegno.
- La configurazione v3 salva `engravingNames.first` e `engravingNames.second`, ciascuno entro 50 caratteri. Il riepilogo e la scheda confermata riportano entrambi i nomi e la grafica scelta.
- Le configurazioni precedenti mantengono le due righe originali: non si interpretano automaticamente dediche o date come nomi. Nell’editor corrente l’inserimento dei nomi attiva la nuova grafica.
- Verificati salvataggio/ripristino, nomi accentati, aggiornamento dell’immagine, validazione dei limiti e conservazione delle configurazioni precedenti. Estrazione e retro fotografico restano disponibili.

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
- `npm run build`
- `npx tsc --noEmit --pretty false`: dopo l'allineamento al commit Replit `bce512fd` restano tre errori già presenti nel codice remoto in `server/follow-up-routes.ts`: `data`/`exists` alle righe 530/532 e il tipo dell'evento `followup_recovery_pending` alla riga 567. Non sono introdotti dai mockup.

Prima della pubblicazione verificare su ambiente di prova le regole effettivamente distribuite e il caricamento/scaricamento nel bucket reale. Le prove locali non certificano i permessi Firebase pubblicati o Safari/iOS.
