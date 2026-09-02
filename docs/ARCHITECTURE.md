# Architettura tecnica

## Vista d'insieme

Memorie Sospese è una SPA React/TypeScript con backend Express e persistenza Firebase. Il sistema non è un monolite con un solo confine di autorizzazione:

```text
Browser
  ├─ React + Wouter + Firebase Web SDK
  │    ├─ letture/scritture Firestore consentite dalle rules
  │    ├─ Firebase Storage secondo storage.rules
  │    └─ fetch relativo verso /api
  │
  └─ Express
       ├─ middleware auth/admin e validazione
       ├─ Firebase Admin SDK
       ├─ Google Calendar Service Account
       ├─ Replit Connectors → Google Drive/Gmail
       ├─ PayPal Orders API
       ├─ Google Places / Gemini
       └─ client Vite o static build

Firebase Functions
  ├─ email/notifiche e proxy legacy
  └─ scheduler retention print-shop → endpoint Express con OIDC
```

## Frontend

### Bootstrap

`client/src/main.tsx` crea il root React e normalizza il base path. `App.tsx` configura provider, route e lazy loading.

Il client usa:

- Firebase Web SDK per Auth, Firestore e Storage;
- TanStack Query per le richieste HTTP e caching;
- Wouter per il routing;
- React Hook Form/Zod in diversi form;
- componenti Radix/shadcn e Tailwind;
- `DOMPurify` nei punti che renderizzano HTML controllato;
- `luxon`, `date-fns` e utility locali per date/zone.

### Comunicazione API

`client/src/lib/queryClient.ts`:

- costruisce URL relative compatibili con il base path;
- aspetta `auth.authStateReady()` prima di ottenere il token;
- aggiunge `Authorization: Bearer ...` agli endpoint protetti;
- aggiunge alcuni dati utente legacy nel body per route di like/commenti/voice memo;
- considera pubblici alcuni endpoint di consulenza e template;
- non ritenta automaticamente query o mutation;
- usa `staleTime` di cinque minuti e non fa refetch al focus.

**Conseguenza:** una nuova route autenticata deve essere aggiunta alla allowlist client, altrimenti la UI può inviarla senza token. Le route pubbliche devono invece essere escluse dalle eccezioni corrette, soprattutto per consulenze e token.

## Backend e ordine dei middleware

L'ordine in `server/index.ts` è parte del comportamento:

1. parsing body;
2. route immagine profilo;
3. CORS;
4. API domain router;
5. protezione noindex per `/modulo` e checkout/storico shop;
6. sitemap;
7. health check;
8. `apiNotFoundHandler`;
9. SEO prerender per bot;
10. client production oppure middleware Vite.

Le API sono intenzionalmente montate prima della SPA. `apiNotFoundHandler` impedisce di mascherare un endpoint inesistente con `index.html`.

### Production web

`server/production-web.ts` gestisce il client già compilato. Il fallback SPA non deve trasformare una richiesta API sconosciuta in HTML. Gli asset mancanti hanno gestione distinta dal fallback applicativo; verificare questo modulo prima di cambiare cache o rewrites.

### Sviluppo

In development Express importa Vite dinamicamente in middleware mode. La configurazione Vite usa:

- root `client`;
- alias `@`, `@shared`, `@assets`;
- host `0.0.0.0`;
- `allowedHosts: true`;
- base `/` in development;
- base `VITE_BASE_PATH` in production;
- code splitting manuale per React, Firebase, grafici, PDF, Radix e altri gruppi.

## Autenticazione e autorizzazione

Ci sono tre meccanismi distinti:

1. **Firebase Auth** nel client e Bearer token verso Express.
2. **Firebase rules** per gli accessi diretti dal Web SDK.
3. **Token applicativi** per portali pubblici: quote, moduli informativi, fotolibri, collaboratori e questionari.

Il server usa l'Admin SDK e quindi bypassa le Firestore rules; le route Express devono applicare il proprio controllo. `firestore.rules` non è una sostituzione dell'autorizzazione server-side.

La funzione `isAdmin()` nelle rules si basa sull'identità email presente nel token Firebase, non su un flag modificabile nel documento profilo. Nel backend esistono inoltre middleware come `authenticateFirebase`, `requireAdmin`, `verifyAdmin`, autenticazione cliente print-shop e autenticazione OIDC della manutenzione.

## Persistenza

### Firestore client-side

Il client accede direttamente, dove consentito, a collezioni come `galleries`, `photos`, `comments`, `likes`, `voiceMemos`, `users`, `passwordRequests`, `jobs`, `quotes`, `orders`, `paymentSchedules`, `cashMovements`, `portfolioSelections` e altre.

### Firestore server-side

Il server usa `server/firebase-admin.ts` per:

- leggere/scrivere dati gestionali sensibili;
- eseguire transazioni;
- aggiornare aggregati e timeline;
- interrogare dati per SEO;
- gestire ordini shop e idempotenza;
- coordinare Drive, email, PayPal e calendario.

### Storage

Firebase Storage contiene foto, asset blog, asset print-shop e file correlati ai fotolibri. Le route server possono usare Admin SDK; il browser può usare SDK client o caricare direttamente su una sessione Drive resumable quando previsto.

## Worker in-process

Dopo l'avvio del listener Express vengono avviati:

- retry worker per cancellazioni booking;
- Event Sync Guard ogni dieci minuti;
- cleanup dei bulk email stale job all'avvio e ogni dieci minuti;
- bulk email dispatcher ogni trenta secondi;
- reminder scheduler, prima esecuzione dopo due minuti e poi ogni ora;
- controllo inviti automatici per consulenza visione;
- scadenza consegne laboratorio;
- retention degli originali print-shop.

Il processo gestisce lo shutdown per SIGTERM/SIGINT. Questi worker sono locali all'istanza Express: in autoscale possono esistere più istanze, perciò le operazioni devono restare idempotenti e usare marker/lock quando il codice li prevede.

## SEO e contenuti pubblici

`server/seo-prerender.ts` riconosce i bot dal User-Agent, esclude i percorsi non prerenderizzabili e genera HTML con metadata/body pre-renderizzato per:

- Real Wedding pubblicati;
- blog;
- portfolio;
- pagine statiche.

`server/sitemap-generator.ts` legge blog e Real Wedding pubblicabili. Le pagine con token e le aree personali ricevono `X-Robots-Tag: noindex, nofollow, noarchive` dal server.

## Real Wedding

Il flusso corrente è distinto dal legacy `CoupleStory`:

1. il server carica galleria, job, cliente, risposte dei moduli e foto selezionabili;
2. l'editor sceglie esplicitamente fonti e foto;
3. Gemini produce una bozza;
4. la bozza viene salvata come `draft`;
5. l'admin modifica/revisiona;
6. solo una pubblicazione esplicita porta lo stato a `published`;
7. il prerender e la sitemap espongono solo storie pubblicate.

Il contratto di `WeddingSeoStory` conserva `galleryId`, `jobId`, slug, testo SEO, foto selezionate, fonti approvate e stato. Le informazioni pubbliche vengono ridotte al contratto `PublicWeddingStory`.

## Print shop

Il modulo `server/print-shop/router.ts` delega la logica a `PrintShopService`. Il dominio coordina:

- catalogo e prezzi;
- ordini cliente;
- caricamento/finalizzazione asset;
- consenso legale;
- quote e fingerprint;
- PayPal create/capture/webhook;
- stati di evasione;
- laboratori e spedizioni;
- costi;
- Drive;
- email;
- retention.

Il backend impedisce che gli ordini `print_shop` vengano modificati dai vecchi flussi Firestore client-side. Il servizio applica le proprie invarianti con Admin SDK e idempotency key.

## Firebase Functions

`functions/src/index.ts` esporta funzioni email, metadata galleria, proxy WordPress dismesso, coda email e statistiche. Molte funzioni usano `EmailQueue`, che salva su Firestore e invia tramite Gmail API.

`functions-retention/src/index.ts` espone una Function schedulata alle 03:15 Europe/Rome in `europe-west1`. Ottiene un ID token Google-signed per chiamare l'endpoint di manutenzione Express; considera fallimento sia un HTTP non 2xx sia una risposta non valida o `{ok:false}`.

## Configurazione e deploy

Il deploy Replit è:

```text
build: npm run build
run:   NODE_ENV=production node dist/index.js
target: autoscale
```

Il workflow dev esegue prima una patch Radix e poi `npm run dev`, aspettando la porta 5000. Firebase Hosting ha una propria configurazione e pubblica `dist/app`; non assumere che il deploy Hosting e quello Replit siano la stessa pipeline.

## Vincoli architetturali

- usare URL relative per il backend dello stesso progetto;
- non portare token OAuth nel codice applicativo quando esiste il proxy Connectors;
- non usare Firestore rules come autorizzazione sufficiente per una route Admin SDK;
- non introdurre nuove collection o stati senza considerare i dati legacy;
- trattare i Timestamp ricevuti da API come serializzati e non sempre come oggetti `.toDate()`;
- invalidare le cache di dominio quando cambiano associazioni calendario/job;
- mantenere idempotenti worker, webhook e operazioni tra Firestore e servizi esterni.