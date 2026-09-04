# Tracking conversioni provenienti dal Blog

Il Blog registra eventi best-effort sia su Firebase Analytics sia su Umami/Replit Analytics, senza dati personali.

## Eventi

| Evento | Quando | Dati |
|---|---|---|
| `blog_article_view` | apertura di un articolo | slug, categoria |
| `blog_article_open` | apertura da archivio Blog | slug, tipo contenuto |
| `blog_cta_click` | click verso consulenze, prenotazione, preventivo, telefono, email o WhatsApp | slug, destinazione |
| `blog_internal_link_click` | click su un link interno nel corpo | slug, destinazione |
| `blog_related_article_click` | click su un articolo correlato | slug sorgente, slug destinazione |
| `blog_share` | click su Facebook, X o LinkedIn | slug, piattaforma |
| `blog_conversion` | invio riuscito di consulenza, prenotazione o preventivo dopo una visita Blog | conversione, primo e ultimo slug Blog |

L'attribuzione usa solo `sessionStorage` e conserva gli slug, mai nome, email, telefono o altri dati del cliente. Le conversioni senza una visita Blog nella sessione non vengono classificate come conversioni Blog.