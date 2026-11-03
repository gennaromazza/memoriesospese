# SEO di shop di Natale e gift card: Google Search Console

Stato al 12 ottobre 2026. Le pagine `/online-shop` e `/regala` sono pronte per Google ma **tenute fuori finché non si accendono due interruttori**.

## Gli interruttori (Replit → Configurations, non Secrets)

| Variabile | Cosa apre | Quando accenderla |
|-----------|-----------|--------------------|
| `GIFT_SHOP_INDEXABLE=true` | `/regala` e `/regala/come-funziona` | Quando le gift card sono visibili e acquistabili davvero: aprila prima in anteprima e controlla che i tipi di gift card compaiano. |
| `SHOP_INDEXABLE=true` | `/online-shop` | Solo dopo il collaudo con pagamento e con gli ordini aperti. Una pagina indicizzata che non vende fa perdere tempo. |

Dopo aver cambiato una variabile serve **Republish**. Le pagine d'ordine, «I miei ordini» e le condizioni di vendita restano sempre `noindex`.

## Cosa fa il sito per Google (già fatto)
- Titolo e descrizione unici per ogni pagina, nei limiti che Google mostra (titolo fino a 60 caratteri, descrizione fino a 160), con «Aversa» e «gift card».
- Indirizzo canonico per pagina, un solo H1, lingua italiana.
- Contenuto leggibile anche senza JavaScript: testi, domande frequenti e, per lo shop, l'elenco dei prodotti con prezzo.
- Dati strutturati: briciole di pane, domande frequenti, `HowTo` per «come funziona» e, per lo shop, un `ItemList` più un `Product` con `Offer` (prezzo, valuta, disponibilità, data limite) per ogni prodotto con immagine. Prezzi e disponibilità vengono dal catalogo reale, quindi coincidono con la pagina.
- Mappa del sito: le pagine entrano in `sitemap.xml` solo quando l'interruttore è acceso; `robots.txt` indica già la mappa.
- Pagine per categoria: ogni categoria con prodotti in vendita ha la sua pagina `/online-shop/categoria/<valore>` (titolo, descrizione, breadcrumb e prodotti propri). Entrano nella mappa con l'interruttore `SHOP_INDEXABLE`; una categoria inesistente o vuota risponde 404 con `noindex`.
- Ogni scheda prodotto ha un indirizzo proprio (`/online-shop#prodotto-…`) e le immagini hanno il testo alternativo.

## Passi in Search Console
1. Su https://search.google.com/search-console aggiungi la proprietà **dominio** `imagestudiofotografico.com` e verificala con il record DNS TXT che ti indica Google (la verifica per dominio copre anche le versioni con `www`). Se la proprietà esiste già, salta questo passo.
2. In **Sitemap** invia `https://imagestudiofotografico.com/sitemap.xml`.
3. Accendi gli interruttori giusti (tabella sopra) e fai Republish.
4. In **Controllo URL** inserisci uno alla volta `https://imagestudiofotografico.com/online-shop`, `/regala` e `/regala/come-funziona`, poi **Richiedi indicizzazione**. Prima di richiederla controlla che la pagina risulti «disponibile per Google» e senza `noindex`.
5. Con il **Test dei risultati multimediali** (search.google.com/test/rich-results) incolla l'indirizzo dello shop e controlla che i Product risultino validi, senza errori.
6. Dopo qualche giorno guarda **Pagine** (indicizzazione) e **Prestazioni** (impressioni e clic). Per Natale conta partire presto: Google può impiegare giorni o settimane.

## Dopo Natale
Quando gli ordini si chiudono (ultimo giorno scaduto) la pagina resta online con «ordini chiusi» e i prodotti risultano non disponibili, senza errori. L'anno prossimo si ripubblica con la nuova categoria.

## Indirizzo dello shop
Lo shop sta su `/online-shop` (nome e indirizzo neutri, non legati al Natale). Il vecchio `/shop-natale` e tutti i suoi sotto-indirizzi (categorie, ordine, conferma, «I miei ordini») rispondono con un reindirizzamento permanente (301) al nuovo, con gli stessi parametri: i link già inviati per email continuano a funzionare.

## Verifica anteprima social (3 novembre 2026)

- La risposta pubblica di `https://imagestudiofotografico.com/online-shop` e del dominio Replit, anche con user-agent browser, Facebook, LinkedIn e X, restituisce i meta della home: titolo «Fotografo Matrimoni Aversa, Napoli e Caserta | Image Studio», descrizione della home e immagine `https://imagestudiofotografico.com/1200x630px.jpg`. Canonical punta anch'esso alla home.
- OpenGraph.xyz mostra la stessa scheda della home. Il titolo, la descrizione e l'immagine attesi per lo shop nel codice sono «Shop online con le tue foto, Aversa | Image Studio», la descrizione dello shop e `https://imagestudiofotografico.com/images/social/online-shop-natale.jpg`.
- Il Facebook Sharing Debugger richiede l'accesso a Facebook; il LinkedIn Post Inspector non è consultabile da questo ambiente (403). Non è stata richiesta l'invalidazione di cache: prima va corretta la risposta HTTP pubblica, altrimenti i crawler ricacheranno i meta della home.
- `SHOP_INDEXABLE` non è stato modificato durante il controllo. La sitemap pubblica corrente non contiene `/online-shop` né `/regala`.
