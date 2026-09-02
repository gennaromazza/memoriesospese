# Guida ai test

## Principi

Il progetto combina test unitari, test di integrazione con mock, test delle Firestore rules e test browser. Il dataset reale non deve essere usato come fixture di test: le credenziali presenti nell'ambiente possono puntare al Firestore reale.

## Comandi rilevanti

```bash
# build e controllo statico
npm run build
npx tsc --noEmit

# tutti i test Vitest, se il progetto è configurato per la suite corrente
npx vitest run

# test rules in emulatori
npm run test:rules
```

`npm run test:rules` avvia emulatori Firestore e Storage tramite `firebase emulators:exec`, usando il progetto di test indicato nello script. Non sostituire l'emulatore con un progetto reale.

## Test server

I test server presenti coprono, tra gli altri, domini:

- Real Wedding (`server/wedding-seo.test.ts`);
- prerender SEO (`server/seo-prerender.test.ts`);
- booking/calendario;
- quote e audit;
- pagamenti/scadenze;
- info forms;
- photobook;
- lab e collaboratori;
- print shop;
- email/idempotenza;
- aggregati e utility.

Quando un modulo usa Firebase Admin, il pattern ricorrente è mockare `server/firebase-admin.js` e i servizi esterni. Un test unitario non deve invocare Gmail, Drive, PayPal, Google Calendar o Gemini reali.

## Test client

La suite client è distribuita accanto ai feature module. È presente copertura per:

- stato e catalogo print shop;
- checkout PayPal;
- validazione catalogo;
- componenti/utility di gallery;
- form e flussi di preventivo;
- funzioni date e immagini.

Per i componenti che dipendono da Firebase Auth o QueryClient, usare provider/mock coerenti con i test esistenti invece di leggere il browser globale reale.

## Test delle rules

Le rules sono un contratto di sicurezza indipendente dal server. I test dovrebbero verificare almeno:

- admin e non-admin;
- proprietario e altro utente;
- accesso anonimo previsto;
- write con campi ammessi e campi extra;
- collection legacy;
- ordini `print_shop` contro vecchi flussi;
- quote firmabili solo nei campi consentiti;
- fatture/idempotenza immutabili;
- token e dati pubblici/non pubblici.

Attenzione: leggere `firestore.rules` è obbligatorio prima di scrivere il test. Alcune regole sono volutamente permissive per compatibilità storica e alcune validazioni token sono dichiarate placeholder.

## Real Wedding

La suite Real Wedding deve coprire:

- selezione delle sole fonti con consenso;
- recupero submission storiche con marker/badge;
- selezione foto da galleria e foto legacy;
- risposta AI valida;
- envelope di errore HTTP/infra;
- heartbeat durante generazioni lunghe;
- rifiuto di risposte senza bozza;
- sanitizzazione Markdown/HTML nel pannello;
- slug derivato dal titolo finché non personalizzato;
- salvataggio come draft;
- assenza di pubblicazione automatica;
- esposizione pubblica solo dello stato `published`;
- fallimento non bloccante della ricerca fornitori;
- cache verificata con TTL.

Il comando documentato nel README è:

```bash
npm run ai:wedding:test -- "https://dominio/admin/gallery/ID_GALLERIA/manage"
```

È un test manuale senza salvataggio/pubblicazione, ma richiede integrazioni/Secrets nel runtime. Non usarlo nella suite automatica.

## Print shop

La matrice minima è:

| Area | Casi |
|---|---|
| auth | anonimo, cliente verificato, admin |
| quote | SKU valido/invalid, fingerprint, quantità, formato |
| upload | prepare/finalize, size/MIME, asset incompleto |
| PayPal | create, capture, webhook duplicato, importo discordante |
| ordine | transizioni valide/invalid, delete, note cliente |
| Drive | folder recovery, permessi, errore connector |
| lab | creazione, transfer, send, costo, scadenza |
| retention | dry-run, ordine scaduto, ordine non eleggibile |
| privacy | billing details, consenso legale, dati cliente |

Mockare PayPal, Drive, Gmail, Firebase Storage e clock. Testare idempotenza richiamando due volte lo stesso comando.

## Calendario e booking

Verificare:

- timezone Europe/Rome;
- eventi all-day;
- eventi transparent;
- conflitti;
- cache invalidation dopo associazione;
- retry cancellazioni;
- route pubbliche di disponibilità;
- route admin di approvazione;
- email ricevuta/confermata senza doppio invio.

Per test con una seconda istanza Vite usare una porta HMR distinta (`VITE_HMR_PORT`) se necessario; il codice documenta il problema del bind sulla porta HMR fissa.

## Test manuali browser

Prima di dichiarare una modifica UI completa:

1. aprire la preview tramite il workflow;
2. provare percorso pubblico e admin rilevante;
3. verificare refresh diretto su una rotta Wouter;
4. verificare console browser;
5. verificare mobile/desktop se coinvolge gallery, booking o checkout;
6. controllare network e status delle API;
7. verificare errori 401/403 senza token.

## Fixture e dati

- Preferire fixture in memoria/mock.
- Per Firestore usare emulatori.
- Se un test manuale richiede produzione, usare prefissi chiaramente temporanei e rimuovere i dati; non inserire PII reale nei test.
- Non leggere o stampare Secrets per diagnosticare un fallimento.
- Non assumere che un documento reale abbia tutti i campi definiti dai tipi.

## Diagnosi dei fallimenti

### 401/403 dal client

Controllare nell'ordine:

1. endpoint nella allowlist di `queryClient.ts`;
2. `auth.authStateReady()`;
3. middleware server;
4. ruolo admin/token;
5. Firestore rules se l'accesso è diretto.

### Test che vedono dati mancanti

Controllare Timestamp serializzati, campi mancanti nelle query `orderBy`, doppie collection foto e base path.

### Preview bianca

Riavviare il workflow dopo modifiche server, leggere log workflow/browser e verificare porta 5000. Distinguere errore Vite/chunk da errore Express/API.

### Email duplicate

Controllare marker prima dell'invio, lock/coda, retry e worker multipli. Non ripetere il test su destinatari reali senza usare un mock.

## Criterio di consegna

Una modifica è verificata quando la suite pertinente passa, il build passa, il workflow si avvia e il percorso utente richiesto è stato osservato senza errori manifesti. Un test isolato verde non dimostra da solo che rules, API e UI siano coerenti.