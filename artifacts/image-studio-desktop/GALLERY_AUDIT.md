# Audit delle gallerie desktop

Verifica del codice e dei percorsi simulati, senza modificare gallerie di produzione.

| Area | Prima | Stato e verifica |
| --- | --- | --- |
| Capitoli | Solo creazione, con `title/order` diversi da `titolo/ordine` usati dal web | Creazione, descrizione, modifica, ordine e rimozione nel modello web; test API su lettura dopo scrittura, foto moderne e legacy. La rimozione riporta le foto tra quelle senza capitolo. |
| Foto | La griglia nascondeva le foto senza capitolo quando esisteva almeno un capitolo | Filtro esplicito sempre disponibile, ricerca per nome, selezione e spostamento multiplo, anteprima originale e 48 miniature per volta. Test della resa a vuoto e con foto legacy. |
| Copertine | Due campi URL | Foto della galleria o file locale per desktop e mobile, anteprima, punto focale e rimozione; copertina del capitolo dalle sue foto. Test API delle posizioni e dei campi usati dal web pubblico, più test della resa dei due controlli. |
| Upload da cartelle | Nomi delle cartelle potevano generare capitoli incompatibili col web; finalizzazione accettava percorsi non verificati | Capitoli generati nel modello web e correggibili dal desktop. Sessione legata a galleria/percorso, controllo dell'oggetto, dimensione, MIME, firma e SHA-256; ID foto deterministico per i retry. Test simulato dei rifiuti e del doppio finalize. La coda riprendibile non è stata riprogettata. |
| Impostazioni e selezione cliente | Le modifiche non mostravano sempre esito; il form selezione era inizializzato prima della risposta; gli interruttori password/PIN non configuravano i segreti | Il desktop configura credenziali scrivibili ma non leggibili, associa clienti/Job, imposta requisiti prodotto e mostra risultati/cronologia. La configurazione richiede la versione aggiornata dell'API pubblicata; i test locali non provano l'accesso alla produzione. |

Il pannello web legge `chapters[].titolo/descrizione/ordine`, `photos[].chapterId`, `coverPhotoUrl/coverPhotoPosition`, `coverImageDesktop/Mobile` e le relative posizioni. La galleria pubblica legge gli stessi campi; le gallerie legacy continuano a poter leggere `coverImageUrl` e le foto nella sottocollezione. I test usano un database e Storage simulati: non dimostrano l'aggiornamento di una sessione web già aperta, ma i dati salvati sono letti dal medesimo modello Firestore dopo refresh.

## Limiti e lavori separati

- **Non verificato su PC Windows reale:** dialogo cartella nativo, installazione, firma e distribuzione. La build web desktop e i test non sostituiscono il collaudo dell'installer.
- **Non verificato in un browser autenticato con dati reali:** preview pubblica e pannello web su una galleria di produzione. Sono stati confrontati i consumer del codice e usati dati simulati; nessuna modifica è stata applicata alla produzione.
- **Prestazioni:** la griglia rende 48 foto per volta, ma il servizio desktop scarica ancora l'elenco completo delle foto della galleria per ricerca/filtri. Per gallerie eccezionalmente grandi il trasferimento iniziale può restare costoso.
- **Formati:** JPEG, PNG, WebP, GIF e HEIC/HEIF sono ammessi nel caricamento foto; TIFF e AVIF non sono selezionati perché l'API di finalizzazione e la galleria web non ne garantiscono la visualizzazione. Nei browser che ignorano i filtri della selezione cartella vengono scartati con un avviso.
- **Cancellazioni:** le API desktop conservano i riferimenti alle foto moderne e legacy quando Storage fallisce e consentono il retry; i test isolati coprono errore e nuovo tentativo. La verifica su Storage reale richiede una galleria di prova.
- **Distribuzione:** la presenza di una route non è dimostrata da un `401` con token invalido; la build Windows del commit finale, il backend pubblicato e il collaudo autenticato sono verifiche distinte.
- **Preesistente:** l'API server presenta errori TypeScript in altre route, non in `desktop-gallery-routes.ts`; non è stato corretto il resto del progetto nell'ambito di questo audit.