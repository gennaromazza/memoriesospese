# Checklist di collaudo e messa online: "Shopping online Natale 2026"

Stato: il codice è completo e provato con test automatici. Quello che segue è il lavoro **fuori dal codice** e il collaudo con PayPal vero (sandbox), che i test non possono sostituire.

Regola: si procede in ordine. Una voce non spuntata blocca la successiva.

## A. Prima di pubblicare il codice

| # | Cosa | Chi | Come si controlla |
|---|------|-----|-------------------|
| A1 | Pubblicare le **regole Firestore** (`firestore.rules`). Agiscono subito in produzione. | tu / Replit | Le stampe e le gift card continuano a funzionare; un cliente non riesce a scrivere `settings/shop` dal browser. |
| A2 | Registrare su PayPal un **webhook nuovo** per `https://imagestudiofotografico.com/api/shop/paypal/webhook` con gli eventi `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`. Fare lo stesso in sandbox e in produzione. | tu | PayPal mostra il webhook come attivo e ne dà l'ID. |
| A3 | Impostare `PAYPAL_SHOP_WEBHOOK_ID` (l'ID del punto A2) nelle variabili d'ambiente, distinto per sandbox e produzione. Senza, con PayPal "live" il pagamento dello shop resta spento (voluto). | tu / Replit | `GET /api/shop/paypal/config` risponde `enabled: true`. |
| A4 | Verificare le variabili già usate dalle stampe: credenziali PayPal, `FIREBASE_ADMIN_CREDENTIALS`, invio email (Gmail). Lo shop le riusa tutte. Facoltativa `SHOP_ADMIN_EMAILS` per altri amministratori (oltre a quello predefinito). | Replit | Le email dell'ordine stampe partono come prima. |
| A5 | Dopo l'unione con Replit: l'amministratore con passkey obbligatoria deve aver verificato la passkey, altrimenti le schede admin dello shop rispondono 403 (stesso comportamento delle stampe). | tu | Dal pannello admin la scheda "Shop online" si apre. |

Non servono: nuovi **indici Firestore** (tutte le ricerche dello shop usano un solo campo) e **regole di scadenza del bucket** (le foto dello shop si cancellano dal giro orario del server, non da una regola del bucket).

## B. Preparare i dati (pannello admin)

1. **Prodotti**: in **Impostazioni → Catalogo Prodotti**, creare i prodotti con categoria "Shopping online Natale 2026". Per ognuno: nome, descrizione, prezzo, sconto, immagini, **numero foto** (0 se non servono foto), **peso di un esemplare in grammi** (imballo compreso, serve alla spedizione) e prodotto attivo.
2. **Shop online → Shop di Natale → Impostazioni**: scegliere la categoria, impostare l'ultimo giorno ordini, i giorni di attesa foto (da 1 a 60, consigliati 7), la spedizione, poi salvare. Per la spedizione scegliere **Costo unico** oppure **In base al peso** (fasce "fino a X kg = costo"; oltre l'ultima fascia si può solo ritirare in studio), più il tempo indicativo in giorni. Il pannello avvisa se ci sono prodotti senza peso. Lasciare **vetrina spenta** e **ordini chiusi**.
3. Controllare in **Impostazioni → Impostazioni Studio** che nome, partita IVA, sede, telefono ed email siano compilati: compaiono nelle condizioni di vendita e nell'informativa.

## C. Collaudo in sandbox PayPal

Usare un account cliente di prova (email e password) e il conto buyer sandbox.

| # | Prova | Atteso |
|---|-------|--------|
| C1 | Accendere vetrina e ordini. Aprire `/online-shop` da loggato e da non loggato. | Prodotti attivi visibili, prezzi giusti, bottone "aggiungi" funziona. |
| C2 | Carrello con **un prodotto con foto + uno senza foto**, andare al pagamento. | Una zona foto per il prodotto che le richiede, nessuna per l'altro. Totale = somma + spedizione se scelta. |
| C3 | Aprire **Condizioni di vendita** e **Privacy** dal checkout. | Si aprono, mostrano i dati dello studio, la versione `2026-10-10.3` e i giorni di conservazione. |
| C4 | Ritiro in sede: pagare **senza caricare tutte le foto**. | Ordine pagato in stato "mancano le foto"; email di conferma al cliente e avviso allo studio; riga in Cassa con origine "Shop online". |
| C5 | Dall'area "I miei ordini" caricare la foto mancante. | Stato "foto ricevute"; email al cliente e allo studio. |
| C6 | Admin → Shop online → Shop di Natale → Ordini: aprire l'ordine, vedere anteprima, scaricare l'originale e lo zip delle foto. | Foto leggibili. |
| C7 | Portare l'ordine a "In lavorazione", "Pronto per il ritiro", "Consegnato". | Ogni passaggio manda l'email giusta. Non si saltano passaggi. |
| C8 | Secondo ordine con **spedizione**: servono indirizzo, residenza e codice fiscale. | Senza dati validi non si paga. Per segnare "spedito" serve il tracking, che finisce nell'email. |
| C8b | Con la spedizione **per peso**: un ordine leggero, uno medio, uno pesante, uno oltre l'ultima fascia e uno con un prodotto senza peso. | Il costo cambia con la fascia (il limite è compreso). Oltre l'ultima fascia, o senza peso, la spedizione non è selezionabile e resta il ritiro con un messaggio chiaro. Nella scheda ordine dello studio compare il peso. |
| C9 | Chiudere la pagina PayPal a metà e riprovare. Ripetere il pagamento due volte di fila. | Nessun doppio incasso, nessun doppio ricavo in Cassa. |
| C10 | Dal pannello PayPal sandbox rimborsare un ordine **non ancora spedito**. | L'ordine diventa annullato, la Cassa viene stornata, il cliente riceve l'email di rimborso. |
| C11 | Rimborsare un ordine **già spedito**. | L'ordine resta com'è e compare come "rimborsato dopo la spedizione" da guardare. |
| C12 | Admin: rifiutare una foto con motivo. | La foto sparisce, il termine riparte, il cliente riceve l'email col motivo. |
| C13 | Lasciare un ordine pagato senza foto, con attesa foto impostata a 1 giorno. | Passato il termine l'ordine compare tra quelli "da guardare" e **non** si annulla da solo. I promemoria a 2 e 5 giorni dal pagamento sono provati dai test automatici: in sandbox si vedono solo aspettando i giorni veri. |
| C14 | Finanza e Cassa: confrontare i totali di prima e dopo. | Ogni ordine shop conta una volta sola; "Vendita shop online" e la commissione PayPal sono registrate. |
| C15 | Ordini legacy, Products Manager, preventivi e campagne. | Gli ordini shop **non** compaiono tra i vecchi ordini. I prodotti Natale compaiono nel catalogo prodotti (voluto, vedi decisione 7 del piano). |
| C16 | **Regressione**: un ordine di stampe completo e un acquisto di gift card, in sandbox. | Identici a prima. |

## D. Pagamento reale di prova

1. Impostare un prodotto di prova a prezzo basso (per esempio 1 €), solo per l'amministratore.
2. Fare un acquisto vero con la tua carta, completare il percorso fino a "consegnato".
3. **Rimborsare da PayPal** e controllare che l'ordine passi a annullato e la Cassa si storni.
4. Disattivare o eliminare il prodotto di prova.

## E. Accensione

1. Vetrina accesa e ordini aperti, con l'ultimo giorno utile impostato.
2. Per far comparire la vetrina su Google: impostare `SHOP_INDEXABLE=true` e riavviare. Fino ad allora la pagina è raggiungibile ma non indicizzata. Le pagine d'ordine e le condizioni di vendita **non** si indicizzano mai.
3. Controllare `https://imagestudiofotografico.com/sitemap.xml`: deve elencare `/online-shop`.
4. Annunciare solo dopo aver visto un ordine reale arrivare in Cassa.

## F. Come tornare indietro

- Fermare le vendite: **Shop online → Shop di Natale → Impostazioni → ordini chiusi** (la vetrina resta visibile) oppure **vetrina spenta**. Effetto immediato, nessun deploy.
- Gli ordini già pagati restano e si lavorano normalmente.
- Il codice nuovo è separato dalle stampe e dalle gift card: un `git revert` dei commit dello shop le lascia intatte.

## G. Cose da decidere o da far controllare

1. **Testi legali**: le condizioni e la privacy sono bozze operative che descrivono quello che il sistema fa. Vanno **fatte rivedere** (consulente o commercialista), in particolare recesso, esclusione per i prodotti personalizzati e termine di consegna di 30 giorni. Se si modificano, cambiare anche la versione in `lib/shared-src/shop-legal.ts`.
2. **Documento fiscale**: il sistema non emette fatture né scontrini per le vendite online. Chiedere al commercialista come trattarle.
3. **Tempi di ritiro**: nel testo vale il termine di legge di 30 giorni dal pagamento. Se vuoi promettere una data (per esempio "pronto entro il 20 dicembre"), va scritta nelle condizioni.
4. **Prodotti Natale in preventivi e campagne**: oggi il catalogo è unico, quindi compaiono anche lì. Dimmi se vanno nascosti.
5. **Ultimo giorno ordini** e **giorni di attesa foto**: restano impostazioni, il valore lo scegli tu.
