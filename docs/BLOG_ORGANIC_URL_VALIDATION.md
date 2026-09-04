# Validazione organica URL-level per merge e redirect Blog

**Data della verifica:** 4 settembre 2026  
**Perimetro:** i cinque gruppi candidati nell'audit editoriale, senza modifiche a slug, contenuti, sitemap, redirect o route.

## Esito

La validazione non può ancora produrre una decisione organica affidabile:

- Search Console non è collegato alle integrazioni del progetto e non è presente
  un export locale.
- La ricerca delle integrazioni non ha trovato un connettore Google Search
  Console o Google Analytics 4.
- L'analytics nativo del progetto è autorizzato, ma le interrogazioni all-time
  hanno restituito **0 pageview per `/blog/*` e 0 eventi custom**. Questo non
  dimostra traffico nullo: la copertura può iniziare dopo l'attivazione e la
  pubblicazione dell'analytics.
- Non è disponibile un export backlink URL-level. Semrush è stato individuato
  come connettore catalogo che richiede setup, ma non è stato collegato senza
  una scelta esplicita del proprietario.

Di conseguenza **nessun merge, redirect o cancellazione è stato applicato**.
Le raccomandazioni dell'audit restano ipotesi editoriali, non decisioni
validate dai dati.

## Fonti e metriche

| Fonte | Stato | Metriche ottenute |
|---|---|---|
| Google Search Console | Non disponibile | Nessuna query, impressione, clic, CTR, posizione o copertura |
| Analytics nativo Replit | Autorizzato ma senza righe | Nessun pageview Blog e nessun evento custom |
| Google Analytics 4 | Nessun connettore disponibile | Nessuna landing page o conversione |
| Backlink provider | Nessun export disponibile; Semrush richiede setup | Nessun backlink/referring domain |

## Matrice delle cinque coppie

`N/D` significa che la metrica non è stata raccolta, non che il valore è zero.

| Sorgente candidata | Destinazione candidata | Query / impressioni / clic / CTR / posizione | Pageview / conversioni | Backlink | Decisione |
|---|---|---|---|---|---|
| `/blog/matrimonio-matrimonio-napoli` | `/blog/guida-completa-al-matrimonio` | N/D | N/D | N/D | **NON DECIDERE**; merge/redirect solo dopo dati |
| `/blog/quattro-suggerimenti-per-foto-di-nozze-perfette` | `/blog/foto-perfette-4-consigli-utili` | N/D | N/D | N/D | **NON DECIDERE**; merge/redirect solo dopo dati |
| `/blog/fotoreportage-di-matrimonio-fedelta` | `/blog/foto-reportage-del-matrimonio-a-napoli-sempre-piu-coppie-lo-richiedono` | N/D | N/D | N/D | **NON DECIDERE**; distinguere o consolidare dopo dati |
| `/blog/servizio-fotografico-economico-5-consigli-utili` | `/blog/costo-servizio-fotografico-matrimonio-facciamo-due-conti` | N/D | N/D | N/D | **NON DECIDERE**; merge/redirect solo dopo dati |
| `/blog/album-panoramico-i-vantaggi` | `/blog/lalbum-fotografico-del-matrimonio-6-consigli-davvero-utili` | N/D | N/D | N/D | **NON DECIDERE**; merge/redirect solo dopo dati |

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