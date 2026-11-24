# Gallerie cliente più veloci: diagnosi e piano

Data: 24 novembre 2026 · Ramo: `claude/debug-gallery-performance-07b658` · Nessun codice modificato · Fase 0 fatta.

Perimetro: la pagina pubblica `/view/:code` (`artifacts/image-studio-web/src/pages/Gallery.tsx`), il caricamento di foto e miniature, la lightbox, e i due punti di upload (pannello web e app desktop) che decidono se una foto ha la miniatura.

Metodo: lettura del codice, poi confronto pezzo per pezzo con DeepSeek (4 pezzi: dati, immagini, rendering, architettura; ha risposto il modello di ripiego DeepSeek 3.2) e con Gemini 3.1 Pro. Poi la Fase 0: misure in sola lettura sui dati veri e sul sito pubblicato (risultati sotto).

## Risultati della Fase 0 (24 novembre 2026, sola lettura)

Come: lettura di gallerie e foto con l'accesso pubblico, lo stesso del browser di un cliente (nessuna chiave segreta, nessuna scrittura, circa 66.000 letture Firestore: pochi centesimi). Intestazioni HTTP su un campione di 48 originali e 24 miniature. Una galleria vera da 359 foto, aperta nel browser integrato su connessione veloce. Gli script e i dettagli per galleria (anonimi) sono rimasti fuori dal repository.

**Dati**

| Misura | Risultato |
|---|---|
| Gallerie / attive con foto | 295 / 285 (mediana 134 foto, 90% sotto 643, massimo 1.628) |
| Foto nelle gallerie attive | 66.016 (63.017 moderne + 2.999 legacy) |
| **Foto senza miniatura** | **38.965 (59%)**, in 223 gallerie; in 219 manca a più della metà |
| Per periodo | 2025: 58% · febbraio 2026 (129 gallerie): 96% · marzo: 100% · da aprile a ottobre: 6-45% · novembre: 100% (605 foto, tutte dal desktop) |
| Selezioni in corso | 23 gallerie, 4.498 foto, **2.950 senza miniatura** (20 gallerie su 23): i clienti che scelgono le foto adesso scaricano gli originali |
| Gallerie a capitoli | 47, con 30.689 foto, di cui 11.875 senza miniatura |
| Miniature fallite | 13 |
| Foto senza `createdAt` | 0: la parte della riconciliazione pensata per loro oggi non serve |
| Foto HEIC/HEIF | 13 (problema piccolo) |
| `photoCount` più alto del vero | 9 gallerie (1.843 foto «fantasma»): lì a ogni visita completa parte un secondo download di tutto l'elenco |
| `photoCount` più basso del vero | 27 gallerie (nessun effetto sulla velocità, ma conteggi e messaggi sbagliati) |
| Gallerie raggiunte con l'ID documento invece del codice | 5: per loro la ricerca fa 3 attese in fila |

**Immagini (intestazioni HTTP)**

| | Peso medio | Cache |
|---|---|---|
| Miniatura | 15 KB (massimo 23 KB) | `private, max-age=0` su 24 su 24: va ricontrollata a ogni visita |
| Originale | 596 KB (massimo 1,3 MB) | 17 `private, max-age=0`, 31 `public, max-age=3600` |

Un originale pesa circa **40 volte** una miniatura.

**Sito (galleria da 359 foto, nessuna miniatura, prima visita)**

| Misura | Risultato |
|---|---|
| JavaScript | 56 file, **2,2 MB**, di cui il file principale 1,6 MB e quello della galleria 414 KB |
| Compressione | **Nessuna** su JavaScript, CSS e HTML: il server del sito (`artifacts/api-server/src/public-web.ts`) non usa gzip né brotli. Verificato con `curl`: nessun `Content-Encoding`. |
| Immagine inutile | `og-image.jpg` da **408 KB** precaricata su ogni pagina del sito (`artifacts/image-studio-web/index.html:489`); serve solo per l'anteprima sui social, il visitatore non la vede |
| Richieste Firestore | 37 |
| Prima foto della griglia richiesta a | 3,2 s dall'apertura |
| Griglia | 50 riquadri, tutti originali da 1920 px |
| Altre richieste | il catalogo dello shop viene chiesto 4 volte anche dentro la galleria |
| Seconda visita | JavaScript tutto dalla cache del browser (ok); le immagini vengono richieste di nuovo |

**Stima su rete mobile lenta** (1,6 Mbit/s, il profilo «4G lento» di Lighthouse; conti, non misure):
- prima che la galleria possa partire si scaricano circa 2,9 MB (JavaScript, CSS, og-image), cioè circa 15 s. Con la compressione e senza og-image si scende sotto 1 MB, sui 3-5 s;
- le prime 12 foto oggi valgono circa 7 MB (circa 35 s); con le miniature circa 180 KB (circa 1 s).

Su un 4G normale (circa 10 Mbit/s) i tempi si dividono per 6, ma il rapporto resta.

**Cosa cambia nel piano**
1. Si aggiungono due correzioni piccole e molto redditizie, da fare per prime: compressione del sito (problema 13) e niente precarico di `og-image.jpg` (problema 14). Valgono per tutto il sito, non solo per le gallerie.
2. Il problema 1 è più grande del previsto: non sono solo gli upload desktop, ma un arretrato di quasi 39.000 foto. Il recupero (1.2) è il passo che fa la differenza più grande per i clienti, a partire dalle 20 gallerie con selezione in corso.
3. La cache lunga è confermata (problema 2).
4. Dalla pulizia dati (1.2) esce il `createdAt` (non serve); resta il ricalcolo di `photoCount`.
5. HEIC: con 13 foto basta un messaggio chiaro nel desktop, niente conversione.

## Decisioni di Gennaro (24 novembre 2026)

- **Like e commenti si tolgono**: i clienti non li usano. Si toglie la funzione dalla galleria (pannelli sotto le foto, conteggi, attività social, statistiche admin, like sui vocali). La cancellazione definitiva dei dati (`likes`, `comments`) è un passo separato: solo dopo un'esportazione di backup e una conferma esplicita, perché non si può annullare. Cancellare i dati non rende più veloce nulla: la velocità arriva togliendo la funzione.
- **Approvati**: miniature anche per le foto caricate dall'app desktop (problema 1), cache lunga sulle immagini (problema 2), titolo e copertina subito e ricerca della galleria più corta (problema 4).
- **Problemi 5-8**: spiegati sotto in «Come si risolvono i problemi 5-8».
- **Fase 0**: approvata ed eseguita il 24/11/2026.
- **Una sola rigenerazione**: le versioni nuove delle foto (miniatura piccola, miniatura per schermi retina, versione per la foto ingrandita, dimensioni) si producono tutte insieme nel passo 1.1, così il recupero sulle gallerie esistenti si fa una volta sola.

## Cosa succede oggi quando un cliente apre la galleria

1. La pagina di accesso (`GalleryAccess.tsx`) cerca la galleria per codice e poi naviga a `/view/:code`.
2. `Gallery.tsx` rifà la stessa ricerca da zero (fino a 3 richieste una dopo l'altra: codice, codice maiuscolo, ID documento).
3. Poi chiede le prime 50 foto e, in parallelo, tutta la vecchia sottocollezione `galleries/{id}/photos`.
4. Finché queste due cose non arrivano la pagina mostra solo lo scheletro: nemmeno titolo e copertina.
5. La griglia mostra `thumbnailUrl || url`: se manca la miniatura scarica l'originale (1920 px, fino a 1-2 MB).
6. A ogni nuova pagina di foto, like e commenti vengono ricaricati per **tutte** le foto già caricate.

## Problemi trovati

Gravità = probabilità × impatto sul cliente.

| # | Gravità | Dove | Problema | Stato |
|---|---|---|---|---|
| 1 | **Critico** | `artifacts/api-server/src/desktop-gallery-routes.ts:864` (finalize), `:910` | Le foto caricate dall'app desktop nascono **senza miniatura**; la generazione parte solo dal pannello web (`GalleryManagementWorkspace.tsx:328`, `EditGalleryModal.tsx:2020`). Se il fotografo carica solo dal desktop, la griglia del cliente scarica gli originali: ~10-40 volte i byte di una miniatura da 400 px. Oltre ai nuovi upload c'è un arretrato storico. | **Misurato**: 38.965 foto senza miniatura (59%), originale circa 40 volte più pesante |
| 2 | **Alto** | `artifacts/api-server/src/thumbnails.ts:154`, `artifacts/image-studio-web/src/lib/storage.ts:70`, finalize desktop | Nessun upload imposta `cacheControl`. Su Firebase Storage il valore predefinito atteso è `private, max-age=0`: a ogni nuova visita il browser deve ricontrollare ogni immagine. | **Misurato**: tutte le miniature campionate `private, max-age=0` |
| 3 | **Alto** | `artifacts/image-studio-web/src/context/GalleryInteractionsContext.tsx:69-143`, `Gallery.tsx:2364` | Like e commenti si ricaricano interi a ogni pagina di foto. Con 1000 foto (20 pagine): circa 350 query `likes` e 20 letture complete dei commenti, e a ogni giro si ridisegnano tutti i pannelli. Il lavoro cresce col quadrato delle foto. | Confermato (calcolo dal codice) |
| 4 | **Alto** | `artifacts/image-studio-web/src/lib/gallery-page-state.ts:16-18`, `Gallery.tsx:2294`, `artifacts/image-studio-web/src/lib/galleries.ts:555-595`, `GalleryAccess.tsx:94` | Scheletro finché lookup e prima pagina non sono finiti; la copertina inizia a scaricarsi solo dopo. Lookup con fino a 3 attese in sequenza, duplicato con la pagina di accesso. | Confermato |
| 5 | **Medio** | `artifacts/image-studio-web/src/components/ImageLightbox.tsx:421`, `:132-158` | La lightbox mostra l'originale senza segnaposto e precarica 4 originali vicini (±2): su mobile 4G aprire una foto vuol dire scaricarne 5. | Confermato |
| 6 | **Medio** | `Gallery.tsx:501-508`, `:298` | Con la selezione attiva tutte le pagine vengono scaricate in catena da 50: 1000 foto = 20 attese in sequenza prima che i contatori siano completi. | Confermato |
| 7 | **Medio** | `Gallery.tsx:4172`, `:4329`, `:2064-2086`, `:4683` | Gallerie a capitoli: le copertine dei capitoli usano l'originale; un capitolo aperto monta tutte le sue foto senza finestra di rendering; con i capitoli chiusi la sentinella resta visibile e scarica tutte le pagine in catena. | Confermato |
| 8 | **Medio** | `artifacts/api-server/src/thumbnails.ts:17-18`, `Gallery.tsx:167`, `artifacts/image-studio-web/src/components/gallery/MasonryColumns.tsx:57-59` | Miniatura unica 400 px JPEG: poco nitida su schermi retina a 4 colonne. Nessun `srcset` né WebP. Larghezza e altezza non sono salvate: ogni card parte 3/4 e poi salta all'altezza vera, e le colonne si sbilanciano. | Confermato |
| 9 | **Basso** | `Gallery.tsx:13-17` e import statici | Il pacchetto della pagina include i 5 CSS dei temi e i componenti di tab che il cliente spesso non apre (ospiti, vocali, storia). Peso non misurato: nel worktree non ci sono `node_modules` per fare la build. | Ipotesi |
| 10 | **Basso** | `Gallery.tsx:2303-2321` | Durante lo scheletro il messaggio stima il tempo per **tutte** le foto e invita ad aspettare: oggi la griglia è utilizzabile dopo 50 foto, quindi il messaggio scoraggia senza motivo. | Confermato |
| 11 | **Basso** | `artifacts/image-studio-desktop/src/lib/uploadCompression.ts:24-45`, `uploadQueue.tsx:32`, `desktop-gallery-routes.ts:848` | Il desktop accetta HEIC/HEIF. La compressione (nel motore di Chromium) non sa leggere l'HEIC: in quel caso carica l'originale HEIC con un avviso. Chrome, Android e Windows non mostrano l'HEIC, e sharp con i binari standard non lo decodifica, quindi niente miniatura. | **Misurato**: 13 foto HEIC in tutto |
| 12 | **Medio** | `Gallery.tsx:413-434`, `artifacts/image-studio-web/src/lib/photos.ts:526` | Se `photoCount` della galleria è più alto delle foto vere (per esempio dopo cancellazioni dal web, che non lo scalano), a paginazione finita parte la «riconciliazione»: un secondo download di tutte le foto, a ogni visita. Succede sempre nelle gallerie a capitoli e con selezione, che scaricano tutte le pagine. | **Misurato**: 9 gallerie (1.843 foto in eccesso) |
| 13 | **Critico** | `artifacts/api-server/src/public-web.ts` | Il sito viene servito **senza compressione**: il JavaScript principale viaggia a 1,6 MB invece di circa un terzo. Vale per tutte le pagine del sito. | **Misurato** con `curl` (nessun `Content-Encoding`) e nel browser |
| 14 | **Alto** | `artifacts/image-studio-web/index.html:489` | `<link rel="preload" as="image" href="assets/og-image.jpg">` fa scaricare 408 KB su ogni pagina, anche se l'immagine serve solo per le anteprime sui social. | **Misurato** nel browser |
| 15 | **Basso** | da cercare (componente globale dello shop) | Il catalogo dello shop viene chiesto 4 volte anche dentro la galleria. | Misurato; causa non ancora cercata |

Vista di passaggio, fuori perimetro (sicurezza): `photos` è leggibile da chiunque (`firestore.rules:164-165`) e la password della galleria è solo un flag in `localStorage` (`Gallery.tsx:358`). Inoltre `galleries.ts:650` legge ancora `galleryData.password` dal documento pubblico: va controllato che nessuna galleria vecchia abbia ancora la password in chiaro lì. Va trattato in un lavoro a parte.

## Confronto con DeepSeek

**D'accordo su tutto l'impianto:** priorità a miniature mancanti e cache, header subito, like incrementali, finestra di rendering nei capitoli, width/height alla generazione miniatura, virtualizzazione vera non prioritaria.

**Punti aggiunti da DeepSeek e tenuti:**
- nei capitoli serve una sentinella per capitolo, altrimenti quella in fondo pagina continua a scaricare la cronologia generale;
- il masonry «colonna più corta» ha senso solo dopo aver salvato le dimensioni;
- conviene lo schema `<picture>`/fallback JPEG se si passa a WebP;
- con l'endpoint di Fase 3 bisogna considerare la latenza del server Replit rispetto a Firestore.

**Dove DeepSeek sbaglia (controllato):**
- dice di aver «verificato» il valore predefinito di Cache-Control: non può averlo fatto, resta un'ipotesi da controllare con `curl -I`;
- propone di scaricare le pagine «in parallelo con Promise.all»: con la paginazione a cursore è impossibile, ogni pagina dipende dall'ultimo documento della precedente. La correzione giusta è una sola query per tutto il resto dopo la prima pagina;
- dice che una query `in` con 30 ID costa 30 letture: Firestore fa pagare i documenti restituiti (minimo 1 per query), non gli ID cercati;
- stima 210 query like; dal codice sono circa 350 (ogni pagina rifà ⌈foto caricate / 30⌉ query);
- suppone `onSnapshot` per i like: il codice usa `getDocs`. Proporre ascolti in tempo reale per foto peggiorerebbe le cose.

## Piano

Ogni passo è piccolo e si può rilasciare da solo. Verifica di ogni passo: typecheck del workspace toccato (`pnpm --filter <workspace> run typecheck`), test vitest del file toccato, prova nel browser con la rete limitata a «4G veloce».

### Fase 0 · Misurare prima di toccare — FATTA il 24/11/2026 (risultati in cima)

1. `curl -I "<thumbnailUrl di una foto vera>"` e lo stesso su un originale: leggere `cache-control`.
2. Script in sola lettura con firebase-admin: per ogni galleria attiva contare foto totali, foto senza `thumbnailUrl`, foto con `thumbnailFailed`, foto senza `createdAt`, foto HEIC/HEIF, e `photoCount` dichiarato contro foto reali; elenco delle gallerie peggiori. Nessuna scrittura.
3. Una galleria vera da mobile (Lighthouse o WebPageTest, 4G, prima visita e visita di ritorno): LCP, byte scaricati nella prima schermata, numero di richieste a `firestore.googleapis.com` e a `firebasestorage.googleapis.com`.
4. Stesse misure su una galleria grande a capitoli e su una con selezione attiva.

Uscita: tabella «prima» con i numeri, da confrontare alla fine di ogni fase.

### Fase 1 · Guadagni rapidi a basso rischio

0. **Compressione del sito e niente og-image precaricata** (problemi 13 e 14; valgono per tutto il sito). — **Fatto nel codice il 24/11/2026, non ancora pubblicato.** Copie brotli/gzip create in build (`artifacts/image-studio-web/build/precompress-assets.ts`), servite da `production-web.ts`, nessuna libreria nuova. Sulla build: JavaScript principale 1.505 → 381 KB, file galleria 412 → 95 KB, CSS 292 → 31 KB. Le risposte JSON dell'API non sono state toccate. Dopo il rilascio: `curl -H "Accept-Encoding: br" -I` su un file `/assets/*.js` per controllare che il proxy di Replit lasci passare `Content-Encoding: br`.
   - Compressione gzip/brotli in `public-web.ts` (middleware `compression`, o file già compressi in fase di build serviti con `Content-Encoding`), e anche per le risposte JSON dell'API.
   - Togliere il `preload` di `og-image.jpg` da `index.html:489`; i meta `og:image` per i social restano.
   - Test: `production-web.test.ts` controlla `Content-Encoding` sui file `.js`/`.css`; `curl` dopo il rilascio.

1. **Versioni della foto al finalize desktop** (problemi 1, 5, 8). In `thumbnails.ts` una funzione per una singola foto che, decodificando una volta sola con sharp, produce in WebP la miniatura 400 px, quella 800 px per schermi retina e la versione 1600 px per la foto ingrandita, più `width`/`height`; tutte con cache lunga. I nuovi campi vanno in un oggetto a parte (es. `variants`): `thumbnailUrl` resta com'è, perché lo usano anche fotolibri, pagine SEO e app desktop.
   - **Dentro la richiesta, non dopo**: il server su Replit è in modalità «autoscale», che dopo la risposta può fermare la CPU. Un lavoro lanciato «in sottofondo» potrebbe non finire mai.
   - **Senza secondo download**: `verifyImage` legge già tutto il file per l'impronta: si tengono quei byte (≤ 2 MB) e si passano a sharp. Costo atteso: qualche centinaio di millisecondi in più per foto, con 3 upload in parallelo dal desktop.
   - Se sharp fallisce, la foto si salva lo stesso senza versioni e la riprende il recupero (1.2). Gli upload web e degli ospiti usano la stessa funzione.
   - Test: finalize simulato → il doc ha tutti i campi; errore di sharp → finalize riesce lo stesso; tempo del finalize misurato.
2. **Recupero e pulizia dei dati** delle gallerie esistenti: script lato server, a lotti, con log e una modalità di prova che non scrive. Genera le versioni mancanti e ricalcola `photoCount` (problema 12; `createdAt` manca a nessuna foto, quindi non serve toccarlo). Ordine dei lotti: prima le 20 gallerie con selezione in corso, poi le altre dalla più recente. Sono circa 39.000 foto: a lotti da 30 con 6 in parallelo sono più di mille chiamate, da far girare in più sessioni. Da lanciare solo dopo il tuo OK, prima su una galleria di prova.
2-bis. **HEIC** (problema 11: 13 foto in tutto). Il desktop rifiuta l'HEIC con un messaggio chiaro («esporta in JPEG»); niente libreria di conversione.
3. **Cache lunga** (problema 2, se la Fase 0 lo conferma). `cacheControl: 'public, max-age=31536000, immutable'` su miniature (`thumbnails.ts:154`), originali web (`storage.ts`) e finalize desktop (`setMetadata`). È sicuro perché ogni rigenerazione crea un token nuovo, quindi un URL nuovo. Backfill dei metadati con `setMetadata` sugli oggetti esistenti (script, stessi controlli del punto 2).
4. **Togliere like e commenti** (problema 3, decisione di Gennaro). Via `GalleryInteractionsProvider`, `LazyInteractionPanel`/`InteractionPanel` sotto ogni foto, `SocialActivityPanel`, i like sui vocali (`VoiceMemoUpload`), i conteggi in `photos.ts`, `realtime.ts`, `useFirebaseQueries.ts`, il pannello statistiche admin (`InteractionStatsPanel`, `GalleryManagementWorkspace`). Le regole Firestore di `likes` e `comments` passano a sola lettura admin. I dati restano dove sono finché non decidi la cancellazione (passo 1.8). Test: la galleria non fa più richieste a `likes` e `comments`; typecheck web pulito.
5. **Header subito, lookup più corto** (problema 4). Mostrare navigazione, header e copertina appena c'è `galleryData`; lo scheletro resta solo sulla griglia. Lookup: codice e codice maiuscolo con una sola query `where('code','in',[...new Set([code, CODE])])` (senza doppioni quando il codice è già maiuscolo), lettura per ID in parallelo. La pagina di accesso mette il risultato in `queryClient` con la stessa chiave `['gallery', id]` prima di navigare. Aggiornare `gallery-page-state.test.ts`.
6. **Lightbox** (problema 5). Due immagini sovrapposte in un contenitore: sotto la miniatura già in cache, sopra la versione 1600 px che appare in dissolvenza quando è pronta. Zoom e spostamento si applicano al contenitore, così non ci sono salti. L'originale si carica solo con lo zoom oltre lo schermo o per il download. Precarico ±1; con `saveData` o rete 2G/3G solo le miniature. Test: `ImageLightbox.test.tsx`.
7. Messaggio di caricamento corretto (problema 10).
8. **Cancellazione definitiva di like e commenti** (facoltativa, irreversibile). Prima esportazione completa delle due raccolte in un file di backup, poi conteggio di cosa verrà cancellato, poi cancellazione solo dopo la tua conferma esplicita su quei numeri.

Criterio di «fatto» della Fase 1: 100 % delle foto con miniatura (salvo `thumbnailFailed`); `cache-control` lungo sulle immagini; visita di ritorno senza richieste di rete per le miniature già viste; header visibile prima della griglia; query like per sessione proporzionali alle foto, non al loro quadrato.

### Fase 2 · Struttura

1. **Selezione: pagine grandi dopo la prima** (problema 6). Prima pagina da 50 per vedere subito qualcosa, poi pagine da 500: 2000 foto = 5 richieste invece di 40, senza una sola risposta gigante da elaborare in un colpo. La riconciliazione resta come rete di sicurezza: dopo la pulizia dei dati (1.2) non dovrebbe più partire. Da collaudare su «mi piace», «non mi piace» e multi-prodotto: il salvataggio parziale è il rischio principale.
2. **Capitoli** (problema 7). Copertine da `thumbnailUrl`; finestra di rendering dentro il capitolo aperto, con una sentinella per capitolo; valutare la query `where('chapterId','==',X)` all'apertura (serve un indice composito, da creare nella console Firebase: non c'è un `firestore.indexes.json` nel repository).
3. **Griglia con le nuove versioni** (problema 8; i file li produce già il passo 1.1). Griglia con `srcset` 400w/800w e `sizes` per 2/3/4 colonne; card con il rapporto vero da subito; masonry «colonna più corta»; copertine di header e capitoli dalle nuove versioni.
4. **Pacchetto più leggero** (problema 9). `lazy()` per i tab ospiti, vocali e storia e per i modali di selezione; CSS del solo tema attivo. Misurare prima e dopo con la build (`pnpm --filter @workspace/image-studio-web run build` con `PORT` e `BASE_PATH`).
5. **Virtualizzazione della griglia, solo se serve.** Oggi la griglia monta le foto man mano che si scorre, quindi in DOM ce ne sono tante solo se il cliente arriva in fondo a una galleria enorme. Senza i pannelli like le card diventano più leggere. Si fa solo se, su un Android di fascia media, una galleria da 2000 foto scattosa ancora dopo i passi 2.2 e 2.3. Diventa fattibile perché a quel punto si conoscono le dimensioni delle foto.

### Come si risolvono i problemi 5-8 (in parole semplici)

**5 · Foto ingrandita (lightbox).** Oggi scarica l'originale (fino a 1-2 MB) partendo da schermo vuoto e ne precarica altri 4.
- Appena tocchi una foto si vede subito la miniatura già scaricata dalla griglia, ingrandita; dopo una frazione di secondo viene sostituita dalla versione nitida.
- La versione nitida è quella da 1600 px in WebP (circa 200-300 KB invece di 1-2 MB): sullo schermo di un telefono o di un portatile non si vede differenza dall'originale.
- L'originale si scarica solo se il cliente fa zoom oltre lo schermo o scarica la foto.
- Si precarica solo la foto prima e quella dopo; con rete lenta o «risparmio dati» attivo, solo le loro miniature.

**6 · Selezione delle foto.** Oggi, per contare e salvare la selezione, la pagina scarica l'elenco a blocchi di 50 uno dopo l'altro: 1000 foto = 20 attese in fila.
- Le prime 50 restano subito visibili; tutto il resto arriva con **una sola** richiesta. Da 20 attese a 2.
- Il controllo che blocca il salvataggio finché l'elenco non è completo resta: il rischio da evitare è salvare una selezione a metà. Collaudo su «mi piace», «non mi piace» e multi-prodotto.

**7 · Gallerie a capitoli.**
- Le copertine dei capitoli usano la miniatura invece dell'originale.
- Aprendo un capitolo le foto compaiono 40 alla volta mentre scorri, come nella vista normale, invece di montarle tutte insieme (oggi 400 foto = 400 riquadri in un colpo).
- Le foto del capitolo si chiedono direttamente quando lo apri, invece di aspettare che arrivi tutta la galleria. Serve un indice in Firebase: lo crei tu con un clic dal link che Firebase mostra la prima volta.
- Con i capitoli chiusi la pagina smette di scaricare in automatico tutte le foto della galleria.

**8 · Miniature nitide e griglia ferma.**
- Per ogni foto due miniature (400 e 800 px, WebP): il browser sceglie da solo quella adatta allo schermo. Telefono normale: la piccola; schermo retina o griglia larga: la grande.
- Si salvano larghezza e altezza della foto: la griglia sa dall'inizio quanto spazio occupa ogni foto, quindi niente salti mentre carica e colonne bilanciate.
- Si producono nello stesso passo delle miniature del punto 1, quindi nessuna seconda rigenerazione.

Costo: circa 0,4 MB di spazio in più per foto su Storage (pochi centesimi al mese per migliaia di foto), più un lavoro una tantum del server per le gallerie esistenti. In cambio i clienti scaricano molti meno dati, e cala anche il traffico in uscita da Storage che Firebase fa pagare.

### Secondo parere Gemini (Gemini 3.1 Pro tramite OmniRoute)

Ricevuto piano, estratti di codice e 9 dubbi. Esito, dopo il controllo nel codice:

| Punto | Gemini | Verifica e decisione |
|---|---|---|
| Versioni nel finalize | Generarle dentro la richiesta, riusando i byte già letti da `verifyImage` | **Accolto.** Il deploy è `autoscale` (`.replit`), e `verifyImage` legge davvero tutto il file (`desktop-gallery-routes.ts:190-203`). Passo 1.1 corretto. |
| Cache lunga | D'accordo, è l'intervento più redditizio | Accolto. Gemini lo dava per fatto senza poterlo vedere; la Fase 0 lo ha poi confermato (`private, max-age=0` su tutte le miniature campionate). |
| HEIC | Problema vero: sharp standard non decodifica HEIC e i browser non lo mostrano | **Accolto e confermato nel codice**: il desktop accetta HEIC e, se la compressione fallisce, carica l'originale (problema 11). |
| Formati | Solo WebP, niente JPEG di riserva per le versioni nuove | Accolto per le versioni nuove; `thumbnailUrl` resta per gli altri usi. |
| Selezione | Pagine da 500 invece di una query unica | **Accolto** (passo 2.1). |
| Riconciliazione | Toglierla e mettere `createdAt` alle foto vecchie | **In parte.** Pulizia dei dati sì (1.2), ma il codice resta come rete di sicurezza contro le selezioni salvate a metà. Trovato anche un secondo motivo per cui oggi parte: `photoCount` sbagliato (problema 12). |
| Ricerca per codice | No a `in`, sì a un campo `codeLower` con migrazione | **Non accolto per ora.** `in` fa esattamente ciò che fa oggi il codice (esatto + MAIUSCOLO), solo in una richiesta invece di due. `codeLower` coprirebbe anche i codici scritti a lettere miste, ma richiede la migrazione di tutte le gallerie e di tutti i punti che scrivono il codice: è robustezza, non velocità. |
| Lightbox | Due immagini sovrapposte, zoom sul contenitore | **Accolto** (passo 1.6). Nel suo esempio c'è `loading="lazy"` sull'immagine visibile: va tolto, ritarderebbe proprio quella. |
| Fase 3 | Toglierla: l'avvio a freddo del server Replit costa più di quanto si guadagna | **Accolto per la velocità.** Resta solo come possibile lavoro di sicurezza (password vera lato server). |
| Virtualizzazione | «Omissione grave» | **Non accolto come priorità.** Gemini non sapeva che la griglia monta già le foto a gruppi mentre si scorre; il problema vero sono i capitoli aperti, già nel piano (2.2). Messa come passo condizionale (2.5). |

### Fase 3 · Facoltativa, non per la velocità

Endpoint `GET /api/public/galleries/:code/manifest` sul server: con firebase-admin legge galleria e foto, restituisce un JSON compatto (solo i campi usati dalla griglia, `.select()`), con cache breve. Vantaggi: una sola richiesta invece di 3-25, niente SDK Firestore da caricare per sfogliare, e la password potrebbe essere controllata davvero lato server. Contro: latenza e risvegli del server Replit, un percorso in più da mantenere, like ancora da Firestore. Dopo il parere di Gemini: per la velocità non conviene, perché l'avvio a freddo del server autoscale (1-3 secondi) costerebbe più delle richieste risparmiate. Ha senso solo se si decide di chiudere il buco della password.

## Rischi delle correzioni

- Selezione: qualsiasi cambio al caricamento completo può far salvare selezioni parziali; i controlli `arePhotosFullyLoaded` e la riconciliazione restano e vanno coperti dai test.
- Backfill e `setMetadata` scrivono in produzione: script con modalità di prova, lotti piccoli, log, e lancio solo con il tuo OK.
- `in` sul codice: va verificato che non esistano due gallerie con lo stesso codice in maiuscolo e minuscolo.
- WebP: tutti i browser recenti lo leggono; per sicurezza `<picture>` con JPEG di riserva.

## Cosa non ho potuto controllare

- Tempi su un telefono vero in 4G: il browser integrato non rallenta la rete. Le stime sono calcolate dai byte misurati.
- La misura nel browser è su una sola galleria, senza password né miniature: nessuna galleria pubblica grande e senza selezione aveva già le miniature.
- Con la seconda visita non ho potuto distinguere «immagine riscaricata» da «solo ricontrollata», perché Storage non espone i tempi di rete a JavaScript. L'intestazione `private, max-age=0` basta a dire che oggi non c'è una cache lunga.
- Cosa contiene il file JavaScript principale da 1,6 MB: serve una build con l'analisi del pacchetto (Fase 2.4).

## Ordine consigliato

~~Fase 0~~ (fatta) → 1.0 (compressione e og-image: piccolo, vale per tutto il sito) → 1.1 + 1.3 (versioni delle foto con cache lunga, per i nuovi upload) → 1.2 (recupero e pulizia, prima le selezioni in corso) → 1.5 (header) → 1.4 (via like e commenti) → 1.6 (lightbox) → 2-bis se ci sono HEIC → nuova misura → Fase 2 nell'ordine 2.2, 2.1, 2.3, 2.4, poi 2.5 solo se serve → 1.8 solo se vuoi cancellare i dati.
