# Piano di implementazione: vetrina e-commerce "Shopping online Natale 2026"

Stato: piano, nessun codice scritto. Ogni affermazione sul codice esistente è stata verificata leggendo i file; quello che non ho potuto verificare è elencato in fondo (sezione 11).

## 0. In breve

- Il cliente entra da `/regala` (o dal menu), vede i prodotti della categoria Natale, li mette nel carrello, accede con un account, carica la foto richiesta da ogni prodotto, sceglie ritiro o spedizione, paga con PayPal.
- Tu aggiungi prodotti e categorie dal Products Manager che già usi. Gli ordini arrivano in una scheda admin dedicata e, soprattutto, **entrano nel gestionale come ordini veri**: stesso elenco clienti, stessa cassa, stesse notifiche, stessa finanza, come già fanno le stampe.
- Non si modifica il negozio stampe, né nel comportamento né nei dati. Si costruisce un modulo gemello che ne riusa i pezzi puliti.
- Si parte dalle integrazioni con il gestionale (fase 2), prima di scrivere il negozio, così quando i primi ordini esistono tutto il resto del gestionale li sa già trattare.
- Tutto resta spento da un interruttore (`settings/shop.enabled`) finché non decidi di aprire.

## 1. Principi

1. **Additivo.** Nessun campo o collezione esistente cambia forma. Le stampe e le gift card restano com'erano.
2. **Un ordine è un ordine del gestionale.** Gli ordini del negozio stanno nella collezione `orders` con un tipo proprio, come fanno le stampe.
3. **Il prezzo lo decide sempre il server**, mai il browser.
4. **Ogni fase si può mettere online, o annullare, da sola.** Un commit per fase (o per sotto-fase), con i test delle stampe e delle gift card sempre verdi.
5. **Niente di pesante.** Non si aggiungono librerie, servizi o database nuovi.

## 2. Mappa di integrazione col gestionale (verificata)

| Area | Come funziona oggi (stampe) | Cosa deve fare il negozio |
|---|---|---|
| Ordini | `orders` con `orderType: 'print_shop'`, `stato`, `acconto`, `saldo`, `transactions`, `clienteId`, `nomeCliente`, `emailCliente`, `products` (formato compatibile) | `orderType: 'shop'`, stessi campi di compatibilità |
| Clienti (CRM) | Cerca il cliente per email nella collezione `clienti`, altrimenti lo crea (`source`, `tags`, `sourceRefs.orderIds`, `lifecycle`, `financials`). Incrementa `financials.totalRevenue` e `totalOrders` all'incasso | Stesso comportamento, con `source: 'shop'` e tag `shop-natale-2026` |
| Cassa | Ad ogni incasso scrive in `cashMovements` con id fisso (`print_paypal_<hash>`, quindi mai doppio) e `origine: 'print_shop'`. La commissione PayPal è una seconda riga di uscita. Rimborsi: movimento di storno | `origine: 'shop'`, id `shop_paypal_<hash>`, commissione separata, storno sul rimborso |
| Finanza | Il pannello finanza esclude gli ordini `print_shop` dall'elenco ordini e li legge solo dai movimenti di cassa, per non contare due volte. Ha una etichetta per origine ("Stampe") | Stessa esclusione e una nuova etichetta ("Shop Natale") |
| Vecchi pannelli ordini | Escludono `print_shop` (`lib/orders.ts`), il server rifiuta le modifiche (`print_shop_route_required`, 4 punti in `order-routes.ts`) | Stesse protezioni anche per `shop` |
| Regole Firestore | `isPrintShopOrder` impedisce di scrivere questi ordini dal browser: solo il server | Includere anche `shop` |
| Notifiche admin | Documento in `adminNotifications` (tipo `print_shop_order`), con id fisso per non duplicare, campanella nel pannello | Tipo `shop_order`, stessa campanella e stesso link diretto |
| Email | `sendGmailEmail` con registro in "Log email" | Stessa funzione, stesso registro |
| Account clienti | Firebase Auth, `authenticatePrintShop` e `requirePrintShopCustomer`. L'admin con passkey passa dallo stesso controllo | Riuso diretto, senza duplicare |
| PayPal | Un `PayPalOrdersClient` condiviso. Ogni modulo ha **il suo webhook e il suo ID webhook** (stampe: `PAYPAL_WEBHOOK_ID`, gift card: `PAYPAL_GIFT_CARD_WEBHOOK_ID`) | Webhook proprio `/api/shop/paypal/webhook` e `PAYPAL_SHOP_WEBHOOK_ID` |
| Pulizia foto | Processo pianificato (Cloud Scheduler con account di servizio) che cancella le foto scadute | Processo gemello `/api/shop/internal/retention` |
| Fatture elettroniche | `invoices` legate a un lavoro (`jobId`) e a un cliente. Le stampe non generano fatture | Nessuna fattura automatica. Da decidere con il commercialista (sezione 10) |
| SEO | `seo-prerender.ts` ha una voce per ogni pagina pubblica, `sitemap-generator.ts` le elenca (le pagine regalo solo con `GIFT_SHOP_INDEXABLE=true`) | Voci nuove con un interruttore proprio |
| Menu | `config/navigation.ts` più `useGiftShopAvailable` (il link appare solo se la pagina è attiva) | Stessa tecnica per il link allo shop |
| Prodotti | Collezione `products`, lettura pubblica. I prodotti con canale `print_shop` sono bloccati nel Products Manager | I prodotti dello shop sono prodotti normali, modificabili come sempre |

### Tre trappole trovate, con la soluzione già nel piano
1. **Il processo di pulizia delle stampe cerca le foto scadute su tutte le sottocartelle chiamate `assets`** (`collectionGroup('assets')`, senza controllare il tipo di ordine) e cancella il file collegato. Se il negozio usasse lo stesso nome, quel processo potrebbe cancellare le foto dei clienti dello shop. **Soluzione:** le foto dello shop stanno in una sottocartella chiamata `shopAssets`, e nel percorso di archiviazione `shop-orders/`.
2. **Esistono due copie dei file condivisi:** `lib/shared-src` (quella usata dal sito e dall'alias `@shared`) e `artifacts/api-server/shared` (usata da alcuni import relativi del server). Hanno già iniziato a differire (`cash-types`, `print-shop-types`, `print-shop-catalog`). **Soluzione:** i file nuovi vanno solo in `lib/shared-src`; quando si tocca un file presente in entrambe, si aggiornano tutte e due e un test confronta le parti che servono.
3. **Il pannello finanza conta gli ordini e i movimenti di cassa.** Se un ordine shop comparisse tra gli ordini normali oltre che in cassa, gli incassi sarebbero doppi. **Soluzione:** è una modifica della fase 2, con un test che lo verifica.

## 3. Decisioni di architettura

**D1. Collezione ordini:** `orders`, `orderType: 'shop'`. (Correzione al mio piano di prima: non una collezione `shopOrders`.)

**D2. Dove vive il codice**
- Server: `artifacts/api-server/src/shop/` con `router.ts`, `service.ts` (ordini e pagamento), `uploads.ts` (foto), `mail.ts`, `retention.ts`, `maintenance-auth.ts`. Montato in `app.ts` come `/api/shop`.
- Parti comuni estratte dalle stampe: `artifacts/api-server/src/commerce/`.
- Contratti condivisi: `lib/shared-src/shop-types.ts`, testi SEO e FAQ in `lib/shared-src/shop-landing-content.ts` (come già `gift-card-landing-content.ts`), testi legali in `shop-legal.ts`.
- Sito: `src/features/shop/` e `src/pages/public/Shop*.tsx`; admin: `src/components/shop/`.

**D3. Cosa si estrae dalle stampe** (solo funzioni pure, oggi private in `print-shop/service.ts`): normalizzazione indirizzo, spedizione e fatturazione, numero ordine, pulizia testi, conversione centesimi/euro, controllo idempotenza, divisione nome e cognome. Spostate senza cambiarne il comportamento, con test.
Non si estrae il caricamento foto delle stampe: è intrecciato con quote, polaroid, controlli di risoluzione e conservazione (oltre 500 righe tra preparazione, verifica e rimozione, più quote e pulizia), e toccarlo rischia le vendite in corso.

**D4. Caricamento foto: modulo snello e separato.** Stesso schema di sicurezza (indirizzo di caricamento firmato dal server, controllo JPEG con `validateJpegUpload`, dimensioni con `sharp`), ma più semplice: niente perceptual hash, niente polaroid, limiti per riga d'ordine. Circa 300 righe invece di generalizzare quelle delle stampe.

**D5. Pagamento: ciclo delle gift card, scrittura dell'ordine come le stampe.** Il ciclo create, capture e webhook segue il modulo gift card (compatto). La registrazione dell'incasso segue `recordCompletedPayment` delle stampe: una sola transazione che aggiorna ordine, cassa, cliente e notifica, con un documento `shopPaymentCaptures` che impedisce i doppioni.

**D6. Catalogo servito dal server.** `GET /api/shop/catalog` filtra i prodotti (`attivo`, categoria abilitata, prezzo valido) e restituisce solo i campi necessari. Il sito non legge più `products` direttamente. Lo stesso filtro serve al server quando crea l'ordine.

**D7. Impostazioni in `settings/shop`:** `enabled`, categorie abilitate, ultimo giorno ordini, spedizione (prezzo e giorni), giorni di attesa foto, email che riceve gli ordini.

**D8. Foto richieste da ogni prodotto:** si usa il campo `numeroFoto` che c'è già nel prodotto (0 = nessuna foto). Nessuna modifica allo schema dei prodotti.

**D9. Stati.** Tre livelli coerenti:
- `fulfillment.status`: `draft`, `awaiting_payment`, `awaiting_photos`, `photos_received`, `in_production`, `ready_for_pickup`, `shipped`, `delivered`, `cancelled`, `refunded`.
- `payment.status`: come le stampe (`pending`, `paid`, `paid_action_required`, `refunded`, `partially_refunded`).
- `stato` (gestionale): `bozza`, `in_lavorazione`, `completato`, `annullato`, più `attenzione_pagamento` come già usa il negozio stampe.

## 4. Modello dati

**Ordine** (`orders/{id}`)
- Identità: `orderType`, `source`, `orderNumber`, `ownerUid`, `clienteId`, `customer`, `nomeCliente`, `emailCliente`, `telefonoCliente`.
- Righe: `lines[]` con `lineId`, `productId`, `productName`, `categoria`, `unitPriceCents`, `quantity`, `photosRequired`, `lineTotalCents`. In più `products` e `prodotti` nel formato compatibile col gestionale.
- Importi: `totals` (`subtotalCents`, `shippingCents`, `totalCents`), `totale`, `acconto`, `saldo`, `transactions[]`.
- Consegna: `fulfillment` con `method` (`studio_pickup` o `shipping`), `status`, `shippingAddress`, `tracking` (`carrier`, `code`), date di pronto, spedito e consegnato.
- Fatturazione: `billingDetails` (codice fiscale e indirizzo di residenza, con controllo del codice) quando c'è spedizione, come le stampe.
- Pagamento: `payment` (`paypalOrderId`, `paypalCaptureId`, `amountCents`, `paypalFeeCents`, `refundedCents`, `paidAt`).
- Consensi: `consents` (hash dei termini accettati, privacy, data).
- Scadenze: `shop.photoDeadlineAt`, `shop.remindersSent`, `retention`.

**Foto** (`orders/{id}/shopAssets/{assetId}`): `lineId`, `status` (`prepared`, `ready`, `purged`), `storagePath` (`shop-orders/{uid}/{orderId}/{lineId}/{assetId}.jpg`), dimensioni, `expiresAt`.

**Cassa** (`cashMovements`): entrata `Vendita shop online` con `origine: 'shop'`, `orderId`; uscita `Commissioni di pagamento`; storno su rimborso.

**Altri:** `shopPaymentCaptures`, `adminNotifications` (`shop-order-<id>`), `settings/shop`.

## 5. Interfacce

Pubbliche: `GET /api/shop/catalog`, `GET /api/shop/paypal/config`, `POST /api/shop/paypal/webhook`.
Cliente (con account): creare e leggere ordini, aggiornare carrello e consegna, preparare e concludere il caricamento foto, rimuovere foto, creare e confermare il pagamento PayPal, "I miei ordini".
Admin: elenco e dettaglio ordini, anteprima e scarico foto, cambio stato (con tracking obbligatorio per "spedito"), annullamento con motivo, reinvio email, impostazioni shop.
Interna: `POST /api/shop/internal/retention` (solo dal processo pianificato).

## 6. Pagine

- Cliente: `/shop-natale` (vetrina), carrello e checkout, conferma, "I miei ordini" con caricamento delle foto mancanti. (L'indirizzo `/shop-natale` è provvisorio: vedi decisioni.)
- Admin: nuova voce "Shop online" nel menu (`adminNavigation.ts`) e scheda in `AdminDashboard.tsx` con link diretto dalla notifica.
- `/regala`: blocco che porta alla vetrina; nella vetrina un blocco che porta ai regali da fare in studio.

## 7. SEO

- Voce nuova in `seo-prerender.ts` con titolo, descrizione, breadcrumb e dati strutturati (elenco prodotti con prezzo e disponibilità), sul modello di `/regala`.
- Voce in `sitemap-generator.ts` sotto un interruttore proprio (`SHOP_INDEXABLE`).
- Carrello, checkout, conferma e "I miei ordini" restano `noindex`.
- Link reciproci con `/regala` e voce in `config/navigation.ts` (con il test esistente aggiornato).

## 8. Fasi

Dimensioni: S (piccola), M (media), L (grande). Le righe sono stime.

### Fase 0, rete di sicurezza (S)
- Installare le dipendenze nel worktree, d'accordo con le correzioni di Replit su Express e `concurrently`.
- Far girare e salvare la **baseline** dei test: stampe, gift card, finanza, seo-prerender, navigazione.
- Accettazione: baseline verde e annotata.

### Fase 1, estrazione dalle stampe (M, rischio medio)
- Crea `src/commerce/` con le funzioni pure di D3 e i test. `print-shop/service.ts` le importa al posto di quelle private.
- Nessun cambiamento di comportamento. Circa 300 righe spostate.
- Accettazione: tutti i test delle stampe uguali a prima; la differenza di `service.ts` contiene solo import e funzioni rimosse.
- Ritorno indietro: un solo `git revert`.

### Fase 2, integrazione col gestionale, senza shop (M)
Tutte modifiche additive, in file già esistenti, prima che esista qualsiasi ordine shop:
- `cash-types.ts` (entrambe le copie): origine `shop`, etichetta, categoria `Vendita shop online`.
- `finance-types.ts`, `finance-format.ts`, `finance-model.ts`: nuova fonte, etichetta, esclusione dall'elenco ordini, mappatura dei movimenti.
- `firestore.rules`: `isPrintShopOrder` protegge anche `shop`.
- `lib/orders.ts` (2 filtri) e `order-routes.ts` (4 controlli): esclusione e rifiuto.
- Notifiche: tipo `shop_order` in `job-routes.ts`, `useNotifications.ts`, `NotificationBell.tsx`.
- Test: la finanza non conta due volte; i vecchi pannelli non vedono ordini shop.
- Accettazione: nessun cambiamento visibile oggi nel gestionale. Le regole Firestore vanno pubblicate con attenzione (agiscono subito in produzione) e si possono ripubblicare nella versione di prima.

### Fase 3, catalogo e vetrina (M)
- `settings/shop` con interruttore, categorie, ultimo giorno ordini e spedizione. Prima versione dell'impostazione nella scheda admin.
- `GET /api/shop/catalog` e la pagina vetrina, link in menu e `/regala` con `useShopAvailable`, SEO e sitemap.
- Si può aprire da sola come vetrina con avviso "ordini dal …", per far partire l'indicizzazione.
- Accettazione: prodotti della categoria visibili, quelli non attivi no; SEO prerender verificato.

### Fase 4, ordine, foto, pagamento (L, il nucleo)
- **4a Ordine:** creazione bozza con prezzi dal server, carrello, account, indirizzo, fatturazione, ritiro o spedizione.
- **4b Foto:** `shopAssets` e modulo di caricamento snello, con le regole di D4.
- **4c Pagamento:** create, capture, webhook proprio, registrazione transazionale (ordine, cassa, commissione, cliente, notifica), pagamento fallito e rimborso con storno.
- **4d Email e pulizia:** conferma, promemoria foto, spedito con tracking, pronto per il ritiro; processo di pulizia gemello.
- **4e Sito:** carrello, checkout, conferma, "I miei ordini" con caricamento delle foto mancanti.
- Test: prezzo ricalcolato, capture e webhook duplicati, cassa con id fisso, rimborso, quote di caricamento, transizioni di stato.
- Accettazione: un ordine completo in sandbox PayPal, dall'inizio alla cassa.

### Fase 5, admin Shop (M)
- Elenco con filtri per stato, dettaglio ordine, anteprima e scarico delle foto, cambio stato con regole (tracking obbligatorio per "spedito"), note, annullamento con motivo, reinvio email.
- Impostazioni shop complete.
- Accettazione: lavori un ordine da "pagato" a "consegnato" senza uscire dal pannello.

### Fase 6, legale, collaudo, lancio (S o M)
- Condizioni di vendita (con recesso), informativa privacy aggiornata, accettazione registrata con hash.
- Collaudo completo (checklist della sezione 9), pagamento reale di prova poi rimborsato.
- Interruttore acceso, indicizzazione attivata.
- Ritorno indietro: `settings/shop.enabled = false`.

## 9. Rete di sicurezza

Da far girare a ogni fase e a ogni merge:
- Ordine stampe completo, in sandbox: bozza, foto, pagamento, cassa.
- Acquisto gift card in sandbox.
- Finanza: totali di ieri uguali a oggi.
- Cassa, ordini legacy, Products Manager, preventivi e campagne (mostrano i prodotti in categoria Natale: è voluto, vedi decisioni).
- `seo-prerender`, sitemap, navigazione.

Controllo specifico del nuovo modulo:
- Un ordine shop non compare tra i vecchi ordini né è modificabile dal browser.
- Il processo di pulizia delle stampe non tocca nessuna foto dello shop.
- Un ordine con più prodotti ha una foto per riga.

## 10. Lavoro fuori dal codice (da fare tu o con Replit)

1. Registrare su PayPal un **webhook nuovo** per `/api/shop/paypal/webhook` e impostare `PAYPAL_SHOP_WEBHOOK_ID`, in sandbox e in produzione.
2. ~~Creare il processo pianificato per la pulizia.~~ **Non serve**: la pulizia gira nel giro orario del server (vedi sezione 13). Resta disponibile, facoltativa, la rotta `/api/shop/internal/maintenance` con token OIDC.
3. Pubblicare le **regole** Firestore (fase 2). **Indici nuovi non servono**: tutte le ricerche dello shop usano un solo campo (e `firestore.indexes.json` non esiste nel repository).
4. ~~Regole di scadenza del bucket per `shop-orders/`.~~ **Non servono**: lo shop non imposta `customTime`, le foto le cancella la pulizia oraria del server.
5. Confrontarti con il **commercialista** sul documento fiscale delle vendite online: oggi le fatture elettroniche sono legate a un lavoro e le stampe non ne generano. Il piano non emette fatture; la raccolta del codice fiscale per le spedizioni è già prevista come per le stampe.
6. Far rivedere le **condizioni di vendita** e l'informativa privacy: testi scritti il 10 ottobre 2026 (versione `2026-10-10.2`), da far controllare in particolare per recesso, prodotti personalizzati e termine di consegna.

## 11. Cosa non ho potuto verificare

- Dove e come vengono pubblicati regole, indici e processo pianificato (nel repo c'è `firebase.json`, ma non vedo l'ambiente).
- La configurazione di scadenza del bucket per le foto.
- Se il tuo account PayPal in produzione accetta ordini con indirizzo di spedizione come lo configurerebbe il negozio.
- Quante email al giorno puoi inviare con il servizio che usi oggi.
- Il trattamento fiscale (competenza del commercialista).

## 12. Decisioni aperte

1. **Foto:** carico al checkout, oppure dopo con promemoria? Proposta: entrambe.
2. **Giorni di attesa foto** prima di annullare e rimborsare.
3. **Ultimo giorno ordini** per Natale.
4. **Carrello** con più prodotti, come assunto.
5. **Indirizzo della vetrina:** `/shop-natale` o un indirizzo più ricco di parole chiave (per esempio `/regali-natale-personalizzati`).
6. **Spedizione:** impostazioni proprie dello shop (consigliato) o quelle delle stampe.
7. **Prodotti Natale nei preventivi e nelle campagne:** vanno bene, oppure vanno nascosti? Oggi il catalogo è unico e li mostrerebbe.
8. **Ordini in admin:** scheda separata (consigliato).
9. **Codice fiscale e residenza** richiesti per ogni spedizione come nelle stampe, oppure solo su richiesta.
10. **Tracking obbligatorio** per passare a "spedito".

## 13. Stato di attuazione (10 ottobre 2026)

Fasi 0-6 completate nel codice, con test automatici. Restano il collaudo con PayPal sandbox e la messa online: vedi `docs/checklist-collaudo-shop-natale-2026.md`.

### Come sono state chiuse le decisioni aperte

| # | Decisione | Scelta fatta nel codice |
|---|-----------|--------------------------|
| 1 | Foto al checkout o dopo | Entrambe: si può pagare subito e caricare dopo da "I miei ordini". |
| 2 | Giorni di attesa foto | Impostazione dello shop, da 1 a 60, predefinita 7. Promemoria a 2 e 5 giorni dal pagamento. |
| 3 | Ultimo giorno ordini | Impostazione `lastOrderDate`, vuota finché non la scegli. |
| 4 | Carrello | Più prodotti per ordine, una zona foto per ogni riga. |
| 5 | Indirizzo vetrina | `/shop-natale` (le condizioni sono su `/shop-natale/condizioni`). |
| 6 | Spedizione | Impostazioni proprie dello shop; solo Italia. |
| 7 | Prodotti Natale in preventivi e campagne | **Ancora aperta**: il catalogo è unico e li mostra. |
| 8 | Ordini in admin | Scheda separata "Shop online". |
| 9 | Codice fiscale e residenza | Richiesti per ogni spedizione, come nelle stampe. |
| 10 | Tracking | Obbligatorio per passare a "spedito". |

### Scostamenti dal piano

- **Pulizia periodica**: nel giro orario del server (`runShopMaintenance`), non in un processo pianificato separato. Evita un'infrastruttura in più; la rotta con token OIDC è tenuta come alternativa.
- **Foto non arrivate entro il termine**: l'ordine viene segnalato "da guardare" ma **non si annulla né si rimborsa da solo**. Decide lo studio; l'annullamento ricorda di rimborsare da PayPal. Scelta prudente per non rimborsare per errore ordini già incassati.
- **Rimborsi**: si fanno dal pannello PayPal; il webhook li registra (storno in Cassa, annullamento dell'ordine se non spedito, segnalazione se già spedito).
- **Nessun indice e nessuna regola sul bucket** (vedi sezione 10).
- **Foto in `shopAssets`** e non `assets`, per non cadere nella pulizia delle stampe (collisione sul gruppo di collezioni `assets`); un test lo verifica nei due sensi.
- **`settings/shop` è leggibile da tutti** (come le altre impostazioni pubbliche): contiene solo dati adatti al pubblico e si scrive solo dal server.
- **Testi legali**: conservazione (7 e 90 giorni) e recesso (14 giorni) stanno in `lib/shared-src/shop-legal.ts` e il server li legge da lì, così testo e comportamento non possono divergere.
- **Accesso admin con passkey** (arrivato da Replit): le rotte admin dello shop passano dallo stesso controllo delle stampe, quindi sono già coperte.

