---
name: Shop product cost privacy
description: Regole per conservare costi unitari di vendita senza esporli ai clienti.
---

I costi unitari dei prodotti dello shop sono dati gestionali riservati: non devono essere salvati nei documenti prodotto leggibili pubblicamente, né copiati nel catalogo, checkout o DTO degli ordini cliente.

**Why:** I documenti prodotto sono leggibili anche dai flussi pubblici di prenotazione; nascondere il campo nell’interfaccia non impedisce che un client lo legga direttamente.

**How to apply:** Conservare costi e margini in un’area Firestore protetta da `isAdmin()` e testare separatamente le regole, i DTO pubblici e i dati d’ordine quando si aggiungono funzioni di marginalità.
