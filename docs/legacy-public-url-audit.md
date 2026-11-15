# Audit degli URL pubblici legacy

Questa tabella è l'inventario degli alias pubblici storici verificati nel router
client, nella SEO middleware e nella documentazione dello shop.

| URL legacy | Classificazione | Comportamento | Destinazione canonica |
| --- | --- | --- | --- |
| `/esperienza` (anche con slash finale) | Vecchia landing della campagna Image Experience | 301; conserva la query string | `/image-experience` |
| `/consultations` (anche con slash finale) | Duplicato inglese della landing consulenze | 301; conserva la query string | `/consulenze` |
| `/shop-natale` e relativi percorsi | Vecchio indirizzo dello shop | 301; conserva percorso e query string | `/online-shop` e percorso equivalente |
| `/?p=<numero>` | Permalink WordPress senza contenuto storico recuperabile | 301 permanente | `/` |
| `/consultations/book` | Flusso operativo legacy, non landing indicizzabile | Conservato e `noindex` per non interrompere i link cliente | Nessun redirect |

Un sotto-percorso inesistente del vecchio shop viene prima trasferito al
corrispondente indirizzo nuovo e poi risponde con 404; non deve ricevere la SPA
con status 200. Anche i percorsi inventati sotto `/esperienza` restano 404.

La sitemap contiene solo URL canonici: non aggiungere gli alias sopra. Le
destinazioni possono essere elencate solo quando sono pagine pubbliche
intenzionalmente indicizzabili.
