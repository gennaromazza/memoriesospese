# Rilascio SEO: priorità matrimoni

Questa guida controlla ciò che il sito può pubblicare e distingue le attività che
restano manuali nel Profilo dell'attività su Google. Nessun passaggio garantisce
una posizione organica, una risposta AI o l'aggiornamento immediato dei risultati.

## Prima del rilascio

1. Esegui `npm run build` e `npx vitest run server/seo-prerender.test.ts`.
2. Verifica le pagine pubbliche con un user agent crawler:

   ```bash
   curl -s -A "Googlebot/2.1 (+http://www.google.com/bot.html)" https://imagestudiofotografico.com/ \
     | grep -E "<title>|<h1>|application/ld\+json"

   curl -s -A "Googlebot/2.1 (+http://www.google.com/bot.html)" https://imagestudiofotografico.com/portfolio/matrimonio \
     | grep -E "<title>|<h1>|application/ld\+json"
   ```

   Le due risposte devono contenere titoli e H1 wedding-first, JSON-LD e link
   alla landing `/portfolio/matrimonio`.
3. Verifica che le route riservate non ricevano HTML prerenderizzato:

   ```bash
   curl -s -A "Googlebot/2.1 (+http://www.google.com/bot.html)" https://imagestudiofotografico.com/admin
   curl -s -A "Googlebot/2.1 (+http://www.google.com/bot.html)" https://imagestudiofotografico.com/gallery/ID_RISERVATO
   ```

   Queste URL non devono mostrare il markup `data-seo-prerender="true"`.
4. Apri `/sitemap.xml`: home, `/portfolio/matrimonio` e `/vision` devono essere
   le prime risorse editoriali. Gli altri servizi restano presenti, con priorità
   secondaria.

## Dopo il rilascio: attività manuali nel Profilo dell'attività su Google

Il sito non può modificare il Profilo dell'attività, Google Maps, recensioni o
risposte AI. Dal profilo, controlla manualmente:

- che la categoria principale e la descrizione parlino prima di fotografia e
  video di matrimonio;
- che i servizi matrimonio e video matrimonio siano elencati prima dei servizi
  per battesimi, comunioni, eventi e ritratti;
- che le foto in evidenza rappresentino lavori matrimoniali reali e già
  autorizzati;
- che il link al sito punti alla home o alla landing
  `/portfolio/matrimonio`, secondo il campo disponibile;
- che le nuove recensioni siano autentiche e spontanee: non sollecitare testi
  prestabiliti né promettere incentivi.

Dopo le modifiche, usa Search Console per richiedere l'indicizzazione delle
sole URL pubbliche aggiornate. I tempi e l'eventuale impatto sulle ricerche
dipendono dai motori di ricerca.