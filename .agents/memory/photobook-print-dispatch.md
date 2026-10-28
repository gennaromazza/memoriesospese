---
name: Fotolibri e invio stampa
description: Distinzione operativa tra blocco delle modifiche, preparazione file ed email al laboratorio.
---

Il blocco delle modifiche di un fotolibro non equivale all’invio al laboratorio. Anche i fotolibri autonomi devono restare ritrovabili nella coda stampa dopo navigazione e aggiornamento pagina.

**Why:** Lo studio ha percepito come scomparso un fotolibro spostato tra quelli bloccati; preparazione dei file ed email sono azioni distinte e non vanno presentate come un unico invio completato.

**How to apply:** Mantenere separati gli stati di blocco, trasferimento file ed email. Non richiedere associazioni fittizie a lavori o gallerie per completare il percorso autonomo.

Un errore dopo aver invocato il trasporto email può avere esito ambiguo: non ritentare automaticamente e non sbloccare silenziosamente l’invio. Lo studio deve verificarne l’esito prima di autorizzare un nuovo tentativo.

**Why:** L’errore potrebbe avvenire dopo la consegna effettiva; un retry automatico rischia un doppio ordine al laboratorio.

**How to apply:** Conservare il blocco preventivo nei casi ambigui e offrire una riconciliazione esplicita, distinta dalla semplice ripetizione della richiesta.

Anche un arresto prima che venga registrato l’errore può lasciare un’email dall’esito incerto. L’assenza del marker di errore non dimostra che l’email non sia partita; un heartbeat scaduto consente solo di proporre una verifica manuale, mai di ritentare l’invio.

**Why:** Un processo terminato bruscamente non esegue i blocchi di gestione errore e rilascio; recuperare automaticamente il claim potrebbe duplicare un ordine.

**How to apply:** Distinguere il recupero del trasferimento pagine dalla riconciliazione dell’email, ricontrollare l’abbandono in transazione e mantenere heartbeat anche durante una singola operazione esterna lenta.
