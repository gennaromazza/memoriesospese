# Audit tecnico SEO e anteprima immagine

**Sito:** `https://imagestudiofotografico.com`  
**Data del controllo live:** 3 settembre 2026  
**Ambito:** audit preliminare, senza modifiche a codice, configurazione, contenuti o dati
Firestore.  
**Nota di lettura:** ogni rilievo ha un solo livello di evidenza:

- **PROVATO DAL CODICE** — dedotto da file/versioni presenti nel repository;
- **PROVATO DALLA RISPOSTA HTTP LIVE** — osservato interrogando il dominio pubblico;
- **IPOTESI** — spiegazione plausibile, non dimostrata;
- **RICHIEDE CONFERMA SEARCH CONSOLE** — serve l’URL individuale o il report URL Inspection.

Nessuna correlazione tra un conteggio Search Console e una route del repository è
considerata certa senza l’elenco URL di Search Console.

## 1. Sintesi esecutiva

Il progetto ha una base SEO significativa: le pagine editoriali principali sono
prerenderizzate per i crawler, hanno canonical assoluto, title, description, H1,
JSON-LD e link interni. La sitemap live è raggiungibile e, al momento del controllo,
contiene **96 URL unici**; tutte le 96 hanno risposto con HTTP 200 e canonical
corrispondente all’URL della sitemap.

I rischi più concreti emersi dall’audit sono però diversi:

1. il fallback SPA restituisce **HTTP 200 e metadata homepage anche per percorsi
   inesistenti** quando il prerender non trova una pagina; questo può creare
   soft-404, URL scoperte ma non indicizzate e segnali canonical incoerenti;
2. HTML normale e HTML crawler sono diversi per design, ma l’HTML normale parte con
   title/description legacy e root vuoto; le immagini hero e portfolio arrivano
   dopo query Firestore;
3. il prerender conserva i tag statici `og:image` e `twitter:image` e ne inserisce
   altri, quindi per una risposta crawler risultano due valori per ciascun segnale;
4. la sitemap è tecnicamente ordinata e coerente, ma pubblica 68 articoli blog e
   8 Real Wedding: la qualità, similarità e sufficiente unicità di ogni URL non
   possono essere convalidate dal solo XML;
5. il blocco robots segnalato da Search Console non è identificabile dall’export.
   Dal codice esiste tuttavia una candidata concreta, `/accesso-galleria`, che è
   esplicitamente disallow e anche `noindex`; non va rimossa senza sapere l’URL
   segnalato;
6. la homepage ha un’immagine OG tecnicamente idonea e accessibile a Googlebot-
   Image, ma il primo HTML non contiene una `<img>` hero: ciò può spiegare perché
   Google non mostri una miniatura scelta come ci si aspetta, senza dimostrare che
   sia la causa della SERP attuale.

**Conclusione prudente:** non è giustificato applicare in massa `noindex`, redirect
o canonical correttivi ai 53 duplicati prima di ottenere gli URL individuali e il
risultato di URL Inspection.

## 2. Input Search Console e limiti degli export

### 2.1 Conteggi ricevuti

| Stato Search Console | Fonte | Conteggio | Evidenza | Interpretazione consentita |
|---|---:|---:|---|---|
| Rilevata, ma attualmente non indicizzata | Sistemi di Google | 74 | RICHIEDE CONFERMA SEARCH CONSOLE | Conteggio aggregato fornito dall’export |
| Pagina duplicata senza URL canonico selezionato dall’utente | Sito web | 53 | RICHIEDE CONFERMA SEARCH CONSOLE | Conteggio aggregato fornito dall’export |
| Scansionata, ma attualmente non indicizzata | Sistemi di Google | 2 | RICHIEDE CONFERMA SEARCH CONSOLE | Conteggio aggregato fornito dall’export |
| Bloccata da robots.txt | Sito web | 1 | RICHIEDE CONFERMA SEARCH CONSOLE | Conteggio aggregato fornito dall’export |

`Problemi_critici_1788429455047.csv` contiene solo `Ragione,Sorgente,Convalida,Pagine`;
non contiene gli URL individuali. `Metadati_1788429455047.csv` contiene soltanto
`Sitemap,Tutte le pagine note`. `Problemi_non_critici_1788429455046.csv` contiene
solo l’intestazione. Pertanto:

- i **53 duplicati non sono associabili automaticamente** a slash finale, query
  string, legacy, Blog, Real Wedding o altre route;
- l’URL bloccato non è identificabile dall’export;
- il testo iniziale allegato parla di circa 93 URL sitemap, mentre il controllo
  live del 3 settembre 2026 ne ha rilevati 96. È una differenza temporale o di
  estrazione, non una prova di errore;
- per chiudere i casi Search Console servono l’esportazione completa degli URL
  per motivo e, per un campione, URL Inspection con: URL dichiarato canonico,
  canonical selezionato da Google, ultima scansione, stato di indicizzazione,
  risposta HTTP e motivo esclusione.

### 2.2 Tendenza del grafico allegato

`Grafico_1788429455046.csv` copre il 5 giugno–28 agosto 2026. Il dato allegato
mostra:

- 5 non indicizzate e 1 indicizzata dal 5 giugno al 24 luglio;
- 3 non indicizzate e 1 indicizzata dal 25 luglio al 5 agosto;
- 2 non indicizzate e 1 indicizzata dal 6 al 14 agosto;
- 4 non indicizzate e 1 indicizzata dal 15 al 17 agosto;
- salto a 85 non indicizzate e 3 indicizzate dal 18 al 21 agosto;
- salto a 130 non indicizzate e 16 indicizzate dal 22 al 28 agosto.

**Evidenza:** RICHIEDE CONFERMA SEARCH CONSOLE.  
Il salto è un cambiamento osservato nell’export, ma non dice se sia dovuto a nuove
URL, riclassificazione, scoperta di contenuti o ritardo di elaborazione. Non è
corretto usarlo da solo per attribuire una causa al routing.

## 3. Inventario delle route e metadata

### 3.1 Pagine pubbliche editoriali

| Route | Canonical attuale/atteso | Robots | Title | Description | H1 | Structured data | Sitemap | HTTP live |
|---|---|---|---|---|---|---|---|---|
| `/` | `https://imagestudiofotografico.com/` | index, follow | wedding-first dal prerender; legacy nel client iniziale | wedding-first dal prerender; legacy nel client iniziale | sì nel prerender | LocalBusiness, WebPage, Organization, Person, WebSite, Service; client aggiunge ProfessionalService | sì | 200 |
| `/portfolio` | `/portfolio` assoluto | index, follow | sì | sì | sì | common SEO prerender | sì | 200 |
| `/portfolio/:categoria` | `/portfolio/{categoria}` | index, follow per categorie riconosciute | dinamico per categoria | dinamica per categoria | sì dopo hydration; sì prerender per 8 categorie | Breadcrumb; FAQ/Service per matrimonio | sì per 8 categorie | 200 |
| `/storie` | `/storie` | index, follow | sì | sì | sì | common SEO prerender | sì | 200 |
| `/fotografo-aversa` | `/fotografo-aversa` | index, follow | sì | sì | sì | BreadcrumbList, FAQPage, common | sì | 200 |
| `/vision` | `/vision` | index, follow | sì | sì | sì | common SEO prerender | sì | 200 |
| `/lasciati-trasportare` | `/lasciati-trasportare` | index, follow | sì | sì | sì | common SEO prerender | sì | 200 |
| `/stampa-foto-aversa` | `/stampa-foto-aversa` | index, follow | sì | sì | sì | Breadcrumb, Service, FAQPage, common | sì | 200 |

**Evidenza codice:** PROVATO DAL CODICE per canonical e metadata dichiarati.  
**Evidenza live:** PROVATO DALLA RISPOSTA HTTP LIVE per il campione e gli status
indicati. Le due osservazioni restano separate: il codice non prova da solo ciò
che è stato effettivamente deployato.

### 3.2 Pagine dinamiche editoriali

| Route | Canonical attuale/atteso | Robots | Title/description/H1 | Structured data | Sitemap | HTTP live |
|---|---|---|---|---|---|---|
| `/blog` | `/blog` | index, follow | prerender recupera lista e H1; client usa `useSEO` | common SEO prerender | sì | 200 |
| `/blog/:slug` pubblicato | `/blog/{slug}` | index, follow | Firestore: `metaTitle`/title, `metaDescription`/excerpt, H1 dal post | BlogPosting, Breadcrumb + common | 68 URL | 200 per tutti gli URL sitemap |
| `/real-wedding/:slug` pubblicato | `/real-wedding/{slug}` | index, follow, max-image-preview:large | Firestore, title/description/story | Article, image, date, author/publisher + common | 8 URL | 200 per tutti gli URL sitemap |

Gli otto Real Wedding attualmente presenti nella sitemap sono pubblicati secondo il
filtro del generatore. La risposta crawler di un Real Wedding verificato dal test
automatico contiene canonical, `data-seo-prerender="true"`, H1, Article e immagini.

**Evidenza codice:** PROVATO DAL CODICE per i filtri `status=published`, il
rendering e i JSON-LD.  
**Evidenza live:** PROVATO DALLA RISPOSTA HTTP LIVE per i 68+8 URL della sitemap,
tutti 200 e senza mismatch canonical. La sufficienza editoriale di ogni singolo
articolo o storia non è provata da questi controlli.

### 3.3 Pagine transazionali, alias e aree private

| Route/gruppo | Canonical/metadata | Robots/accesso | Sitemap | Rischio SEO |
|---|---|---|---|---|
| `/prenota`, `/prenota/:code` | `/prenota` o route di campagna nel client; solo `/prenota` ha prerender statico | default index nel documento; contenuto dipende da query/API | solo `/prenota` | pagina campagna potenzialmente sottile o variabile |
| `/consulenze`, `/consulenze/:tipo`, `/consulenze/:tipo/:id/prenota` | `/consulenze` solo nel prerender; le sottoroute non hanno prerender dedicato | default index nel documento per le sottoroute | solo `/consulenze` | alias/template possono essere scoperti senza metadata dedicato |
| `/consultations`, `/consultations/book` | nessun prerender specifico | default index nel documento | no | alias inglesi candidati a duplicazione; **IPOTESI**, non correlati ai 53 |
| `/accesso-galleria` | canonical client; `noindex` nel client | Disallow robots + `noindex` dopo hydration | no | è un accesso cliente, non una pagina editoriale |
| `/ospiti` | canonical client; `noindex` | noindex dopo hydration, non esplicitamente disallow | no | pagina QR/ospiti da non indicizzare |
| `/stampa-foto-aversa/ordine*` | canonical client; `noindex` | `X-Robots-Tag: noindex, nofollow, noarchive` live | no | area personale |
| `/quote/*`, `/preventivo-rapido/*` | non prerenderizzato; no metadata server dedicato | non disallow in robots; l’header noindex non è applicato da `server/index.ts` a questi prefissi | no | token URL potenzialmente scopribili; verificare policy prima di correzioni |
| `/modulo/*` | non prerenderizzato | `X-Robots-Tag: noindex, nofollow, noarchive` live | no | protezione server presente |
| `/fotolibro/*` | non prerenderizzato | non disallow e nessun header generale osservato | no | token URL potenzialmente scopribili; verificare policy |
| `/gallery/*`, `/special-gallery`, `/view/*` | non prerenderizzato | `/gallery/*` e special-gallery disallow; `/view/*` non è disallow nel robots | no | aree private, da controllare senza rimuovere blocchi di sicurezza |
| `/admin/*`, `/login` | non prerenderizzato | `/admin` e `/login` disallow; fallback live può comunque essere 200 | no | non indicizzabile per direttiva robots, ma status fallback è ambiguo |
| `/collaboratori/*`, `/q/*`, `/request-password*`, `/password-result*`, `/profile` | non prerenderizzato | nessuna regola robots specifica visibile | no | area token/account; richiede controllo privacy e status |

**Evidenza codice:** PROVATO DAL CODICE per la classificazione middleware e
route.  
**Evidenza live:** PROVATO DALLA RISPOSTA HTTP LIVE per `/admin`,
`/gallery/non-existent`, `/view/non-existent`, `/quote/non-existent`,
`/modulo/non-existent` e `/stampa-foto-aversa/ordine`. L’assenza di un URL
concreto in Search Console non consente di collegare questi gruppi ai 53
duplicati.

## 4. Rendering: codice, HTML iniziale e deploy

### 4.1 Client normale contro crawler

| Controllo live su `/` | Client normale | Googlebot |
|---|---|---|
| Status/content-type | 200, `text/html; charset=UTF-8` | 200, `text/html; charset=utf-8` |
| Dimensione risposta osservata | 31.274 byte | 13.482 byte |
| Title iniziale | `Fotografo Aversa \| Image Studio \| Matrimoni, Battesimi ed Eventi in Campania` | `Fotografo Matrimoni Aversa, Napoli e Caserta \| Image Studio` |
| Description | legacy homepage | wedding-first |
| Canonical | homepage | homepage |
| Robots | index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1 | index,follow,max-image-preview:large |
| H1 nel primo HTML | assente | presente |
| JSON-LD | 7 script statici | 6 script prerender, statici rimossi |
| `<img>` nel primo HTML | assente | assente |
| corpo leggibile | root SPA vuoto | `<main data-seo-prerender="true">` con testo e link |

Il client normale aggiorna title, description, robots, Open Graph, Twitter e
canonical tramite `useSEO` in `useEffect`; quindi il metadata dopo hydration può
essere corretto anche quando il primo HTML non lo è. La homepage, inoltre, carica
slideshow, portfolio, blog e video da Firestore. `HeroSlideshow` costruisce le
`<img>` soltanto dopo la query `slideshow`; le foto portfolio arrivano dopo una
query `portfolioSelections`.

**Evidenza live:** PROVATO DALLA RISPOSTA HTTP LIVE per le due risposte.  
**Evidenza codice:** PROVATO DAL CODICE per `useSEO`, `HeroSlideshow` e le query
Firestore. La risposta live non prova come Google completi necessariamente la
fase di rendering JavaScript.

### 4.2 Prerender server-side

`server/seo-prerender.ts`:

- intercetta user agent crawler;
- non prerenderizza API, admin, gallery, view, quote, preventivo rapido, modulo,
  fotolibro o percorsi con punto;
- produce H1/testo/link statici per home, pagine statiche, categorie portfolio,
  blog e Real Wedding pubblicati;
- legge Firestore per slug dinamici;
- se una pagina dinamica non esiste, passa al fallback SPA dopo aver impostato
  `X-Robots-Tag` solo in alcuni casi;
- usa `BASE_URL` assoluto e canonical senza slash finale, tranne la homepage.

Il prerender migliora la leggibilità crawler delle pagine note, ma non è una
garanzia che ogni route React abbia status semanticamente corretto.

### 4.3 Build e deployment

| Livello | Osservazione | Evidenza |
|---|---|---|
| Dev workflow | `node patches/fix-radix-compose-refs.cjs && npm run dev` | PROVATO DAL CODICE |
| Express dev | monta API, sitemap, prerender, poi Vite middleware | PROVATO DAL CODICE |
| Express production | `NODE_ENV=production node dist/index.js`; `mountProductionClient` serve `dist/app` e fallback `index.html` | PROVATO DAL CODICE |
| Vite | root `client`, base `/` in modalità corrente, build in `dist/app` | PROVATO DAL CODICE |
| `.replit` deployment | autoscale, build `npm run build`, run `NODE_ENV=production node dist/index.js` | PROVATO DAL CODICE |
| Firebase Hosting | `public: dist/app`, rewrite `** -> /index.html`, cache assets/index | PROVATO DAL CODICE |
| dominio pubblico | header `server: Google Frontend`, `x-powered-by: Express`, risposte prerender Express | PROVATO DALLA RISPOSTA HTTP LIVE |

Il dominio pubblico osservato non è una risposta Firebase Hosting statica pura:
passa da Google Frontend verso Express. `firebase.json` resta rilevante se viene
usato un rilascio Firebase, ma la risposta live controllata riflette il server
Express in esecuzione.

## 5. Status HTTP, slash, query e fallback

Controlli live crawler:

| URL | Risultato |
|---|---|
| `/`, `/portfolio`, `/portfolio/matrimonio`, `/blog`, `/storie`, `/vision`, `/fotografo-aversa`, `/stampa-foto-aversa`, `/prenota`, `/consulenze` | 200, prerender, canonical coerente |
| `/portfolio/`, `/blog?category=foo`, `/?utm_source=test` | 200; non è stato osservato un redirect di normalizzazione |
| `http://imagestudiofotografico.com/` | redirect HTTPS seguito da 200 |
| `https://www.imagestudiofotografico.com/` | hostname non risolto dal controllo DNS effettuato |
| `/blog/non-existent` | 200 fallback SPA con metadata homepage |
| `/portfolio/non-existent` | 200 fallback SPA con metadata homepage |
| `/real-wedding/non-existent` | header `X-Robots-Tag: noindex, nofollow`, ma poi 200 HTML fallback con metadata homepage |
| `/does-not-exist` | 200 fallback SPA con metadata homepage |

**Rilievo 🔴 Critico — fallback 200 per route inesistenti**  
**Evidenza:** PROVATO DALLA RISPOSTA HTTP LIVE.  
**Causa tecnica:** quando il prerender non produce metadata, il fallback Express/
Firebase serve `index.html` con 200; `production-web.ts` tratta ogni percorso
senza estensione come documento SPA.  
**File coinvolti:** `server/seo-prerender.ts`, `server/production-web.ts`,
`server/index.ts`, `firebase.json`.  
**Soluzione proposta:** definire una politica esplicita per slug non trovati e
route sconosciute: 404 reale per percorsi inesistenti; status/`noindex` coerente
per risorse token private; mantenere le riscritture necessarie per route valide.  
**Rischio:** medio-alto; una modifica troppo ampia può rompere deep link validi.  
**Impatto atteso:** riduce soft-404 e segnali canonici homepage su URL non
editoriali; non prova né garantisce il recupero dei 74 URL.

**Rilievo 🟠 Importante — slash/query non normalizzati**  
**Evidenza:** PROVATO DALLA RISPOSTA HTTP LIVE.  
**Causa tecnica osservata:** slash finale e query string ricevono 200; il canonical
può indicare una sola URL, ma esistono comunque varianti servite.  
**File coinvolti:** `server/production-web.ts`, `server/seo-prerender.ts`,
`client/src/hooks/useSEO.ts`, `firebase.json`.  
**Soluzione proposta:** prima raccogliere le varianti realmente presenti in
Search Console; poi decidere, per ciascun gruppo, canonical, redirect 301 o
conservazione della query funzionale.  
**Rischio:** alto se si fanno redirect generici su parametri di ricerca/
tracking o link legacy.  
**Impatto atteso:** chiarisce gli equivalenti solo dove esistono davvero.

## 6. Sitemap e robots

### 6.1 Sitemap live

`/sitemap.xml` ha risposto 200 con `application/xml; charset=utf-8`.

| Gruppo | URL | Pubblica | Canonica | Indexable secondo codice | HTTP live | Eccezioni |
|---|---:|---|---|---|---|---|
| Statiche | 20 | sì | sì | sì | 200 per 20/20 | nessuna osservata |
| Blog | 68 | sì, status published nel generatore | sì | sì | 200 per 68/68 | qualità/duplicazione editoriale non verificata |
| Real Wedding | 8 | sì, status published nel generatore | sì | sì | 200 per 8/8 | qualità/duplicazione editoriale non verificata |
| Totale | 96 | sì | 96 uniche | sì secondo route pubblica | 200 per 96/96 | nessun query, doppione o slash non-root |

Il generatore esclude bozze Real Wedding e aggiunge solo post blog pubblicati,
ma le pagine statiche sono un elenco manuale. La sitemap non include
`/cookie-policy`, `/gdpr`, `/accesso-galleria`, le route token, checkout/admin o
le varianti inglesi `/consultations`.

**Rilievo 🟢 Corretto — sitemap live coerente nel controllo eseguito**  
**Evidenza:** PROVATO DALLA RISPOSTA HTTP LIVE.  
**Causa tecnica/controllo:** 96 loc unici, nessuna query string, nessuno slash
finale non-root, tutte le risposte 200, canonical live uguale alla loc.  
**File coinvolti:** `server/sitemap-generator.ts`, `server/index.ts`,
`client/public/robots.txt`.  
**Soluzione proposta:** nessuna correzione automatica; aggiungere in futuro una
verifica automatica che confronti loc, canonical, robots e status.  
**Rischio:** basso; il contenuto dinamico può cambiare dopo il controllo.  
**Beneficio:** la sitemap non appare essere la causa provata dei conteggi
Search Console.

### 6.2 Robots

Direttive globali:

- `Allow: /`;
- allow espliciti per portfolio, blog, stampa, vision, storie, prenota,
  consulenze, e-book, privacy, cookie policy e terms;
- `Disallow: /admin`, `/login`, `/gallery/*`, `/special-gallery`,
  `/accesso-galleria`;
- sitemap assoluta corretta;
- gruppi AI esplicitamente allowed per contenuto pubblico e disallowed per
  admin/gallery.

**Rilievo 🟠 Importante — il singolo blocco Search Console non è identificabile**  
**Evidenza:** RICHIEDE CONFERMA SEARCH CONSOLE.  
**Osservazione di codice:** `/accesso-galleria` è una route concreta disallow ed è
anche `noindex` lato client; `/admin` e `/gallery/*` sono aree private
correttamente protette dal robots. `/view/*`, `/quote/*`, `/fotolibro/*`,
`/modulo/*` e `/collaboratori/*` non sono tutti disallow nel file.  
**Soluzione proposta:** confrontare l’unico URL dell’export Search Console con
questa matrice; non rimuovere blocchi privati in base al solo conteggio.  
**Rischio:** alto se si abilita un’area privata; medio se si disallow una pagina
editoriale per errore.  
**Impatto atteso:** solo dopo la conferma URL si potrà correggere la direttiva.

Un URL bloccato da robots non può essere valutato compiutamente da Google per
canonical o contenuto. Il fatto che `/accesso-galleria` sia una candidata non
dimostra che sia l’URL segnalato.

## 7. Duplicati e URL non indicizzate

### 7.1 I 53 duplicati

**Evidenza:** RICHIEDE CONFERMA SEARCH CONSOLE.  
Gli export non contengono l’elenco completo dei 53 URL, quindi questo report non
inventa coppie URL A/URL B e non dichiara che coincidano con route del codice.

Possibili gruppi da controllare con URL Inspection:

| Possibile gruppo | Osservazione del repository | Stato dell’interpretazione | Verifica necessaria |
|---|---|---|---|
| slash finale | `/portfolio/` e route canonica ricevono 200 | IPOTESI | esportare URL con slash |
| query string | `/blog?category=foo` riceve 200 | IPOTESI | elenco URL e parametri effettivi |
| fallback SPA | sconosciuto e slug dinamico inesistente ricevono homepage 200 | PROVATO DALLA RISPOSTA HTTP LIVE | verificare se uno dei 53 è un fallback |
| Blog vs Real Wedding | i due tipi hanno prefissi e dati distinti, ma possono raccontare lo stesso matrimonio | IPOTESI | confrontare URL, title, excerpt e corpo |
| pagine SEO locali/portfolio | `/fotografo-aversa` e portfolio matrimonio hanno intenti parzialmente sovrapposti | IPOTESI | confronto contenuto e canonical scelti da Google |
| route legacy inglesi | `/consultations` è un alias React senza URL in sitemap | PROVATO DAL CODICE | URL Inspection e link esterni |
| title/meta/H1 | dinamici e gestiti in più livelli | PROVATO DAL CODICE | HTML renderizzato e dati Google per ogni URL |
| HTTP 200 al posto di 301/404 | fallback 200 dimostrato su sconosciute | PROVATO DALLA RISPOSTA HTTP LIVE | elenco URL Search Console |

Azioni possibili, da scegliere per singola coppia dopo conferma: nessuna
modifica, canonical, redirect 301, `noindex`, eliminazione dalla sitemap o
riscrittura editoriale. Non applicare una sola azione a tutti i 53.

### 7.2 “Rilevata, ma attualmente non indicizzata” (74)

**Evidenza:** RICHIEDE CONFERMA SEARCH CONSOLE.  
Il conteggio non consente di sapere quali URL siano orfane, sottili o duplicate.
Le cause da verificare sono:

- contenuto sottile o troppo simile a un altro articolo/Real Wedding;
- URL pubblica senza link interni rilevanti;
- title, description o H1 mancanti/uguali;
- contenuto disponibile solo dopo Firestore/API;
- canonical diverso da quello scelto da Google;
- HTTP 200 di fallback che non rappresenta una pagina reale;
- contenuto storico o stagionale con scarso valore attuale;
- status pubblicato nel database ma contenuto/immagini non disponibili;
- sovrapposizione tra articoli blog e Real Wedding dello stesso matrimonio.

Il prerender riduce il rischio client-side per le pagine note, ma non prova che
Google indicizzi ogni pagina prerenderizzata.

### 7.3 “Scansionata, ma attualmente non indicizzata” (2)

**Evidenza:** RICHIEDE CONFERMA SEARCH CONSOLE.  
Questa categoria indica che Google ha effettuato una scansione, ma l’export non
identifica URL o motivo editoriale. Dopo avere gli URL, controllare prima
contenuto, canonical scelto, qualità/duplicazione e risposta renderizzata; non
forzare automaticamente l’indicizzazione.

## 8. Linking interno

Legenda: **esistente** significa trovato nel codice statico/JSX o nel prerender;
**opportunità** significa suggerimento, non link attualmente presente.

| Pagina/intent | Link interni in ingresso esistenti | Link in uscita esistenti | Opportunità |
|---|---|---|---|
| Homepage `/` | root | `/portfolio/matrimonio`, `/consulenze`, `/vision`, categorie portfolio, `/portfolio`, `/fotografo-aversa`, `/blog`, `/storie`, `/stampa-foto-aversa`, accesso galleria | link contestuale a Real Wedding recente se editorialmente previsto |
| Portfolio matrimonio | homepage, `/portfolio`, pagine categoria/portfolio; link presente nel prerender | `/portfolio`, `/consulenze`, `/vision`, link correlati condivisi | collegare Real Wedding pertinenti con anchor descrittiva |
| Landing Aversa `/fotografo-aversa` | homepage | portfolio, battesimo, blog, consulenze, home | link espliciti a Real Wedding/location Aversa se pertinenti |
| Blog `/blog` | homepage, footer e pagine articolo | articoli e Real Wedding recenti, portfolio, storie, consulenze, home | rendere persistente una sezione Real Wedding con paginazione/link HTML |
| Articolo blog | Blog, articoli correlati, homepage/portfolio/storie/consulenze | link correlati e social | evitare di usare un articolo come duplicato narrativo di Real Wedding senza differenziazione |
| Real Wedding | Blog, link dal prerender/client verso Blog; homepage non mostra automaticamente una storia specifica | `/blog`, portfolio matrimonio, consulenze, vendor esterni | aggiungere link da una pagina pertinente solo quando la storia è pubblicata e autorizzata |
| Reggia di Caserta | termini e possibili titoli nelle pagine/blog; nessuna landing dedicata censita nelle route | dipende dai contenuti Firestore | verificare se esiste una pagina intent dedicata prima di crearne una |
| San Leucio | nessuna route/landing dedicata censita | dipende dai contenuti Firestore | stessa verifica; non inventare una landing |
| Intent locali ulteriori | `/fotografo-aversa`, portfolio e testi Campania | link tra servizi principali | usare solo pagine con contenuto realmente distinto |

**Evidenza codice:** PROVATO DAL CODICE per i link elencati.  
**Evidenza interpretativa:** IPOTESI per l’effetto su indicizzazione/orphaning,
finché Search Console non fornisce gli URL non indicizzati e i dati di link
scoperti.

## 9. Homepage image / miniatura

### 9.1 Cosa è già implementato

Nel codice e nell’HTML statico sono presenti:

- `og:image` assoluto verso `https://imagestudiofotografico.com/1200x630px.jpg`;
- `twitter:image` con la stessa URL;
- `og:image:width=1200`, `og:image:height=630`, `og:image:type=image/jpeg`;
- `WebSite`, `Organization`, `LocalBusiness`/`ProfessionalService`, `Person`;
- `image` sul ProfessionalService/LocalBusiness e `logo` su ProfessionalService/
  Organization;
- `max-image-preview:large` nei robots metadata e nel prerender;
- favicon ICO, PNG 16/32/512, Apple touch 180, Android Chrome 192/512;
- immagine reale nel corpo React `/images/gennaro-mazzacane.jpg`;
- slideshow hero con `<img>` e `alt` dopo caricamento Firestore;
- foto portfolio e campagne con `<img>` dopo caricamento dati.

**Evidenza:** PROVATO DAL CODICE.

### 9.2 Cosa manca o è incoerente

**Rilievo 🟠 Importante — primo HTML senza immagine hero**  
**Evidenza:** PROVATO DALLA RISPOSTA HTTP LIVE.  
Il primo HTML normale e quello crawler della homepage contengono zero tag `<img>`.
Il crawler riceve testo prerenderizzato, non la hero Firestore. La hero arriva
dopo hydration/query (`HeroSlideshow`) e la foto di Gennaro è `loading="lazy"`.
**Soluzione proposta:** rendere disponibile nel primo HTML una hero editoriale
stabile, con `src`, `alt`, dimensioni e URL assoluto/coerente, oppure assicurarsi
che il rendering server-side includa un’immagine reale verificabile.  
**Rischio:** medio; occorre evitare immagini non autorizzate o contenuto pesante.  
**Beneficio SEO atteso:** migliora idoneità tecnica e coerenza del contesto
immagine; non garantisce una miniatura in SERP.

**Rilievo 🟠 Importante — tag OG/Twitter duplicati nel prerender**  
**Evidenza:** PROVATO DAL CODICE.  
`renderSeoHtml()` rimuove i tag statici title/description/robots/OG title,
description, type, URL e Twitter title/description, ma non rimuove
`og:image` né `twitter:image`; poi inserisce nuovamente questi tag. La homepage
live crawler mostra due `og:image` e due `twitter:image` secondo il controllo
dei tag.  
**File coinvolti:** `server/seo-prerender.ts`, `client/index.html`.  
**Soluzione proposta:** una sola fonte per ciascun tag per risposta; mantenere
dimensioni/type coerenti con l’URL scelto.  
**Rischio:** basso-medio; una pulizia incompleta può rimuovere metadata utili.  
**Beneficio SEO atteso:** riduce ambiguità nei consumer social/crawler.

**Rilievo 🟡 Migliorabile — canonical e URL social non tutti coerenti nel client**  
**Evidenza:** PROVATO DAL CODICE.  
`useSEO` costruisce canonical e `og:url` con `window.location.origin` per Blog e
Real Wedding, mentre il prerender usa sempre `BASE_URL`. Il dominio `www` non è
risolto nel controllo DNS e il dominio canonico scelto è non-www.  
**Soluzione proposta:** normalizzare gli URL pubblici su una base configurata e
usare la stessa regola in client/server, dopo aver confermato host e redirect.  
**Rischio:** medio se cambia un URL pubblico già scoperto.  
**Beneficio SEO atteso:** segnali uniformi; non riduce automaticamente duplicati
senza conoscere gli URL interessati.

**Rilievo 🟡 Migliorabile — Organization senza proprietà `image` dedicata**  
**Evidenza:** PROVATO DAL CODICE.  
Organization espone `logo`, mentre LocalBusiness/ProfessionalService espongono
`image`; WebSite non espone una proprietà `image`. È tecnicamente accettabile
che i segnali siano distinti, ma la coerenza può essere resa più chiara con
markup standard e verificato.  
**Soluzione proposta:** valutare `Organization.image` solo se rappresenta davvero
l’organizzazione e mantenere `logo` come logo, senza keyword stuffing o markup
duplicato.  
**Rischio:** basso, ma schema errato o dati non rappresentativi possono generare
warning.  
**Beneficio SEO atteso:** chiarezza semantica, senza garanzia di thumbnail.

### 9.3 Verifica tecnica asset

| Asset | URL assoluto verificato | Status | Content-Type | Dimensioni | Byte live | Cache live | Ruolo |
|---|---|---:|---|---:|---:|---|---|
| `1200x630px.jpg` | sì | 200 | image/jpeg | 1200×630 | 416.985 | no-cache/must-revalidate | candidata OG e schema image |
| `assets/og-image.jpg` | sì | 200 | image/jpeg | 1200×630 | 416.985 | private, immutable | preload e copia asset |
| `favicon.ico` | sì | 200 | image/x-icon | 16/32/48 | 15.086 | no-cache | favicon |
| `favicon.png` | sì | 200 | image/png | 512×512 | 162.490 | no-cache | logo/fallback app |
| `favicon-16x16.png` | sì | 200 | image/png | 16×16 | 729 | no-cache | favicon |
| `favicon-32x32.png` | sì | 200 | image/png | 32×32 | 1.229 | no-cache | favicon |
| `apple-touch-icon.png` | sì | 200 | image/png | 180×180 | 15.115 | no-cache | iOS icon |
| `android-chrome-192x192.png` | sì | 200 | image/png | 192×192 | 17.773 | no-cache | PWA icon |
| `android-chrome-512x512.png` | sì | 200 | image/png | 512×512 | 162.490 | no-cache | PWA icon |
| `images/gennaro-mazzacane.jpg` | sì | 200 | image/jpeg | 1920×1010 | 177.261 | private, immutable | foto body, lazy |

Tutti gli asset sopra hanno risposto allo stesso modo con Mozilla, Googlebot e
Googlebot-Image nel controllo eseguito; non è stato rilevato `X-Robots-Tag`.
`1200x630px.jpg` e `assets/og-image.jpg` hanno stesso SHA-256 locale e stesso
comportamento HTTP; non sono due contenuti diversi nel controllo corrente.

**Evidenza live:** PROVATO DALLA RISPOSTA HTTP LIVE per status, header, dimensioni
e user agent.  
**Evidenza codice:** PROVATO DAL CODICE per i riferimenti agli asset. L’accesso
da un user agent dichiarato non prova da solo la decisione interna di Google.

**Audit CSS:** non sono state trovate immagini fotografiche della homepage
referenziate come `background-image`/`url()` nei CSS o JSX pubblici; le occorrenze
rilevanti sono gradienti, placeholder o pagine statiche promozionali separate.
Una foto usata come background non sostituirebbe una `<img>` semantica nel body.
**Evidenza:** PROVATO DAL CODICE.

### 9.4 Quale immagine potrebbe usare oggi Google?

**Risposta:** oggi Google potrebbe usare `https://imagestudiofotografico.com/
1200x630px.jpg`, perché è referenziata da `og:image`, `twitter:image`, JSON-LD
`image` e `max-image-preview:large`, è 1200×630, HTTP 200, JPEG e accessibile a
Googlebot-Image. Potrebbe anche scegliere un’immagine del corpo dopo rendering,
come una foto Firestore della slideshow o `/images/gennaro-mazzacane.jpg`, se la
considera più rappresentativa. Non è possibile sapere quale thumbnail sia stata
scelta senza il risultato SERP/URL Inspection.

**Evidenza:** PROVATO DAL CODICE per i segnali presenti; la scelta effettiva è
**IPOTESI**.

### 9.5 Candidata preferred e modifiche standard

La candidata preferred è **`/1200x630px.jpg`**: ha formato social standard,
contenuto wedding con marchio visibile, URL stabile alla root e identità binaria
uguale alla copia `/assets/og-image.jpg`. La preferenza è una raccomandazione
editoriale/tecnica, non una scelta già fatta da Google.

Modifiche standard da valutare solo dopo approvazione:

1. scegliere un solo URL immagine canonico e usare lo stesso in OG, schema e
   eventuale hero;
2. mantenere `og:image` assoluto, stabile, JPEG 1200×630 e aggiungere
   `og:image:alt` descrittivo se utile ai consumer;
3. inserire `image` coerente nei dati strutturati pertinenti e mantenere
   `Organization.logo` come logo quadrato, non come thumbnail;
4. rendere la hero pubblica e leggibile nel primo HTML con `alt`, senza testo
   nascosto, immagini duplicate o markup spam;
5. mantenere favicon/manifest per branding e browser, senza presentarli come
   segnali che garantiscono la miniatura SERP;
6. ripetere controllo HTTP, Googlebot-Image, Rich Results/URL Inspection dopo
   rilascio.

Distinzione obbligatoria:

- **favicon:** identifica il sito nel browser e in alcuni elementi di branding;
- **logo:** identità dell’organizzazione nei dati strutturati;
- **`og:image`:** principalmente social sharing e consumer Open Graph;
- **`image` JSON-LD:** contesto semantico per schema;
- **hero `<img>` nel body:** contenuto della pagina e possibile candidata immagine;
- **thumbnail Google Search:** scelta autonoma di Google, non garantita da nessuno
  dei segnali precedenti.

Nessun tag, proporzione, favicon, schema o `max-image-preview` garantisce la
visualizzazione di una miniatura nei risultati organici. L’obiettivo è rendere i
segnali tecnicamente accessibili, coerenti e non manipolativi.

## 10. Problemi classificati

### 🔴 Critico

1. **Fallback di URL sconosciute a HTTP 200/homepage** — già descritto nella
   sezione 5.  
   **Evidenza:** PROVATO DALLA RISPOSTA HTTP LIVE.  
   **Causa:** fallback SPA senza distinzione tra route valida e inesistente.  
   **File:** `server/production-web.ts`, `server/seo-prerender.ts`,
   `firebase.json`.  
   **Soluzione:** status reale per route sconosciute e policy per slug mancanti.  
   **Rischio:** medio-alto.

2. **53 duplicati non identificabili dall’export** — nessuna correzione in massa.  
   **Evidenza:** RICHIEDE CONFERMA SEARCH CONSOLE.  
   **Causa:** export aggregato privo di URL A/B.  
   **File da confrontare:** routing `client/src/App.tsx`, canonical
   `client/src/hooks/useSEO.ts`, `server/seo-prerender.ts`, sitemap.  
   **Soluzione:** esportazione URL completa + URL Inspection.  
   **Rischio di agire ora:** alto.

### 🟠 Importante

3. **Doppio `og:image`/`twitter:image` nel crawler prerender**.  
   **Evidenza:** PROVATO DAL CODICE.  
   **Causa:** i tag immagine statici non vengono rimossi prima dell’iniezione.  
   **File:** `server/seo-prerender.ts`, `client/index.html`.  
   **Soluzione:** una sola fonte per tag.  
   **Rischio:** basso-medio.

4. **Crawler senza `<img>` nel primo HTML homepage**.  
   **Evidenza:** PROVATO DALLA RISPOSTA HTTP LIVE.  
   **Causa:** hero/portfolio dipendono da hydration e Firestore.  
   **File:** `HeroSlideshow.tsx`, `PublicHomepage.tsx`,
   `server/seo-prerender.ts`.  
   **Soluzione:** hero stabile nel primo HTML o prerender con immagine reale.  
   **Rischio:** medio.

5. **Blocco robots singolo non attribuibile**.  
   **Evidenza:** RICHIEDE CONFERMA SEARCH CONSOLE.  
   **Causa:** l’export non porta l’URL; `/accesso-galleria` è solo candidata da
   codice.  
   **File:** `client/public/robots.txt`, `GalleryAccessPage.tsx`,
   `server/index.ts`.  
   **Soluzione:** ispezionare l’URL concreta.  
   **Rischio:** alto se si cambia una regola privata.

6. **Aree token non tutte esplicitamente noindex/disallow server-side**.  
   **Evidenza:** PROVATO DAL CODICE.  
   **Causa:** middleware non prerenderizza, ma non applica `X-Robots-Tag` generale
   a quote/fotolibro/collaboratori/view.  
   **File:** `server/seo-prerender.ts`, `server/index.ts`, `robots.txt`.  
   **Soluzione:** policy privacy per prefisso, senza rimuovere sicurezza.  
   **Rischio:** medio-alto.

### 🟡 Migliorabile

7. **HTML iniziale normale con metadata homepage legacy**.  
   **Evidenza:** PROVATO DALLA RISPOSTA HTTP LIVE.  
   **Causa:** `client/index.html` viene corretto da `useSEO` dopo hydration.  
   **File:** `client/index.html`, `client/src/hooks/useSEO.ts`.  
   **Soluzione:** allineare baseline statica al messaggio wedding-first.  
   **Rischio:** basso.

8. **Alias e contenuti dinamici senza prerender dedicato**.  
   **Evidenza:** PROVATO DAL CODICE.  
   **Causa:** alcune route React esistono ma non hanno metadata server specifico.  
   **File:** `client/src/App.tsx`, `server/seo-prerender.ts`.  
   **Soluzione:** prima decidere se sono URL pubbliche, alias o private; poi
   canonical/redirect/noindex per singola policy.  
   **Rischio:** medio.

9. **Possibile sovrapposizione Blog/Real Wedding e pagine locali**.  
   **Evidenza:** IPOTESI.  
   **Causa plausibile:** stesso matrimonio o stesso intent può apparire in due
   prefissi e in landing/portfolio diversi.  
   **File:** `BlogListPage.tsx`, `BlogPostPage.tsx`, `WeddingSeoPage.tsx`,
   `FotografoAversaPage.tsx`, contenuti Firestore.  
   **Soluzione:** confronto URL/content export; differenziare valore editoriale,
   non applicare noindex alla cieca.  
   **Rischio:** alto se si elimina o declassa contenuto utile.

### 🟢 Corretto

10. **Sitemap live** — 96/96 HTTP 200, unique, senza query e canonical allineato.  
    **Evidenza:** PROVATO DALLA RISPOSTA HTTP LIVE.  
    **File:** `server/sitemap-generator.ts`, `server/index.ts`.  
    **Soluzione:** nessuna modifica urgente; conservare un test di regressione.  
    **Rischio:** basso.

11. **Asset preferred tecnicamente accessibile** — JPEG 1200×630, 200, content-
    type corretto e accessibile a Googlebot-Image.  
    **Evidenza:** PROVATO DALLA RISPOSTA HTTP LIVE.  
    **Soluzione:** non sostituire l’immagine senza approvazione; uniformare i
    riferimenti se si interviene.  
    **Rischio:** basso.

## 11. Matrice breve di verifica post-rilascio

| Verifica | Esito da ottenere |
|---|---|
| Typecheck | nessun errore TypeScript |
| Test | unit/integration SEO verdi, inclusi prerender e sitemap |
| Build | `npm run build` completato e client bundle verificato |
| Sitemap | XML 200, solo URL pubbliche/canoniche, status 200, nessuna query |
| Robots | direttive coerenti con privacy e URL pubbliche |
| Prerender | Googlebot riceve title, description, H1, testo, canonical e JSON-LD |
| Canonical | un solo canonical assoluto per URL pubblica |
| Status HTTP | route valide 200, inesistenti/private con policy coerente |
| Immagini | preferred e hero accessibili a Googlebot-Image, JPEG/content-type/
  cache/dimensioni corretti |
| Accessibilità | `alt` significativo per immagini di contenuto, decorazioni escluse |

## 12. COSA FARE DAVVERO

Le prime righe sono modifiche approvabili. Le righe marcate come controllo
Search Console non vanno sostituite con supposizioni.

| Priorità | Problema | Intervento | File | Rischio | Beneficio SEO atteso |
|---:|---|---|---|---|---|
| 1 | URL sconosciute servite 200/homepage | Definire 404 reale per route/slug inesistenti mantenendo i deep link validi | `server/production-web.ts`, `server/seo-prerender.ts`, `firebase.json` | Medio-alto | Riduce soft-404 e canonical homepage spurii |
| 2 | 53 duplicati senza URL individuali | Esportare i 53 URL e ispezionare un campione prima di scegliere canonical/301/noindex | Search Console + report operativo | Alto se saltato | Identifica la correzione giusta per ciascun gruppo |
| 3 | Tag immagine duplicati nel prerender | Conservare una sola coppia `og:image`/`twitter:image` | `server/seo-prerender.ts`, `client/index.html` | Basso-medio | Segnali meno ambigui per i consumer |
| 4 | Nessuna `<img>` nel primo HTML homepage | Rendere una hero stabile disponibile nel markup iniziale, con alt e dimensioni | `server/seo-prerender.ts`, `PublicHomepage.tsx`, `HeroSlideshow.tsx` | Medio | Migliora idoneità/coerenza immagini; non garantisce thumbnail |
| 5 | Baseline client legacy | Allineare title/description/OG statici al messaggio canonico wedding-first | `client/index.html` | Basso | Evita metadata incoerenti prima di hydration |
| 6 | Alias e aree token | Classificare `/consultations`, quote, fotolibro, collaboratori, view: pubblico, alias o privato; applicare una policy per gruppo | `client/src/App.tsx`, `server/index.ts`, `robots.txt` | Medio-alto | Riduce scoperta di URL non editoriali senza bloccare pagine utili |
| 7 | Linking verso contenuti prioritari | Collegare Real Wedding e intent locali solo da pagine pertinenti e pubblicate | `PublicHomepage.tsx`, `BlogListPage.tsx`, `WeddingSeoPage.tsx`, pagine portfolio | Medio | Migliora scoperta e contesto interno |
| 8 | Verifica sitemap/robots automatica | Aggiungere controllo che confronti URL, canonical, robots e status | test sitemap/prerender o script CI | Basso | Previene regressioni di rilascio |
| 9 | Immagine preferred | Uniformare tutti i segnali alla sola `/1200x630px.jpg` dopo approvazione editoriale | `client/index.html`, `server/seo-prerender.ts`, `useSEO.ts` | Basso | Coerenza OG/schema/hero; nessuna garanzia SERP |
| 10 | Validazione finale | Ripetere URL Inspection, controllo immagini e campione status dopo il rilascio | Search Console + matrice §11 | Basso | Misura ciò che Google vede davvero |

## Appendice A — registro completo sitemap live

Il controllo live ha classificato ogni voce seguente come **pubblica, canonica,
senza query, HTTP 200**; per le voci dinamiche il generatore richiede inoltre
`status=published`. Le 96 voci erano uniche e il canonical crawler coincideva con
la voce sitemap.

### Statiche (20/20)

`/`, `/portfolio/matrimonio`, `/vision`, `/portfolio`, `/portfolio/battesimo`,
`/portfolio/comunione`, `/portfolio/cresima`, `/portfolio/evento`,
`/portfolio/ritratto`, `/portfolio/famiglia`, `/portfolio/altro`, `/blog`,
`/storie`, `/fotografo-aversa`, `/stampa-foto-aversa`, `/prenota`, `/consulenze`,
`/lasciati-trasportare`, `/privacy`, `/terms`.

### Blog pubblicati (68/68)

1. `/blog/foto-di-matrimonio-spontanee-il-segreto-e-non-saper-posare`
2. `/blog/perche-non-ti-piaci-nelle-foto-la-verita-che-nessuno-ti-racconta-sulla-fotogenia`
3. `/blog/servizio-fotografico-e-video-matrimonio-a-napoli-e-caserta-image-experience-2200`
4. `/blog/matrimonio-matrimonio-napoli`
5. `/blog/guida-completa-al-matrimonio`
6. `/blog/fotografo-matrimonio-aversa-come-costruire-un-servizio-fotografico-che-vi-rappresenti-davvero`
7. `/blog/tendenze-matrimonio-2026-in-campania-idee-stile-e-ispirazioni-gennaro-mazzacane`
8. `/blog/servizio-fotografico-di-carnevale-ad-aversa-un-esperienza-pensata-per-i-bambini`
9. `/blog/perche-scegliere-le-foto-e-piu-difficile-che-scattarle`
10. `/blog/fotografia-sincera-il-mio-approccio-come-fotografo-ad-aversa`
11. `/blog/il-libro-digitale-interattivo-la-vostra-storia-d-amore-raccontata-da-voi`
12. `/blog/oltre-il-sito-vetrina-la-vera-rivoluzione-digitale-per-il-tuo-matrimonio`
13. `/blog/fotolibro-online-come-utilizzarlo-per-le-tue-foto-ricordo`
14. `/blog/il-fascino-del-matrimonio-allaperto-tra-natura-e-bellezza`
15. `/blog/il-fotografo-per-il-tuo-matrimonio-come-scegliere-quello-piu-adatto-a-te`
16. `/blog/passi-damore`
17. `/blog/foto-di-natale-prenota-subito-le-tue-foto-ricordo-di-natale-2018`
18. `/blog/il-fotografo-di-matrimonio-a-napoli-innovazione-e-tradizione-a-confronto`
19. `/blog/quattro-suggerimenti-per-foto-di-nozze-perfette`
20. `/blog/foto-reportage-del-matrimonio-a-napoli-sempre-piu-coppie-lo-richiedono`
21. `/blog/immagini-matrimonio-divertenti-gli-scatti-imperdibili`
22. `/blog/location-foto-matrimonio-napoli-4-consigli-per-te`
23. `/blog/album-fotografico-del-matrimonio-cosa-occorre-sapere-per-scegliere-il-meglio`
24. `/blog/addobbi-nuziali-quando-le-decorazioni-creano-latmosfera-giusta`
25. `/blog/fotoreportage-di-matrimonio-fedelta`
26. `/blog/sposarsi-in-costiera-amalfitana-5-luoghi-mozzafiato-per-il-giorno-piu-bello-della-tua-vita`
27. `/blog/le-foto-della-sposa-gli-scatti-che-non-possono-mancare`
28. `/blog/foto-perfette-4-consigli-utili`
29. `/blog/photo-box-scopri-subito-unoccasione-davvero-imperdibile`
30. `/blog/fotografia-lunga-esposizione-piccoli-suggerimenti-per-uno-scatto-perfetto`
31. `/blog/costo-servizio-fotografico-matrimonio-facciamo-due-conti`
32. `/blog/fotografo-di-matrimoni-a-napoli-e-provincia-consigli-utili`
33. `/blog/foto-artistiche-in-bianco-e-nero-fascino-senza-tempo`
34. `/blog/servizio-fotografico-battesimo-idea-regalo`
35. `/blog/matrimonio-a-natale-7-buoni-motivi-per-sposarsi-a-dicembre`
36. `/blog/consigli-utili-sul-bouquet-da-un-fotografo-di-matrimoni`
37. `/blog/servizio-fotografico-economico-5-consigli-utili`
38. `/blog/foto-matrimonio-in-spiaggia-divertimento-e-fantasia-al-potere`
39. `/blog/il-20-e-21-ottobre-vieni-a-trovarci-alla-fiera-tutto-sposi`
40. `/blog/book-fotografico-questione-di-scelte`
41. `/blog/tendenze-per-gli-album-di-nozze-per-il-2019`
42. `/blog/idee-foto-quando-la-semplicita-e-la-vera-novita-da-inseguire`
43. `/blog/lalbum-fotografico-del-matrimonio-6-consigli-davvero-utili`
44. `/blog/foto-anteprima-matrimonio-napoli-il-racconto-della-tua-storia-damore`
45. `/blog/foto-da-matrimonio-la-poesia-degli-scatti-semplici-e-spontanei`
46. `/blog/foto-del-matrimonio-4-consigli-per-migliorare-il-servizio-fotografico`
47. `/blog/foto-con-luce-naturale-quando-lo-scatto-diventa-arte`
48. `/blog/foto-per-matrimoni-in-costiera-amalfitana-ad-ogni-scatto-unemozione-unica`
49. `/blog/cornici-con-foto-ai-tuoi-invitati-le-regaliamo-noi`
50. `/blog/battesimi-foto-idee-e-consigli-utili-per-scoprirne-di-piu`
51. `/blog/servizio-fotografico-sempre-piu-coppie-scelgono-il-reportage-delle-nozze`
52. `/blog/immagini-matrimonio-non-scegliermi`
53. `/blog/album-panoramico-i-vantaggi`
54. `/blog/foto-dei-particolari-in-un-matrimonio-quando-i-dettagli-fanno-la-differenza`
55. `/blog/paesaggio-di-notte-7-consigli-utili-per-foto-impeccabili`
56. `/blog/apertura-nuova-sede-ad-aversa-lo-studio-gennaro-mazzacane-raddoppia`
57. `/blog/fotografo-sposa-larte-di-ritrarre-la-personalita-femminile`
58. `/blog/le-foto-degli-abbracci-in-un-matrimonio`
59. `/blog/fotografia-effetto-seta-5-consigli-utili-per-uno-scatto-perfetto`
60. `/blog/foto-di-famiglia-a-natale-le-foto-di-oggi-sono-i-tuoi-ricordi-di-domani`
61. `/blog/instagram-stories-la-femminilita-tra-ironia-e-sensualita`
62. `/blog/fotografare-cerimonie-quando-protagonista-e-lemozione`
63. `/blog/foto-ritratto-5-consigli-utili`
64. `/blog/matrimonio-con-la-pioggia-quando-limprevisto-si-trasforma-in-magia`
65. `/blog/le-fotografie-per-un-matrimonio-in-autunno-3-consigli-utili`
66. `/blog/le-foto-agli-sposi-di-spalle-quando-i-dettagli-descrivono-unemozione`
67. `/blog/fotoritocco-del-matrimonio-cerchiamo-di-scoprirne-di-piu`
68. `/blog/fotografo-aversa-le-foto-del-matrimonio-di-angelica-e-emmanuele`

### Real Wedding pubblicati (8/8)

1. `/real-wedding/il-reportage-di-matrimonio-di-claudia-e-daniele-a-roga-event`
2. `/real-wedding/la-narrazione-di-un-giorno-speciale-il-reportage-per-angelo-e-carolina`
3. `/real-wedding/il-cammino-di-francesco-e-rosaria-un-reportage-di-anime-legami-e-colori-da-carinaro-a-vill`
4. `/real-wedding/l-eleganza-dei-gesti-il-reportage-di-matrimonio-di-margherita-e-giuseppe`
5. `/real-wedding/matrimonio-reggia-di-caserta-villa-ebla-giuseppe-martina`
6. `/real-wedding/un-racconto-visivo-di-nozze-il-si-di-gaetano-e-adelaide-tra-aversa-e-il-casale-dei-mascion`
7. `/real-wedding/matrimonio-di-biagio-e-roberta-9-luglio-2026-punta-castello`
8. `/real-wedding/il-reportage-fotografico-di-luigi-e-francesca-a-tenuta-pegaso`
