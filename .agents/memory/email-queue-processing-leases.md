---
name: Email queue processing leases
description: Regola di recupero per email rimaste in processing dopo l'arresto di un worker.
---

Le email in `processing` devono avere una lease persistita più lunga del timeout massimo del worker. Il ciclo successivo può riportare in `pending` solo le lease scadute; una lease ancora valida va lasciata intatta perché il worker proprietario potrebbe stare ancora aspettando il provider email.

**Why:** senza una scadenza gli arresti lasciano elementi fuori dalla coda; con una scadenza troppo breve il recupero può sovrapporsi a un worker lento e causare un secondo invio.

**How to apply:** quando si prende un elemento, salvare in modo riconoscibile l'orario di inizio, la scadenza e l'identificativo del worker; pulire questi campi dopo successo o retry e mantenere un percorso esplicito per i documenti legacy con timestamp valido.