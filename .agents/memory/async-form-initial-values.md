---
name: Form con valori iniziali asincroni
description: Evitare che un lookup asincrono dei valori iniziali sovrascriva i dati digitati nei form.
---

# Valori iniziali asincroni nei form

Quando un form dipende da un valore generato o verificato in modo asincrono, completare quel passaggio prima di mostrare il dialog. Gli aggiornamenti di stato che arrivano dopo un'attesa devono usare l'updater funzionale e preservare gli altri campi.

**Why:** il dialog di creazione campagna veniva aperto anche dal trigger Radix prima che terminasse la verifica di unicità del codice; il completamento asincrono poteva sostituire i valori che l'utente aveva già iniziato a inserire.

**How to apply:** per dialog con codice, slug o altro default verificato lato rete, controllare che un singolo evento non apra il dialog in anticipo e che gli updater asincroni modifichino solo il campo calcolato.
