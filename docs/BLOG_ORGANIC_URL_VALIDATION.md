# Validazione organica URL-level per merge e redirect Blog

**Data della verifica:** 4 settembre 2026  
**Perimetro:** i cinque gruppi candidati nell'audit editoriale, senza modifiche a slug, contenuti, sitemap, redirect o route.

## Esito

Sono stati trovati e importati due export Search Console in
`attached_assets/`, ma non hanno la granularità necessaria per validare le
cinque coppie:

- L'export Performance copre **13/05/2026–12/08/2026 (92 giorni)** e registra
  **21 clic, 1.295 impressioni e CTR derivato 1,62%**.
- `Pagine.csv` contiene una sola riga, la homepage
  (`https://imagestudiofotografico.com/`): 21 clic, 1.295 impressioni, CTR
  1,62%, posizione 9,38. Nessuna delle 10 URL candidate compare nel file.
- `Query.csv` contiene 51 query aggregate, ma non la dimensione combinata
  query × pagina; non è quindi possibile attribuire una query a sorgente o
  destinazione.
- L'export Coverage copre **16/05/2026–07/08/2026 (84 giorni)** e segnala una
  pagina bloccata da `robots.txt` e una pagina scansionata ma non indicizzata,
  senza indicare che siano una delle 10 URL candidate.
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
| Google Search Console Performance | Export disponibile, ma aggregato | 13/05/2026–12/08/2026: 21 clic, 1.295 impressioni, CTR derivato 1,62%; nessun dato per le URL candidate |
| Google Search Console Coverage | Export disponibile, senza URL candidate identificabili | 16/05/2026–07/08/2026: 1 robots.txt, 1 scansionata ma non indicizzata |
| Analytics nativo Replit | Autorizzato ma senza righe | Nessun pageview Blog e nessun evento custom |
| Google Analytics 4 | Nessun connettore disponibile | Nessuna landing page o conversione |
| Backlink provider | Nessun export disponibile; Semrush richiede setup | Nessun backlink/referring domain |

## Matrice delle cinque coppie

`N/D` significa che la metrica URL-level non è stata raccolta, non che il
valore della singola pagina è zero. I totali Search Console sopra sono dati
reali, ma non attribuibili alle coppie.

| Sorgente candidata | Destinazione candidata | Query / impressioni / clic / CTR / posizione | Pageview / conversioni | Backlink | Decisione |
|---|---|---|---|---|---|
| `/blog/matrimonio-matrimonio-napoli` | `/blog/guida-completa-al-matrimonio` | N/D: `Pagine.csv` contiene solo la homepage | N/D | N/D | **NON DECIDERE**; manca attribuzione URL-level |
| `/blog/quattro-suggerimenti-per-foto-di-nozze-perfette` | `/blog/foto-perfette-4-consigli-utili` | N/D: `Pagine.csv` contiene solo la homepage | N/D | N/D | **NON DECIDERE**; manca attribuzione URL-level |
| `/blog/fotoreportage-di-matrimonio-fedelta` | `/blog/foto-reportage-del-matrimonio-a-napoli-sempre-piu-coppie-lo-richiedono` | N/D: `Query.csv` non combina query e pagina | N/D | N/D | **NON DECIDERE**; intento tecnico/località non validabile |
| `/blog/servizio-fotografico-economico-5-consigli-utili` | `/blog/costo-servizio-fotografico-matrimonio-facciamo-due-conti` | N/D: `Query.csv` non combina query e pagina | N/D | N/D | **NON DECIDERE**; manca attribuzione URL-level |
| `/blog/album-panoramico-i-vantaggi` | `/blog/lalbum-fotografico-del-matrimonio-6-consigli-davvero-utili` | N/D: nessuna URL candidata nell'export pagine | N/D | N/D | **NON DECIDERE**; manca attribuzione URL-level |

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