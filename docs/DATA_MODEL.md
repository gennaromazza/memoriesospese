# Modello dati

## Note generali

Firestore è schemaless a runtime. I tipi TypeScript/Zod documentano il contratto atteso ma non garantiscono che tutti i documenti storici lo rispettino. Questo documento quindi distingue:

- collezioni osservate nelle rules o negli accessi server/client;
- campi definiti dai tipi;
- compatibilità e discrepanze note.

I Timestamp possono arrivare:

- dal Web SDK come oggetto Timestamp;
- dalle API Admin SDK serializzati, tipicamente con `_seconds`/`_nanoseconds`;
- nei tipi condivisi come `FirebaseTimestamp`.

I parser di data devono gestire tutti i formati usati dal relativo confine.

## Relazioni concettuali

```text
clienti ──< jobs ──< quotes
    │          ├──< paymentSchedules
    │          ├──< jobTimeline
    │          ├──< consultations
    │          └──< galleries ──< photos
    │                         ├──< chapters (legacy/subcollection)
    │                         ├──< comments / voiceMemos
    │                         └── selection fields
    │
bookings ──> clienti, campaign, job/order opzionali
quotes ──> orders / job
orders ──> clienti, assets, labShipments
galleries ──> weddingSeoStories, questionnaires, info-form submissions
```

I collegamenti sono normalmente ID in campi documento, non foreign key enforceate da Firestore.

## Anagrafiche e gallerie

### `users`

Profilo Firebase/applicativo. `shared/schema.ts` e `shared/types.ts` usano campi come `email`, `name`, `isAdmin`, immagini profilo, date di creazione/login e, nei documenti più recenti, ruolo/permessi.

Le rules permettono al proprietario di leggere il proprio documento e all'admin di gestire tutti i profili. Un utente non può promuoversi alterando il campo `role`.

### `clienti`

Anagrafica gestionale sensibile: contatti, dati personali, indirizzi e riferimenti ai lavori. Accesso diretto Firestore solo admin secondo le rules. È il nome canonico nei moduli gestionali attuali.

### `clients`

Riferimento legacy presente almeno in codice reminder. Non assumere che sia un alias pienamente migrato di `clienti`; verificare il dataset prima di modificare quel percorso.

### `galleries`

Campi principali tipizzati:

- `name`, `code`, `date`, `location`, `description`;
- `photoCount`, `active`, `userId`;
- copertine desktop/mobile e URL YouTube legacy/multipli;
- `bookingId` e possibili collegamenti a job;
- configurazione selezione foto;
- `productRequirements`, `photoAssignments`;
- dati questionario/coppia in alcune estensioni;
- timestamp.

Password e PIN sono documentati come separati in `gallerySecrets` nelle rules attuali. Esistono però funzioni legacy in `functions/src/index.ts` che leggono `galleries/{id}.password`. Questa è una discrepanza da non “risolvere” implicitamente: prima di migrare o rimuovere campi serve verificare quali Function siano realmente attive e quali documenti storici esistano.

### `gallerySecrets`

Documento per galleria, destinato a password/PIN. Le rules lo rendono admin-only. Non documentare o inserire qui valori reali.

### Foto

Sono presenti più forme:

- `photos/{photoId}` globale, con `galleryId`, URL, nome, dimensione, MIME, uploader e opzionali `chapterId`/`chapterPosition`;
- `galleries/{galleryId}/photos/{photoId}` legacy;
- riferimenti storici a `gallery-photos`.

Il codice tratta le foto legacy prive di `chapterId` e quelle globali in percorsi differenti. Gli ID sintetici `legacy-*` vengono riconosciuti in alcuni flussi SEO/fotolibro.

### `galleries/{galleryId}/chapters`

Capitoli della galleria con titolo, descrizione, posizione e contatore. La presenza è usata dal pannello admin e dalla galleria; la compatibilità con foto globali/legacy richiede deduplica e riconciliazione.

## Interazioni e accesso

### `comments`

Commenti globali con `itemId`, `itemType` (`photo` o `voice_memo`), `galleryId`, identità visualizzata, testo/contenuto e timestamp. `shared/schema.ts` mantiene sia `content` sia alias `text`.

### `likes`

Like per item/galleria e utente. Il client usa anche query per `photoId` in alcuni contesti; verificare i nomi effettivi dei campi prima di aggiungere indici o query.

### `voiceMemos`

Messaggi vocali globali o legacy sotto galleria, con guest, URL audio, messaggio, data sblocco, file, dimensione, durata, stato sblocco e timestamp. La creazione anonima è consentita dalle rules attuali.

### `subscriptions`, `email-notifications`

Iscrizioni a notifiche e notifiche email. Contengono almeno galleria, email/stato e timestamp nei percorsi documentati dalle rules.

### `passwordRequests`, `gallery-access`

Richieste pubbliche di accesso a una galleria. `passwordRequests` è tipizzato con galleria, nome, cognome, email, relazione, stato e timestamp. La gestione è admin.

## Questionari

Collezioni:

- `faqSets`;
- `questionnaireTokens`;
- `validationSessions`;
- `rateLimits`;
- `distributedLocks`;
- `galleries/{galleryId}/questionnaires/{questionnaireId}`;
- sotto-collezioni `answers/{role}` e `drafts/{role}`.

Il modello include:

- set di domande versionati `q1`–`q20`;
- token hashati, ruolo `bride`/`groom`, scadenza e revoca;
- stato per ruolo e progresso;
- bozze con optimistic locking;
- risposte definitive;
- sessioni temporanee di validazione.

**Discrepanza di sicurezza:** nelle rules il controllo `hasValidToken` è un placeholder che ritorna `true` quando la richiesta ha un token/ruolo compatibile con la funzione. Il server deve restare il confine autorevole; non allargare l'accesso client basandosi solo sul commento della rule.

## Job, preventivi e pagamenti

### `jobs`

Il tipo `Job` condiviso include almeno:

- `clienteId`;
- `jobType`, titolo, descrizione;
- data evento/creazione;
- stato e opzionale `workflowState`;
- note e note per foto.

I percorsi recenti supportano più clienti tramite campi come `clientiIds`, oltre a riferimenti a gallery, quote, booking, consulenze, collaboratori e timeline.

### `jobTypes`, `jobProvenances`

Anagrafiche configurabili per tipo di lavoro e provenienza. I tipi di lavoro sono leggibili pubblicamente per alcune pagine di prenotazione; la provenienza è destinata a utenti autenticati.

### `quotes`

Preventivo collegato a un job tramite `jobId`, con prodotti, totali, stato, firma/contratto, token pubblico e snapshot prezzo. Il portale pubblico aggiorna solo i campi consentiti dal workflow firma secondo le rules; l'admin gestisce il resto.

Il prezzo deciso per un preventivo deve essere trattato come snapshot, non ricalcolato dal catalogo corrente.

### `quoteTemplates`, `contractClauses`, `quickQuoteSubmissions`, `quoteAuditLog`

- template riutilizzabili;
- clausole contrattuali;
- invii del preventivo rapido;
- log immutabile delle modifiche manuali/status e override firma.

### `paymentSchedules`

Scadenze/quote di pagamento collegate a job e cliente. Il cliente collegato può leggere il proprio documento; solo l'admin modifica o elimina. Gli aggregati finanziari non sono tutti autorevoli: gli incassi reali vanno ricostruiti dai record di pagamento previsti dal codice.

### `cashMovements`, `receipts`, `invoices`, `invoiceIdempotency`, `counters`

Contabilità, ricevute e fatture. Le fatture e la loro idempotenza sono immutabili nelle rules dopo la creazione; i documenti contengono snapshot fiscali/XML.

## Booking e consulenze

### `booking_campaigns`

Campagne/configurazioni per prenotazione, leggibili dalle pagine pubbliche e gestite dall'admin.

### `bookings`

Richieste/slot prenotati. Il pubblico può creare; solo admin legge l'insieme e modifica stato/approvazione secondo le rules. I route server gestiscono anche disponibilità, eventi Calendar, cancellazioni e email.

### `consultationTemplates`, `consultations`

Template di consulenza, richieste pubbliche e workflow di approvazione/conversione in job. Le richieste contengono PII e la lettura è admin-only nelle rules.

### `conflict_overrides`

Override espliciti per conflitti calendario, usati dall'area consulenze.

## Contenuti pubblici

### `portfolioSelections`

Collegamento di una foto di galleria al portfolio: galleria, foto, URL, categoria, featured, ordine, caption, nome cliente opzionale e data evento.

### `weddingVideos`

Video con titolo, slug, descrizione, thumbnail, URL YouTube, durata, categoria/tag, featured, ordine, views e active.

### `blogPosts`

Campi principali:

- titolo, slug, excerpt e contenuto;
- `contentUrl`/`contentStoragePath` per contenuti grandi;
- path delle immagini inserite e copertina;
- `seoContent`;
- stato `draft`/`published`/`archived`;
- categoria/tag/autore;
- date e metadata import WordPress.

`blogSlugs` riserva gli slug in modo atomico lato admin. `publishedAt` rappresenta la pubblicazione; il lifecycle asset è indipendente dal testo e richiede cleanup sicuro dei path.

### `siteContent`, `slideshow`

CMS per sezioni pubbliche e immagini slideshow. I contenuti pubblici sono leggibili, la gestione è admin.

## Real Wedding

### `weddingSeoStories`

Il contratto corrente (`shared/wedding-seo-types.ts`) è:

- `galleryId`, `jobId`;
- `status`: `draft` o `published`;
- `slug`, `title`, `excerpt`, `story`;
- `seoTitle`, `seoDescription`;
- `selectedPhotoIds`, opzionale `coverPhotoId`;
- `approvedSourceIds`;
- timestamp di creazione/aggiornamento/pubblicazione.

Le fonti editoriali non sono necessariamente persistite come collection separata: il server le ricostruisce da submission, job, cliente e galleria. `WeddingStorySource` identifica submission, campo, label, valore, cliente, categoria e consenso; può indicare import legacy.

### `weddingVendorDirectory`

Cache tecnica dei risultati di verifica fornitori Google Search Grounding. Il README descrive TTL diversi per match e mancati match e nessuna cache negativa per timeout/errori; questa regola operativa è implementata nella logica Real Wedding, non in un tipo Firestore centrale.

## Laboratori e fotolibri

### `labs`, `labShipments`

Anagrafiche laboratori e spedizioni di file. Le spedizioni collegano job/ordine, stato, scadenza, file e riferimenti Drive. I file transitori vengono eliminati alla scadenza.

### `photobooks`

Fotolibri con pagine/file, revisione cliente tramite token, marker e istruzioni laboratorio. Le pagine possono essere trasferite byte-per-byte su Drive.

## Print shop

Il servizio usa almeno:

- `orders` con discriminante `orderType: print_shop`;
- `assets`;
- `legalAcceptances`;
- `printShopIdempotency`;
- `printShopPaymentCaptures`;
- `printShopPaymentEvents`;
- `printShopPaymentRefunds`;
- `products`;
- `settings/printShop`;
- `labs`, `labShipments`;
- `cashMovements`;
- `clienti`.

Gli asset hanno path Storage con prefisso `print-orders/`. La retention elimina gli originali 90 giorni dopo la consegna, secondo il servizio.

## Email, audit e sistema

Altre collection osservate:

- `emailQueue`, `emailLogs`, `reviewEmailLogs`;
- `emailTemplates`, `bulkEmailJobs`, `emailQuota`;
- `adminNotifications`, `systemAlerts`, `dismissedSuggestions`;
- `jobTimeline`;
- `locks/emailQueue`.

La coda email ha stato, tentativi, schedulazione, metadata e timestamp. Il lock distribuito e la coda sono due concetti diversi: le rules/collection storiche `distributedLocks` non sostituiscono necessariamente `locks/emailQueue`.

## Nomi ambigui o legacy da non unificare automaticamente

| Nome | Osservazione |
|---|---|
| `photos` / `galleries/*/photos` / `gallery-photos` | coesistono; il codice contiene riconciliazioni e compatibilità |
| `clienti` / `clients` | il gestionale usa `clienti`, alcuni percorsi legacy usano `clients` |
| `coupleStories` / `weddingSeoStories` | il primo è il formato story legacy, il secondo Real Wedding editoriale |
| `photo_selections` / `photoSelections` | rules dedicate a entrambe le grafie |
| `studio-settings` / `settings` | struttura settings storica e nuova |
| `galleries.password` / `gallerySecrets` | codice legacy e regola attuale non coincidono |