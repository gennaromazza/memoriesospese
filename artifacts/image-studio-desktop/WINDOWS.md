# Image Studio Gallerie per Windows

## Build riproducibile

1. Installa Node.js 24 e pnpm 10 su Windows.
2. Esegui `pnpm install --frozen-lockfile` dalla radice del workspace.
3. Imposta `VITE_API_BASE_URL=https://imagestudiofotografico.com`.
4. Esegui `pnpm --filter @workspace/image-studio-desktop run desktop:dist`.
5. L'installer NSIS viene scritto in `artifacts/image-studio-desktop/release/`.

La pipeline `.github/workflows/image-studio-windows.yml` costruisce l'installer
su `windows-latest` e verifica automaticamente installazione silenziosa, avvio,
collegamenti, disinstallazione e corrispondenza tra installer, metadati di update
e contenuto dello ZIP. Una run riuscita carica **uno ZIP che contiene l'installer
`.exe`**, oltre a `latest.yml`, blockmap, checksum e `.exe` separato per l'updater.
Un artifact Actions non è una release e non attiva l'updater. Per il download
manuale aprire **Actions → Image Studio Windows installer → run riuscita del
commit finale → Artifacts → image-studio-windows-installer**; estrarre l'archivio
Actions e poi `Image-Studio-Gallerie-<versione>-x64.zip` per trovare l'installer.
Non serve effettuare controlli manuali dell'`.exe`: i controlli di integrità e
lo smoke test sono nella pipeline. Il runner GitHub è Windows Server, perciò
non equivale a una prova dei flussi autenticati su PC Windows 10/11.

## Sicurezza

Il pacchetto contiene soltanto la configurazione Firebase pubblica necessaria al login.
Non contiene service account, token amministrativi o chiavi private. Ogni operazione di
gestione passa il Firebase ID token alle API e viene nuovamente autorizzata dal server.
La shell Electron usa isolamento del contesto, sandbox e un preload con una API minima.

## Distribuzione senza certificato

Non occorre acquistare un certificato né verificare manualmente l'eseguibile
per usare il canale automatico. Le release Windows di questo progetto sono
**non firmate**: Windows/SmartScreen può mostrare un avviso all'installazione
o all'aggiornamento. Lo ZIP non elimina questo avviso. I controlli automatici
su versione, file, ZIP, SHA-512 e SHA-256 rilevano file incompleti o discordanti,
ma non certificano l'identità di chi ha pubblicato la release: la sicurezza del
canale dipende dall'accesso al repository GitHub e al workflow.

## Aggiornamenti

L'app **Windows installata** usa GitHub Releases pubbliche del
repository `gennaromazza/memoriesospese` come canale stabile, senza token
incorporati. È necessario riservare le release pubbliche di questo repository
alla serie Windows: una release di un altro prodotto come `latest` interromperebbe
il feed. Le build locali, i tag di prova, le run fallite, gli artifact temporanei
e le release draft non sono versioni offerte ai client.

All'avvio e ogni sei ore l'app controlla le release stabili. Solo versioni
superiori vengono scaricate; non sono permessi downgrade o prerelease.
La finestra mostra stato, progresso ed eventuale errore; un errore di rete non
chiude l'app e il controllo viene ritentato. Una volta pronto il download,
**non si installa automaticamente all'uscita**: l'utente può scegliere
«Riavvia e aggiorna» nella finestra o nel menu del tray. Se ci sono foto in
coda, in compressione, hashing o upload, il riavvio è disabilitato. I file in
coda, il login e le preferenze rimangono nei dati dell'app; gli upload lasciati
in pausa possono essere ripresi dopo il riavvio. Il pulsante «Più tardi»
rimanda la scelta senza cancellare l'aggiornamento scaricato. Chiudere la
finestra continua a nasconderla nel tray, senza interrompere gli upload.

### Procedura per una nuova release

1. Sincronizzare **sul ramo GitHub da cui partirà il tag** il workflow
   `.github/workflows/image-studio-windows.yml`. Una copia pronta è in
   `ci/windows-release/workflow.yml`: se l'integrazione GitHub non permette di
   scrivere `.github/workflows/`, il proprietario deve applicarla dall'editor
   GitHub con i permessi appropriati. Verificare il contenuto del workflow
   remoto prima di creare il tag: il vecchio workflow crea solo artifact.
2. Incrementare `version` in `artifacts/image-studio-desktop/package.json`,
   aggiornare il lockfile e verificare che il backend pubblicato sia compatibile.
   Da un commit definitivo creare **solo** il tag stabile esatto
   `image-studio-desktop-v<version>`, per esempio
   `image-studio-desktop-v0.0.7`. Non riutilizzare un tag o sovrascrivere gli
   asset di una release esistente.
3. La run Windows deve superare typecheck, test, packaging NSIS e smoke
   installer. Il job successivo rifiuta versioni non superiori, tag discordanti
   e file/metadati incompleti; ricontrolla `latest.yml`, SHA-512 dell'installer,
   blockmap, SHA-256 e che lo ZIP contenga proprio l'installer della release.
   Pubblica `.exe` e ZIP insieme agli altri asset come draft e rende la release
   pubblica solo al termine. L'`.exe` separato è necessario per gli
   aggiornamenti automatici; lo ZIP è destinato al download manuale.
4. Per **confermare il comportamento reale**, provare su due versioni successive
   (N e N+1) su PC Windows: app visibile e nel tray, upload attivo/in pausa,
   rete disconnessa durante download, login e coda dopo il riavvio.
   Un installer precedente senza updater richiede l'installazione manuale
   della prima versione aggiornata; dalla versione successiva può aggiornarsi.

Per ritirare una release difettosa, non modificare gli asset già pubblicati:
bloccare la distribuzione, pubblicare una versione corretta **più alta** e
avvisare gli utenti. Se serve tornare a una versione precedente,
il rollback è un'installazione manuale controllata; l'updater non consente
downgrade automatici. Conservare checksum e installer delle versioni
precedenti fuori dal canale `latest`.

**Stato verifica:** l'ambiente Replit è Linux e non dispone di una sessione
Windows autenticata. I test del controller e il workflow non dimostrano ancora
un aggiornamento reale N → N+1 su Windows. La prima release pubblica e la
prova di aggiornamento non sono state eseguite in questo workspace.

## Collaudo manuale necessario prima di chiudere la verifica

Eseguire **la stessa versione dell'installer** su un PC Windows 10 x64 e uno
Windows 11 x64, con connessione internet e un account Firebase amministratore
di prova. Usare una galleria di prova: non eliminare foto o gallerie reali.
Per ogni PC registrare versione OS, esito e data:

1. Installare e aprire dal collegamento Desktop e dal menu Start; verificare
   che il login Firebase funzioni e che l'utente non admin sia respinto dalle API.
2. Chiudere e riaprire: verificare persistenza del login e delle preferenze coda.
   Disconnettersi e verificare che il login venga nuovamente richiesto.
3. Selezionare una cartella con sottocartelle e immagini di prova; controllare
   capitoli, progressi e possibilità di pausa/ripresa dopo il riavvio.
4. Costruire **una seconda versione con numero maggiore**; installarla sopra la
   precedente e verificare avvio, scorciatoie e persistenza login/coda. La
   reinstallazione della stessa versione non prova un aggiornamento.
5. Disinstallare dal sistema e controllare che collegamenti e programma vengano
   rimossi. I dati utente sono intenzionalmente conservati (`deleteAppDataOnUninstall=false`).

Il workflow automatico non inserisce credenziali Firebase e non può effettuare i
passaggi di login o upload; questi esiti vanno raccolti sui due PC prima di
affermare che il supporto Windows 10/11 sia verificato.

## Stato di rilascio

Al 24 settembre 2026: il runner Windows ha eseguito con successo la
[run di prova 0.0.4](https://github.com/gennaromazza/memoriesospese/actions/runs/36002853890)
del commit `dea38f8f0559125f030e32895eae85e7c23cfdb3` sul ramo separato
`image-studio-desktop-v0.0.4-test`: typecheck, packaging, installazione,
avvio, collegamenti e disinstallazione sono riusciti. L'installer locale
`release/Image-Studio-Gallerie-0.0.0-x64.exe` è incompleto e non supera
il controllo di dimensione: non scaricarlo né distribuirlo. Il pacchetto di
prova è scaricabile dalla sezione **Artifacts → image-studio-windows-installer**
della run. Il digest SHA-256 dell'**archivio artifact**, registrato da GitHub,
è `f8e7abf26d22ca54be978c399338b59eecd9b4cd49141d46507cac13ca69f16d`.
Non confonderlo con l'hash dell'**eseguibile**: quest'ultimo viene stampato
nello step «Check installer, launch, shortcuts and uninstall» della medesima
run. Per questa run il repository GitHub usa ancora il workflow precedente,
che carica solo l'`.exe`, senza `SHA256SUMS.txt`; il workflow aggiornato nel
workspace lo includerà nelle run future dopo la sincronizzazione autorizzata
di `.github/workflows/image-studio-windows.yml`.
I test isolati locali delle route desktop (14) e della persistenza coda (1)
passano; il typecheck desktop passa. Il typecheck complessivo dell'API
riscontra errori preesistenti fuori dalle route desktop.

I test isolati locali non costituiscono una build Windows. Prima di fornire
un link a una run come installer di prova verificare che **il commit finale**
sia sul repository GitHub, che la run Windows sia riuscita, che il checksum
provenga dalla stessa run, e che l'API pubblicata corrisponda al client:
preflight `OPTIONS` con `Origin: app://image-studio` e
`Access-Control-Request-Headers: authorization,content-type`, più disponibilità
autenticata delle route desktop. Un `401` ottenuto usando un token invalido
non basta a provare che la route esista: anche una route inesistente può
rispondere `401` prima del routing. Fino alla pubblicazione del backend e
alla prova con un account amministratore **non dichiarare verificati** i flussi
autenticati del nuovo installer. Il collaudo su PC Windows 10/11 resta una
verifica funzionale separata; lo ZIP non aggiunge una firma digitale.