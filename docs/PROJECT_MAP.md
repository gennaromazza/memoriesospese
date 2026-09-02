# Memorie Sospese — mappa del progetto

## Scopo di questo documento

Questa mappa descrive il repository osservato nel codice, non una progettazione ideale. I nomi storici presenti nel progetto — per esempio `wedding-gallery`, `Wedding Gallery` o `CoupleStory` — sono lasciati come tali quando sono parte dei contratti esistenti.

Le informazioni sono state ricavate da `package.json`, `.replit`, `server/index.ts`, `client/src/App.tsx`, `firebase.json`, `firestore.rules` e dai moduli citati sotto. Non sono riportati valori di segreti o credenziali.

## Struttura principale

```text
.
├── client/
│   ├── index.html
│   └── src/
│       ├── App.tsx                 # routing e provider React
│       ├── main.tsx                # bootstrap Wouter/base path
│       ├── pages/                  # pagine pubbliche, admin e token
│       ├── components/             # UI condivisa e aree gestionali
│       ├── features/               # moduli, incluso print-shop
│       ├── hooks/                  # accesso dati e comportamento UI
│       ├── context/                # Firebase Auth e contesto studio
│       ├── lib/                    # API client, Firebase e servizi
│       └── scripts/                # seed client-side importati dall'App
├── server/
│   ├── index.ts                    # entry point Express
│   ├── production-web.ts           # static client, fallback SPA e 404 API
│   ├── firebase-admin.ts           # Admin SDK
│   ├── *-routes.ts                 # router Express per dominio
│   ├── print-shop/                 # dominio ordini stampe
│   ├── booking/ e consultations/   # adattatori e logica calendario
│   ├── sync/ e workers/            # worker in-process
│   └── email-templates/            # template email server
├── shared/
│   ├── schema.ts                   # tipi/schema storici e questionari
│   ├── types.ts                    # tipi Firebase/general purpose
│   └── *-types.ts                  # contratti per domini più recenti
├── functions/
│   └── src/                        # Firebase Functions principali
├── functions-retention/
│   └── src/                        # Function schedulata retention print-shop
├── scripts/                        # CLI di test/backfill/manutenzione
├── patches/                        # patch eseguite dal workflow dev
├── attached_assets/                # asset caricati e immagini locali
├── docs/                           # questa knowledge base
├── firestore.rules
├── storage.rules
├── firebase.json
├── vite.config.ts
├── tsconfig*.json
└── package.json
```

## Frontend

`client/src/App.tsx` monta:

1. `ErrorBoundary`;
2. `QueryClientProvider` di TanStack Query;
3. `ThemeProvider`;
4. `TooltipProvider`;
5. `FirebaseAuthProvider`;
6. `StudioProvider`;
7. toaster, tracking pagina, cookie banner e contenuti.

Le pagine sono caricate quasi tutte con `lazyWithRetry`. In caso di errore di caricamento di un chunk, il client tenta un singolo reload usando `sessionStorage`; un secondo errore viene propagato.

Le aree frontend principali sono:

- sito pubblico: home, portfolio, storie, Real Wedding, blog, video, pagine informative;
- accesso e visualizzazione gallerie: `/gallery/:id`, `/view/:id`, `/accesso-galleria`, `/ospiti`;
- booking e consulenze: `/prenota`, `/consulenze/...` e alias inglesi;
- preventivi: `/quote/:token` e `/preventivo-rapido/:token`;
- moduli informativi: `/modulo/:token`;
- fotolibri: `/fotolibro/:token` e editor admin;
- gestione admin: dashboard, gallerie, lavori, consulenze, import, backup, audit, email e prodotti;
- print shop: catalogo, checkout, conferma e storico ordini;
- collaboratori: risposta assegnazione e dashboard tramite token.

Il router è Wouter. Le richieste API passano preferibilmente da URL relative; `client/src/lib/queryClient.ts` applica il base path alle URL che iniziano con `/api`, attende il ripristino di Firebase Auth e aggiunge il Bearer token solo per gli endpoint nell'allowlist.

## Backend Express

`server/index.ts`:

- configura Express, parsing JSON/form e `trust proxy`;
- applica CORS per domini autorizzati e domini Replit;
- monta le API prima di Vite o del client production;
- espone `/sitemap.xml` e `/api/health`;
- impedisce che API sconosciute ricevano l'HTML SPA;
- applica il prerender SEO ai bot;
- in sviluppo monta Vite in middleware mode;
- in production usa `mountProductionClient` da `server/production-web.ts`;
- avvia worker periodici e cleanup dopo `app.listen`;
- gestisce SIGTERM/SIGINT con shutdown dei worker.

Mount principali:

| Prefix | Modulo | Responsabilità |
|---|---|---|
| `/api/email` | `email-routes.ts` | email applicative e log |
| `/api/booking` | `booking-routes.ts` | campagne, disponibilità, booking |
| `/api/orders` | `order-routes.ts` | ordini gestionali |
| `/api/jobs` | `job-routes.ts` | lavori, timeline, dati collegati |
| `/api/payment-schedules` | `payment-schedule-routes.ts` | scadenze e incassi |
| `/api/quotes` | `quote-routes.ts` | preventivi e portali |
| `/api/import` | `import-routes.ts` | importazione dati |
| `/api/consultations` | `consultation-routes.ts` | consulenze e disponibilità |
| `/api/calendar` | `calendar-routes.ts` | integrazione Google Calendar |
| `/api/receipts` | `receipt-routes.ts` | ricevute |
| `/api/invoices` | `invoice-routes.ts` | fatture elettroniche/XML |
| `/api/places` | `places-routes.ts` | proxy Google Places |
| `/api` | `collaboratori-routes.ts`, `lab-routes.ts` | collaboratori, laboratori e spedizioni |
| `/api/products` | `products-routes.ts` | catalogo prodotti gestionale |
| `/api/migrations` | `migration-routes.ts` | migrazioni amministrative |
| `/api/admin` | `admin-routes.ts` | operazioni amministrative e worker |
| `/api/galleries` | `gallery-routes.ts` | operazioni scoped su gallerie/foto |
| `/api/bulk-email` | `bulk-email-routes.ts` | invii massivi |
| `/api/reminders` | `reminder-routes.ts` | reminder e inviti automatici |
| `/api/backup` | `backup-routes.ts` | backup Firestore e Drive |
| `/api/audit` | `audit-routes.ts` | audit/coerenza |
| `/api/gdpr` | `gdpr-routes.ts` | richieste GDPR |
| `/api/studio-assistant` | `studio-assistant-routes.ts` | suggerimenti gestionali |
| `/api/info-forms` | `info-form-routes.ts` | moduli informativi |
| `/api/photobooks` | `photobook-routes.ts` | fotolibri e revisione |
| `/api/blog` | `blog-routes.ts` | gestione blog e asset |
| `/api/wedding-seo` | `wedding-seo.ts` | Real Wedding |
| `/api/print-shop` | `print-shop/router.ts` | catalogo, ordini, PayPal, laboratori |

## Firebase

`firebase.json` configura:

- Firestore con `firestore.rules` e `firestore.indexes.json`;
- Hosting con pubblicazione `dist/app` e rewrite SPA;
- due codebase Functions:
  - `functions`, runtime Node 20;
  - `functions-retention`, runtime Node 22;
- Storage con `storage.rules`;
- emulatori Firestore `8080` e Storage `9199`.

In parallelo, il deploy Replit definito in `.replit` esegue il build del server/client e avvia `dist/index.js` in autoscale. Firebase Hosting/Functions sono quindi una configurazione separata dal processo Express usato dal deploy Replit.

## Moduli condivisi

`shared/schema.ts` contiene tipi e validazioni storiche per gallerie, interazioni, questionari, storie, portfolio, video, blog e CMS. I file più recenti separano i contratti per dominio:

- `wedding-seo-types.ts`;
- `jobs-types.ts`;
- `quotes-types.ts`;
- `payment-schedule-types.ts`;
- `info-form-types.ts`;
- `consultation-types.ts`;
- `calendar-types.ts`;
- `lab-types.ts`;
- `photobook-types.ts`;
- `print-shop-types.ts`, `print-shop-catalog.ts`;
- `collaboratori-types.ts`.

## Punti di ingresso

| Scenario | Comando/entry point |
|---|---|
| sviluppo Replit | workflow `node patches/fix-radix-compose-refs.cjs && npm run dev` |
| Express development | `tsx server/index.ts` |
| build | `npm run build` |
| server build | esbuild di `server/index.ts` verso `dist` |
| client build | Vite verso `dist/app` o base path production |
| production Replit | `NODE_ENV=production node dist/index.js` |
| Functions principali | `functions/src/index.ts` |
| retention scheduler | `functions-retention/src/index.ts` |

## Elementi da trattare come legacy o da verificare

- `README.md` contiene esempi e nomi non sempre allineati alla struttura attuale: riporta, tra l'altro, vecchi endpoint, `SMTP_*` e una descrizione “Firebase-Only”; non usarlo come unica fonte operativa.
- `shared/schema.ts` mantiene `CoupleStory`, mentre il flusso editoriale Real Wedding usa `WeddingSeoStory` in `shared/wedding-seo-types.ts`.
- Esistono sia `photos` globale sia `galleries/{galleryId}/photos`, oltre a riferimenti storici a `gallery-photos`.
- Esistono sia `clienti` sia riferimenti legacy a `clients`.
- Il client importa script di seed dall'albero React; la loro esecuzione e il loro impatto vanno considerati quando si modifica il bootstrap.
- La documentazione non dimostra da sola quali codebase Firebase siano effettivamente pubblicate in ogni ambiente: verificare il deploy prima di fare assunzioni operative.