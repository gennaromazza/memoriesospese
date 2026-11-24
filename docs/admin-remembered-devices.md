# Browser admin ricordati

## Stato del rilascio

La pubblicazione dell'applicazione non dimostra che le regole Firestore corrette siano attive. Per questa modifica non è stata verificata la versione delle regole sull'ambiente di produzione; non abilitare quindi il ricordo dei dispositivi finché il responsabile del rilascio non ha completato e registrato i controlli qui sotto. Il rilascio di produzione non viene eseguito da una copia di lavoro isolata.

## Comportamento

- Il browser viene ricordato per 30 giorni solo dopo una verifica passkey riuscita e una scelta esplicita dell'amministratore.
- La fiducia vale per quel browser e quell'account; non sostituisce il login Firebase e non si applica alla Preview.
- Il browser conserva un cookie `Secure`, `HttpOnly` e `SameSite=Lax`; il server conserva solo l'hash del segreto e il record revocabile.
- A ogni ripristino il server controlla account, scadenza, revoca e data di invalidazione. Il claim Firebase contiene solo l'ID del record, non il segreto.
- La revoca individuale o globale invalida anche l'accesso Firestore. Uscire dall'account non revoca la fiducia; “Dimentica dispositivo” sì.
- Gestione delle passkey, dispositivi e richieste QR richiede una verifica WebAuthn fresca; una sessione ricordata non basta.

## Ordine di rilascio

### 1. Controlli prima del rilascio

Eseguire i test con credenziali di produzione rimosse dal processo. I test API usano mock; il test delle regole carica `firestore.rules` nell'emulatore.

```sh
env -u FIREBASE_ADMIN_CREDENTIALS -u GOOGLE_APPLICATION_CREDENTIALS \
  pnpm exec firebase emulators:exec --project admin-passkey-rules-test \
  --only firestore --config firebase.json \
  "cd artifacts/image-studio-web && FIRESTORE_RULES_TEST_PORT=8080 pnpm exec vitest run src/lib/admin-passkey-rules.test.ts"

env -u FIREBASE_ADMIN_CREDENTIALS -u GOOGLE_APPLICATION_CREDENTIALS \
  pnpm --filter @workspace/api-server exec vitest run \
  --config vitest.config.ts src/admin-security/admin-security.test.ts

cd artifacts/image-studio-web
pnpm exec vitest run --config vitest.config.ts src/lib/admin-passkey.test.ts
```

Procedere solo se i tre comandi terminano con successo. I test delle regole devono confermare: accesso passkey esistente senza modifiche quando l'obbligo non è attivo; accesso con verifica passkey attiva; accesso ricordato solo con record attivo; rifiuto di record assente, scaduto o revocato; revoca globale immediata. I test API devono inoltre confermare che la sessione ricordata non autorizza operazioni di sicurezza che richiedono una prova WebAuthn fresca.

### 2. Pubblicare e verificare prima le regole Firestore

1. Confermare esplicitamente l'ID del progetto Firebase di destinazione; non ricavarlo da un alias predefinito senza verificarlo.
2. Pubblicare solo le regole da questa revisione, senza rilasciare ancora API o web:

   ```sh
   firebase deploy --only firestore:rules --project <project-id-confermato>
   ```

3. Nella console Firebase del progetto di destinazione, controllare che la pubblicazione sia terminata e che la revisione attiva corrisponda a `firestore.rules` di questa revisione. Registrare progetto, revisione/data e risultato del controllo. Lo stato “app pubblicata” o un build riuscito non sostituisce questa verifica.
4. Verificare con una sessione admin passkey già funzionante che l'accesso legacy continui a funzionare. Non attivare l'obbligo passkey, non revocare la passkey esistente e non usare l'opzione di ricordo durante questa fase.

Se la revisione delle regole non è confermata o il controllo legacy fallisce, fermare il rilascio: non pubblicare API o web e non abilitare il ricordo.

### 3. Rilasciare l'API e verificare i percorsi

Rilasciare l'API solo dopo il superamento del controllo regole. Verificare, con un account admin autorizzato e una sessione passkey fresca:

- la creazione di una sessione ricordata dopo una verifica passkey e consenso esplicito;
- il ripristino sul browser autorizzato e il rifiuto di cookie mancanti/alterati o di un account diverso;
- il rifiuto di accesso API e Firestore con record scaduto o revocato;
- la revoca individuale e globale, verificando che una sessione già emessa non conservi l'accesso;
- che una sessione ricordata non possa modificare le impostazioni di sicurezza senza una nuova prova passkey;
- che la sessione passkey legacy continui a funzionare.

Usare un dispositivo canary revocabile per provare la revoca; non revocare la passkey né l'unica sessione amministrativa recuperabile. Se uno dei controlli fallisce, non pubblicare il web client.

### 4. Rilasciare il web e abilitare la funzione

Pubblicare il web solo dopo che tutti i controlli API sono passati. Provare su due browser separati: il browser ricordato ripristina l'accesso, il browser non ricordato richiede la passkey, e logout/scadenza/revoca producono il comportamento previsto. Abilitare il flusso agli utenti solo dopo aver registrato esito positivo dei controlli delle regole, legacy, API e web.

Registrare nel verbale di rilascio almeno: ID progetto Firebase, revisione delle regole verificata, revisioni API e web, esito e data dei controlli legacy/ricordo/revoca e responsabile.

## Piano di rollback

Il rollback deve mantenere valido il controllo server-side e non revocare l'accesso passkey legacy.

1. Fermare prima l'emissione di nuove fiducie (ritirare l'opzione web o disabilitare il percorso di creazione nell'API).
2. Con l'API nuova ancora attiva, revocare tutti i dispositivi ricordati usando l'azione amministrativa autenticata con verifica passkey fresca. L'operazione aggiorna il marcatore globale di invalidazione. Verificare che l'elenco non abbia dispositivi attivi e che i vecchi token non superino più le verifiche API e Firestore.
3. Solo dopo la verifica della revoca, ripristinare API e/o web. Lasciare attive le regole aggiornate: anche token Firebase non ancora scaduti devono restare negati se il record è revocato/assente o il marcatore di invalidazione è successivo.
4. Non ripristinare regole che rimuovono i controlli di passkey o di record server-side. Un eventuale ripristino delle regole è ammesso soltanto dopo aver dimostrato che non esistono fiducie attive e che la revisione di destinazione mantiene la protezione passkey per il percorso legacy.

Se l'API nuova non è disponibile, non rimuovere le regole che verificano i record ricordati: mantenerle rende i token senza record non autorizzati. Ripristinare l'API soltanto dopo la revoca server-side tramite il percorso amministrativo disponibile e dopo aver verificato l'accesso legacy.
