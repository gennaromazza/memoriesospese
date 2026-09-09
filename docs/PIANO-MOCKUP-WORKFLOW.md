# Piano mockup album e gestione operativa

## Decisioni concordate

- Catalogo nell'anagrafica dei laboratori esistenti, non nuovi account fornitori.
- Nomi dei modelli modificabili dallo studio; Custodia mantiene il nome attuale.
- Ogni lavoro/fotolibro ha la propria proposta: lo studio seleziona laboratori e singoli modelli (anche tutti).
- Tessuti e colori sono gestiti nel catalogo del laboratorio, con compatibilità per modello; nessun filtro aggiuntivo per lavoro.
- Il cliente sceglie fra le opzioni assegnate e personalizza foto (upload o galleria), ritaglio e scritte.
- Salvataggio e download non equivalgono a conferma. Il cliente invia allo studio per verifica.
- Lo studio può intervenire sul mockup, richiedere modifiche e confermare. Numero cliente e WhatsApp sono a portata di mano.
- Conferme e allegati conservano una revisione precisa; una modifica successiva non sovrascrive il materiale confermato/inviato.
- L'allegato Drive è un'azione esplicita sulla spedizione fotolibro esistente, non un secondo sistema di spedizione e non un invio email automatico.

## Ordine di implementazione

1. Catalogo laboratorio: schede modello con nome, codice fornitore, asset 3D registrato e campionario compatibile. Nessun URL/modello eseguibile arbitrario. Sono integrati Custodia e Album girevole; altre schede rimangono non proponibili finché non viene integrato un asset reale. Le revisioni del girevole sono descritte in `MOCKUP-ALBUM.md`.
2. Proposta: selezione esplicita laboratorio/modello per fotolibro collegato al lavoro; copia del catalogo al momento della pubblicazione per evitare cambi retroattivi. Aggiornamenti della proposta richiedono un nuovo controllo dello studio.
3. Editor: scelta fra opzioni autorizzate, salvataggi con controllo revisione, invio per verifica, restituzione al cliente, modifiche admin, conferma specifica del mockup separata dall'approvazione pagine.
4. Operativo: fotolibri del lavoro, stato mockup, contatti dei clienti associati, editor e comandi di revisione. Nessun invio WhatsApp automatico.
5. Conferma e Drive: scheda HTML statica con viste 3D e riepilogo validato; copia privata immutabile della conferma; allegato alla cartella esistente solo se lavoro, fotolibro e laboratorio coincidono e la spedizione è ancora da inviare. Nessuna sostituzione silenziosa di allegati precedenti.
6. Test di autorizzazione, revisioni concorrenti, isolamento token/foto, scelte escluse, transizioni, allegato/idempotenza; browser e build. Nessun dato di produzione usato nei test.

## Assunzioni di questa prima implementazione

- Una proposta corrente per fotolibro; più fotolibri nello stesso lavoro mantengono proposte distinte. Le revisioni non sono alternative parallele.
- Si riutilizza il link cliente del fotolibro e la galleria associata. L'invio autonomo prima della creazione del fotolibro/galleria non è parte di questa implementazione.
- Nessun prezzo, supplemento, checkout o vendita B2B: decisioni non ancora definite.
- Il materiale generato è un riferimento visivo, non un originale di stampa né una certificazione del colore.
- Nessuna associazione automatica fra l'ID locale del prototipo Peppe Lab e un laboratorio reale: lo studio sceglie l'anagrafica corretta.

## Integrità e compatibilità

API protette lato server; token limitati al fotolibro, catalogo pubblico limitato alla proposta. Snapshot e cronologia separati dai documenti legacy. Le modifiche del mockup non riaprono il lock dell'impaginato. Le versioni storiche del fotolibro restano consultabili; l'admin può lavorare sul mockup della versione corrente anche dopo approvazione pagine, creando una nuova revisione. Il cliente non può modificare una proposta in verifica o confermata senza restituzione dello studio. Nessuna modifica alle Security Rules, ai dati di produzione, alla configurazione di hosting o alle dipendenze.

## Stato dell'implementazione locale

I punti 1–5 sono implementati nel codice locale. Il punto 6 comprende test di API, autorizzazioni, snapshot, errori post-commit, idempotenza e riconciliazione Drive; il browser di prova copre catalogo, scelta cliente, intervento studio, conferma con otto viste, comando allegato e WhatsApp operativo, oltre a foto e layout mobile. API esterne simulate: nessun cliente reale coinvolto.

Prima di pubblicare:

1. Associare Custodia al laboratorio reale e verificare codici/tessuti del fornitore: nessuna associazione è stata inventata o scritta in produzione.
2. Provare il percorso con un fotolibro di test e controllare Storage, token, campionario e cartella Drive nell'ambiente di prova.
3. Verificare regole Firebase effettivamente distribuite, connettore Drive e stato DPA del laboratorio.
4. Validare l'esperienza con lo studio prima di aggiungere altri asset 3D/campionari.

La base locale è stata allineata al commit Replit `bce512fd`, che include `89437690f1f08f8aa0a3f0c8d5be373296f01453`. Dopo l'allineamento il typecheck generale segnala tre errori in `server/follow-up-routes.ts`, già presenti nel codice remoto e non introdotti dai mockup. Commit e push non equivalgono alla verifica del deploy o dei dati di produzione. In caso di upload/invio dall'esito ambiguo il sistema conserva il blocco; il recupero automatico dell'allegato avviene solo quando trova su Drive la stessa copia. Se non la trova, o l'email ha esito incerto, serve controllo operativo prima di un nuovo tentativo.
