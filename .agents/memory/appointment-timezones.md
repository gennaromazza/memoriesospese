---
name: Appuntamenti e ore legali
description: Compatibilità delle consulenze legacy e scelta dell'istante durante l'ora autunnale ripetuta.
---

Le consulenze legacy possono avere `dataConsulenza` a mezzanotte anziché all'ora scelta. Non usare quel timestamp da solo per decidere quando inviare il promemoria: ricostruire l'appuntamento dal giorno italiano e dagli orari salvati. Non migrare o riscrivere in massa i documenti per correggere la visualizzazione.

**Why:** il vecchio salvataggio accettava una data senza combinarla con l'orario; un promemoria calcolato dal timestamp poteva partire molte ore prima dell'appuntamento effettivo. Serve compatibilità in lettura, senza alterare dati reali durante le verifiche.

**How to apply:** verificare sia documenti legacy con data a mezzanotte sia nuovi documenti con istante completo quando si interviene su conferme, disponibilità o promemoria.

Quando un input contiene un istante esplicito per l'ora autunnale ripetuta, preservare quell'occorrenza. Per un giorno e orario senza offset, scegliere deterministicamente la prima occorrenza; non dipendere dall'offset del momento in cui gira il server. L'ora primaverile inesistente deve dare un errore, non essere spostata automaticamente.

**Why:** entrambe le 02:30 autunnali sono valide ma distano un'ora; un formato senza offset perde l'identità dello slot. Inoltre uno slot di 30 minuti può apparire come 02:45–02:15: gli orari stampati non indicano da soli la durata.

**How to apply:** testare entrambe le occorrenze e gli slot che attraversano il cambio dell'ora; conservare l'offset nei payload Google e usare durata effettiva/istante scelto per risolvere la fine.
