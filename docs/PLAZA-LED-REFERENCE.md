# Plaza LED — revisione 2

Il renderer `plaza-v2` ricostruisce le quattro fotografie del prodotto fornite il 19 settembre 2026. La nuova conferma dell'utente sostituisce l'interpretazione precedente con asse laterale descritta nella memoria `plaza-led-double-frame`.

- Due telai a C aperti verso destra: quello esterno fisso e il cofanetto mobile. L'utente ha confermato esplicitamente che l'asse resta al centro dell'album.
- Il telaio interno ha traverse e dorso più consistenti, con album ridimensionato nell'incasso e plexiglass arretrato rispetto al bordo rivestito.
- La traversa interna superiore termina a metà larghezza, in corrispondenza dell'asse centrale e della placchetta superiore: il plexiglass continua fino al bordo destro senza una traversa spessa sovrapposta. I fissaggi superiori restano sul tratto rivestito. La traversa inferiore conserva la sua estensione.
- Due placchette laterali in plexiglass, con viti e nomi bianchi separati, coprono le estremità delle traverse superiore e inferiore. Seguono il cofanetto, non il libro estraibile. Il pulsante **Lato nomi** mostra il lato delle pagine a −90°.
- Profilo metallico e diffusore LED sulle superfici interne superiore, sinistra e inferiore. Il percorso a U conserva il tratto superiore previsto nella precedente reference; nelle nuove foto sono visibili soprattutto lato e base.
- Due lastre di plexiglass con spessore, fissaggi e incavi rettangolari. La stampa posteriore appartiene al cofanetto girevole, mentre l'album esce dal lato destro aperto.
- Copertina fotografica intera, foto piccola, placchetta incisa oppure tessuto a sinistra, foto a destra e placchetta orizzontale sovrapposta con nomi.
- I campi nome restano disponibili in tutte le copertine: il primo personalizza la placchetta laterale superiore, il secondo quella inferiore. Vengono conservati in `engravingNames` e riportati nel riepilogo di produzione anche con foto intera.
- UV dei rivestimenti proporzionate alle dimensioni dei pezzi, per mantenere la scala del tessuto sulle traverse.
- La cornice Plaza LED ammette esclusivamente il tessuto coordinato all'album. Le precedenti scelte legno/bianco vengono normalizzate a `fabric` nel renderer e nello schema di lettura/salvataggio; gli altri modelli conservano le proprie finiture.

Le dimensioni del modulo `structure.js` sono proporzioni ricostruite dalle foto, non quote produttive certificate. Il volume spazzato dalla rotazione è contenuto nell'apertura del telaio, anche considerando diffusori e spessore del plexiglass. L'estrazione posiziona lo scrigno a 90° per far passare il libro davanti al telaio esterno.

Il Plaza normale non cambia. La cartella `plaza-v1` resta disponibile e lo schema accetta le revisioni 1 e 2. Il renderer corrente importa le scelte precedenti; la prima modifica esplicita le porta alla revisione 2. Le vecchie anteprime confermate non vengono riscritte. Le miniature Plaza sono renderizzate dal suo modello, senza riutilizzare quelle del girevole normale.

## Verifica

- `npx vitest run server/plaza-reference.test.ts server/mockup-renderer-revisions.test.ts`
- `node e2e/plaza-reference.browser.mjs`: geometria, rotazione, estrazione, varianti copertina, plexiglass senza stampa, otto immagini di esportazione e ripristino LED, applicazione configurazione precedente in iframe, passaggio a revisione 2 dopo modifica, assenza di notifiche di modifica durante l'esportazione, controlli mobile verticale/orizzontale.
- `node e2e/plaza-reference.browser.mjs --update-examples`: rigenera le quattro miniature da una fotografia sintetica dimostrativa; non usa fotografie cliente. Le catture di verifica vanno in `../work/plaza-check`, oppure nella directory indicata da `PLAZA_SCREENSHOT_DIR`.

Il test usa Microsoft Edge quando disponibile su Windows; altrove usa Chromium di Playwright. `BROWSER_EXECUTABLE` consente di scegliere il browser locale.
