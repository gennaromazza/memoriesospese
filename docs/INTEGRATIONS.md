# Integrazioni esterne

## Regola generale

I nomi delle variabili d'ambiente sotto sono riferimenti di configurazione, non valori. I valori devono restare in Secrets/Environment e non nei commit o nei log.

## Firebase

### Firebase Web SDK

Usato dal client per:

- autenticazione;
- Firestore;
- Storage;
- accesso diretto alle collection consentite dalle rules.

La configurazione client usa variabili `VITE_FIREBASE_*` caricate dal root Vite `client`.

### Firebase Admin SDK

`server/firebase-admin.ts` inizializza l'SDK server con `FIREBASE_ADMIN_CREDENTIALS`. Il parser del progetto supporta il formato JSON puro e il formato base64 in base al modulo; non copiare la credenziale nei documenti.

L'Admin SDK bypassa Firestore rules. Ogni route Express che lo usa deve applicare autenticazione, autorizzazione e validazione proprie.

### Firebase Functions

La codebase `functions` usa Firebase Functions per email, metadata, proxy legacy e scheduler della coda email. `functions-retention` è una codebase separata per la manutenzione print-shop.

## Gmail / email

### Gmail via Replit Connector

`functions/src/gmail.ts` recupera l'access token Gmail tramite Replit Connectors API usando l'identità runtime `REPL_IDENTITY`; il token è messo in cache solo in memoria fino alla scadenza.

Il modulo costruisce messaggi RFC 2822 e usa Gmail API `users.messages.send`. L'invio applicativo passa normalmente da `EmailQueue`, non direttamente.

### Coda email

`functions/src/email-queue.ts`:

- salva su `emailQueue`;
- usa lock `locks/emailQueue`;
- processa batch di 10;
- applica limiti prudenziali per minuto/giorno;
- ritenta fino a tre tentativi;
- rischedula i fallimenti transitori dopo cinque minuti;
- marca `failed` dopo il massimo numero di tentativi.

La Function `processEmailQueue` viene eseguita ogni minuto in UTC. Il dispatcher bulk email Express è un meccanismo separato: non confondere le due code.

### Discrepanze email

README e codice storico citano SMTP/Netsons, ma il percorso principale in `functions/src/gmail.ts` usa Gmail API tramite connector. Prima di modificare il provider verificare tutti gli import e le Function effettivamente pubblicate.

`enqueue` è l'API autorevole per i nuovi chiamanti. `addEmailToQueue(to, subject, htmlContent)` resta disponibile come adapter di compatibilità per integrazioni legacy.

## Google Drive

`server/google-drive.ts` usa `@replit/connectors-sdk` con il connector `google-drive`. Il token OAuth non viene gestito dal modulo applicativo.

Funzioni principali:

- stato connessione;
- cartella backup `Image Studio Backups`;
- upload/list/download/delete backup JSON;
- cartella consegne laboratorio;
- cartelle spedizione e permessi;
- upload stream;
- sessioni resumable;
- aggiornamento contenuto;
- quota storage.

Le consegne laboratorio possono essere:

- condivise “chiunque abbia il link” in sola lettura;
- condivise con uno specifico account laboratorio, revocando vecchi permessi.

La session URI resumable è una credenziale temporanea: non loggarla né persisterla. Per upload dal browser l'`Origin` deve essere incluso nell'inizializzazione, altrimenti Google può bloccare i PUT per CORS.

## Google Calendar

`server/google-calendar.ts` usa Google Service Account con JWT e scope Calendar. Il client auth è cachato in memoria e i token vengono rinnovati dalla libreria Google.

Configurazione:

- credenziali dedicate tramite `GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_CALENDAR_PRIVATE_KEY`;
- fallback a `FIREBASE_ADMIN_CREDENTIALS` quando le credenziali dedicate non sono disponibili/valide;
- calendario target tramite `GOOGLE_CALENDAR_ID`;
- `primary` viene risolto al calendario configurato, perché il calendario primary del service account può essere vuoto.

Il calendario deve essere condiviso con il service account. Le date all-day devono essere interpretate nella timezone Europe/Rome; gli eventi all-day Google possono essere `transparent` e non devono essere trattati automaticamente come blocchi occupati.

Le associazioni evento/job sono salvate nel job in `linkedCalendarEventIds[]`; ogni modifica deve invalidare la cache calendario.

## Google Places

Il proxy server in `/api/places` usa `GOOGLE_PLACES_API_KEY`. È protetto per le funzioni applicative che richiedono autenticazione. Lo script `backfill:job-places` usa la stessa integrazione per arricchire i metadati luogo dei job.

Il backfill è dry-run di default e con `--apply` salva solo risultati italiani ad alta confidenza; non deve cambiare i testi originali della location.

## Gemini / Google Search Grounding

Real Wedding usa la chiave `GEMINI_API_KEY` lato server. Le fonti editoriali con consenso vengono selezionate prima della generazione. La ricerca dei fornitori è accessoria e non deve bloccare la bozza se fallisce.

Il flusso prevede:

- nessuna pubblicazione automatica;
- bozza valida obbligatoria;
- sanitizzazione/rendering Markdown lato pannello;
- verifica di match ad alta confidenza per URL ufficiali;
- cache tecnica `weddingVendorDirectory` con TTL descritti dal codice/README.

## PayPal

Il print shop usa `server/print-shop/paypal-orders.ts` e `PayPalOrdersClient`.

Configurazione tramite:

- `PAYPAL_CLIENT_ID`;
- `PAYPAL_CLIENT_SECRET`;
- `PAYPAL_ENVIRONMENT`;
- `PAYPAL_WEBHOOK_ID`.

Il router espone:

- configurazione pubblica limitata;
- create order;
- capture;
- webhook.

Il servizio salva eventi/capture/refund e usa fingerprint/idempotenza per evitare duplicazioni. Non considerare il solo stato client come prova di pagamento completato.

## Replit deployment e connettori

Il deploy Replit è autoscale e l'applicazione usa `SITE_URL` per callback/manutenzione. I connettori installati includono Gmail, Google Calendar, Google Drive e GitHub; il codice analizzato usa direttamente Drive e Gmail tramite pattern diversi, mentre Calendar usa il service account.

Non assumere che la presenza di un connettore installato significhi che ogni modulo lo utilizzi: seguire sempre gli import del codice.

## Firebase scheduler → Express retention

`functions-retention` esegue un heartbeat giornaliero:

- schedule `15 3 * * *`;
- timezone Europe/Rome;
- regione `europe-west1`;
- timeout e retry configurati nel codice;
- ID token Google-signed con audience esatta;
- POST verso l'endpoint di manutenzione risolto da `SITE_URL`.

La Function considera errore anche una risposta HTTP 200 che contiene la shell SPA o un envelope non completato, così il cleanup può essere ritentato.

## WordPress

`downloadWordPressImage` nella codebase Functions risponde `410 Gone` e indica il nuovo endpoint `/api/blog/rehost-image`. È quindi un endpoint legacy dismesso, non un proxy da riattivare.

## Email/URL e dati sensibili

- Non inserire credenziali, token, private key, session URI Drive o Bearer token nella documentazione.
- Non loggare il contenuto di `FIREBASE_ADMIN_CREDENTIALS`.
- Non confondere URL pubblici di gallerie/blog con token privati di quote, moduli, fotolibri o collaboratori.
- I dati cliente, fiscali, indirizzi e contenuti delle submission devono restare nei sistemi autorizzati.