# Image Studio Gallerie per Windows

## Build riproducibile

1. Installa Node.js 24 e pnpm 10 su Windows.
2. Esegui `pnpm install --frozen-lockfile` dalla radice del workspace.
3. Imposta `VITE_API_BASE_URL=https://imagestudiofotografico.com`.
4. Esegui `pnpm --filter @workspace/image-studio-desktop run desktop:dist`.
5. L'installer NSIS viene scritto in `artifacts/image-studio-desktop/release/`.

La pipeline `.github/workflows/image-studio-windows.yml` esegue gli stessi passaggi su
`windows-latest`, verifica in modo automatico installazione silenziosa, avvio,
collegamenti e disinstallazione. Solo dopo il superamento dello smoke test
pubblica l'installer e `SHA256SUMS.txt` come artifact della run. La versione nel
nome dell'installer deve corrispondere a `package.json`; un `.exe` locale
precedente, specialmente `0.0.0`, **non** è la build convalidata.
Per scaricare: aprire **Actions → Image Studio Windows installer → run riuscita
del commit finale → Artifacts → image-studio-windows-installer**. Estrarre lo
ZIP e confrontare l'hash SHA-256 di PowerShell
`(Get-FileHash .\Image-Studio-Gallerie-*-x64.exe -Algorithm SHA256).Hash`
con il valore in `SHA256SUMS.txt`. Non utilizzare un artifact di run fallita.
Il runner GitHub ospitato è Windows Server: questo controllo **non sostituisce**
le prove su PC Windows 10 e Windows 11.
Su un PC di prova con PowerShell, dopo aver scaricato l'installer `.exe` dal
workflow, eseguire dalla radice del repository:
`./artifacts/image-studio-desktop/scripts/smoke-installer.ps1 -InstallerPath "C:\percorso\Image-Studio-Gallerie-...-x64.exe"`.
Lo script usa una cartella temporanea chiamata `ImageStudioGallerieSmoke` e si
ferma se è già presente, per non sovrascrivere installazioni precedenti.
Non sostituisce il collaudo manuale dei flussi autenticati qui sotto.

## Sicurezza

Il pacchetto contiene soltanto la configurazione Firebase pubblica necessaria al login.
Non contiene service account, token amministrativi o chiavi private. Ogni operazione di
gestione passa il Firebase ID token alle API e viene nuovamente autorizzata dal server.
La shell Electron usa isolamento del contesto, sandbox e un preload con una API minima.

## Firma del codice prima della distribuzione pubblica

La build CI attuale è **non firmata**; non distribuire pubblicamente l'eseguibile
non firmato come release affidabile. Il proprietario deve procurarsi un certificato
di code signing attendibile (preferibilmente EV o equivalente gestito in HSM),
configurare la firma nel runner Windows e conservare chiavi e password nei secret
GitHub Actions, mai nel repository né nel pacchetto. Abilitare la firma di
eseguibile e installer con `electron-builder`, applicare il timestamp del provider
e verificare con `Get-AuthenticodeSignature` sia l'installer sia l'eseguibile
installato. Firmare ogni versione, inclusi gli aggiornamenti. Il valore
`CSC_IDENTITY_AUTO_DISCOVERY=false` nella pipeline serve solo a impedire
una firma accidentale durante i test; va rivisto quando si configura la firma.

## Aggiornamenti

Questa versione distribuisce aggiornamenti tramite un nuovo installer. Pubblicare una
nuova tag `image-studio-desktop-v*`, scaricare l'artifact della pipeline e installarlo
sulla versione precedente. L'aggiunta di aggiornamenti automatici richiede un canale di
release firmato ed è volutamente separata.

## Collaudo manuale necessario prima di chiudere la verifica

Eseguire **la stessa versione dell'installer** su un PC Windows 10 x64 e uno
Windows 11 x64, con connessione internet e un account Firebase amministratore
di prova. Usare una galleria di prova: non eliminare foto o gallerie reali.
Per ogni PC registrare versione OS, SHA-256 dell'installer, esito e data:

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

Al 24 settembre 2026: il runner Windows ha eseguito con successo una run della
versione **0.0.3** (run 35987237966), antecedente a queste modifiche; **non**
convalida la versione 0.0.4. L'installer locale
`release/Image-Studio-Gallerie-0.0.0-x64.exe` è incompleto e non supera
il controllo di dimensione: non scaricarlo né distribuirlo. Non è disponibile
un checksum né un link artifact di una run riuscita sul codice 0.0.4.
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
alla prova con un account amministratore **non dichiarare utilizzabile** il
nuovo installer. Il collaudo su PC Windows 10/11 e la firma restano ulteriori
condizioni per un rilascio pubblico affidabile.