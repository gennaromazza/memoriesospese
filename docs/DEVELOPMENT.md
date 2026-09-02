# Guida allo sviluppo

## Prerequisiti e runtime

Il progetto dichiara:

- Node.js `>=22` in `package.json`;
- modulo ECMAScript (`"type": "module"`);
- TypeScript;
- Vite 7;
- Express 4;
- React 18;
- Firebase Web/Admin SDK;
- Firebase Functions separate con runtime dichiarati in `firebase.json`.

`.replit` abilita anche PostgreSQL e Python, ma nel percorso applicativo documentato qui la persistenza principale è Firestore/Storage. Non sostituire il database senza una richiesta esplicita.

## Comandi

| Comando | Uso |
|---|---|
| `npm run dev` | Express + Vite in development |
| `npm run build` | build server e client |
| `npm run build:server` | bundle esbuild di `server/index.ts` |
| `npm run build:client` | build Vite |
| `npm run build:server:tsc` | controllo TypeScript server |
| `npm run test:rules` | emulatori Firestore/Storage + test rules |
| `npm run ai:wedding:test -- "URL"` | prova Real Wedding senza salvataggio/pubblicazione |
| `npm run backfill:job-places` | anteprima backfill luoghi |
| `npm run backfill:job-places -- --apply` | applicazione campi validi mancanti |
| `npm run preview` | preview Vite su porta 5000 |
| `npm start` | server production da `dist/index.js` |

Il repository non espone uno script npm generale per Vitest: i test unitari vengono eseguiti con `npx vitest run` e con config specifiche quando indicato dai file di test.

## Workflow Replit

Il workflow visibile è:

```bash
node patches/fix-radix-compose-refs.cjs && npm run dev
```

La porta attesa è 5000. Il workflow è la fonte corretta per la preview; il server ascolta su `0.0.0.0`.

Dopo modifiche a:

- `server/`;
- configurazioni;
- dipendenze;
- script di run;
- worker;

riavviare il workflow. Le modifiche client possono essere viste tramite HMR, salvo problemi di chunk/cache.

## Configurazione

### Variabili pubbliche client

Le variabili `VITE_*` finiscono nel bundle browser e non devono contenere segreti. Tra le configurazioni usate dal client ci sono quelle Firebase e `VITE_BASE_PATH`.

### Server/Functions

Il codice usa, tra le altre, variabili per:

- Firebase Admin;
- sito/URL pubblico;
- Gmail/Replit Connector;
- Google Calendar;
- Google Places;
- Gemini;
- PayPal;
- configurazione email/integrazioni legacy.

I nomi vanno cercati nel codice prima di aggiungerne uno nuovo. I valori vanno configurati tramite Secrets/Environment.

### Base path

Vite carica l'ambiente dalla directory `client`, imposta `/` in sviluppo e `VITE_BASE_PATH` in production. Il client applica lo stesso base path alle API relative. Non hardcodare host locali o domini Replit nelle chiamate applicative.

## Convenzioni di implementazione

### Route Express

Quando si aggiunge una route:

1. scegliere il router di dominio corretto;
2. montarlo in `server/index.ts` solo se necessario;
3. distinguere route pubblica, route autenticata e route admin;
4. validare body/query/parametri con Zod dove il modulo già usa Zod;
5. usare risposte JSON coerenti e status HTTP espliciti;
6. considerare timestamp e dati legacy;
7. aggiungere la route alla allowlist client se usa Firebase Auth;
8. aggiungere test per autorizzazione, errore e percorso nominale.

### Accesso Firestore

Per client-side:

- rispettare `firestore.rules`;
- non leggere dati sensibili pubblicamente;
- preferire i servizi/hook esistenti;
- considerare le collection legacy.

Per server-side:

- usare Admin SDK;
- applicare auth/admin server-side;
- usare transazioni per contatori, marker e idempotenza;
- aggiornare aggregati/timeline collegati;
- invalidare cache di dominio.

### Date

Usare le utility di dominio già presenti e specificare la timezone. Per Calendar e booking la timezone operativa è Europe/Rome. Non trasformare date all-day in ISO UTC senza verificare lo shift.

### Email

Preferire l'accodamento esistente invece dell'invio sincrono. Usare marker idempotenti prima dell'invio per scheduler e mantenere i template separati dalla logica di dominio.

### Asset

Tracciare path Storage e lifecycle. Non loggare token temporanei o session URI Drive. Per file grandi preferire i flussi resumable già presenti.

## Sviluppo di Real Wedding

Il flusso corretto è:

1. caricare il contesto editoriale dal server;
2. mostrare fonti con consenso e distinguere submission storiche;
3. permettere selezione manuale di risposte e foto;
4. chiamare l'AI solo sulla selezione;
5. validare la bozza;
6. salvare `draft`;
7. permettere revisione umana;
8. pubblicare esplicitamente.

Non aggiungere dati non presenti nelle fonti, URL provider non verificati o pubblicazione implicita.

## Modifiche ai contenuti blog

I contenuti grandi possono vivere in Storage tramite `contentUrl`/`contentStoragePath`. Ogni sostituzione deve gestire:

- vecchio path;
- immagini inserite;
- copertina;
- pubblicazione e `publishedAt`;
- cleanup solo dopo la persistenza valida del nuovo documento.

## Modifiche al print shop

Usare `PrintShopService` e i contratti `shared/print-shop-*`. Per ogni mutazione considerare:

- autenticazione cliente/admin;
- fingerprint del quote;
- consenso legale;
- idempotency key;
- stato PayPal;
- cassa;
- asset Storage;
- spedizione Drive;
- email;
- retention.

## Build e controllo locale

Prima di consegnare una modifica:

```bash
npm run build
npx tsc --noEmit
npx vitest run
```

Usare `npm run build:server:tsc` se la modifica è server-focused e `npm run test:rules` per modifiche a rules o accessi Web SDK. Il comando `npx tsc --noEmit` può richiedere la configurazione corretta del progetto; seguire eventuali config già presenti invece di introdurre nuovi script.

## Checklist PR/commit

- [ ] comportamento richiesto coperto da UI e backend;
- [ ] route protetta aggiunta all'allowlist client;
- [ ] nessun segreto nel codice, docs o log;
- [ ] dati legacy considerati;
- [ ] write-path aggiorna aggregati/timeline/cache;
- [ ] operazione idempotente se richiamabile da worker/webhook;
- [ ] build/typecheck/test pertinenti eseguiti;
- [ ] workflow riavviato dopo modifiche server/config;
- [ ] `git diff --stat` e `git diff -- docs` controllati;
- [ ] nessun file applicativo modificato per una modifica documentale.