---
name: Recupero trasferimenti stampe interrotti
description: Precauzioni per riprendere una consegna Drive dopo un riavvio del processo API.
---

I trasferimenti avviati nel processo API possono interrompersi durante una pubblicazione: lo stato “running” persistito non dimostra che il worker sia ancora vivo. Prima del recupero confrontare i file registrati con quelli realmente presenti su Drive.

**Why:** Un trasferimento reale si è fermato a 66 foto durante un cambio di versione del server; la schermata continuava correttamente a leggere uno stato non più aggiornato. Un upload può anche essere completato su Drive prima che il relativo ID venga registrato nel database.

**How to apply:** Conservare la cartella e i file esistenti; riprendere solo dopo scadenza della proprietà del worker e riconciliazione delle identità remote. Non ripetere l’email al laboratorio come effetto collaterale del recupero. Non dichiarare risolto il rischio di interruzione ai deploy finché il lavoro resta legato al processo HTTP anziché a un esecutore durevole.
