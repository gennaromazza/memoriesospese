# Regole operative del progetto

## Hosting e fonte di verità

- La piattaforma è ospitata e pubblicata tramite Replit.
- Per verificare lo stato effettivo della piattaforma, considera sia il repository remoto sia l'applicazione pubblicata su Replit.
- Non considerare conclusa una modifica finché non è coerente con l'ambiente Replit e con le configurazioni di build, avvio e deployment del progetto.

## Modifiche al codice

- Prima di modificare il codice, analizza l'implementazione esistente e le dipendenze coinvolte.
- Dopo ogni modifica locale, esegui verifiche proporzionate al cambiamento: controlli strutturali, test, type-check, build e/o avvio dell'applicazione quando disponibili.
- La verifica deve coprire non solo la correttezza strutturale del codice, ma anche la logica di business e il comportamento funzionale nella piattaforma.
- Non limitarti a verificare che il codice compili: controlla che l'esperienza e i flussi interessati funzionino come previsto.
- Mantieni le funzionalità esistenti, salvo quando la richiesta richiede espressamente di modificarle o rimuoverle.

## Versionamento e pubblicazione

- Ogni modifica locale completata deve essere inclusa in un commit Git descrittivo.
- Dopo le verifiche riuscite, esegui sempre il push del commit sul repository remoto, così Replit può ricevere la versione aggiornata.
- Prima del push, verifica che la branch remota sia aggiornata e che non vengano inclusi file estranei alla modifica.
- Dopo il push, verifica quando possibile che la versione pubblicata su Replit rifletta il comportamento atteso.
