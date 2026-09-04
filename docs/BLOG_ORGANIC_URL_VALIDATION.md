# Validazione organica URL-level per merge e redirect Blog

**Data della verifica:** 4 settembre 2026  
**Perimetro:** i cinque gruppi candidati nell'audit editoriale, senza modifiche a slug, contenuti, sitemap, redirect o route.

## Esito

Sono stati trovati e importati due export Search Console in
`attached_assets/`, ma non hanno la granularità necessaria per validare le
cinque coppie:

- L'export Performance copre **13/05/2026–12/08/2026 (92 giorni)** e registra
  **21 clic, 1.295 impressioni e CTR derivato 1,62%**.
- Il report Performance più recente fornito dall'utente copre
  **02/06/2026–01/09/2026 (92 giorni)** e registra **20 clic, 1.538
  impressioni e CTR derivato 1,30%**. La posizione giornaliera pesata sulle
  impressioni è circa **11,28**; è un calcolo aggregato, non una posizione
  attribuita a una singola URL.
- `Pagine.csv` contiene una sola riga, la homepage
  (`https://imagestudiofotografico.com/`): 21 clic, 1.295 impressioni, CTR
  1,62%, posizione 9,38. Nessuna delle 10 URL candidate compare nel file.
- Nel nuovo report le ultime 30 giornate registrano 4 clic su 570 impressioni
  (CTR 0,70%), contro 7 clic su 484 impressioni nelle prime 30 giornate
  (CTR 1,45%). Le impressioni recenti sono quindi aumentate, ma senza un
  miglioramento proporzionale dei clic; anche questo confronto resta
  site-wide.
- `Query.csv` contiene 51 query aggregate, ma non la dimensione combinata
  query × pagina; non è quindi possibile attribuire una query a sorgente o
  destinazione.
- L'export Coverage copre **16/05/2026–07/08/2026 (84 giorni)** e segnala una
  pagina bloccata da `robots.txt` e una pagina scansionata ma non indicizzata.
  Il report Coverage più recente fornito successivamente estende il grafico al
  **28/08/2026**, ma resta aggregato e non indica quali URL appartengano al
  Blog.
- Nel report più recente la copertura passa da **2 non indicizzate / 1
  indicizzata** il 17/08 a **85 / 3** il 18/08, poi a **130 / 16** dal 22/08.
  È una forte espansione della scoperta delle URL, non una prova che le
  singole pagine candidate siano state indicizzate.
- Le righe del 06–07/06 hanno conteggi vuoti: vanno trattate come dati non
  disponibili, non come zero. Anche le impressioni giornaliere sono aggregate
  e il report non contiene URL, query, clic o posizione per pagina.
- Dalla schermata Sitemap fornita dall'utente, `/sitemap.xml` risulta inviata il
  **25/08/2026**, letta da Google il **03/09/2026**, con stato **Riuscita** e
  **96 pagine rilevate**. Questo non significa 96 pagine indicizzate: è il
  numero di URL trovate nella sitemap. Non è direttamente confrontabile con
  130 non indicizzate + 16 indicizzate, perché la copertura può includere URL
  scoperte anche da altre fonti e categorie diverse.
- L'analytics nativo del progetto è autorizzato, ma le interrogazioni all-time
  hanno restituito **0 pageview per `/blog/*` e 0 eventi custom**. Questo non
  dimostra traffico nullo: la copertura può iniziare dopo l'attivazione e la
  pubblicazione dell'analytics.
- Non è disponibile un export backlink URL-level né un export Google Analytics
  4 con conversioni. Semrush è stato individuato come connettore catalogo che
  richiede setup, ma non è stato collegato senza una scelta esplicita del
  proprietario.

La decisione di sicurezza per tutte le coppie è quindi **NON DECIDERE**:
nessun merge, redirect o cancellazione è stato applicato. I dati reali
disponibili sono stati registrati, ma non sono sufficienti per trasformare le
raccomandazioni editoriali dell'audit in azioni tecniche.

## Fonti e metriche

| Fonte | Stato | Metriche ottenute |
|---|---|---|
| Google Search Console Performance (export precedente) | Export disponibile, ma aggregato | 13/05/2026–12/08/2026: 21 clic, 1.295 impressioni, CTR derivato 1,62%; nessun dato per le URL candidate |
| Google Search Console Performance (report più recente) | Dati forniti dall'utente, ma aggregati | 02/06/2026–01/09/2026: 20 clic, 1.538 impressioni, CTR derivato 1,30%; nessun dato per le URL candidate |
| Google Search Console Coverage | Export disponibile, più report fornito dall'utente; sempre aggregato | ZIP: 16/05/2026–07/08/2026 con 1 robots.txt e 1 scansionata ma non indicizzata. Report successivo: fino al 28/08/2026, 130 non indicizzate e 16 indicizzate nell'ultimo intervallo |
| Analytics nativo Replit | Autorizzato ma senza righe | Nessun pageview Blog e nessun evento custom |
| Google Analytics 4 | Nessun connettore disponibile | Nessuna landing page o conversione |
| Backlink provider | Nessun export disponibile; Semrush richiede setup | Nessun backlink/referring domain |

## Matrice delle cinque coppie

`N/D` significa che la metrica URL-level non è stata raccolta, non che il
valore della singola pagina è zero. I totali Search Console sopra sono dati
reali, ma non attribuibili alle coppie. Il report Coverage non contiene i nomi
delle pagine e, in assenza di un filtro esplicito, potrebbe riferirsi all'intera
proprietà, non ai soli 68 articoli Blog.

| Sorgente candidata | Destinazione candidata | Query / impressioni / clic / CTR / posizione | Pageview / conversioni | Backlink | Decisione |
|---|---|---|---|---|---|
| `/blog/matrimonio-matrimonio-napoli` | `/blog/guida-completa-al-matrimonio` | N/D: `Pagine.csv` contiene solo la homepage; Coverage non elenca URL | N/D | N/D | **NON DECIDERE**; manca attribuzione URL-level |
| `/blog/quattro-suggerimenti-per-foto-di-nozze-perfette` | `/blog/foto-perfette-4-consigli-utili` | N/D: `Pagine.csv` contiene solo la homepage; Coverage non elenca URL | N/D | N/D | **NON DECIDERE**; manca attribuzione URL-level |
| `/blog/fotoreportage-di-matrimonio-fedelta` | `/blog/foto-reportage-del-matrimonio-a-napoli-sempre-piu-coppie-lo-richiedono` | N/D: `Query.csv` non combina query e pagina; Coverage è aggregato | N/D | N/D | **NON DECIDERE**; intento tecnico/località non validabile |
| `/blog/servizio-fotografico-economico-5-consigli-utili` | `/blog/costo-servizio-fotografico-matrimonio-facciamo-due-conti` | N/D: `Query.csv` non combina query e pagina; Coverage è aggregato | N/D | N/D | **NON DECIDERE**; manca attribuzione URL-level |
| `/blog/album-panoramico-i-vantaggi` | `/blog/lalbum-fotografico-del-matrimonio-6-consigli-davvero-utili` | N/D: Coverage non elenca URL candidate | N/D | N/D | **NON DECIDERE**; manca attribuzione URL-level |

## Dati necessari per sbloccare la decisione

Per ciascuno dei 10 URL servono almeno:

1. **Search Console:** query, clic, impressioni, CTR, posizione media e
   intervallo temporale coerente; preferibilmente gli ultimi 16 mesi e un
   confronto anno su anno.
2. **Analytics:** landing page URL, sessioni/utenti, engagement e conversioni
   attribuite alla pagina o al percorso iniziato dalla pagina.
3. **Backlink:** referring domain, URL della pagina linkante, target URL,
   autorità/qualità della fonte e stato del link.

Gli export possono essere importati in CSV/Google Sheet senza condividere
credenziali. Dopo l'importazione, la decisione dovrà seguire questa regola:

- **Differenziazione** se sorgente e destinazione hanno query o conversioni
  distintive.
- **Merge senza redirect immediato** se una pagina è chiaramente subordinata
  ma possiede segnali che vanno prima assorbiti nel contenuto principale.
- **Redirect 301** solo quando l'intento è sostanzialmente lo stesso, la
  destinazione assorbe le query e i segnali della sorgente e non emergono
  backlink o conversioni che richiedano una destinazione diversa.

Questa matrice deve essere aggiornata con numeri e intervallo temporale prima
di trasformare una raccomandazione in un'azione tecnica.