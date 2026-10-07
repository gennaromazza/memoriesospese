# Anteprima social della pagina stampe

## Controllo pubblico prima della correzione

Controllo eseguito il 6 ottobre 2026 su `https://imagestudiofotografico.com/stampa-foto-aversa`.

| User agent | Risposta | Canonical ricevuto | `og:url` ricevuto | Immagini ricevute |
| --- | --- | --- | --- | --- |
| Browser Chrome | HTTP 200, nessun redirect | `https://imagestudiofotografico.com/` | `https://imagestudiofotografico.com` | `og:image` e `twitter:image` assenti |
| `facebookexternalhit/1.1` | HTTP 200, nessun redirect | `https://imagestudiofotografico.com/` | `https://imagestudiofotografico.com` | `og:image` e `twitter:image` assenti |

Il corpo era l'HTML statico della homepage (titolo della home e immagine `/1200x630px.jpg`). La causa è il rewrite statico `/* → /index.html`, che consegna la homepage iniziale anche sulle route interne; il middleware SEO Express non è montato sul servizio web statico.

L'immagine scelta per la pagina stampe, `https://imagestudiofotografico.com/images/print-service/printed-memories-table.jpg`, ha risposto HTTP 200 con `Content-Type: image/jpeg` al controllo pubblico.

## Correzione in attesa di pubblicazione

La build crea `dist/public/stampa-foto-aversa.html` con un solo canonical, `og:url`, `og:image` e `twitter:image` specifici della pagina. Le rewrite esatte per `/stampa-foto-aversa` e `/stampa-foto-aversa/` precedono il fallback SPA; le altre route, incluse quelle private, non vengono cambiate.

La build non modifica il deployment pubblicato. Dopo aver pubblicato questa versione:

1. Ripetere le richieste browser e `facebookexternalhit/1.1` e verificare status, redirect, un solo canonical e `og:url` esattamente uguali a `https://imagestudiofotografico.com/stampa-foto-aversa`, oltre a `og:image` e `twitter:image` uguali all'immagine sopra.
2. Aprire il [Meta Sharing Debugger](https://developers.facebook.com/tools/debug/), inviare l'URL e selezionare **Scrape Again**. Confermare che l'anteprima usa l'immagine delle stampe.
3. Se il debugger continua a mostrare l'immagine precedente mentre le nuove richieste HTTP contengono i tag corretti, annotare il ritardo come cache Meta, non come errore della risposta del sito.

Il debugger Meta richiede una sessione Facebook. Al controllo del 6 ottobre 2026 ha mostrato la schermata di accesso, quindi non è stato possibile richiedere un nuovo scrape né dichiararne l'esito. Non è stato aggiunto `fb:app_id`: non serve per correggere i tag immagine e non è stato fornito un ID verificato.
