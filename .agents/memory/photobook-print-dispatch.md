---
name: Fotolibri e invio stampa
description: Distinzione operativa tra blocco delle modifiche, preparazione file ed email al laboratorio.
---

Il blocco delle modifiche di un fotolibro non equivale all’invio al laboratorio. Anche i fotolibri autonomi devono restare ritrovabili nella coda stampa dopo navigazione e aggiornamento pagina.

**Why:** Lo studio ha percepito come scomparso un fotolibro spostato tra quelli bloccati; preparazione dei file ed email sono azioni distinte e non vanno presentate come un unico invio completato.

**How to apply:** Mantenere separati gli stati di blocco, trasferimento file ed email. Non richiedere associazioni fittizie a lavori o gallerie per completare il percorso autonomo.

La ricerca dei fotolibri deve includere anche la coda di stampa: quando una ricerca trova un album bloccato, rendere visibile la coda e filtrarla con gli stessi termini e stato.

**Why:** Una ricerca limitata agli album attivi fa sembrare scomparsi gli album bloccati anche se sono correttamente conservati in coda.

**How to apply:** Trattare album attivi e in coda come un unico insieme ricercabile, mantenendo visibile la distinzione tra le sezioni e consentendo di richiudere la coda.

Un errore dopo aver invocato il trasporto email può avere esito ambiguo: non ritentare automaticamente e non sbloccare silenziosamente l’invio. Lo studio deve verificarne l’esito prima di autorizzare un nuovo tentativo.

**Why:** L’errore potrebbe avvenire dopo la consegna effettiva; un retry automatico rischia un doppio ordine al laboratorio.

**How to apply:** Conservare il blocco preventivo nei casi ambigui e offrire una riconciliazione esplicita, distinta dalla semplice ripetizione della richiesta.

Anche un arresto prima che venga registrato l’errore può lasciare un’email dall’esito incerto. L’assenza del marker di errore non dimostra che l’email non sia partita; un heartbeat scaduto consente solo di proporre una verifica manuale, mai di ritentare l’invio.

**Why:** Un processo terminato bruscamente non esegue i blocchi di gestione errore e rilascio; recuperare automaticamente il claim potrebbe duplicare un ordine.

**How to apply:** Distinguere il recupero del trasferimento pagine dalla riconciliazione dell’email, ricontrollare l’abbandono in transazione e mantenere heartbeat anche durante una singola operazione esterna lenta.

La conferma del mockup deve portare nella spedizione anche il riepilogo, le foto usate e le grafiche d’incisione disponibili, senza richiedere allo studio di ricaricare gli stessi materiali.

**Why:** Lo studio si aspetta che il laboratorio riceva quanto concordato nel mockup; la sola anteprima non equivale alla consegna dei sorgenti necessari alla produzione.

**How to apply:** Distinguere chiaramente testi, grafiche e foto; segnalare le copie storiche ridotte quando l’originale non è disponibile. Non dichiarare un pacchetto completo se un materiale referenziato manca e non generare programmi macchina implicitamente.

Per preparare un mockup, caricare nel rendering solo anteprime compresse; i file originali ad alta risoluzione necessari alla produzione si allegano separatamente dopo la conferma, nella spedizione al laboratorio.

**Why:** I file sorgente pesanti rallentano l’editor e il cliente deve poter approvare il 3D prima che lo studio carichi i file destinati alla stampa. Un’anteprima del mockup non è un originale di produzione.

**How to apply:** Ridurre e comprimere la foto nel browser prima del caricamento, non conservare copie originali in questo passaggio; mostrare l’upload post-conferma nella sezione della spedizione e non indicare le anteprime come file stampa.

Gli originali delle pagine nella spedizione devono conservare la provenienza esatta del file Storage: nome, numero pagina e ID documento non provano che siano ancora i pixel correnti. Gli obsoleti vanno spostati fuori dalla cartella condivisa solo con conferma esplicita; mantenere pagine correnti e allegati, senza cancellare o inviare email.

**Why:** Ricaricare una pagina nella stessa versione può lasciare copie precedenti visibili al laboratorio, anche con numerazione ripetuta; dopo un invio, cambiare i file è un’azione amministrativa distinta e potenzialmente sensibile.

**How to apply:** Confrontare ogni originale con la pagina corrente tramite il percorso Storage registrato, bloccare l’invio ambiguo e aggiornare insieme Drive e metadati quando l’admin autorizza l’archiviazione.

Gli originali archiviati restano in una cartella Drive privata: gli admin li aprono o scaricano tramite il server, che verifica la cartella attesa e registra utente, file, azione e data. Non esporre link Drive diretti né aggiungere il laboratorio ai permessi dell’archivio.

**Why:** L’archivio contiene versioni superate e non deve diventare una seconda cartella di consegna; il recupero amministrativo deve restare controllato e verificabile.

**How to apply:** Qualsiasi nuova revisione o recupero degli originali deve passare da un endpoint admin-only, verificare che il file sia ancora nella cartella privata e lasciare una traccia di accesso.

For background-operation recovery tests, isolate the stale-claim condition from other fail-closed guards; when the route uses the same status for multiple guards, assert the error detail as well as the status code.

**Why:** A valid recovery fixture can be rejected earlier by a separate safety check, making a generic conflict response look like proof that the stale-claim guard worked.

**How to apply:** Model only the missing/incomplete work needed to trigger the recovery path, and assert both the recovery-specific rejection and the successful confirmed retry.
