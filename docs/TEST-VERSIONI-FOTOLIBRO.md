# Versioni fotolibro e revisioni mockup — verifica del 9 settembre 2026

## Flusso

1. Nuova versione crea una bozza privata. La versione attuale e il token restano invariati.
2. Caricare le pagine anche in più gruppi. Nessuna email parte dagli upload.
3. Controllare e premere **Pubblica versione e avvisa cliente**. La pubblicazione richiede conteggio coerente e pagine numerate da 1 senza salti/duplicati.
4. Il link già distribuito apre la versione pubblicata. Il cliente ha guida, messaggio di versione attuale e consultazione delle precedenti.
5. Il mockup e la proposta precedenti sono copiati nella nuova versione. Gli asset ricevono nuovi metadati ID/versione e riusano i file privati esistenti: nessuna ricompressione né cancellazione. La precedente conferma resta nella versione precedente; la copia riparte da revisione 1, bozza, e richiede nuova conferma.
6. Il cliente può salvare nuove revisioni anche dopo invio/conferma del mockup e approvazione delle pagine. La stampa blocca la modifica a cliente e studio; allegato e verifica report già confermato rimangono operazioni amministrative disponibili.

## Compatibilità e sicurezza

- `versions[].status`: `draft` o `published`; assente nei documenti legacy equivale a pubblicato. Nessuna migrazione dei dati reali.
- La prima versione creata col fotolibro conserva il flusso legacy: primo link inviato manualmente. Il nuovo ciclo di bozza/pubblicazione riguarda le versioni successive.
- `/publish-version` è amministrativo; il token non legge bozze, neppure richiedendone il numero.
- Pubblicazione transazionale: ricontrolla lock, versione corrente attesa, pagine e asset mockup. Le pagine delle nuove versioni pubblicate non sono modificabili: creare una nuova bozza.
- Notifica dopo commit, non nella transazione. In caso di email assente la pubblicazione rimane valida. In caso di esito incerto dell’invio, nessun retry automatico: verificare posta inviata e avvisare manualmente. Marker pendente conservato anche dopo crash, per evitare duplicati.
- La chiusura della finestra del browser o una caduta del processo fra commit pubblicazione e notifica può richiedere **Avvisa cliente / verifica invio**. Non è stata introdotta una coda email persistente.
- Nessuna modifica a regole Firebase, credenziali, deployment o dati clienti.

## Test automatici

Verifica locale: **134 test superati in 7 suite**, incluse 49 prove della nuova suite versioni e una matrice di 32 combinazioni dei permessi mockup. Superate anche le due suite browser indicate sotto e la build client/server.

`server/photobook-version-workflow.test.ts`: transazioni serializzate/atomiche simulate e router Express reale con Firebase/Gmail sostituiti. Copre creazione concorrente; lock; limiti; numeri invalidi; conteggi errati; pagine mancanti/duplicate/estranee; sessione obsoleta; pubblicazione ripetuta; copia fronte/retro/incisione; asset mancanti/estranei; divieto sovrascrittura mockup; link e storico; bozze nascoste; accesso non admin; mancata email; errore email e blocco retry; invii concorrenti; risoluzione email dal lavoro; primo invio legacy; blocco PATCH/DELETE sulle nuove versioni pubblicate.

`server/photobook-mockup-routes.test.ts`: configurazioni e asset validati, revisioni obsolete, nuova revisione cliente dopo conferma, storico immutabile, lock ricontrollato durante scrittura, protezione token e operazioni riservate allo studio.

Regressioni: associazione lavoro/galleria, spedizione laboratorio, allegati Drive, cancellazione esplicita fotolibro e tipi condivisi.

```sh
npx vitest run server/photobook-version-workflow.test.ts server/photobook-mockup-routes.test.ts server/photobook-association.test.ts server/photobook-lab-shipment.test.ts server/photobook-mockup-delete.test.ts server/photobook-mockup-delivery.test.ts shared/photobook-job-gallery.test.ts
node e2e/photobook-versions.browser.mjs
node e2e/photobook-mockup.browser.mjs
npm run build
```

Browser reale con API isolate: guida telefono verticale, versioni precedenti, ritorno alla corrente, creazione di una richiesta disegnando sul canvas e conferma/annullamento del cambio versione con bozza, pubblicazione admin esplicita, riapertura dello stesso link. Suite mockup: finestre mobile/desktop, chiusura con bozze, riapertura, renderer, salvataggio, invio, conferma e report.

## Limiti della verifica

Nessuna email reale inviata; nessuna prova su Replit o su iPhone/Safari fisico. I test di concorrenza simulano transazioni e non sostituiscono una prova con emulatori Firestore/Storage. Nessuna garanzia di copertura di ogni combinazione teorica o guasto di rete. Restano i tre errori TypeScript preesistenti in `server/follow-up-routes.ts`, da verificare separatamente dal flusso fotolibri.
