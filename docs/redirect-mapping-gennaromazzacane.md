# Mapping redirect vecchio dominio: gennaromazzacane.it → imagestudiofotografico.com

> **Stato: BOZZA — nessun redirect è attivo.** Questo file serve a preparare la migrazione.
> Azioni consentite: `301` (redirect permanente), `404`, `410` (contenuto rimosso), `KEEP`, `REVIEW`.
> Regole: NIENTE redirect wildcard verso la homepage; URL spam/hackerate del vecchio dominio NON vanno reindirizzate.

## Come completare questo file
1. Recuperare l'elenco reale delle URL del vecchio dominio da:
   - Search Console della proprietà `gennaromazzacane.it` (Rendimento → Pagine)
   - analytics/log del vecchio hosting
   - `site:gennaromazzacane.it` su Google
2. Compilare la tabella qui sotto una riga per URL.
3. Solo dopo la verifica, implementare i 301 sul vecchio hosting (o via DNS/hosting provider).

## Tabella di mapping

| OLD_URL | NEW_URL | ACTION | Note |
|---|---|---|---|
| / | https://imagestudiofotografico.com/ | REVIEW | Homepage → homepage (da confermare) |
| /portfolio (se esisteva) | https://imagestudiofotografico.com/portfolio | REVIEW | |
| /blog/... (articoli, se esistevano) | https://imagestudiofotografico.com/blog/... | REVIEW | Mappare articolo per articolo, mai in blocco |
| /contatti (se esisteva) | https://imagestudiofotografico.com/consulenze | REVIEW | |
| URL spam/hackerate | — | 410 | MAI reindirizzare verso il nuovo sito |

## Note
- Un 301 passa gran parte del valore SEO: usarlo solo verso la pagina più pertinente, non verso la homepage generica.
- Le URL senza equivalente reale vanno lasciate in 404/410 sul vecchio dominio.
