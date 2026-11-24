# Anteprime social pubbliche

L'inventario è in `lib/shared-src/social-metadata.ts`: è la stessa fonte usata dal
prerender, da `useSEO` e dall'HTML statico del servizio stampa. Non modificare le
copie storiche sotto `artifacts/api-server/shared`.

## Landing incluse

Ogni riga/route ha un URL e un contenuto immagine distinti:

- `/`: foto matrimonio originale della home.
- `/portfolio`: composizione dedicata, coppia durante una passeggiata.
- `/portfolio/matrimonio`, `/portfolio/battesimo`, `/portfolio/comunione`,
  `/portfolio/cresima`, `/portfolio/evento`, `/portfolio/ritratto`: le sei immagini
  pubbliche già associate alle categorie.
- `/portfolio/famiglia`: composizione con una famiglia in spiaggia.
- `/portfolio/altro`: composizione dedicata agli altri progetti fotografici.
- `/blog`: coppia che sceglie le fotografie, distinta dalla home anche nei byte.
- `/image-experience`: anteprima dedicata esistente, abbraccio della sposa.
- `/vision`: anteprima Image Vision esistente, identica su client e server.
- `/fotografo-aversa`: ritratto di Gennaro; `/storie`: Gennaro con fotocamera.
- `/stampa-foto-aversa`: stampe sul tavolo; `/lasciati-trasportare`: copertina libro.
- `/prenota` e `/consulenze`: illustrazioni pubbliche specifiche già esistenti.
- `/regala`: busta e sigillo; `/regala/come-funziona`: busta aperta e tre passaggi.
- `/online-shop`: stampe e regali fotografici.
- `/privacy`, `/cookie-policy`, `/terms`, `/gdpr`: schede informative distinte.

## Contenuti dinamici

- `/blog/:slug`: copertina editoriale valida → prima immagine pubblica valida nel
  contenuto (anche da `contentUrl`) → `blog-articolo.jpg`.
- `/real-wedding/:slug`: foto selezionate con copertina in testa; alt editoriale →
  titolo del capitolo → titolo della storia. Senza foto valida: `real-wedding.jpg`.
- `/prenota/:code`: immagine della campagna → `prenotazione.jpg`.
- `/online-shop/categoria/:value`: prima immagine pubblica valida dei prodotti
  della categoria, nell'ordine del catalogo → `shop-categoria.jpg`.
- Le categorie portfolio senza immagine propria usano esplicitamente l'immagine
  della sezione portfolio, mai quella globale; famiglia e altro hanno asset propri.

I fallback delle quattro sezioni sono distinti dalle landing. URL vuoti, blob,
data, locali o firmati a scadenza non sono candidati social validi. Un URL
formalmente pubblico che smette di funzionare sul servizio remoto non è
rilevabile dal solo resolver sincrono.

## Esclusioni e gate invariati

Admin, gallery/accesso, link a token, ospiti (noindex), negozi (noindex),
checkout/ordini/conferme, sottopagine delle consulenze, profilo e richieste
password non fanno parte dell'inventario. L'alias storico `/consultations` non
aggiunge una landing canonica distinta.

`GIFT_SHOP_INDEXABLE` e `SHOP_INDEXABLE` continuano a decidere l'indicizzabilità
delle rispettive pagine: questa modifica non apre i gate.

## Rigenerazione e verifica

`node artifacts/api-server/scripts/build-social-images.mjs` genera i piccoli JPEG
1200×630 da asset locali già presenti, senza cambiare le immagini nel corpo delle
pagine. Le foto preesistenti usate direttamente conservano dimensioni e formato
reali dichiarati nella mappa. Le composizioni regalo sono evergreen.

`src/social-metadata.contract.test.ts` nell'API verifica l'inventario, URL e hash
distinti, immagini decodificabili tramite HTTP pubblico senza autenticazione,
dimensioni/formati e parità dei quattro tag immagine prima e dopo l'effetto reale
di `useSEO`, con Firestore simulato (nessuna scrittura sul database).
