---
name: Ripristino del mockup dopo il riavvio del renderer
description: Il marker che evita riapplicazioni dopo il salvataggio non deve sopravvivere al remount dell’iframe.
---

Quando il renderer 3D del mockup viene ricreato, cancellare il marker della revisione salvata saltata: il nuovo viewer deve ricevere di nuovo configurazione e opzione salvate.

**Why:** Il marker evita di sovrascrivere lo stato già presente nel viewer dopo un normale refetch di salvataggio, ma resta valido anche quando un errore temporaneo ricrea l’iframe; la nuova iframe altrimenti resta senza le scelte.

**How to apply:** Separare il refetch sulla stessa iframe dal segnale `ready` di una nuova generazione, resettando il marker prima del ripristino.
