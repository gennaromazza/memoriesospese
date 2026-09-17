---
name: Mockup iframe restore lifecycle
description: Dipendenze e accodamento necessari per ripristinare configurazioni quando dati e renderer arrivano in tempi diversi.
---
Gli effect che applicano una configurazione al renderer devono dipendere sia da `ready` sia dalla revisione dei dati caricati; se cambia il renderer, l’applicazione va accodata fino al nuovo evento `ready`.

**Why:** query e iframe sono asincroni indipendenti: un effect eseguito una sola volta può uscire prima che una delle due risorse sia pronta, mentre un postMessage inviato prima del remount viene perso.

**How to apply:** usa una ref pendente per preview storiche/cambi renderer, invalida la ref su chiusura o nuova scelta, e non sovrascrivere la selezione storica durante il restore.