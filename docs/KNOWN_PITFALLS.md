# Problemi noti, legacy e trappole operative

Questo elenco riporta comportamenti verificati nel repository o discrepanze che possono causare regressioni. Non è un elenco di bug da correggere automaticamente.

## Avvio e deploy

### Il workflow dev applica una patch prima di avviare l'app

Il workflow configurato esegue `node patches/fix-radix-compose-refs.cjs && npm run dev`. Avviare solo `npm run dev` può produrre un ambiente diverso da quello visto in preview.

### Il server Express non usa watch server

`npm run dev` esegue `tsx server/index.ts` senza watch. Le modifiche in `server/` richiedono un restart del workflow; Vite aggiorna invece il client.

### Worker avviati dentro ogni istanza

Reminder, bulk email, sync Calendar, retry cancellazioni e retention partono dal callback di `app.listen`. In autoscale più istanze possono eseguire lo stesso intervallo: le operazioni devono restare idempotenti.

### Cleanup nel callback `listen`

Il callback di ascolto esegue anche `cleanupStaleJobs()` con `await`. Un errore o una regressione in un cleanup di bootstrap può influire sulla prontezza percepita dell'istanza. Non spostare o rendere sincrone queste operazioni senza testare cold start e health check.

### Due percorsi di hosting

`.replit` deploya `dist/index.js`; `firebase.json` configura Hosting verso `dist/app`. Non applicare una modifica di cache/rewrite a un percorso assumendo che l'altro sia coinvolto.

## Auth e API

### Allowlist client per endpoint autenticati

Le API nuove devono essere aggiunte agli endpoint protetti in `client/src/lib/queryClient.ts`. In caso contrario il client può chiamare Express senza Bearer token al primo caricamento o in una mutation.

### Regole Firestore e Admin SDK non sono lo stesso confine

Le rules proteggono accessi Web SDK. Express con Admin SDK bypassa le rules. Una route che legge dati sensibili deve avere middleware auth/admin proprio.

### Middleware auth non uniforme nei moduli legacy

Esistono route con `authenticateFirebase` senza `requireAdmin`, route pubbliche a token e middleware specifici per print-shop/maintenance. Prima di aggiungere una route o riusare un middleware leggere l'intero router e non dedurre il ruolo dal prefix.

### Placeholder nei token questionario

La funzione `hasValidToken` nelle rules è esplicitamente un placeholder. La validazione server-side resta necessaria; non trattare la rule come prova di isolamento tra ruoli o gallerie.

### Fallback SPA per API

Una API sconosciuta non deve ricevere `index.html`. `apiNotFoundHandler` è montato prima del client proprio per mantenere distinguibili errori API e routing frontend.

## Firestore e dati legacy

### Foto in più collection

`photos`, `galleries/*/photos` e riferimenti `gallery-photos` convivono. Le query ordinate possono escludere documenti senza il campo di ordinamento; i percorsi galleria usano riconciliazioni e deduplica. Non eliminare la query legacy senza verificare `photoCount` e lightbox.

### Campo `password` galleria storico

Le rules descrivono `gallerySecrets` come sede di password/PIN, ma una Function legacy legge ancora `galleries.password`. Serve una decisione/migrazione esplicita prima di rimuovere il campo storico.

### `clienti` contro `clients`

Il modello gestionale attuale usa `clienti`; alcuni percorsi reminder fanno riferimento a `clients`. Non rinominare collection “per coerenza” senza verificare dati e job esistenti.

### Story legacy contro Real Wedding

`coupleStories`/`CoupleStory` è un sistema diverso da `weddingSeoStories`/`WeddingSeoStory`. Il primo è importabile da JSON; il secondo è un flusso editoriale draft/published.

### Snapshot prezzi

Un preventivo deve conservare il prezzo override/omaggio deciso dall'admin. Rileggere il catalogo al momento di creazione o visualizzazione può cambiare retroattivamente il contratto.

### Aggregati denormalizzati

`quoteStatus`, `transactionCount` e alcuni `financials` sono aggregati/denormalizzati. I dati autorevoli per gli incassi sono i record delle scadenze e dei movimenti secondo il dominio; dopo ogni nuovo write-path verificare gli aggiornamenti correlati.

### Timestamp serializzati

Le API Admin SDK possono restituire `{_seconds, _nanoseconds}`; il Web SDK espone oggetti Timestamp con metodi. Chiamare `.toDate()` senza normalizzazione può rompere filtri e ordinamenti.

### Array annidati Firestore

Firestore rifiuta array-di-array. Strutture come punti o gruppi devono essere serializzate con mappe intermedie e riconvertite in lettura.

### Collection duplicate di selezione

Le rules includono sia `photo_selections` sia `photoSelections`. Prima di consolidare verificare quali UI e dati storici usano ciascuna grafia.

## Date e calendario

### All-day e UTC

Una data all-day va estratta in Europe/Rome prima della conversione a stringa di giorno. Usare `toISOString().split('T')[0]` può spostare l'evento al giorno precedente.

### Google all-day transparent

Un evento all-day Google può avere trasparenza `transparent`. Un filtro che cerca soltanto eventi occupati rischia di nascondere o bloccare erroneamente la disponibilità.

### Associazioni Calendar/job

Gli ID evento sono memorizzati nel job. Dopo un link/unlink va invalidata la cache del calendario, altrimenti la UI può mostrare dati vecchi per il TTL della cache.

## Upload e asset

### Session URI Drive

La URI della sessione resumable è autorizzata e sensibile. Non loggarla o salvarla in Firestore.

### Origin obbligatorio per upload browser→Drive

La sessione resumable inizializzata senza header `Origin` può restituire un URI che non consente i PUT cross-origin dal browser.

### Blog asset lifecycle

Per i post blog vanno tracciati i path Storage. Il documento Firestore deve essere scritto prima del cleanup; upload fuori sessione o asset orfani devono essere invalidati/eliminati con cautela.

### Thumbnails

Le miniature sono generate server-side, possono riguardare due collezioni foto e non devono sovrascrivere l'originale. I fallimenti permanenti devono essere distinguibili dai retry temporanei.

## Email e scheduler

### Due sistemi di coda

Firebase `processEmailQueue` (ogni minuto) e bulk email dispatcher Express (ogni 30 secondi) sono percorsi diversi. Non contare un marker dell'uno come idempotenza dell'altro.

### API della coda email non allineata tra file

`functions/src/index.ts` usa il nome `EmailQueue.addEmailToQueue`, mentre il modulo `functions/src/email-queue.ts` letto nel repository espone `EmailQueue.enqueue`. È una discrepanza concreta da verificare rispetto al build/deploy effettivo delle Functions; non correggerla implicitamente durante modifiche non correlate.

### Marker prima dell'invio

Per invii automatici, il marker idempotente va scritto prima dell'invio e rollbackato solo se l'invio fallisce. Dopo l'invio, la timeline è best-effort e non deve causare un secondo invio.

### Email pubbliche

Alcune Cloud Functions storiche accettano richieste guest o pubbliche e incorporano dati nel body. Nuove integrazioni devono usare le route correnti e non assumere che il controllo sia uniforme tra Function e Express.

## Real Wedding

### Nessuna pubblicazione automatica

La generazione produce una bozza. `published` deve essere una scelta editoriale esplicita; non aggiungere side effect di pubblicazione a una chiamata AI.

### Nessun dettaglio inventato

Le fonti passate al modello devono essere selezionate e dotate di consenso. Un provider senza match ufficiale resta senza URL; errori di ricerca fornitori non devono produrre fatti inventati.

### Markdown/HTML

Il testo AI è contenuto non fidato. Renderizzare solo Markdown sanitizzato e non inserire HTML raw nel DOM.

### Slug

Lo slug può essere derivato dal titolo finché l'admin non lo personalizza; una volta personalizzato non deve essere riscritto automaticamente da ogni modifica al titolo.

## Print shop

### PayPal non è solo frontend

Create/capture/webhook devono essere riconciliati server-side, con idempotenza e verifica importo/fingerprint. Non segnare un ordine pagato solo perché il client ha completato una schermata.

### Ordini print-shop separati

Le rules impediscono ai vecchi flussi diretti su `orders` di mutare gli ordini con `orderType: print_shop`. Usare `PrintShopService` e le route dedicate.

### Retention 90 giorni

La cancellazione degli originali avviene dopo la consegna secondo la logica retention. Non confondere gli originali con preview, file di laboratorio o dati necessari alla cronologia ordine.

## README non autorevole

Il README contiene valori e descrizioni storiche non perfettamente allineati al codice attuale: vecchio brand, SMTP, endpoint e struttura. È utile come contesto, non come contratto operativo.