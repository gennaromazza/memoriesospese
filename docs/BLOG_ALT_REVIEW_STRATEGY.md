# Strategia di completamento degli alt text Blog

## Stato misurato

Al 4 settembre 2026 risultano 68 articoli pubblicati, 243 immagini nel corpo e 180 attributi `alt` mancanti o vuoti. Quattro articoli conservano il corpo HTML in Storage tramite `contentUrl`; la revisione deve quindi coprire sia HTML inline sia HTML legacy.

## Regola editoriale

L'alt text deve descrivere ciò che è visibile nella fotografia, con una frase breve e naturale. Il titolo dell'articolo può fornire contesto, ma non deve essere copiato automaticamente come alt e non si devono aggiungere località o keyword non riconoscibili nell'immagine.

Sono valide anche:

- una didascalia già presente nella figura;
- una descrizione dell'azione o del soggetto verificata dall'editor;
- `alt=""` solo per immagini realmente decorative.

## Flusso di revisione

1. L'Admin individua gli articoli con immagini senza alt.
2. Per ogni immagine prepara una proposta assistita usando didascalia, contesto del paragrafo e contenuto visivo.
3. L'editor corregge o conferma la proposta nel campo **Modifica alt immagine selezionata**.
4. Il salvataggio deve aggiornare la sorgente corretta: il campo `content` per gli articoli inline oppure il file HTML re-hostato per i quattro articoli legacy.
5. Un nuovo audit deve verificare che gli alt vuoti rimasti siano intenzionalmente decorativi e documentati.

Non viene eseguito un backfill automatico basato soltanto su titolo o nome file: trasformerebbe 180 descrizioni diverse in testo generico e potrebbe introdurre informazioni visive false.

## Criterio di completamento

Il lavoro è concluso quando ogni immagine non decorativa ha un alt verificato, i quattro corpi legacy sono stati migrati o aggiornati senza rompere i riferimenti Storage e l'audit mostra zero alt mancanti non giustificati.