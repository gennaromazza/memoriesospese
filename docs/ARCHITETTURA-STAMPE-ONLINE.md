# Architettura shop stampe online

Stato: architettura approvata per l'implementazione il 31 agosto 2026.

## Obiettivo

Trasformare `/stampa-foto-aversa` da landing page con chiusura su WhatsApp in un flusso e-commerce completo, mantenendo il valore SEO della pagina e integrando il nuovo canale nel gestionale esistente.

Il cliente deve poter:

1. consultare formati e prezzi senza autenticarsi;
2. accedere o registrarsi con Google tramite Firebase Authentication;
3. caricare fotografie originali in Firebase Storage;
4. scegliere formato, finitura, quantità/copie e resa bordo/riempimento;
5. vedere un totale calcolato dal server;
6. pagare anticipatamente l'intero ordine con PayPal;
7. consultare stato, riepilogo e storico dei propri ordini.

Lo studio deve ricevere nel gestionale un ordine già collegato al cliente, con pagamento riconciliato, file scaricabili, distinta di produzione e avanzamento fino alla consegna.

## Stato attuale verificato

- La pagina pubblica contiene 34 formati divisi in quattro gruppi e listini a scaglioni, ma le call to action portano a WhatsApp.
- `products` e `productCategories` gestiscono già catalogo, immagini, attivazione, ordine di visualizzazione, sconto e bundle.
- Il prodotto corrente ha un solo prezzo; non rappresenta listini a scaglioni, misure, finiture o pacchetti.
- `orders` gestisce già prodotti con snapshot, totale, acconti/saldi, transazioni e collegamento a `clienti`, gallerie e lavori.
- Gli ordini sono attualmente amministrativi: le regole Firestore non consentono al cliente di crearli o leggerli.
- Firebase Auth supporta email/password, ma Google Sign-In non è implementato.
- Le regole Storage esistenti non offrono un'area privata adatta agli originali di stampa. Le gallerie sono pubblicamente leggibili e quindi non devono ospitare questi file.
- Nel progetto FileX PayPal è implementato per abbonamenti. Per lo shop serve PayPal Checkout/Orders v2, riutilizzando però gli stessi principi di sicurezza, webhook firmati, segreti server-side e idempotenza.
- Il backend applicativo attuale è Express/Node su Replit, con Firebase Admin. Il nuovo dominio API va quindi inserito nello stesso backend, evitando un secondo backend commerciale da distribuire e monitorare.

## Decisione architetturale

### Un solo catalogo e un solo ordine gestionale

Le 34 voci vanno create in `products`, non duplicate in un listino hard-coded della pagina. La pagina pubblica leggerà una proiezione pubblica del catalogo da `/api/print-shop/catalog`.

Gli ordini rimangono nella collection `orders`, con discriminatore `orderType: "print_shop"`. In questo modo statistiche, clienti, cassa e pannello ordini continuano a usare una fonte comune. I campi specifici dello shop restano in `printShop`, senza alterare la semantica degli ordini fotografici esistenti.

Gli asset di stampa sono separati dalle gallerie e vengono descritti nella sottocollezione `orders/{orderId}/assets/{assetId}`. I file fisici sono privati in Storage.

### Backend autorevole

Il browser non crea ordini finali e non determina mai prezzi o stato di pagamento. Tutte le operazioni commerciali passano da `/api/print-shop` con token Firebase verificato dal backend.

Il server:

- legge prodotti e scaglioni attivi;
- ricalcola ogni totale in centesimi;
- verifica proprietà e stato dell'ordine;
- crea/cattura ordini PayPal;
- registra in modo atomico pagamento, transazione gestionale e movimento di cassa;
- collega o crea il record `clienti` per email normalizzata e UID;
- espone al cliente soltanto i propri ordini.

## Esperienza cliente proposta

La landing resta indicizzabile e conserva hero, contenuti locali, FAQ e listino. Le call to action diventano `Inizia il tuo ordine` e aprono il configuratore sulla stessa pagina o su `/stampa-foto-aversa/ordine`.

Il configuratore è un wizard mobile-first:

1. **Scegli le foto** — accesso Google solo quando il cliente avvia il caricamento.
2. **Carica** — upload multiplo riprendibile, coda, progresso, retry e controllo duplicati.
3. **Configura** — un gruppo di fotografie condivide formato e finitura; ogni foto può avere un numero di copie diverso, tranne Polaroid che richiede 50 fotografie tutte diverse.
4. **Scegli la resa** — due opzioni spiegate in linguaggio semplice: `Foto intera con bordo bianco` (nessuna parte viene tagliata) oppure `Riempi tutto il foglio` (l'immagine può essere tagliata leggermente ai bordi). Non viene esposto un editor di ritaglio complesso.
5. **Riepilogo** — quantità, scaglione applicato, totale, dati cliente e modalità di ritiro/pagamento.
6. **Conferma** — pagamento anticipato completo con PayPal; pagina finale con numero ordine e ritiro in sede.

La scelta “un gruppo = un formato/finitura” rende semplice ordinare centinaia di immagini e consente di aggiungere più gruppi allo stesso carrello.

## Catalogo prodotti

### Estensione compatibile di `Product`

I campi correnti restano per retrocompatibilità. Per i prodotti shop si aggiungono:

```ts
type SalesChannel = 'admin' | 'booking' | 'print_shop';

interface PriceTier {
  minQuantity: number;
  maxQuantity?: number;
  unitPriceCents: number;
}

interface PrintProductSpec {
  widthMm: number;
  heightMm: number;
  finishes: Array<'glossy' | 'matte'>;
  pricingModel: 'tiered' | 'package';
  tiers?: PriceTier[];
  packageSize?: number;
  packagePriceCents?: number;
  qualityWarningDpi: number;
  qualityTargetDpi: number;
  allowMultiplePackages?: boolean;
}

interface ProductShopFields {
  sku: string;
  salesChannels: SalesChannel[];
  currency: 'EUR';
  printSpec: PrintProductSpec;
  catalogVersion: number;
}
```

I calcoli online usano sempre interi in centesimi. `prezzo` può continuare a esporre il prezzo base gestionale, ma non sarà la fonte del totale e-commerce.

### Categorie e seed

Creare categorie idempotenti:

- `stampe-classiche` — 10 formati;
- `stampe-medie` — 10 formati;
- `stampe-grandi` — 13 formati;
- `stampe-polaroid` — 1 formato.

Uno script di seed idempotente deve leggere l'attuale `PRINT_PRICE_TABLES`, creare/aggiornare i 34 SKU e produrre un report di differenze senza cancellare prodotti. Dopo la migrazione il catalogo Firestore diventa fonte di verità e `PRINT_PRICE_TABLES` rimane solo come fixture di migrazione/test, poi può essere rimosso.

Gli SKU possono seguire una regola stabile, per esempio `PRINT-100X150`, mentre il nome resta leggibile (`Stampa 10×15 cm`). Polaroid usa un prodotto a pacchetto da 50.

## Modello ordine

### Ritiro e spedizione configurabile

La spedizione è governata dal documento `settings/printShop.shipping` e parte disattivata. Il pannello amministrativo permette di impostare:

- abilitazione pubblica;
- costo in centesimi, aggiunto dal server al preventivo e quindi al totale PayPal;
- giorni minimi e massimi stimati per la consegna.

Il cliente sceglie `studio_pickup` oppure `shipping` prima del preventivo. Per `shipping` il checkout richiede indirizzo completo di consegna, codice fiscale e indirizzo di residenza; la residenza può coincidere con la consegna. Gli stessi controlli vengono ripetuti dal backend prima della creazione dell'ordine PayPal. Il metodo di consegna e il costo entrano nell'impronta del preventivo, impedendo modifiche silenziose dopo l'accettazione del riepilogo.

I dati fiscali restano nello snapshot dell'ordine e completano, senza sovrascrivere dati già curati manualmente, l'anagrafica `clienti`. Il laboratorio riceve solo file e istruzioni tecniche; indirizzo e codice fiscale non vengono inseriti nella distinta di produzione. Il costo di spedizione incassato è compreso nel movimento finanziario dell'ordine shop.

```ts
interface PrintShopOrderFields {
  orderType: 'print_shop';
  orderNumber: string; // ST-2026-xxxxxx, generato server-side
  ownerUid: string;
  clienteId: string;
  catalogVersion: number;
  currency: 'EUR';
  totals: {
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
  };
  fulfillment: {
    method: 'studio_pickup';
    status:
      | 'draft'
      | 'awaiting_payment'
      | 'submitted'
      | 'files_check'
      | 'ready_to_print'
      | 'sent_to_laboratory'
      | 'printing'
      | 'ready_for_pickup'
      | 'delivered'
      | 'cancelled';
    promisedAt?: Timestamp;
    readyAt?: Timestamp;
    deliveredAt?: Timestamp;
  };
  payment: {
    method: 'paypal';
    status: 'pending' | 'paid' | 'failed' | 'partially_refunded' | 'refunded';
    paypalOrderId?: string;
    paypalCaptureId?: string;
    paidAt?: Timestamp;
  };
  printShop: {
    items: PrintOrderItem[];
    assetCount: number;
    copyCount: number;
    lowResolutionAccepted: boolean;
    customerNotes?: string;
  };
}
```

Ogni `PrintOrderItem` salva snapshot di SKU, nome, misura, finitura, scaglione, prezzo unitario e totale. Le assegnazioni collegano `assetId` e copie, mentre la riga conserva la resa `border|cover`. Le modifiche future al catalogo non cambiano ordini già inviati.

Per compatibilità:

- `draft` e `awaiting_payment` corrispondono a `stato: "bozza"`;
- gli stati produttivi corrispondono a `stato: "in_lavorazione"`;
- `delivered` corrisponde a `stato: "completato"`;
- `cancelled` corrisponde a `stato: "annullato"`.

## File e Firebase Storage

Percorso privato:

```text
print-orders/{uid}/{orderId}/{assetId}/original.{ext}
```

Le regole devono consentire al proprietario autenticato di scrivere e leggere soltanto sotto il proprio UID. Non si usano URL pubblici persistenti. L'admin scarica tramite backend/Firebase Admin o URL firmati brevi.

Vincoli iniziali consigliati:

- soltanto JPEG/JPG con MIME e firma binaria coerenti;
- massimo 50 MB per file;
- upload resumable con 3 trasferimenti concorrenti;
- validazione server-side di esistenza, MIME, dimensioni e appartenenza all'ordine;
- warning sotto 150 DPI, qualità consigliata 300 DPI;
- bozza scaduta e file orfani eliminati automaticamente;
- originali cancellati automaticamente 90 giorni dopo la consegna;
- nessun file di stampa in `galleries/`, che è pubblicamente leggibile.

Per ordini grandi il backend genera una distinta JSON/CSV e un download ZIP in streaming, senza caricare tutto in memoria.

## Autenticazione Google e clienti

Abilitare Google come provider nel progetto Firebase e aggiungere i domini di produzione autorizzati. `FirebaseAuthContext` espone `loginWithGoogle()` e gestisce popup con fallback a redirect sui browser mobili problematici.

Al primo accesso:

- creare o completare `users/{uid}` con ruolo `user`;
- non sovrascrivere un profilo esistente;
- gestire il caso in cui la stessa email esista già con password, collegando le credenziali invece di creare identità duplicate;
- in checkout raccogliere telefono e consenso alle condizioni, non dati non necessari.

Al primo ordine il backend cerca `clienti` per email normalizzata. Se esiste, aggiunge l'UID a `sourceRefs.userIds`; altrimenti crea un cliente con source `print_shop`. L'ordine salva `clienteId` e snapshot dei dati di contatto.

Le regole `users` vanno ristrette: un utente deve leggere solo il proprio profilo, mentre l'admin può leggere tutti. Il comportamento attuale consente a ogni utente autenticato di leggere l'intera collection utenti e non è adatto a uno shop pubblico.

## PayPal

Per decisione del titolare si riutilizzano ambiente, Client ID e Client Secret della REST app PayPal già usata da FileX. Il webhook deve però essere registrato anche sull'endpoint dello shop e avere il proprio `PAYPAL_WEBHOOK_ID`: l'ID del webhook FileX è legato al relativo URL e non può verificare automaticamente questo nuovo endpoint.

Configurazione server:

```text
PAYPAL_ENVIRONMENT=sandbox|live
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...
```

Flusso:

1. `POST /api/print-shop/orders/:id/paypal/create` verifica proprietario, asset e catalogo, congela il totale e crea un PayPal Order con `intent: CAPTURE`, valuta EUR, `custom_id` interno e `invoice_id` uguale al numero ordine.
2. Il client mostra il pulsante PayPal e restituisce solo il PayPal Order ID.
3. `POST /api/print-shop/orders/:id/paypal/capture` cattura server-side e accetta l'ordine soltanto se capture, importo, valuta e merchant coincidono.
4. Una transazione Firestore registra capture, pagamento gestionale e movimento cassa una sola volta.
5. `POST /api/print-shop/paypal/webhook` verifica la firma con PayPal, salva l'event ID idempotente e riconcilia eventi `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DECLINED` (oltre al legacy `DENIED`), `PAYMENT.CAPTURE.REFUNDED` e `PAYMENT.CAPTURE.REVERSED`.

Per la produzione il webhook live dell'app PayPal deve puntare a
`https://imagestudiofotografico.com/api/print-shop/paypal/webhook`. Client ID,
Client Secret e Webhook ID devono appartenere tutti alla stessa app REST in
modalità live; non è valido mescolare credenziali sandbox e live.

La risposta immediata della capture chiude il checkout; il webhook è la seconda fonte di riconciliazione per eventi successivi o callback perse. `PayPal-Request-Id` rende idempotenti create e capture.

Il prezzo non viene mai letto dal payload del browser. Il client invia soltanto SKU, configurazione e quantità; il backend applica lo scaglione corrente.

## API proposta

| Metodo | Route | Accesso | Scopo |
| --- | --- | --- | --- |
| GET | `/api/print-shop/catalog` | pubblico | catalogo shop attivo, senza campi interni |
| POST | `/api/print-shop/orders` | Firebase user | crea/riprende bozza e collega cliente |
| GET | `/api/print-shop/orders` | proprietario | elenco ordini del cliente |
| GET | `/api/print-shop/orders/:id` | proprietario/admin | dettaglio autorizzato |
| PATCH | `/api/print-shop/orders/:id` | proprietario, solo bozza | configura righe e contatti |
| POST | `/api/print-shop/orders/:id/uploads/prepare` | proprietario | prepara asset e percorso Storage |
| POST | `/api/print-shop/orders/:id/uploads/finalize` | proprietario | valida oggetto caricato e metadati |
| DELETE | `/api/print-shop/orders/:id/assets/:assetId` | proprietario, solo bozza | rimuove asset e file |
| POST | `/api/print-shop/orders/:id/quote` | proprietario | ricalcolo autorevole del totale |
| POST | `/api/print-shop/orders/:id/paypal/create` | proprietario | crea PayPal Order |
| POST | `/api/print-shop/orders/:id/paypal/capture` | proprietario | cattura e registra pagamento |
| POST | `/api/print-shop/paypal/webhook` | firma PayPal | riconcilia eventi |
| PATCH | `/api/print-shop/admin/orders/:id/status` | admin | avanzamento produzione |
| GET | `/api/print-shop/admin/orders/:id/manifest` | admin | distinta CSV/JSON |
| GET | `/api/print-shop/admin/orders/:id/archive` | admin | ZIP originali in streaming |

Tutti gli endpoint mutativi usano Zod, rate limit e chiavi di idempotenza. Gli endpoint cliente verificano sempre `ownerUid`; non si basano sulle regole Firestore o su flag presenti nel browser.

## Integrazione nel gestionale

La sezione gestionale dedicata `Stampe online`, alimentata dalla stessa collection `orders`, deve mostrare:

- numero ordine e cliente;
- numero file e copie;
- totale e stato pagamento;
- stato di produzione;
- eventuali file a bassa risoluzione;
- azioni `Scarica distinta`, `Scarica originali`, `Pronto per il ritiro`, `Consegnato`.

Alla capture PayPal viene aggiunta una `Transaction` con riferimento provider e un `cashMovement` idempotente. Non è previsto alcun pagamento in sede.

Le statistiche prodotti continuano a funzionare perché ogni riga conserva `prodottoId`, `prodottoNome`, `prodottoPrezzo` unitario e `quantita`.

## Sicurezza, privacy e affidabilità

- Originali privati, niente URL download permanenti.
- Token Firebase verificato server-side su ogni endpoint cliente.
- Admin autorizzato dal server, mai da `localStorage`.
- Segreti PayPal solo nei Replit Secrets/secret store di produzione.
- Totali in centesimi e ricalcolati server-side.
- Webhook firmati e idempotenti; payload completi non conservati oltre il necessario.
- Event log di pagamento e transizioni di stato append-only.
- Rate limit per UID/IP su creazione bozza, quote e pagamento.
- Cleanup automatico di bozze e file orfani.
- Informativa privacy aggiornata per fotografie, Firebase Storage, PayPal, finalità e tempi di conservazione.
- Checkout con caratteristiche, totale, imposte/spese, tempi, condizioni e pulsante inequivocabile sull'obbligo di pagare.
- Condizioni di vendita e disciplina del recesso per prodotti personalizzati da validare con commercialista/legale prima del go-live.

## Test minimi per il rilascio

### Catalogo e prezzi

- seed idempotente dei 34 SKU;
- confini di ogni scaglione (minimo, massimo, passaggio allo scaglione successivo);
- pacchetto Polaroid da 50;
- calcolo in centesimi senza errori floating point;
- prodotto disattivato o prezzo cambiato durante una bozza.

### Sicurezza

- un utente non legge/modifica ordini o file di un altro UID;
- i file non sono pubblici;
- il client non può cambiare totale, stato o capture ID;
- regole Firestore/Storage con Emulator Suite;
- rate limit e idempotenza.

### PayPal sandbox

- create, approve, capture e retry;
- importo/valuta errati;
- capture duplicata;
- webhook duplicato e fuori ordine;
- pagamento negato, rimborso parziale/totale, reversal;
- callback client persa ma webhook ricevuto.

### Flusso reale

- Android, iPhone/Safari e desktop;
- 1, 50 e 500 fotografie;
- interruzione e ripresa upload;
- foto duplicate, HEIC, file corrotto e bassa risoluzione;
- ordine PayPal completato e ordine PayPal annullato/fallito;
- download ZIP e distinta dal pannello admin;
- notifica ordine ricevuto e pronto per il ritiro.

## Piano di implementazione

### Fase 0 — decisioni e sandbox

- applicare le decisioni confermate: pagamento anticipato, solo JPG, resa bordo/riempimento semplificata e retention di 90 giorni;
- configurare in sandbox le credenziali PayPal FileX e registrare il webhook specifico dello shop;
- abilitare Google provider e domini autorizzati;
- definire testi legali e fiscali.

### Fase 1 — dominio e catalogo

- tipi condivisi e calcolatore prezzi puro;
- estensione Products Manager per scaglioni e specifiche di stampa;
- seed delle 34 voci e endpoint catalogo;
- pagina pubblica alimentata da Firestore con fallback controllato.

### Fase 2 — identità, bozze e upload

- Google Sign-In e profilo;
- regole private Storage;
- API bozza/asset, upload resumable, qualità e resa bordo/riempimento;
- pagina `I miei ordini`.

### Fase 3 — checkout e gestionale

- riepilogo e pagamento anticipato obbligatorio;
- PayPal create/capture/webhook in sandbox;
- collegamento clienti, transazioni e cassa;
- filtri, distinta, ZIP e workflow nel pannello admin.

### Fase 4 — collaudo e go-live

- Emulator Suite, test API/E2E e prove con 500 foto;
- privacy, condizioni di vendita, email e retention;
- passaggio PayPal live;
- smoke test produzione e monitoraggio errori/webhook.

## Decisioni confermate

1. Pagamento totale anticipato con PayPal; il ritiro in sede è la modalità di consegna, non di pagamento.
2. Il cliente sceglie soltanto finitura (`Carta lucida` / `Carta opaca`) e resa (`Foto intera con bordo bianco` / `Riempi tutto il foglio`).
3. Sono accettati esclusivamente file JPG/JPEG.
4. Gli originali vengono conservati per 90 giorni dalla consegna e poi eliminati automaticamente.
5. Il pacchetto Polaroid richiede 50 fotografie tutte diverse; nessun duplicato conta per raggiungere il minimo.
6. La produzione deve riutilizzare l'anagrafica e il flusso `Laboratori`, creando una spedizione collegata direttamente all'ordine shop e mantenendo ordine, cliente, pagamento, costo fornitore e avanzamento nella stessa vista gestionale.
