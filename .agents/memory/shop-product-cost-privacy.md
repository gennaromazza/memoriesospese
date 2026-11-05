---
name: Shop product cost privacy
description: Regole per conservare costi unitari di vendita senza esporli ai clienti.
---

I costi unitari dei prodotti dello shop sono dati gestionali riservati: non devono essere salvati nei documenti prodotto leggibili pubblicamente, né copiati nel catalogo, checkout o DTO degli ordini cliente.

**Why:** I documenti prodotto sono leggibili anche dai flussi pubblici di prenotazione; nascondere il campo nell’interfaccia non impedisce che un client lo legga direttamente.

**How to apply:** Conservare costi e margini in un’area Firestore protetta da `isAdmin()` e testare separatamente le regole, i DTO pubblici e i dati d’ordine quando si aggiungono funzioni di marginalità.

Il salvataggio amministrativo del prodotto e del costo deve passare da un'operazione server autenticata e atomica, conservando il vincolo passkey.

**Why:** Un batch diretto dal browser fallisce interamente se una delle raccolte ha regole distribuite non allineate. Un generico `permission-denied` non prova che sia scaduta la passkey e non va trattato come tale senza una verifica.

**How to apply:** Validare i campi sul server, mantenere il costo fuori dal documento pubblico e distinguere il rifiuto esplicito della passkey dagli altri errori di autorizzazione. Non disattivare la MFA per risolvere un errore di salvataggio.
